// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileBucket } from './dev/fileBucket.ts';
import { parseTilePath, serveTile } from './mapTiles.ts';
import { handle } from './handler.ts';
import type { Env } from './types.ts';

const MAP = join(import.meta.dirname, '..', 'public', 'maps', 'montreal.pmtiles');
const bucket = fileBucket(MAP);
// Quartier latin (Pi Day) at zoom 14.
const DOWNTOWN = '/api/map/tiles/14/4843/5861';

describe('map tiles', () => {
  it('reads a tile out of the map file', async () => {
    const res = await serveTile(new Request(`https://pace.example${DOWNTOWN}?v=1`), bucket, 'quebec.pmtiles');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/x-protobuf');
    expect(res.headers.get('cache-control')).toMatch(/immutable/);
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });

  it('answers 204 where the map has no tile, and 404 for anything that isn’t a tile', async () => {
    expect((await serveTile(new Request('https://pace.example/api/map/tiles/14/0/0'), bucket, 'k')).status).toBe(204);
    expect(parseTilePath('/api/map/tiles/16/1/1')).toBeNull(); // beyond the cut's zoom
    expect(parseTilePath('/api/map/tiles/3/9/1')).toBeNull(); // x outside zoom 3
    expect(parseTilePath('/api/map/tiles/14/x/1')).toBeNull();
    expect(parseTilePath(DOWNTOWN)).toEqual([14, 4843, 5861]);
  });

  it('uses the edge cache: a second request doesn’t read the file', async () => {
    const stored = new Map<string, Response>();
    let reads = 0;
    const counting = { get: (k: string, o?: { range?: { offset: number; length: number } }) => (reads++, bucket.get(k, o)) };
    const edge = { match: async (r: Request) => stored.get(r.url)?.clone(), put: async (r: Request, res: Response) => void stored.set(r.url, res) };
    const url = `https://pace.example${DOWNTOWN}?v=edge-test`;
    await serveTile(new Request(url), counting, 'edge-test.pmtiles', edge);
    const before = reads;
    expect((await serveTile(new Request(url), counting, 'edge-test.pmtiles', edge)).status).toBe(200);
    expect(reads).toBe(before);
  });

  it('is open without an account, and says so when no map is set up', async () => {
    const base = { RECOVERY_PEPPER: 'p', AUTH0_DOMAIN: 'd' } as unknown as Env;
    const ok = await handle(new Request(`https://pace.example${DOWNTOWN}`), { ...base, MAPS: bucket });
    expect(ok.status).toBe(200);
    expect((await handle(new Request(`https://pace.example${DOWNTOWN}`), base)).status).toBe(503);
  });
});
