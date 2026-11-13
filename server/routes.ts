/**
 * Checks for personal routes (design/backend-v1-spec.md §4, §9). The route is
 * built on the person's device (§4 "Where the build runs"); the server can't
 * afford to rebuild it on the free plan, so it checks what arrives instead:
 * shape and types, the same field rules as the route editor, sizes and limits,
 * that the track and the route agree, and that the GPX holds nothing but
 * positions. Pure: no database, no clock (today is passed in).
 */
import { outlinePath } from '../scripts/lib/process-route.ts';
import { applyEdits, NAME_MAX, PLACE_MAX, validateAdvisories, validateTurns } from '../src/dev/routeEditor/edits.ts';
import type { RouteData, RouteKind, RouteSummary, RouteVerification, TrackFeature } from '../src/nav/types.ts';
import { ROUTE_TAGS, validateDescription, validateTags } from '../src/sixk/describe.ts';

/** Longest route accepted (spec §10): a marathon with room to spare. */
export const MAX_ROUTE_M = 50_000;
/** Cleaned GPX: positions only, so even a long, dense track stays well under this. */
export const MAX_GPX_CHARS = 1_000_000;
export const MAX_TRACK_POINTS = 20_000;
export const MAX_PROFILE_POINTS = 20_000;
export const MAX_NOTES = 20;
export const NOTE_MAX = 200;
export const START_STREET_MAX = 120;

const KINDS: RouteKind[] = ['loop', 'out-and-back', 'point-to-point'];
const DATA_FIELDS = new Set<string>([
  'id', 'name', 'kind', 'stats', 'track', 'startStreet', 'place', 'description', 'tags', 'bbox',
  'profile', 'turns', 'notes', 'advisories', 'source', 'verification', 'geometry',
]);
/** The only elements a cleaned GPX contains (scripts/lib/sanitize-gpx.ts). */
const GPX_ELEMENTS = new Set(['gpx', 'trk', 'name', 'trkseg', 'trkpt', 'ele']);

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v === v.trim() && v.length <= max;

/** Problems with a cleaned GPX: anything other than positions (times, heart rate, names of places…) is refused. */
export function gpxProblems(gpx: unknown): string[] {
  if (typeof gpx !== 'string') return ['gpx must be text'];
  if (gpx.length > MAX_GPX_CHARS) return [`the GPX is larger than ${MAX_GPX_CHARS / 1_000_000} MB after cleaning`];
  const errors: string[] = [];
  const unexpected = new Set<string>();
  for (const m of gpx.matchAll(/<\/?([A-Za-z_][\w:.-]*)/g)) if (!GPX_ELEMENTS.has(m[1])) unexpected.add(m[1]);
  if (unexpected.size) errors.push(`the GPX still contains ${[...unexpected].slice(0, 5).join(', ')}: only positions are kept`);
  if (/<!/.test(gpx)) errors.push('the GPX contains a declaration or comment');
  if ((gpx.match(/<trkpt\b/g)?.length ?? 0) < 2) errors.push('the GPX has fewer than two track points');
  return errors;
}

function trackProblems(track: unknown): string[] {
  if (!isObject(track) || track.type !== 'Feature') return ['track must be a GeoJSON Feature'];
  const geometry = track.geometry;
  const props = track.properties;
  if (!isObject(geometry) || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) return ['track must be a LineString'];
  if (!isObject(props) || !Array.isArray(props.distancesM)) return ['track needs properties.distancesM'];
  const coords = geometry.coordinates as unknown[];
  const dists = props.distancesM as unknown[];
  if (coords.length < 2 || coords.length > MAX_TRACK_POINTS) return [`track must have 2 to ${MAX_TRACK_POINTS} points`];
  if (dists.length !== coords.length) return ['track distances and points don’t match'];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length !== 2 || !isNum(c[0]) || !isNum(c[1]) || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) {
      return ['track points must be [longitude, latitude]'];
    }
  }
  let prev = -1;
  for (const d of dists) {
    if (!isNum(d) || d < prev) return ['track distances must be numbers in order'];
    prev = d;
  }
  if ((dists[0] as number) > 1) return ['track distances must start at 0'];
  return [];
}

export interface PreparedUpload {
  data: RouteData;
  track: TrackFeature;
  gpx: string;
  summary: RouteSummary;
}

/**
 * Checks a route built on the device and returns what to store, or the
 * problems. The server sets the ID, the track file name and the verification
 * (always unverified: a review is a separate, deliberate step).
 */
