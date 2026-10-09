// UI smoke test: drives the built app (dist/, served by `vite preview`) in
// headless Chromium through the main flows and fails (exit code 1) if any
// check fails.
//
// Usage: npm run test:ui            (builds first)
//        npm run test:ui -- --screenshots=sandbox/ui-smoke-shots
//
// Browser: set CHROMIUM_PATH to a Chromium/Chrome binary, or install
// Playwright's own with `npx playwright-core install chromium`.
//
// Network is fully mocked so results don't depend on Scryfall being up:
// the set list and card lookups are answered locally (only BLB 64 exists),
// card images get the placeholder, and every jsdelivr request is aborted -
// the app must not need a CDN (Tesseract assets are self-hosted).
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'sandbox/test-images/C 0064 BLB DE.JPG');
const PLACEHOLDER = fs.readFileSync(path.join(ROOT, 'assets/default-card.png'));
const PORT = 4179;
const BASE = `http://localhost:${PORT}`;

const screenshotArg = process.argv.find(arg => arg.startsWith('--screenshots='));
const screenshotDir = screenshotArg ? path.resolve(ROOT, screenshotArg.split('=')[1]) : null;
if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });

const failures = [];
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
}

async function shot(page, name) {
  if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `${name}.png`) });
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' };
const CARD = {
  name: 'Pearl of Wisdom',
  printed_name: 'Perle der Weisheit',
  set_name: 'Bloomburrow',
  set: 'blb',
  collector_number: '64',
  id: 'ui-smoke-blb-64',
  image_uris: { normal: 'https://cards.scryfall.io/normal/front/ui-smoke.jpg' }
};

async function mockNetwork(context, cdnRequests) {
  await context.route('https://api.scryfall.com/sets**', route => route.fulfill({
    headers: cors,
    contentType: 'application/json',
    body: JSON.stringify({ data: ['blb', 'fdn', 'otj', 'eoe', 'otp', 'sta'].map(code => ({ code })) })
  }));
  await context.route('https://api.scryfall.com/cards/**', route => route.request().url().includes('/blb/64')
    ? route.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify(CARD) })
    : route.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{"object":"error"}' }));
  await context.route('https://cards.scryfall.io/**', route => route.fulfill({ headers: cors, contentType: 'image/png', body: PLACEHOLDER }));
  await context.route('https://cdn.jsdelivr.net/**', route => {
    cdnRequests.push(route.request().url());
    return route.abort();
  });
}

const stageState = page => page.$eval('#stage', el => el.dataset.state);
const text = async (page, selector) => (await page.textContent(selector))?.trim();

