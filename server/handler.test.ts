// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { applyMigrations, sqliteD1 } from './dev/sqliteD1.ts';
import { RECOVERY_TRIES_PER_DAY, SESSION_DAYS, deviceLabel, handle } from './handler.ts';
import { base64url } from './crypto.ts';
import type { Env } from './types.ts';

const ORIGIN = 'https://pace.example';
const DOMAIN = 'tenant.us.auth0.com';
const DAY = 24 * 60 * 60 * 1000;

/** A pretend Auth0: hands out codes for a user and answers the token, ticket and delete calls. */
function fakeAuth0() {
  const codes = new Map<string, { sub: string; nonce: string }>();
  const deleted: string[] = [];
  const tickets: string[] = [];
  const lookups: string[] = [];
  let managementTokensIssued = 0;
  let failManagement = false;
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const body = typeof init?.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : {};
    if (url.host === 'geogratis.gc.ca') {
      lookups.push(url.toString());
      return Response.json([{ altitude: 30, vertex: true }, { altitude: 31, vertex: true }]);
    }
    if (url.host === 'overpass-api.de') {
      lookups.push(decodeURIComponent(String(init?.body ?? '')));
      return Response.json({ elements: [{ tags: { name: 'Rue Clark' }, geometry: [] }] });
    }
    if (url.host !== DOMAIN) throw new Error(`Unexpected request to ${url.host}`);
    if (url.pathname === '/oauth/token' && body.grant_type === 'authorization_code') {
      const c = codes.get(body.code);
      if (!c || body.client_secret !== 'web-secret' || !body.code_verifier) return new Response('{}', { status: 403 });
      const claims = { iss: `https://${DOMAIN}/`, aud: 'web-client', exp: Math.floor(Date.now() / 1000) + 600, nonce: c.nonce, sub: c.sub };
      const idToken = ['e30', base64url(new TextEncoder().encode(JSON.stringify(claims))), 'sig'].join('.');
      return Response.json({ id_token: idToken, access_token: 'at' });
    }
    if (url.pathname === '/oauth/token' && body.grant_type === 'client_credentials') {
      managementTokensIssued++;
      return Response.json({ access_token: `m2m-${managementTokensIssued}`, expires_in: 86400 });
    }
    if (failManagement) return new Response('{}', { status: 503 });
    if (url.pathname === '/api/v2/tickets/password-change') {
      // Auth0 rejects result_url together with client_id; the app is named by client_id.
      if (body.result_url || body.client_id !== 'web-client') return new Response('{}', { status: 400 });
      tickets.push(body.user_id);
      return Response.json({ ticket: `https://${DOMAIN}/lo/reset?ticket=t1` });
    }
    if (url.pathname.startsWith('/api/v2/users/') && init?.method === 'DELETE') {
      deleted.push(decodeURIComponent(url.pathname.slice('/api/v2/users/'.length)));
      return new Response(null, { status: 204 });
    }
    return new Response('{}', { status: 404 });
  });
  return {
    fetchMock,
    codes,
    deleted,
    tickets,
    lookups,
    get managementTokensIssued() {
      return managementTokensIssued;
    },
    set failManagement(v: boolean) {
      failManagement = v;
    },
  };
}

let env: Env;
let auth0: ReturnType<typeof fakeAuth0>;

