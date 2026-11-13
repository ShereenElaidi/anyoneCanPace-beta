/**
 * Offline maps per route (design/backend-v1-spec.md §4a), in builds where it's
 * switched on (__ROUTE_MAPS__: the dev server, and builds with ROUTE_MAPS=1).
 * Each route saves the map tiles around it, never around the person, into
 * Cache Storage; the map reads tiles from there first. The tiles come from our
 * server (/api/map/tiles), cut from the Montréal–Québec City map.
 *
 * No map library is imported here, so a route page can show the status
 * without loading MapLibre.
 */
import { useEffect, useState } from 'react';

export const ROUTE_MAPS: boolean = __ROUTE_MAPS__;

/** Bump when the map in R2 is re-cut, so saved tiles are fetched again. */
export const TILES_VERSION = '20261112';
/** The area the map covers [west, south, east, north] (scripts/cut-map.ts --bbox). */
export const MAP_AREA: [number, number, number, number] = [-74.6, 45.0, -70.9, 47.0];
/** Map around the route, as scripts/cut-map.ts uses for the route maps. */
export const AROUND_ROUTE_M = 1100;
/** Saved zooms: the route page's whole-route view down to street level (the map draws 16–18 from 15). */
export const MIN_SAVED_ZOOM = 10;
export const MAX_SAVED_ZOOM = 15;
const PARALLEL = 6;

type Box = [number, number, number, number];

const cacheName = () => `anyonecanpace-tiles:${import.meta.env.BASE_URL}`;
const metaKey = (routeId: string) => `anyonecanpace:route-map:${import.meta.env.BASE_URL}${routeId}`;

export const tileUrl = (z: number, x: number, y: number) => `/api/map/tiles/${z}/${x}/${y}?v=${TILES_VERSION}`;

const lonToX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const latToY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** The box grown by `metres` on every side. */
export function grow([w, s, e, n]: Box, metres: number): Box {
  const dLat = metres / 111_320;
  const dLon = metres / (111_320 * Math.cos((((s + n) / 2) * Math.PI) / 180));
  return [w - dLon, s - dLat, e + dLon, n + dLat];
}

/** Every tile [z, x, y] covering the box at zooms MIN..MAX_SAVED_ZOOM. */
export function tilesFor(box: Box): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let z = MIN_SAVED_ZOOM; z <= MAX_SAVED_ZOOM; z++) {
    const [x0, x1] = [lonToX(box[0], z), lonToX(box[2], z)];
    const [y0, y1] = [latToY(box[3], z), latToY(box[1], z)];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y]);
  }
  return out;
}

/** Is the route inside the area the map covers? */
export const insideMapArea = (b: Box) => b[0] >= MAP_AREA[0] && b[1] >= MAP_AREA[1] && b[2] <= MAP_AREA[2] && b[3] <= MAP_AREA[3];

export type RouteMapStatus =
  | { state: 'checking' }
  | { state: 'outside' }
  | { state: 'missing' }
  | { state: 'saving'; fraction: number }
  | { state: 'saved'; savedAt: number; tiles: number }
  | { state: 'error'; message: string };

interface Meta {
  version: string;
  savedAt: number;
  tiles: number;
}

function readMeta(routeId: string): Meta | null {
  try {
    const raw = localStorage.getItem(metaKey(routeId));
    const meta = raw ? (JSON.parse(raw) as Meta) : null;
    return meta?.version === TILES_VERSION ? meta : null;
  } catch {
    return null;
  }
}

const supported = () => typeof caches !== 'undefined' && typeof fetch !== 'undefined';

/** Downloads in progress, so the map and the save never fetch the same tile twice at once. */
const inFlight = new Map<string, Promise<ArrayBuffer | null>>();

/** Fetches a tile and keeps it (a 204 "no tile here" is kept too). */
function download(url: string): Promise<ArrayBuffer | null> {
  let p = inFlight.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetch(url);
      if (res.status !== 204 && !res.ok) {
        throw new Error(res.status === 503 ? 'The map isn’t available here yet.' : 'The map didn’t download. Try again with a connection.');
      }
      const data = res.status === 204 ? null : await res.arrayBuffer();
      if (supported()) {
        const copy = data
          ? new Response(data.slice(0), { headers: { 'content-type': 'application/x-protobuf' } })
          : new Response(null, { status: 204 });
        await (await caches.open(cacheName())).put(url, copy).catch(() => {});
      }
      return data;
    })().finally(() => inFlight.delete(url));
    inFlight.set(url, p);
  }
  return p;
}

async function saved(url: string): Promise<Response | undefined> {
  if (!supported()) return undefined;
  return (await caches.open(cacheName())).match(url).catch(() => undefined);
}

/** A tile for the map: the saved copy, else the network (and keep it). null where the map has no tile. */
export async function readTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<ArrayBuffer | null> {
  const url = tileUrl(z, x, y);
  const hit = await saved(url);
  if (hit) return hit.status === 204 ? null : hit.arrayBuffer();
  signal?.throwIfAborted();
  return download(url);
}

/** Saves every tile around a route. Tiles already saved aren't fetched again. */
export async function saveRouteMap(routeId: string, bbox: Box, onProgress: (fraction: number) => void = () => {}): Promise<Meta> {
  if (!supported()) throw new Error('This browser can’t keep the map offline.');
  const tiles = tilesFor(grow(bbox, AROUND_ROUTE_M));
  let done = 0;
  const queue = [...tiles];
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const url = tileUrl(...t);
      if (!(await saved(url))) await download(url);
      onProgress(++done / tiles.length);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  const meta: Meta = { version: TILES_VERSION, savedAt: Date.now(), tiles: tiles.length };
  try {
    localStorage.setItem(metaKey(routeId), JSON.stringify(meta));
  } catch {
    // The tiles are saved; only the "saved" note is lost.
  }
  return meta;
}

/** Deletes every saved tile and note (sign-out: tiles around personal routes show where they are). */
export async function clearRouteMaps(): Promise<void> {
  try {
    if (supported()) await caches.delete(cacheName());
    const prefix = `anyonecanpace:route-map:${import.meta.env.BASE_URL}`;
    for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) localStorage.removeItem(k);
  } catch {
    /* nothing saved */
  }
}

/** Should the map save now without asking (online, and not in data-saver mode)? */
function mayAutoSave(): boolean {
  if (typeof navigator === 'undefined' || !navigator.onLine) return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !conn?.saveData;
}

/**
 * The offline-map status of one route, saving it automatically the first time
 * it's opened online. `save` retries by hand.
 */
export function useRouteMap(routeId: string, bbox: Box): { status: RouteMapStatus; save: () => void } {
  const [status, setStatus] = useState<RouteMapStatus>({ state: 'checking' });
  const key = `${routeId}:${bbox.join(',')}`;
  const save = () => {
    setStatus({ state: 'saving', fraction: 0 });
    saveRouteMap(routeId, bbox, (fraction) => setStatus({ state: 'saving', fraction })).then(
      (meta) => setStatus({ state: 'saved', savedAt: meta.savedAt, tiles: meta.tiles }),
      (err: unknown) => setStatus({ state: 'error', message: err instanceof Error ? err.message : 'The map didn’t download.' }),
    );
  };
  useEffect(() => {
    if (!insideMapArea(bbox)) return setStatus({ state: 'outside' });
    const meta = readMeta(routeId);
    if (meta) return setStatus({ state: 'saved', savedAt: meta.savedAt, tiles: meta.tiles });
    if (supported() && mayAutoSave()) save();
    else setStatus({ state: 'missing' });
  }, [key]);
  return { status, save };
}
