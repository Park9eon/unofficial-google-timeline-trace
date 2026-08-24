import {chromium} from 'playwright-core';

const metric = (values: Array<{name: string; value: number}>, name: string) => values.find((value) => value.name === name)?.value ?? 0;

const main = async () => {
  const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--disable-background-networking']});
  try {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}});
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await Promise.all([cdp.send('Performance.enable'), cdp.send('Network.enable'), cdp.send('HeapProfiler.enable')]);
    let responseCount = 0;
    let encodedBytes = 0;
    let serviceWorkerResponses = 0;
    cdp.on('Network.responseReceived', (event) => {
      responseCount += 1;
      if (event.response.fromServiceWorker) serviceWorkerResponses += 1;
    });
    cdp.on('Network.loadingFinished', (event) => {encodedBytes += event.encodedDataLength;});
    await page.addInitScript(() => {
      const entries: number[] = [];
      new PerformanceObserver((list) => entries.push(...list.getEntries().map((entry) => entry.duration))).observe({entryTypes: ['longtask']});
      Object.defineProperty(window, '__ugttLongTasks', {value: entries});
    });
    await page.goto('http://127.0.0.1:3000', {waitUntil: 'domcontentloaded'});
    await page.locator('.studio-shell').waitFor({timeout: 20_000});
    await page.locator('.map-scene[data-ready="true"]').waitFor({timeout: 20_000});
    await cdp.send('HeapProfiler.collectGarbage');
    const beforeMetrics = (await cdp.send('Performance.getMetrics')).metrics;
    const beforeDom = await cdp.send('Memory.getDOMCounters');
    const source = page.getByRole('combobox', {name: 'Timeline 또는 샘플 선택'});
    for (const id of ['metro-week', 'national-loop', 'date-line', 'urban-gps-canyon', 'round-the-world']) {
      await source.selectOption(id);
      await page.locator('.map-scene[data-ready="true"]').waitFor({timeout: 20_000});
    }
    await page.getByRole('button', {name: '마커', exact: true}).click();
    const markerSize = page.locator('.control-field').filter({hasText: '크기'}).locator('input[type="range"]');
    for (const size of ['28', '36', '44', '52', '60', '42']) await markerSize.fill(size);
    await page.waitForTimeout(250);
    await cdp.send('HeapProfiler.collectGarbage');
    const afterMetrics = (await cdp.send('Performance.getMetrics')).metrics;
    const afterDom = await cdp.send('Memory.getDOMCounters');
    const longTasks = await page.evaluate(() => (window as typeof window & {__ugttLongTasks: number[]}).__ugttLongTasks);
    const result = {
      scenarios: 5,
      responseCount,
      encodedBytes,
      serviceWorkerResponses,
      heapGrowthBytes: metric(afterMetrics, 'JSHeapUsedSize') - metric(beforeMetrics, 'JSHeapUsedSize'),
      taskDurationSeconds: metric(afterMetrics, 'TaskDuration') - metric(beforeMetrics, 'TaskDuration'),
      nodeGrowth: afterDom.nodes - beforeDom.nodes,
      listenerGrowth: afterDom.jsEventListeners - beforeDom.jsEventListeners,
      longTaskCount: longTasks.length,
      longestTaskMilliseconds: Math.max(0, ...longTasks),
    };
    if (result.nodeGrowth > 2_000 || result.listenerGrowth > 500) throw new Error(`Possible UI leak: ${JSON.stringify(result)}`);
    if (result.heapGrowthBytes > 128 * 1024 * 1024) throw new Error(`Heap growth exceeded budget: ${JSON.stringify(result)}`);
    if (result.longTaskCount > 5 || result.longestTaskMilliseconds > 150) throw new Error(`Main-thread work exceeded budget: ${JSON.stringify(result)}`);
    console.log(JSON.stringify(result, null, 2));
  } finally {await browser.close();}
};

main().catch((error) => {console.error(error); process.exitCode = 1;});
