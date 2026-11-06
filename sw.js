// Replaces the old AnyoneCanPace Beta service worker at /anyoneCanPace-beta/ so installed copies stop serving
// a frozen version. Only this app's caches are removed: the github.io origin is shared
// with another app and a personal site.
const BASE = "/anyoneCanPace-beta/";
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const scope = self.registration.scope; // e.g. https://<owner>.github.io/anyoneCanPace-beta/
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.includes(scope) || k.endsWith(':' + BASE)).map((k) => caches.delete(k)),
    );
    const wins = await self.clients.matchAll({ type: 'window' });
    await self.registration.unregister();
    // Reload open pages: with no service worker left they get the "moved" page from the server.
    await Promise.all(wins.map((c) => c.navigate(c.url).catch(() => {})));
  })());
});
