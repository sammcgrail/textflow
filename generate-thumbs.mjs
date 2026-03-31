import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

var BASE = 'http://localhost:20004/textflow/';
var THUMB_DIR = '/root/textflow/static/thumbs';
var VIEWPORT = { width: 1200, height: 630 };
var RENDER_WAIT = 3000;

await mkdir(THUMB_DIR, { recursive: true });

var browser = await chromium.launch({ headless: true });
var context = await browser.newContext({ viewport: VIEWPORT });

// Get mode list from the page
var listPage = await context.newPage();
await listPage.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
await listPage.waitForFunction(() => {
  var nav = document.querySelector('nav');
  return nav && nav.querySelectorAll('button[data-mode]').length > 10;
}, { timeout: 30000 });

// Wait for FPS to start (engine is running)
await listPage.waitForFunction(() => {
  var fps = document.querySelector('#fps');
  return fps && !fps.textContent.startsWith('0 ');
}, { timeout: 15000 });

var allModes = await listPage.$$eval('button[data-mode]', btns => btns.map(b => b.dataset.mode));
await listPage.close();

console.log('Found ' + allModes.length + ' modes');

// Skip modes needing webcam/video/sensor
var SKIP = new Set([
  'webcam', 'handpose', 'facemesh', 'cat', 'buttons', 'facepass', 'headcube',
  'camtrail', 'camhalftone', 'camdepth', 'faceglitch', 'facepaint', 'facemirror',
  'handfire', 'handlaser', 'handgravity', 'handsmash', 'handball', 'fruiteat',
  'facebricks', 'facepong', 'story', 'fingercount', 'photostory', 'sunsmile',
  'faceballoon', 'threefacecube', 'cloud', 'tilttext', 'tiltmaze', 'tiltpour',
  'vidascii', 'vidcow', 'vidscenes', 'vidfootball', 'vidclowns', 'vidneon',
  'vidjellyfish', 'vidlava', 'vidcity', 'vidocean', 'vidfireworks',
  'vidgears', 'vidink', 'vidaurora', 'vidgyro', 'vidstars'
]);

var targetModes = process.argv[2] ? process.argv[2].split(',') : allModes.filter(m => !SKIP.has(m));

var captured = 0;
var failed = 0;

// Use a single page, navigate to base, then switch modes via button clicks
var page = await context.newPage();
page.on('pageerror', () => {});

// Load the app once
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForFunction(() => {
  var nav = document.querySelector('nav');
  return nav && getComputedStyle(nav).opacity === '1';
}, { timeout: 30000 });

for (var mode of targetModes) {
  if (SKIP.has(mode)) continue;

  try {
    // Click mode button
    var btn = await page.$('button[data-mode="' + mode + '"]');
    if (!btn) { console.log('  SKIP: ' + mode + ' (no button)'); continue; }
    await btn.scrollIntoViewIfNeeded();
    await btn.click();

    // Wait for it to become active
    await page.waitForFunction(
      (id) => {
        var b = document.querySelector('button[data-mode="' + id + '"]');
        return b && b.classList.contains('active');
      },
      mode,
      { timeout: 10000 }
    );

    // Let it render
    await page.waitForTimeout(RENDER_WAIT);

    // Move mouse to center for modes that respond to mouse
    await page.mouse.move(600, 315);
    await page.waitForTimeout(500);

    // Hide UI for clean thumbnail
    await page.evaluate(() => {
      var nav = document.querySelector('nav');
      if (nav) nav.style.display = 'none';
      var info = document.getElementById('info-bar');
      if (info) info.style.display = 'none';
    });

    await page.screenshot({ path: THUMB_DIR + '/' + mode + '.png' });

    // Show UI again for next mode
    await page.evaluate(() => {
      var nav = document.querySelector('nav');
      if (nav) nav.style.display = '';
      var info = document.getElementById('info-bar');
      if (info) info.style.display = '';
    });

    console.log('  OK: ' + mode);
    captured++;
  } catch (err) {
    console.log('  FAIL: ' + mode + ' - ' + err.message.split('\n')[0]);
    failed++;
    // Restore UI
    await page.evaluate(() => {
      var nav = document.querySelector('nav');
      if (nav) nav.style.display = '';
      var info = document.getElementById('info-bar');
      if (info) info.style.display = '';
    }).catch(() => {});
  }
}

await browser.close();
console.log('\nDone: ' + captured + ' captured, ' + failed + ' failed');
