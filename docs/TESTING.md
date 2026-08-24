# Testing

## Automated coverage

The current Vitest suite covers:

- Timeline parsing, global ordering, deduplication, and invalid coordinates
- exact fixed-duration and automatic cinematic timing
- distance influence and journey phase allocation
- great-circle gaps and monotonic cubic interpolation
- predictive camera bounds, next-pin anticipation, arrival recovery, date-line handling, zoom limits, and marker safe areas
- multi-continent camera jerk, next-pin handoff, and repeated zoom-pulse limits
- trail curves and point simplification
- direction-aware marker heading and stationary-noise filtering
- IndexedDB persistence, removal of legacy map-preparation storage, and version 4 settings migration
- parallel operation failure, retry, and cancellation states
- import and deletion timeouts
- prepared-playback cache reuse across visual-only changes
- a 20-story, 720-combination matrix across timing, camera, aspect ratio, and FPS

## Browser UI check

`scripts/verify-ui.ts` opens Chrome, clears browser state, and verifies:

- immediate Studio access and at least 20 selectable synthetic stories
- upload and reload restoration without a landing page
- drag-enter overlay and actual file drop import
- IndexedDB-backed import
- Korean/English switching and document language
- localized invalid-file errors without replacing the active Timeline
- automatic emoji/circle marker switching and direction indication
- field/help-icon structure and tooltip policy
- three label styles and eight positions
- player-focused keyboard handling and form-key isolation
- click-to-jump progress
- storage dialog and render capability status
- online map-cache deletion without a blocking state
- real OpenFreeMap style and tile loading
- axe serious/critical accessibility results

The check writes a screenshot to `/tmp/timeline-ui-e2e.png` and never reads a personal Timeline file.

## Browser render check

`scripts/verify-browser-render.ts` creates a 10-second, 1080p, 30 FPS MP4 from the synthetic Timeline. It saves the download to `/tmp/timeline-browser-render.mp4` and verifies the MP4 `ftyp` header and a non-trivial file size.

The 2026-08-23 local verification produced a 5,627,001-byte `ftypisom` file at 1920×1080, 30 FPS, with a measured duration of 9.966667 seconds.

## Service-worker offline check

`scripts/verify-service-worker.ts` serves the production static output, waits for the default online map, switches Chrome offline, reloads the app, and requires the Studio shell and previously viewed map to recover from Cache Storage.

## Chrome performance check

`scripts/audit-browser-performance.ts` captures Chrome network, heap, DOM, event-listener, and long-task evidence. Its current budgets and measurement method are documented in [PERFORMANCE.md](./PERFORMANCE.md).

## Visible Chrome exploratory check

The 2026-08-23 exploratory pass used the earlier local PMTiles source. Re-run the same visible-browser coverage against OpenFreeMap before treating its map-network observations as current.

The same visible tab created and downloaded a 10-second MP4. The result was a 5,524,758-byte `ftypisom` file at 1920×1080, 30 FPS, with a measured duration of 9.966667 seconds.

## Current verification record

The 2026-08-24 deployment-normalization verification completed with:

- 13 Vitest files and 37 tests passing
- 20 synthetic stories and 720 motion combinations
- a static Next.js export with no required map environment variable and a Serwist worker precaching 30 application files totaling 4.67MB
- a Chrome UI flow with 116 OpenFreeMap responses, actual drag-and-drop, progress seeking, player-only shortcuts, and no axe serious/critical violations
- a 6,350,370-byte browser-generated MP4 at 1920×1080, 30 FPS, and 9.966667 seconds
- an offline reload with the application shell and previously viewed map available after 44 online map responses
- service-worker test servers closing even when Chrome cannot start
- no personal Timeline fixture in the test suite

## Completion gates

- Vitest
- TypeScript without incremental output
- ESLint
- Next static build
- Serwist service-worker build
- Chrome UI flow
- Chrome browser MP4 render
- production service-worker and viewed-map offline reload
- Chrome accessibility and performance budgets
- no remaining runtime API routes or personal Timeline fixture
