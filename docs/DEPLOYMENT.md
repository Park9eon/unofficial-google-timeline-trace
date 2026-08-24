# Deployment

## Static application

`next.config.ts` uses `output: "export"`. `pnpm build` produces the site in `out/` and then writes `out/sw.js` with Serwist.

The output contains no dynamic Next.js routes. It can be hosted by any static HTTPS host.

## Vercel

The app is deployed as a static export. `vercel.json` runs `pnpm build`, serves `out/`, keeps `sw.js` revalidatable, and serves the generated Web Worker as JavaScript. There is no required map environment variable.

Do not commit a real private Remotion key; `NEXT_PUBLIC_REMOTION_LICENSE_KEY` is public by design.

Attach `trace.no9.dev` to the Vercel project and configure its DNS in Vercel. Domain attachment is account state, so it cannot be represented in `vercel.json`.

## Online map

The browser loads `https://tiles.openfreemap.org/styles/liberty` and the tiles, fonts, sprites, and TileJSON referenced by that style. OpenFreeMap requires no API key and permits commercial use, but provides no SLA. Its attribution remains embedded in every preview and exported video. A future provider change belongs in `src/video/map-style.ts` and the service-worker host matchers together.

## Service worker

The app shell is precached. Successfully viewed OpenFreeMap responses are cached for reuse, but the application does not promise complete offline coverage for an entire Timeline.

The hosting platform should serve `sw.js` with JavaScript content type and `Cache-Control: no-cache`. Service-worker scope must include the application root.

Next.js currently emits the bundled Timeline Web Worker with a `.ts` asset suffix. Static hosts must serve that generated `_next/static/media/*.ts` file as `application/javascript`; it is compiled JavaScript, not TypeScript source.

## Remotion key

`NEXT_PUBLIC_REMOTION_LICENSE_KEY` may contain a public client-render key. It is embedded in the browser bundle. A private Remotion key must never be used there.

When no key is configured, the renderer still performs the telemetry behavior documented by Remotion and may show a console warning. License eligibility is the deployer's responsibility.
