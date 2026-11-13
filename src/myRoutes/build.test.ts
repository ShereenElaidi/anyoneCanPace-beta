// @vitest-environment node
import { describe, expect, it } from 'vitest';
import piDayGpx from '../../routes/onthegomap-4.7-km-route.gpx?raw';
import { prepareUpload } from '../../server/routes.ts';
import { elevationRequest, streetsQuery } from '../../server/lookups.ts';
import { buildDraft, RETRY_WAITS_MS, uploadBody, type Post } from './build';
import { memoryDraftStore } from './drafts';

const gpx = (_file: 'onthegomap-4.7-km-route.gpx') => piDayGpx;
const noWait = { sleep: async () => {} };

const startLine = [...piDayGpx.matchAll(/lat="([\d.-]+)" lon="([\d.-]+)"/g)].slice(0, 6).map((m) => ({ lat: +m[1], lon: +m[2] }));

/** Pretends to be our server: checks each lookup the way it would, answers like GeoGratis and Overpass. */
function fakeServer() {
  const calls: string[] = [];
  const post: Post = async (path, body) => {
    calls.push(path);
    if (path === '/api/lookup/elevation') {
      const points = (body as { points: [number, number][] }).points;
      expect(elevationRequest(points)).not.toBeNull();
      const n = points.length === 1 ? 2 : points.length;
      return Array.from({ length: n }, (_, i) => ({ altitude: 30 + (i % 7), vertex: true }));
    }
    if (path === '/api/lookup/streets') {
      const box = (body as { box: number[] }).box;
      expect(streetsQuery(box)).not.toBeNull();
      // One street along the start of Pi Day (Rue Clark, heading south from Sainte-Catherine).
      return { elements: [{ tags: { name: 'Rue Test' }, geometry: startLine }] };
    }
    throw new Error(`unexpected ${path}`);
  };
  return { post, calls };
}

describe('building a personal route on the device', () => {
  it('builds a GPX without elevation into a draft the server accepts as is', async () => {
    const server = fakeServer();
    const steps: string[] = [];
    const draft = await buildDraft(gpx('onthegomap-4.7-km-route.gpx'), 'My loop', server.post, { onStep: (s) => steps.push(s), now: 1 });
    expect(steps[0]).toBe('cleaning');
    expect(steps).toContain('elevation');
    expect(steps.at(-1)).toBe('turns');
    expect(draft.streetsMissing).toBe(false);
    expect(server.calls.filter((c) => c === '/api/lookup/streets')).toHaveLength(1);
    expect(server.calls.filter((c) => c === '/api/lookup/elevation').length).toBeGreaterThan(1); // batches of 100
    expect(draft.data).toMatchObject({ name: 'My loop', verification: { status: 'unverified' } });
    expect(draft.data.stats.distanceM).toBeGreaterThan(4000);
    expect(draft.data.startStreet).toBe('Rue Test');
    expect(draft.review.length).toBeGreaterThan(0);

    const checked = prepareUpload(uploadBody(draft), 'srv-id', '2026-11-12');
    expect(checked.ok ? [] : checked.errors).toEqual([]);
  });

  it('cleans the file on the device: times, heart rate and names never reach the draft', async () => {
    const raw = gpx('onthegomap-4.7-km-route.gpx')
      .replace('<trkseg>', '<trkseg><name>Morning run from 12 Home St</name>')
      .replace(/<trkpt([^>]*?)\/>/, '<trkpt$1><time>2026-11-12T10:00:00Z</time><extensions><hr>140</hr></extensions></trkpt>');
    const draft = await buildDraft(raw, 'Loop', fakeServer().post);
    expect(draft.gpx).not.toMatch(/Home St|<time>|<hr>|<extensions>/);
    expect(draft.removed.join(' ')).toMatch(/timestamp/);
  });

  it('uses the GPX’s own elevation when every point has it (no elevation lookups)', async () => {
    const server = fakeServer();
    const withEle = gpx('onthegomap-4.7-km-route.gpx').replace(/<trkpt([^>]*?)\/>/g, '<trkpt$1><ele>42</ele></trkpt>');
    await buildDraft(withEle, 'Loop', server.post);
    expect(server.calls).toEqual(['/api/lookup/streets']);
  });

  it('refuses files over 5 MB and files without a track', async () => {
    const { post } = fakeServer();
    await expect(buildDraft('x'.repeat(5 * 1024 * 1024 + 1), 'Big', post)).rejects.toThrow(/5 MB/);
    await expect(buildDraft('<gpx></gpx>', 'Empty', post)).rejects.toThrow(/no track/);
  });

  it('retries a busy lookup service, then builds without street names if it never answers', async () => {
    const server = fakeServer();
    let elevationFailures = 1;
    const waits: number[] = [];
    const post: Post = async (path, body) => {
      if (path === '/api/lookup/elevation' && elevationFailures-- > 0) throw Object.assign(new Error('busy'), { status: 502 });
      // Overpass answers 200 with a timeout remark: a failed lookup, not "no streets".
      if (path === '/api/lookup/streets') return { remark: 'runtime error: Query timed out', elements: [] };
      return server.post(path, body);
    };
    const draft = await buildDraft(gpx('onthegomap-4.7-km-route.gpx'), 'Loop', post, { sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([RETRY_WAITS_MS[0], ...RETRY_WAITS_MS]);
    expect(draft.streetsMissing).toBe(true);
    expect(draft.data.turns.every((t) => t.street === '')).toBe(true);
  });

  it('doesn’t retry our own limits', async () => {
    let calls = 0;
    const post: Post = async () => {
      calls++;
      throw Object.assign(new Error('too many'), { status: 429 });
    };
    await expect(buildDraft(gpx('onthegomap-4.7-km-route.gpx'), 'Loop', post, noWait)).rejects.toThrow('too many');
    expect(calls).toBe(1);
  });
});

describe('draft store (memory fallback)', () => {
  it('keeps drafts newest first and forgets them on clear', async () => {
    const store = memoryDraftStore();
    const base = await buildDraft(gpx('onthegomap-4.7-km-route.gpx'), 'A', fakeServer().post, { now: 1 });
    await store.put(base);
    await store.put({ ...base, id: 'draft-b', createdAt: 2 });
    expect((await store.list()).map((d) => d.id)).toEqual(['draft-b', base.id]);
    await store.remove('draft-b');
    expect((await store.get(base.id))?.data.name).toBe('A');
    await store.clear();
    expect(await store.list()).toEqual([]);
  });
});
