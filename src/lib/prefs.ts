import { clampSeconds, DEFAULT_DURATIONS, type Durations } from '../timer/engine';

export interface Prefs extends Durations {
  sound: boolean;
  vibration: boolean;
  /** Loud, alarm-like beeps (see `setLoudCues`). */
  loud: boolean;
}

export const DEFAULT_PREFS: Prefs = { ...DEFAULT_DURATIONS, sound: true, vibration: true, loud: true };

const KEY = 'anyonecanpace:prefs:v1';

/** Reads saved preferences, falling back to defaults for anything missing or invalid. */
export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const saved = JSON.parse(raw) as Partial<Record<keyof Prefs, unknown>>;
    return {
      run: typeof saved.run === 'number' ? clampSeconds(saved.run) : DEFAULT_PREFS.run,
      walk: typeof saved.walk === 'number' ? clampSeconds(saved.walk) : DEFAULT_PREFS.walk,
      sound: typeof saved.sound === 'boolean' ? saved.sound : DEFAULT_PREFS.sound,
      vibration: typeof saved.vibration === 'boolean' ? saved.vibration : DEFAULT_PREFS.vibration,
      loud: typeof saved.loud === 'boolean' ? saved.loud : DEFAULT_PREFS.loud,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Private browsing or storage full: the app keeps working for this visit.
  }
}

// ---------- App mode ----------

/** The modes on the picker. The app always opens on the picker; no mode is remembered. */
export type AppMode = 'timer' | 'sixk' | 'dashboard' | 'account';

// ---------- Route Library pace ----------

const PACE_KEY = 'anyonecanpace:route-pace:v1';

/**
 * The pace (seconds per km) the Route Library uses for time estimates, or null
 * if none is saved. Validated with the caller's `clamp`. The library's filter is
 * deliberately not saved: next visit always shows every route.
 */
export function loadRoutePace(clamp: (s: number) => number): number | null {
  try {
    const n = Number(localStorage.getItem(PACE_KEY));
    return Number.isFinite(n) && n > 0 ? clamp(n) : null;
  } catch {
    return null;
  }
}

export function saveRoutePace(secondsPerKm: number): void {
  try {
    localStorage.setItem(PACE_KEY, String(secondsPerKm));
  } catch {
    // Storage blocked: the pace still applies for this visit.
  }
}

// ---------- Route Library sort ----------

const SORT_KEY = 'anyonecanpace:route-sort:v1';

/** The Route Library's saved sort order, if it's one the caller knows; else null. */
export function loadRouteSort<T extends string>(isValid: (v: unknown) => v is T): T | null {
  try {
    const v = localStorage.getItem(SORT_KEY);
    return isValid(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveRouteSort(sort: string): void {
  try {
    localStorage.setItem(SORT_KEY, sort);
  } catch {
    // Storage blocked: the order still applies for this visit.
  }
}
