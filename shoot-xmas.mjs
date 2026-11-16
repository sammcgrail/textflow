// Local shooter for the xmas-modes branch.
// usage: node shoot-xmas.mjs <baseUrl> <mode> [phone|desktop|both] [midMs] [endMs]
// Shoots build-up mid + finished, then tap + drag; reports pageerrors.
import { chromium } from 'playwright';
import { sandboxed } from '/root/seb/scripts/lib/sebbrowser.mjs';
import fs from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:4917/textflow';
const mode = process.argv[3] || 'xmastree';
const which = process.argv[4] || 'both';
const midMs = +(process.argv[5] || 4500);
const endMs = +(process.argv[6] || 13000);
const out = '/tmp/xmas';
fs.mkdirSync(out, { recursive: true });
const sizes = [['phone', 390, 844, true], ['desktop', 1440, 900, false]].filter(s => which === 'both' || s[0] === which);
const want = chromium.executablePath();
const bt = fs.existsSync(want) ? chromium : { executablePath: () => '/root/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome' };
const browser = await chromium.launch(sandboxed(bt, { args: ['--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }));
let bad = 0;
try {
  for (const [name, w, h, mobile] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    const t0 = Date.now();
    await page.goto(base + '/' + mode, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(Math.max(0, midMs - (Date.now() - t0)));
    await page.screenshot({ path: `${out}/${mode}-${name}-mid.png`, timeout: 90000 });
    await page.waitForTimeout(Math.max(0, endMs - (Date.now() - t0)));
    const active = await page.evaluate(() =>
      document.querySelector('nav button.active')?.dataset?.mode ||
      document.querySelector('nav button.active')?.textContent?.trim() || '?');
    const fps = await page.evaluate(() => new Promise(res => { let n = 0; const st = performance.now();
      const step = () => { n++; if (performance.now() - st < 2000) requestAnimationFrame(step); else res(n / 2); }; requestAnimationFrame(step); }));
    await page.screenshot({ path: `${out}/${mode}-${name}-done.png`, timeout: 90000 });
    // tap the middle of the scene (tree / carousel body)
    const tx = w * 0.5, ty = h * 0.55;
    if (mobile) await page.touchscreen.tap(tx, ty); else await page.mouse.click(tx, ty);
    await page.waitForTimeout(150);
    if (mobile) await page.touchscreen.tap(w * 0.52, h * 0.45); else await page.mouse.click(w * 0.52, h * 0.45);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${mode}-${name}-tap.png`, timeout: 90000 });
    // drag sideways (wind / spin)
    await page.mouse.move(w * 0.2, h * 0.3); await page.mouse.down();
    for (let i = 0; i < 20; i++) { await page.mouse.move(w * (0.2 + i * 0.03), h * 0.3); await page.waitForTimeout(40); }
    await page.mouse.up();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${mode}-${name}-drag.png`, timeout: 90000 });
    // tap the sky corner (rebuild) and shoot the restart
    if (mobile) await page.touchscreen.tap(w * 0.5, h * 0.06 + 40); else await page.mouse.click(w * 0.5, 70);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${mode}-${name}-rebuild.png`, timeout: 90000 });
    const ok = active === mode && errors.length === 0;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${mode} ${name} ${w}x${h} active=${active} fps~${fps} pageerrors=${errors.length} ${errors.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(bad ? `${bad} FAILED` : 'ALL PASS');
process.exit(bad ? 1 : 0);
