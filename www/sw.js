// Network-first for the app's own files (always revalidated, so updates show on the next launch);
// the cached copy keeps the app opening offline. Firebase handles its own data caching.
const CACHE = 'nest-v1';
const TIMEOUT = 4000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromNetwork(req) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), TIMEOUT);
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
      clearTimeout(t);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      resolve(res);
    }, err => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(fromNetwork(req).catch(() =>
      caches.match(req, { ignoreSearch: true }).then(m => m || caches.match('./'))));
  } else if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))) {
    // fonts and the pinned Firebase SDK never change at a given URL
    e.respondWith(caches.match(req).then(m => m || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});

// Push from the Nest sender (push/Code.gs via Firebase Cloud Messaging): shown even when the app is closed
self.addEventListener('push', e => {
  let d = {};
  try { const p = e.data.json(); d = p.data || p; } catch (x) {}
  e.waitUntil((async () => {
    const urgent = !!d.urgent, tag = d.tag || 'nest';
    // the app is open in front of the user: it shows its own banner (safety alerts and tests still pop)
    const ws = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (!urgent && tag !== 'test' && ws.some(w => w.visibilityState === 'visible' && w.focused)) return;
    await self.registration.showNotification(d.title || 'Nest', {
      body: d.body || '', tag, renotify: true, requireInteraction: urgent, lang: 'he', dir: 'rtl',
      vibrate: urgent ? [600, 200, 600, 200, 600, 200, 600] : [200],
      icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', data: { url: d.url || './' }
    });
  })());
});

// Tapping a notification brings the app forward
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if ('focus' in w) return w.focus();
    return self.clients.openWindow('./');
  }));
});
