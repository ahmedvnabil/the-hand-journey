/**
 * The Hand Journey — offline shell.
 * Cache-first for hashed build assets, network-first for navigation.
 * MediaPipe wasm/model come from CDNs and are cached opportunistically.
 */
const CACHE = 'thj-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  // Navigations: fresh first, shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')))
    return
  }

  // Everything else: cache first, then network + fill cache.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok && (request.url.startsWith(self.location.origin) || request.url.includes('cdn.jsdelivr.net') || request.url.includes('storage.googleapis.com'))) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
