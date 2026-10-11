// A1 battery: wound line, severity tiers, passive halving, delayed
// crisis at station arrival, medbay, save round-trip.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.stack || e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404|ERR_FILE_NOT_FOUND/.test(m.text())) errors.push(m.text()); });

  const boot = async (crew, captain = 'veteran') => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
    await page.evaluate(({ crew, captain }) => {
      applySetupToState({ trail: 'mars', ai: 'marv', captain, crew, crop: 'wheat', ship: 'Test' });
      STATE.stowaway = null;
    }, { crew, captain });
    await page.waitForTimeout(150);
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const withRandom = (v, fn) => page.evaluate(({ v, src }) => {
    const real = Math.random; Math.random = () => v;
    try { return (0, eval)('(' + src + ')')(); } finally { Math.random = real; }
  }, { v, src: fn.toString() });

  console.log('— wound line + injury');
  await boot(['engineer', 'pilot']);
  ok(await ev(() => CREW_WOUNDED_HP === 40 && CREW_CRITICAL_HP === 25), 'constants 40 / 25');
  await withRandom(0.0, () => applyOutcomeEffects({ severity: 'injury', crew_effect: { target: 'specific_role', role: 'engineer' }, time_cost: 'trivial' }));
  ok(await ev(() => STATE.crewHP.engineer) === 35, 'severity injury → engineer at 35 HP (under the line)');
  ok(await ev(() => activeTriggers().has('crew_injured')), 'crew_injured trigger active');
  ok(await ev(() => passiveMult('engineer')) === 0.5 && await ev(() => passiveMult('pilot')) === 1 && await ev(() => passiveMult('medic')) === 0, 'passiveMult 0.5 wounded / 1 healthy / 0 absent');
  await ev(() => { STATE.crewHP.engineer = 40; });
  ok(!(await ev(() => activeTriggers().has('crew_injured'))), 'exactly 40 HP is not wounded');
  await ev(() => { STATE.crewHP.engineer = 39; });
  ok(await ev(() => activeTriggers().has('crew_injured')), '39 HP is wounded');
  await withRandom(0.0, () => applyOutcomeEffects({ severity: 'injury', crew_effect: { target: 'specific_role', role: 'engineer' }, time_cost: 'trivial' }));
  ok(await ev(() => STATE.crewHP.engineer) === 24, 're-injury of a wounded member: −15 (39→24), never lethal');
  await ev(() => { STATE.crewHP.engineer = 8; });
  await withRandom(0.0, () => applyOutcomeEffects({ severity: 'injury', crew_effect: { target: 'specific_role', role: 'engineer' }, time_cost: 'trivial' }));
  ok(await ev(() => STATE.crewHP.engineer) === 5 && await ev(() => STATE.crew.includes('engineer')), 'injury floors at 5 HP');

  console.log('— dossier + cruise bar');
  await ev(() => { STATE.crewHP.engineer = 39; returnToHub(); });
  await page.waitForTimeout(200);
  const bar = await ev(() => { const s = [...document.querySelectorAll('.crew-slot')].find(x => /engineer/i.test(x.textContent)); return s ? s.innerHTML : ''; });
  ok(/d4a830/.test(bar), 'cruise HP bar amber at 39');
  await ev(() => openCrewDetail('engineer'));
  await page.waitForTimeout(250);
  const statusTxt = await ev(() => document.getElementById('cd-status-active').textContent);
  ok(/Wounded/.test(statusTxt), 'dossier shows Wounded at 39');
  ok(await ev(() => !document.getElementById('cd-passive-warn').classList.contains('hidden')), 'dossier passive "effect halved" warning shown');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await ev(() => { STATE.crewHP.engineer = 45; renderCruise(); });
  const bar2 = await ev(() => { const s = [...document.querySelectorAll('.crew-slot')].find(x => /engineer/i.test(x.textContent)); return s ? s.innerHTML : ''; });
  ok(!/d4a830|cc5555/.test(bar2), 'cruise HP bar neutral at 45 (old amber line was 60)');

  console.log('— medic softening (passive halved)');
  await boot(['engineer', 'medic']);
  await ev(() => damageCrew('engineer', 35));
  ok(await ev(() => STATE.crewHP.engineer) === 79, 'healthy medic: 35 dmg → 21 (×0.6)');
  await ev(() => { STATE.crewHP.engineer = 100; STATE.crewHP.medic = 30; damageCrew('engineer', 35); });
  ok(await ev(() => STATE.crewHP.engineer) === 72, 'wounded medic: 35 dmg → 28 (×0.8)');

  console.log('— lethal');
  await boot(['engineer', 'pilot']);
  await withRandom(0.99, () => applyOutcomeEffects({ severity: 'lethal', crew_effect: { target: 'specific_role', role: 'pilot' }, time_cost: 'trivial' }));
  ok(await ev(() => !STATE.crew.includes('pilot') && STATE.flags.has('crew_lost')), 'lethal, no medic/medkit → pilot dies, crew_lost');
  await boot(['engineer', 'medic']);
  await withRandom(0.3, () => applyOutcomeEffects({ crew_effect: { type: 'kill', target: 'specific_role', role: 'engineer' }, time_cost: 'trivial' }));
  ok(await ev(() => STATE.crew.includes('engineer') && STATE.crewHP.engineer === 35), 'kill with healthy medic, roll 0.3 < 0.5 → softened to injury');
  await ev(() => { STATE.crewHP.medic = 30; STATE.crewHP.engineer = 100; });
  await withRandom(0.3, () => applyOutcomeEffects({ severity: 'lethal', crew_effect: { target: 'specific_role', role: 'engineer' }, time_cost: 'trivial' }));
  ok(await ev(() => !STATE.crew.includes('engineer')), 'wounded medic halves the save (0.3 ≥ 0.25) → dies');
  await boot(['engineer'], 'medic');
  await withRandom(0.1, () => applyOutcomeEffects({ severity: 'lethal', crew_effect: { target: 'specific_role', role: 'engineer' }, time_cost: 'trivial' }));
  ok(await ev(() => STATE.crew.includes('engineer')), 'medic captain: authored 15% softer landing (roll 0.1)');

  console.log('— delayed → crisis at station');
  await boot(['engineer', 'pilot']);
  await withRandom(0.0, () => applyOutcomeEffects({ severity: 'delayed', crew_effect: { target: 'specific_role', role: 'engineer' }, time_cost: 'trivial' }));
  ok(await ev(() => STATE.crewPending.engineer === true && STATE.crewHP.engineer === 35), 'delayed → wounded + pending');
  await ev(() => openCrewDetail('engineer')); await page.waitForTimeout(200);
  ok(/Pending crisis/.test(await ev(() => document.getElementById('cd-status-active').textContent)), 'dossier shows Pending crisis');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  // A non-station leg: no crisis.
  const nonStation = await ev(() => STATE.nodes.find(n => n.node_type !== 'station' && n.node_type !== 'fork' && n.id !== STATE.currentId && !(Array.isArray(n.connects_to) && !n.connects_to.length)).id);
  await ev(id => { travelTo(id); }, nonStation);
  await page.waitForTimeout(250);
  ok(await ev(() => !(STATE.currentEvent && (STATE.currentEvent.trigger || []).includes('delayed_crisis')) && STATE.crewPending.engineer), 'non-station arrival: no crisis, still pending');
  const station = await ev(() => STATE.nodes.find(n => n.node_type === 'station' && Array.isArray(n.connects_to) && n.connects_to.length).id);
  await ev(() => { STATE.goldAmount = 100; STATE.currentEvent = null; });
  await ev(id => travelTo(id), station);
  await page.waitForTimeout(400);
  const crisisId = await ev(() => STATE.currentEvent && STATE.currentEvent.id);
  ok(['event_crisis_021', 'event_crisis_022'].includes(crisisId), 'station arrival fires delayed_crisis (' + crisisId + ')');
  ok(await ev(() => STATE.crisisPatient === 'engineer' && !STATE.crewPending.engineer), 'patient = engineer, pending consumed');
  await page.waitForTimeout(1500);
  const body = await ev(() => { finishAllTyping && finishAllTyping(); return document.getElementById('enc-narr-body').textContent; });
  ok(/Kazuki/.test(body) && !/\{patient/.test(body), '{patient.name} → Kazuki in body');
  await ev(() => document.querySelector('#enc-choices .enc-choice:not(.locked)').click());
  await page.waitForTimeout(300);
  ok(await ev(() => STATE.crewHP.engineer === 100), 'paid treatment heals the patient to full');
  ok(await ev(() => STATE.goldAmount === 60 || STATE.goldAmount === 65), 'clinic fee charged (' + await ev(() => STATE.goldAmount) + ')');

  console.log('— crisis lethal targets the patient');
  await boot(['engineer', 'pilot']);
  await ev(() => { STATE.crisisPatient = 'engineer'; });
  await withRandom(0.99, () => applyOutcomeEffects({ resources: { morale: -5 }, crew_effect: { type: 'kill', target: 'patient' }, severity: 'lethal', time_cost: 'trivial' }));
  ok(await ev(() => !STATE.crew.includes('engineer') && STATE.crew.includes('pilot')), 'lethal + target patient kills the patient, nobody else');

  console.log('— treated before the station: closes quietly');
  await boot(['engineer', 'pilot']);
  await withRandom(0.0, () => applyOutcomeEffects({ severity: 'delayed', crew_effect: { target: 'specific_role', role: 'pilot' }, time_cost: 'trivial' }));
  await ev(() => { STATE.crewHP.pilot = 100; });
  const st2 = await ev(() => STATE.nodes.find(n => n.node_type === 'station' && Array.isArray(n.connects_to) && n.connects_to.length).id);
  await ev(id => travelTo(id), st2);
  await page.waitForTimeout(300);
  ok(await ev(() => !(STATE.currentEvent && (STATE.currentEvent.trigger || []).includes('delayed_crisis')) && !STATE.crewPending.pilot), 'healed pending wound closes, no crisis');
  ok(await ev(() => (STATE.shipLog || []).some(e => /wound closed clean/.test(e.text || e))), 'log: wound closed clean');

  console.log('— medbay');
  await boot(['engineer', 'pilot']);
  const st3 = await ev(() => STATE.nodes.find(n => n.node_type === 'station' && Array.isArray(n.connects_to) && n.connects_to.length).id);
  await ev(id => { STATE.currentId = id; STATE.currentEvent = null; returnToHub(); }, st3);
  await page.waitForTimeout(200);
  await page.click('#stop-btn'); await page.waitForTimeout(150);
  const reopenStop = async () => {
    await ev(() => { document.body.classList.remove('stop-active'); document.getElementById('stop-btn').textContent = 'Stop'; returnToHub(); });
    await page.waitForTimeout(150); await page.click('#stop-btn'); await page.waitForTimeout(150);
  };
  const medbayBtn = async () => ev(() => { const b = [...document.querySelectorAll('#stop-choices .stop-choice')].find(x => /MEDBAY/.test(x.textContent)); return b ? { cls: b.className, txt: b.textContent } : null; });
  let mb = await medbayBtn();
  ok(mb && /locked/.test(mb.cls) && /HEALTHY/.test(mb.txt), 'MEDBAY present at station, locked with nobody hurt');
  await ev(() => { STATE.crewHP.pilot = 30; STATE.crewPending.pilot = true; STATE.goldAmount = 10; });
  await reopenStop();
  mb = await medbayBtn();
  ok(mb && /locked/.test(mb.cls) && /30g/.test(mb.txt), 'locked with fee shown when short of gold');
  await ev(() => { STATE.goldAmount = 50; });
  await reopenStop();
  mb = await medbayBtn();
  ok(mb && !/locked/.test(mb.cls), 'unlocked when someone is hurt and gold suffices');
  await ev(() => [...document.querySelectorAll('#stop-choices .stop-choice')].find(x => /MEDBAY/.test(x.textContent)).click());
  await page.waitForTimeout(200);
  ok(await ev(() => STATE.crewHP.pilot === 100 && STATE.goldAmount === 20 && !STATE.crewPending.pilot), 'treated: pilot 100 HP, −30g, pending cleared');
  mb = await medbayBtn();
  ok(mb && /locked/.test(mb.cls), 'verb re-gates to locked after treatment');
  const deepSpace = await ev(() => {
    const n = STATE.nodes.find(x => x.node_type === 'void' || x.node_type === 'nebula' || x.node_type === 'derelict');
    return n && n.id;
  });
  if (deepSpace) {
    await ev(id => { STATE.currentId = id; }, deepSpace);
    await reopenStop();
    ok(!(await medbayBtn()), 'no MEDBAY away from stations');
  }

  console.log('— save round-trip');
  await ev(() => { STATE.crewPending = { engineer: true }; saveRun(); STATE.crewPending = {}; loadRun(); });
  ok(await ev(() => STATE.crewPending && STATE.crewPending.engineer === true), 'crewPending persists through save/load');
  await ev(() => { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); delete s.crewPending; localStorage.setItem(SAVE_KEY, JSON.stringify(s)); STATE.crewPending = { pilot: true }; loadRun(); });
  ok(await ev(() => STATE.crewPending && Object.keys(STATE.crewPending).length === 0), 'legacy save without crewPending → empty');
  await ev(() => clearSave());

  console.log('— event content');
  const content = await ev(() => ({
    planet: EVENTS.event_planet_002.choices[1].outcome.severity,
    anomaly1: EVENTS.event_anomaly_001.choices[3].outcome.severity,
    injuredPool: Object.values(EVENTS).filter(e => (e.trigger || []).includes('crew_injured')).length,
    crisisPool: Object.values(EVENTS).filter(e => (e.trigger || []).includes('delayed_crisis')).length,
  }));
  ok(content.planet === 'injury' && content.anomaly1 === null, 'planet_002 injury kept; anomaly_001 "trivial" removed');
  ok(content.injuredPool === 3 && content.crisisPool === 2, 'crew_injured pool 3, delayed_crisis pool 2');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\nA1: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
