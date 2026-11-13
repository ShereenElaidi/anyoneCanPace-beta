import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearRouteMaps, grow, insideMapArea, readTile, saveRouteMap, tilesFor, tileUrl, TILES_VERSION } from './routeTiles';

const PI_DAY_BBOX: [number, number, number, number] = [-73.5713, 45.5088, -73.5554, 45.5183];

function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  return {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const s = stores.get(name)!;
      return {
        put: async (key: string, res: Response) => void s.set(key, res),
        match: async (key: string) => s.get(key)?.clone(),
      };
    },
    delete: async (name: string) => stores.delete(name),
    stores,
  };
}

let fetched: string[];
beforeEach(() => {
  fetched = [];
  vi.stubGlobal('caches', fakeCaches());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      fetched.push(url);
      // Pretend the corner tiles are open water (no tile).
      return url.includes('/10/') ? new Response(null, { status: 204 }) : new Response(new Uint8Array([1, 2, 3]));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('per-route offline maps', () => {
  it('covers the route plus a margin, zoom 10 to 15, and nothing about where the person is', () => {
    const tiles = tilesFor(grow(PI_DAY_BBOX, 1100));
    expect(new Set(tiles.map(([z]) => z))).toEqual(new Set([10, 11, 12, 13, 14, 15]));
    expect(tiles.length).toBeGreaterThan(20);
    expect(tiles.length).toBeLessThan(120); // a 4.6 km route: a few MB, not the whole map
    expect(tiles).toContainEqual([14, 4843, 5861]);
  });

  it('knows which routes the Montréal–Québec City map covers', () => {
    expect(insideMapArea(PI_DAY_BBOX)).toBe(true);
    expect(insideMapArea([-79.4, 43.6, -79.3, 43.7])).toBe(false); // Toronto
  });

  it('saves a route’s tiles once, then reads them without the network', async () => {
    const onProgress = vi.fn();
    const meta = await saveRouteMap('pi-day', PI_DAY_BBOX, onProgress);
    expect(onProgress).toHaveBeenLastCalledWith(1);
    expect(fetched.every((u) => u.startsWith('/api/map/tiles/') && u.endsWith(`?v=${TILES_VERSION}`))).toBe(true);
    expect(fetched).toHaveLength(meta.tiles);

    const before = fetched.length;
    await saveRouteMap('pi-day', PI_DAY_BBOX); // already saved: nothing fetched again
    expect(fetched).toHaveLength(before);
    const tile = tilesFor(grow(PI_DAY_BBOX, 1100)).find(([z]) => z === 14)!;
    expect(new Uint8Array((await readTile(...tile))!)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await readTile(...tilesFor(grow(PI_DAY_BBOX, 1100)).find(([z]) => z === 10)!)).toBeNull(); // saved "no tile"
    expect(fetched).toHaveLength(before);
    expect(tileUrl(14, 1, 2)).toBe(`/api/map/tiles/14/1/2?v=${TILES_VERSION}`);
  });

  it('deletes every saved tile on sign-out', async () => {
    await saveRouteMap('pi-day', PI_DAY_BBOX);
    localStorage.setItem('unrelated', 'kept');
    await clearRouteMaps();
    expect((caches as unknown as ReturnType<typeof fakeCaches>).stores.size).toBe(0);
    expect(Object.keys(localStorage).filter((k) => k.includes('route-map'))).toEqual([]);
    expect(localStorage.getItem('unrelated')).toBe('kept');
  });

  it('says so when the map isn’t set up on this server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    await expect(saveRouteMap('pi-day', PI_DAY_BBOX)).rejects.toThrow(/isn’t available/);
  });
});
