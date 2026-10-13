// Role concerns (ruling 57; GAME_BIBLE §8 "per-crew morale drives
// desertion at the individual level"): on top of the group changes each
// role minds its own part of the ship (crew_roster.json morale_concern) —
// botanist the crop, engineer the hull, chef the rations and an empty
// galley, medic injuries and deaths, pilot the pace, diplomat a fight,
// xenobiologist an alien find — and whoever is wounded takes it
// personally. Pins each concern's amount, that every preview showing it
// is the outcome (outcomeFacts, choiceCostLines, the combat end card, the
// Orders panel, the growbay Yield row), the why on the MO tooltip and the
// dossier, the one cruise-log line, a stowaway taking the role's concern,
// and a scripted desertion: one member falls alone to 0, is warned, and
// walks at the next station while the crew average never reaches mutiny.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.captains && MOD.ai_companions && MOD.failures);
  await page.evaluate(() => localStorage.removeItem('transplant_save_v1'));
  return page;
}
async function boot(setup) {
  const page = await open();
  await page.evaluate(o => {
    applySetupToState(Object.assign({ trail: 'mars', ai: 'aria', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'R' }, o));
    STATE.stowaway = null;
    showScreen('screen-cruise');
    renderCruise();
  }, setup || {});
  await page.waitForTimeout(150);
  return page;
}
const logText = page => page.evaluate(() => (STATE.shipLog || []).map(e => (e && e.text) || e).join(' | '));

