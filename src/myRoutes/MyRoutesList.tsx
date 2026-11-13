/**
 * "My routes" in the Route Library: the signed-in person's own routes, as the
 * same cards as the public library, plus adding a route from a GPX and any
 * unsaved drafts on this device. Only they ever see this list.
 */
import { useCallback, useEffect, useState } from 'react';
import { RouteCard } from '../sixk/Library';
import type { Draft } from './build';
import { draftStore } from './drafts';
import type { MyRoutesList as List } from './load';

interface Props {
  list: List;
  pace: number;
  onOpen: (id: string) => void;
  /** Adding a route (signed in and online only): a new one (null) or carrying on with a draft. */
  onAdd?: (draftId: string | null) => void;
}

const km = (m: number) => `${(m / 1000).toFixed(1)} km`;

export function MyRoutesList({ list, pace, onOpen, onAdd }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const loadDrafts = useCallback(() => void draftStore().list().then(setDrafts), []);
  useEffect(() => {
    if (onAdd) loadDrafts();
  }, [onAdd, loadDrafts]);

  return (
    <section aria-label="My routes">
      <p className="lib-filter">Only you can see these.</p>
      {list.offline && (
        <p className="lib-filter" role="status">
          You’re offline: showing your routes as they were last time. Routes you’ve opened before work without signal.
        </p>
      )}
      {onAdd && (
        <button type="button" className="btn btn--primary btn--block lib-add" onClick={() => onAdd(null)}>
          ADD A ROUTE FROM A GPX
        </button>
      )}
      {onAdd && drafts.length > 0 && (
        <div className="lib-drafts">
          <p className="lib-filter">Not saved yet (on this device only)</p>
          <ul className="lib-drafts__list">
            {drafts.map((d) => (
              <li key={d.id}>
                <span>
                  <strong>{d.data.name}</strong> · {km(d.data.stats.distanceM)}
                </span>
                <span className="lib-drafts__actions">
                  <button type="button" className="btn btn--secondary btn--small" onClick={() => onAdd(d.id)}>
                    CONTINUE
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger btn--small"
                    aria-label={`Discard ${d.data.name}`}
                    onClick={() => void draftStore().remove(d.id).then(loadDrafts)}
                  >
                    DISCARD
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {list.routes.length === 0 ? (
        <p className="lib-empty">{onAdd ? 'No routes yet. Add one from a GPX file.' : 'No routes yet.'}</p>
      ) : (
        <ul className="route-list">
          {list.routes.map((r) => (
            <li key={r.id}>
              <RouteCard route={r} pace={pace} onOpen={() => onOpen(r.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
