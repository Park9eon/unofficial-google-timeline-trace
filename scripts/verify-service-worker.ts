import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {createServer, type Server} from 'node:http';
import path from 'node:path';
import {chromium, type Browser} from 'playwright-core';

const serveDirectory = (root: string, port: number, cors = false, requestLog: string[] = []): Promise<Server> => new Promise((resolve, reject) => {
  const absoluteRoot = path.resolve(root);
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', `http://${request.headers.host}`).pathname);
    response.on('finish', () => requestLog.push(`${response.statusCode} ${pathname}`));
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    let target = path.resolve(absoluteRoot, relative);
    if (!target.startsWith(`${absoluteRoot}${path.sep}`)) {response.writeHead(400).end(); return;}
    try {
      let info;
      try {info = await stat(target);} catch (error) {
        if (path.extname(target)) throw error;
        target = `${target}.html`;
        info = await stat(target);
      }
      if (info.isDirectory()) {
        try {
          const cleanTarget = `${target}.html`;
          info = await stat(cleanTarget);
          target = cleanTarget;
        } catch {
          target = path.join(target, 'index.html');
          info = await stat(target);
        }
      }
      const headers: Record<string, string | number> = {
        'Content-Length': info.size,
        'Content-Type': target.endsWith('.html') ? 'text/html; charset=utf-8' : target.endsWith('.js') || target.endsWith('.ts') ? 'application/javascript; charset=utf-8' : target.endsWith('.css') ? 'text/css; charset=utf-8' : target.endsWith('.json') || target.endsWith('.webmanifest') ? 'application/json; charset=utf-8' : target.endsWith('.svg') ? 'image/svg+xml' : target.endsWith('.pbf') ? 'application/x-protobuf' : 'application/octet-stream',
        'Cache-Control': target.endsWith('sw.js') || target.endsWith('manifest.json') ? 'no-cache' : 'public, max-age=31536000, immutable',
      };
      if (cors) headers['Access-Control-Allow-Origin'] = '*';
      response.writeHead(200, headers);
      createReadStream(target).pipe(response);
    } catch {response.writeHead(404).end('Not found');}
  });
  const onError = (error: Error) => reject(error);
  server.once('error', onError);
  server.listen(port, '127.0.0.1', () => {
    server.off('error', onError);
    resolve(server);
  });
});

const close = (server: Server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

const main = async () => {
    const appRequests: string[] = [];
    let appServer: Server | null = null;
    let browser: Browser | null = null;
    try {
      appServer = await serveDirectory('out', 3200, false, appRequests);
      browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--disable-background-networking']});
    const context = await browser.newContext({viewport: {width: 1280, height: 800}, serviceWorkers: 'allow'});
    const page = await context.newPage();
    let networkMapResponses = 0;
    const browserErrors: string[] = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('console', (message) => {if (message.type() === 'error') browserErrors.push(`${message.location().url || 'console'} ${message.text()}`);});
    page.on('response', (response) => {if (response.status() === 404) browserErrors.push(`404 ${response.url()}`);});
    page.on('response', (response) => {if (response.url().includes('tiles.openfreemap.org/')) networkMapResponses += 1;});
    await page.goto('http://127.0.0.1:3200', {waitUntil: 'domcontentloaded'});
    await page.locator('.studio-shell').waitFor({timeout: 20_000});
    const registration = await page.evaluate(async () => {
      for (let attempt = 0; attempt < 300; attempt += 1) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const active = registrations.find((value) => value.active);
        if (active) return {active: true, scriptURL: active.active?.scriptURL};
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
      const registrations = await navigator.serviceWorker.getRegistrations();
      return {active: false, registrations: registrations.length, installing: registrations[0]?.installing?.state, waiting: registrations[0]?.waiting?.state};
    });
    if (!registration.active) throw new Error(`Service worker did not activate: ${JSON.stringify(registration)} · ${browserErrors.join(' | ')} · requests=${appRequests.join(', ')}`);
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.locator('.studio-shell').waitFor({timeout: 20_000});
    await page.locator('.map-scene[data-ready="true"]').waitFor({timeout: 30_000});
    if (networkMapResponses === 0) throw new Error('Online map load did not fetch OpenFreeMap assets.');
    await context.setOffline(true);
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.locator('.studio-shell').waitFor({timeout: 20_000});
    await page.locator('.map-scene[data-ready="true"]').waitFor({timeout: 30_000});
    const cacheNames = await page.evaluate(() => caches.keys());
    if (!cacheNames.includes('ugtt-map-assets')) throw new Error(`Map cache missing: ${cacheNames.join(', ')}`);
    console.log(JSON.stringify({appShellOffline: true, viewedMapOffline: true, networkMapResponses, cacheNames}));
  } finally {
    await Promise.allSettled([
      ...(browser ? [browser.close()] : []),
      ...(appServer ? [close(appServer)] : []),
    ]);
  }
};

main().catch((error) => {console.error(error); process.exitCode = 1;});
