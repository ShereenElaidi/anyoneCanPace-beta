/**
 * The one data-access module (design/backend-v1-spec.md §9): every SQL statement
 * lives here, always as a prepared statement with bound values. Route handlers
 * never write SQL. Anything about one person's data takes that person's ID.
 */
import type { D1Database } from './types.ts';
import { USERNAME_HOLD_MS } from '../src/account/rules.ts';

export type Role = 'runner' | 'pacer';

export interface UserRow {
  id: string;
  auth0_id: string;
  username: string;
  display_name: string;
  role: Role;
  recovery_hash: string | null;
  recovery_created_at: number | null;
  disabled_at: number | null;
  created_at: number;
}

export interface SessionRow {
  id: string;
  token_hash: string;
  auth0_id: string;
  user_id: string | null;
  device_label: string;
  created_at: number;
  last_used_at: number;
  expires_at: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function accountsDb(db: D1Database) {
  return {
    // ---------- users ----------
    userById: (id: string) => db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>(),
    userByAuth0: (auth0Id: string) => db.prepare('SELECT * FROM users WHERE auth0_id = ?').bind(auth0Id).first<UserRow>(),
    userByUsername: (username: string) => db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<UserRow>(),

    /** Taken by someone else, or given up by someone else less than 30 days ago. */
    async usernameTaken(username: string, forUserId: string | null, now: number): Promise<boolean> {
      const user = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first<{ id: string }>();
      if (user) return user.id !== forUserId;
      const held = await db
        .prepare('SELECT released_by FROM released_usernames WHERE username = ? AND released_at > ?')
        .bind(username, now - USERNAME_HOLD_MS)
        .first<{ released_by: string }>();
      return !!held && held.released_by !== forUserId;
    },

    /** Creates the user and attaches the onboarding sessions of that Auth0 account to it. */
    async createUser(u: { id: string; auth0Id: string; username: string; displayName: string; recoveryHash: string; now: number }) {
      await db.batch([
        db.prepare('DELETE FROM released_usernames WHERE username = ?').bind(u.username),
        db
          .prepare(
            'INSERT INTO users (id, auth0_id, username, display_name, recovery_hash, recovery_created_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .bind(u.id, u.auth0Id, u.username, u.displayName, u.recoveryHash, u.now, u.now),
        db.prepare('UPDATE sessions SET user_id = ? WHERE auth0_id = ? AND user_id IS NULL').bind(u.id, u.auth0Id),
      ]);
    },

    setDisplayName: (userId: string, name: string) =>
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').bind(name, userId).run(),

    /** Changes the username; the old one is held for this person for 30 days. */
    changeUsername: (userId: string, oldName: string, newName: string, now: number) =>
      db.batch([
        db.prepare('DELETE FROM released_usernames WHERE username = ?').bind(newName),
        db.prepare('UPDATE users SET username = ? WHERE id = ?').bind(newName, userId),
        db
          .prepare('INSERT OR REPLACE INTO released_usernames (username, released_by, released_at) VALUES (?, ?, ?)')
          .bind(oldName, userId, now),
      ]),

    setRecoveryHash: (userId: string, hash: string | null, now: number) =>
      db.prepare('UPDATE users SET recovery_hash = ?, recovery_created_at = ? WHERE id = ?').bind(hash, hash ? now : null, userId).run(),

    /** Deletes the account's rows (sessions and personal routes too) and holds its username for 30 days. */
    deleteUser: (user: UserRow, now: number) =>
      db.batch([
        db.prepare('DELETE FROM sessions WHERE auth0_id = ?').bind(user.auth0_id),
        // Also removed by ON DELETE CASCADE; explicit so it doesn't depend on foreign keys being on.
        db.prepare('DELETE FROM personal_routes WHERE owner_id = ?').bind(user.id),
        db.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
        db
          .prepare('INSERT OR REPLACE INTO released_usernames (username, released_by, released_at) VALUES (?, ?, ?)')
          .bind(user.username, user.id, now),
      ]),

    // ---------- sessions ----------
    createSession: (s: Omit<SessionRow, 'user_id'> & { user_id: string | null }) =>
      db
        .prepare(
          'INSERT INTO sessions (id, token_hash, auth0_id, user_id, device_label, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(s.id, s.token_hash, s.auth0_id, s.user_id, s.device_label, s.created_at, s.last_used_at, s.expires_at)
        .run(),

    sessionByTokenHash: (tokenHash: string, now: number) =>
      db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?').bind(tokenHash, now).first<SessionRow>(),

    touchSession: (id: string, now: number, expiresAt: number) =>
      db.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE id = ?').bind(now, expiresAt, id).run(),

    deleteSession: (id: string) => db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run(),

    /** A person's own signed-in devices. */
    sessionsOfUser: (userId: string, now: number) =>
      db
        .prepare('SELECT * FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_used_at DESC')
        .bind(userId, now)
        .all<SessionRow>()
        .then((r) => r.results),

    /** Signs one of a person's own devices out. Another person's session counts as not found. */
    deleteSessionOfUser: (userId: string, sessionId: string) =>
      db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').bind(sessionId, userId).run(),

    deleteSessionsOfAuth0: (auth0Id: string) => db.prepare('DELETE FROM sessions WHERE auth0_id = ?').bind(auth0Id).run(),

    deleteExpiredSessions: (now: number) => db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run(),

    // ---------- personal routes (only ever by owner) ----------
    countPersonalRoutes: (ownerId: string) =>
      db
        .prepare('SELECT COUNT(*) AS n FROM personal_routes WHERE owner_id = ?')
        .bind(ownerId)
        .first<{ n: number }>()
        .then((r) => r?.n ?? 0),

    listPersonalRoutes: (ownerId: string) =>
      db
        .prepare('SELECT id, summary, updated_at FROM personal_routes WHERE owner_id = ? ORDER BY updated_at DESC')
        .bind(ownerId)
        .all<{ id: string; summary: string; updated_at: number }>()
        .then((r) => r.results),

    personalRoute: (ownerId: string, id: string) =>
      db
        .prepare('SELECT id, summary, data, track, updated_at FROM personal_routes WHERE id = ? AND owner_id = ?')
        .bind(id, ownerId)
        .first<{ id: string; summary: string; data: string; track: string; updated_at: number }>(),

    createPersonalRoute: (r: { id: string; ownerId: string; summary: string; data: string; track: string; gpx: string; now: number }) =>
      db
        .prepare(
          'INSERT INTO personal_routes (id, owner_id, summary, data, track, gpx, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(r.id, r.ownerId, r.summary, r.data, r.track, r.gpx, r.now, r.now)
        .run(),

    updatePersonalRoute: (ownerId: string, id: string, summary: string, data: string, now: number) =>
      db
        .prepare('UPDATE personal_routes SET summary = ?, data = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
        .bind(summary, data, now, id, ownerId)
        .run(),

    deletePersonalRoute: (ownerId: string, id: string) =>
      db.prepare('DELETE FROM personal_routes WHERE id = ? AND owner_id = ?').bind(id, ownerId).run(),

    // ---------- rate limits ----------
    async countAttempts(kind: string, key: string, now: number): Promise<number> {
      await db.prepare('DELETE FROM attempts WHERE at <= ?').bind(now - DAY_MS).run();
      const row = await db
        .prepare('SELECT COUNT(*) AS n FROM attempts WHERE kind = ? AND key = ? AND at > ?')
        .bind(kind, key, now - DAY_MS)
        .first<{ n: number }>();
      return row?.n ?? 0;
    },

    addAttempt: (kind: string, key: string, now: number) =>
      db.prepare('INSERT INTO attempts (kind, key, at) VALUES (?, ?, ?)').bind(kind, key, now).run(),

    // ---------- cache ----------
    async cached(key: string, now: number): Promise<string | null> {
      const row = await db.prepare('SELECT value FROM kv WHERE key = ? AND expires_at > ?').bind(key, now).first<{ value: string }>();
      return row?.value ?? null;
    },

    cache: (key: string, value: string, expiresAt: number) =>
      db.prepare('INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES (?, ?, ?)').bind(key, value, expiresAt).run(),
  };
}

export type AccountsDb = ReturnType<typeof accountsDb>;
