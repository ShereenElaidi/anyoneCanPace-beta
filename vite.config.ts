/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { saveMeetingMap } from './scripts/vite/saveMeetingMap';
import { routeEditorPlugin } from './src/dev/routeEditor/server/plugin';
import { saveStorySheet } from './scripts/vite/saveStorySheet';
import { accountsApi } from './scripts/vite/accountsApi';

/**
 * GitHub Pages serves a project site at https://<owner>.github.io/<repo>/,
 * so every asset URL needs the "/<repo>/" prefix. The repo name comes from
 * GITHUB_REPOSITORY in Actions, or from the local git remote. A
 * "<owner>.github.io" repository is served from the domain root instead.
 * Cloudflare Pages (which sets CF_PAGES) serves from the root of its own
 * domain, so it never takes a path from the git remote. BASE_PATH overrides
 * everything, e.g. BASE_PATH=/pace/ to host the build under another site.
 */
function pagesBase(): string {
  if (process.env.BASE_PATH) return process.env.BASE_PATH;
  if (process.env.CF_PAGES) return '/';
  let repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (!repo) {
    try {
      const url = execSync('git remote get-url origin', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      repo = url.trim().match(/[/:]([^/]+?)(?:\.git)?$/)?.[1];
    } catch {
      // No git remote: serve from the root.
    }
  }
  if (!repo || repo.toLowerCase().endsWith('.github.io')) return '/';
  return `/${repo}/`;
}

const base = pagesBase();

/**
 * Shown in the home screen footer ("2026-11-06 · 3bf6256") so a crew member,
 * and a bug report, can say exactly which build is running. The commit comes
 * from the host's build environment (Cloudflare, GitHub Actions) or local git.
 */
function buildId(): string {
  let sha = process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (!sha) {
    try {
      sha = execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      // No git: show the date alone.
    }
  }
  const date = new Date().toISOString().slice(0, 10);
  return sha ? `${date} · ${sha.slice(0, 7)}` : date;
}

/**
 * Beta channel: the same code deployed from a separate "…-beta" repository
 * (its own path, so its service worker never touches the live app). It is
 * labelled "Beta" in the app, the home-screen name and the tab title.
 */
// On a root-hosted beta (Cloudflare) the path can't say "beta", so BETA=1 does.
const isBeta = process.env.BETA === '1' || /beta/i.test(base);
const appName = isBeta ? 'AnyoneCanPace Beta' : 'AnyoneCanPace';

/**
 * Phone testing: GPS needs a secure page. `npm run dev:https` makes a
 * self-signed certificate (scripts/dev-cert.ts) and sets HTTPS_DEV. A tunnel
 * (Cloudflare Tunnel / ngrok) also works; its hosts are allowed below.
 */
const https =
  process.env.HTTPS_DEV && existsSync('.cache/dev-cert/cert.pem')
    ? { key: readFileSync('.cache/dev-cert/key.pem'), cert: readFileSync('.cache/dev-cert/cert.pem') }
    : undefined;
const allowedHosts = ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.app'];

export default defineConfig(({ command }) => ({
  base,
  define: {
    __BETA__: JSON.stringify(isBeta),
    __BUILD_ID__: JSON.stringify(buildId()),
    // Accounts show only where the backend is set up: the dev server, or a build with ACCOUNTS=1 (the beta project for now).
    __ACCOUNTS__: JSON.stringify(command === 'serve' || process.env.ACCOUNTS === '1'),
    // Per-route offline maps from /api/map/tiles (R2) instead of the one Montréal file: the dev server, or ROUTE_MAPS=1 (beta).
    // Tests keep the live behaviour (one Montréal file); src/sixk/map/routeTiles.test.ts covers per-route maps.
    __ROUTE_MAPS__: JSON.stringify(!process.env.VITEST && (command === 'serve' || process.env.ROUTE_MAPS === '1')),
  },
  plugins: [
    react(),
    // Dev server only: the ?meeting-map page saves the story's map picture.
    saveMeetingMap(),
    // Dev only (`apply: 'serve'`): the route editor's file API for `?edit`. Never in a build.
    routeEditorPlugin(),
    // Dev server only: the ?story-sheet page saves its example stories to .cache/story-sheet/.
    saveStorySheet(),
    // Dev server only: the accounts API (server/handler.ts) under /api/ on a local SQLite database.
    accountsApi(),
    {
      name: 'beta-title',
      transformIndexHtml: (html) => (isBeta ? html.replaceAll('>AnyoneCanPace<', `>${appName}<`).replace('content="AnyoneCanPace"', `content="${appName}"`) : html),
    },
    VitePWA({
      // Ask before swapping versions: an automatic reload could interrupt a
      // pacer mid-session. The app offers the update only when no session runs.
      registerType: 'prompt',
      // Icons are already precached by globPatterns below.
      includeManifestIcons: false,
      manifest: {
        name: appName,
        short_name: isBeta ? 'ACP Beta' : 'AnyoneCanPace',
        description: 'Run together. Walk together. A simple RUN/WALK interval timer for volunteer pacers.',
        id: base,
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F5F0E8',
        theme_color: '#1B3F72',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // .mjs: the MapLibre worker; .pbf: map label glyphs. The big street-map
        // file (.pmtiles) is not precached: the 6K mode saves it on demand.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webp,woff2,pbf}'],
        cleanupOutdatedCaches: true,
        // The accounts API is never answered with the cached app page: Auth0's return to
        // /api/auth/callback must reach the server, or sign-in never finishes (spec §5).
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: { https, allowedHosts },
  preview: { https, allowedHosts },
  build: {
    // MapLibre is ~1 MB minified; it lives in its own lazy chunk (see scripts/check-bundle.ts).
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // Keep the map libraries in a separate vendor chunk so its file name (and the
        // service worker's cached copy) survives app updates that don't touch them.
        codeSplitting: {
          groups: [{ name: 'maplibre', test: /node_modules[\\/](maplibre-gl|pmtiles)[\\/]/ }],
        },
      },
    },
  },
  test: {
    // The on-disk transform cache doesn't notice new files matched by
    // import.meta.glob (e.g. a newly added route), so tests could silently skip it.
    // The suite is fast without it.
    fsModuleCache: false,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}));
