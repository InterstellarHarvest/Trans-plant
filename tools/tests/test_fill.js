// Window-fill check: cabinet fills the window (letterboxed) at large and
// small sizes; real clicks at scaled coordinates still land.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of [[1920, 1080], [1440, 1200], [800, 600]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
    await page.evaluate(() => { applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'Fill' }); STATE.stowaway = null; });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const b = document.getElementById('game').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }; });
    const s = Math.min(w / 960, h / 640);
    ok(Math.abs(r.w - 960 * s) < 1 && Math.abs(r.h - 640 * s) < 1, `${w}×${h}: cabinet ${Math.round(r.w)}×${Math.round(r.h)} (scale ${s.toFixed(2)})`);
    ok(r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= w + 0.5 && r.y + r.h <= h + 0.5, `${w}×${h}: fully on screen, centred (left ${Math.round(r.x)}, top ${Math.round(r.y)})`);
    ok(r.sw <= w && r.sh <= h, `${w}×${h}: no scrollbars`);
    // Real mouse click at the scaled position of a crew slot → dossier opens.
    const slot = await page.$$('.crew-slot');
    await slot[1].click();
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.getElementById('overlay-crew').classList.contains('active')), `${w}×${h}: real click on a crew slot opens the dossier`);
    if (w === 1920) await page.screenshot({ path: __dirname + '/shot_fill_1920.png' });
    ok(!errors.length, `${w}×${h}: no page errors`);
    await page.close();
  }
  console.log(`\nfill: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
