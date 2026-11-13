/**
 * `?account` in the address opens the account screen: the server sends people
 * back there after Auth0 (`?account`, `?account=signin-failed`, `?account=disabled`).
 * Tiny and dependency-free so the first-load bundle can read it.
 */
export const ACCOUNT_PARAM = 'account';

/** null when the address doesn't ask for the account screen, otherwise its status ('' for none). */
export function accountReturn(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.has(ACCOUNT_PARAM) ? (params.get(ACCOUNT_PARAM) ?? '') : null;
}

/** The same address without `?account`, so a reload doesn't repeat the message. */
export function withoutAccountParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(ACCOUNT_PARAM);
  return url.pathname + url.search + url.hash;
}
