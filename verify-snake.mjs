import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e.message)));

await page.goto('https://textflow.sebland.com/snake', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
const active = await page.evaluate(() =>
  document.querySelector('nav button.active')?.dataset?.mode || '?');
const ver = await page.evaluate(() => document.getElementById('version')?.textContent || '?');

// one tap — this is exactly what triggered the orbit lock
await page.mouse.click(120, 300);
await page.waitForTimeout(4000);
await page.screenshot({ path: '/tmp/tf-snake-a.png', animations: 'disabled', timeout: 60000 });
await page.waitForTimeout(14000);
await page.screenshot({ path: '/tmp/tf-snake-b.png', animations: 'disabled', timeout: 60000 });

console.log(`active=${active} ver=${ver} errors=${errors.length ? errors[0] : 'none'}`);
await browser.close();
