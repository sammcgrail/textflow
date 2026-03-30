import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const BASE = 'http://localhost:3999/textflow/';
const SCREENSHOT_DIR = '/root/textflow/test-screenshots';
const TIMEOUT = 15000;

await mkdir(SCREENSHOT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

// Collect console errors
const consoleErrors = [];
const consoleWarnings = [];

let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[${name}] ${msg.text()}`);
    if (msg.type() === 'warning') consoleWarnings.push(`[${name}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => consoleErrors.push(`[${name}] PAGE ERROR: ${err.message}`));

  try {
    await fn(page);
    passed++;
    results.push(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    results.push(`  FAIL: ${name}\n        ${err.message.split('\n')[0]}`);
  } finally {
    await page.close();
  }
}

async function waitForReady(page) {
  // Wait for nav to become visible (engine ready)
  await page.waitForFunction(() => {
    const nav = document.querySelector('nav');
    return nav && getComputedStyle(nav).opacity === '1';
  }, { timeout: TIMEOUT });
}

async function waitForModeActive(page, modeId) {
  await page.waitForFunction(
    (id) => {
      const btn = document.querySelector(`button[data-mode="${id}"]`);
      return btn && btn.classList.contains('active');
    },
    modeId,
    { timeout: TIMEOUT }
  );
}

async function switchModeViaClick(page, modeId) {
  // Click the mode button — it may need scrolling into view
  const btn = await page.$(`button[data-mode="${modeId}"]`);
  if (!btn) throw new Error(`Button for mode "${modeId}" not found`);
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await waitForModeActive(page, modeId);
}

async function screenshot(page, name) {
  const path = `${SCREENSHOT_DIR}/${name}.png`;
  await page.screenshot({ path });
  return path;
}

// ── Test 1: App loads and shows nav bar ──
await test('Test 1: App loads and shows nav bar', async (page) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForReady(page);

  const canvas = await page.$('canvas#c');
  if (!canvas) throw new Error('Canvas element not found');

  // Wait for FPS to start updating (not stuck at 0)
  await page.waitForFunction(() => {
    const fps = document.querySelector('#fps');
    return fps && !fps.textContent.startsWith('0 ');
  }, { timeout: TIMEOUT });

  await screenshot(page, '01-app-loaded');
});

// ── Test 2: Core mode renders (default — random core mode) ──
await test('Test 2: Core mode renders (default)', async (page) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForReady(page);

  // Wait for any button to become active (random mode is chosen)
  await page.waitForFunction(() => {
    return !!document.querySelector('button.active[data-mode]');
  }, { timeout: TIMEOUT });

  const activeMode = await page.$eval('button.active[data-mode]', (el) => el.dataset.mode);
  if (!activeMode) throw new Error('No active mode button found');

  await screenshot(page, '02-default-mode');
});

// ── Test 3: Mode switching works for each group ──
// Navigate to base first, then switch via button click (lazy loading)
const groupTests = [
  { group: 'Simulation', mode: 'mandel' },
  { group: 'Retro', mode: 'crt' },
  { group: 'Video', mode: 'vidascii' },
  { group: 'Roto', mode: 'rotozoomer' },
  { group: 'Three.js', mode: 'textcube' },
  { group: 'Webcam', mode: 'webcam' },
];

for (const { group, mode } of groupTests) {
  await test(`Test 3: ${group} group (${mode})`, async (page) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await waitForReady(page);

    // Switch via button click (triggers lazy loading)
    await switchModeViaClick(page, mode);

    const isActive = await page.$eval(`button[data-mode="${mode}"]`, (el) => el.classList.contains('active'));
    if (!isActive) throw new Error(`${mode} button not active`);

    await screenshot(page, `03-${group.toLowerCase()}-${mode}`);
  });
}

// ── Test 4: Click interactions work ──
await test('Test 4: Click interactions (mandel)', async (page) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForReady(page);

  await switchModeViaClick(page, 'mandel');

  // Click on canvas
  const canvas = await page.$('canvas#c');
  await canvas.click();
  await page.waitForTimeout(500);

  // FPS should still be > 0
  const fpsText = await page.$eval('#fps', (el) => el.textContent);
  const fpsNum = parseInt(fpsText);
  if (isNaN(fpsNum) || fpsNum === 0) throw new Error(`FPS stuck at 0 after click: "${fpsText}"`);

  await screenshot(page, '04-click-interaction');
});

// ── Test 5: Mode switching via button click ──
await test('Test 5: Mode switching via button click', async (page) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForReady(page);

  // Wait for initial mode to be active (random)
  await page.waitForFunction(() => {
    return !!document.querySelector('button.active[data-mode]');
  }, { timeout: TIMEOUT });

  const initialMode = await page.$eval('button.active[data-mode]', (el) => el.dataset.mode);

  // Pick a different core mode to switch to
  const targetMode = initialMode === 'fire' ? 'rain' : 'fire';
  await switchModeViaClick(page, targetMode);

  const targetActive = await page.$eval(`button[data-mode="${targetMode}"]`, (el) => el.classList.contains('active'));
  const initialStillActive = await page.$eval(`button[data-mode="${initialMode}"]`, (el) => el.classList.contains('active'));

  if (!targetActive) throw new Error(`${targetMode} button not active after click`);
  if (initialStillActive) throw new Error(`${initialMode} button still active after switching to ${targetMode}`);

  await screenshot(page, '05-button-click-switch');
});

// ── Test 6: Three.js mode loads and renders ──
await test('Test 6: Three.js mode loads and renders', async (page) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForReady(page);

  await switchModeViaClick(page, 'textcube');

  // Wait extra for three.js chunk to load and render
  await page.waitForTimeout(2000);

  // Check for overlay canvas or that main canvas is present
  const hasOverlay = await page.$('[data-mode-overlay]');
  const hasCanvas = await page.$('canvas#c');
  if (!hasOverlay && !hasCanvas) throw new Error('No canvas found for three.js mode');

  await screenshot(page, '06-threejs-textcube');
});

// ── Test 7: Three.js cleanup on mode switch ──
await test('Test 7: Three.js cleanup on mode switch', async (page) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForReady(page);

  // Switch to a three.js mode
  await switchModeViaClick(page, 'threeterrain');
  await page.waitForTimeout(1500);

  // Switch to lava
  await switchModeViaClick(page, 'lava');

  // Check no visible overlay canvases
  const visibleOverlays = await page.$$eval('[data-mode-overlay]', (els) =>
    els.filter((el) => getComputedStyle(el).display !== 'none').length
  );
  if (visibleOverlays > 0) throw new Error(`${visibleOverlays} overlay canvas(es) still visible after switching away from three.js`);

  const lavaActive = await page.$eval('button[data-mode="lava"]', (el) => el.classList.contains('active'));
  if (!lavaActive) throw new Error('lava not active after switch from threeterrain');

  await screenshot(page, '07-threejs-cleanup');
});

// ── Summary ──
await browser.close();

console.log('\n═══════════════════════════════════════');
console.log('  TEXTFLOW VITE BUILD — TEST RESULTS');
console.log('═══════════════════════════════════════\n');
results.forEach((r) => console.log(r));
console.log(`\n  Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}\n`);

if (consoleErrors.length > 0) {
  console.log('  Browser Console Errors:');
  consoleErrors.forEach((e) => console.log(`    ${e}`));
  console.log('');
}
if (consoleWarnings.length > 0) {
  console.log(`  Browser Console Warnings: ${consoleWarnings.length} (suppressed)`);
  console.log('');
}

console.log(`  Screenshots saved to: ${SCREENSHOT_DIR}/`);

process.exit(failed > 0 ? 1 : 0);
