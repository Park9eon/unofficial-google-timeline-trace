import {readFile, stat} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {timelineFixture} from './timeline-fixture';

const output = '/tmp/timeline-browser-render.mp4';

const main = async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--disable-background-networking'],
  });
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}, acceptDownloads: true});
    const browserErrors: string[] = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('console', (message) => {if (message.type() === 'error') browserErrors.push(message.text());});
    await page.goto('http://127.0.0.1:3000', {waitUntil: 'domcontentloaded'});
    try {await page.locator('.studio-shell').waitFor({timeout: 20_000});} catch (error) {
      throw new Error(`Studio did not mount: ${browserErrors.join(' | ')} · body=${(await page.locator('body').innerText()).slice(0, 500)}`, {cause: error});
    }
    await page.locator('input[type="file"]').setInputFiles({name: 'timeline-render.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(timelineFixture))});
    await page.locator('.map-scene[data-ready="true"]').waitFor({timeout: 20_000});
    await page.getByRole('button', {name: '시간', exact: true}).click();
    await page.locator('.control-field').filter({hasText: '재생 타이밍'}).getByRole('button', {name: '고정시간', exact: true}).click();
    const duration = page.locator('.control-field').filter({hasText: '영상 길이'}).locator('input[type="range"]');
    await duration.fill('10');
    await page.getByRole('button', {name: '출력', exact: true}).click();
    await page.locator('.render-capability.supported').waitFor({timeout: 20_000});
    await page.evaluate(() => {delete window.showSaveFilePicker;});
    const downloadPromise = page.waitForEvent('download', {timeout: 300_000});
    await page.getByRole('button', {name: 'MP4 만들기', exact: true}).click();
    const download = await downloadPromise;
    await download.saveAs(output);
    const info = await stat(output);
    const bytes = await readFile(output);
    const header = bytes.subarray(4, 12).toString('ascii');
    if (!header.includes('ftyp') || info.size < 100_000) throw new Error(`Invalid MP4 output: ${header}, ${info.size} bytes`);
    const verifyPage = await browser.newPage({viewport: {width: 960, height: 600}});
    await verifyPage.setContent('<video id="output" controls style="width:100%;height:auto;background:#000"></video>');
    const metadata = await verifyPage.evaluate(async (source) => {
      const video = document.querySelector<HTMLVideoElement>('#output')!;
      await new Promise<void>((resolve, reject) => {video.onloadedmetadata = () => resolve(); video.onerror = () => reject(video.error); video.src = source;});
      video.currentTime = Math.min(5, video.duration / 2);
      await new Promise<void>((resolve) => {video.onseeked = () => resolve();});
      return {width: video.videoWidth, height: video.videoHeight, duration: video.duration};
    }, `data:video/mp4;base64,${bytes.toString('base64')}`);
    if (metadata.width !== 1920 || metadata.height !== 1080 || Math.abs(metadata.duration - 10) > 0.1) throw new Error(`Unexpected MP4 metadata: ${JSON.stringify(metadata)}`);
    await verifyPage.screenshot({path: '/tmp/timeline-browser-render-frame.png'});
    console.log(JSON.stringify({output, bytes: info.size, container: header.trim(), ...metadata, fps: 30, frame: '/tmp/timeline-browser-render-frame.png'}));
  } finally {
    await browser.close();
  }
};

main().catch((error) => {console.error(error); process.exitCode = 1;});
