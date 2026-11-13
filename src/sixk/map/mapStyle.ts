/**
 * A small brand-coloured MapLibre style for the Protomaps basemap schema:
 * Pavement land, Track Blue water, Asphalt roads (softened so the route
 * stands out), road names from self-hosted glyphs. No sprites are needed:
 * markers are HTML elements and icons are inline SVG.
 */
import type { StyleSpecification } from 'maplibre-gl';

export const BRAND = {
  navy: '#1B3F72',
  blue: '#378ADD',
  gold: '#EF9F27',
  pavement: '#F5F0E8',
  asphalt: '#2C2C2A',
  paper: '#FFFDF8',
};

export const BASEMAP_SOURCE = 'basemap';
export const GLYPH_FONT = 'Noto Sans Medium';

/** Width that grows with zoom: [zoom, px] pairs. */
const width = (...stops: number[]) => ['interpolate', ['exponential', 1.6], ['zoom'], ...stops];

/**
 * `basemap`: a PMTiles URL (`pmtiles://…`, the one-file map), or a tile URL
 * template with its highest zoom (per-route maps, src/sixk/map/routeTiles.ts).
 */
export function buildStyle(basemap: string | { tiles: string; maxzoom: number }, glyphsUrl: string): StyleSpecification {
  const roads = (kinds: string[]) => ['in', ['get', 'kind'], ['literal', kinds]];
  return {
    version: 8,
    glyphs: glyphsUrl,
    sources: {
      [BASEMAP_SOURCE]: {
        type: 'vector',
        ...(typeof basemap === 'string' ? { url: basemap } : { tiles: [basemap.tiles], maxzoom: basemap.maxzoom }),
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · <a href="https://protomaps.com">Protomaps</a>',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': BRAND.pavement } },
      {
        id: 'parks',
        type: 'fill',
        source: BASEMAP_SOURCE,
        'source-layer': 'landuse',
        filter: ['in', ['get', 'kind'], ['literal', ['park', 'grass', 'garden', 'forest', 'wood', 'cemetery', 'golf_course', 'playground', 'pitch', 'nature_reserve', 'meadow']]],
        paint: { 'fill-color': '#DCE5CC' },
      },
      {
        id: 'water',
        type: 'fill',
        source: BASEMAP_SOURCE,
        'source-layer': 'water',
        paint: { 'fill-color': BRAND.blue, 'fill-opacity': 0.55 },
      },
      {
        id: 'buildings',
        type: 'fill',
        source: BASEMAP_SOURCE,
        'source-layer': 'buildings',
        minzoom: 14,
        paint: { 'fill-color': '#E6DDCF', 'fill-outline-color': '#D8CDBC' },
      },
      {
        id: 'paths',
        type: 'line',
        source: BASEMAP_SOURCE,
        'source-layer': 'roads',
        filter: roads(['path']),
        minzoom: 14,
        paint: { 'line-color': BRAND.asphalt, 'line-opacity': 0.35, 'line-width': width(14, 0.8, 18, 2), 'line-dasharray': [2, 1.5] },
      },
      {
        id: 'minor-roads',
        type: 'line',
        source: BASEMAP_SOURCE,
        'source-layer': 'roads',
        filter: roads(['minor_road', 'other']),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#BDB8AF', 'line-width': width(12, 0.6, 15, 3, 18, 12) },
      },
      {
        id: 'major-roads',
        type: 'line',
        source: BASEMAP_SOURCE,
        'source-layer': 'roads',
        filter: roads(['major_road', 'medium_road', 'highway']),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#9B968E', 'line-width': width(10, 0.8, 15, 5, 18, 18) },
      },
      {
        id: 'rail',
        type: 'line',
        source: BASEMAP_SOURCE,
        'source-layer': 'roads',
        filter: roads(['rail']),
        paint: { 'line-color': BRAND.asphalt, 'line-opacity': 0.4, 'line-width': 1, 'line-dasharray': [3, 2] },
      },
      {
        id: 'road-labels',
        type: 'symbol',
        source: BASEMAP_SOURCE,
        'source-layer': 'roads',
        minzoom: 14,
        filter: ['has', 'name'],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-font': [GLYPH_FONT],
          'text-size': ['interpolate', ['linear'], ['zoom'], 14, 11, 18, 15],
          'text-max-angle': 30,
          'symbol-spacing': 300,
        },
        paint: { 'text-color': BRAND.asphalt, 'text-halo-color': BRAND.pavement, 'text-halo-width': 2 },
      },
    ],
  } as StyleSpecification;
}