beforeEach(async () => {
  const db = sqliteD1();
  await applyMigrations(db, join(import.meta.dirname, '..', 'migrations'));
  env = {
    DB: db,
    AUTH0_DOMAIN: DOMAIN,
    AUTH0_CLIENT_ID: 'web-client',
    AUTH0_CLIENT_SECRET: 'web-secret',
    AUTH0_M2M_CLIENT_ID: 'm2m-client',
    AUTH0_M2M_CLIENT_SECRET: 'm2m-secret',
    RECOVERY_PEPPER: 'pepper',
    APP_BASE: '/',
    ADMIN_AUTH0_ID: 'auth0|admin',
  };
  auth0 = fakeAuth0();
  vi.stubGlobal('fetch', auth0.fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** A browser: keeps its cookies and sends the app's Origin on writes. */
function browser(userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) Version/19.0 Mobile/15E148 Safari/604.1') {
  const jar = new Map<string, string>();
  const send = async (method: string, path: string, body?: unknown, opts: { origin?: string | null; now?: number } = {}) => {
    const headers = new Headers({ 'user-agent': userAgent });
    if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    if (method !== 'GET' && opts.origin !== null) headers.set('origin', opts.origin ?? ORIGIN);
    if (body !== undefined) headers.set('content-type', 'application/json');
    const res = await handle(
      new Request(`${ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
      env,
      opts.now,
    );
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const [name, value] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)];
      if (attrs.some((a) => a.trim() === 'Max-Age=0')) jar.delete(name);
      else jar.set(name, value);
    }
    return res;
  };
  return {
    jar,
    get: (path: string, opts?: { now?: number }) => send('GET', path, undefined, opts),
    post: (path: string, body?: unknown, opts?: { origin?: string | null; now?: number }) => send('POST', path, body ?? {}, opts),
    patch: (path: string, body: unknown) => send('PATCH', path, body),
    del: (path: string, body?: unknown) => send('DELETE', path, body ?? {}),
    /** Goes through Auth0 as `sub` and comes back with a session. */
    async signIn(sub: string, opts: { now?: number } = {}) {
      const login = await send('GET', '/api/auth/login', undefined, opts);
      const authorize = new URL(login.headers.get('location')!);
      const code = `code-${Math.random()}`;
      auth0.codes.set(code, { sub, nonce: authorize.searchParams.get('nonce')! });
      return send('GET', `/api/auth/callback?code=${code}&state=${authorize.searchParams.get('state')}`, undefined, opts);
    },
    async me() {
      return (await send('GET', '/api/me')).json() as Promise<Record<string, any>>;
    },
  };
}

async function signedUp(sub: string, username: string, displayName = 'Sam') {
  const b = browser();
  await b.signIn(sub);
  const res = await b.post('/api/me/onboarding', { username, displayName, age14: true });
  const { recoveryCode } = (await res.json()) as { recoveryCode: string };
  return { b, recoveryCode };
}

describe('sign-in', () => {
  it('sends the person to Auth0 with PKCE, a nonce and only the openid scope', async () => {
    const res = await browser().get('/api/auth/login?signup=1');
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('location')!);
    expect(to.host).toBe(DOMAIN);
    expect(to.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback`);
    expect(to.searchParams.get('code_challenge_method')).toBe('S256');
    expect(to.searchParams.get('scope')).toBe('openid');
    expect(to.searchParams.get('screen_hint')).toBe('signup');
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/SameSite=Lax/);
  });

  it('comes back to the account screen with a session cookie; a new account must finish onboarding', async () => {
    const b = browser();
    const res = await b.signIn('auth0|sam');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/?account');
    expect(b.jar.has('acp_session')).toBe(true);
    expect(b.jar.has('acp_signin')).toBe(false);
    expect(await b.me()).toEqual({ state: 'onboarding' });
  });

  it('refuses a callback whose state does not match the sign-in cookie', async () => {
    const b = browser();
    await b.get('/api/auth/login');
    auth0.codes.set('c1', { sub: 'auth0|x', nonce: 'n' });
    const res = await b.get('/api/auth/callback?code=c1&state=forged');
    expect(res.headers.get('location')).toBe('/?account=signin-failed');
    expect(b.jar.has('acp_session')).toBe(false);
  });

  it('refuses a callback without the sign-in cookie (finished in another browser)', async () => {
    auth0.codes.set('c1', { sub: 'auth0|x', nonce: 'n' });
    const res = await browser().get('/api/auth/callback?code=c1&state=s');
    expect(res.headers.get('location')).toBe('/?account=signin-failed');
  });

  it('labels the device without keeping the browser string', () => {
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) Version/19.0 Mobile/15E148 Safari/604.1')).toBe('iPhone · Safari');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36 Edg/140.0')).toBe('Windows · Edge');
    expect(deviceLabel(null)).toBe('Device · browser');
  });
});

