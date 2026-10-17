/* ============================================================
   Service Worker — Muelle interactivo
   ------------------------------------------------------------
   · Precachea el app-shell y los iconos → funciona offline.
   · Estrategia:
       - Navegaciones:  red primero, respaldo offline desde caché.
       - Resto (GET):   caché primero + revalidación en segundo plano.
   · Expone la versión de la app vía postMessage (chip del título).
   ------------------------------------------------------------

   ⬇⬇ SUBE esta constante en cada despliegue (p. ej. 1.1.0) ⬇⬇
   La caché se invalida sola y el chip del título se actualizará
   dinámicamente mostrando "Actualizada · vX.Y.Z".
   ============================================================ */
const VERSION = '1.0.2';

const CACHE_NAME = `muelle-v${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './img/favicon.ico',
  './img/favicon.svg',
  './img/apple-touch-icon.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/maskable-192.png',
  './img/maskable-512.png'
];

/* ------------------------ Instalación ------------------------ */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Se precachea recurso a recurso para que un fallo puntual
    // no impida instalar el resto del app-shell.
    await Promise.all(PRECACHE.map((url) =>
      cache.add(new Request(url, { cache: 'reload' }))
        .catch((err) => console.warn('[SW] Precache fallido:', url, err))
    ));
    await self.skipWaiting();
  })());
});

/* ------------------------ Activación ------------------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((n) => n.startsWith('muelle-v') && n !== CACHE_NAME)
        .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

/* --------------- Versión para el chip del título -------------- */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'GET_VERSION' && event.source) {
    event.source.postMessage({ type: 'VERSION', version: VERSION });
  }
  // La página pide activar de inmediato al worker en espera
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* --------------------------- Fetch --------------------------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegaciones: red primero con respaldo offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (_) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./index.html')) || (await cache.match('./'));
      }
    })());
    return;
  }

  // Resto de recursos: caché primero + revalidación en segundo plano
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);

    const network = fetch(req)
      .then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(() => cached);

    return cached || network;
  })());
});
