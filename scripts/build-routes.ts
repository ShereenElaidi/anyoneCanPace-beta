/**
 * Converts the source GPX files in routes/ into the small processed files the
 * app ships (src/data/routes/). Run with:  npm run routes
 *
 *   --offline      use only cached elevation and street data (fail if missing)
 *   --reset-turns  replace the turns with fresh proposals (street names and
 *                  notes are carried over to proposals at the same place)
 *
 * Hand-edited fields (name, place, description, tags, notes, advisories, startStreet, verification) in
 * an existing processed file are always kept. Hand-edited turns are kept only
 * while the track geometry is unchanged: if the GPX changed, their distances
 * no longer fit, so the build stops and asks for --reset-turns. Changing the
 * geometry or the turns resets verification to "unverified".
 * Elevation and street lookups are cached in routes/cache/ so builds are
 * repeatable offline.
 *
 * Turns and the start street are suggestions. Every candidate, with the
 * decision and the reason, is written to routes/review/<id>.md (and .json,
 * with the elevation processing stages) for a person to check.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RouteData, RouteManifest, RouteSource, TrackFeature, Turn } from '../src/nav/types.ts';
import { buildRoute as buildRouteData, elevationsFromProfile, overpassFailure, streetsBox, streetsFromOverpass } from './lib/build-route.ts';
import { COPERNICUS_GLO90, processElevation, type ElevationResult, type ElevationSource } from './lib/elevation.ts';
import { formatJson } from './lib/json.ts';
import { turnReviewMarkdown, type Street, type TurnAnalysis } from './lib/turns.ts';
import type { TurnDecision } from './lib/turn-review.ts';

interface RouteConfig {
  id: string;
  gpx: string;
  name: string;
  source?: RouteSource;
  /** Recorded on a run rather than drawn on a map (set by the dev route editor): its turns need a closer look. */
  recorded?: boolean;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'routes');
const CACHE_DIR = join(SRC_DIR, 'cache');
const REVIEW_DIR = join(SRC_DIR, 'review');
const OUT_DIR = join(ROOT, 'src', 'data', 'routes');
const OFFLINE = process.argv.includes('--offline');
const RESET_TURNS = process.argv.includes('--reset-turns');

const CDEM_PROFILE_API = 'https://geogratis.gc.ca/services/elevation/cdem/profile';
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';


function readJson<T>(path: string): T | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null;
}

// ---------- Elevation (NRCan CDEM, bare earth) ----------

interface ElevationCache {
  source: string;
  coords: [number, number][];
  elevations: (number | null)[];
}

const CDEM_CACHE_SOURCE =
  'Natural Resources Canada, Canadian Digital Elevation Model (CDEM), via the GeoGratis elevation API. Contains information licensed under the Open Government Licence – Canada.';

