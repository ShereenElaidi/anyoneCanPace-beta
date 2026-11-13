/**
 * Lookups for a route being built on the device (design/backend-v1-spec.md §4):
 * elevation from Natural Resources Canada (GeoGratis CDEM, the same source as
 * `npm run routes`) and street names from OpenStreetMap (Overpass). They go
 * through our server so those services see it, not the person's phone.
 *
 * Each call is one outside request, and the answer is passed through without
 * being parsed, so it stays well inside the free plan's CPU limit. The request
 * is built here from checked numbers; nothing the app sends is forwarded as is.
 * Nothing is stored or logged.
 */

export const CDEM_PROFILE_API = 'https://geogratis.gc.ca/services/elevation/cdem/profile';
export const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
/** Points per elevation request (GeoGratis profile, as build-routes.ts sends them). */
export const ELEVATION_BATCH = 100;
/**
 * Largest area (degrees, each side) for street names: a 50 km route fits
 * easily. Asked by area, exactly as `npm run routes` does: a query along the
 * route line is much heavier for the public Overpass server and often fails.
 */
export const STREETS_MAX_SPAN_DEG = 0.6;

type LatLon = [number, number];

function latLons(value: unknown, min: number, max: number): LatLon[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max) return null;
  const out: LatLon[] = [];
  for (const p of value) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [lat, lon] = p;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    out.push([Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]);
  }
  return out;
}

/** The GeoGratis request for up to 100 [lat, lon] points, or null if the points aren't valid. */
export function elevationRequest(points: unknown): string | null {
  const pts = latLons(points, 1, ELEVATION_BATCH);
  if (!pts) return null;
  // A single point isn't a line: repeat it (the app keeps the first answer).
  const line = pts.length === 1 ? [pts[0], pts[0]] : pts;
  const wkt = `LINESTRING(${line.map(([lat, lon]) => `${lon} ${lat}`).join(',')})`;
  return `${CDEM_PROFILE_API}?path=${encodeURIComponent(wkt)}&steps=0`;
}

/** The Overpass query for named streets in a [west, south, east, north] box, or null if the box isn't valid. */
export function streetsQuery(box: unknown): string | null {
  if (!Array.isArray(box) || box.length !== 4 || !box.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const [w, s, e, n] = (box as number[]).map((v) => Math.round(v * 1e4) / 1e4);
  if (Math.abs(s) > 90 || Math.abs(n) > 90 || Math.abs(w) > 180 || Math.abs(e) > 180) return null;
  if (e <= w || n <= s || e - w > STREETS_MAX_SPAN_DEG || n - s > STREETS_MAX_SPAN_DEG) return null;
  // Same query as scripts/build-routes.ts.
  return `[out:json][timeout:60];way["highway"]["name"](${s},${w},${n},${e});out geom;`;
}

/** Passes the outside service's answer through, unparsed. */
async function passThrough(res: Response): Promise<Response> {
  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'lookup-failed', message: 'The lookup service didn’t answer. Try again in a moment.' }), {
      status: 502,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  return new Response(res.body, { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export async function lookupElevation(url: string): Promise<Response> {
  return passThrough(await fetch(url, { headers: { accept: 'application/json' } }));
}

export async function lookupStreets(query: string): Promise<Response> {
  return passThrough(
    await fetch(OVERPASS_API, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'AnyoneCanPace route builder' },
      body: `data=${encodeURIComponent(query)}`,
    }),
  );
}
