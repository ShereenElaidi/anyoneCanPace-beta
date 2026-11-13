/**
 * The street map (MapLibre GL + PMTiles). This module and its libraries load
 * only when a 6K map is shown; the timer never downloads them.
 */
import { useEffect, useRef, useState } from 'react';
import {
  addProtocol,
  Map as MapLibreMap,
  Marker,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FetchSource, PMTiles, Protocol, type RangeResponse, type Source } from 'pmtiles';
import { boundsCentredOn, FOLLOW_MAX_ZOOM, offRouteZoom } from './camera';
import duckImg from '../../assets/duck-runner.webp';
import lostDuckImg from '../../assets/duck-runner-lost.webp';
import { offsetPoint } from '../../nav/geo';
import type { TrackFeature } from '../../nav/types';
import { classifyMapError } from './mapErrors';
import { BRAND, buildStyle } from './mapStyle';
import { mapUrl, readSavedMap } from './offlineMap';
import { ROUTE_MAPS } from './routeTiles';
import { routeTilesBasemap } from './tilesProtocol';

setWorkerUrl(workerUrl);

let protocol: Protocol | null = null;

/** Reads byte ranges from the copy of the map saved in Cache Storage. */
class BlobSource implements Source {
  private readonly blob: Blob;
  private readonly key: string;
  constructor(blob: Blob, key: string) {
    this.blob = blob;
    this.key = key;
  }
  getKey() {
    return this.key;
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    return { data: await this.blob.slice(offset, offset + length).arrayBuffer() };
  }
}

async function basemapUrl(): Promise<{ url: string | { tiles: string; maxzoom: number }; offline: boolean }> {
  // Per-route maps: tiles from the route's saved area, else the server (the route page shows the saved state).
  if (ROUTE_MAPS) return { url: routeTilesBasemap(), offline: true };
  if (!protocol) {
    protocol = new Protocol();
    addProtocol('pmtiles', protocol.tile);
  }
  const key = mapUrl();
  const saved = await readSavedMap();
  protocol.add(new PMTiles(saved ? new BlobSource(saved, key) : new FetchSource(key)));
  return { url: `pmtiles://${key}`, offline: !!saved };
}

type Coord = [number, number];
type GeoData = Parameters<GeoJSONSource['setData']>[0];

export interface DuckMarker {
  lon: number;
  lat: number;
  facingLeft: boolean;
  /** Off route: the confused duck with a "?" badge. */
  lost: boolean;
  /** Your place on the route (current progress). Off route, the camera keeps it in view next to the duck. */
  routePoint?: { lon: number; lat: number };
}

export interface RouteMapProps {
  track: TrackFeature;
  bbox: [number, number, number, number];
  /** Accessible name for the map region. */
  label: string;
  /** Keep the camera on the duck. */
  follow?: boolean;
  covered?: Coord[];
  remaining?: Coord[];
  duck?: DuckMarker | null;
  fix?: { lon: number; lat: number; accuracyM: number } | null;
}

const EMPTY: GeoData = { type: 'FeatureCollection', features: [] };
const lineFeature = (coords: Coord[]): GeoData => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: coords },
});

