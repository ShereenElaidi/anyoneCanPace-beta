/**
 * Builds one route from a GPX: the steps `npm run routes` runs for each route,
 * and the app runs on the device for a personal route (design/backend-v1-spec.md
 * §4). One pipeline, so both follow the same rules. Pure apart from the
 * lookups, which the caller provides: from files and the network in the script
 * (with caches in routes/cache/), through our server on the device.
 */
import type { RouteData, RouteSource, RouteVerification, TrackFeature, Turn } from '../../src/nav/types.ts';
import { GPX_ELEVATION, NRCAN_CDEM, processElevation, type ElevationResult, type ElevationSource } from './elevation.ts';
import { bbox, classify, cumulative, dedupe, distanceToLine, outlinePath, parseGpx, removeSpurs, resample, simplify } from './process-route.ts';
import { analyseTurns, type Street, type TurnAnalysis } from './turns.ts';
import { decideTurns, type TurnDecision } from './turn-review.ts';

type Box = [number, number, number, number];
type TrackPoint = { lat: number; lon: number; ele?: number };

export interface RouteLookups {
  /** Bare-earth elevations (NRCan CDEM) for [lat, lon] pairs, null where there's no data. */
  elevations(coords: [number, number][]): Promise<(number | null)[]>;
  /** Named streets near the route. `box` is the route's [west, south, east, north]. */
  streets(box: Box, track: TrackPoint[]): Promise<Street[]>;
}

export interface BuildInput {
  id: string;
  name: string;
  /** The GPX text (already cleaned for personal routes). */
  gpx: string;
  /** For messages: where the GPX came from (a file name). */
  gpxLabel?: string;
  source?: RouteSource;
  /** The route as previously built, to keep its hand-edited fields and turns. */
  existing?: RouteData | null;
  oldTrack?: TrackFeature | null;
  resetTurns?: boolean;
}

export interface BuiltRoute {
  data: RouteData;
  feature: TrackFeature;
  /** SVG path for the library thumbnail. */
  outline: string;
  analysis: TurnAnalysis;
  eleSource: ElevationSource;
  eleResult: ElevationResult;
  decision: TurnDecision;
}

export type BuildLog = (level: 'log' | 'warn', text: string) => void;

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

export class StaleTurnsError extends Error {}

