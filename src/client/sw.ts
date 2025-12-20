export const serviceWorkerJs = `
const CACHE_NAME = 'draw-together-v2'

const CRITICAL_DEPS = [
  '/',
  '/manifest.json',
  'https://esm.sh/preact@10.25.4',
  'https://esm.sh/preact@10.25.4/hooks',
  'https://esm.sh/htm@3.1.1/preact?deps=preact@10.25.4',
  'https://esm.sh/qrcode-generator@1.4.4'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CRITICAL_DEPS)
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Don't cache WebSocket requests
  if (url.pathname.includes('/ws') || event.request.method !== 'GET') {
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // For esm.sh, prefer cache (stale-while-revalidate)
      if (url.host === 'esm.sh' && cached) {
        fetch(event.request).then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()))
          }
        }).catch(() => {})
        return cached
      }

      const fetchPromise = fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      }).catch(() => cached)

      return cached || fetchPromise
    })
  )
})
`
