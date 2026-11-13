/**
 * Cuts the self-hosted street map (public/maps/montreal.pmtiles) out of the
 * Protomaps daily planet build, using the `pmtiles` CLI (go-pmtiles).
 *
 *   npm run map                       default area: every route in the library + ~1.1 km
 *   npm run map -- --bbox=-73.98,45.40,-73.47,45.71   a fixed box, e.g. the whole island (~55 MB)
 *   npm run map -- --build=20261104   a specific Protomaps build
 *   npm run map -- --bbox=-74.6,45.0,-70.9,47.0 --out=.cache/maps/quebec.pmtiles
 *                                     the Montréal–Québec City map for per-route maps (uploaded to R2, not shipped)
 *
 * The CLI is downloaded once into .cache/tools/ (git-ignored) if it isn't on
 * your PATH, and only run after its archive matches the SHA-256 pinned below.
 * Only the tiles inside the box are fetched (HTTP range requests).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = join(ROOT, '.cache', 'tools');
const OUT = join(ROOT, 'public', 'maps', 'montreal.pmtiles');
const PMTILES_VERSION = '1.31.2';
/**
 * SHA-256 of each release archive, as computed by GitHub for the uploaded assets
 * (`gh api repos/protomaps/go-pmtiles/releases/tags/v1.31.2 --jq '.assets[] | .name + " " + .digest'`).
 * Update together with PMTILES_VERSION.
 */
const PMTILES_ARCHIVES: Record<string, { file: string; sha256: string }> = {
  'Darwin-arm64': { file: 'go-pmtiles-1.31.2_Darwin_arm64.zip', sha256: '40528f7f616fcbf91207cd48c8fc023d213f6d86c0cbf1f748732803d1880f3d' },
  'Darwin-x86_64': { file: 'go-pmtiles-1.31.2_Darwin_x86_64.zip', sha256: '1f0dc02eee6c58312dd6c509faee1b5c32f0596568af1bf51f1b034e7a88a65b' },
  'Linux-arm64': { file: 'go-pmtiles_1.31.2_Linux_arm64.tar.gz', sha256: 'f8bd47e7ea866863489cad588fbaf2f31f42e5821f7a03f009b3769f05801cb1' },
  'Linux-x86_64': { file: 'go-pmtiles_1.31.2_Linux_x86_64.tar.gz', sha256: '3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f' },
};

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

const ROUTES_DIR = join(ROOT, 'src', 'data', 'routes');
/** Map margin around the routes, so the area near the start and any detour shows. */
const BUFFER_M = 1100;
const MAX_ZOOM = 15;

/** West,south,east,north covering every processed route plus the buffer. */
function routesBbox(): string {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of readdirSync(ROUTES_DIR)) {
    if (!f.endsWith('.json') || f === 'manifest.json') continue;
    const { bbox } = JSON.parse(readFileSync(join(ROUTES_DIR, f), 'utf8')) as { bbox: [number, number, number, number] };
    [w, s, e, n] = [Math.min(w, bbox[0]), Math.min(s, bbox[1]), Math.max(e, bbox[2]), Math.max(n, bbox[3])];
  }
  if (!Number.isFinite(w)) throw new Error('No processed routes: run npm run routes first, or pass --bbox.');
  const dLat = BUFFER_M / 111_320;
  const dLon = BUFFER_M / (111_320 * Math.cos((((s + n) / 2) * Math.PI) / 180));
  return [w - dLon, s - dLat, e + dLon, n + dLat].map((v) => v.toFixed(4)).join(',');
}

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

function findCli(): string {
  try {
    execFileSync('pmtiles', ['version'], { stdio: 'ignore' });
    return 'pmtiles';
  } catch {
    // Not on PATH: use or fetch a local copy.
  }
  const local = join(TOOLS, 'pmtiles');
  const os = platform() === 'darwin' ? 'Darwin' : platform() === 'linux' ? 'Linux' : null;
  const cpu = arch() === 'arm64' ? 'arm64' : arch() === 'x64' ? 'x86_64' : null;
  const pinned = os && cpu ? PMTILES_ARCHIVES[`${os}-${cpu}`] : undefined;
  if (!pinned) throw new Error('Install the pmtiles CLI from https://github.com/protomaps/go-pmtiles/releases');
  // A local copy is reused only if it came from the archive with the pinned checksum.
  const marker = join(TOOLS, 'pmtiles.sha256');
  if (existsSync(local) && existsSync(marker) && readFileSync(marker, 'utf8').trim() === pinned.sha256) return local;

  mkdirSync(TOOLS, { recursive: true });
  const archive = join(TOOLS, pinned.file);
  const url = `https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/${pinned.file}`;
  console.log(`Downloading pmtiles CLI v${PMTILES_VERSION}…`);
  execFileSync('curl', ['-fsSL', '-o', archive, url], { stdio: 'inherit' });
  const got = sha256(archive);
  if (got !== pinned.sha256) {
    rmSync(archive, { force: true });
    throw new Error(`pmtiles download failed its checksum (expected ${pinned.sha256}, got ${got}). Not running it.`);
  }
  rmSync(local, { force: true });
  if (pinned.file.endsWith('.zip')) execFileSync('unzip', ['-o', '-q', archive, 'pmtiles', '-d', TOOLS]);
  else execFileSync('tar', ['-xzf', archive, '-C', TOOLS, 'pmtiles']);
  writeFileSync(marker, `${pinned.sha256}\n`);
  console.log(`Verified pmtiles CLI (sha256 ${pinned.sha256.slice(0, 12)}…).`);
  return local;
}

async function latestBuild(): Promise<string> {
  const res = await fetch('https://build-metadata.protomaps.dev/builds.json');
  if (!res.ok) throw new Error(`Could not list Protomaps builds (${res.status})`);
  const builds = (await res.json()) as { key: string }[];
  const latest = builds.map((b) => b.key).sort().at(-1);
  if (!latest) throw new Error('No Protomaps builds listed');
  return latest.replace(/\.pmtiles$/, '');
}

async function main() {
  const bbox = arg('bbox') ?? routesBbox();
  const out = arg('out') ? resolve(ROOT, arg('out')!) : OUT;
  const build = arg('build') ?? (await latestBuild());
  const cli = findCli();
  mkdirSync(dirname(out), { recursive: true });
  console.log(`Extracting ${bbox} (z0–${MAX_ZOOM}) from Protomaps build ${build}…`);
  execFileSync(
    cli,
    ['extract', `https://build.protomaps.com/${build}.pmtiles`, out, `--bbox=${bbox}`, `--maxzoom=${MAX_ZOOM}`],
    { stdio: 'inherit' },
  );
  const mb = statSync(out).size / 1024 / 1024;
  console.log(`\nWrote ${out.slice(ROOT.length + 1)} (${mb.toFixed(1)} MB) from build ${build}.`);
  console.log(
    out === OUT
      ? 'Bump MAP_VERSION in src/sixk/map/offlineMap.ts so phones fetch the new file.'
      : 'Upload it to R2 (README "Per-route maps") and set TILES_VERSION in src/sixk/map/routeTiles.ts to the build date.',
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
