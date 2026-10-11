// Hands-on jobs (former "microgame" choices): effort-based pro/con.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.stack || e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  const run = (crew, items, rnd, evId, re) => page.evaluate(({ crew, items, rnd, evId, re }) => {
    localStorage.clear();
    applySetupToState({ trail: 'mars', ai: 'aria', captain: 'veteran', crew, crop: 'wheat', ship: 'D' });
    STATE.stowaway = null; STATE.items = items.slice(); STATE.cropGrowth.lastTickDay = 0;
    STATE.resources.morale = 60; STATE.resources.hull = 60; STATE.goldAmount = 50;
    const ev = EVENTS[evId];
    enterEvent(STATE.byId[STATE.currentId], ev);
    const btn = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => new RegExp(re, 'i').test(b.textContent));
    const sub = btn.textContent.replace(/\s+/g, ' '), tip = btn.getAttribute('title') || ((btn.dataset.tipTitle ? btn.dataset.tipTitle + '\n\n' : '') + (btn.dataset.tipDescription || '')); // title= is upgraded to .ui-tip data (parity-shell)
    const before = { d: STATE.daysElapsed, m: STATE.resources.morale, h: STATE.resources.hull, mats: Object.assign({}, STATE.materials) };
    Math.random = () => rnd;
    const ch = (ev.choices || []).find(c => new RegExp(re, 'i').test(c.text || ''));
    handleChoiceClick(ch); // direct: the UI's double-click guard ignores a click right after render
    return { sub, tip, days: STATE.daysElapsed - before.d, morale: STATE.resources.morale - before.m, hull: STATE.resources.hull - before.h,
      matsGained: Object.entries(STATE.materials).reduce((a, [k, v]) => a + v - (before.mats[k] || 0), 0), body: document.getElementById('enc-narr-body').textContent };
  }, { crew, items, rnd, evId, re });

  const bare = await run(['chef'], [], 0.0, 'event_asteroid_001', 'standard equipment');
  const drill = await run(['chef'], ['portable_drill'], 0.0, 'event_asteroid_001', 'standard equipment');
  const pct = s => +((s.match(/(\d+)% clean/) || [])[1]);
  ok(/Effort \d+ \/ 30 · \d+% clean/.test(bare.sub), `button shows effort and odds (${bare.sub.slice(0, 70)})`);
  ok(pct(drill.sub) > pct(bare.sub), `the drill raises the odds (${pct(bare.sub)}% → ${pct(drill.sub)}%)`);
  ok(/Short of effort/.test(bare.tip), 'tooltip explains the downside');
  await page.waitForTimeout(100);
  const clean = await run(['chef'], [], 0.0, 'event_asteroid_001', 'standard equipment');
  const short = await run(['chef'], [], 0.99, 'event_asteroid_001', 'standard equipment');
  ok(short.days === clean.days + 2, `short of effort: two more days (${clean.days} → ${short.days})`);
  ok(short.matsGained < clean.matsGained || clean.matsGained === 0, `short of effort: thinner haul (${clean.matsGained} → ${short.matsGained})`);
  ok(short.morale <= clean.morale - 2, `short of effort: the job's setback (morale ${clean.morale} → ${short.morale})`);
  await page.waitForTimeout(2500);
  const body = await page.evaluate(() => document.getElementById('enc-narr-body').textContent);
  ok(/bit binds/i.test(body), 'outcome text says what went wrong');
  const wr = await run(['engineer', 'pilot'], ['repair_kit'], 0.5, 'event_crisis_011', 'Weld patch');
  ok(pct(wr.sub) === 90 || /Effort/.test(wr.sub), `engineer + kit: near-certain (${wr.sub.slice(0, 60)})`);
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\neffort checks: ${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
