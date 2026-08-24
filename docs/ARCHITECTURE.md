# Architecture

## Runtime boundary

The production application is a static Next.js export. It has no Timeline, preset, map, render, or download API routes and does not require a Node.js server.

1. The Studio renders immediately with a deterministic synthetic Timeline while browser storage is restored independently.
2. A Web Worker reads, hashes, validates, normalizes, and compresses a selected Timeline JSON.
3. Dexie commits the compressed source and normalized Timeline to IndexedDB only after parsing succeeds.
4. A versioned `localStorage` record stores the active configuration, source hash, locale, and preset name.
5. Pure domain functions build the playback, camera, heading, and trail inputs. An eight-entry LRU reuses playback calculations when only visual settings change.
6. `TimelineVideo` is shared by the Remotion Player and `@remotion/web-renderer`.
7. The browser renderer encodes MP4/H.264 through WebCodecs and writes to a selected file or an OPFS-backed Blob.

## Storage

The IndexedDB database `unofficial-google-timeline-trace` contains:

- `timelines`: the singleton active Timeline, compressed source Blob, normalized value, parser version, and import metadata
- `presets`: named `VideoConfig` snapshots

Settings use the `ugtt:settings` localStorage key and schema version 5. A one-time migration accepts the former version 4 draft shape.

Invalid imports do not replace an existing Timeline. If persistence fails because of quota or browser policy, the imported Timeline remains available for the current session and the UI reports best-effort storage.

## Map runtime

MapLibre loads the public OpenFreeMap Liberty style directly in the browser. Its TileJSON, vector tiles, fonts, sprites, and low-zoom raster assets are requested only as the current view needs them. Serwist caches successful OpenFreeMap responses for reuse and evicts them under browser storage pressure. No map archive is bundled with the app or stored in Git.

## Rendering state

Boot, import, map display, and video rendering are independent parallel state-machine regions. A failure in one region does not replace the Studio shell or block storage recovery controls. Potentially hanging storage and import operations have time limits.

The visible Player reports map state through `idle → loading → ready`, with explicit error and retry states. Playback pauses outside `ready`.

Browser rendering uses a separate map instance and does not publish into the Player state store. MapLibre uses `preserveDrawingBuffer` so the Remotion browser compositor can draw its WebGL canvas. The renderer exposes capability issues, progress, encoded frame count, ETA, cancellation, and completion.

## Static output

Next.js writes the site to `out/`. Serwist then generates `out/sw.js` and injects the app-shell precache manifest. The browser accesses OpenFreeMap directly, so the static deployment has no map asset build input.
