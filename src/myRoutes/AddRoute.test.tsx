import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import piDayGpx from '../../routes/onthegomap-4.7-km-route.gpx?raw';
import AddRoute from './AddRoute';
import { trimPoints } from './build';
import { draftStore } from './drafts';

// The map needs WebGL; the turn list around it is what's tested here.
vi.mock('../dev/routeEditor/EditorMap', () => ({ default: () => <div>map</div> }));

const startLine = [...piDayGpx.matchAll(/lat="([\d.-]+)" lon="([\d.-]+)"/g)].slice(0, 6).map((m) => ({ lat: +m[1], lon: +m[2] }));

function mockServer() {
  const saved: Record<string, any>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
      if (path === '/api/lookup/elevation') {
        const n = body.points.length === 1 ? 2 : body.points.length;
        return json(Array.from({ length: n }, (_, i) => ({ altitude: 30 + (i % 5), vertex: true })));
      }
      if (path === '/api/lookup/streets') return json({ elements: [{ tags: { name: 'Rue Clark' }, geometry: startLine }] });
      if (path === '/api/me/routes' && init?.method === 'POST') {
        saved.push(body);
        return json({ route: { id: 'srv1', name: body.data.name, stats: body.data.stats } }, 201);
      }
      return json({}, 404);
    }),
  );
  return saved;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await draftStore().clear();
});

describe('adding a route', () => {
  it('cleans and builds a GPX on the device, checks turns, and saves it with its details', async () => {
    const saved = mockServer();
    const done = vi.fn();
    render(<AddRoute onDone={done} />);

    // A recorded run with a timestamp and the runner's own name in it.
    const raw = piDayGpx.replace('<trkseg>', '<trkseg><name>Run from 12 Home St</name>').replace(/<trkpt([^>]*?)\/>/g, '<trkpt$1><time>2026-11-12T10:00:00Z</time></trkpt>');
    const file = new File([raw], 'Pi_Day-loop.gpx', { type: 'application/gpx+xml' });
    fireEvent.change(screen.getByLabelText('GPX file'), { target: { files: [file] } });
    expect((screen.getByLabelText('Route name') as HTMLInputElement).value).toBe('Pi Day loop');
    fireEvent.change(screen.getByLabelText('Trim from the start'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'BUILD THE ROUTE' }));

    expect(await screen.findByText(/turns found/, {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText(/Removed from the file before anything was sent: .*timestamps/)).toBeTruthy();
    expect(screen.getByText(/Trimmed 100 m from the start/)).toBeTruthy();
    expect(screen.getByText(/GPS wobble/)).toBeTruthy(); // recorded run: check every turn closely
    expect(((await draftStore().list())[0]?.data.name)).toBe('Pi Day loop');

    fireEvent.click(screen.getByRole('button', { name: 'NEXT: NAME AND DETAILS' }));
    fireEvent.change(screen.getByLabelText('Where (optional)'), { target: { value: '  Quartier latin ' } });
    fireEvent.change(screen.getByLabelText('Notes (optional, one per line)'), { target: { value: 'Fountain at km 3\n\n' } });
    fireEvent.click(screen.getByLabelText('Waterfront'));
    expect(screen.queryByLabelText('Testing')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'SAVE TO MY ROUTES' }));

    expect(await screen.findByText(/is in your routes/)).toBeTruthy();
    const body = saved[0];
    expect(body.gpx).not.toMatch(/<time>|Home St/);
    expect(body.data).toMatchObject({ name: 'Pi Day loop', place: 'Quartier latin', notes: ['Fountain at km 3'], tags: ['waterfront'] });
    expect(body.data.turns.length).toBeGreaterThan(0);
    expect(await draftStore().list()).toEqual([]); // saved: no longer a draft
    fireEvent.click(screen.getByRole('button', { name: 'DONE' }));
    expect(done).toHaveBeenCalled();
  });

  it('shows the server’s reasons when a save is refused, and keeps the draft', async () => {
    mockServer();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === '/api/me/routes' && init?.method === 'POST') {
          return new Response(JSON.stringify({ error: 'route-limit', message: 'You can keep up to 25 personal routes.' }), { status: 409 });
        }
        return new Response('{}', { status: 404 });
      }),
    );
    const store = draftStore();
    const { buildDraft } = await import('./build');
    const draft = await buildDraft(piDayGpx, 'Pi', async (path, body) => {
      const b = body as { points?: unknown[] };
      return path.endsWith('elevation')
        ? Array.from({ length: b.points!.length === 1 ? 2 : b.points!.length }, () => ({ altitude: 30, vertex: true }))
        : { elements: [] };
    });
    await store.put(draft);
    render(<AddRoute draft={draft} onDone={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'NEXT: NAME AND DETAILS' }));
    fireEvent.click(screen.getByRole('button', { name: 'SAVE TO MY ROUTES' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/25 personal routes/);
    await waitFor(async () => expect((await store.list()).map((d) => d.id)).toEqual([draft.id]));
  });
});

describe('trimming', () => {
  const line = Array.from({ length: 101 }, (_, i) => ({ lat: 45.5 + i * 0.0001, lon: -73.6 })); // ~11 m apart, ~1.1 km

  it('drops whole points from the start and the end', () => {
    const t = trimPoints(line, 100, 200);
    expect(t[0].lat).toBeGreaterThan(line[8].lat);
    expect(t.at(-1)!.lat).toBeLessThan(line[83].lat);
  });

  it('refuses to trim away almost the whole route', () => {
    expect(() => trimPoints(line, 500, 500)).toThrow(/Trim less/);
  });
});
