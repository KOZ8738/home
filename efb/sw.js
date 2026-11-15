/* Polaris EFB service worker: push notifications only. It caches nothing, so the EFB still loads (and updates)
   exactly as before. A push from the EFB server is shown as a notification; tapping it opens or focuses the EFB at
   the right app (#mail, #roster). Every push shows a notification, as iOS and iPadOS require. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
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
