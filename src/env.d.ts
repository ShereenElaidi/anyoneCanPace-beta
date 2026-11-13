/** True in the beta build (a repository whose name contains "beta"). Set in vite.config.ts. */
declare const __BETA__: boolean;
/** Build date and short commit, e.g. "2026-11-06 · 3bf6256". Set in vite.config.ts. */
declare const __BUILD_ID__: string;
/** True where accounts are switched on (dev server, or a build with ACCOUNTS=1). Set in vite.config.ts. */
declare const __ACCOUNTS__: boolean;
/** True where maps come per route from /api/map/tiles (dev server, or a build with ROUTE_MAPS=1). Set in vite.config.ts. */
declare const __ROUTE_MAPS__: boolean;
