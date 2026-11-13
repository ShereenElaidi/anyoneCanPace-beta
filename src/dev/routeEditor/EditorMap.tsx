/**
 * The route editor's map: the route line, numbered turn markers, the build's
 * open suggestions, and where a click would add a turn. Uses the same
 * MapLibre style and street map file as the app's RouteMap, read straight from
 * the dev server (no offline copy). Dev only.
 */
import { useEffect, useRef, useState } from 'react';
import { addProtocol, Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FetchSource, PMTiles, Protocol } from 'pmtiles';
import type { LatLon } from '../../nav/geo';
import { pointAt, type PreparedRoute } from '../../nav/route';
import type { TrackFeature, Turn } from '../../nav/types';
import { BRAND, buildStyle } from '../../sixk/map/mapStyle';
import { mapUrl } from '../../sixk/map/offlineMap';
import { ROUTE_MAPS } from '../../sixk/map/routeTiles';
import { routeTilesBasemap } from '../../sixk/map/tilesProtocol';
import type { ClickOption } from './turnEdit';
import type { ReviewTurn } from './types';

setWorkerUrl(workerUrl);
let protocol: Protocol | null = null;

interface Props {
  track: TrackFeature;
  bbox: [number, number, number, number];
  route: PreparedRoute;
  turns: Turn[];
  selected: number | null;
  suggestions: ReviewTurn[];
  pending: ClickOption[];
  onSelect: (index: number) => void;
  onMapClick: (p: LatLon) => void;
}

function el(className: string, text: string, title: string): HTMLDivElement {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  div.title = title;
  return div;
}

export default function EditorMap({ track, bbox, route, turns, selected, suggestions, pending, onSelect, onMapClick }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState('');
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  // Rebuild the map only when the route's geometry changes, not when a save reloads the same route.
  const geometryKey = JSON.stringify(track.geometry.coordinates);
  const trackRef = useRef({ track, bbox });
  trackRef.current = { track, bbox };

  useEffect(() => {
    if (!box.current) return;
    const { track, bbox } = trackRef.current;
    if (!ROUTE_MAPS) {
      if (!protocol) {
        protocol = new Protocol();
        addProtocol('pmtiles', protocol.tile);
      }
      protocol.add(new PMTiles(new FetchSource(mapUrl())));
    }
    const glyphs = `${location.origin}${import.meta.env.BASE_URL}maps/fonts/{fontstack}/{range}.pbf`;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: box.current,
        style: buildStyle(ROUTE_MAPS ? routeTilesBasemap() : `pmtiles://${mapUrl()}`, glyphs),
        bounds: bbox,
        fitBoundsOptions: { padding: 30 },
        maxZoom: 19,
        dragRotate: false,
        attributionControl: { compact: true },
      });
    } catch (err) {
      setFailed(err instanceof Error ? err.message : String(err));
      return;
    }
    mapRef.current = map;
    map.on('load', () => {
      map.addSource('route', { type: 'geojson', data: track });
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': BRAND.paper, 'line-width': 9 },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': BRAND.navy, 'line-width': 5 },
      });
      const coords = track.geometry.coordinates;
      new Marker({ element: el('re-pin re-pin--start', 'START', 'Start') }).setLngLat(coords[0]).addTo(map);
      setReady(true);
    });
    map.on('click', (e) => clickRef.current({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
    map.on('error', (e) => console.warn('Editor map', e.error?.message));
    return () => {
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [geometryKey]);

  // Turn markers, suggestions and pending click points.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    const add = (div: HTMLElement, atM: number) => {
      const p = pointAt(route, atM);
      markers.current.push(new Marker({ element: div }).setLngLat([p.lon, p.lat]).addTo(map));
    };
    for (const s of suggestions) {
      add(el('re-pin re-pin--suggestion', '?', `Build suggestion at ${(s.atM / 1000).toFixed(2)} km: ${s.dir}. ${s.reason}`), s.atM);
    }
    turns.forEach((t, i) => {
      const div = el(`re-pin re-pin--turn${i === selected ? ' is-selected' : ''}`, String(i + 1), `Turn ${i + 1}: ${t.dir} ${t.street}`);
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        selectRef.current(i);
      });
      add(div, t.atM);
    });
    for (const p of pending) add(el('re-pin re-pin--pending', '+', `New turn at ${(p.atM / 1000).toFixed(2)} km`), p.atM);
  }, [ready, route, turns, selected, suggestions, pending]);

  // Bring the selected turn into view.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || selected === null || !turns[selected]) return;
    const p = pointAt(route, turns[selected].atM);
    map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 16.5), duration: 400 });
    // Only when the selection changes, not on every edit of the selected turn.
  }, [ready, selected]);

  if (failed) return <p className="re-problem">The map didn’t load ({failed}). You can still edit the turns below.</p>;
  return <div ref={box} className="re-map" role="region" aria-label="Map of the route: click the route to add a turn" />;
}
