import { useState } from 'react';
import { Lazy } from '../components/LoadBoundary';
import { routeShareUrl } from '../lib/routeLink';
import { formatKm, turnPhrase } from '../nav/banner';
import { ElevationProfile } from './ElevationProfile';
import advisoriesFile from '../data/advisories.json';
import { NoticeList } from '../advisories/NoticeList';
import { activeNotices, collectNotices, routeNotices, type NoticeFile } from '../advisories/notices';
import { localDate } from '../weather/runTime';
import type { LoadedRoute } from './data';
import { TurnIcon } from './TurnIcon';
import { verificationText } from '../nav/verification';
import { ROUTE_MAPS, useRouteMap } from './map/routeTiles';

const loadRouteMap = () => import('./map/RouteMap');

interface Props {
  route: LoadedRoute;
  onStart: () => void;
  /** One of the signed-in person's own routes: private, so no share link (spec §3). */
  personal?: boolean;
}

export function RoutePage({ route, onStart, personal = false }: Props) {
  const { data, track } = route;
  const file = advisoriesFile as NoticeFile;
  const sharing = useShareRoute(data);
  const notices = activeNotices(collectNotices(file.notices, routeNotices(data)), data.id, localDate(Date.now()));
  return (
    <article className="route-page" aria-label={data.name}>
      {data.description && <p className="route-page__description">{data.description}</p>}

      <div className="route-stats">
        <dl className="route-stats__list">
          <div>
            <dt>Distance</dt>
            <dd>{formatKm(data.stats.distanceM)}</dd>
          </div>
          <div>
            <dt>Climb</dt>
            <dd>↑ {data.stats.gainM} m</dd>
          </div>
          <div>
            <dt>Descent</dt>
            <dd>↓ {data.stats.lossM} m</dd>
          </div>
        </dl>
        {!personal && (
          <button type="button" className="btn route-stats__share" aria-label="Share route" onClick={() => void sharing.share()}>
            <ShareIcon />
            SHARE
          </button>
        )}
      </div>
      {personal ? <p className="route-page__private">Your route: only you can see it.</p> : <ShareFallback state={sharing.state} url={sharing.url} />}

      <div className="route-page__map">
        <Lazy
          load={loadRouteMap}
          props={{ track, bbox: data.bbox, label: `Map of ${data.name}` }}
          loading={<p className="route-map route-map--loading">Loading map…</p>}
          failed={(retry) => (
            <div className="route-map route-map--failed" role="note">
              <p>The map didn’t load. You can still start the route.</p>
              <button type="button" className="btn btn--secondary btn--small" onClick={retry}>
                TRY MAP AGAIN
              </button>
            </div>
          )}
        />
      </div>
      {ROUTE_MAPS && <RouteMapNote routeId={data.id} bbox={data.bbox} />}

      <VerificationNote data={data} />

      <button type="button" className="btn btn--primary btn--block" onClick={onStart}>
        START ROUTE
      </button>

      <section aria-labelledby="profile-title">
        <h3 id="profile-title" className="sixk__h3">
          Elevation
        </h3>
        <ElevationProfile data={data} />
      </section>

      <section aria-labelledby="turns-title">
        <h3 id="turns-title" className="sixk__h3">
          Turns
        </h3>
        <ol className="turn-list">
          <li>
            <span className="turn-list__km">0.0 km</span>
            <TurnIcon icon="finish" className="turn-list__icon" />
            <span>Start{data.startStreet ? ` on ${data.startStreet}` : ''}</span>
          </li>
          {data.turns.map((t, i) => (
            <li key={i}>
              <span className="turn-list__km">{formatKm(t.atM)}</span>
              <TurnIcon icon={t.dir} className="turn-list__icon" />
              <span>
                {turnPhrase(t)}
                {t.note && <span className="turn-list__note">{t.note}</span>}
              </span>
            </li>
          ))}
          <li>
            <span className="turn-list__km">{formatKm(data.stats.distanceM)}</span>
            <TurnIcon icon="finish" className="turn-list__icon" />
            <span>Finish</span>
          </li>
        </ol>
      </section>

      {data.notes.length > 0 && (
        <section aria-labelledby="notes-title">
          <h3 id="notes-title" className="sixk__h3">
            Notes
          </h3>
          <ul className="plain-list">
            {data.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="advisories-title">
        <h3 id="advisories-title" className="sixk__h3">
          Advisories
        </h3>
        <NoticeList notices={notices} lastChecked={file.lastChecked} empty="No advisories for this route right now." />
      </section>

      <p className="credits">
        {data.source?.attribution ?? '© OpenStreetMap contributors'}. Map data © OpenStreetMap contributors, tiles by
        Protomaps.
      </p>
    </article>
  );
}

/**
 * Before navigating: has anyone checked these directions? Shown as text, not just colour.
 * Only the one-line status shows, so START ROUTE stays on screen on a phone; tap it for the details.
 */
function VerificationNote({ data }: { data: LoadedRoute['data'] }) {
  const v = data.verification ?? { status: 'unverified' as const };
  const { label, detail } = verificationText(v);
  return (
    <section
      className={`verify-note verify-note--${v.status}`}
      aria-label={`Directions: ${label}`}
      role={v.status === 'unverified' ? 'note' : undefined}
    >
      <details>
        <summary className="verify-note__label">
          <span>
            {v.status === 'unverified' ? '⚠ ' : '✓ '}
            {label} directions
          </span>
          <span className="verify-note__more" aria-hidden="true" />
        </summary>
        <div className="verify-note__body">
          <p>{detail}</p>
          {v.notes && <p className="verify-note__extra">{v.notes}</p>}
        </div>
      </details>
    </section>
  );
}

/** This app's own address (live, beta or a local preview), for share links. */
const appUrl = () => new URL(import.meta.env.BASE_URL, location.origin).href;

/**
 * Share route: the phone's share sheet when there is one, else copy the link,
 * else show it to copy by hand. The link only names the route (src/lib/routeLink.ts).
 */
/** Whether this route's map is saved on the phone (per-route maps). Text, never colour alone. */
function RouteMapNote({ routeId, bbox }: { routeId: string; bbox: [number, number, number, number] }) {
  const { status, save } = useRouteMap(routeId, bbox);
  if (status.state === 'checking') return null;
  return (
    <div className={`route-mapnote route-mapnote--${status.state}`} role="status">
      {status.state === 'saved' && <p>✓ Map saved for offline</p>}
      {status.state === 'saving' && <p>Saving the map for offline… {Math.round(status.fraction * 100)} %</p>}
      {status.state === 'outside' && (
        <p>No offline map here: the map covers Montréal to Québec City. The route works; the map shows only its line.</p>
      )}
      {(status.state === 'missing' || status.state === 'error') && (
        <>
          <p>{status.state === 'error' ? status.message : 'Map not saved for offline yet.'}</p>
          <button type="button" className="btn btn--secondary btn--small" onClick={save}>
            SAVE MAP
          </button>
        </>
      )}
    </div>
  );
}

function useShareRoute(data: LoadedRoute['data']) {
  const url = routeShareUrl(data.id, appUrl());
  const [state, setState] = useState<ShareState>('idle');

  async function share() {
    if (typeof navigator.share === 'function') {
      try {
        // Title and link only, no extra text: some share sheets' "Copy" (Firefox on Android)
        // copies just the text and drops the link.
        await navigator.share({ title: data.name, url });
        setState('idle');
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return; // closed the share sheet
        // Not allowed here (some desktop browsers): copy instead.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return { url, state, share };
}

type ShareState = 'idle' | 'copied' | 'failed';

/** Under the stats: "copied", or the link to copy by hand. The live region is always there so it's announced. */
function ShareFallback({ state, url }: { state: ShareState; url: string }) {
  return (
    <div className="route-share">
      <p className="route-share__message" aria-live="polite">
        {state === 'copied' ? 'Route link copied.' : ''}
      </p>
      {state === 'failed' && (
        <label className="route-share__manual">
          Couldn’t copy. Press and hold to copy the link:
          <input type="text" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
    </div>
  );
}

/** The usual "share" box-with-arrow; decorative, the button says SHARE. */
function ShareIcon() {
  return (
    <svg className="route-stats__share-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
