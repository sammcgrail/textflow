#!/usr/bin/env node
// Record a textflow mode as an og:video share clip (Sam 2026-10-23: iMessage/Slack/Discord
// previews then play the mode inline). Frame-stepped, so the clip is smooth even though
// headless Chromium renders WebGL in software at ~1 fps: requestAnimationFrame is replaced by
// a fake clock and every captured frame advances the mode by STEP 60-fps ticks.
//
//   node scripts/record-og-video.mjs <mode> [frames=450] [step=3] [outdir=/tmp/tfrec-<mode>]
//   then: ffmpeg -framerate 30 -i <outdir>/f%04d.png -c:v libx264 -preset slow -crf 22 \
//           -pix_fmt yuv420p -movflags +faststart static/videos/<mode>.mp4
//   and a poster: static/videos/<mode>.jpg; dims in static/videos/<mode>.json {"width","height"}.
// generate-og-pages.mjs picks the mp4 up at build time and adds og:video tags.
// Viewport 640x400 @2x = 1280x800 output: big enough cells to read on a phone.
// Needs a long warm-up (150 ticks) at 2x before GPU modes draw anything.
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [mode, N = 450, STEP = 3, out = '/tmp/tfrec-' + mode] = process.argv.slice(2);
if (!mode) { console.error('usage: record-og-video.mjs <mode> [frames] [step] [outdir]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 })).newPage();
await page.addInitScript(() => {
  let q = [], ts = 1000;
  window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  window.__step = n => { for (let i = 0; i < n; i++) { ts += 1000 / 60; const c = q; q = []; c.forEach(f => f(ts)); } };
});
await page.goto('https://textflow.sebland.com/' + mode + '/', { waitUntil: 'networkidle' });
await page.addStyleTag({ content: 'nav,header,.nav,#nav,.fps,#fps,#version{display:none!important}' });
for (let i = 0; i < 150; i++) { await page.evaluate(() => window.__step(1)); await page.waitForTimeout(50); }
for (let f = 0; f < +N; f++) {
  await page.evaluate(s => window.__step(s), +STEP);
  await page.screenshot({ path: `${out}/f${String(f).padStart(4, '0')}.png` });
}
await browser.close();
console.log('frames in', out);
