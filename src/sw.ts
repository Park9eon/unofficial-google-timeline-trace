/// <reference lib="webworker" />

import {defaultCache} from '@serwist/next/worker';
import type {PrecacheEntry, RuntimeCaching, SerwistGlobalConfig} from 'serwist';
import {CacheFirst, CacheableResponsePlugin, ExpirationPlugin, NetworkFirst, Serwist} from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const mapRuntimeCaching: RuntimeCaching[] = [
  {
    matcher: ({url}) => url.hostname === 'tiles.openfreemap.org' && (url.pathname.startsWith('/styles/') || url.pathname === '/planet'),
    handler: new NetworkFirst({
      cacheName: 'ugtt-map-metadata',
      networkTimeoutSeconds: 4,
      plugins: [new CacheableResponsePlugin({statuses: [200]})],
    }),
  },
  {
    matcher: ({url}) => url.hostname === 'tiles.openfreemap.org',
    handler: new CacheFirst({
      cacheName: 'ugtt-map-assets',
      plugins: [
        new CacheableResponsePlugin({statuses: [200]}),
        new ExpirationPlugin({maxEntries: 512, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true}),
      ],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...mapRuntimeCaching, ...defaultCache],
});

serwist.addEventListeners();
