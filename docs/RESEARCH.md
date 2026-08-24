# Research and dependency choices

| Source | Current use |
| --- | --- |
| [Remotion client-side rendering](https://www.remotion.dev/docs/client-side-rendering) | Stable browser rendering through WebCodecs; capability checks, progress, cancellation, OPFS, and file streams |
| [Remotion telemetry](https://www.remotion.dev/docs/telemetry) | Privacy disclosure and optional public license key handling |
| [D3 zoom interpolation](https://d3js.org/d3-interpolate/zoom) | van Wijk–Nuij pan and zoom paths between predictive camera targets |
| [Dexie StorageManager guidance](https://dexie.org/docs/StorageManager) | IndexedDB persistence state, quota reporting, and best-effort fallback |
| [Serwist configurator mode](https://serwist.pages.dev/docs/next/config) | Bundler-independent service-worker build after Next static export |
| [Serwist runtime caching](https://serwist.pages.dev/docs/serwist/runtime-caching) | Network-first online map metadata and cache-first viewed map resources |
| [react-i18next](https://react.i18next.com/latest) | Bundled Korean and English resources with Korean fallback |
| [Radix Tooltip](https://www.radix-ui.com/primitives/docs/components/tooltip) | Focusable and hoverable control explanations |
| [Google Maps Timeline help](https://support.google.com/maps/answer/6258979?hl=en) | Current Android and iOS export instructions |
| [MapLibre marker options](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MarkerOptions/) | Viewport-aligned map overlays and subpixel positioning |
| [MapLibre map `idle` event](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapEventType/) | Player readiness only after transitions, requested tiles, and fades have finished |
| [OpenFreeMap quick start](https://openfreemap.org/quick_start/) | API-key-free online MapLibre style and tile source |
| [OpenFreeMap terms](https://openfreemap.org/tos/) | Public-service availability and no-SLA deployment constraint |
| [MapLibre `prewarm`](https://maplibre.org/maplibre-gl-js/docs/API/functions/prewarm/) | Reusing MapLibre worker and WebGL initialization across preview and render maps |
| [Douglas and Peucker](https://doi.org/10.3138/FM57-6770-U75U-7727) | Shape-preserving trail point budget |
| [Fritsch and Carlson](https://doi.org/10.1137/0717021) | Monotonic cubic position interpolation constraints |

Native Unicode emoji are used instead of bundled Apple artwork. Apple platforms render the `Apple Color Emoji` font; other platforms use their system emoji font.

Next.js server caches are not used. The production application is static, and server caches cannot persist user-local Timeline data or browser map responses.

## Prior art

The project respectfully acknowledges [mahlernim/google-timeline-visualizer](https://github.com/mahlernim/google-timeline-visualizer) as inspiration. Its local-processing approach, editable trip title, and map-tile preparation step informed the product questions evaluated here. This repository does not copy its implementation and does not imply affiliation or endorsement.
