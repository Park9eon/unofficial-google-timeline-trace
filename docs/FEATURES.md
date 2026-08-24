# Feature reference

## Timeline

- JSON file picker and drag-and-drop import
- 250MB input limit
- Studio available immediately with 20 deterministic synthetic stories
- active Timeline restoration after reload
- full range, last year, current year, current month, last 30 days, and direct dates
- invalid date recovery without changing the committed range

## Timing

- Cinematic: automatic duration from active days, distance, visits, and journey phases
- Fixed duration: exact user-selected total duration
- Information density for cinematic duration
- Distance influence from time/stay emphasis to distance emphasis
- Destination hold emphasis

## Camera

- Adaptive: predictive corridor and next-pin framing
- Follow: current-position tracking with velocity and next-pin lead
- Overview: fixed bounds for the selected range
- Maximum zoom, smoothing, future anticipation, and frame occupancy
- Date-line-safe Mercator projection and marker safe areas

## Marker and trail

- Native emoji marker with automatic activity mapping and direction indication
- Circle marker with editable color
- High-contrast marker badge and marker size from 20 to 72 pixels
- Accumulated trail visibility and opacity
- Recent trail duration and width
- Activity or single-color trail

## Map

- Night Pulse, Deep Ocean, Forest Glow, Sunset Dusk, Blueprint, Paper Atlas, Mono Fog, and Clean Light
- No, major, or full map labels
- Optional POIs
- Saturation, brightness, and land/water/road/boundary/text colors
- Online OpenFreeMap vector tiles loaded directly by the browser
- Permanent OpenFreeMap, OpenMapTiles, and OpenStreetMap attribution

## Labels

- Editable journey title and subtitle
- Date, time, activity, accumulated distance, and range progress
- Minimal, panel, and cinematic styles
- Eight positions: three at the top, two in the middle, and three at the bottom
- Compact and regular sizes
- Korean and English date, number, activity, and map labels

## Output and editor

- 16:9, 9:16, and 1:1
- 1080p and 4K
- 30 and 60 FPS
- MP4/H.264 browser rendering
- Direct file writing when File System Access is available; OPFS/Blob download fallback
- Editor timecode `HH:MM:SS:FF`, phase segments, playhead, hover timecode, click-to-jump, and scrubbing
- Playback rates `-1×`, `0.5×`, `1×`, `1.5×`, and `2×`
- Space/K play-pause, J reverse, L forward, arrow frame step, Shift+arrow one second, Home/End, F fullscreen, and `?` help while the player workspace has focus

## Local management

- Preset save, load, and delete
- Storage usage and persistence status
- Reset current settings
- Delete all presets
- Delete the active Timeline
- Clear map cache
- Delete all local application data
