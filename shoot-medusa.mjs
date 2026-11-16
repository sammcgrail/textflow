// Screenshot the medusa mode at phone + desktop; usage: node shoot-medusa.mjs <baseUrl> [tag]
import { chromium } from 'playwright';
import { sandboxed } from '/root/seb/scripts/lib/sebbrowser.mjs';
const base = process.argv[2] || 'https://textflow.sebland.com';
const tag = process.argv[3] || '';
const sizes = [['phone', 390, 844, true], ['desktop', 1440, 900, false]];
// textflow's playwright pins chromium-1208 (not installed); point the sandbox at the installed build
import fs from 'node:fs';
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
    await page.goto(base + '/medusa', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5500);
    const active = await page.evaluate(() =>
      document.querySelector('nav button.active')?.dataset?.mode ||
      document.querySelector('nav button.active')?.textContent?.trim() || '?');
    const ver = await page.evaluate(() => document.getElementById('version')?.textContent || '?');
    const fps = await page.evaluate(() => new Promise(res => { let n = 0; const st = performance.now();
      const step = () => { n++; if (performance.now() - st < 2000) requestAnimationFrame(step); else res(n / 2); }; requestAnimationFrame(step); }));
    await page.screenshot({ path: `/tmp/medusa/${name}${tag}.png`, timeout: 90000 });
    // tap interaction then shoot again
    if (mobile) await page.touchscreen.tap(w * 0.5, h * 0.3); else await page.mouse.click(w * 0.5, h * 0.3);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `/tmp/medusa/${name}${tag}-tap.png`, timeout: 90000 });
    // drag toward the right
    await page.mouse.move(w * 0.5, h * 0.4); await page.mouse.down();
    for (let i = 0; i < 20; i++) { await page.mouse.move(w * (0.5 + i * 0.015), h * (0.4 + i * 0.01)); await page.waitForTimeout(50); }
    await page.mouse.up();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `/tmp/medusa/${name}${tag}-drag.png`, timeout: 90000 });
    const ok = active === 'medusa' && errors.length === 0;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${w}x${h} active=${active} ver=${ver} fps~${fps} pageerrors=${errors.length} ${errors.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(bad ? `${bad} FAILED` : 'ALL PASS');
process.exit(bad ? 1 : 0);
