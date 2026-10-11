// Hunt 5 hotfix: deprivation counts only the days actually spent at 0
// (a 6–10 day leg used to count every day, ending runs on the leg a
// resource merely ran out on), the onset span can't reach the failure on
// its own, and the end report / cinematic stay inside the 640px frame.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; page.on('pageerror', e => errs.push(e.stack || e.message));
  const ev = (fn, a) => page.evaluate(fn, a);
  const boot = async (trail) => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
    await ev(t => { localStorage.removeItem('transplant_save_v1'); applySetupToState({ trail: t, ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' }); STATE.stowaway = null; STATE.resources.morale = 100; }, trail);
    await page.waitForTimeout(150);
  };

  console.log('— a leg counts only its dry days');
  await boot('mars');
  let s = await ev(() => { STATE.resources.o2 = 0.5; STATE.cropGrowth.health = 10; passDays(7); const f = checkFailure(); return { dep: STATE.deprived.o2, ended: !!STATE.ended || f, hp: STATE.crewHP.engineer }; });
  ok(s.dep <= 2 && !s.ended, `O2 0.5 over a 7-day leg: ${s.dep} dry day(s), run continues (was 7 → suffocation)`);
  await boot('lunar');
  s = await ev(() => { STATE.resources.water = 1.5; passDays(6); const f = checkFailure(); return { dep: STATE.deprived.water, ended: !!STATE.ended || f }; });
  ok(s.dep === 2 && !s.ended, `water 1.5 over 6 days: 2 dry days (got ${s.dep}), alive`);
  await boot('interstellar');
  s = await ev(() => { STATE.resources.food = 2; passDays(10); const f = checkFailure(); return { dep: STATE.deprived.food, ended: !!STATE.ended || f }; });
  ok(s.dep < 10 && !s.ended, `food 2 over 10 days: ${s.dep} dry days, alive`);

  console.log('— onset grace, then the counter bites');
  await boot('mars');
  s = await ev(() => { STATE.resources.o2 = 0; passDays(8); const f = checkFailure(); return { dep: STATE.deprived.o2, ended: !!STATE.ended || f }; });
  ok(s.dep === 2 && !s.ended, `leaving with 0 O2 on an 8-day leg: capped at 2 (got ${s.dep}) — one stop to react`);
  await ev(() => { passDays(1); checkFailure(); });
  await page.waitForTimeout(400);
  ok(/Last Breath/i.test(await ev(() => document.getElementById('screen-end').innerText)), 'the next dry day is suffocation');
  await boot('mars');
  s = await ev(() => { STATE.resources.o2 = 0; passDays(1); passDays(1); return STATE.deprived.o2; });
  ok(s === 2, 'day-by-day counting unchanged (2)');

  console.log('— end report fits the frame');
  await boot('interstellar');
  await ev(() => {
    const pay = MOD.flavor.flag_payoffs;
    Object.keys(pay).slice(0, 12).forEach(f => STATE.flags.add(f));
    STATE.daysElapsed = 100;
    triggerArrival(STATE.nodes.find(n => connectionsOf(n).length === 0));
  });
  await page.waitForTimeout(800);
  const inFrame = async (sel) => ev(sel => {
    const g = document.getElementById('game').getBoundingClientRect();
    const b = [...document.querySelectorAll(sel)].filter(x => x.offsetParent);
    return b.length > 0 && b.every(x => { const r = x.getBoundingClientRect(); return r.top >= g.top - 1 && r.bottom <= g.bottom + 1; });
  }, sel);
  ok(await inFrame('#end-cine-group button'), 'cinematic buttons inside the frame');
  await ev(() => window.showEndReport());
  await page.waitForTimeout(300);
  ok(await inFrame('#end-report-actions .btn'), 'report Back / New Run inside the frame');
  s = await ev(() => { const c = document.getElementById('end-report-scroll'); return { sh: c.scrollHeight, ch: c.clientHeight, ov: getComputedStyle(c).overflowY }; });
  ok(s.ov === 'auto' && s.ch <= 640, `report text scrolls (scroll ${s.sh} / view ${s.ch})`);
  ok(await ev(() => document.querySelectorAll('.end-record-line').length) > 0, 'Ship\'s Record present');

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\nhotfix depriv/report: ${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