function accuracyCircle(lon: number, lat: number, radius: number): GeoData {
  const ring = Array.from({ length: 33 }, (_, i) => {
    const p = offsetPoint({ lat, lon }, (i % 32) * (360 / 32), radius);
    return [p.lon, p.lat];
  });
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function makeEl(className: string, html: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = html;
  return el;
}

export default function RouteMap(props: RouteMapProps) {
  const { track, bbox, label, follow, covered, remaining, duck, fix } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const duckRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<'device' | 'broken' | null>(null);
  /** Some tiles didn't load (offline or flaky network): the map still works with what it has. */
  const [tileTrouble, setTileTrouble] = useState(false);
  /** Bumped by "try again" to rebuild the map from scratch. */
  const [attempt, setAttempt] = useState(0);
  const [offline, setOffline] = useState<boolean | null>(null);
  const [userMoved, setUserMoved] = useState(false);
  const centredOnce = useRef(false);
  /** The pacer pinched or scrolled the zoom: keep their zoom (the camera still follows) until BACK TO DUCK. */
  const userZoomed = useRef(false);
  const wasLost = useRef(false);

  // Create the map once.
  useEffect(() => {
    let disposed = false;
    let map: MapLibreMap | null = null;
    (async () => {
      try {
        const base = await basemapUrl();
        if (disposed || !containerRef.current) return;
        setOffline(base.offline);
        const glyphs = `${location.origin}${import.meta.env.BASE_URL}maps/fonts/{fontstack}/{range}.pbf`;
        const m = new MapLibreMap({
          container: containerRef.current,
          style: buildStyle(base.url, glyphs),
          bounds: bbox,
          fitBoundsOptions: { padding: 28 },
          minZoom: 11,
          maxZoom: 18,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          attributionControl: { compact: true },
        });
        map = m;
        m.touchZoomRotate.disableRotation();
        mapRef.current = m;
        m.on('dragstart', () => setUserMoved(true));
        // Only real gestures (pinch, wheel, double tap) carry an originalEvent; the camera's own
        // moves don't. Every zoom step, not zoomstart: that one is skipped when a gesture begins
        // during the camera's own easeTo, which runs on every GPS fix.
        m.on('zoom', (e) => {
          if (e.originalEvent) userZoomed.current = true;
        });
        let loaded = false;
        m.on('error', (e) => {
          const kind = classifyMapError(e as Parameters<typeof classifyMapError>[0], loaded);
          console.warn('Map error', kind, e.error?.message);
          if (disposed) return;
          if (kind === 'tile') setTileTrouble(true);
          else if (kind === 'fatal') setFailed('broken');
        });
        // The phone can drop the map's graphics context (memory pressure, backgrounding).
        m.getCanvas().addEventListener('webglcontextlost', () => !disposed && setFailed('broken'));
        m.on('load', () => {
          loaded = true;
          if (disposed) return;
          // The container may have settled its size after creation: fit the route again.
          m.resize();
          if (!follow) m.fitBounds(bbox, { padding: 28, duration: 0 });
          addRouteLayers(m, track);
          const coords = track.geometry.coordinates;
          new Marker({ element: makeEl('map-pin map-pin--start', '<span>START</span>') })
            .setLngLat(coords[0])
            .addTo(m);
          duckRef.current = new Marker({
            // Both drawings are in the marker from the start, so going off route swaps instantly (and offline).
            element: makeEl(
              'map-duck',
              `<img class="map-duck__img" src="${duckImg}" alt="" draggable="false">` +
                `<img class="map-duck__img map-duck__img--lost" src="${lostDuckImg}" alt="" draggable="false">` +
                '<span class="map-duck__lost">?</span>',
            ),
          });
          setReady(true);
        });
      } catch (err) {
        console.warn('Map unavailable', err);
        if (!disposed) setFailed('device');
      }
    })();
    return () => {
      disposed = true;
      duckRef.current?.remove();
      duckRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
    // The map is created once per route (and per retry); later prop changes are applied below.
  }, [track, attempt]);

  // Covered vs remaining line.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('route-covered') as GeoJSONSource | undefined)?.setData(
      covered && covered.length > 1 ? lineFeature(covered) : EMPTY,
    );
    (map.getSource('route-remaining') as GeoJSONSource | undefined)?.setData(
      lineFeature(remaining ?? track.geometry.coordinates),
    );
  }, [ready, covered, remaining, track]);

  // Raw GPS fix with its accuracy halo.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const src = map.getSource('gps') as GeoJSONSource | undefined;
    const halo = map.getSource('gps-halo') as GeoJSONSource | undefined;
    if (!fix) {
      src?.setData(EMPTY);
      halo?.setData(EMPTY);
      return;
    }
    src?.setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [fix.lon, fix.lat] } });
    halo?.setData(accuracyCircle(fix.lon, fix.lat, Math.max(5, fix.accuracyM)));
  }, [ready, fix]);

  // The duck marker and the camera.
  useEffect(() => {
    const map = mapRef.current;
    const marker = duckRef.current;
    if (!ready || !map || !marker) return;
    if (!duck) {
      marker.remove();
      return;
    }
    marker.setLngLat([duck.lon, duck.lat]).addTo(map);
    const el = marker.getElement();
    el.classList.toggle('is-left', duck.facingLeft);
    el.classList.toggle('is-lost', duck.lost);
    // Each time you go off route, the camera picks the zoom again.
    if (duck.lost !== wasLost.current) {
      wasLost.current = duck.lost;
      userZoomed.current = false;
    }
    if (follow && !userMoved) {
      const first = !centredOnce.current;
      centredOnce.current = true;
      const duration = reducedMotion() || first ? 0 : 600;
      const back = duck.routePoint;
      if (duck.lost && back) {
        // Off route: you stay in the middle; zoom out to show your place on the route too,
        // but only so far. Further away, the banner gives the direction back.
        const zoom = userZoomed.current
          ? map.getZoom()
          : offRouteZoom(map.cameraForBounds(boundsCentredOn(duck, back), { padding: 60 })?.zoom);
        map.easeTo({ center: [duck.lon, duck.lat], zoom, duration });
        return;
      }
      map.easeTo({
        center: [duck.lon, duck.lat],
        zoom: first ? FOLLOW_MAX_ZOOM : map.getZoom(),
        duration,
      });
    }
  }, [ready, duck, follow, userMoved]);

  const recenter = () => {
    setUserMoved(false);
    userZoomed.current = false;
    const map = mapRef.current;
    if (map && !duck) map.fitBounds(bbox, { padding: 28, duration: reducedMotion() ? 0 : 400 });
  };

  const retry = () => {
    setFailed(null);
    setTileTrouble(false);
    setReady(false);
    centredOnce.current = false;
    setAttempt((a) => a + 1);
  };

  if (failed) {
    return (
      <div className="route-map route-map--failed" role="note">
        <p>
          {failed === 'device'
            ? 'The street map can’t be shown on this device.'
            : 'The street map stopped working.'}{' '}
          Directions and distances still work.
        </p>
        <button type="button" className="btn btn--secondary btn--small" onClick={retry}>
          TRY MAP AGAIN
        </button>
      </div>
    );
  }

  return (
    <div className="route-map-wrap">
      <div className="route-map" ref={containerRef} role="region" aria-label={label} />
      {tileTrouble ? (
        <p className="route-map__badge route-map__badge--warn" role="status">
          Some map areas didn’t load.{' '}
          <button type="button" className="route-map__retry" onClick={retry}>
            Retry
          </button>
        </p>
      ) : (
        offline === false && <p className="route-map__badge">Online map (not saved for offline)</p>
      )}
      {userMoved && (
        <button type="button" className="btn btn--small route-map__recenter" onClick={recenter}>
          {duck && follow ? 'BACK TO DUCK' : 'RESET VIEW'}
        </button>
      )}
    </div>
  );
}