/** Bare-earth elevations for [lat, lon] pairs, 100 per request, cached per route. */
async function lookupElevations(id: string, coords: [number, number][]): Promise<(number | null)[]> {
  const path = join(CACHE_DIR, `${id}.elevation.json`);
  const cached = readJson<ElevationCache>(path);
  if (cached && cached.source === CDEM_CACHE_SOURCE && JSON.stringify(cached.coords) === JSON.stringify(coords)) {
    return cached.elevations;
  }
  if (OFFLINE) throw new Error(`No cached elevation for ${id} matching the current track. Run without --offline.`);

  const elevations: (number | null)[] = [];
  for (let i = 0; i < coords.length; i += 100) {
    const batch = coords.slice(i, i + 100);
    // A single point isn't a line: repeat it and keep the first answer.
    const line = batch.length === 1 ? [batch[0], batch[0]] : batch;
    const wkt = `LINESTRING(${line.map(([lat, lon]) => `${lon} ${lat}`).join(',')})`;
    const url = `${CDEM_PROFILE_API}?path=${encodeURIComponent(wkt)}&steps=0`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Elevation lookup failed: ${res.status} ${await res.text()}`);
    elevations.push(...elevationsFromProfile(await res.json(), batch.length));
  }
  const cache: ElevationCache = { source: CDEM_CACHE_SOURCE, coords, elevations };
  writeFileSync(path, formatJson(cache));
  return elevations;
}

/** The earlier surface-model samples (Open-Meteo, Copernicus GLO-90), kept only to compare against. */
function copernicusComparison(id: string): ElevationResult | null {
  const old = readJson<{ coords: [number, number][]; elevations: number[] }>(join(CACHE_DIR, `${id}.elevation-copernicus.json`));
  if (!old) return null;
  const step = COPERNICUS_GLO90.sampleStepM;
  return processElevation(old.elevations.map((ele, i) => ({ d: i * step, ele })), COPERNICUS_GLO90);
}

// ---------- Street names (OpenStreetMap via Overpass) ----------

interface StreetCache {
  source: string;
  bbox: [number, number, number, number];
  streets: Street[];
}

async function lookupStreets(id: string, box: [number, number, number, number], track: { lat: number; lon: number }[]): Promise<Street[]> {
  const path = join(CACHE_DIR, `${id}.streets.json`);
  const padded = streetsBox(box);
  const cached = readJson<StreetCache>(path);
  if (cached && JSON.stringify(cached.bbox) === JSON.stringify(padded)) return cached.streets;
  if (OFFLINE) {
    console.warn(`  ! No cached street names for ${id}; turns will have empty street names.`);
    return [];
  }
  const [w, s, e, n] = padded;
  const query = `[out:json][timeout:60];way["highway"]["name"](${s},${w},${n},${e});out geom;`;
  const res = await fetch(OVERPASS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AnyoneCanPace route builder' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) {
    console.warn(`  ! Street lookup failed (${res.status}); turns will have empty street names.`);
    return [];
  }
  const body = await res.json();
  const failure = overpassFailure(body);
  if (failure) {
    console.warn(`  ! Street lookup failed (${failure}); turns will have empty street names.`);
    return [];
  }
  // Keep only streets that come close to the route, to keep the cache small.
  const streets = streetsFromOverpass(body, track);
  const cache: StreetCache = {
    source: 'OpenStreetMap contributors (ODbL), via the Overpass API',
    bbox: padded,
    streets,
  };
  writeFileSync(path, formatJson(cache));
  return streets;
}

// ---------- Main ----------

async function buildRoute(config: RouteConfig) {
  console.log(`\n${config.id}  (${config.gpx})`);
  const jsonPath = join(OUT_DIR, `${config.id}.json`);
  // The steps themselves are shared with the app (scripts/lib/build-route.ts).
  const built = await buildRouteData(
    {
      id: config.id,
      name: config.name,
      gpx: readFileSync(join(SRC_DIR, config.gpx), 'utf8'),
      gpxLabel: config.gpx,
      source: config.source,
      existing: readJson<RouteData>(jsonPath),
      oldTrack: readJson<TrackFeature>(join(OUT_DIR, `${config.id}.geojson`)),
      resetTurns: RESET_TURNS,
    },
    {
      elevations: (coords) => lookupElevations(config.id, coords),
      streets: (box, track) => lookupStreets(config.id, box, track),
    },
    (level, text) => console[level](text),
  );
  const { data, feature, analysis, eleSource, eleResult, decision } = built;
  const proposed: Turn[] = analysis.turns.map((t) => ({ atM: t.atM, dir: t.dir, street: t.street }));
  writeFileSync(join(CACHE_DIR, `${config.id}.proposed-turns.json`), formatJson(proposed));

  writeFileSync(jsonPath, formatJson(data));
  writeFileSync(join(OUT_DIR, `${config.id}.geojson`), JSON.stringify(feature) + '\n');
  writeReview(config, data, analysis, eleSource, eleResult, decision);
  return { data, outline: built.outline };
}

// ---------- Review report ----------

function writeReview(
  config: RouteConfig,
  data: RouteData,
  analysis: TurnAnalysis,
  eleSource: ElevationSource,
  ele: ElevationResult,
  decision: TurnDecision,
) {
  const s = ele.summary!;
  const surface = copernicusComparison(config.id)?.summary;
  const md = [
    `# ${data.name}: route review`,
    '',
    'Generated by `npm run routes`. Everything below is an automated suggestion, not a verified instruction:',
    'check each line marked "yes" against the map, or on the ground, before trusting it.',
    '',
    `**Verification: ${data.verification.status}**${data.verification.reviewer ? ` (${data.verification.reviewer}, ${data.verification.date})` : ''}. ` +
      'See "Reviewing and releasing a route" in the README before changing it.',
    '',
    decision.outcome === 'kept'
      ? `Geometry unchanged, so the app keeps the turns in \`src/data/routes/${config.id}.json\` (${decision.turns.length} turns). Compare them with these suggestions, or rebuild with \`--reset-turns\` to take the suggestions.`
      : decision.outcome === 'regenerated'
        ? `Turns regenerated from these suggestions (\`--reset-turns\`); ${decision.carried} street/note edit(s) carried over from turns at the same place.` +
          (decision.dropped.length
            ? ` Old turns that matched nothing (check by hand): ${decision.dropped.map((t) => `${(t.atM / 1000).toFixed(2)} km ${t.street || t.dir}${t.note ? ` ("${t.note}")` : ''}`).join('; ')}.`
            : '')
        : `The app uses these suggestions as they are (\`src/data/routes/${config.id}.json\`). Edit that file by hand to correct them.`,
    '',
    '## Turns',
    '',
    config.recorded
      ? '**Recorded run:** this GPX was recorded on a run, not drawn on a map. GPS wobble can look like turns, so check every turn closely.\n'
      : '',
    turnReviewMarkdown(analysis),
    '## Elevation',
    '',
    `Source: ${eleSource.name}, sampled every ${eleSource.sampleStepM} m. Climb and descent count changes over ${ele.thresholdM} m.`,
    '',
    '| | Climb | Descent | Lowest | Highest |',
    '| --- | --: | --: | --: | --: |',
    `| Used in the app | ${s.gainM} m | ${s.lossM} m | ${s.minEleM} m | ${s.maxEleM} m |`,
    `| Raw samples, same threshold | ${ele.rawGainM} m | ${ele.rawLossM} m | | |`,
    surface
      ? `| Surface model for comparison (Copernicus GLO-90, roofs and trees) | ${surface.gainM} m | ${surface.lossM} m | ${surface.minEleM} m | ${surface.maxEleM} m |`
      : '',
    '',
    ele.spikes.length
      ? `Spikes replaced: ${ele.spikes.map((p) => `${(p.d / 1000).toFixed(2)} km (${p.raw} → ${p.replacedBy} m)`).join(', ')}.`
      : 'No spikes replaced.',
    ele.missingM ? `No data for ${ele.missingM} m of the route (bridged with straight lines).` : '',
    '',
  ]
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n');
  writeFileSync(join(REVIEW_DIR, `${config.id}.md`), md);
  writeFileSync(
    join(REVIEW_DIR, `${config.id}.json`),
    formatJson({
      id: config.id,
      note: 'Automated suggestions for manual review. Nothing here has been verified.',
      startStreet: analysis.startStreet,
      startNote: analysis.startNote,
      turns: analysis.review,
      elevation: {
        source: eleSource,
        thresholdM: ele.thresholdM,
        summary: { gainM: s.gainM, lossM: s.lossM, minEleM: s.minEleM, maxEleM: s.maxEleM },
        raw: { gainM: ele.rawGainM, lossM: ele.rawLossM },
        missingM: ele.missingM,
        spikes: ele.spikes,
        samples: ele.stages,
      },
    }),
  );
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(REVIEW_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const configs = readJson<RouteConfig[]>(join(SRC_DIR, 'routes.config.json'));
  if (!configs?.length) throw new Error('routes/routes.config.json lists no routes');

  const manifest: RouteManifest = { routes: [] };
  for (const config of configs) {
    const { data, outline } = await buildRoute(config);
    manifest.routes.push({
      id: data.id,
      name: data.name,
      kind: data.kind,
      stats: data.stats,
      outline,
      verification: data.verification.status,
      ...(data.place !== undefined ? { place: data.place } : {}),
      ...(data.tags !== undefined ? { tags: data.tags } : {}),
    });
  }
  writeFileSync(join(OUT_DIR, 'manifest.json'), formatJson(manifest));
  console.log(`\nWrote ${manifest.routes.length} route(s) to src/data/routes/`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
