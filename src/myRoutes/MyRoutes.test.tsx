import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import piDayData from '../data/routes/pi-day.json';
import piDayTrack from '../data/routes/pi-day.geojson?raw';
import SixKMode from '../sixk/SixKMode';
import { clearMyRoutesCopies, loadMyRoute, loadMyRoutesList } from './load';

// MapLibre needs WebGL, which jsdom doesn't have.
vi.mock('../sixk/map/RouteMap', () => ({ default: (p: { label: string }) => <div data-testid="route-map" aria-label={p.label} /> }));

const myRoute = { ...piDayData, id: 'mine1', name: 'My Pi loop', track: 'mine1.geojson', verification: { status: 'unverified' } };
const myTrack = { ...JSON.parse(piDayTrack), properties: { ...JSON.parse(piDayTrack).properties, id: 'mine1' } };
const summary = { id: 'mine1', name: 'My Pi loop', kind: 'loop', stats: piDayData.stats, outline: 'M10 10L90 90', verification: 'unverified', updatedAt: 1 };

/** A tiny Cache Storage, as the browser has. */
function fakeCaches() {
  const stores = new Map<string, Map<string, string>>();
  return {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const s = stores.get(name)!;
      return {
        put: async (key: string, res: Response) => void s.set(key, await res.text()),
        match: async (key: string) => (s.has(key) ? new Response(s.get(key)) : undefined),
        delete: async (key: string) => s.delete(key),
      };
    },
    delete: async (name: string) => stores.delete(name),
    stores,
  };
}

let online = true;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  online = true;
  vi.stubGlobal('caches', fakeCaches());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      if (!online) throw new TypeError('Failed to fetch');
      if (path === '/api/me') return json({ state: 'ready', user: { username: 'sam', displayName: 'Sam', role: 'runner', isAdmin: false }, needsRecoveryCode: false });
      if (path === '/api/me/routes') return json({ routes: [summary] });
      if (path === '/api/me/routes/mine1') return json({ data: myRoute, track: myTrack });
      return json({ error: 'not-found' }, 404);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('My routes in the Route Library', () => {
  it('lists the signed-in person’s routes; their page has no share link and the address never names them', async () => {
    render(<SixKMode onSwitchMode={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'My routes (1)' }));
    expect(screen.getByText('Only you can see these.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /My Pi loop/ }));

    expect(await screen.findByText('Your route: only you can see it.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'My Pi loop' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Share route' })).toBeNull();
    expect(location.search).not.toContain('route=');
    expect(screen.getByRole('button', { name: /START ROUTE/ })).toBeTruthy();
  });

  it('shows no My routes tab when nobody is signed in', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ state: 'signed-out' })));
    render(<SixKMode onSwitchMode={() => {}} />);
    expect(await screen.findByText('Where are we running today?')).toBeTruthy();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('button', { name: /My routes/ })).toBeNull();
  });
});

describe('personal routes offline', () => {
  it('uses the copy on this device for a route opened before, and says when it has none', async () => {
    await loadMyRoutesList();
    await loadMyRoute('mine1');
    online = false;
    const list = await loadMyRoutesList();
    expect(list).toEqual({ routes: [summary], offline: true });
    expect((await loadMyRoute('mine1')).data.name).toBe('My Pi loop');
    await expect(loadMyRoute('never-opened')).rejects.toThrow(/offline/);
  });

  it('forgets a route the server no longer has, and every copy on sign-out', async () => {
    await loadMyRoute('mine1');
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'not-found' }, 404)));
    await expect(loadMyRoute('mine1')).rejects.toThrow(/isn’t in your routes/);
    online = false;
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    await expect(loadMyRoute('mine1')).rejects.toThrow(/offline/);

    await clearMyRoutesCopies();
    expect((caches as unknown as ReturnType<typeof fakeCaches>).stores.size).toBe(0);
  });
});
