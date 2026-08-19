/**
 * Alecrim Vendas - Service Worker
 * Provides offline support by caching the app shell and static assets.
 *
 * Update flow:
 *  - The browser installs a new SW in the background. It does NOT activate
 *    automatically (no skipWaiting on install) so the running app keeps working.
 *  - The client (main.tsx) detects the waiting worker via `registration.updatefound`
 *    and shows the "Nova versão disponível" banner.
 *  - When the user taps "Atualizar", the client posts SKIP_WAITING to the waiting
 *    worker, which calls self.skipWaiting() to activate immediately. The client
 *    then reloads on `controllerchange` to pick up the new version.
 */

const CACHE_NAME = 'alecrim-vendas-v1'
const SKIP_WAITING_MSG = 'SKIP_WAITING'

// App shell: the main pages and key assets are precached on install so the
// app can boot offline. Additional navigations/assets are cached at runtime.
const PRECACHE_URLS = ['/', '/index.html', '/manifest.json', '/pwa-icon.svg', '/favicon.ico']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            cache
              .add(new Request(url, { cache: 'reload' }))
              .catch((err) => console.warn('[SW] precache failed for', url, err)),
          ),
        ),
      ),
    // Intentionally NOT calling self.skipWaiting() here: the new worker stays
    // in the "waiting" state until the user accepts the update banner.
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

// Client-driven activation. The app sends SKIP_WAITING after the user taps
// "Atualizar" in the update banner; the waiting worker activates immediately.
self.addEventListener('message', (event) => {
  if (event.data === SKIP_WAITING_MSG) {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only handle GET requests.
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Skip cross-origin requests (e.g. PocketBase API, fonts handled separately).
  if (url.origin !== self.location.origin) return

  // Navigation requests: network-first, fall back to cached index.html (app shell)
  // so the app keeps loading when the device is offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy))
          return response
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/'))),
    )
    return
  }

  // Other same-origin GET requests: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
