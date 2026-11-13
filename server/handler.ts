/**
 * The accounts API (design/backend-v1-spec.md §5, §8, step 1 of §12).
 * One entry point, `handle(request, env)`, used by the Pages Function
 * (functions/api/[[path]].ts), the local dev API and the tests.
 */
import {
  Auth0Error,
  authorizeUrl,
  decodeTransaction,
  deleteAuth0User,
  encodeTransaction,
  exchangeCode,
  logoutUrl,
  newTransaction,
  passwordResetLink,
} from './auth0.ts';
import { hmac, newRecoveryCode, normalizeRecoveryCode, randomToken, sameString, sha256 } from './crypto.ts';
import { accountsDb, type AccountsDb, type SessionRow, type UserRow } from './db.ts';
import type { Env } from './types.ts';
import {
  cleanDisplayName,
  displayNameProblem,
  normalizeUsername,
  usernameProblem,
} from '../src/account/rules.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_DAYS = 60;
/** Recovery-code tries per username per day (spec §5), and per network address. */
export const RECOVERY_TRIES_PER_DAY = 3;
export const RECOVERY_TRIES_PER_ADDRESS = 10;
const SESSION_COOKIE = 'acp_session';
const TX_COOKIE = 'acp_signin';

// ---------- small HTTP helpers ----------

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

const problem = (status: number, error: string, message: string, extra: Record<string, unknown> = {}) =>
  json({ error, message, ...extra }, status);

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

