// Hunt A fixes (2026-10-12): captain HP, healing, per-crew morale.
// HUNT_A_CAPTAIN_MORALE.md A1–A15, A17. Asserts real engine state: the
// OLD FRIENDS wave-through checks for failure, a combat save says who
// saved whom, outcome text names the dead as they were, "someone has to
// go" only when it means something, crew_injured counts the captain,
// forage poisoning names who, crew-only choices and copy, previews that
// equal outcomes, CAPTAIN LOST in the record, a crew medic can't save
// themselves, solo deprivation copy, the combat card's real morale.
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
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['pilot', 'engineer'], crop: 'wheat', ship: 'Q' }, o));
    STATE.stowaway = null;
    returnToHub();
  }, setup || {});
  await page.waitForTimeout(150);
  return page;
}
const buttons = page => page.evaluate(() => [...document.querySelectorAll('#enc-choices .enc-choice')].map(b => ({ text: b.textContent.replace(/\s+/g, ' ').trim(), locked: b.classList.contains('locked') })));
const click = (page, re) => page.evaluate(re => {
  const b = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')].find(b => new RegExp(re, 'i').test(b.textContent));
  if (!b) return false;
  b.click(); return true;
}, re);
const logText = page => page.evaluate(() => (STATE.shipLog || []).map(e => (e && e.text) || e).join(' | '));

// A fight to defeat, deterministic: hull 1 after a failed ram, every roll
// the same constant (0.02: someone dies — the captain, first aboard — and
// both crew are hurt; 0.5: nobody dies).
async function defeat(page, setup, rnd, before) {
  await page.clock.install();
  await page.evaluate(([rnd, before]) => {
    STATE.resources.hull = 1;
    if (before) (new Function(before))();
    enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001);
    STATE.npcCtx.species = 'human';
    Math.random = () => rnd;
    window.triggerCombat({}, { ramFailed: true, ramHull: 0 });
  }, [rnd, before || '']);
  for (let k = 0; k < 40; k++) await page.clock.fastForward(100);
  return page.evaluate(() => ({ title: document.getElementById('combat-end-title').textContent, body: document.getElementById('combat-end-body').textContent, card: document.getElementById('combat-end-card').innerText, cap: STATE.captainHP, ended: !!STATE.ended }));
}

