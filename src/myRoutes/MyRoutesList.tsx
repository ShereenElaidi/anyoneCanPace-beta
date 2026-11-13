/**
 * "My routes" in the Route Library: the signed-in person's own routes, as the
 * same cards as the public library. Only they ever see this list.
 */
import { RouteCard } from '../sixk/Library';
import type { MyRoutesList as List } from './load';

interface Props {
  list: List;
  pace: number;
  onOpen: (id: string) => void;
}

export function MyRoutesList({ list, pace, onOpen }: Props) {
  return (
    <section aria-label="My routes">
      <p className="lib-filter">Only you can see these.</p>
      {list.offline && (
        <p className="lib-filter" role="status">
          You’re offline: showing your routes as they were last time. Routes you’ve opened before work without signal.
        </p>
      )}
      {list.routes.length === 0 ? (
        <p className="lib-empty">No routes yet. Add one from a GPX in Your account, on the home screen.</p>
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
