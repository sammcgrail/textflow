// Burst-shoot medusa across a pulse cycle; usage: node shoot-medusa2.mjs <baseUrl> <outdir> [phone|desktop|both] [startMs] [n] [gapMs]
import { chromium } from 'playwright';
import { sandboxed } from '/root/seb/scripts/lib/sebbrowser.mjs';
import fs from 'node:fs';
const base = process.argv[2] || 'https://textflow.sebland.com';
const out = process.argv[3] || '/tmp/medusa2';
const which = process.argv[4] || 'both';
const startMs = +(process.argv[5] || 4000), n = +(process.argv[6] || 8), gap = +(process.argv[7] || 250);
fs.mkdirSync(out, { recursive: true });
const want = chromium.executablePath();
const bt = fs.existsSync(want) ? chromium : { executablePath: () => '/root/.cache/ms-playwright/chromium-1255/chrome-linux-arm64/chrome' };
const browser = await chromium.launch(sandboxed(bt, { args: ['--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }));
const sizes = [['phone', 390, 844, true], ['desktop', 1440, 900, false]].filter(s => which === 'both' || s[0] === which);
let bad = 0;
try {
  for (const [name, w, h, mobile] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    const t0 = Date.now();
    await page.goto(base + '/medusa', { waitUntil: 'domcontentloaded' });
    const shots = [];
    for (let i = 0; i < n; i++) {
      const due = startMs + i * gap - (Date.now() - t0);
      if (due > 0) await page.waitForTimeout(due);
      const p = `${out}/${name}-b${String(i).padStart(2, '0')}.png`;
      await page.screenshot({ path: p, timeout: 90000 });
      shots.push(`${p}@${((Date.now() - t0) / 1000).toFixed(2)}s`);
    }
    const active = await page.evaluate(() => document.querySelector('nav button.active')?.dataset?.mode || document.querySelector('nav button.active')?.textContent?.trim() || '?');
    const ver = await page.evaluate(() => document.getElementById('version')?.textContent || '?');
    if (mobile) await page.touchscreen.tap(w * 0.5, h * 0.3); else await page.mouse.click(w * 0.5, h * 0.3);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${name}-tap.png`, timeout: 90000 });
    await page.mouse.move(w * 0.5, h * 0.4); await page.mouse.down();
    for (let i = 0; i < 20; i++) { await page.mouse.move(w * (0.5 + i * 0.015), h * (0.4 + i * 0.01)); await page.waitForTimeout(50); }
    await page.mouse.up(); await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${name}-drag.png`, timeout: 90000 });
    const ok = active === 'medusa' && errors.length === 0;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${w}x${h} active=${active} ver=${ver} pageerrors=${errors.length} ${errors.slice(0, 3).join(' | ')}`);
    console.log(shots.join('\n'));
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(bad ? `${bad} FAILED` : 'ALL PASS');
process.exit(bad ? 1 : 0);
