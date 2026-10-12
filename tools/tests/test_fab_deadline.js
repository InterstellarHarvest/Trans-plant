// Fabricator deadline lock (re-audit A1, hotfix 2026-10-12): a craft that
// would finish past the voyage deadline (STATE.baseDays) used to show a
// "past arrival" warning, take CRAFT, pay its days up front and end the
// run (time_expired) on the spot. Such a craft is now locked: PAST
// DEADLINE on the button, the warning names the deadline, CRAFT (click
// or Enter) does nothing and no day passes. A craft that fits stays open.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && window.openFabricator && window.craftSelected);
  await page.evaluate(() => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
    for (const m of Object.keys(STATE.materials)) STATE.materials[m] = 40;
    showScreen('screen-cruise');
  });
  const state = () => page.evaluate(() => {
    const btn = document.getElementById('fb-craft-btn');
    const warn = document.querySelector('.fb-warn.overrun');
    return { label: btn.textContent, locked: btn.classList.contains('locked'), warn: warn ? warn.textContent : '', day: STATE.daysElapsed, screen: document.querySelector('.screen.active') && document.querySelector('.screen.active').id, failed: !!STATE.failure };
  });
  console.log('— a craft that would finish past the deadline is locked');
  // The longest open recipe, two days short of the deadline, so it overruns.
  const longest = await page.evaluate(() => {
    STATE.daysElapsed = 0; openFabricator();
    const rows = [...document.querySelectorAll('.fb-recipe-row')].filter(r => !/locked/.test(r.className));
    const days = r => parseInt((r.querySelector('.fb-recipe-days') || {}).textContent, 10) || 0;
    const best = rows.sort((a, b) => days(b) - days(a))[0];
    best.click(); closeFabricator();
    return days(best);
  });
  // Move the deadline, not the clock: jumping daysElapsed would make the
  // crop catch up hundreds of days at once (crop_dead), not time_expired.
  await page.evaluate(() => { window.__base = STATE.baseDays; STATE.baseDays = STATE.daysElapsed; openFabricator(); });
  await page.waitForFunction(() => document.getElementById('fb-craft-btn').textContent.length > 0);
  ok(longest >= 2, 'picked a recipe of ' + longest + ' base days');
  const s0 = await state();
  ok(s0.locked && s0.label === 'PAST DEADLINE', 'CRAFT reads PAST DEADLINE and is locked (' + s0.label + ')');
  ok(/past the deadline/.test(s0.warn), 'warning names the deadline: ' + s0.warn.trim());
  await page.evaluate(() => { document.getElementById('fb-craft-btn').click(); craftSelected(); });
  await page.waitForTimeout(300);
  const s1 = await state();
  ok(s1.day === s0.day && !s1.failed && s1.screen !== 'screen-end', 'CRAFT does nothing: no day passes, no failure (day ' + s1.day + ', screen ' + s1.screen + ')');
  await page.evaluate(() => closeFabricator());
  console.log('— a craft that fits stays craftable');
  await page.evaluate(() => { STATE.baseDays = window.__base; openFabricator(); });
  await page.waitForFunction(() => document.getElementById('fb-craft-btn').textContent.length > 0);
  const s2 = await state();
  ok(!s2.locked && s2.label === 'CRAFT' && !s2.warn, 'day 0: CRAFT open, no overrun warning (' + s2.label + ')');
  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors.slice(0, 3)));
  console.log(`fab_deadline: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
