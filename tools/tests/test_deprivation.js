// Food / water / O2 at zero: HP + morale drain, onset log, dedicated failures.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const errs = []; page.on('pageerror', e => errs.push(e.stack || e.message));
  const ev = (fn, a) => page.evaluate(fn, a);
  const boot = async (crew = ['engineer', 'pilot']) => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
    await ev(c => { localStorage.removeItem('transplant_save_v1'); applySetupToState({ trail: 'interstellar', ai: 'marv', captain: 'veteran', crew: c, crop: 'wheat', ship: 'D' }); STATE.stowaway = null; setCrewMorale(100); }, crew);
    await page.waitForTimeout(200);
  };

  console.log('— food');
  await boot();
  await ev(() => { STATE.resources.food = 0; passDays(1); });
  let s = await ev(() => ({ hp: STATE.crewHP.engineer, mo: crewMoraleRaw(), dep: STATE.deprived.food, log: (STATE.shipLog || []).map(e => e.text || e).join('|') }));
  ok(s.hp === 96 && s.dep === 1, `one day at 0 food: crew −4 HP (${s.hp}), counter 1`);
  ok(s.mo < 100, `morale drops (${s.mo.toFixed(1)})`);
  ok(/FOOD GONE/.test(s.log), 'onset warning logged once');
  await ev(() => { passDays(8); checkFailure(); });
  ok(await ev(() => !STATE.ended && STATE.deprived.food === 9), '9 days: still alive, counter 9');
  await ev(() => { passDays(1); checkFailure(); });
  await page.waitForTimeout(500);
  ok(await ev(() => STATE.ended && document.querySelector('.screen.active').id === 'screen-end'), '10th day at 0 food → run ends');
  ok(/Empty Larder/i.test(await ev(() => document.getElementById('screen-end').innerText)), 'starvation failure screen ("Empty Larder")');

  console.log('— refill resets');
  await boot();
  await ev(() => { STATE.resources.food = 0; passDays(5); STATE.resources.food = 30; passDays(1); });
  ok(await ev(() => STATE.deprived.food === 0), 'counter resets once food is back above 0');

  console.log('— O2 + medic softening');
  await boot(['engineer', 'medic']);
  await ev(() => { STATE.resources.o2 = 0; STATE.resources.food = 100; passDays(1); });
  s = await ev(() => ({ hp: STATE.crewHP.engineer, dep: STATE.deprived.o2 }));
  ok(s.hp === 100 - Math.round(12 * 0.6) && s.dep === 1, `O2 day: −12 HP softened by medic to −7 (${s.hp})`);
  await ev(() => { passDays(2); checkFailure(); });
  await page.waitForTimeout(500);
  ok(/Last Breath/i.test(await ev(() => document.getElementById('screen-end').innerText)), '3rd day at 0 O2 → suffocation screen');

  console.log('— water');
  await boot();
  await ev(() => { STATE.resources.water = 0; passDays(4); checkFailure(); });
  ok(await ev(() => !STATE.ended && STATE.crewHP.engineer === 76), '4 dry days: alive, −24 HP');
  await ev(() => { passDays(1); checkFailure(); });
  await page.waitForTimeout(500);
  ok(/Dry Run/i.test(await ev(() => document.getElementById('screen-end').innerText)), '5th dry day → dehydration screen');

  console.log('— save round-trip');
  await boot();
  await ev(() => { STATE.resources.food = 0; passDays(3); STATE.currentEvent = null; saveRun(); STATE.deprived = {}; loadRun(); });
  ok(await ev(() => STATE.deprived.food === 3), 'deprivation counter survives save/load');

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\ndeprivation: ${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
