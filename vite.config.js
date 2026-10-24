import { defineConfig } from 'vite';
import { featuredEditions } from './src/catalog.js';
import { readdirSync } from 'node:fs';

export default defineConfig({
  plugins: [{
    name: 'offline-reader',
    generateBundle(_, bundle) {
      const icons = readdirSync(new URL('./public/icons/', import.meta.url)).map(name => `./icons/${name}`);
      const assets = ['./', './index.html', './icon.svg', './favicon.ico', './apple-touch-icon.png', './safari-pinned-tab.svg', './browserconfig.xml', './manifest.webmanifest', ...icons, ...featuredEditions.map(edition => `./${edition.cover}`), ...Object.keys(bundle).map(name => `./${name}`)];
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
