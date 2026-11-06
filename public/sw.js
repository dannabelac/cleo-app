// Service Worker de CLEO.
//
// Único trabajo: cachear el "app shell" (HTML/JS/CSS/íconos servidos
// desde concleo.com o cleo-pruebas, lo que haya) para que la app abra y
// pinte aunque no haya conexión. NUNCA cachea nada de otro origen
// (Supabase, Sentry, PostHog, Google Fonts) , eso pasa siempre directo a
// la red, sin tocarlo. Los datos reales del negocio de CLEO viven en
// Supabase y en localStorage, nunca en esta caché , si un dato de negocio
// quedara atrapado aquí, una usuaria podría ver información vieja, o en
// un dispositivo compartido, de otra cuenta. Ver README del gist de
// referencia (error #1): cachear una respuesta autenticada por accidente
// es el error más común y más grave de un service worker.
//
// Solo se registra en producción (ver src/main.jsx) , nunca corre con
// `npm run dev`, para no interferir con el hot-reload de Vite.

var CACHE_NAME = 'cleo-shell-v1';
var OFFLINE_URL = '/offline.html';
var PRECACHE_URLS = ['/', OFFLINE_URL];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(PRECACHE_URLS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (nombres) {
        return Promise.all(
          nombres
            .filter(function (n) { return n !== CACHE_NAME; })
            .map(function (n) { return caches.delete(n); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;

  // Nunca intercepta nada que no sea una lectura simple (GET) , un
  // guardado/pago real (POST/PUT/PATCH) jamás debe pasar por esta caché.
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // Cualquier petición a otro origen (Supabase, Sentry, PostHog, fuentes)
  // se ignora por completo aquí , sigue su camino normal a la red, sin
  // que este service worker la toque ni la cachee.
  if (url.origin !== self.location.origin) return;

  // Navegación (abrir o recargar la app): red primero, para que siempre
  // se vea la versión más reciente mientras haya conexión; si falla (sin
  // internet), muestra el shell guardado o, si no existe, offline.html.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          var copia = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put('/', copia); });
          return res;
        })
        .catch(function () {
          return caches.match('/').then(function (cached) {
            return cached || caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // Archivos estáticos del propio build (JS/CSS con hash, íconos,
  // manifest): caché primero para que abra rápido, y se refresca en
  // segundo plano para la próxima vez.
  event.respondWith(
    caches.match(req).then(function (cached) {
      var enRed = fetch(req)
        .then(function (res) {
          if (res && res.ok) {
            var copia = res.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copia); });
          }
          return res;
        })
        .catch(function () { return cached; });
      return cached || enRed;
    })
  );
});
