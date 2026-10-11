// Story-flag payoffs: Ship's Record on end screens + AI callbacks.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const SHOTS = '/private/tmp/claude-501/-Users-MrDashiki-Experiments---Projects/5937297f-20f8-46a4-a8d5-47b10c715833/scratchpad/';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.stack || e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  const setup = ai => page.evaluate(ai => {
    localStorage.clear();
    applySetupToState({ trail: 'mars', ai, captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
    STATE.stowaway = null;
  }, ai);

  // Callbacks: a flagged choice comes back two+ legs later, once, in the active AI's voice.
  await setup('marv');
  const cb = await page.evaluate(() => {
    const pay = MOD.flavor.flag_payoffs;
    STATE.flags.add('made_contact');
    showScreen('screen-cruise'); renderCruise();
    Math.random = () => 0.01;
    const lines = [];
    for (let i = 0; i < 6; i++) {
      STATE.cropGrowth.lastTickDay = STATE.daysElapsed;
      Object.assign(STATE.resources, { fuel: 100, food: 100, water: 100, o2: 100, hull: 100, morale: 100 });
      if (STATE.byId[STATE.currentId].node_type === 'fork') STATE.flags.add('chose_alpha');
      const n = [...nextAvailableNodes()][0];
      if (!n) break;
      travelTo(n, { skipEvent: true });
    }
    return { hits: STATE.shipLog.filter(e => e.text === '◆ ' + pay.made_contact.callback.marv).length, calledBack: STATE.calledBack.slice() };
  });
  ok(cb.hits === 1 && cb.calledBack.includes('made_contact'), `MARV brings up the contact once (${cb.hits}×)`);
  const saved = await page.evaluate(() => { saveRun(); STATE.calledBack = []; loadRun(); return STATE.calledBack.includes('made_contact') && 'made_contact' in STATE.flagFirstSeen; });
  ok(saved, 'callback memory survives save/load');

  // Ship's Record on an arrival report.
  await setup('aria');
  const rec = await page.evaluate(() => {
    for (const f of ['departed', 'made_contact', 'ate_space_cheese', 'entered_combat', 'returned_seed_pod', 'scanned_anomaly', 'flew_through_anomaly']) STATE.flags.add(f);
    STATE.cropGrowth.lastTickDay = STATE.daysElapsed;
    triggerArrival(STATE.nodes.find(n => connectionsOf(n).length === 0));
    window.showEndReport();
    const box = document.getElementById('end-report-quote-record');
    return { lines: box ? [...box.querySelectorAll('.end-record-line')].map(x => x.textContent) : [], shown: box && box.style.display !== 'none' };
  });
  ok(rec.shown && rec.lines.length === 5, `arrival report: Ship's Record with 5 lines (${rec.lines.length})`);
  ok(rec.lines.some(l => /seed pod/i.test(l)) && rec.lines.some(l => /alien transmission/i.test(l)), 'the weightiest choices make the record');
  ok(!rec.lines.some(l => /^— Departed/i.test(l)), 'routine launch flag is left out when better ones exist');
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOTS + 'record_arrival.png' });

  // …and under the epitaph on a failure.
  await setup('rex');
  const fl = await page.evaluate(() => {
    STATE.flags.add('entered_combat'); STATE.flags.add('made_contact');
    STATE.resources.hull = 0; checkFailure();
    const box = document.getElementById('end-cine-quote-record');
    return { n: box ? box.querySelectorAll('.end-record-line').length : 0, shown: box && box.style.display !== 'none' };
  });
  ok(fl.shown && fl.n === 2, `failure screen: record under the epitaph (${fl.n} lines)`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOTS + 'record_failure.png' });

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\nflag payoffs: ${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
