/**
 * Talks to Auth0: the sign-in redirect, the code exchange, sign-out, and the
 * Management API (password-reset links for recovery codes, deleting accounts).
 * No Auth0 code runs in the app; only the server talks to Auth0.
 */
import { base64url, fromBase64url, randomToken, sha256base64url } from './crypto.ts';
import type { AccountsDb } from './db.ts';
import type { Env } from './types.ts';

export class Auth0Error extends Error {}

/** What the sign-in cookie remembers between leaving for Auth0 and coming back. */
export interface SignInTransaction {
  state: string;
  verifier: string;
  nonce: string;
}

export function newTransaction(): SignInTransaction {
  return { state: randomToken(16), verifier: randomToken(32), nonce: randomToken(16) };
}

export const encodeTransaction = (tx: SignInTransaction) => base64url(new TextEncoder().encode(JSON.stringify(tx)));

export function decodeTransaction(value: string | undefined): SignInTransaction | null {
  if (!value) return null;
  try {
    const tx = JSON.parse(new TextDecoder().decode(fromBase64url(value))) as Partial<SignInTransaction>;
    return typeof tx.state === 'string' && typeof tx.verifier === 'string' && typeof tx.nonce === 'string'
      ? (tx as SignInTransaction)
      : null;
  } catch {
    return null;
  }
}

export async function authorizeUrl(env: Env, origin: string, tx: SignInTransaction, signUp: boolean): Promise<string> {
  const url = new URL(`https://${env.AUTH0_DOMAIN}/authorize`);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: env.AUTH0_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/callback`,
    // Only the ID; the email stays at Auth0 (spec §11).
    scope: 'openid',
    state: tx.state,
    nonce: tx.nonce,
    code_challenge: await sha256base64url(tx.verifier),
    code_challenge_method: 'S256',
    ...(signUp ? { screen_hint: 'signup' } : {}),
  }).toString();
  return url.toString();
}

/**
 * Swaps the code for an ID token and returns the Auth0 user ID (`sub`).
 * The token comes straight from Auth0 over TLS with our client secret, so its
 * claims are checked but not its signature (OpenID Connect Core §3.1.3.7).
 */
export async function exchangeCode(env: Env, origin: string, code: string, tx: SignInTransaction, now: number): Promise<string> {
  const res = await fetch(`https://${env.AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: env.AUTH0_CLIENT_ID,
      client_secret: env.AUTH0_CLIENT_SECRET,
      code,
      code_verifier: tx.verifier,
      redirect_uri: `${origin}/api/auth/callback`,
    }),
  });
  if (!res.ok) throw new Auth0Error(`Code exchange failed (${res.status})`);
  const { id_token: idToken } = (await res.json()) as { id_token?: string };
  if (!idToken) throw new Auth0Error('No ID token');
  const claims = JSON.parse(new TextDecoder().decode(fromBase64url(idToken.split('.')[1] ?? ''))) as {
    iss?: string;
    aud?: string | string[];
    exp?: number;
    nonce?: string;
    sub?: string;
  };
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== `https://${env.AUTH0_DOMAIN}/`) throw new Auth0Error('Wrong issuer');
  if (!audiences.includes(env.AUTH0_CLIENT_ID)) throw new Auth0Error('Wrong audience');
  if (!claims.exp || claims.exp * 1000 < now - 60_000) throw new Auth0Error('Expired');
  if (claims.nonce !== tx.nonce) throw new Auth0Error('Wrong nonce');
  if (!claims.sub) throw new Auth0Error('No user ID');
  return claims.sub;
}

/** Ends Auth0's own session too, then comes back to the app (spec §5 "Signing out"). */
export function logoutUrl(env: Env, origin: string, appBase: string): string {
  const url = new URL(`https://${env.AUTH0_DOMAIN}/v2/logout`);
  url.search = new URLSearchParams({ client_id: env.AUTH0_CLIENT_ID, returnTo: `${origin}${appBase}` }).toString();
  return url.toString();
}

// ---------- Management API ----------

const M2M_CACHE_KEY = 'auth0-management-token';

/**
 * A Management API token, reused until shortly before it expires: the free plan
 * limits how many can be issued a month (spec §5).
 */
async function managementToken(env: Env, db: AccountsDb, now: number): Promise<string> {
  const cached = await db.cached(M2M_CACHE_KEY, now);
  if (cached) return cached;
  const res = await fetch(`https://${env.AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: env.AUTH0_M2M_CLIENT_ID,
      client_secret: env.AUTH0_M2M_CLIENT_SECRET,
      audience: `https://${env.AUTH0_DOMAIN}/api/v2/`,
    }),
  });
  if (!res.ok) throw new Auth0Error(`Management token failed (${res.status})`);
  const { access_token: token, expires_in: expiresIn } = (await res.json()) as { access_token: string; expires_in: number };
  await db.cache(M2M_CACHE_KEY, token, now + Math.max(0, expiresIn - 300) * 1000);
  return token;
}

async function management(env: Env, db: AccountsDb, now: number, method: string, path: string, body?: unknown) {
  const token = await managementToken(env, db, now);
  const res = await fetch(`https://${env.AUTH0_DOMAIN}/api/v2/${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Auth0Error(`Management API ${method} ${path.split('/')[0]} failed (${res.status})`);
  return res.status === 204 ? null : res.json();
}

/**
 * A one-time "set a new password" link, returned instead of emailed.
 * Names our sign-in app (`client_id`) rather than a return address: Auth0's
 * current sign-in pages ignore `result_url` (it only works with "Classic"
 * pages) and instead offer "Back to <app>", which opens the app's
 * Application Login URI (`https://<site>/api/auth/login`, set in Auth0; it
 * must be HTTPS, so not on localhost).
 */
export async function passwordResetLink(env: Env, db: AccountsDb, now: number, auth0Id: string): Promise<string> {
  const ticket = (await management(env, db, now, 'POST', 'tickets/password-change', {
    user_id: auth0Id,
    client_id: env.AUTH0_CLIENT_ID,
    ttl_sec: 15 * 60,
  })) as { ticket: string };
  return ticket.ticket;
}

export async function deleteAuth0User(env: Env, db: AccountsDb, now: number, auth0Id: string): Promise<void> {
  await management(env, db, now, 'DELETE', `users/${encodeURIComponent(auth0Id)}`);
}
