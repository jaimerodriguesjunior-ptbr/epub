import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [{
    name: 'offline-reader',
    generateBundle(_, bundle) {
      const assets = ['./', './index.html', './icon.svg', './manifest.webmanifest', './meninos-contra-a-guerra-capa.png', ...Object.keys(bundle).map(name => `./${name}`)];
      const version = `entrelinhas-${Date.now()}`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = ${JSON.stringify(version)};
const FILES = ${JSON.stringify(assets)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('entrelinhas-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});` });
    },
  }],
});
