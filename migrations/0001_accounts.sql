-- Accounts (design/backend-v1-spec.md §5, §7). Applied to D1 with
-- `wrangler d1 migrations apply`, and by the local dev API and tests.
-- Times are milliseconds since 1970 (Date.now()).

CREATE TABLE users (
  id                  TEXT PRIMARY KEY,
  auth0_id            TEXT NOT NULL UNIQUE,
  username            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name        TEXT NOT NULL,
  role                TEXT NOT NULL DEFAULT 'runner' CHECK (role IN ('runner', 'pacer')),
  -- HMAC of the current recovery code; NULL once used (a new one is shown at next sign-in).
  recovery_hash       TEXT,
  recovery_created_at INTEGER,
  disabled_at         INTEGER,
  created_at          INTEGER NOT NULL
);

-- One row per signed-in device. `id` is shown to the person (to sign a device
-- out); the cookie holds a token whose SHA-256 is `token_hash`.
-- `user_id` is NULL until onboarding (username, display name, recovery code) is done.
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  token_hash    TEXT NOT NULL UNIQUE,
  auth0_id      TEXT NOT NULL,
  user_id       TEXT REFERENCES users (id) ON DELETE CASCADE,
  device_label  TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL
);
CREATE INDEX sessions_by_auth0 ON sessions (auth0_id);
CREATE INDEX sessions_by_user ON sessions (user_id);

-- A username someone gave up stays blocked for others for 30 days.
CREATE TABLE released_usernames (
  username     TEXT PRIMARY KEY COLLATE NOCASE,
  released_by  TEXT NOT NULL,
  released_at  INTEGER NOT NULL
);

-- Rate-limit counters (recovery attempts). Keys are hashed; rows older than a day are deleted.
CREATE TABLE attempts (
  kind  TEXT NOT NULL,
  key   TEXT NOT NULL,
  at    INTEGER NOT NULL
);
CREATE INDEX attempts_by_key ON attempts (kind, key, at);

-- Small server-side cache (the Auth0 management token).
CREATE TABLE kv (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  expires_at  INTEGER NOT NULL
);
