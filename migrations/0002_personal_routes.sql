-- Personal routes (design/backend-v1-spec.md §3, §7): only the owner ever sees them.
-- Kept in D1 (not R2): a built route is a few KB and its cleaned GPX at most 1 MB.
-- Deleting the account deletes them (ON DELETE CASCADE).

CREATE TABLE personal_routes (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- RouteSummary JSON for the library list (name, stats, outline, …).
  summary     TEXT NOT NULL,
  -- RouteData JSON (turns, profile, …) and the TrackFeature JSON, as the app follows them.
  data        TEXT NOT NULL,
  track       TEXT NOT NULL,
  -- The cleaned GPX (latitude, longitude, elevation only), kept to rebuild the route later.
  gpx         TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX personal_routes_by_owner ON personal_routes (owner_id, updated_at);