describe('onboarding', () => {
  it('needs 14+, a valid free username and a display name, and shows the recovery code once', async () => {
    const b = browser();
    await b.signIn('auth0|sam');
    expect((await b.post('/api/me/onboarding', { username: 'sam_runs', displayName: 'Sam' })).status).toBe(400);
    expect((await b.post('/api/me/onboarding', { username: 'admin', displayName: 'Sam', age14: true })).status).toBe(400);
    expect((await b.post('/api/me/onboarding', { username: 'sam_runs', displayName: '  ', age14: true })).status).toBe(400);
    const res = await b.post('/api/me/onboarding', { username: 'Sam_Runs', displayName: '  Sam   R ', age14: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recoveryCode: string; user: Record<string, unknown> };
    expect(body.recoveryCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(body.user).toEqual({ username: 'sam_runs', displayName: 'Sam R', role: 'runner', isAdmin: false });
    expect(await b.me()).toEqual({ state: 'ready', user: body.user, needsRecoveryCode: false });
    expect((await b.post('/api/me/onboarding', { username: 'other', displayName: 'S', age14: true })).status).toBe(409);
  });

  it('display names can repeat, usernames cannot (ignoring case)', async () => {
    await signedUp('auth0|a', 'sam_runs', 'Sam');
    const b = browser();
    await b.signIn('auth0|b');
    expect((await b.post('/api/me/onboarding', { username: 'SAM_RUNS', displayName: 'Sam', age14: true })).status).toBe(409);
    expect((await b.post('/api/me/onboarding', { username: 'sam_two', displayName: 'Sam', age14: true })).status).toBe(200);
  });

  it('says whether a username is available', async () => {
    await signedUp('auth0|a', 'sam_runs');
    const check = async (name: string) => (await browser().get(`/api/usernames/${name}`)).json();
    expect(await check('sam_runs')).toEqual({ available: false, reason: 'That username is taken.' });
    expect(await check('support')).toEqual({ available: false, reason: 'That username is reserved.' });
    expect(await check('newbie')).toEqual({ available: true, reason: null });
  });

  it('marks the admin from the server setting only', async () => {
    const { b } = await signedUp('auth0|admin', 'shereen');
    expect((await b.me()).user.isAdmin).toBe(true);
  });

  it('a second device of the same Auth0 account joins the account', async () => {
    const { b } = await signedUp('auth0|sam', 'sam_runs');
    const laptop = browser('Mozilla/5.0 (Macintosh) Safari/605.1.15');
    await laptop.signIn('auth0|sam');
    expect((await laptop.me()).user.username).toBe('sam_runs');
    const list = (await (await b.get('/api/me/sessions')).json()) as { sessions: { device: string; current: boolean }[] };
    expect(list.sessions.map((s) => s.device).sort()).toEqual(['Mac · Safari', 'iPhone · Safari']);
  });
});

describe('profile', () => {
  it('changes the display name and username; the old username is held for 30 days', async () => {
    const { b } = await signedUp('auth0|sam', 'sam_runs');
    expect((await b.patch('/api/me', { displayName: 'Samuel', username: 'samuel' })).status).toBe(200);
    expect((await b.me()).user).toMatchObject({ displayName: 'Samuel', username: 'samuel' });

    const other = browser();
    await other.signIn('auth0|other');
    expect((await other.post('/api/me/onboarding', { username: 'sam_runs', displayName: 'X', age14: true })).status).toBe(409);
    // The person who gave it up can take it back.
    expect((await b.patch('/api/me', { username: 'sam_runs' })).status).toBe(200);
  });

  it('a held username is free again after 30 days', async () => {
    const { b } = await signedUp('auth0|sam', 'sam_runs');
    await b.patch('/api/me', { username: 'samuel' });
    const later = Date.now() + 31 * DAY;
    const res = await handle(new Request(`${ORIGIN}/api/usernames/sam_runs`), env, later);
    expect(await res.json()).toEqual({ available: true, reason: null });
  });
});

describe('sessions', () => {
  it('lists only your own devices and can sign one out; another person’s session is not found', async () => {
    const { b: phone } = await signedUp('auth0|sam', 'sam_runs');
    const laptop = browser('Mozilla/5.0 (Macintosh) Safari/605.1.15');
    await laptop.signIn('auth0|sam');
    const { b: someoneElse } = await signedUp('auth0|other', 'other');

    const mine = (await (await phone.get('/api/me/sessions')).json()) as { sessions: { id: string; device: string; current: boolean }[] };
    expect(mine.sessions).toHaveLength(2);
    const laptopId = mine.sessions.find((s) => !s.current)!.id;

    expect((await someoneElse.del(`/api/me/sessions/${laptopId}`)).status).toBe(404);
    expect((await laptop.me()).state).toBe('ready');
    expect((await phone.del(`/api/me/sessions/${laptopId}`)).status).toBe(200);
    expect((await laptop.me()).state).toBe('signed-out');
  });

  it('expires after 60 days without use, and renews when used', async () => {
    const b = browser();
    const start = Date.now();
    await b.signIn('auth0|sam', { now: start });
    expect(((await (await b.get('/api/me', { now: start + 50 * DAY })).json()) as { state: string }).state).toBe('onboarding');
    // Used on day 50, so still valid on day 100.
    expect(((await (await b.get('/api/me', { now: start + 100 * DAY })).json()) as { state: string }).state).toBe('onboarding');
    expect(((await (await b.get('/api/me', { now: start + 100 * DAY + SESSION_DAYS * DAY + 1 })).json()) as { state: string }).state).toBe('signed-out');
  });

  it('signing out ends the session and returns Auth0’s logout address', async () => {
    const { b } = await signedUp('auth0|sam', 'sam_runs');
    const res = await b.post('/api/auth/logout');
    const { logoutUrl } = (await res.json()) as { logoutUrl: string };
    expect(new URL(logoutUrl).host).toBe(DOMAIN);
    expect(new URL(logoutUrl).searchParams.get('returnTo')).toBe(`${ORIGIN}/`);
    expect((await b.me()).state).toBe('signed-out');
  });

  it('refuses writes from other sites', async () => {
    const { b } = await signedUp('auth0|sam', 'sam_runs');
    expect((await b.post('/api/auth/logout', {}, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await b.post('/api/auth/logout', {}, { origin: null })).status).toBe(403);
    expect((await b.me()).state).toBe('ready');
  });

  it('needs a session for account endpoints', async () => {
    expect((await browser().get('/api/me/sessions')).status).toBe(401);
    expect((await browser().patch('/api/me', { displayName: 'X' })).status).toBe(401);
  });
});

describe('recovery code', () => {
  it('a correct code gives a password-reset link, signs every device out and is used up', async () => {
    const { b, recoveryCode } = await signedUp('auth0|sam', 'sam_runs');
    const res = await browser().post('/api/auth/recover', { username: 'Sam_Runs', code: recoveryCode.toLowerCase().replaceAll('-', ' ') });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ticketUrl: string }).ticketUrl).toContain(DOMAIN);
    expect(auth0.tickets).toEqual(['auth0|sam']);
    expect((await b.me()).state).toBe('signed-out');

    // Used up: the same code fails, and the next sign-in asks for a new one.
    expect((await browser().post('/api/auth/recover', { username: 'sam_runs', code: recoveryCode })).status).toBe(400);
    const again = browser();
    await again.signIn('auth0|sam');
    expect((await again.me()).needsRecoveryCode).toBe(true);
    const fresh = (await (await again.post('/api/me/recovery-code')).json()) as { recoveryCode: string };
    expect(fresh.recoveryCode).not.toBe(recoveryCode);
    expect((await again.me()).needsRecoveryCode).toBe(false);
  });

  it(`allows ${RECOVERY_TRIES_PER_DAY} tries per username per day, then refuses even the right code`, async () => {
    const { recoveryCode } = await signedUp('auth0|sam', 'sam_runs');
    const tries = [];
    for (let i = 0; i < RECOVERY_TRIES_PER_DAY; i++) {
      tries.push((await (await browser().post('/api/auth/recover', { username: 'sam_runs', code: 'AAAA-AAAA-AAAA-AAAA' })).json()) as { triesLeft: number });
    }
    expect(tries.map((t) => t.triesLeft)).toEqual([2, 1, 0]);
    const blocked = await browser().post('/api/auth/recover', { username: 'sam_runs', code: recoveryCode });
    expect(blocked.status).toBe(429);
    expect(auth0.tickets).toEqual([]);
  });

  it('gives the same answer for a username that does not exist', async () => {
    const res = await browser().post('/api/auth/recover', { username: 'nobody', code: 'AAAA-AAAA-AAAA-AAAA' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'wrong-code', triesLeft: 2 });
  });

  it('reuses the Auth0 management token instead of asking for a new one each time', async () => {
    const a = await signedUp('auth0|a', 'aaa');
    const c = await signedUp('auth0|c', 'ccc');
    await browser().post('/api/auth/recover', { username: 'aaa', code: a.recoveryCode });
    await browser().post('/api/auth/recover', { username: 'ccc', code: c.recoveryCode });
    expect(auth0.managementTokensIssued).toBe(1);
  });
});

