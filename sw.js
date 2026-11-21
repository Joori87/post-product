// Post Product — service worker
// Receives things shared from other apps (Android Share menu) and hands them to the page.
const SHARE_CACHE = 'pp-share-v1';
const SHELL_CACHE = 'pp-shell-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== SHARE_CACHE && key !== SHELL_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1) Something was shared to the app
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith((async () => {
      const scope = self.registration.scope;
      try {
        const form = await event.request.formData();
        const cache = await caches.open(SHARE_CACHE);
        for (const req of await cache.keys()) await cache.delete(req);

        const file = form.getAll('image').find((f) => f && typeof f === 'object' && f.size > 0);
        if (file) {
          await cache.put(new URL('shared-image', scope).href,
            new Response(file, { headers: { 'content-type': file.type || 'image/jpeg' } }));
        }
        const meta = {
          title: String(form.get('title') || ''),
          text: String(form.get('text') || ''),
          url: String(form.get('url') || ''),
        };
        await cache.put(new URL('shared-meta', scope).href,
          new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }));
      } catch (e) {
        // fall through — the page will just open empty
      }
      return Response.redirect(new URL('./?shared=1', scope).href, 303);
    })());
    return;
  }

  // 2) App shell: network first, cache as fallback (so updates arrive quickly)
  if (event.request.method === 'GET' && url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const res = await fetch(event.request);
        if (res.ok) {
          const c = await caches.open(SHELL_CACHE);
          c.put(event.request, res.clone()).catch(() => {});
        }
        return res;
      } catch (e) {
        const cached = await caches.match(event.request, { ignoreSearch: true });
        return cached || caches.match('./index.html');
      }
    })());
  }
});
