// Minigame quit rule: quit after BEGIN = nothing kept + a day; briefing
// close = free cancel; ✕ on the result screen = normal completion.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.stack || e.message));
  const boot = async () => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
    await page.evaluate(() => { applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['pilot'], crop: 'wheat', ship: 'Q' }); STATE.stowaway = null;
      const n = STATE.nodes.find(x => x.node_type !== 'fork' && x.node_type !== 'station'); n.node_type = 'derelict'; STATE.currentId = n.id; returnToHub(); });
    await page.waitForTimeout(300);
  };
  const st = () => page.evaluate(() => ({ day: STATE.daysElapsed, mats: JSON.stringify(STATE.materials), food: STATE.resources.food,
    log: (STATE.shipLog || []).map(e => (typeof e === 'string' ? e : e.text)).slice(-1)[0] || '', ov: document.getElementById('overlay-minigames').classList.contains('active') }));
  const verb = async (re) => {
    await page.evaluate(() => { document.body.classList.remove('stop-active'); document.getElementById('stop-btn').textContent = 'Stop'; returnToHub(); }); // lands stopped: menu open
    await page.waitForTimeout(150);
    await page.evaluate(re => [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => new RegExp(re).test(b.textContent)).click(), re);
    await page.waitForTimeout(400);
  };

  console.log('— Stop-menu SALVAGE');
  await boot();
  let a = await st();
  await verb('SALVAGE');
  await page.click('#mclose'); await page.waitForTimeout(250);
  let b = await st();
  ok(!b.ov && b.day === a.day && b.mats === a.mats, 'close on the briefing = free cancel (no day, nothing)');
  await verb('SALVAGE');
  await page.click('#rstart'); await page.waitForTimeout(1500);
  await page.click('#mclose'); await page.waitForTimeout(300);
  b = await st();
  ok(!b.ov && b.day > a.day && b.mats === a.mats, `quit mid-game: day spent (${a.day}→${b.day}), materials unchanged`);
  ok(/abandoned/i.test(b.log), 'log says abandoned');
  // Result-screen ✕ = completion (force a result via the game's own path).
  a = await st();
  await verb('SALVAGE');
  await page.click('#rstart'); await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('result').classList.add('show')); await page.waitForTimeout(200);
  await page.click('#mclose'); await page.waitForTimeout(300);
  b = await st();
  ok(!b.ov && /SALVAGE — recovered/.test(b.log) && !/abandoned/.test(b.log), '✕ on the result screen = normal completion (result path, not a quit)');

  console.log('— Stop-menu SCAN quit');
  a = await st();
  await page.evaluate(() => { const n = (STATE.nodes.find(x => x.node_type === 'nebula' || x.node_type === 'anomaly' || x.node_type === 'void') || Object.assign(STATE.nodes.find(x => x !== STATE.nodes[0] && !['station', 'fork'].includes(x.node_type) && (STATE.byId[STATE.currentId] !== x)), { node_type: 'nebula' })); STATE.currentId = n.id; });
  await verb('SCAN');
  await page.click('#rstart'); await page.waitForTimeout(800);
  await page.mouse.click(20, 20); // backdrop click = same as ✕
  await page.waitForTimeout(300);
  b = await st();
  ok(!b.ov && b.day > a.day && /SCAN — abandoned/.test(b.log), 'backdrop click after BEGIN = quit (day spent)');

  console.log('— engine repair');
  const rep = await page.evaluate(() => {
    const before = { hull: STATE.resources.hull = 50, day: STATE.daysElapsed };
    const real = window.openEngineRepair;
    window.openEngineRepair = cb => cb({ fixedCount: 2, allFixed: false });
    const btn = () => [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /REPAIR/.test(b.textContent));
    return before;
  });
  await page.evaluate(() => { window.openEngineRepair = cb => cb({ fixedCount: 2, allFixed: false }); });
  await verb('REPAIR');
  b = await page.evaluate(() => ({ hull: STATE.resources.hull, day: STATE.daysElapsed, log: (STATE.shipLog || []).map(e => (typeof e === 'string' ? e : e.text)).slice(-1)[0] }));
  ok(b.hull === 50 && b.day > rep.day && /REPAIR — abandoned/.test(b.log), 'partial repair abandon: no hull, day spent');
  await page.evaluate(() => { window.openEngineRepair = cb => cb({ fixedCount: 0, allFixed: false }); });
  const d0 = await page.evaluate(() => STATE.daysElapsed);
  await verb('REPAIR');
  ok(await page.evaluate(d0 => STATE.daysElapsed === d0, d0), 'walking out before fixing anything = free cancel');

  console.log('— event-launched minigame quit (crisis_017 BREACH)');
  await boot();
  await page.evaluate(() => { STATE.resources.hull = 20; STATE.resources.o2 = 60; STATE.resources.morale = 60; enterEvent(STATE.byId[STATE.currentId], EVENTS.event_crisis_017); });
  await page.waitForTimeout(500);
  a = await page.evaluate(() => ({ hull: STATE.resources.hull, o2: STATE.resources.o2, mo: STATE.resources.morale, day: STATE.daysElapsed }));
  await page.evaluate(() => [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')][0].click());
  await page.waitForTimeout(500);
  await page.click('#mclose'); await page.waitForTimeout(250);
  const cancel = await page.evaluate(() => ({ outcome: STATE.outcomeMode, ev: STATE.currentEvent && STATE.currentEvent.id }));
  ok(!cancel.outcome && cancel.ev === 'event_crisis_017', 'briefing close in an event = back to the choices');
  await page.evaluate(() => [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')][0].click());
  await page.waitForTimeout(500);
  await page.click('#rstart'); await page.waitForTimeout(700);
  await page.click('#mclose'); await page.waitForTimeout(400);
  b = await page.evaluate(() => ({ hull: STATE.resources.hull, o2: STATE.resources.o2, mo: STATE.resources.morale, day: STATE.daysElapsed, outcome: STATE.outcomeMode,
    title: document.getElementById('enc-narr-title').textContent }));
  ok(b.outcome && b.title === 'ABANDONED', 'quit resolves the choice as ABANDONED');
  ok(b.hull === a.hull && Math.abs(b.o2 - (a.o2 - 8)) <= 0.2 * (b.day - a.day) + 0.01 && b.mo === a.mo - 4 && b.day > a.day, `poor-tier losses only, no gains (hull ${a.hull}→${b.hull}, o2 ${a.o2}→${b.o2}, morale ${a.mo}→${b.mo})`);

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\nquit rule: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
