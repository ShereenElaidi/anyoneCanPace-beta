/**
 * Lets MapLibre read per-route map tiles (routeTiles.ts): saved copy first,
 * then our server. Imported only by the map components, which load MapLibre
 * anyway.
 */
import { addProtocol } from 'maplibre-gl';
import { MAX_SAVED_ZOOM, readTile } from './routeTiles';

let added = false;

/** The basemap for buildStyle() in per-route-map builds. */
export function routeTilesBasemap(): { tiles: string; maxzoom: number } {
  if (!added) {
    addProtocol('acptiles', async (params, abort) => {
      const m = /^acptiles:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
      if (!m) throw new Error('Not a map tile');
      const data = await readTile(Number(m[1]), Number(m[2]), Number(m[3]), abort.signal);
      // No tile here (water, outside the map): an empty tile, which MapLibre draws as nothing.
      return { data: data ? new Uint8Array(data) : new Uint8Array() };
    });
    added = true;
  }
  return { tiles: 'acptiles://{z}/{x}/{y}', maxzoom: MAX_SAVED_ZOOM };
}
