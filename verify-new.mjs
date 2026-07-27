import { chromium } from 'playwright';

const URLS = [
  'https://sebland.com/textflow/loom',
  'https://sebland.com/textflow/penrose',
  'https://textflow.sebland.com/loom',
  'https://textflow.sebland.com/penrose',
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
let bad = 0;

for (const url of URLS) {
  const want = url.split('/').pop();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  // ASSERT THE MODE, not merely that something rendered.
  const active = await page.evaluate(() =>
    document.querySelector('nav button.active')?.dataset?.mode ||
    document.querySelector('nav button.active')?.textContent?.trim() || '?');
  const ver = await page.evaluate(() => document.getElementById('version')?.textContent || '?');

  const frames = await page.evaluate(() => new Promise(res => {
    let n = 0;
    const step = () => { n++; if (n < 300) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    setTimeout(() => res(n), 1000);
  }));

  await page.mouse.click(195, 520);
  await page.waitForTimeout(1200);
  try { await page.screenshot({ path: `/tmp/tf-${want}.png`, animations: 'disabled', timeout: 60000 }); } catch {}

  const ok = active === want && errors.length === 0 && frames > 5;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${url}\n     want=${want} active=${active} ver=${ver} fps~${frames} err=${errors.length ? errors[0].slice(0, 90) : 'none'}`);
  await page.close();
}

await browser.close();
console.log(bad === 0 ? 'ALL PASS' : `${bad} FAILED`);