async function run() {
  const server = await preview({ root: ROOT, logLevel: 'silent', preview: { port: PORT, strictPort: true } });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });

  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
    const cdnRequests = [];
    const langRequests = [];
    const pageErrors = [];
    await mockNetwork(context, cdnRequests);
    context.on('request', request => {
      if (request.url().includes('traineddata')) langRequests.push(request.url());
    });

    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));

    // --- Start screen
    await page.goto(BASE);
    check('start: stage idle', await stageState(page) === 'idle');
    check('start: capture button offers the camera', await text(page, '#captureLabel') === 'Kamera starten');
    await shot(page, '01-start');

    // --- Upload a real photo -> found sheet
    await page.setInputFiles('#fileInput', FIXTURE);
    await page.waitForSelector('#processingSection:not([hidden])', { timeout: 5000 });
    check('scan: processing panel shown', true);
    await page.waitForSelector('#cardModal[open]', { timeout: 120000 });
    check('scan: result sheet shows a card', await page.isVisible('#sheetFound'));
    check('scan: collector number BLB 64 · DE', await text(page, '#modalCollectorNumber') === 'BLB 64 · DE',
      await text(page, '#modalCollectorNumber'));
    check('scan: localized name shown', await text(page, '#sheetTitle') === CARD.printed_name);
    check('scan: language data loaded from the app itself',
      langRequests.length > 0 && langRequests.every(url => url.startsWith(BASE)), langRequests.join(', '));
    await shot(page, '02-sheet-found');

    // --- Foil + "Hinzufügen"
    await page.click('#finishFoil');
    check('sheet: primary button says Hinzufügen', await text(page, '#sheetPrimaryLabel') === 'Hinzufügen');
    await page.click('#backToScannerBtn');
    await page.waitForFunction(() => !document.getElementById('cardModal').open);
    check('sheet: closes after adding', true);
    check('last scan: shows foil copy', (await text(page, '#lastScanMeta')) === 'Foil · 1× in der Sammlung',
      await text(page, '#lastScanMeta'));

    // --- Reopen, +1 -> "Fertig"
    await page.click('#lastScanOpen');
    await page.click('#increaseQuantity');
    check('sheet: +1 updates quantity', await text(page, '#currentQuantity') === '2');
    check('sheet: button turns into Fertig', await text(page, '#sheetPrimaryLabel') === 'Fertig');
    await page.keyboard.press('Escape');

    // --- Collection view, remove + undo
    await page.click('.tab[data-view="collection"]');
    check('collection: counts', await text(page, '#cardCount') === '1 Karte · 2 Exemplare', await text(page, '#cardCount'));
    await shot(page, '03-collection');
    await page.click('.tile-remove');
    check('collection: removed', await text(page, '#cardCount') === '0 Karten · 0 Exemplare');
    check('collection: empty state', await page.isVisible('#collectionEmpty'));
    await page.click('.notification-action');
    check('collection: undo restores the card', await text(page, '#cardCount') === '1 Karte · 2 Exemplare');
    await page.fill('#collectionSearch', 'perle');
    check('collection: search finds by localized name', await page.locator('.card-tile').count() === 1);
    await page.fill('#collectionSearch', 'zzz');
    check('collection: search without hits', await page.isVisible('#searchEmpty'));
    await page.fill('#collectionSearch', '');

    // --- Workshop: create, rename, delete dialog
    await page.click('.tab[data-view="workshop"]');
    await page.fill('#newCollectionName', 'Commander-Deck');
    await page.press('#newCollectionName', 'Enter');
    const selected = await page.$eval('#collectionSelect', s => s.options[s.selectedIndex].text);
    check('workshop: new collection is active', selected === 'Commander-Deck', selected);
    await page.click('.collection-row.is-active button[data-action="rename"]');
    await page.fill('#confirmInput', 'Tauschordner');
    await page.press('#confirmInput', 'Enter');
    const names = await page.$$eval('.collection-name', els => els.map(el => el.textContent));
    check('workshop: rename via dialog', names.includes('Tauschordner') && !names.includes('Commander-Deck'), names.join(', '));
    await page.click('.collection-row.is-active button[data-action="delete"]');
    check('workshop: delete asks first', await page.$eval('#confirmDialog', d => d.open));
    await page.keyboard.press('Escape');
    check('workshop: cancel keeps the collection', (await page.$$eval('.collection-name', els => els.length)) === 2);
    await page.click('#toggleDebug');
    check('workshop: debug switch', await page.isVisible('#debugSection')
      && await page.getAttribute('#toggleDebug', 'aria-checked') === 'true');
    await shot(page, '04-workshop');

    // --- Manual entry with errors
    await page.click('.tab[data-view="scan"]');
    await page.click('#manualEntry');
    await page.fill('#manualCollectorInput', 'FDN 9999');
    await page.press('#manualCollectorInput', 'Enter');
    await page.waitForSelector('#manualError:not([hidden])');
    check('manual: unknown number', (await text(page, '#manualError')).startsWith('Keine Karte'), await text(page, '#manualError'));
    await page.fill('#manualCollectorInput', 'gibberish');
    await page.press('#manualCollectorInput', 'Enter');
    await page.waitForFunction(() => document.getElementById('manualError').textContent.startsWith('Set-Code'));
    check('manual: unparsable input', true);
    await page.fill('#manualCollectorInput', 'BLB 64');
    await page.press('#manualCollectorInput', 'Enter');
    await page.waitForSelector('#sheetFound:not([hidden])');
    check('manual: short form finds the card', await text(page, '#modalCollectorNumber') === 'BLB 64 · EN');
    await page.keyboard.press('Escape');

    // --- Camera (fake device): live, capture without text, tab switch
    await page.click('#captureCard');
    await page.waitForFunction(() => document.getElementById('stage').dataset.state === 'live');
    check('camera: live', true);
    check('camera: capture button scans now', await text(page, '#captureLabel') === 'Scannen');
    await shot(page, '05-camera-live');
    await page.click('#captureCard');
    await page.waitForSelector('#cardModal[open]', { timeout: 60000 });
    check('camera: no text -> correction sheet', await text(page, '#correctionTitle') === 'Keine Sammlernummer gefunden',
      await text(page, '#correctionTitle'));
    await page.click('#modalCloseBtn');
    await page.click('.tab[data-view="collection"]');
    check('camera: stops on tab switch', !(await page.evaluate(() => Boolean(window.mtgScanner.stream))));
    await page.click('.tab[data-view="scan"]');
    await page.waitForFunction(() => document.getElementById('stage').dataset.state === 'live');
    check('camera: resumes on return', true);
    await page.reload();
    await page.waitForFunction(() => document.getElementById('stage').dataset.state === 'live', null, { timeout: 5000 })
      .then(() => check('camera: auto-starts after reload', true))
      .catch(() => check('camera: auto-starts after reload', false));
    await page.click('#stopCamera');
    check('camera: stop', await stageState(page) === 'idle');

    // --- Desktop width and legal page
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.click('.tab[data-view="collection"]');
    const columns = await page.$eval('#cardList', el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    check('desktop: grid has more columns', columns > 2, `${columns} columns`);
    await page.goto(`${BASE}/privacy.html`);
    const background = await page.$eval('body', el => getComputedStyle(el).backgroundColor);
    check('legal page: uses the app stylesheet', background === 'rgb(14, 42, 44)', background);

    check('no requests to jsdelivr', cdnRequests.length === 0, cdnRequests.join(', '));
    check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
  } finally {
    await browser.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }
}

run()
  .then(() => {
    console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll UI checks passed');
    process.exitCode = failures.length ? 1 : 0;
  })
  .catch(error => {
    console.error('UI smoke test crashed:', error);
    process.exit(1);
  });
