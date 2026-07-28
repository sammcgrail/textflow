import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox'] });
for (const [u, w, h] of [['https://beamle.sebland.com',390,740],['https://beamle.sebland.com',360,640],['https://ladderle.sebland.com',360,640]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(u, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2000);
  const el = await p.$('.help .btn'); if (el) await el.click().catch(()=>{});
  await p.waitForTimeout(400);
  const before = await p.evaluate(() => window.scrollY);
  await p.mouse.wheel(0, 400);
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => ({ y: window.scrollY, sh: document.documentElement.scrollHeight, ih: window.innerHeight,
    ta: getComputedStyle(document.documentElement).touchAction, ov: getComputedStyle(document.body).overflowY }));
  const needs = r.sh > r.ih + 4;
  console.log(`${u.split('//')[1].split('.')[0]} ${w}x${h}: content ${r.sh}/${r.ih} ${needs?'(needs scroll)':'(fits)'} scrolled ${before}->${r.y} ${needs ? (r.y>0?'SCROLLS ✓':'BLOCKED ✗') : 'n/a'}  touch-action:${r.ta}`);
  await p.close();
}
await b.close();
