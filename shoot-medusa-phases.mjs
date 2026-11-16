// Shoot medusa at chosen stroke phases (s since last beat), after beat N; usage:
// node shoot-medusa-phases.mjs <baseUrl> <outdir> <phone|desktop> <afterBeat> <phase,phase,...>
import { chromium } from 'playwright';
import { sandboxed } from '/root/seb/scripts/lib/sebbrowser.mjs';
import fs from 'node:fs';
const [base, out, which, afterBeat, phasesArg] = process.argv.slice(2);
const phases = (phasesArg || '0.05,0.4,0.95,1.7').split(',').map(Number);
fs.mkdirSync(out, { recursive: true });
const want = chromium.executablePath();
const bt = fs.existsSync(want) ? chromium : { executablePath: () => '/root/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome' };
const browser = await chromium.launch(sandboxed(bt, { args: ['--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }));
const [w, h, mobile] = which === 'phone' ? [390, 844, true] : [1440, 900, false];
const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e.message)));
await page.goto(base + '/medusa', { waitUntil: 'domcontentloaded' });
const nb = +(afterBeat || 2);
for (const ph of phases) {
  // wait for a beat count >= nb and phase in [ph, ph+0.08), freeze rAF while shooting
  await page.waitForFunction(([nb, ph]) => {
    const p = window.__medusaPhase;
    return (window.__medusaBeats || 0) >= nb && p >= ph && p < ph + 0.1;
  }, [nb, ph], { timeout: 60000, polling: 'raf' });
  const got = await page.evaluate(() => window.__medusaPhase);
  const p = `${out}/${which}-ph${ph.toFixed(2)}.png`;
  await page.screenshot({ path: p, timeout: 90000 });
  console.log(`${p} phase=${got.toFixed(2)}`);
}
console.log(`pageerrors=${errors.length} ${errors.slice(0, 3).join(' | ')}`);
await browser.close();
process.exit(errors.length ? 1 : 0);