export function prepareUpload(body: unknown, id: string, today: string): { ok: true; route: PreparedUpload } | { ok: false; errors: string[] } {
  if (!isObject(body)) return { ok: false, errors: ['the request must be a route'] };
  const errors = [...gpxProblems(body.gpx), ...trackProblems(body.track)];
  const d = body.data;
  if (!isObject(d)) return { ok: false, errors: [...errors, 'data must be a route'] };
  if (errors.length) return { ok: false, errors };
  const track = body.track as unknown as TrackFeature;
  const coords = track.geometry.coordinates;
  const lengthM = track.properties.distancesM[track.properties.distancesM.length - 1];

  for (const k of Object.keys(d)) if (!DATA_FIELDS.has(k)) errors.push(`unknown field "${k}"`);
  if (!isText(d.name, NAME_MAX) || !d.name) errors.push(`name must be 1 to ${NAME_MAX} characters`);
  if (!KINDS.includes(d.kind as RouteKind)) errors.push('unknown route kind');
  const s = d.stats;
  if (!isObject(s) || !['distanceM', 'gainM', 'lossM', 'minEleM', 'maxEleM'].every((k) => isNum(s[k]))) {
    errors.push('stats must have distance and elevation numbers');
  } else {
    const st = s as unknown as RouteData['stats'];
    if (st.distanceM <= 0 || st.distanceM > MAX_ROUTE_M) errors.push(`the route must be at most ${MAX_ROUTE_M / 1000} km`);
    if (Math.abs(st.distanceM - lengthM) > Math.max(20, lengthM * 0.01)) errors.push('the route length doesn’t match its track');
    if (st.gainM < 0 || st.lossM < 0 || st.minEleM > st.maxEleM) errors.push('elevation numbers don’t add up');
  }
  if (lengthM > MAX_ROUTE_M + 50) errors.push(`the route must be at most ${MAX_ROUTE_M / 1000} km`);

  const b = d.bbox;
  if (!Array.isArray(b) || b.length !== 4 || !b.every(isNum)) errors.push('bbox must be four numbers');
  else {
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const real = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    if (real.some((v, i) => Math.abs(v - (b[i] as number)) > 0.001)) errors.push('bbox doesn’t match the track');
  }

  const distanceM = isObject(s) && isNum(s.distanceM) ? s.distanceM : 0;
  if (!Array.isArray(d.profile) || d.profile.length > MAX_PROFILE_POINTS) errors.push('profile must be a list');
  else if (!d.profile.every((p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]) && p[0] >= 0 && p[0] <= distanceM + 50)) {
    errors.push('profile must be [distance, elevation] pairs along the route');
  }
  errors.push(...validateTurns(d.turns, distanceM));
  if (!Array.isArray(d.notes) || d.notes.length > MAX_NOTES || !d.notes.every((n) => isText(n, NOTE_MAX) && n)) {
    errors.push(`notes must be up to ${MAX_NOTES} lines of at most ${NOTE_MAX} characters`);
  }
  errors.push(...validateAdvisories(d.advisories, id, distanceM, today));
  errors.push(...validateTags(d.tags), ...validateDescription(d.description));
  if (d.place !== undefined && (!isText(d.place, PLACE_MAX) || !d.place)) errors.push(`place must be 1 to ${PLACE_MAX} characters`);
  if (d.startStreet !== undefined && !isText(d.startStreet, START_STREET_MAX)) errors.push('startStreet must be a street name');
  if (typeof d.geometry !== 'string' || d.geometry.length > 100) errors.push('geometry must be a fingerprint');
  if (d.source !== undefined) {
    const src = d.source;
    if (!isObject(src) || !isText(src.name, 100) || !isText(src.attribution, 200) || (src.url !== undefined && !isText(src.url, 300))) {
      errors.push('source must have a name and attribution');
    }
  }
  if (errors.length) return { ok: false, errors };

  const verification: RouteVerification = { status: 'unverified' };
  const data = { ...(d as unknown as RouteData), id, track: `${id}.geojson`, verification };
  const cleanTrack: TrackFeature = {
    type: 'Feature',
    properties: { id, distancesM: track.properties.distancesM },
    geometry: { type: 'LineString', coordinates: coords },
  };
  return { ok: true, route: { data, track: cleanTrack, gpx: body.gpx as string, summary: summaryOf(data, coords) } };
}

/** The library-list entry for a route (RouteSummary), with its outline drawn from the track. */
export function summaryOf(data: RouteData, coords: [number, number][]): RouteSummary {
  return {
    id: data.id,
    name: data.name,
    kind: data.kind,
    stats: data.stats,
    outline: outlinePath(coords.map(([lon, lat]) => ({ lat, lon }))),
    verification: data.verification.status,
    ...(data.place !== undefined ? { place: data.place } : {}),
    ...(data.tags !== undefined ? { tags: data.tags } : {}),
  };
}

/** The review the owner asks for, recorded by the server with their name and today's date. */
export type ReviewRequest = 'unverified' | 'desk-reviewed' | 'field-verified';

/**
 * Applies the owner's edits (the route editor's rules: changing turns or the
 * start street resets a review). `review` sets the verification; the reviewer
 * is always the signed-in person, never what the request says.
 */
export function editPersonalRoute(
  existing: RouteData,
  body: unknown,
  ctx: { today: string; reviewer: string },
): { ok: true; data: RouteData; verificationReset: boolean } | { ok: false; errors: string[] } {
  if (!isObject(body)) return { ok: false, errors: ['edits must be an object'] };
  const { review, ...edits } = body;
  if ('verification' in edits) return { ok: false, errors: ['use "review" to mark a route reviewed'] };
  if (Array.isArray(edits.notes) && (edits.notes.length > MAX_NOTES || !edits.notes.every((n) => isText(n, NOTE_MAX)))) {
    return { ok: false, errors: [`notes must be up to ${MAX_NOTES} lines of at most ${NOTE_MAX} characters`] };
  }
  if (typeof edits.startStreet === 'string' && edits.startStreet.length > START_STREET_MAX) {
    return { ok: false, errors: ['startStreet must be a street name'] };
  }
  if (review !== undefined) {
    if (review === 'unverified') edits.verification = { status: 'unverified' };
    else if (review === 'desk-reviewed' || review === 'field-verified') {
      edits.verification = { status: review, reviewer: ctx.reviewer, date: ctx.today };
    } else return { ok: false, errors: [`unknown review "${String(review)}"`] };
  }
  const result = applyEdits(existing, edits, { tags: ROUTE_TAGS, today: ctx.today });
  return result.data ? { ok: true, data: result.data, verificationReset: result.verificationReset } : { ok: false, errors: result.errors };
}

/** YYYY-MM-DD in Montréal, for review dates and advisory checks. */
export const montrealDate = (now: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montreal', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