function addRouteLayers(map: MapLibreMap, track: TrackFeature) {
  map.addSource('route-remaining', { type: 'geojson', data: lineFeature(track.geometry.coordinates) });
  map.addSource('route-covered', { type: 'geojson', data: EMPTY });
  map.addSource('gps-halo', { type: 'geojson', data: EMPTY });
  map.addSource('gps', { type: 'geojson', data: EMPTY });

  // Still to run: thick navy line on a light casing. Covered: thinner gold dashes.
  // Width and pattern differ, not just colour.
  map.addLayer({
    id: 'route-casing',
    type: 'line',
    source: 'route-remaining',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': BRAND.paper, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 7, 17, 14] },
  });
  map.addLayer({
    id: 'route-remaining',
    type: 'line',
    source: 'route-remaining',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': BRAND.navy, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 8] },
  });
  map.addLayer({
    id: 'route-covered',
    type: 'line',
    source: 'route-covered',
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': BRAND.gold,
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 17, 5],
      'line-dasharray': [1.5, 1.2],
    },
  });
  map.addLayer({
    id: 'gps-halo',
    type: 'fill',
    source: 'gps-halo',
    paint: { 'fill-color': BRAND.blue, 'fill-opacity': 0.18, 'fill-outline-color': BRAND.blue },
  });
  map.addLayer({
    id: 'gps',
    type: 'circle',
    source: 'gps',
    paint: {
      'circle-radius': 6,
      'circle-color': BRAND.blue,
      'circle-stroke-color': BRAND.paper,
      'circle-stroke-width': 2.5,
    },
  });
}
