import AxeBuilder from '@axe-core/playwright';
import {chromium} from 'playwright-core';
import {timelineFixture} from './timeline-fixture';

const fail = (message: string): never => { throw new Error(message); };

const main = async () => {
  const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--disable-background-networking']});
  try {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}});
    const page = await context.newPage();
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    let mapResponses = 0;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {const location = message.location().url; if (message.type() === 'error' && !location.endsWith('/favicon.ico')) consoleErrors.push(`${location || 'console'} ${message.text()}`);});
    page.on('response', (response) => {if (response.url().includes('tiles.openfreemap.org/')) mapResponses += 1;});

    await page.goto('http://127.0.0.1:3000', {waitUntil: 'domcontentloaded'});
    await page.locator('.studio-shell').waitFor({timeout: 20_000});
    if (await page.locator('.upload-shell').count()) fail('The removed upload landing page is still mounted.');
    const sourceSelect = page.getByRole('combobox', {name: 'Timeline 또는 샘플 선택'});
    if (await sourceSelect.locator('option').count() < 20) fail('Synthetic samples are not exposed in the Studio.');
    await page.locator('.map-scene[data-ready="true"]').waitFor({timeout: 20_000});

    await page.getByRole('button', {name: '시간', exact: true}).click();
    const timing = page.locator('.control-field').filter({hasText: '재생 타이밍'});
    const label = timing.locator('.control-label-line label, .control-label-line span').first();
    const help = timing.locator('.control-help');
    const [labelBox, helpBox] = await Promise.all([label.boundingBox(), help.boundingBox()]);
    if (!labelBox || !helpBox || helpBox.x - (labelBox.x + labelBox.width) > 12) fail('The shared tooltip icon is detached from its label.');
    if (await page.locator('.control-field').filter({hasText: '시작일'}).locator('.control-help').count()) fail('An unnecessary start-date tooltip is still present.');

    const playButton = page.locator('.transport-main');
    const beforeFormSpace = await playButton.getAttribute('aria-label');
    await page.locator('.control-field').filter({hasText: '거리 영향도'}).locator('input[type="range"]').focus();
    await page.keyboard.press('Space');
    if (await playButton.getAttribute('aria-label') !== beforeFormSpace) fail('A form-space key changed Player playback.');
    await page.locator('.workspace').focus();
    await page.keyboard.press('k');
    await page.waitForTimeout(100);
    if (await playButton.getAttribute('aria-label') === beforeFormSpace) fail('Player-focused K shortcut did not change playback.');
    await page.keyboard.press('k');

    const beforeSeek = await page.locator('.transport-copy strong').innerText();
    const progress = page.locator('.transport-progress');
    const progressBox = await progress.boundingBox();
    if (!progressBox) throw new Error('Editor progress is missing.');
    await page.mouse.click(progressBox.x + progressBox.width * 0.55, progressBox.y + progressBox.height / 2);
    await page.waitForTimeout(100);
    if (await page.locator('.transport-copy strong').innerText() === beforeSeek) fail('Clicking progress did not jump the Player.');

    await page.getByRole('button', {name: '마커', exact: true}).click();
    await page.getByRole('button', {name: '이모지', exact: true}).click();
    await page.locator('.marker-badge .marker-direction').waitFor();
    if (await page.locator('.emoji-picker').count()) fail('Manual emoji selection is still exposed.');

    await page.getByRole('button', {name: '라벨', exact: true}).click();
    for (const style of ['미니멀', '패널', '시네마틱']) await page.getByRole('button', {name: style, exact: true}).click();
    await page.getByRole('combobox', {name: '위치'}).selectOption('bottom-center');
    await page.locator('.map-labels.label-bottom-center.label-style-cinematic').waitFor();

    const fixtureSource = JSON.stringify(timelineFixture);
    await page.evaluate((source) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([source], 'timeline-dropped.json', {type: 'application/json'}));
      document.querySelector('.studio-shell')?.dispatchEvent(new DragEvent('dragenter', {bubbles: true, dataTransfer: transfer}));
    }, fixtureSource);
    await page.locator('.studio-drop-overlay').waitFor();
    await page.evaluate((source) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([source], 'timeline-dropped.json', {type: 'application/json'}));
      document.querySelector('.studio-shell')?.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: transfer}));
    }, fixtureSource);
    await sourceSelect.selectOption('__user__');
    await page.locator('.map-scene[data-ready="true"]').waitFor({timeout: 20_000});
    await page.getByRole('button', {name: '시간', exact: true}).click();
    const dateInputs = page.locator('input[aria-label="YYYY-MM-DD"]');
    const dates = await dateInputs.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
    if (dates[0] !== '2025-08-20' || dates[1] !== '2026-08-20') fail(`Imported one-year range mismatch: ${dates.join(' ~ ')}`);
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.locator('.studio-shell').waitFor({timeout: 20_000});
    await page.locator('.map-scene[data-ready="true"]').waitFor({timeout: 20_000});

    await page.getByRole('button', {name: 'EN', exact: true}).click();
    await page.getByRole('button', {name: 'Marker', exact: true}).waitFor();
    if (await page.locator('html').getAttribute('lang') !== 'en') fail('English locale did not update the document language.');
    await page.locator('input[type="file"]').setInputFiles({name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{')});
    await page.locator('.source-status em').filter({hasText: 'The selected file is not valid JSON.'}).waitFor({timeout: 10_000});
    if (await page.locator('.source-status select').inputValue() !== '__user__') fail('A failed import replaced the active Timeline.');
    await page.getByRole('button', {name: '한국어', exact: true}).click();

    await page.getByRole('button', {name: '저장된 데이터'}).click();
    await page.getByRole('heading', {name: '이 기기에 저장된 데이터'}).waitFor();
    const dialogA11y = await new AxeBuilder({page}).analyze();
    if (dialogA11y.violations.length) fail(`Dialog accessibility: ${JSON.stringify(dialogA11y.violations.map((violation) => ({id: violation.id, nodes: violation.nodes.map((node) => ({target: node.target, html: node.html}))})))}`);
    await page.getByRole('button', {name: '지도 캐시 삭제', exact: true}).click();
    await page.getByRole('alertdialog').getByRole('button', {name: '지도 캐시 삭제', exact: true}).click();
    await page.locator('.source-status em').filter({hasText: '저장된 데이터가 정리되었습니다.'}).waitFor({timeout: 10_000});
    await page.keyboard.press('Escape');
    const studioA11y = await new AxeBuilder({page}).exclude('.maplibregl-canvas').analyze();
    if (studioA11y.violations.length) fail(`Studio accessibility: ${JSON.stringify(studioA11y.violations.map((violation) => ({id: violation.id, nodes: violation.nodes.map((node) => ({target: node.target, html: node.html}))})))}`);

    if (mapResponses === 0) fail('No OpenFreeMap resource was requested.');
    await page.screenshot({path: '/tmp/timeline-ui-e2e.png'});
    if (pageErrors.length || consoleErrors.length) fail(`Browser errors: ${[...pageErrors, ...consoleErrors].join(' | ')}`);
    console.log(JSON.stringify({samples: await sourceSelect.locator('option').count(), dragAndDrop: true, localizedImportError: true, failedImportPreservesSource: true, dates, progressJump: true, playerShortcutScope: true, markerTypes: 2, labelStyles: 3, mapCacheRecovery: true, mapResponses, a11y: 'axe-pass', screenshot: '/tmp/timeline-ui-e2e.png'}));
  } finally {await browser.close();}
};

main().catch((error) => {console.error(error); process.exitCode = 1;});