describe('deleting the account', () => {
  it('needs the username typed, deletes at Auth0 and here, and holds the username', async () => {
    const { b } = await signedUp('auth0|sam', 'sam_runs');
    expect((await b.del('/api/me', { confirmUsername: 'wrong' })).status).toBe(400);
    const res = await b.del('/api/me', { confirmUsername: 'SAM_RUNS' });
    expect(res.status).toBe(200);
    expect(auth0.deleted).toEqual(['auth0|sam']);
    expect((await b.me()).state).toBe('signed-out');
    expect(await (await browser().get('/api/usernames/sam_runs')).json()).toEqual({ available: false, reason: 'That username is taken.' });
  });

  it('deletes nothing when Auth0 fails', async () => {
    const { b } = await signedUp('auth0|sam', 'sam_runs');
    auth0.failManagement = true;
    expect((await b.del('/api/me', { confirmUsername: 'sam_runs' })).status).toBe(502);
    expect((await b.me()).state).toBe('ready');
  });
});

// ---------- personal routes (step 2a) ----------

import { readFileSync } from 'node:fs';
import { sanitizeGpx } from '../scripts/lib/sanitize-gpx.ts';
import { LOOKUPS_PER_DAY, PERSONAL_ROUTE_LIMIT } from './handler.ts';

