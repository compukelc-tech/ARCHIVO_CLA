// =========================================================================================
// SERVICE WORKER — Archivo Personal COMPUKELC
// Cachea el "app shell" (HTML/CSS/JS/logo) para que la app abra e instale sin conexión.
// Las peticiones al backend de Apps Script SIEMPRE van a la red (nunca se cachean),
// para que subir archivos y consultar el registro siempre traigan datos actuales.
// =========================================================================================

const CACHE_NAME = 'archivo-personal-shell-v1';
const ARCHIVOS_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './logo.png'
];

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ARCHIVOS_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nombres) {
      return Promise.all(
        nombres
          .filter(function (nombre) { return nombre !== CACHE_NAME; })
          .map(function (nombre) { return caches.delete(nombre); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (evento) {
  const url = evento.request.url;

  // Nunca cachear llamadas al backend de Apps Script (google.com / script.google.com)
  if (url.indexOf('script.google.com') !== -1 || url.indexOf('googleapis.com') !== -1) {
    return; // deja que vaya directo a la red
  }

  evento.respondWith(
    caches.match(evento.request).then(function (respuestaCache) {
      return respuestaCache || fetch(evento.request);
    })
  );
});
