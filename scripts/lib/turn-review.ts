/**
 * Keeping turn positions honest when a route's geometry changes. Pure.
 *
 * A turn's `atM` is a distance along one particular track. If the GPX changes
 * (a new detour, a redrawn corner), those distances silently point at the wrong
 * places. So the build fingerprints the processed track and:
 * - unchanged geometry: hand-edited turns are kept as they are;
 * - changed geometry: the build stops ('stale') until turns are regenerated
 *   with --reset-turns;
 * - regenerated: fresh suggestions, with street-name and note edits carried
 *   over from old turns at the same place (by position, not distance), and
 *   old turns that matched nothing listed for review.
 */
import type { Turn } from '../../src/nav/types.ts';

type Coord = [number, number]; // [lon, lat]

/** Old and new turns closer than this (metres, on the ground) are the same turn. */
export const CARRY_RADIUS_M = 25;

/**
 * First 16 hex characters of the SHA-256 of the coordinates' JSON. Web Crypto,
 * so the same code runs in Node (npm run routes) and on the device.
 */
export async function geometryFingerprint(coords: Coord[]): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(coords)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
function metres(a: Coord, b: Coord): number {
  const x = toRad(b[0] - a[0]) * Math.cos(toRad((a[1] + b[1]) / 2));
  const y = toRad(b[1] - a[1]);
  return Math.hypot(x, y) * R;
}

/** The point `atM` metres along a [lon, lat] line. */
export function positionAt(coords: Coord[], atM: number): Coord {
  let run = 0;
  for (let i = 1; i < coords.length; i++) {
    const seg = metres(coords[i - 1], coords[i]);
    if (run + seg >= atM && seg > 0) {
      const t = (atM - run) / seg;
      return [coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]), coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1])];
    }
    run += seg;
  }
  return coords[coords.length - 1];
}

export interface TurnDecision {
  outcome: 'proposed' | 'kept' | 'regenerated' | 'stale';
  turns: Turn[];
  geometryChanged: boolean;
  fingerprint: string;
  /** Old turns whose street or note was carried onto a regenerated turn. */
  carried: number;
  /** Old turns with a street or note that matched no regenerated turn (to check by hand). */
  dropped: Turn[];
}

export async function decideTurns(o: {
  existingTurns: Turn[] | null;
  /** Fingerprint saved with the existing route, if any. */
  existingFingerprint?: string;
  /** The previously processed track, if any. */
  oldCoords: Coord[] | null;
  newCoords: Coord[];
  proposed: Turn[];
  reset: boolean;
}): Promise<TurnDecision> {
  const fingerprint = await geometryFingerprint(o.newCoords);
  const before = o.existingFingerprint ?? (o.oldCoords ? await geometryFingerprint(o.oldCoords) : null);
  const geometryChanged = before !== null && before !== fingerprint;
  const base = { fingerprint, geometryChanged, carried: 0, dropped: [] as Turn[] };

  if (!o.existingTurns) return { ...base, outcome: 'proposed', turns: o.proposed };
  if (!o.reset) {
    // No record of the old geometry at all: can't prove the distances still fit.
    if (geometryChanged || before === null) return { ...base, outcome: 'stale', turns: o.existingTurns };
    return { ...base, outcome: 'kept', turns: o.existingTurns };
  }

  // Regenerate, carrying editorial content across by position on the ground.
  const oldCoords = o.oldCoords;
  const used = new Set<number>();
  let carried = 0;
  const turns = o.proposed.map((p) => {
    if (!oldCoords) return p;
    const here = positionAt(o.newCoords, p.atM);
    let best = -1;
    let bestD = Infinity;
    o.existingTurns!.forEach((t, i) => {
      if (used.has(i)) return;
      const d = metres(here, positionAt(oldCoords, t.atM));
      if (d <= CARRY_RADIUS_M && d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best === -1) return p;
    used.add(best);
    const old = o.existingTurns![best];
    const out: Turn = { ...p };
    if (old.street && old.street !== p.street) out.street = old.street;
    if (old.note) out.note = old.note;
    if (out.street !== p.street || out.note) carried++;
    return out;
  });
  const dropped = o.existingTurns.filter((t, i) => !used.has(i) && (t.note || t.street));
  return { ...base, outcome: 'regenerated', turns, carried, dropped };
}