(async () => {
  browser = await chromium.launch();

  console.log('— data: every role carries its concerns in crew_roster.json');
  {
    const page = await boot();
    const r = await page.evaluate(() => MOD.crew_roster.map(c => ({ role: c.role, ids: Object.keys(c.morale_concern || {}), wounded: (c.morale_concern || {}).wounded })));
    ok(r.length === 7 && r.every(c => c.wounded && c.wounded.morale < 0), 'all 7 roles take a wound (' + r.map(c => c.role + ' ' + (c.wounded || {}).morale).join(', ') + ')');
    ok(new Set(r.map(c => c.wounded.morale)).size === 1, 'every role takes a wound alike (a random target\'s preview is exact)');
    const want = { botanist: ['crop_drop', 'crop_recovery', 'harvest'], engineer: ['hull_damage'], medic: ['injury', 'death'], pilot: ['slow_pace', 'fast_pace'], chef: ['short_rations', 'food_gone'], diplomat: ['combat'], xenobiologist: ['alien_find'] };
    ok(r.every(c => want[c.role].every(id => c.ids.includes(id))), 'each role has its own concern(s): ' + r.map(c => c.role + ':' + c.ids.filter(i => i !== 'wounded').join('/')).join(' '));
    // The sizes the balance sims settled on (see the ruling 57 report).
    const T = await page.evaluate(() => { const K = (r, id) => MOD.crew_roster.find(c => c.role === r).morale_concern[id]; return {
      w: K('engineer', 'wounded').morale, hull: [K('engineer', 'hull_damage').morale, K('engineer', 'hull_damage').per],
      crop: [K('botanist', 'crop_drop').morale, K('botanist', 'crop_recovery').morale, K('botanist', 'harvest').morale, K('botanist', 'crop_drop').per],
      medic: [K('medic', 'injury').morale, K('medic', 'death').morale], chef: [K('chef', 'short_rations').per_day.vending, K('chef', 'food_gone').per_day],
      pilot: [K('pilot', 'slow_pace').per_travel_day.light, K('pilot', 'fast_pace').per_travel_day.ludicrous, K('pilot', 'fast_pace').per_travel_day.plaid],
      dip: K('diplomat', 'combat').morale, xeno: K('xenobiologist', 'alien_find').morale }; });
    ok(JSON.stringify(T) === JSON.stringify({ w: -25, hull: [-6, 10], crop: [-10, 2, 5, 10], medic: [-12, -25], chef: [-0.3, -2], pilot: [-0.3, 0.1, 0.2], dip: -20, xeno: 3 }), 'tuned sizes: ' + JSON.stringify(T));
    await page.close();
  }

  console.log('— engineer: hull damage, scaled; the preview names it');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      setCrewMorale(60);
      const out = {};
      out.prev = outcomeFacts({ resources: { hull: -20 } }).map(f => f.text);
      out.prevMo = outcomeFacts({ resources: { hull: -20, morale: -3 } }).map(f => f.text);
      out.cost = choiceCostLines({ outcome: { resources: { hull: -20, morale: -3 }, time_cost: 'none' } });
      applyOutcomeEffects({ resources: { hull: -20, morale: -3 }, time_cost: 'none' });
      out.after = Object.assign({}, STATE.crewMorale);
      // An armed emergency patch takes the hit: no damage, no concern, and the preview says so.
      STATE.flags.add('emergency_patch_armed');
      out.patchPrev = outcomeFacts({ resources: { hull: -20 } }).map(f => f.text);
      applyOutcomeEffects({ resources: { hull: -20 }, time_cost: 'none' });
      out.patched = Object.assign({}, STATE.crewMorale);
      out.tip = [...document.querySelectorAll('#crew-strip .crew-slot')].map(s => (s.querySelector('.crew-bar.mo') || {}).title || '');
      renderCruise();
      out.tip = [...document.querySelectorAll('#crew-strip .crew-bar.mo')].map(b => b.title || b.dataset.tipDescription || '');
      return out;
    });
    ok(r.prev.includes('ENGINEER −12 MORALE'), '−20 hull previews ENGINEER −12 MORALE: ' + r.prev.join(', '));
    ok(r.prevMo.includes('−3 MORALE · ENGINEER −12'), 'with crew morale: "−3 MORALE · ENGINEER −12": ' + r.prevMo.join(', '));
    ok(r.cost.some(l => /−3 MORALE · ENGINEER −12/.test(l)), 'the hover cost line says it too: ' + r.cost.join(' / '));
    ok(r.after.engineer === 45 && r.after.medic === 57, 'outcome: engineer 60−3−12 = 45, medic 57 (' + JSON.stringify(r.after) + ')');
    ok(!r.patchPrev.some(t => /ENGINEER/.test(t)) && r.patched.engineer === 45, 'patched hit: no ENGINEER in the preview (' + r.patchPrev.join(', ') + '), none landed');
    ok(r.tip.some(t => /^Morale 45\/100 — the hull damage weighs on the engineer$/.test(t)), 'MO tooltip says why: "' + r.tip.join('" / "') + '"');
    await page.close();
  }

  console.log('— botanist: crop swings net per 10 points; harvest; the Yield row says it');
  {
    const page = await boot({ crew: ['botanist', 'medic'] });
    const r = await page.evaluate(() => {
      tickCropGrowth();
      setCrewMorale(60);
      STATE.cropGrowth.health = 80; STATE.cropGrowth.swing = 0;
      const out = {};
      out.prev = outcomeFacts({ crop_health: -20 }).map(f => f.text);
      applyOutcomeEffects({ crop_health: -20, time_cost: 'none' });
      out.drop = crewMoraleOf('botanist');
      // Two −5 swings: the second completes ten points.
      applyOutcomeEffects({ crop_health: -5, time_cost: 'none' });
      out.half = crewMoraleOf('botanist');
      out.prev2 = outcomeFacts({ crop_health: -5 }).map(f => f.text);
      applyOutcomeEffects({ crop_health: -5, time_cost: 'none' });
      out.full = crewMoraleOf('botanist');
      // Recovery: +10 lands +13 with the botanist's 25% → one step up.
      out.prevUp = outcomeFacts({ crop_health: 10 }).map(f => f.text);
      applyOutcomeEffects({ crop_health: 10, time_cost: 'none' });
      out.up = crewMoraleOf('botanist');
      out.medic = crewMoraleOf('medic');
      // Harvest: the Yield row previews it, the harvest pays it.
      STATE.cropGrowth.growth = 100; STATE.cropGrowth.health = 70;
      openGrowbay(); openInspect();
      out.yield = ([...document.querySelectorAll('.ins-row')].find(e => /Yield/.test(e.textContent)) || { textContent: '' }).textContent;
      closeInspect();
      const b0 = crewMoraleOf('botanist');
      doHarvest();
      out.harvest = crewMoraleOf('botanist') - b0;
      out.swing = STATE.cropGrowth.swing;
      closeGrowbay();
      return out;
    });
    ok(r.prev.includes('BOTANIST −20 MORALE') && r.drop === 40, '−20 crop: BOTANIST −20 (previewed: ' + r.prev.join(', ') + '; now ' + r.drop + ')');
    ok(r.half === 40 && r.prev2.includes('BOTANIST −10 MORALE') && r.full === 30, 'two −5 swings: nothing, then −10 on the second (previewed ' + r.prev2.join(', ') + ')');
    ok(r.prevUp.includes('BOTANIST +2 MORALE') && r.up === 32 && r.medic === 60, 'recovery +13: BOTANIST +2, the medic untouched (' + r.prevUp.join(', ') + ')');
    ok(/BOTANIST \+5 morale/.test(r.yield) && r.harvest === 5 && r.swing === 0, 'harvest: Yield row "' + r.yield + '", botanist +' + r.harvest + ', the replant starts level');
    await page.close();
  }

  console.log('— the daily crop tick reaches the botanist (net, any catch-up size)');
  {
    const page = await boot({ crew: ['botanist', 'medic'] });
    const r = await page.evaluate(() => {
      tickCropGrowth();
      setCrewMorale(60);
      STATE.cropGrowth.health = 60; STATE.cropGrowth.swing = 0;
      setWaterSplit(15); // a parched plant loses health every day
      Math.random = () => 0.99; // no pests
      const h0 = STATE.cropGrowth.health;
      STATE.daysElapsed += 40; tickCropGrowth();
      return { lost: h0 - STATE.cropGrowth.health, b: crewMoraleOf('botanist'), m: crewMoraleOf('medic'), swing: STATE.cropGrowth.swing };
    });
    const steps = Math.floor(r.lost / 10);
    ok(r.lost > 10 && r.b === 60 - 10 * steps && r.m === 60, `40 dry days: crop −${r.lost.toFixed(1)} → botanist −${10 * steps} (${r.b}), medic 60, remainder ${r.swing}`);
    await page.close();
  }

  console.log('— chef: short rations per day, and every day the galley is empty');
  {
    const page = await boot({ crew: ['chef', 'medic'] });
    const r = await page.evaluate(() => {
      setCrewMorale(60);
      STATE.orders.rations = 'vending';
      passDays(10);
      const out = { short: crewMoraleOf('chef') - crewMoraleOf('medic') };
      STATE.orders.rations = 'standard';
      setCrewMorale(60);
      STATE.resources.food = 0; STATE.deprived = { food: 1 };
      passDays(3);
      out.gone = crewMoraleOf('chef') - crewMoraleOf('medic');
      out.why = crewMoraleWhy('chef');
      return out;
    });
    ok(Math.abs(r.short + 3) < 1e-6, '10 days on VENDING MACHINE: the chef −3 more than the medic (' + r.short + ')');
    ok(Math.abs(r.gone + 6) < 1e-6 && /empty galley/.test(r.why), '3 days without food: the chef −6 more ("' + r.why + '")');
    await page.close();
  }

  console.log('— medic + the wounded: an injury; a death');
  {
    const page = await boot({ crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => {
      setCrewMorale(60);
      const o = { severity: 'injury', crew_effect: { type: 'injure', target: 'specific_role', role: 'engineer' }, time_cost: 'none' };
      const out = { prev: outcomeFacts(o).map(f => f.text) };
      applyOutcomeEffects(o);
      out.inj = Object.assign({}, STATE.crewMorale);
      out.rnd = outcomeFacts({ severity: 'injury' }).map(f => f.text);
      out.injure = outcomeFacts({ crew_effect: { type: 'injure', target: 'random' } }).map(f => f.text);
      // A death: no softer landing (rolls 0.99), the medic minds it.
      setCrewMorale(60);
      STATE.items = STATE.items.filter(i => i !== 'medkit');
      out.kprev = outcomeFacts({ crew_effect: { type: 'kill', target: 'specific_role', role: 'engineer' } }).map(f => f.text);
      Math.random = () => 0.99;
      applyOutcomeEffects({ crew_effect: { type: 'kill', target: 'specific_role', role: 'engineer' }, time_cost: 'none' });
      out.death = crewMoraleOf('medic');
      out.why = crewMoraleWhy('medic');
      return out;
    });
    ok(r.prev.includes('ENGINEER −25 · MEDIC −12 MORALE'), 'named injury previews ENGINEER −25 · MEDIC −12: ' + r.prev.join(', '));
    ok(r.inj.engineer === 35 && r.inj.medic === 48, 'injury: engineer −25, medic −12 (' + JSON.stringify(r.inj) + ')');
    ok(r.rnd.includes('HURT −25 · MEDIC −12 MORALE') && r.injure.includes('HURT −25 · MEDIC −12 MORALE'), 'random target: "HURT −25 · MEDIC −12" (' + r.rnd.join(', ') + ' / ' + r.injure.join(', ') + ')');
    ok(r.kprev.includes('IF LOST, MEDIC −25 MORALE') && r.death === 35 && /loss weighs on the medic/.test(r.why), 'a death: MEDIC −25 (previewed "' + r.kprev.join(', ') + '"; why "' + r.why + '")');
    await page.close();
  }

  console.log('— pilot: the pace flown; the Orders panel says it');
  {
    const page = await boot({ crew: ['pilot', 'medic'] });
    const r = await page.evaluate(() => {
      Math.random = () => 0.99;
      setCrewMorale(60);
      STATE.orders.pace = 'light';
      const d0 = STATE.daysElapsed;
      travelTo([...nextAvailableNodes()][0], { skipEvent: true });
      const days = STATE.daysElapsed - d0;
      const out = { slow: crewMoraleOf('pilot') - crewMoraleOf('medic'), days };
      setCrewMorale(60); STATE.orders.pace = 'plaid';
      returnToHub();
      const d1 = STATE.daysElapsed;
      travelTo([...nextAvailableNodes()][0], { skipEvent: true });
      out.fast = crewMoraleOf('pilot') - crewMoraleOf('medic'); out.days2 = STATE.daysElapsed - d1;
      returnToHub();
      STATE.orders.pace = 'ridiculous';
      openOrders();
      document.querySelectorAll('#od-engines-pills .od-pill')[0].click();
      out.panel = document.getElementById('od-engines-preview').textContent;
      document.querySelectorAll('#od-engines-pills .od-pill')[1].click();
      out.panelStd = document.getElementById('od-engines-preview').textContent;
      return out;
    });
    ok(Math.abs(r.slow + 0.3 * r.days) < 0.011, `LIGHT SPEED leg (${r.days}d): pilot ${r.slow.toFixed(2)} vs the medic (−0.3/day)`);
    ok(Math.abs(r.fast - 0.2 * r.days2) < 0.011, `PLAID leg (${r.days2}d): pilot +${r.fast.toFixed(2)} (+0.2/day)`);
    ok(/PILOT −0\.3\/DAY/.test(r.panel) && !/PILOT/.test(r.panelStd), 'Orders: LIGHT shows "PILOT −0.3/DAY", RIDICULOUS no pilot line (' + r.panel.replace(/\s+/g, ' ') + ')');
    await page.close();
  }

  console.log('— chef on the Orders panel');
  {
    const page = await boot({ crew: ['chef', 'medic'] });
    const r = await page.evaluate(() => {
      openOrders();
      document.querySelectorAll('#od-rations-pills .od-pill')[0].click();
      const vend = document.getElementById('od-rations-preview').textContent;
      document.querySelectorAll('#od-rations-pills .od-pill')[2].click();
      return { vend, pig: document.getElementById('od-rations-preview').textContent };
    });
    ok(/FALLING · CHEF −0\.3\/DAY/.test(r.vend) && !/CHEF/.test(r.pig), 'VENDING MACHINE: "MORALE · FALLING · CHEF −0.3/DAY"; PIG OUT: none');
    await page.close();
  }

  console.log('— diplomat: any fight; the end card names every concern');
  {
    const page = await boot({ crew: ['engineer', 'diplomat'] });
    const cost = await page.evaluate(() => choiceCostLines({ triggerCombat: true }));
    ok(cost.includes('Any fight: DIPLOMAT −20 MORALE'), 'the fight choice hover: ' + cost.join(' / '));
    await page.clock.install();
    await page.evaluate(() => {
      setCrewMorale(60);
      STATE.resources.hull = 30;
      enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001);
      STATE.npcCtx.species = 'human';
      Math.random = () => 0.5;
      window.triggerCombat({}, { ramFailed: true, ramHull: 29 });
    });
    for (let k = 0; k < 40; k++) await page.clock.fastForward(100);
    const r = await page.evaluate(() => ({ notes: (document.querySelector('#combat-end-card .end-loot-notes') || {}).textContent || document.getElementById('combat-end-card').innerText, mo: Object.assign({}, STATE.crewMorale), hull: STATE.resources.hull }));
    // Hull 30 → 1: −29, the engineer −17 for it (−42 if the defeat wounded them too).
    const n = re => { const m = r.notes.match(re); return m ? Number(m[1]) : 0; };
    const shared = n(/Morale (-?\d+)/), eng = n(/Engineer (-?\d+)/), dip = n(/Diplomat (-?\d+)/);
    ok(dip === -20 && (eng === -17 || eng === -42), 'end card names each concern: "' + r.notes.replace(/\s+/g, ' ') + '"');
    ok(r.mo.engineer === 60 + shared + eng && r.mo.diplomat === 60 + shared + dip, 'the card is what landed (' + JSON.stringify(r.mo) + ')');
    await page.close();
  }

  console.log('— xenobiologist: an alien find lifts them');
  {
    const page = await boot({ crew: ['xenobiologist', 'medic'] });
    const r = await page.evaluate(() => {
      setCrewMorale(60);
      const prev = outcomeFacts({ materials: { exotic: 1, scrap: 2 } }).map(f => f.text);
      applyOutcomeEffects({ materials: { exotic: 1, scrap: 2 }, time_cost: 'none' });
      const x = crewMoraleOf('xenobiologist');
      applyOutcomeEffects({ materials: { scrap: 2 }, time_cost: 'none' });
      return { prev, x, x2: crewMoraleOf('xenobiologist'), m: crewMoraleOf('medic'), lifts: crewMoraleWhyLifts('xenobiologist') };
    });
    ok(r.prev.includes('XENOBIOLOGIST +3 MORALE') && r.x === 63 && r.x2 === 63 && r.m === 60 && r.lifts, 'exotic matter: +3 (previewed ' + r.prev.join(', ') + '); plain scrap: nothing');
    await page.close();
  }

  console.log('— a joined stowaway takes the role\'s concern; nobody aboard, nobody minds');
  {
    const page = await boot({ crew: ['medic'] });
    const r = await page.evaluate(() => {
      setCrewMorale(60);
      const none = outcomeFacts({ resources: { hull: -20 } }).map(f => f.text);
      const role = joinAsCrew({ id: 'stow_x', name: 'Pell Marrow', story: 's', join_role: 'engineer' }, 100);
      setCrewMorale(60);
      applyOutcomeEffects({ resources: { hull: -20 }, time_cost: 'none' });
      renderCruise();
      const tip = [...document.querySelectorAll('#crew-strip .crew-bar.mo')].map(b => b.title || b.dataset.tipDescription || '');
      return { none, role, eng: crewMoraleOf('engineer'), tip };
    });
    ok(!r.none.some(t => /ENGINEER/.test(t)), 'no engineer aboard: no concern in the preview (' + r.none.join(', ') + ')');
    ok(r.role === 'engineer' && r.eng === 48 && r.tip.some(t => /hull damage weighs on the engineer/.test(t)), 'Pell Marrow (stowaway engineer) takes it: 48, "' + r.tip.join('" / "') + '"');
    await page.close();
  }

  console.log('— dossier says why; the log speaks once, under the crisis line');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      setCrewMorale(30);
      applyOutcomeEffects({ resources: { hull: -10 }, time_cost: 'none' }); // 30 → 24: under MORALE_CRISIS
      const log1 = (STATE.shipLog || []).map(e => (e && e.text) || e).filter(t => /weighs on/.test(t));
      applyOutcomeEffects({ resources: { hull: -5 }, time_cost: 'none' }); // 24 → 21: no second line
      const log2 = (STATE.shipLog || []).map(e => (e && e.text) || e).filter(t => /weighs on/.test(t));
      openCrewDetail('engineer');
      const rows = [...document.querySelectorAll('#cd-status-active .cd-status-row')].map(e => ({ t: e.textContent, cls: e.className }));
      const moTitle = document.getElementById('cd-stat-mo-fill').closest('.cd-stat-row').title;
      const cursor = getComputedStyle(document.querySelector('#crew-strip .crew-bar.mo')).cursor;
      hideOverlay('overlay-crew');
      // Back at MORALE_LOW, the line re-arms.
      setCrewMorale(40, 'engineer'); renderCruise();
      applyOutcomeEffects({ resources: { hull: -30 }, time_cost: 'none' }); // 40 → 22
      const log3 = (STATE.shipLog || []).map(e => (e && e.text) || e).filter(t => /weighs on/.test(t));
      return { log1, log2, log3, rows, moTitle, cursor, name: crewNameOf('engineer') };
    });
    ok(r.log1.length === 1 && new RegExp('^◆ The hull damage weighs on ' + r.name + '\\. Morale 24').test(r.log1[0]), 'one line when a concern first pushes them under 25: "' + r.log1[0] + '"');
    ok(r.log2.length === 1, 'the next concern below the line adds none');
    ok(r.rows.some(x => /On their mind/.test(x.t) && /hull damage weighs on the engineer/i.test(x.t) && /negative/.test(x.cls)), 'dossier row: ' + r.rows.map(x => x.t).join(' | '));
    ok(/^Morale 21\/100 — the hull damage weighs on the engineer$/.test(r.moTitle), 'dossier MORALE hover: "' + r.moTitle + '"');
    ok(!/grab/.test(r.cursor), 'no grab cursor on the MO bar (' + r.cursor + ')');
    ok(r.log3.length === 2, 'back at 40, the next fall under 25 speaks again');
    await page.close();
  }

  console.log('— desertion is reachable: one member alone to 0, warned, walks at the next station');
  {
    // MARV: ARIA's +1 a leg would lift them off zero before the station.
    const page = await boot({ crew: ['engineer', 'medic'], ai: 'marv' });
    const r = await page.evaluate(() => {
      Math.random = () => 0.99;
      setCrewMorale(70); setCrewMorale(20, 'engineer');
      STATE.resources.hull = 115;
      // Hull damage the engineer minds: 20 → 0 while the medic stays put.
      applyOutcomeEffects({ resources: { hull: -20 }, time_cost: 'none' });
      applyOutcomeEffects({ resources: { hull: -20 }, time_cost: 'none' });
      const out = { eng: crewMoraleOf('engineer'), med: crewMoraleOf('medic'), avg: crewMoraleAvg(), fail: checkFailure() };
      renderCruise(); // the hub check warns them
      out.warned = !!(STATE.moraleWarned || {}).engineer;
      const n = [...nextAvailableNodes()][0];
      STATE.byId[n].node_type = 'station';
      travelTo(n, { skipEvent: true });
      out.crew = STATE.crew.slice();
      out.ended = !!STATE.ended;
      return out;
    });
    const log = await logText(page);
    ok(r.eng === 0 && r.med === 70 && r.avg === 35 && r.fail === false, `engineer 0 alone, medic 70, average ${r.avg}: no mutiny`);
    ok(r.warned && /zero/i.test(log), 'warned at the hub');
    ok(r.crew.length === 1 && r.crew[0] === 'medic' && !r.ended && /walk|left|off/i.test(log), 'walked off at the next station; the medic flies on (' + r.crew.join(',') + ')');
    await page.close();
  }

  console.log('— saves keep why');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      applyOutcomeEffects({ resources: { hull: -20 }, time_cost: 'none' });
      writeSnapshot('t_r57');
      STATE.moraleWhy = {};
      loadRun('t_r57');
      localStorage.removeItem('t_r57');
      return crewMoraleWhy('engineer');
    });
    ok(/hull damage/.test(r), 'moraleWhy round-trips a save ("' + r + '")');
    await page.close();
  }

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
