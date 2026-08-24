# Privacy

## Data that stays local

The application processes Timeline JSON in a Web Worker and stores it in the browser's IndexedDB. Coordinates, normalized points, settings, and presets are not sent to an application server. The production build contains no Timeline API.

Clearing browser site data can remove best-effort storage. The Storage dialog reports whether persistent storage has been granted and provides selective and complete deletion controls.

## Network requests

The application makes these external requests:

- OpenFreeMap style, TileJSON, vector tile, font, sprite, and low-zoom raster requests
- Remotion license telemetry when browser MP4 rendering is attempted

Map URLs do not contain Timeline source records, but requested tile coordinates can allow OpenFreeMap and its CDN to infer which broad areas are viewed or rendered. [OpenFreeMap's privacy policy](https://openfreemap.org/privacy/) says it may temporarily enable IP logging during security incidents.

According to [Remotion's telemetry documentation](https://www.remotion.dev/docs/telemetry), client-side rendering sends the end user's IP address, application origin, render type, production/development status, and success/failure status. It does not send video content, metadata, or other user data. Remotion currently retains that telemetry indefinitely for license accountability.

## Google

This application does not connect to a Google account and cannot read Google Maps Timeline directly. Users explicitly select a device-exported JSON file.

Unofficial Google Timeline Trace is not affiliated with, endorsed by, or sponsored by Google.
