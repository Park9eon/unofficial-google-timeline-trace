# Unofficial Google Timeline Trace

**Google timeline Film Studio**

Unofficial Google Timeline Trace is a local-first film editor for Google Maps Timeline exports. The Studio opens with synthetic stories, accepts a `location-history.json` file by picker or drag-and-drop, previews the route on a MapLibre map, and renders an MP4 in the browser.

This project is not affiliated with, endorsed by, or sponsored by Google.

## Privacy model

- Timeline source files and normalized coordinates stay in the browser.
- The active Timeline is stored in IndexedDB. Small preferences are stored in `localStorage`.
- MapLibre requests only the online OpenFreeMap tiles needed for the current view. Viewed tiles can be reused from the browser cache.
- Browser rendering sends limited Remotion license telemetry: the client IP address, application origin, render type, environment, and success status. It does not include Timeline data or video content. See [PRIVACY.md](./PRIVACY.md).

## Features

- Korean UI by default, with an English switch and locale-aware video labels
- Cinematic automatic timing and exact fixed-duration timing
- A shared distance-influence control for both timing modes
- Predictive adaptive and follow cameras with next-pin framing and smooth D3 zoom paths
- Direction-aware automatic emoji and circle markers with adjustable size
- Eight map styles, configurable labels, titles, POIs, colors, saturation, and brightness
- Accumulated and recent trails, activity or single-color rendering
- 16:9, 9:16, and 1:1 output at 1080p or 4K and 30 or 60 FPS
- Browser-side MP4/H.264 rendering with progress, ETA, cancellation, and direct file output
- IndexedDB presets, storage inspection, selective deletion, and full local reset
- Twenty synthetic stories for immediate testing without an import
- Editor timecode, clickable progress, phase timeline, scrubbing, playback rates, fullscreen, and player-focused J/K/L shortcuts

The complete option inventory is in [docs/FEATURES.md](./docs/FEATURES.md).

## Requirements

- Node.js 24
- pnpm 10
- A current browser with IndexedDB, WebGL, and Web Workers
- WebCodecs support for MP4 rendering
- Internet access to the OpenFreeMap public tile service

## Local development

Install dependencies with `pnpm install`.

`pnpm dev` starts Next.js on port 3000. The app requests online map styles, tiles, fonts, and sprites directly from OpenFreeMap; no local map archive is required.

## Static build and deployment

Run `pnpm build`. The static application and generated service worker are written to `out/`. No map asset environment variable or server-side runtime is required. See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).

`NEXT_PUBLIC_REMOTION_LICENSE_KEY` is optional. Set a public Remotion key when required by your license. Do not put a private key in a `NEXT_PUBLIC_*` variable.

## Verification

- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test:ui` while the development server is running
- `pnpm test:render` while the development server is running
- `pnpm audit:browser` while the development server is running
- `pnpm test:sw` after a production build

The browser checks require Google Chrome at the standard macOS application path. See [docs/TESTING.md](./docs/TESTING.md).

## Documentation

Start with the [documentation index](./docs/INDEX.md) for architecture, supported data, motion calculations, research, deployment, and verification.

## Acknowledgements

Inspired by [mahlernim/google-timeline-visualizer](https://github.com/mahlernim/google-timeline-visualizer). This is a respectful prior-art acknowledgement, not a statement of affiliation or shared authorship. The project helped validate the value of editable journey titles, local Timeline processing, and preparing map data before rendering. The implementation in this repository is independent.

## License

The project is available under the [MIT License](./LICENSE). Dependencies and map data retain their own licenses; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
