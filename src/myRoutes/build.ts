/**
 * Builds a personal route on the device (design/backend-v1-spec.md §4): the
 * GPX is cleaned here, so the original never leaves the phone or laptop, then
 * the same steps as `npm run routes` run (scripts/lib/build-route.ts), with
 * elevation and street names looked up through our server. The result is a
 * draft, kept on the device until it's saved (drafts.ts).
 */
import { buildRoute, elevationsFromProfile, overpassFailure, streetsBox, streetsFromOverpass, type RouteLookups } from '../../scripts/lib/build-route.ts';
import { sanitizeGpx } from '../../scripts/lib/sanitize-gpx.ts';
import type { TurnReviewEntry } from '../../scripts/lib/turns.ts';
import type { RouteData, TrackFeature } from '../nav/types';

/** Matches the server (server/lookups.ts). */
export const ELEVATION_BATCH = 100;
/** Waits before retrying a lookup the public services couldn't answer (they're often busy), in ms. */
export const RETRY_WAITS_MS = [2000, 5000, 12000];
/** Biggest GPX accepted before cleaning (spec §10): a raw watch export with heart rate and times. */
export const MAX_GPX_BYTES = 5 * 1024 * 1024;

export interface Draft {
  /** Local ID, until the server gives the saved route its own. */
  id: string;
  createdAt: number;
  /** What was removed from the file, in plain words (e.g. "2,140 timestamps"). */
  removed: string[];
  /** The cleaned GPX: positions only. */
  gpx: string;
  data: RouteData;
  track: TrackFeature;
  outline: string;
  /** Every turn candidate with the reason it was kept or left out, for checking the turns. */
  review: TurnReviewEntry[];
  startNote: string;
  /** Street names couldn't be looked up: the turns have none, to fill in while checking them. */
  streetsMissing: boolean;
}

export type BuildStep = 'cleaning' | 'elevation' | 'streets' | 'turns';

/** Posts to the API and returns the parsed answer; throws with the server's message on failure. */
export type Post = (path: string, body: unknown) => Promise<unknown>;

export interface LookupOptions {
  onStep?: (step: BuildStep, done?: number, total?: number) => void;
  /** For tests: how to wait between retries. */
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Tries `f`, waiting and trying again (RETRY_WAITS_MS) if it fails. */
async function withRetries<T>(f: () => Promise<T>, sleep: (ms: number) => Promise<void>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await f();
    } catch (err) {
      // Our own limits (too many lookups today, signed out) won't get better by waiting.
      const status = (err as { status?: number }).status;
      if (attempt >= RETRY_WAITS_MS.length || (status !== undefined && status !== 502 && status !== 0)) throw err;
      await sleep(RETRY_WAITS_MS[attempt]);
    }
  }
}

/**
 * Lookups through our server: the services see it, not this device. Street
 * names are asked for by area, like `npm run routes`, so a route built here
 * gets the same names. If they can't be looked up even after retries, the
 * route is built without them (`state.streetsMissing`).
 */
export function serverLookups(post: Post, opts: LookupOptions = {}): RouteLookups & { state: { streetsMissing: boolean } } {
  const onStep = opts.onStep ?? (() => {});
  const sleep = opts.sleep ?? wait;
  const state = { streetsMissing: false };
  return {
    state,
    async elevations(coords) {
      const out: (number | null)[] = [];
      for (let i = 0; i < coords.length; i += ELEVATION_BATCH) {
        onStep('elevation', i, coords.length);
        const batch = coords.slice(i, i + ELEVATION_BATCH);
        const body = await withRetries(() => post('/api/lookup/elevation', { points: batch }), sleep);
        out.push(...elevationsFromProfile(body, batch.length));
      }
      return out;
    },
    async streets(box, track) {
      onStep('streets');
      try {
        const body = await withRetries(async () => {
          const answer = await post('/api/lookup/streets', { box: streetsBox(box) });
          const failure = overpassFailure(answer);
          if (failure) throw Object.assign(new Error(failure), { status: 502 });
          return answer;
        }, sleep);
        return streetsFromOverpass(body, track);
      } catch {
        state.streetsMissing = true;
        return [];
      }
    },
  };
}

/** A short random local ID. */
const localId = () => `draft-${crypto.getRandomValues(new Uint32Array(2)).join('')}`;

/**
 * Cleans and builds a GPX into a draft. `name` is the route's name (also the
 * only name kept in the cleaned GPX). Throws with a message to show.
 */
export async function buildDraft(
  gpxText: string,
  name: string,
  post: Post,
  opts: LookupOptions & { now?: number } = {},
): Promise<Draft> {
  if (new TextEncoder().encode(gpxText).length > MAX_GPX_BYTES) throw new Error('This GPX is larger than 5 MB.');
  const onStep = opts.onStep ?? (() => {});
  onStep('cleaning');
  const cleaned = sanitizeGpx(gpxText, name);
  const id = localId();
  const lookups = serverLookups(post, opts);
  const built = await buildRoute({ id, name, gpx: cleaned.gpx }, lookups);
  onStep('turns');
  return {
    id,
    createdAt: opts.now ?? Date.now(),
    removed: cleaned.removed,
    gpx: cleaned.gpx,
    data: built.data,
    track: built.feature,
    outline: built.outline,
    review: built.analysis.review,
    startNote: built.analysis.startNote,
    streetsMissing: lookups.state.streetsMissing,
  };
}

/** What the server's save endpoint takes (server/routes.ts prepareUpload). */
export function uploadBody(draft: Draft): { data: Omit<RouteData, 'source'>; track: TrackFeature; gpx: string } {
  const { source: _source, ...data } = draft.data;
  return { data, track: draft.track, gpx: draft.gpx };
}
