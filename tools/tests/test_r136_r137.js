// Ruling 136: one-off stories happen once a run; a family's named ships
// step out once met and the members left keep the family's odds (and a
// named ship still cools its family). A met trader stays its stop's face. Ruling 137: an event's morale gain
// that runs into the 100 cap gets the AI's "morale is full" log line.
// Read-through 36: a failed effort check says the days it added; the
// wound line states both effects.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const ONE_OFFS = ['event_anomaly_005', 'event_asteroid_007', 'event_crisis_006', 'event_crisis_010', 'event_crisis_023', 'event_crisis_034',
  'event_crisis_036', 'event_crisis_040', 'event_crisis_048', 'event_encounter_trader_002', 'event_encounter_trader_004',
  'event_encounter_pirate_002', 'event_encounter_pirate_003', 'event_general_039', 'event_general_041', 'event_general_063',
  'event_void_001', 'event_void_005', 'event_voyage_ruins_006', 'event_voyage_time_004', 'event_species_insect_005',
  'event_species_reptile_005', 'event_species_robot_005', 'event_species_rock_005', 'event_species_unknown_005', 'event_species_water_005'];

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const errors = [];
  const boot = async (setup) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.ai_companions && window.ShipLog && typeof applySetupToState === 'function');
    await page.evaluate(o => {
      localStorage.removeItem('transplant_save_v1');
      applySetupToState(Object.assign({ trail: 'mars', ai: 'rex', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' }, o));
      STATE.stowaway = null;
    }, setup || {});
    await page.waitForTimeout(200);
    return page;
  };

  console.log('— ruling 136: one-off stories are once a run');
  let page = await boot();
  const r = await page.evaluate(ids => {
    const notOnce = ids.filter(id => !EVENTS[id] || EVENTS[id].once !== true);
    const rep = Object.values(EVENTS).filter(e => e.once === false).length;
    // Family odds: against one weight-1 filler of the same tier the
    // family wins half the draws — before and after its named ships are met.
    const base = { easy: 1, medium: 1, hard: 1, ultra: 1 };
    const share = (fam) => {
      const live = Object.values(EVENTS).filter(e => e.family === fam && !(e.once && STATE.seenEventIds.has(e.id)));
      const tier = live[0].difficulty;
      const pool = [{ id: 'filler', difficulty: tier, trigger: ['any'] }, ...live];
      const orig = Math.random, hs = STATE.hardStreak, pr = STATE.pityRelief; let n = 0;
      for (let i = 0; i < 4000; i++) { Math.random = () => (i + 0.5) / 4000; if (drawWeightedEvent(pool, new Set(['any']), base, null).id !== 'filler') n++; }
      Math.random = orig; STATE.hardStreak = hs; STATE.pityRelief = pr; return n / 4000;
    };
    const before = { t: share('trader'), p: share('pirate') };
    for (const id of ['event_encounter_trader_002', 'event_encounter_trader_004', 'event_encounter_pirate_002']) STATE.seenEventIds.add(id);
    const after = { t: share('trader'), p: share('pirate') };
    // familyEvent never hands back a met named ship.
    const faces = new Set();
    for (let i = 0; i < 60; i++) { const e = familyEvent('trader', { id: 'n' + i }); if (e) faces.add(e.id); }
    // The trader met at a stop stays that stop's face, even a named ship
    // now seen (a second TRADE there is the same ship, ruling 90).
    const node = STATE.nodes.find(x => x.node_type === 'planet');
    STATE.tradersMet = { [node.id]: 'event_encounter_trader_004' };
    const keeps = familyEvent('trader', node).id === 'event_encounter_trader_004';
    STATE.tradersMet = {};
    // A named ship cools its family like the single trader did.
    STATE.eventLastStop = {};
    noteEventDrawn(EVENTS.event_encounter_pirate_003);
    const cooled = Object.keys(STATE.eventLastStop).includes('family:pirate');
    noteEventDrawn(EVENTS.event_void_001);
    const plainOnce = Object.keys(STATE.eventLastStop).includes('event_void_001');
    return { notOnce, rep, before, after, faces: [...faces], keeps, cooled, plainOnce };
  }, ONE_OFFS);
  ok(!r.notOnce.length, `the ${ONE_OFFS.length} one-off stories are once: true` + (r.notOnce.length ? ' — not: ' + r.notOnce.join(', ') : ''));
  ok(r.rep === 70, `70 routine events stay repeatable, the Adrift scene (ruling 144) among them (${r.rep})`);
  ok(Math.abs(r.before.t - 0.5) < 0.01 && Math.abs(r.before.p - 0.5) < 0.01, `families keep one old event's odds (traders ${r.before.t}, pirates ${r.before.p})`);
  ok(Math.abs(r.after.t - 0.5) < 0.01 && Math.abs(r.after.p - 0.5) < 0.01, `and still do once named ships are met (traders ${r.after.t}, pirates ${r.after.p})`);
  ok(r.faces.length && !r.faces.some(id => /trader_00[24]$/.test(id)), 'a TRADE face is never a met named ship: ' + r.faces.join(', '));
  ok(r.keeps, 'the trader met at a stop is still that stop\'s trader once seen (a second TRADE is the same ship)');
  ok(r.cooled, 'a named pirate cools the pirate family for the repeat cooldown');
  ok(!r.plainOnce, 'a plain once-a-run event takes no cooldown slot (it never comes back)');
  await page.close();

  console.log('— ruling 137: a morale gain the cap swallowed is said in the log');
  for (const [ai, start, want] of [['rex', 100, true], ['aria', 100, true], ['marv', 50, false]]) {
    page = await boot({ ai });
    const o = await page.evaluate(start => {
      // A flat event whose plain choice lifts the whole crew: no effort roll,
      // no minigame, no crew gate, no single target.
      let pick = null;
      for (const ev of Object.values(EVENTS)) {
        if (!Array.isArray(ev.choices) || ev.layers) continue;
        const ch = ev.choices.find(c => c.outcome && c.outcome.resources && c.outcome.resources.morale > 0 && !c.outcome.morale_to
          && !c.requires_crew && !c.requires_item && !c.launch_minigame && !c.microgame_type && !c.minigame_type && !c.effort_required
          && !c.outcome.crew_effect && !c.outcome.severity && !ev.npc);
        if (ch) { pick = { ev, ch }; break; }
      }
      if (!pick) return { none: true };
      setCrewMorale(start);
      const n0 = STATE.shipLog.length;
      enterEvent(STATE.byId[STATE.currentId], pick.ev);
      handleChoiceClick(pick.ch);
      advanceAfterEvent();
      const pool = [].concat(MOD.ai_companions.find(a => a.id === 'ai_' + STATE.activeAI).log_templates.morale_full);
      const added = STATE.shipLog.slice(n0).map(e => e.text);
      return { id: pick.ev.id, added, full: added.filter(t => pool.includes(t)), morale: crewMoraleRaw() };
    }, start);
    if (o.none) { ok(false, 'no event with a plain whole-crew morale gain found'); await page.close(); continue; }
    if (want) {
      ok(o.full.length === 1, `${ai.toUpperCase()} at 100 morale (${o.id}): one "morale is full" line — ${o.full[0] || o.added.join(' | ')}`);
      ok(o.morale <= 100, 'morale stays capped at 100 (' + o.morale + ')');
    } else {
      ok(o.full.length === 0, `${ai.toUpperCase()} at ${start} morale: no "morale is full" line (${o.added.length} entries)`);
    }
    await page.close();
  }

  console.log('— read-through 36: a failed effort check says the days it added; wounds state both effects');
  page = await boot({ crew: ['medic', 'chef'] });
  const e = await page.evaluate(async () => {
    let pick = null;
    for (const ev of Object.values(EVENTS)) {
      if (!Array.isArray(ev.choices) || ev.layers) continue;
      const ch = ev.choices.find(c => effortCheckOf(c) && !c.fail_outcome && !c.launch_minigame && !c.requires_crew && !c.requires_item && !Number.isFinite(c.effort_required));
      if (ch) { pick = { ev, ch }; break; }
    }
    if (!pick) return { none: true };
    enterEvent(STATE.byId[STATE.currentId], pick.ev);
    renderEncounterState({ instant: true });
    await new Promise(r => setTimeout(r, 300));
    const keep = Math.random; Math.random = () => 0.9999;
    try { handleChoiceClick(pick.ch); await new Promise(r => setTimeout(r, 400)); } finally { Math.random = keep; }
    const body = (document.getElementById('enc-narr-body') || document.getElementById('enc-narrative') || {}).textContent || '';
    const line = effortCheckOf(pick.ch).line;
    return { id: pick.ev.id, body, line };
  });
  if (e.none) ok(false, 'no flat event with a generic effort check found');
  else {
    ok(e.body.includes(e.line + ' It added two days.'), `${e.id}: the failure line says "It added two days." — ${e.body.slice(-160)}`);
  }
  const html = require('fs').readFileSync(require('path').join(__dirname, '../../index.html'), 'utf8');
  ok(html.includes("is wounded: their skill is offline and they work at half strength until they recover.") && !html.includes('Their skill is offline until they recover'), 'the wound line says both: skill offline, half strength');
  // Ruling 138 in the manual: crew-power numbers never read "Effort N / M";
  // ruling 146 then dropped the score itself: the tooltip names who's helping.
  const man = require('fs').readdirSync(require('path').join(__dirname, '../../docs/manual/src')).filter(f => f.endsWith('.html'))
    .map(f => require('fs').readFileSync(require('path').join(__dirname, '../../docs/manual/src', f), 'utf8')).join('\n');
  ok(!/Effort \d+ \/ \d+/.test(man) && !/Hands \d+ \/ \d+/.test(man) && /HELPING/.test(man) && /2 days · 90% clean/.test(man), 'the manual shows no hands score, names HELPING and the days · odds sub-label (text, picture description, caption)');
  await page.close();

  ok(!errors.length, 'no page errors: ' + errors.slice(0, 3).join(' | '));
  console.log('rulings 136/137: ' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
