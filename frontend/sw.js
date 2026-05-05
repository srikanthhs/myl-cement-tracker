'use strict';

const CACHE = 'myl-cement-v1';

const STATIC_ASSETS = [
  '/',
  '/css/app.css',
  '/js/config.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/ui.js',
  '/js/exporter.js',
  '/js/scanner.js',
  '/js/printer.js',
  '/js/app.js',
  '/js/pages/dashboard.js',
  '/js/pages/beneficiaries.js',
  '/js/pages/allotments.js',
  '/js/pages/issuance.js',
  '/js/pages/stock.js',
  '/js/pages/reports.js',
  '/js/pages/alerts.js',
  '/js/pages/upload.js',
  '/js/pages/settings.js',
  '/js/pages/users.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // API requests: network-first, offline error response
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'You are offline. Please reconnect and try again.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // CDN (fonts, libraries): cache-first
  if (url.origin !== self.location.origin) {
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
          return res;
        });
      })
    );
    return;
  }

  // App shell + static: stale-while-revalidate
  e.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
