/**
 * The app's side of the accounts API (server/handler.ts). Same origin, so the
 * HttpOnly session cookie goes along by itself; the app never sees it.
 */

export interface AccountUser {
  username: string;
  displayName: string;
  role: 'runner' | 'pacer';
  isAdmin: boolean;
}

export type Me =
  | { state: 'signed-out' }
  | { state: 'onboarding' }
  | { state: 'disabled' }
  | { state: 'ready'; user: AccountUser; needsRecoveryCode: boolean }
  | { state: 'unavailable' }
  | { state: 'offline' };

export interface DeviceSession {
  id: string;
  device: string;
  signedInAt: number;
  lastUsedAt: number;
  current: boolean;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'offline', 'You seem to be offline. Try again when you’re connected.');
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(res.status, String(data.error ?? 'error'), String(data.message ?? 'Something went wrong. Try again in a moment.'), data);
  }
  return data as T;
}

export async function getMe(): Promise<Me> {
  try {
    return await call<Me>('GET', '/api/me');
  } catch (err) {
    if (err instanceof ApiError && err.code === 'offline') return { state: 'offline' };
    return { state: 'unavailable' };
  }
}

/** Leaves the app for Auth0's sign-in page (the server handles the round trip). */
export function goToSignIn(signUp: boolean, go: (url: string) => void = (url) => location.assign(url)) {
  go(signUp ? '/api/auth/login?signup=1' : '/api/auth/login');
}

export const checkUsername = (name: string) =>
  call<{ available: boolean; reason: string | null }>('GET', `/api/usernames/${encodeURIComponent(name)}`);

export const finishOnboarding = (username: string, displayName: string, age14: boolean) =>
  call<{ user: AccountUser; recoveryCode: string }>('POST', '/api/me/onboarding', { username, displayName, age14 });

export const updateProfile = (changes: { displayName?: string; username?: string }) =>
  call<{ user: AccountUser }>('PATCH', '/api/me', changes);

export const newRecoveryCode = () => call<{ recoveryCode: string }>('POST', '/api/me/recovery-code');

export const listSessions = () => call<{ sessions: DeviceSession[] }>('GET', '/api/me/sessions');

export const signOutDevice = (id: string) => call<{ ok: true }>('DELETE', `/api/me/sessions/${encodeURIComponent(id)}`);

export const signOut = () => call<{ logoutUrl: string }>('POST', '/api/auth/logout');

export const deleteAccount = (confirmUsername: string) => call<{ logoutUrl: string }>('DELETE', '/api/me', { confirmUsername });

export const recover = (username: string, code: string) => call<{ ticketUrl: string }>('POST', '/api/auth/recover', { username, code });
