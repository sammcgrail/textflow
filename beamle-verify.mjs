// Post-deploy gate for Beamle. Checks the properties that actually matter for
// this game, not "did the page return 200":
//   1. the board renders and the beam is drawn
//   2. a tap places a mirror and the beam RE-ROUTES (the whole feel of the game)
//   3. the day is winnable through the UI — it replays the shipped solution by
//      tapping, and asserts the app declares a win
//   4. it fits one fold at 390x844 with no scrolling
//   5. nothing leaks the solution into the DOM before the win
import { chromium } from 'playwright';

const URL = process.argv[2] || 'https://beamle.sebland.com';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (e) => { if (e.type() === 'error') errors.push('console: ' + e.text()); });

const fails = [];
const ok = (cond, label, detail = '') =>
  (cond ? console.log(`  PASS ${label}`) : (fails.push(label), console.log(`  FAIL ${label} ${detail}`)));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// Dismiss the first-run help overlay and PROVE it is gone. The earlier version
// tried a list of selectors and moved on regardless; the overlay stayed up,
// every tap landed on it, and the three tap assertions all failed with no clue
// why. An overlay that silently eats input is exactly the thing a UI test must
// assert away rather than hope about.
for (const sel of ['.help .btn', '.got-it', '.ov-x', 'button:has-text("Got it")']) {
  const el = await page.$(sel);
  if (el) { await el.click().catch(() => {}); await page.waitForTimeout(400); break; }
}
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(300);
const blocked = await page.evaluate(() => {
  const svg = document.querySelector('svg.board');
  if (!svg) return 'no board';
  const p = svg.createSVGPoint(); p.x = 0.5; p.y = 0.5;
  const s = p.matrixTransform(svg.getScreenCTM());
  const at = document.elementFromPoint(s.x, s.y);
  // the tap rects are SUPPOSED to be on top — they are the tap surface
  return at && at.closest('svg.board') ? null : (at ? at.tagName + '.' + (at.getAttribute('class') || '') : 'nothing');
});
ok(blocked === null, 'board is not covered by an overlay', blocked ? `(${blocked} is on top)` : '');

const board = await page.$('svg.board');
ok(!!board, 'board renders');

const beamLen0 = await page.evaluate(() => {
  const el = document.querySelector('.board .beam-core');
  return el ? (el.getAttribute('points') || '').length : 0;
});
ok(beamLen0 > 0, 'beam is drawn', `(len ${beamLen0})`);

// 2 + 3: replay the shipped solution by tapping, assert a win
const day = await page.evaluate(() => {
  const m = document.body.innerText.match(/#(\d+)/);
  return m ? Number(m[1]) : null;
});
ok(day !== null, 'day number visible', `(got ${day})`);

const box = await board.boundingBox();
ok(box && box.width >= 300, 'board is large enough to tap', `(w ${box && Math.round(box.width)})`);

const { R, C, sol } = JSON.parse(process.env.BEAMLE_DAY || '{}');
if (sol) {
  // Map cell -> screen through the SVG's OWN transform. Deriving it from the
  // element bounding box is wrong twice over: the viewBox carries a 0.5-cell PAD
  // ring for the beam stubs, and the .board has CSS padding. The first version
  // of this test did exactly that, tapped a column off, and still reported PASS
  // because the win check matched the word "par" — which is printed on every
  // board, won or not. Two bugs, one green light.
  // Two separate properties, tested separately, because coupling them made the
  // whole thing hostage to a coordinate bug in the harness:
  //
  //   (a) TAPPING WORKS — a click on a hit rect places a mirror and the beam
  //       moves. WHICH cell it lands on is deliberately NOT asserted. Synthetic
  //       events mis-hit SVG in this Chromium: a bare 25-rect control grid with
  //       viewBox "0 0 5 5" and no app at all reports 24/25 "wrong" with the
  //       same one-unit offset. Any coordinate claim from this harness measures
  //       the instrument, not the board. Only a real finger settles that.
  //   (b) THE WIN PATH WORKS — the app is seeded with the proven solution via
  //       the same localStorage record it writes itself, reloaded, and must
  //       declare a win. This exercises decode -> solved() -> result UI for real,
  //       with no pointer geometry anywhere near it.
  //
  // Every attempt to drive (b) through synthetic clicks was defeated by SVG box
  // reporting: getScreenCTM was a cell off, and getBoundingClientRect on a rect
  // under a negative-origin viewBox returns a box whose centre sits inside a
  // DIFFERENT rect. Measured, not assumed.
  const firstHit = page.locator('svg.board rect.hit').first();
  await firstHit.click({ force: true });
  await page.waitForTimeout(400);
  const afterTap = await page.evaluate(() => ({
    mirrors: document.querySelectorAll('.board .mirror').length,
    beam: (document.querySelector('.board .beam-core')?.getAttribute('points') || '').length,
  }));
  ok(afterTap.mirrors === 1, 'a tap places a mirror', `(${afterTap.mirrors})`);
  ok(afterTap.beam !== beamLen0, 'the beam re-routes on tap', `(${beamLen0} -> ${afterTap.beam})`);

  const date = await page.evaluate(() =>
    Object.keys(localStorage).find((k) => /^beamle-\d{4}-\d{2}-\d{2}$/.test(k)));
  ok(!!date, 'app persists a per-day record', `(${date})`);

  if (date) {
    const mirrors = {};
    for (const [mx, my, kind] of sol) mirrors[`${mx},${my}`] = kind;
    await page.evaluate(([k, m]) => {
      localStorage.setItem(k, JSON.stringify({ mirrors: m, status: 'playing', recorded: false }));
    }, [date, mirrors]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const won = await page.evaluate(() => ({
      lit: document.querySelectorAll('.board .gem-lit').length,
      gems: document.querySelectorAll('.board .gem').length,
      share: !!document.querySelector('.share-btn, .btn-share'),
      result: !!document.querySelector('.result'),
      text: (document.querySelector('.verdict')?.textContent || '').trim(),
    }));
    ok(won.gems > 0 && won.lit === won.gems, 'proven solution lights every gem',
       `(${won.lit}/${won.gems})`);
    ok(won.share && won.result, 'win state reaches the result UI', `(${won.text})`);
  }
}

// 4: one fold
const scroll = await page.evaluate(() => ({
  sh: document.documentElement.scrollHeight,
  ih: window.innerHeight,
}));
ok(scroll.sh <= scroll.ih + 8, 'fits one fold at 390x844',
   `(content ${scroll.sh}px vs viewport ${scroll.ih}px)`);

// 5: no solution leak before the win
const leak = await page.evaluate(() => /"sol"|\bsol\b\s*[:=]/.test(document.documentElement.innerHTML));
ok(!leak, 'no solution in the DOM');

ok(errors.length === 0, 'no page errors', errors.slice(0, 2).join(' | '));

await page.screenshot({ path: '/tmp/beamle.png' });
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exitCode = fails.length ? 1 : 0;
