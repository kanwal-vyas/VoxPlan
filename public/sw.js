/**
 * VoxPlan Production Service Worker (Phase 8, Stage 8.3).
 *
 * Implements deterministic asset caching, application shell offline resilience,
 * and safe update flows without acting as an alternate source of truth for task data.
 *
 * Policy:
 * 1. App Shell (HTML navigation): Network-first with cache fallback to cached index.html.
 * 2. Immutable Bundles (/assets/*-[hash].*): Cache-first with network fallback.
 * 3. Static Assets (manifest, icons, fonts): Stale-while-revalidate.
 * 4. API endpoints (/api/*): Network-only. Never cached.
 * 5. Task data / IndexedDB: Never intercepted or cached in Service Worker.
 * 6. Updates: Conservative update flow; no automatic skipWaiting without user approval.
 */

const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'voxplan-';
const APP_SHELL_CACHE = `${CACHE_PREFIX}app-shell-${CACHE_VERSION}`;
const STATIC_ASSETS_CACHE = `${CACHE_PREFIX}static-${CACHE_VERSION}`;

const CURRENT_CACHES = [APP_SHELL_CACHE, STATIC_ASSETS_CACHE];

const APP_SHELL_PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/maskable-icon-512x512.png',
];

// 1. Installation: Precache core application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then(async (cache) => {
      // Precache individual items defensively so one missing optional asset doesn't abort install
      await Promise.all(
        APP_SHELL_PRECACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[Service Worker] Precache warning for ${url}:`, err);
          })
        )
      );
    })
  );
  // Conservative: do NOT call self.skipWaiting() here to avoid breaking in-flight user sessions
});

// 2. Activation: Clean up obsolete VoxPlan-owned caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (cacheNames) => {
      const deletionPromises = cacheNames
        .filter((name) => name.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.includes(name))
        .map((name) => {
          console.log(`[Service Worker] Deleting obsolete cache: ${name}`);
          return caches.delete(name);
        });
      await Promise.all(deletionPromises);
      return self.clients.claim();
    })
  );
});

// 3. Fetch Strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Never intercept non-GET requests (mutations, posts)
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // A. Backend API endpoints: Network-Only. Never cache API responses.
  if (url.pathname.startsWith('/api/') || url.port === '8000') {
    return;
  }

  // B. Navigation requests (HTML documents like / or /app): Network-first with App Shell cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          // Offline fallback: serve cached index.html or root
          const cache = await caches.open(APP_SHELL_CACHE);
          const cachedMatch = (await cache.match(request)) ||
            (await cache.match('/index.html')) ||
            (await cache.match('/'));
          if (cachedMatch) {
            return cachedMatch;
          }
          return new Response(
            '<!doctype html><html><body style="font-family:sans-serif;background:#FFF8EF;color:#25242A;padding:2rem;text-align:center;">' +
            '<h1>VoxPlan — Offline</h1><p>You are currently offline. Please reconnect to load new pages.</p>' +
            '<button onclick="location.reload()" style="padding:0.6rem 1.2rem;border-radius:20px;border:none;background:#25242A;color:#FFF;cursor:pointer;">Retry</button>' +
            '</body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // C. Immutable, content-hashed static assets (/assets/*): Cache-first with network fallback
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(STATIC_ASSETS_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // D. Static assets, fonts, icons, manifest: Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(STATIC_ASSETS_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// 4. Update message listener: allow controlled skipWaiting from UI
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 5. Notification click listener: focus existing window or navigate to /app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/app');
      }
    })
  );
});
