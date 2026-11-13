/**
 * The parts of Cloudflare's runtime the server uses, typed here so the server
 * needs no extra type package. Matches D1's documented API.
 */
export interface D1Result<T = unknown> {
  results: T[];
  meta: { changes: number };
}

export interface D1PreparedStatement {
  bind(...values: (string | number | null)[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

/** Settings of each Pages project (live, beta) or `.dev.vars` locally. */
export interface Env {
  DB: D1Database;
  /** e.g. `dev-xxxx.us.auth0.com` */
  AUTH0_DOMAIN: string;
  /** The "Regular Web Application" used for sign-in. */
  AUTH0_CLIENT_ID: string;
  AUTH0_CLIENT_SECRET: string;
  /** The "Machine to Machine" application allowed to use Auth0's Management API. */
  AUTH0_M2M_CLIENT_ID: string;
  AUTH0_M2M_CLIENT_SECRET: string;
  /** The admin's Auth0 user ID (`auth0|…`). The only admin; never stored in the database. */
  ADMIN_AUTH0_ID?: string;
  /** Long random string; keys the recovery-code and rate-limit hashes. */
  RECOVERY_PEPPER: string;
  /** Where the app lives, e.g. `/` (Cloudflare) or `/anyoneCanPace/` (local dev). Defaults to `/`. */
  APP_BASE?: string;
}