export async function buildRoute(input: BuildInput, lookups: RouteLookups, log: BuildLog = () => {}): Promise<BuiltRoute> {
  const gpx = parseGpx(input.gpx);
  if (gpx.points.length < 2) throw new Error(`${input.gpxLabel ?? 'The GPX'} has no track points`);

  const deduped = dedupe(gpx.points);
  const spurs = removeSpurs(deduped);
  const cleaned = dedupe(spurs.points);
  const track = simplify(cleaned);
  const cum = cumulative(track);
  const total = cum[cum.length - 1];
  const kind = classify(track, cum);
  const box = bbox(track);

  log('log', `  points: ${gpx.points.length} → ${deduped.length} deduped → ${cleaned.length} without spurs → ${track.length} simplified`);
  for (const s of spurs.removed) log('log', `  removed spur: input points ${s.from}–${s.to} (${s.pathM.toFixed(1)} m out and back)`);
  log('log', `  distance: ${total.toFixed(0)} m, ${kind}`);

  // Elevation: from the GPX if every point has it, otherwise looked up.
  const fromGpx = gpx.points.every((p) => p.ele !== undefined);
  const eleSource: ElevationSource = fromGpx ? GPX_ELEVATION : NRCAN_CDEM;
  const samples = resample(track, cum, eleSource.sampleStepM);
  let elevations: (number | null)[];
  if (fromGpx) {
    const denseCum = cumulative(cleaned);
    elevations = samples.map((s) => {
      let best = 0;
      let bestD = Infinity;
      cleaned.forEach((_, i) => {
        const d = Math.abs(denseCum[i] - s.d);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return cleaned[best].ele ?? null;
    });
  } else {
    elevations = await lookups.elevations(samples.map((s) => [round(s.p.lat, 5), round(s.p.lon, 5)]));
  }
  const eleResult = processElevation(samples.map((s, i) => ({ d: s.d, ele: elevations[i] })), eleSource);
  const ele = eleResult.summary;
  if (!ele) throw new Error(`${input.id}: no elevation data along the route`);
  log('log', `  elevation (${eleSource.name}): +${ele.gainM} m / -${ele.lossM} m, ${ele.minEleM}–${ele.maxEleM} m`);
  if (eleResult.missingM) log('warn', `  ! ${eleResult.missingM} m of the route had no elevation; bridged with straight lines`);
  if (eleResult.spikes.length) log('log', `  elevation spikes replaced: ${eleResult.spikes.length}`);

  const streets = await lookups.streets(box, track);
  const analysis = analyseTurns(track, cum, streets);
  const proposed: Turn[] = analysis.turns.map((t) => ({ atM: t.atM, dir: t.dir, street: t.street }));
  const flagged = analysis.review.filter((r) => r.needsReview).length;
  log('log', `  proposed turns: ${proposed.length}, ${flagged} candidate(s) need review (see routes/review/${input.id}.md)`);

  const existing = input.existing ?? null;
  const coords = track.map((p) => [round(p.lon, 6), round(p.lat, 6)] as [number, number]);
  const decision = await decideTurns({
    existingTurns: existing?.turns ?? null,
    existingFingerprint: existing?.geometry,
    oldCoords: input.oldTrack?.geometry.coordinates ?? null,
    newCoords: coords,
    proposed,
    reset: !!input.resetTurns,
  });
  if (decision.outcome === 'stale') {
    throw new StaleTurnsError(
      `${input.id}: the track geometry changed since its turns were written, so their distances (atM) no longer ` +
        `match the route. Rebuild with --reset-turns to regenerate them (street names and notes are carried over to ` +
        `turns within 25 m), then review routes/review/${input.id}.md.`,
    );
  }
  const keep = !!existing;
  if (decision.outcome === 'kept') log('log', '  geometry unchanged: kept hand-edited turns');
  if (decision.outcome === 'regenerated') {
    log('log', `  turns regenerated; ${decision.carried} street/note edit(s) carried over by position`);
    for (const t of decision.dropped) log('warn', `  ! old turn at ${(t.atM / 1000).toFixed(2)} km (${t.street || t.dir}) matched no new turn: check it`);
  }
  if (decision.geometryChanged && existing?.advisories.some((a) => a.fromKm !== undefined)) {
    log('warn', '  ! the geometry changed: check the km ranges of this route’s advisories');
  }
  // Any change to what the pacer is told means a person has to check it again.
  const changed = decision.geometryChanged || decision.outcome === 'regenerated';
  const verification: RouteVerification =
    existing?.verification && !changed
      ? existing.verification
      : {
          status: 'unverified',
          ...(existing?.verification && existing.verification.status !== 'unverified'
            ? { notes: `Was ${existing.verification.status}; geometry or turns changed since, so it needs checking again.` }
            : {}),
        };

  const data: RouteData = {
    id: input.id,
    name: keep ? existing!.name : input.name,
    kind,
    stats: {
      distanceM: Math.round(total),
      gainM: ele.gainM,
      lossM: ele.lossM,
      minEleM: ele.minEleM,
      maxEleM: ele.maxEleM,
    },
    track: `${input.id}.geojson`,
    startStreet:
      keep && !decision.geometryChanged && existing!.startStreet !== undefined ? existing!.startStreet : analysis.startStreet,
    ...(keep && existing!.place !== undefined ? { place: existing!.place } : {}),
    ...(keep && existing!.description !== undefined ? { description: existing!.description } : {}),
    ...(keep && existing!.tags !== undefined ? { tags: existing!.tags } : {}),
    bbox: box.map((v) => round(v, 6)) as RouteData['bbox'],
    profile: ele.profile,
    turns: decision.turns,
    notes: keep ? existing!.notes : [],
    advisories: keep ? existing!.advisories : [],
    source: input.source,
    verification,
    geometry: decision.fingerprint,
  };

  const feature: TrackFeature = {
    type: 'Feature',
    properties: { id: input.id, distancesM: cum.map((d) => round(d, 1)) },
    geometry: { type: 'LineString', coordinates: coords },
  };
  return { data, feature, outline: outlinePath(track), analysis, eleSource, eleResult, decision };
}

// ---------- the lookup services (shared by the script and the device) ----------

/** The area asked for street names: the route's box plus about 200 m, rounded (as routes/cache/ stores it). */
export function streetsBox(box: Box): Box {
  const pad = 0.002;
  return [round(box[0] - pad, 4), round(box[1] - pad, 4), round(box[2] + pad, 4), round(box[3] + pad, 4)];
}

/**
 * Why an Overpass answer can't be used, or null. A busy server sometimes
 * answers 200 with a "remark" (e.g. a timeout) and no elements: that is a
 * failed lookup, not "no streets here".
 */
export function overpassFailure(body: unknown): string | null {
  const b = body as { remark?: unknown; elements?: unknown };
  if (!b || typeof b !== 'object' || !Array.isArray(b.elements)) return 'unexpected answer';
  if (typeof b.remark === 'string' && /error|timed out|out of memory/i.test(b.remark)) return b.remark;
  return null;
}

/** Elevations from a GeoGratis CDEM profile answer for `count` points (a single point was sent twice). */
export function elevationsFromProfile(body: unknown, count: number): (number | null)[] {
  if (!Array.isArray(body)) throw new Error('Elevation lookup returned something unexpected');
  const vertices = (body as { altitude: number | null; vertex: boolean }[]).filter((p) => p.vertex);
  const expected = count === 1 ? 2 : count;
  if (vertices.length !== expected) throw new Error(`Elevation lookup returned ${vertices.length} points for ${expected}`);
  // No-data comes back as null or a large negative fill value.
  return vertices.slice(0, count).map((p) => (typeof p.altitude === 'number' && p.altitude > -500 ? p.altitude : null));
}

/** Named streets from an Overpass answer, keeping only those that come within 40 m of the route. */
export function streetsFromOverpass(body: unknown, track: TrackPoint[]): Street[] {
  const elements = (body as { elements?: { tags?: { name?: string }; geometry?: { lat: number; lon: number }[] }[] })?.elements ?? [];
  const streets: Street[] = [];
  for (const el of elements) {
    const name = el.tags?.name;
    const geom = el.geometry;
    if (!name || !geom || geom.length < 2) continue;
    if (!geom.some((p) => distanceToLine(p, track) < 40)) continue;
    streets.push({ name, coords: geom.map((p) => [round(p.lon, 6), round(p.lat, 6)]) });
  }
  return streets;
}