function readCookies(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** `Secure` everywhere except plain-http localhost (local development). */
function cookie(request: Request, name: string, value: string, opts: { path: string; maxAgeS: number }): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=${opts.path}; Max-Age=${opts.maxAgeS}${secure}`;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function appBase(env: Env): string {
  const base = env.APP_BASE ?? '/';
  return base.startsWith('/') && base.endsWith('/') ? base : '/';
}

/** "iPhone · Safari": enough to recognise a device in the list; the full browser string isn't kept. */
export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent ?? '';
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Macintosh/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\/|FxiOS/.test(ua)
      ? 'Firefox'
      : /Chrome\/|CriOS/.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'browser';
  return `${device} · ${browser}`;
}

// ---------- sessions ----------

interface Current {
  session: SessionRow;
  user: UserRow | null;
}

async function currentSession(request: Request, db: AccountsDb, now: number): Promise<Current | null> {
  const token = readCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const session = await db.sessionByTokenHash(await sha256(token), now);
  if (!session) return null;
  // Sliding expiry: renewed when used, at most once an hour.
  if (now - session.last_used_at > 60 * 60 * 1000) await db.touchSession(session.id, now, now + SESSION_DAYS * DAY_MS);
  const user = session.user_id ? await db.userById(session.user_id) : null;
  return { session, user };
}

const clearSessionCookie = (request: Request) => cookie(request, SESSION_COOKIE, '', { path: '/', maxAgeS: 0 });

function publicUser(user: UserRow, env: Env) {
  return {
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    isAdmin: !!env.ADMIN_AUTH0_ID && user.auth0_id === env.ADMIN_AUTH0_ID,
  };
}

// ---------- the API ----------

export async function handle(request: Request, env: Env, now = Date.now()): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;
  if (!env.DB || !env.AUTH0_DOMAIN || !env.RECOVERY_PEPPER) {
    // A deployment without accounts set up (e.g. the live site before launch).
    return problem(503, 'not-configured', 'Accounts aren’t available here yet.');
  }
  const db = accountsDb(env.DB);

  // Writes only from the app's own pages (on top of SameSite=Lax).
  if (method !== 'GET' && method !== 'HEAD') {
    const origin = request.headers.get('origin');
    if (origin !== url.origin) return problem(403, 'bad-origin', 'This request has to come from the app itself.');
  }

  try {
    // ----- sign-in and sign-out -----
    if (path === '/api/auth/login' && method === 'GET') {
      const tx = newTransaction();
      const target = await authorizeUrl(env, url.origin, tx, url.searchParams.get('signup') === '1');
      return redirect(target, [cookie(request, TX_COOKIE, encodeTransaction(tx), { path: '/api/auth', maxAgeS: 600 })]);
    }

    if (path === '/api/auth/callback' && method === 'GET') {
      const back = `${appBase(env)}?account`;
      const clearTx = cookie(request, TX_COOKIE, '', { path: '/api/auth', maxAgeS: 0 });
      const tx = decodeTransaction(readCookies(request)[TX_COOKIE]);
      const code = url.searchParams.get('code');
      if (url.searchParams.get('error') || !tx || !code || url.searchParams.get('state') !== tx.state) {
        return redirect(`${back}=signin-failed`, [clearTx]);
      }
      const auth0Id = await exchangeCode(env, url.origin, code, tx, now);
      const user = await db.userByAuth0(auth0Id);
      if (user?.disabled_at) return redirect(`${back}=disabled`, [clearTx]);
      const token = randomToken();
      await db.createSession({
        id: randomToken(12),
        token_hash: await sha256(token),
        auth0_id: auth0Id,
        user_id: user?.id ?? null,
        device_label: deviceLabel(request.headers.get('user-agent')),
        created_at: now,
        last_used_at: now,
        expires_at: now + SESSION_DAYS * DAY_MS,
      });
      return redirect(back, [clearTx, cookie(request, SESSION_COOKIE, token, { path: '/', maxAgeS: SESSION_DAYS * 24 * 60 * 60 })]);
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      const current = await currentSession(request, db, now);
      if (current) await db.deleteSession(current.session.id);
      return json({ logoutUrl: logoutUrl(env, url.origin, appBase(env)) }, 200, { 'set-cookie': clearSessionCookie(request) });
    }

    // ----- recovery code (signed out) -----
    if (path === '/api/auth/recover' && method === 'POST') {
      const body = await readJson(request);
      const username = normalizeUsername(str(body.username));
      const code = normalizeRecoveryCode(str(body.code));
      const userKey = await hmac(env.RECOVERY_PEPPER, `user:${username}`);
      const addressKey = await hmac(env.RECOVERY_PEPPER, `ip:${request.headers.get('cf-connecting-ip') ?? 'local'}`);
      const usedByUser = await db.countAttempts('recover-user', userKey, now);
      const usedByAddress = await db.countAttempts('recover-ip', addressKey, now);
      if (usedByUser >= RECOVERY_TRIES_PER_DAY || usedByAddress >= RECOVERY_TRIES_PER_ADDRESS) {
        return problem(429, 'too-many-tries', 'No tries left today. Try again tomorrow.', { triesLeft: 0 });
      }
      await db.addAttempt('recover-user', userKey, now);
      await db.addAttempt('recover-ip', addressKey, now);
      const user = username ? await db.userByUsername(username) : null;
      const expected = user?.recovery_hash ?? '';
      const given = await hmac(env.RECOVERY_PEPPER, `code:${code}`);
      // The same answer whether the username exists or not.
      if (!user || !expected || user.disabled_at || !sameString(expected, given)) {
        return problem(400, 'wrong-code', 'That username and recovery code don’t match.', {
          triesLeft: RECOVERY_TRIES_PER_DAY - usedByUser - 1,
        });
      }
      const ticketUrl = await passwordResetLink(env, db, now, user.auth0_id, `${url.origin}${appBase(env)}?account=password-set`);
      // The code is used up (a new one is shown at the next sign-in) and every device is signed out.
      await db.setRecoveryHash(user.id, null, now);
      await db.deleteSessionsOfAuth0(user.auth0_id);
      return json({ ticketUrl });
    }

    // ----- username availability (for the sign-up form) -----
    const nameMatch = /^\/api\/usernames\/([^/]+)$/.exec(path);
    if (nameMatch && method === 'GET') {
      const name = normalizeUsername(decodeURIComponent(nameMatch[1]));
      const current = await currentSession(request, db, now);
      const reason = usernameProblem(name);
      if (reason) return json({ available: false, reason });
      const taken = await db.usernameTaken(name, current?.user?.id ?? null, now);
      return json({ available: !taken, reason: taken ? 'That username is taken.' : null });
    }

    // ----- everything below needs a session -----
    if (!path.startsWith('/api/me')) return problem(404, 'not-found', 'Not found.');
    const current = await currentSession(request, db, now);

    if (path === '/api/me' && method === 'GET') {
      if (!current) return json({ state: 'signed-out' });
      if (!current.user) return json({ state: 'onboarding' });
      if (current.user.disabled_at) return json({ state: 'disabled' });
      return json({
        state: 'ready',
        user: publicUser(current.user, env),
        needsRecoveryCode: !current.user.recovery_hash,
      });
    }

    if (!current) return problem(401, 'signed-out', 'Sign in first.');

    if (path === '/api/me/onboarding' && method === 'POST') {
      if (current.user) return problem(409, 'already-done', 'This account is already set up.');
      const body = await readJson(request);
      if (body.age14 !== true) return problem(400, 'age', 'Accounts are for people 14 and older.');
      const username = normalizeUsername(str(body.username));
      const displayName = cleanDisplayName(str(body.displayName));
      const nameIssue = usernameProblem(username) ?? displayNameProblem(displayName);
      if (nameIssue) return problem(400, 'invalid', nameIssue);
      if (await db.usernameTaken(username, null, now)) return problem(409, 'taken', 'That username is taken.');
      const recoveryCode = newRecoveryCode();
      const id = randomToken(12);
      await db.createUser({
        id,
        auth0Id: current.session.auth0_id,
        username,
        displayName,
        recoveryHash: await hmac(env.RECOVERY_PEPPER, `code:${normalizeRecoveryCode(recoveryCode)}`),
        now,
      });
      const user = await db.userById(id);
      return json({ user: user && publicUser(user, env), recoveryCode });
    }

    const user = current.user;
    if (!user) return problem(403, 'onboarding', 'Finish setting up your account first.');
    if (user.disabled_at) return problem(403, 'disabled', 'This account is disabled.');

    if (path === '/api/me' && method === 'PATCH') {
      const body = await readJson(request);
      if (typeof body.displayName === 'string') {
        const name = cleanDisplayName(body.displayName);
        const issue = displayNameProblem(name);
        if (issue) return problem(400, 'invalid', issue);
        await db.setDisplayName(user.id, name);
      }
      if (typeof body.username === 'string') {
        const name = normalizeUsername(body.username);
        if (name !== user.username.toLowerCase()) {
          const issue = usernameProblem(name);
          if (issue) return problem(400, 'invalid', issue);
          if (await db.usernameTaken(name, user.id, now)) return problem(409, 'taken', 'That username is taken.');
          await db.changeUsername(user.id, user.username, name, now);
        }
      }
      const updated = await db.userById(user.id);
      return json({ user: updated && publicUser(updated, env) });
    }

    if (path === '/api/me' && method === 'DELETE') {
      const body = await readJson(request);
      if (normalizeUsername(str(body.confirmUsername)) !== user.username.toLowerCase()) {
        return problem(400, 'confirm', 'Type your username to confirm.');
      }
      // Auth0 first: if that fails, nothing is deleted and the person can try again.
      await deleteAuth0User(env, db, now, user.auth0_id);
      await db.deleteUser(user, now);
      return json({ logoutUrl: logoutUrl(env, url.origin, appBase(env)) }, 200, { 'set-cookie': clearSessionCookie(request) });
    }

    if (path === '/api/me/recovery-code' && method === 'POST') {
      const recoveryCode = newRecoveryCode();
      await db.setRecoveryHash(user.id, await hmac(env.RECOVERY_PEPPER, `code:${normalizeRecoveryCode(recoveryCode)}`), now);
      return json({ recoveryCode });
    }

    if (path === '/api/me/sessions' && method === 'GET') {
      const sessions = await db.sessionsOfUser(user.id, now);
      return json({
        sessions: sessions.map((s) => ({
          id: s.id,
          device: s.device_label,
          signedInAt: s.created_at,
          lastUsedAt: s.last_used_at,
          current: s.id === current.session.id,
        })),
      });
    }

    const sessionMatch = /^\/api\/me\/sessions\/([^/]+)$/.exec(path);
    if (sessionMatch && method === 'DELETE') {
      const { meta } = await db.deleteSessionOfUser(user.id, decodeURIComponent(sessionMatch[1]));
      // Someone else's session is "not found", never "forbidden" (spec §9).
      if (meta.changes === 0) return problem(404, 'not-found', 'Not found.');
      const signedOutHere = sessionMatch[1] === current.session.id;
      return json({ ok: true }, 200, signedOutHere ? { 'set-cookie': clearSessionCookie(request) } : {});
    }

    return problem(404, 'not-found', 'Not found.');
  } catch (err) {
    if (err instanceof Auth0Error) {
      // Never logs tokens or personal details: only which step failed.
      console.error(`[accounts] Auth0: ${err.message}`);
      if (path === '/api/auth/callback') return redirect(`${appBase(env)}?account=signin-failed`);
      return problem(502, 'auth0', 'The sign-in service didn’t answer. Try again in a moment.');
    }
    console.error(`[accounts] ${method} ${path}: ${err instanceof Error ? err.message : 'error'}`);
    return problem(500, 'server', 'Something went wrong. Try again in a moment.');
  }
}
