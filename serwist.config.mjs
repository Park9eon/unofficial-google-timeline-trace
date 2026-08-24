import {serwist} from '@serwist/next/config';

export default serwist({
  swSrc: 'src/sw.ts',
  swDest: 'out/sw.js',
  globDirectory: 'out',
  globPatterns: ['**/*.{html,js,css,json,svg,woff2,ts}'],
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
  precachePrerendered: false,
});