(async () => {
  browser = await chromium.launch();

  console.log('— A1: the OLD FRIENDS wave-through checks for failure (its day can end the run)');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      STATE.resources.food = 0; STATE.deprived = { food: 2 }; STATE.captainHP = 3;
      STATE.flags.add('friendly_with_pirate_human');
      enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001);
      STATE.npcCtx.species = 'human';
      window.triggerCombat({}, {});
      return { cap: STATE.captainHP, ended: !!STATE.ended };
    });
    ok(r.cap <= 0 && r.ended, `a captain who starves on the waved-through day ends the run (HP ${r.cap}, ended ${r.ended})`);
    await page.close();
  }

  console.log('— A2: a combat defeat save says who saved whom');
  {
    const page = await boot({ crew: ['engineer', 'pilot'] });
    const r = await defeat(page, null, 0.02, "STATE.items = ['medkit'];");
    ok(/It should have cost a life\. The medkit made the difference — you are badly hurt, but alive\./.test(r.body), 'medkit save, no medic aboard: the medkit line names the captain (' + r.body + ')');
    ok(!/The medic disagreed/.test(r.body), 'no "The medic disagreed" with no medic aboard');
    ok(r.cap === 20, 'the saved captain is at 20 HP (' + r.cap + ')');
    await page.close();
  }
  {
    const page = await boot({ crew: ['medic', 'pilot'] });
    const r = await defeat(page, null, 0.02, 'STATE.items = [];');
    ok(/It should have cost a life\. Dr\. Vasquez refused to let it end there — you are badly hurt, but alive\./.test(r.body), 'crew medic save: names the medic and who lived (' + r.body + ')');
    await page.close();
  }

  console.log('— A3: outcome text names the dead as they were (a joined stowaway)');
  {
    const page = await boot({ crew: ['pilot', 'engineer'] });
    await page.evaluate(() => {
      STATE.crewIdentity = { pilot: { id: 'stowaway_cartographer', name: 'Ines Vahl', story: 's', origin: 'stowaway', joinedDay: 1 } };
      STATE.crewHP.pilot = 30; STATE.items = [];
      STATE.crisisPatient = 'pilot';
      enterEvent(STATE.byId[STATE.currentId], EVENTS.event_crisis_021);
      Math.random = () => 0.99;
    });
    await page.waitForTimeout(300);
    ok(await click(page, 'Keep flying'), 'Keep flying clicked');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      if (window.snapDelivery) snapDelivery();
      return { crew: STATE.crew.slice(), body: document.getElementById('enc-narr-body').textContent, tok: interpolateStowawayTokens('{patient.name}/{crew.pilot}') };
    });
    ok(!r.crew.includes('pilot'), 'the patient died');
    ok(/Ines Vahl/.test(r.body) && !/Reeves/.test(r.body), 'the outcome names Ines Vahl, not the roster pilot (' + r.body.slice(0, 120) + ')');
    ok(r.tok === 'Ines Vahl/Ines Vahl', '{patient.name} and {crew.pilot} read the dead pilot as who they were (' + r.tok + ')');
    const after = await page.evaluate(() => { returnToHub(); return interpolateStowawayTokens('{crew.pilot}'); });
    ok(after === 'Reeves', 'back at the hub the remembered name is dropped (' + after + ')');
    const spk = await page.evaluate(() => {
      STATE.crewIdentity = { engineer: { id: 'x', name: 'Bastian Oke', story: 's', origin: 'stowaway', joinedDay: 1 } };
      STATE.eventSpeaker = 'engineer';
      killCrew('engineer');
      return interpolateStowawayTokens('{speaker.name}');
    });
    ok(spk === 'Bastian Oke', '{speaker.name} for a speaker who died (' + spk + ')');
    await page.close();
  }

  console.log('— A4 + A13: the stowaway reveal choices');
  {
    // ARIA, not MARV: MARV's cost read takes the costliest choice's
    // sub-label, which on Mars (supply bite, ruling 68) is the welcome's food.
    const page = await boot({ crew: ['pilot', 'engineer'], ai: 'aria' });
    await page.evaluate(() => {
      STATE.stowaway = { identity: MOD.flavor.stowaway_identities.find(x => x.id === 'stowaway_kid'), revealed: false };
      enterEvent(STATE.byId[STATE.currentId], EVENTS.event_shipboard_001);
    });
    await page.waitForTimeout(300);
    const b = await buttons(page);
    ok(!b.some(x => /someone has to go/i.test(x.text)), 'no role to take: "someone has to go" is not offered (' + b.map(x => x.text).join(' || ') + ')');
    ok(b.some(x => /^Welcome aboard/.test(x.text) && /passenger/i.test(x.text) && !x.locked), 'the plain passenger welcome is offered with a full crew');
    ok(!b.some(x => /\(if crew/.test(x.text)), 'no authoring conditions in the button text');
    ok(await click(page, '^Welcome aboard'), 'welcomed');
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ crew: STATE.crew.slice(), pas: STATE.passengers.length, flag: STATE.flags.has('stowaway_passenger') }));
    ok(r.crew.length === 2 && r.flag && r.pas === 0, 'nobody steps down; the stowaway rides as a passenger (' + JSON.stringify(r) + ')');
    await page.close();
  }
  {
    const page = await boot({ crew: ['pilot', 'engineer'] });
    await page.evaluate(() => {
      STATE.stowaway = { identity: MOD.flavor.stowaway_identities.find(x => x.id === 'stowaway_chef'), revealed: false };
      enterEvent(STATE.byId[STATE.currentId], EVENTS.event_shipboard_001);
    });
    await page.waitForTimeout(300);
    const b = await buttons(page);
    ok(b.some(x => /someone has to go/i.test(x.text)) && !b.some(x => /\(if crew/.test(x.text)), 'a stowaway with a role: "someone has to go" offered, no authoring notes (' + b.map(x => x.text).join(' || ') + ')');
    const facts = await page.evaluate(() => outcomeFacts(EVENTS.event_shipboard_001.stowaway_variant.stowaway_choices[1].outcome).map(f => f.text));
    ok(facts.includes('−1 CREW'), 'the preview carries −1 CREW (' + facts.join(', ') + ')');
    const names = await page.evaluate(() => Object.fromEntries(STATE.crew.map(r => [r, crewNameOf(r)])));
    ok(await click(page, 'someone has to go'), 'someone has to go');
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ crew: STATE.crew.slice(), pas: STATE.passengers.map(p => p.name), mouths: mouthsMult() }));
    const gone = Object.keys(names).find(k => !r.crew.includes(k));
    ok(r.crew.includes('chef') && r.crew.length === 2, 'the stowaway joins as chef (' + r.crew + ')');
    ok(gone && r.pas.length === 1 && r.pas[0] === names[gone], 'the one who stepped down rides as a passenger, as the text says (' + r.pas + ')');
    const off = await page.evaluate(() => { const st = STATE.nodes.find(n => n.node_type === 'station'); disembarkPassengers(st); return STATE.passengers.length; });
    ok(off === 0, 'they step off at the next station');
    await page.close();
  }

  console.log('— A5: crew_injured counts the captain; 006/007/008 only where their copy works');
  {
    const page = await boot({ crew: ['pilot', 'engineer'] });
    const elig = () => page.evaluate(() => {
      const t = activeTriggers(), node = { id: 'zz', node_type: 'asteroid_field' };
      return { inj: t.has('crew_injured'), mate: t.has('crewmate_injured'), e6: eventEligible(EVENTS.event_shipboard_006, node, t), e7: eventEligible(EVENTS.event_shipboard_007, node, t), e8: eventEligible(EVENTS.event_shipboard_008, node, t) };
    });
    await page.evaluate(() => { STATE.captainHP = 30; });
    let r = await elig();
    ok(r.inj && !r.mate, 'a wounded captain (crew healthy): crew_injured, not crewmate_injured');
    ok(!r.e6 && r.e7 && r.e8, 'captain patient with crew: 007 + 008 can fire, 006 (tending someone else) cannot (' + JSON.stringify(r) + ')');
    await page.evaluate(() => { STATE.captainHP = 100; STATE.crewHP.pilot = 30; });
    r = await elig();
    ok(r.inj && r.mate && r.e6 && r.e7 && r.e8, 'a wounded crew member: all three (' + JSON.stringify(r) + ')');
    await page.evaluate(() => { STATE.crewHP.pilot = 100; });
    r = await elig();
    ok(!r.inj && !r.e6 && !r.e7 && !r.e8, 'nobody hurt: none');
    await page.close();
  }
  {
    const page = await boot({ crew: [] });
    const r = await page.evaluate(() => {
      STATE.captainHP = 30;
      const t = activeTriggers(), node = { id: 'zz', node_type: 'asteroid_field' };
      return { inj: t.has('crew_injured'), e6: eventEligible(EVENTS.event_shipboard_006, node, t), e7: eventEligible(EVENTS.event_shipboard_007, node, t), e8: eventEligible(EVENTS.event_shipboard_008, node, t) };
    });
    ok(r.inj && !r.e6 && !r.e7 && r.e8, 'a wounded solo captain: 008 only (no crew to visit or orbit) (' + JSON.stringify(r) + ')');
    await page.close();
  }

  console.log('— A6: forage poisoning names who and the HP it cost');
  for (const crew of [[], ['pilot']]) {
    const page = await boot({ crew });
    const r = await page.evaluate(async pick => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const node = STATE.nodes.find(n => n.node_type === 'asteroid_field') || STATE.nodes[1];
      node.node_type = 'asteroid_field'; STATE.currentId = node.id;
      showScreen('screen-cruise'); renderCruise(); openStopMenu(); await w(60);
      const hp0 = { captain: STATE.captainHP, pilot: STATE.crewHP.pilot };
      window.openMinigame = (id, o, cb) => cb('good', { food: 5, sickness: [{ type: 'poisoning', target: 'random_crew', severity: 'heavy', reason: 'ate x' }] });
      Math.random = () => pick; // 0: the captain (first aboard); 0.99: the last crew member
      const b = [...document.querySelectorAll('#stop-choices button')].find(b => /HUNT/.test(b.textContent));
      if (b) b.click();
      await w(60);
      const who = STATE.crew.includes('pilot') && STATE.crewHP.pilot < hp0.pilot ? 'pilot' : 'captain';
      return { clicked: !!b, lost: who === 'pilot' ? hp0.pilot - STATE.crewHP.pilot : hp0.captain - STATE.captainHP, who, log: (STATE.shipLog || []).slice(-3).map(e => e.text || e).join(' | ') };
    }, crew.length ? 0.99 : 0);
    const name = r.who === 'captain' ? 'you' : 'Reeves';
    ok(r.clicked && r.lost > 0 && new RegExp('HUNT — .*disagreed with ' + name + ' \\(−' + r.lost + ' HP\\)').test(r.log), (crew.length ? 'crew' : 'solo captain') + ': the log names ' + name + ' and the real HP lost (' + r.log + ')');
    await page.close();
  }
  {
    const page = await open();
    const src = await page.evaluate(async () => (await (await fetch('engine/js/minigames.js')).text()));
    ok(/'random_crew' \? 'someone aboard'/.test(src) && !/-HP one crew/.test(src) && !/poisons a crew member/.test(src), 'the forage card and flash say "someone aboard", not "random crew" / "one crew"');
    await page.close();
  }

  console.log('— A7: "Send a crew member" needs crew aboard, and hurts a crew member');
  {
    const page = await boot({ crew: [], ai: 'aria' });
    await page.evaluate(() => enterEvent(STATE.byId[STATE.currentId], EVENTS.event_planet_002));
    await page.waitForTimeout(300);
    const b = (await buttons(page)).find(x => /Send a crew member/.test(x.text));
    ok(b && b.locked && /Need: Crew/.test(b.text), 'solo captain: locked, "Need: Crew" (' + (b && b.text) + ')');
    await page.close();
  }
  {
    const page = await boot({ crew: ['pilot'], ai: 'aria' });
    await page.evaluate(() => enterEvent(STATE.byId[STATE.currentId], EVENTS.event_planet_002));
    await page.waitForTimeout(300);
    const b = (await buttons(page)).find(x => /Send a crew member/.test(x.text));
    ok(b && !b.locked, 'with crew aboard: open');
    const r = await page.evaluate(() => {
      Math.random = () => 0; // the captain is first aboard: a bare severity would land on them
      const o = EVENTS.event_planet_002.choices[1].outcome;
      applyOutcomeEffects(Object.assign({}, o, { time_cost: 'none' }));
      return { cap: STATE.captainHP, pilot: STATE.crewHP.pilot };
    });
    ok(r.cap === 100 && r.pilot < 40, 'the injury lands on the crew member, never the captain (' + JSON.stringify(r) + ')');
    await page.close();
  }

  console.log('— A8 + A14: previews');
  {
    const page = await boot({ crew: ['pilot', 'engineer'] });
    const r = await page.evaluate(() => {
      STATE.crisisPatient = 'pilot';
      const kill = outcomeFacts(EVENTS.event_crisis_021.choices[3].outcome).map(f => f.text);
      const heal6 = () => outcomeFacts(EVENTS.event_shipboard_006.choices[0].outcome).map(f => f.text);
      const healP = () => outcomeFacts(EVENTS.event_crisis_021.choices[0].outcome).map(f => f.text);
      const none = heal6(), noneP = healP();
      STATE.captainHP = 70; const cap = heal6();
      STATE.captainHP = 100; STATE.crewHP.pilot = 30; const pat = healP();
      return { kill, none, noneP, cap, pat };
    });
    ok(r.kill.includes('A DEATH RISK') && !r.kill.includes('A DEATH'), 'a kill authored with severity lethal previews A DEATH RISK only (' + r.kill.join(', ') + ')');
    ok(!r.none.includes('HEALING') && !r.noneP.includes('HEALING'), 'nobody hurt: no HEALING (' + r.none.join(', ') + ' / ' + r.noneP.join(', ') + ')');
    ok(r.cap.includes('HEALING') && r.pat.includes('HEALING'), 'someone the heal reaches is hurt: HEALING');
    await page.close();
  }

  console.log("— A9: the captain's death reads CAPTAIN LOST in the record");
  {
    const page = await boot({ crew: ['pilot'] });
    const log = await page.evaluate(() => {
      STATE.captainHP = 31;
      enterEvent(STATE.byId[STATE.currentId], EVENTS.event_planet_002);
      const r = ShipLog.begin();
      killCaptain();
      ShipLog.resolved(r, STATE.currentEvent, { text: 'Go' }, { narrative: 'It went badly.' });
      return (STATE.shipLog || []).map(e => (e && e.text) || e).join(' | ');
    });
    ok(/CAPTAIN LOST/.test(log) && !/CAPTAIN −\d+ HP/.test(log), 'CAPTAIN LOST, not CAPTAIN −31 HP (' + log.slice(-160) + ')');
    await page.close();
  }

  console.log("— A10: a crew medic can't save themselves");
  {
    const page = await boot({ crew: ['medic', 'pilot'] });
    const r = await page.evaluate(() => {
      STATE.items = []; Math.random = () => 0;
      applySeverity('medic', 'lethal');
      return { crew: STATE.crew.slice(), saved: STATE.lethalSaved };
    });
    ok(!r.crew.includes('medic') && !r.saved, 'veteran captain: the medic\'s own lethal roll gets no save from themselves (' + JSON.stringify(r) + ')');
    await page.close();
  }
  {
    const page = await boot({ captain: 'medic', crew: ['medic', 'pilot'] });
    const r = await page.evaluate(() => {
      STATE.items = []; Math.random = () => 0.2; // under a medic captain's 25%
      applySeverity('medic', 'lethal');
      const a = { crew: STATE.crew.slice(), saved: STATE.lethalSaved };
      STATE.lethalSaved = null; STATE.crewHP.medic = 100; Math.random = () => 0.3; // over it
      applySeverity('medic', 'lethal');
      return { a, b: STATE.crew.includes('medic') };
    });
    ok(r.a.crew.includes('medic') && /^You refused to let it end there — Dr\. Vasquez/.test(r.a.saved || ''), 'a medic captain can save the crew medic, and gets the credit (' + r.a.saved + ')');
    ok(!r.b, 'the captain\'s 25% is all the crew medic gets (0.3 dies)');
    await page.close();
  }

  console.log('— A11: solo deprivation copy');
  for (const crew of [[], ['pilot']]) {
    const page = await boot({ crew });
    const log = await page.evaluate(() => {
      STATE.resources.food = 0; STATE.resources.water = 0; STATE.deprived = {};
      passDays(1);
      return (STATE.shipLog || []).map(e => (e && e.text) || e).join(' | ');
    });
    if (crew.length) ok(/the crew is starving/.test(log) && /the crew is going without/.test(log), 'with crew: the crew is starving / going without');
    else {
      const dep = log.split(' | ').filter(l => /GONE/.test(l)).join(' | ');
      ok(/you are starving/.test(dep) && /you are going without/.test(dep) && !/crew/.test(dep) && !/nerve/.test(dep), 'solo: you are starving / going without, no crew, no nerve (' + dep + ')');
    }
    await page.close();
  }

  console.log('— A12: Treatment and the medkit say "someone aboard"');
  {
    const page = await open();
    const r = await page.evaluate(() => ({
      t: MOD.crew_roster.find(c => c.role === 'medic').active_skill.description,
      m: (MOD.items.items || MOD.items).find(i => i.id === 'item_medkit_001').gameplay_effect,
    }));
    ok(/someone aboard/.test(r.t) && !/crew member/.test(r.t), 'Treatment: ' + r.t);
    ok(/someone aboard/.test(r.m) && !/crew member/.test(r.m), 'medkit: ' + r.m);
    await page.close();
  }

  console.log('— A15: the combat card shows the morale change that landed');
  {
    const page = await boot({ crew: ['engineer', 'pilot'] });
    const r = await defeat(page, null, 0.5, `STATE.items = []; setCrewMorale(0, 'engineer'); setCrewMorale(2, 'pilot');
      const orig = window.applyOutcomeEffects;
      window.applyOutcomeEffects = o => { if (o && o.combat_net) window._mo = { net: o.resources.morale, before: Object.assign({}, STATE.crewMorale) }; return orig(o); };`);
    const mo = await page.evaluate(() => window._mo);
    const exp = mo ? Math.round(Object.values(mo.before).reduce((s, m) => s + Math.min(100, Math.max(0, m + mo.net)) - m, 0) / Object.keys(mo.before).length) : null;
    const m = r.card.match(/Morale ([+-]\d+)/);
    const shown = m ? Number(m[1]) : 0;
    ok(mo && mo.net && Math.round(mo.net) !== exp, 'the fight\'s raw net (' + (mo && mo.net) + ') differs from what lands (' + exp + ') — a member at 0');
    ok(shown === (exp || 0), 'the card shows what landed (' + shown + ' vs ' + exp + '): ' + r.card.replace(/\n/g, ' / '));
    await page.close();
  }

  console.log('— A17: no dead all_crew_dead failure check in forage');
  {
    const page = await open();
    const src = await page.evaluate(async () => (await (await fetch('engine/js/screens/cruise.js')).text()));
    ok(!/all_crew_dead'\)\) checkFailure/.test(src), 'removed');
    await page.close();
  }

  console.log(`\ntest_b5_a: ${pass} passed, ${fail} failed` + (errors.length ? '; page errors: ' + errors.length : ''));
  if (errors.length) console.log('errors: ' + errors.slice(0, 5).join(' | '));
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
