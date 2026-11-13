/**
 * Fails the build if the map libraries leak into the code the timer loads
 * first. Run after `vite build` (npm run build does this).
 *
 * "First load" = the entry script in dist/index.html plus every module and
 * stylesheet it preloads. MapLibre and PMTiles must only appear in lazy chunks.
 *
 * Lazy loading keeps code from being downloaded and run when the app opens.
 * It does not keep it off the phone: once installed, the service worker
 * downloads everything in its precache (lazy chunks included) in the
 * background. So this reports both numbers.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

/** Strings that survive minification and only exist in these libraries. */
const SIGNATURES = [
  { lib: 'MapLibre GL', text: 'maplibre_preloaded_worker_pool' },
  { lib: 'MapLibre GL CSS', text: '.maplibregl-map' },
  { lib: 'PMTiles', text: 'Wrong magic number for PMTiles archive' },
];

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const firstLoad = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
if (!firstLoad.some((f) => f.endsWith('.js'))) throw new Error('No entry script found in dist/index.html');

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`;
let failed = false;
let firstLoadBytes = 0;
console.log('\nEntry (first-load) files: downloaded and run when the app opens:');
for (const ref of firstLoad) {
  const file = join(DIST, ref.replace(/^.*?assets\//, 'assets/'));
  const text = readFileSync(file, 'utf8');
  firstLoadBytes += text.length;
  console.log(`  ${ref.replace(/^.*?assets\//, 'assets/')}  ${kb(statSync(file).size)}`);
  for (const sig of SIGNATURES) {
    if (text.includes(sig.text)) {
      console.error(`  ✗ ${sig.lib} found in ${ref}: it must be lazy-loaded.`);
      failed = true;
    }
  }
}
console.log(`  total ${kb(firstLoadBytes)} (uncompressed)`);

console.log('\nLazy chunks: run only when that part of the app opens:');
for (const f of readdirSync(join(DIST, 'assets')).sort()) {
  const ref = `assets/${f}`;
  if (firstLoad.some((r) => r.endsWith(ref))) continue;
  if (!/\.(m?js|css)$/.test(f)) continue;
  console.log(`  ${ref}  ${kb(statSync(join(DIST, ref)).size)}`);
}

// Everything the service worker downloads after install (workbox precache manifest in sw.js).
const sw = existsSync(join(DIST, 'sw.js')) ? readFileSync(join(DIST, 'sw.js'), 'utf8') : '';
const precached = [...new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]))];
let precacheBytes = 0;
for (const url of precached) {
  const file = join(DIST, url);
  if (existsSync(file)) precacheBytes += statSync(file).size;
}
console.log(
  `\nService worker precache: ${precached.length} files, ${(precacheBytes / 1024 / 1024).toFixed(2)} MiB in total.` +
    '\n  Downloaded in the background after the app is installed (lazy chunks included), not run until used.' +
    '\n  Not included: the street map file (public/maps/*.pmtiles), saved on demand by the Route Library.',
);

// Dev-only tools (route editor, GPS simulator) must not be in the build at all.
const DEV_ONLY = [
  { what: 'route editor', text: '__route-editor' },
  { what: 'route editor', text: 'Route editor failed to load' },
  // Server code (server/, functions/) runs on Cloudflare, never in the app.
  { what: 'accounts server', text: 'acp_session' },
  { what: 'accounts server', text: 'RECOVERY_PEPPER' },
  { what: 'local accounts API', text: 'node:sqlite' },
];
for (const f of readdirSync(join(DIST, 'assets'))) {
  if (!/\.m?js$/.test(f)) continue;
  const text = readFileSync(join(DIST, 'assets', f), 'utf8');
  for (const sig of DEV_ONLY) {
    if (text.includes(sig.text)) {
      console.error(`  ✗ The ${sig.what} is in assets/${f}: it must stay dev-only.`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('\n✓ Map libraries are not in the first-load bundle.');
console.log('✓ No dev-only tools (route editor) or server code in the build.');
