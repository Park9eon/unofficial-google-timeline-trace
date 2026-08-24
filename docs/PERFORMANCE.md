# Performance and map reuse

## Playback preparation

Timing, phases, and normalized playback points are keyed by Timeline hash, selected date range, timing settings, and FPS in an eight-entry LRU. Marker, label, color, and map-style changes reuse that preparation. Camera and rendering inputs remain deterministic for the same key.

Browser MP4 compatibility is cached by output dimensions. Marker, label, Timeline, and playback changes do not repeat Remotion's WebGL capability probe; returning to an already checked aspect ratio and resolution reuses the same result.

## Map loading

MapLibre workers and WebGL initialization are prewarmed. The browser downloads only the OpenFreeMap style resources and tiles required by the current view. The service worker keeps up to 512 successful map responses for 30 days and removes them first when the browser reports storage pressure. Clearing the map cache removes these browser cache entries.

## Browser audit

`audit-browser-performance.ts` uses the Chrome DevTools Protocol while switching among five contrasting stories and changing marker size repeatedly. It forces garbage collection before comparing the snapshots and records network responses, transferred bytes, JavaScript heap growth, task duration, DOM nodes, event listeners, and main-thread long tasks.

The enforced budgets are:

- less than 128MB JavaScript heap growth
- no more than 2,000 added DOM nodes
- no more than 500 added event listeners
- no more than five long tasks
- no long task over 150ms

Service-worker behavior is measured separately in the production-build offline test, because development mode intentionally does not register the production service worker.

The 2026-08-23 local audit switched five scenarios and recorded 47 responses, 36,249,805 encoded response bytes, 2,061,960 bytes of post-GC heap growth, no retained DOM-node or listener growth, two long tasks, and a longest task of 106ms. These are machine-local observations, while the thresholds above are the repeatable pass/fail contract.

A second visible-Chrome pass ran with DevTools docked and a 645×818 content viewport. It covered imports, five scenario changes, every label position, and an injected map failure against the earlier local map source. Re-run this audit against OpenFreeMap before treating those network observations as current.