const ROOT = join(import.meta.dirname, '..');
const fixture = () => ({
  data: JSON.parse(readFileSync(join(ROOT, 'src/data/routes/pi-day.json'), 'utf8')),
  track: JSON.parse(readFileSync(join(ROOT, 'src/data/routes/pi-day.geojson'), 'utf8')),
  gpx: sanitizeGpx(readFileSync(join(ROOT, 'routes/onthegomap-4.7-km-route.gpx'), 'utf8'), 'Pi Day').gpx,
});

async function upload(b: ReturnType<typeof browser>, body: unknown = fixture()) {
  const res = await b.post('/api/me/routes', body);
  return { res, body: (await res.json()) as Record<string, any> };
}

describe('personal routes', () => {
  it('saves a route built on the device; only its owner can list, open, change or delete it', async () => {
    const { b: owner } = await signedUp('auth0|sam', 'sam_runs');
    const { b: other } = await signedUp('auth0|other', 'other');
    const { res, body } = await upload(owner);
    expect(res.status).toBe(201);
    const id = body.route.id as string;
    expect(id).not.toBe('pi-day'); // the server picks the id
    expect(body.route).toMatchObject({ name: 'Pi Day', kind: 'loop', verification: 'unverified' });
    expect(body.route.outline).toMatch(/^M[\d.]+ [\d.]+L/);

    const list = (await (await owner.get('/api/me/routes')).json()) as { routes: { id: string }[] };
    expect(list.routes.map((r) => r.id)).toEqual([id]);
    const opened = (await (await owner.get(`/api/me/routes/${id}`)).json()) as { data: Record<string, any>; track: Record<string, any> };
    expect(opened.data).toMatchObject({ id, track: `${id}.geojson`, verification: { status: 'unverified' } });
    expect(opened.track.properties.id).toBe(id);

    // Someone else: an empty list, and "not found" for every way in.
    expect(((await (await other.get('/api/me/routes')).json()) as { routes: unknown[] }).routes).toEqual([]);
    expect((await other.get(`/api/me/routes/${id}`)).status).toBe(404);
    expect((await other.patch(`/api/me/routes/${id}`, { name: 'Mine now' })).status).toBe(404);
    expect((await other.del(`/api/me/routes/${id}`)).status).toBe(404);
    expect((await owner.get(`/api/me/routes/${id}`)).status).toBe(200);

    // Signed out: nothing.
    expect((await browser().get(`/api/me/routes/${id}`)).status).toBe(401);

    expect((await owner.del(`/api/me/routes/${id}`)).status).toBe(200);
    expect((await owner.get(`/api/me/routes/${id}`)).status).toBe(404);
  });

  it('ignores the id and review the app sends: always a new id and unverified', async () => {
    const { b } = await signedUp('auth0|sam', 'sam_runs');
    const f = fixture();
    f.data.verification = { status: 'field-verified', reviewer: 'Someone', date: '2026-01-01' };
    const { body } = await upload(b, f);
    expect(body.route.verification).toBe('unverified');
  });

  it('refuses a GPX that still holds more than positions', async () => {
    const { b } = await signedUp('auth0|sam', 'sam_runs');
    const f = fixture();
    f.gpx = f.gpx.replace('<trkseg>', '<trkseg><time>2026-11-12T10:00:00Z</time>');
    const { res, body } = await upload(b, f);
    expect(res.status).toBe(400);
    expect(body.problems.join(' ')).toMatch(/time/);
  });

  it('refuses unknown fields, a track that does not match, and routes over 50 km', async () => {
    const { b } = await signedUp('auth0|sam', 'sam_runs');
    const f = fixture();
    f.data.secret = 'x';
    f.data.stats.distanceM = 60_000;
    f.data.bbox = [0, 0, 1, 1];
    const { res, body } = await upload(b, f);
    expect(res.status).toBe(400);
    const problems = body.problems.join(' | ');
    expect(problems).toMatch(/unknown field "secret"/);
    expect(problems).toMatch(/50 km/);
    expect(problems).toMatch(/doesn’t match its track/);
    expect(problems).toMatch(/bbox/);
  });

  it('applies the route editor’s rules to edits; the reviewer is always the signed-in person', async () => {
    const { b } = await signedUp('auth0|sam', 'sam_runs', 'Sam');
    const { body } = await upload(b);
    const id = body.route.id as string;

    const renamed = await b.patch(`/api/me/routes/${id}`, { name: 'Pi Day long', place: 'Plateau' });
    expect(((await renamed.json()) as { summary: { name: string } }).summary.name).toBe('Pi Day long');

    expect((await b.patch(`/api/me/routes/${id}`, { verification: { status: 'desk-reviewed', reviewer: 'X', date: '2026-01-01' } })).status).toBe(400);
    // The app can't name the reviewer.
    expect((await b.patch(`/api/me/routes/${id}`, { review: 'desk-reviewed', reviewer: 'Someone else' })).status).toBe(400);
    const reviewed = (await (await b.patch(`/api/me/routes/${id}`, { review: 'desk-reviewed' })).json()) as {
      data: { verification: Record<string, string> };
    };
    expect(reviewed.data.verification).toMatchObject({ status: 'desk-reviewed', reviewer: 'Sam (@sam_runs)' });
    expect(reviewed.data.verification.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const opened = (await (await b.get(`/api/me/routes/${id}`)).json()) as { data: { turns: { atM: number }[] } };
    const turns = opened.data.turns.slice(1);
    // A review and a turn change in the same save: refused (the review has to be of the saved turns).
    expect((await b.patch(`/api/me/routes/${id}`, { turns, review: 'field-verified' })).status).toBe(400);
    // Changing the turns resets the review.
    const changed = (await (await b.patch(`/api/me/routes/${id}`, { turns })).json()) as { verificationReset: boolean; summary: { verification: string } };
    expect(changed.verificationReset).toBe(true);
    expect(changed.summary.verification).toBe('unverified');
    // Generated fields can't be edited.
    expect((await b.patch(`/api/me/routes/${id}`, { stats: { distanceM: 1 } })).status).toBe(400);
  });

  it(`keeps a runner to ${PERSONAL_ROUTE_LIMIT.runner} routes`, async () => {
    const { b } = await signedUp('auth0|sam', 'sam_runs');
    for (let i = 0; i < PERSONAL_ROUTE_LIMIT.runner; i++) expect((await upload(b)).res.status).toBe(201);
    const { res, body } = await upload(b);
    expect(res.status).toBe(409);
    expect(body.message).toMatch(/25/);
  });

  it('deleting the account deletes its personal routes', async () => {
    const { b } = await signedUp('auth0|sam', 'sam_runs');
    await upload(b);
    await b.del('/api/me', { confirmUsername: 'sam_runs' });
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM personal_routes').first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});

describe('lookups for building a route', () => {
  it('passes an elevation batch to GeoGratis, built from checked numbers', async () => {
    const { b } = await signedUp('auth0|sam', 'sam_runs');
    const res = await b.post('/api/lookup/elevation', { points: [[45.51, -73.57], [45.52, -73.56]] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ altitude: 30, vertex: true }, { altitude: 31, vertex: true }]);
    expect(decodeURIComponent(auth0.lookups[0])).toContain('LINESTRING(-73.57 45.51,-73.56 45.52)');
    expect((await b.post('/api/lookup/elevation', { points: Array.from({ length: 101 }, () => [45, -73]) })).status).toBe(400);
    expect((await b.post('/api/lookup/elevation', { points: [['45; drop', -73]] })).status).toBe(400);
  });

  it('asks Overpass only for named streets within 40 m of the route line', async () => {
    const { b } = await signedUp('auth0|sam', 'sam_runs');
    const res = await b.post('/api/lookup/streets', { line: [[45.51, -73.57], [45.52, -73.56]] });
    expect(res.status).toBe(200);
    expect(auth0.lookups[0]).toContain('way["highway"]["name"](around:40,45.51,-73.57,45.52,-73.56);out geom;');
  });

  it('needs a finished account, and stops after the daily limit', async () => {
    expect((await browser().post('/api/lookup/streets', { line: [[45, -73], [45.1, -73]] })).status).toBe(401);
    const half = browser();
    await half.signIn('auth0|new');
    expect((await half.post('/api/lookup/streets', { line: [[45, -73], [45.1, -73]] })).status).toBe(403);

    const { b } = await signedUp('auth0|sam', 'sam_runs');
    for (let i = 0; i < LOOKUPS_PER_DAY.streets; i++) await b.post('/api/lookup/streets', { line: [[45, -73], [45.1, -73]] });
    expect((await b.post('/api/lookup/streets', { line: [[45, -73], [45.1, -73]] })).status).toBe(429);
  });
});
