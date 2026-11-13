import { useEffect } from 'react';
import duck from '../assets/duck-runner.webp';
import { formatKm } from '../nav/banner';
import type { RouteKind, RouteSummary } from '../nav/types';
import { verificationText } from '../nav/verification';
import { manifest } from './data';
import { estimateTime, FILTERS, KIND_WORD, matchesFilter, ROUTE_TAGS, sortRoutes, terrainText, visibleRoutes, type RouteFilter, type RouteSort } from './describe';
import { mapStatusText, saveMap, shouldAutoSave, useOfflineMap, type MapStatus } from './map/offlineMap';

export const KIND_LABEL: Record<RouteKind, string> = {
  loop: 'Loop',
  'out-and-back': 'Out and back',
  'point-to-point': 'Point to point',
};

interface Props {
  onOpen: (id: string) => void;
  /** Seconds per km, for the time estimates. */
  pace: number;
  /** Order of the list (from Library settings). */
  sort: RouteSort;
  filter: RouteFilter;
  onFilter: (f: RouteFilter) => void;
  /** Also list routes tagged "Testing" (off by default). */
  showTesting: boolean;
  onShowTesting: (show: boolean) => void;
}

export function Library({ onOpen, pace, sort, filter, onFilter, showTesting, onShowTesting }: Props) {
  const status = useOfflineMap();
  useMapAutoSave(status);
  // Saved and current: a quiet line at the bottom. Anything else needs attention, at the top.
  const mapFine = status.state === 'saved' && !status.outdated;
  const routes = sortRoutes(
    visibleRoutes(manifest.routes, showTesting).filter((r) => matchesFilter(r, filter)),
    sort,
  );
  const filterLabel = FILTERS.find((f) => f.id === filter)?.label ?? '';

  return (
    <>
      {/* One live region for the map status, whichever way it's shown. */}
      <p className="visually-hidden" aria-live="polite">
        {status.state === 'checking' ? '' : mapStatusText(status)}
      </p>
      {!mapFine && status.state !== 'checking' && <OfflineMapCard status={status} />}

      <div className="lib-greet">
        <img className="lib-greet__duck" src={duck} alt="" aria-hidden="true" />
        <p className="lib-greet__bubble">Where are we running today?</p>
      </div>

      <section aria-label="Routes">
        {filter !== 'all' && (
          <p className="lib-filter" role="status">
            Showing <b>{filterLabel.toLowerCase()}</b> routes ·{' '}
            <button type="button" className="link-btn" onClick={() => onFilter('all')}>
              Show all
            </button>
          </p>
        )}
        {showTesting && (
          <p className="lib-filter" role="status">
            Testing routes shown ·{' '}
            <button type="button" className="link-btn" onClick={() => onShowTesting(false)}>
              Hide them
            </button>
          </p>
        )}
        {manifest.routes.length === 0 ? (
          <p>No routes yet.</p>
        ) : routes.length === 0 ? (
          <p className="lib-empty">No routes in this category yet.</p>
        ) : (
          <ul className="route-list">
            {routes.map((r) => (
              <li key={r.id}>
                <RouteCard route={r} pace={pace} onOpen={() => onOpen(r.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {mapFine && status.state === 'saved' && (
        <p className="lib-offline" aria-hidden="true">
          <b>✓ Works offline</b> · map saved{' '}
          {new Date(status.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        </p>
      )}
    </>
  );
}

export function RouteCard({ route, pace, onOpen }: { route: RouteSummary; pace: number; onOpen: () => void }) {
  const { distanceM } = route.stats;
  const time = estimateTime(distanceM, pace);
  const tags = (route.tags ?? []).filter((t) => t in ROUTE_TAGS);
  return (
    <button type="button" className="route-card" onClick={onOpen}>
      <svg className="route-card__thumb" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <path d={route.outline} />
      </svg>
      <span className="route-card__text">
        <span className="route-card__name">{route.name}</span>
        {route.place && (
          <span className="route-card__place">
            {/* Each part stays whole ("Saint-Henri" never splits at its hyphen); parts wrap between them. */}
            {route.place.split(' · ').map((part, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                <span className="route-card__place-part">{part}</span>
              </span>
            ))}
          </span>
        )}
        <span className="route-card__stats">
          {formatKm(distanceM)} {KIND_WORD[route.kind]} ·{' '}
          <span className="route-card__time" aria-hidden="true">
            {time.text}
          </span>
          <span className="visually-hidden">{time.spoken}</span>
        </span>
      </span>
      {/* One wrapping row across the card: the climb in words, tags, and a warning if nobody has checked the directions.
          Checked routes say so on the route page, before START ROUTE. */}
      <span className="route-card__chips">
        <span className="tag tag--plain">{terrainText(route.stats)}</span>
        {tags.map((t) => (
          <span key={t} className={`tag tag--${ROUTE_TAGS[t].tone}`}>
            {ROUTE_TAGS[t].label}
          </span>
        ))}
        {route.verification === 'unverified' && (
          <span className="tag route-card__check route-card__check--unverified">
            ⚠ {verificationText({ status: route.verification }).label} directions
          </span>
        )}
      </span>
      <span className="route-card__go" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

/** Saves the map automatically the first time (or when outdated), unless offline or in data-saver mode. */
function useMapAutoSave(status: MapStatus) {
  const outdated = status.state === 'saved' && !!status.outdated;
  useEffect(() => {
    if ((status.state === 'missing' || outdated) && shouldAutoSave()) void saveMap();
  }, [status.state, outdated]);
}

/** Honest offline status for the street map, with a way to save it. Shown when it needs attention. */
export function OfflineMapCard({ status }: { status: MapStatus }) {
  const outdated = status.state === 'saved' && !!status.outdated;
  const canSave = status.state === 'missing' || status.state === 'error' || outdated;
  return (
    <section className={`map-status map-status--${status.state}`}>
      {/* aria-hidden: the library's live region already reads this text. */}
      <p aria-hidden="true">
        <span className="map-status__tag">{status.state === 'saved' && !outdated ? 'OFFLINE ✓' : 'MAP'}</span> {mapStatusText(status)}
      </p>
      {status.state === 'saving' && (
        <progress max={1} value={status.fraction ?? undefined} aria-label="Map download progress" />
      )}
      {canSave && (
        <button type="button" className="btn btn--secondary btn--small" onClick={() => void saveMap()}>
          {outdated ? 'UPDATE OFFLINE MAP' : 'SAVE MAP FOR OFFLINE'}
        </button>
      )}
    </section>
  );
}
