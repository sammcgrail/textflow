import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox'] });
for (const u of ['https://vennle.sebland.com','https://ladderle.sebland.com','https://sortle.sebland.com']) {
  
  for (const vp of [[390,844],[360,740],[320,568]]) {
    const p = await b.newPage({ viewport: { width: vp[0], height: vp[1] } });
    await p.goto(u, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2000);
    const r = await p.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: window.innerHeight }));
    console.log(`${u.split('//')[1].split('.')[0].padEnd(9)} ${vp[0]}x${vp[1]}  content ${r.sh} vs ${r.ih}  ${r.sh<=r.ih+8?'FITS':'OVERFLOWS by '+(r.sh-r.ih)}`);
    await p.close();
  }
}
await b.close();
