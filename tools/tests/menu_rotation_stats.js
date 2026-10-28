// MENU-002H: the rotation with REAL randomness (no stubbed Math.random).
// N fresh page loads, no parameter; each load's TITLE_VIEW.id, the number of
// Math.random calls made from background-views.js (stack-checked: one draw
// per load), and any failed request. Reports counts and Pearson's chi-square
// against equal quarters (3 d.f.; 7.815 = the 5% critical value).
//   URL=<served>/index.html N=400 node tools/tests/menu_rotation_stats.js
//   (Firefox: PW_BROWSER=firefox with the pw_firefox_shim.js require). Not a
//   run_all battery: hundreds of loads, and real chance, so a rare fail is
//   expected; test_title_overlay.js proves the draw itself deterministically.
const { chromium } = require('playwright');
const URL = process.env.URL, N = +(process.env.N || 400);
const browserName = process.env.PW_BROWSER === 'firefox' ? 'firefox' : 'chromium';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 960, height: 640 } });
  await ctx.addInitScript(() => { const real = Math.random; window.__viewDraws = 0; Math.random = function () { if (/background-views\.js/.test(new Error().stack || '')) window.__viewDraws++; return real.apply(this, arguments); }; });
  const counts = {}, bad = [], drawsPerLoad = {};
  const page = await ctx.newPage();
  page.on('response', r => { if (r.status() >= 400 && /interface\/menu\//.test(r.url())) bad.push(r.status() + ' ' + r.url()); });
  page.on('pageerror', e => bad.push('pageerror ' + e.message));
  for (let i = 0; i < N; i++) {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.TITLE_VIEW && TITLE_VIEW.id, null, { timeout: 30000 });
    const r = await page.evaluate(() => ({ id: TITLE_VIEW.id, n: window.__viewDraws }));
    counts[r.id] = (counts[r.id] || 0) + 1; drawsPerLoad[r.n] = (drawsPerLoad[r.n] || 0) + 1;
  }
  await browser.close();
  const e = N / 4, chi = ['earth', 'mars', 'ringed', 'nebula'].reduce((s, v) => s + ((counts[v] || 0) - e) ** 2 / e, 0);
  const res = { browser: browserName, loads: N, counts, expectedEach: e, chiSquare: +chi.toFixed(3), df: 3, critical5pct: 7.815, uniformNotRejected: chi < 7.815,
    onlyActive: Object.keys(counts).every(k => ['earth', 'mars', 'ringed', 'nebula'].includes(k)), drawsPerLoad, failures: bad };
  console.log(JSON.stringify(res, null, 1));
  process.exit(res.uniformNotRejected && res.onlyActive && Object.keys(drawsPerLoad).join() === '1' && !bad.length ? 0 : 1);
})();
