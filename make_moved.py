"""Generate the "we've moved" sites for the old GitHub Pages addresses.

Each site has:
  index.html / 404.html  notice + redirect to the new address (404 catches deep links)
  sw.js                  replaces the old app's service worker: removes only this
                         app's caches, reloads open pages onto the notice, unregisters
  .nojekyll              serve files as they are
Usage: python3 make_moved.py <out_dir> <base_path> <new_url> <app_name>
"""
import json
import sys
from pathlib import Path

out, base, new_url, name = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
d = Path(out)
d.mkdir(parents=True, exist_ok=True)

page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>{name} has moved</title>
<style>
  :root {{ color-scheme: light; }}
  body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; background: #F5F0E8; color: #2C2C2A;
         font: 16px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }}
  main {{ max-width: 30rem; padding: 24px 16px; text-align: center; }}
  h1 {{ color: #1B3F72; font-size: 1.5rem; margin: 0 0 12px; }}
  a.btn {{ display: inline-block; margin-top: 16px; padding: 14px 22px; min-height: 44px; box-sizing: border-box;
          background: #EF9F27; color: #2C2C2A; font-weight: 700; text-decoration: none; border: 2px solid #2C2C2A;
          border-radius: 10px; }}
  p.small {{ font-size: 0.85rem; margin-top: 20px; }}
</style>
</head>
<body>
<main>
  <h1>{name} has moved</h1>
  <p>The app now lives at <strong>{new_url.removeprefix('https://').rstrip('/')}</strong>.</p>
  <a class="btn" href="{new_url}">OPEN THE NEW ADDRESS</a>
  <p class="small">If you added the app to your home screen, delete the old icon and add it again from the new address. This old copy no longer updates.</p>
</main>
<script>
  // Remove this app's old service worker if it is still registered here, then go to the new address.
  (async () => {{
    try {{
      const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
      await Promise.all(regs.filter((r) => new URL(r.scope).pathname === {json.dumps(base)}).map((r) => r.unregister()));
    }} catch {{}}
    setTimeout(() => location.replace({json.dumps(new_url)}), 4000);
  }})();
</script>
</body>
</html>
"""

sw = f"""// Replaces the old {name} service worker at {base} so installed copies stop serving
// a frozen version. Only this app's caches are removed: the github.io origin is shared
// with another app and a personal site.
const BASE = {json.dumps(base)};
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {{
  event.waitUntil((async () => {{
    await self.clients.claim();
    const scope = self.registration.scope; // e.g. https://<owner>.github.io{base}
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.includes(scope) || k.endsWith(':' + BASE)).map((k) => caches.delete(k)),
    );
    const wins = await self.clients.matchAll({{ type: 'window' }});
    await self.registration.unregister();
    // Reload open pages: with no service worker left they get the "moved" page from the server.
    await Promise.all(wins.map((c) => c.navigate(c.url).catch(() => {{}})));
  }})());
}});
"""

(d / "index.html").write_text(page)
(d / "404.html").write_text(page)
(d / "sw.js").write_text(sw)
(d / ".nojekyll").write_text("")
print("wrote", d)
