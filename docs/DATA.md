# Timeline data and privacy

## Exporting from Google Maps

The supported input is the device Timeline export documented by Google Maps.

- Android: Settings → Location → Location services → Timeline → Export Timeline data
- iPhone and iPad: Google Maps → Profile → Settings → Location & Privacy → Export Timeline data

Google's current instructions are available in the [Google Maps Timeline help page](https://support.google.com/maps/answer/6258979?hl=en).

The iOS export is commonly named `location-history.json`. The application accepts any `.json` filename in either of these shapes:

- a top-level array of supported Timeline records
- an older object containing a `semanticSegments` array

## Supported record fields

The parser currently reads:

- `startTime` and `endTime`
- `timelinePath[].point` and `durationMinutesOffsetFromStartTime`
- `activity.start`, `activity.end`, and `activity.topCandidate.type`
- `visit.topCandidate.placeLocation`

`timelineMemory` records are counted but do not become route points. Invalid timestamps and coordinates are ignored and counted. An import fails if no usable coordinate remains. The previously active Timeline or current sample remains available when an import fails.

## Normalization

- Records are globally sorted by point timestamp.
- Same-time points within two metres are deduplicated.
- Short out-and-back GPS spikes are removed during playback preparation.
- Record boundaries and long observation gaps are retained as `breakBefore` markers.
- The source SHA-256 hash associates saved settings with the correct Timeline.

## Browser persistence

The compressed original source and normalized Timeline are stored in IndexedDB. The source is retained so a later parser version can reprocess it without another Google export. Compression uses the browser `CompressionStream` API when available.

Timeline coordinates are not sent to application servers because the application has no runtime API. Displaying or rendering a map requests resources directly from OpenFreeMap; the requested tile coordinates can reveal which broad areas are being viewed. Remotion browser-render telemetry is documented separately in [PRIVACY.md](../PRIVACY.md).

## Deletion

- Delete Timeline removes the active source and normalized coordinates but keeps presets and language.
- Reset settings restores defaults for the active Timeline.
- Clear map cache removes viewed OpenFreeMap responses from Cache Storage.
- Delete all local data removes IndexedDB, localStorage, and Cache Storage entries owned by the application.
