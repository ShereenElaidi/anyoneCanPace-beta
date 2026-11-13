/**
 * Personal routes for the Route Library (design/backend-v1-spec.md §3): from
 * the server when online, from a copy on this device when not. A route is
 * copied when it's opened, so a route someone has opened once can be followed
 * without signal. The copies are this person's only and are deleted on sign-out
 * and account deletion (clearMyRoutesCopies).
 */
import { ApiError, listMyRoutes, type MyRouteSummary } from '../account/api';
import { prepareRoute } from '../nav/route';
import type { RouteData, TrackFeature } from '../nav/types';
import type { LoadedRoute } from '../sixk/data';

const CACHE = 'anyonecanpace-my-routes';
// Keys under the app's own origin; never fetched, only used as cache keys.
const LIST_KEY = '/__my-routes/list';
const routeKey = (id: string) => `/__my-routes/route/${encodeURIComponent(id)}`;

const hasCaches = () => typeof caches !== 'undefined';

async function putCopy(key: string, value: unknown) {
  if (!hasCaches()) return;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(key, new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }));
  } catch {
    // Storage full or blocked: the route still works while online.
  }
}

async function readCopy<T>(key: string): Promise<T | null> {
  if (!hasCaches()) return null;
  try {
    const res = await (await caches.open(CACHE)).match(key);
    return res ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function deleteCopy(key: string) {
  if (!hasCaches()) return;
  try {
    await (await caches.open(CACHE)).delete(key);
  } catch {
    /* nothing to delete */
  }
}

export interface MyRoutesList {
  routes: MyRouteSummary[];
  /** True when the list is the copy on this device (offline). */
  offline: boolean;
}

/** The signed-in person's routes; the copy on this device when offline; null if there's neither. */
export async function loadMyRoutesList(): Promise<MyRoutesList | null> {
  try {
    const { routes } = await listMyRoutes();
    await putCopy(LIST_KEY, routes);
    return { routes, offline: false };
  } catch (err) {
    if (err instanceof ApiError && err.code !== 'offline') throw err;
    const copy = await readCopy<MyRouteSummary[]>(LIST_KEY);
    return copy ? { routes: copy, offline: true } : null;
  }
}

/** One personal route, ready to show and follow. Copied to the device for offline use. */
export async function loadMyRoute(id: string): Promise<LoadedRoute> {
  let body: { data: RouteData; track: TrackFeature } | null = null;
  try {
    const res = await fetch(`/api/me/routes/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
    if (res.status === 404) {
      await deleteCopy(routeKey(id));
      throw new Error('This route isn’t in your routes any more.');
    }
    if (!res.ok) throw new Error(res.status === 401 ? 'Sign in to open your routes.' : 'Could not load the route.');
    body = (await res.json()) as { data: RouteData; track: TrackFeature };
    await putCopy(routeKey(id), body);
  } catch (err) {
    if (!(err instanceof TypeError)) throw err; // a network failure is a TypeError: use the copy
    body = await readCopy(routeKey(id));
    if (!body) throw new Error('You’re offline and this route hasn’t been opened on this device yet.');
  }
  return { data: body.data, track: body.track, prepared: prepareRoute(body.track.geometry.coordinates, body.data.turns) };
}

/** Deletes every personal-route copy on this device (sign-out, account deletion). */
export async function clearMyRoutesCopies(): Promise<void> {
  if (!hasCaches()) return;
  try {
    await caches.delete(CACHE);
  } catch {
    /* nothing to delete */
  }
}
