// Ruling 145: the captain in harm's way. crew_effect target "captain" lands
// on the captain and the preview says whose risk it is ("YOU — …"); an
// untreated festering ("delayed") wound loses HP every travel leg until it is
// treated (the captain's too, medic-softened), and can kill before the next
// station's crisis. Treated, it stops.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && typeof enterEvent === 'function');
  const setup = crew => page.evaluate(crew => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'interstellar', ai: 'marv', captain: 'veteran', crew, crop: 'wheat', ship: 'Q' });
    STATE.stowaway = null; returnToHub();
  }, crew);

  console.log('— target "captain"');
  await setup(['pilot', 'engineer']);
  const hit = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 12; i++) {
      STATE.captainHP = 100; STATE.crewHP = { pilot: 100, engineer: 100 };
      applyOutcomeEffects({ crew_effect: { type: 'injure', target: 'captain' }, severity: 'injury', time_cost: 'none' });
      out.push([STATE.captainHP, STATE.crewHP.pilot, STATE.crewHP.engineer].join('/'));
    }
    return out;
  });
  ok(hit.every(h => /^35\/100\/100$/.test(h)), 'a severity aimed at the captain lands on the captain every time (' + hit[0] + ')');
  const prev = await page.evaluate(() => outcomeFacts({ crew_effect: { type: 'injure', target: 'captain' }, severity: 'lethal' }).map(f => f.text).join(' | '));
  ok(/YOU — A DEATH RISK/.test(prev), 'the preview says whose risk it is: ' + prev);
  const prev2 = await page.evaluate(() => outcomeFacts({ crew_effect: { type: 'injure', target: 'crew' }, severity: 'lethal' }).map(f => f.text).join(' | '));
  ok(!/YOU/.test(prev2), 'a crew risk does not say YOU: ' + prev2);

  console.log('— a festering wound worsens every leg');
  await setup(['pilot', 'engineer']);
  const fester = await page.evaluate(() => {
    STATE.captainHP = 100;
    applySeverity('captain', 'delayed');
    const hp = [STATE.captainHP];
    // One real leg (into a stop that isn't a station: a station would fire
    // the delayed crisis, as it always has), then the legs' tick directly.
    const from = STATE.nodes.find(n => connectionsOf(n).some(id => STATE.byId[id].node_type !== 'station'));
    STATE.currentId = from.id; STATE.resources.fuel = 100;
    document.body.classList.remove('stop-active');
    travelTo(connectionsOf(from).find(id => STATE.byId[id].node_type !== 'station'), { skipEvent: true });
    hp.push(STATE.captainHP);
    for (let i = 0; i < 2; i++) { festerWounds(); hp.push(STATE.captainHP); }
    return { hp, pend: !!crewPendingOf().captain, log: (STATE.shipLog || []).filter(e => /wound is worse/.test(e.text)).length };
  });
  const drops = fester.hp.slice(1).map((h, i) => fester.hp[i] - h);
  ok(fester.hp[0] === 35 && drops.every(d => d >= 4), `the captain's festering wound drops every leg: ${fester.hp.join(' → ')}`);
  ok(fester.log >= 3, "the Ship's Log says so each leg (" + fester.log + ')');

  const medic = await page.evaluate(() => {
    applySetupToState({ trail: 'interstellar', ai: 'marv', captain: 'veteran', crew: ['medic', 'engineer'], crop: 'wheat', ship: 'Q' });
    STATE.stowaway = null; returnToHub();
    STATE.captainHP = 100; applySeverity('captain', 'delayed');
    const h0 = STATE.captainHP;
    festerWounds();
    return h0 - STATE.captainHP;
  });
  ok(medic > 0 && medic < 7, `a medic aboard softens it (−${medic} a leg, not −7)`);

  const treated = await page.evaluate(() => {
    STATE.captainHP = 50; // back over the wound line: treated
    const h0 = STATE.captainHP;
    festerWounds();
    return { same: STATE.captainHP === h0 };
  });
  ok(treated.same, 'treated (back over the wound line), it stops worsening');

  const kills = await page.evaluate(() => {
    applySetupToState({ trail: 'interstellar', ai: 'marv', captain: 'veteran', crew: ['pilot'], crop: 'wheat', ship: 'Q' });
    STATE.stowaway = null; returnToHub();
    STATE.captainHP = 6; crewPendingOf().captain = true;
    festerWounds();
    checkFailure();
    return { hp: STATE.captainHP, ended: !!STATE.ended, title: (document.getElementById('screen-end').innerText || '').slice(0, 60) };
  });
  ok(kills.hp === 0 && kills.ended, 'left untreated it can kill the captain: the run ends (' + kills.title.replace(/\s+/g, ' ').trim().slice(0, 30) + ')');

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
