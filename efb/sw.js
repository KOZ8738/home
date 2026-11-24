/* Polaris EFB service worker: push notifications, and the offline pack.
   - Push: a push from the EFB server is shown as a notification; tapping it opens or focuses the EFB at the right app
     (#mail, #roster). Every push shows a notification, as iOS and iPadOS require.
   - Offline pack: the EFB itself, the flight's charts, procedures, airport data, OFP PDF and the map along the route,
     saved by the pilot (Flight plan › Briefing › Offline pack) in the "efb-offline-v1" cache. Requests always go to
     the network first, exactly as before; only when the network fails is the saved copy used. Nothing is ever saved
     here on its own, and only requests that could be in a pack are looked at at all. */
const OFF = 'efb-offline-v1';
/* whether a pack exists: until known, requests are looked at; with none, the worker stays out of the way entirely */
let offOn = null;
caches.has(OFF).then((v) => { offOn = v; }).catch(() => {});
self.addEventListener('message', (e) => { if (e.data && e.data.type === 'efb-offline') offOn = !!e.data.on; });
const OFF_API = /^\/api\/efb\/(charts|chart-pdf|navproc|airport|airport-layout|ofp-pdf|apts|fir)(\?|$)/;
function offWant(u) {
  if (u.origin === self.location.origin) { const p = new URL(self.registration.scope).pathname; return u.pathname.startsWith(p) && !u.pathname.startsWith(p + 'music/'); }
  if (u.hostname === 'efb-api.koz8738.com') return OFF_API.test(u.pathname + u.search);
  if (u.hostname === 'cdnjs.cloudflare.com') return /^\/ajax\/libs\/(pdf\.js|maplibre-gl)\//.test(u.pathname);
  return u.hostname === 'tiles.openfreemap.org' || u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
}
/* a saved whole file answers a byte-range request (the chart viewer reads big PDFs in pieces) */
async function offRange(req, res) {
  const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.get('Range') || '');
  if (!m || res.status !== 200 || res.type === 'opaque') return res;
  const buf = await res.arrayBuffer(), a = +m[1], b = m[2] ? Math.min(+m[2], buf.byteLength - 1) : buf.byteLength - 1;
  if (a >= buf.byteLength) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + buf.byteLength } });
  const h = new Headers(res.headers); h.set('Content-Range', `bytes ${a}-${b}/${buf.byteLength}`); h.set('Content-Length', String(b - a + 1));
  return new Response(buf.slice(a, b + 1), { status: 206, statusText: 'Partial Content', headers: h });
}
async function offMatch(req) {
  if (!(await caches.has(OFF))) return null;
  const c = await caches.open(OFF), u = new URL(req.url);
  let r = await c.match(req.url, { ignoreVary: true });
  if (!r && u.origin === self.location.origin) {
    /* the EFB page itself: any address of it (?b=1124.2151, #map, index.html) is the saved page */
    if (req.mode === 'navigate' || /\/(index\.html)?$/.test(u.pathname)) r = await c.match(self.registration.scope, { ignoreVary: true });
    else r = await c.match(req.url, { ignoreSearch: true, ignoreVary: true });
  }
  return r ? offRange(req, r) : null;
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || offOn === false) return;
  let u; try { u = new URL(req.url); } catch (x) { return; }
  if (!offWant(u)) return;
  e.respondWith(fetch(req).catch(async (err) => { const r = await offMatch(req).catch(() => null); if (r) return r; throw err; }));
});
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) c.postMessage({ type: 'efb-push', cat: d.cat || '', url: d.url || '' });
    await self.registration.showNotification(d.title || 'Polaris EFB', {
      body: d.body || '', tag: d.tag || undefined, data: { url: d.url || '' },
      icon: 'apple-touch-icon.png', badge: 'apple-touch-icon.png',
    });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.url) || '';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) {
      if (c.url.startsWith(self.registration.scope)) { c.postMessage({ type: 'efb-open', url: hash }); return c.focus(); }
    }
    return self.clients.openWindow(new URL('./' + hash, self.registration.scope).href);
  })());
});
