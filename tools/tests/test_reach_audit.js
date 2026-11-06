// Reachability audit (2026-11-05): the events, endings and failure 960 bot
// runs never showed. For each event its gate is met the way play meets it
// (the setter outcome that sets its flag or grants its item, a crafted or
// broken fabricator, a PLAID strain roll, a jettisoned hold, a crew death,
// an accepted crop loss, a lost ship in the records) at a stop of its kind;
// then it must be eligible, win real draws there, open and resolve one
// choice without a page error. The station approach and Market Row are
// opened by the station visit, not drawn. Each line reports the share of
// draws the event wins at that stop with its gate met.
// IDS=a,b narrows the event list.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const NEVER_SEEN = (process.env.IDS ? process.env.IDS.split(',') : `asteroid_007 crisis_019 crisis_020 crisis_023 crisis_024 crisis_031 crisis_032
crisis_045 crisis_054 crisis_055 crisis_056 crisis_057 derelict_014 general_008 general_009 general_010 general_011 general_012 general_013
general_014 general_021 general_023 general_038 general_051 general_052 general_053 general_062 nebula_003 planet_005 shipboard_003
shipboard_009 shipboard_010 shipboard_011 shipboard_012 shipboard_013 shipboard_022 shipboard_023 shipboard_031 shipboard_038
species_robot_007 species_rock_007 species_unknown_007 station_008 station_010 station_011 station_026 station_027 station_028
station_031 station_032 void_005 void_006 void_008 voyage_edge_003 voyage_ship_002 voyage_ship_003 voyage_ship_006 voyage_thin_001
voyage_thin_002 voyage_trigger_003 voyage_trigger_004 voyage_trigger_009`.split(/\s+/)).map(s => s.startsWith('event_') ? s : 'event_' + s);

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const boot = async () => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.map_rules && typeof enterEvent === 'function' && typeof loadRecords === 'function');
    await page.evaluate(() => {
      localStorage.removeItem('transplant_save_v1');
      localStorage.removeItem('transplant_records_v1');
      // Every outcome object in the content, with the event it sits in.
      window.__outs = [];
      for (const ev of Object.values(EVENTS)) (function walk(x) {
        if (!x || typeof x !== 'object') return;
        if (x !== ev && (x.sets_flag || x.item_grant)) __outs.push({ ev, o: x });
        for (const v of Object.values(x)) walk(v);
      })(ev);
      // A deterministic random for the draw sample.
      window.__lcg = seed => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
    });
  };

  // ------------------------------------------------------------------
  // Meet one event's gate the way play meets it. Returns { node, how[] }
  // or { err }.
  const force = id => page.evaluate(async id => {
    const ev = EVENTS[id];
    if (!ev) return { err: 'no such event' };
    const how = [];
    const trig = (ev.trigger || ['any']).find(t => t !== 'any');
    const trail = ev.trail ? ev.trail[0] : 'mars';
    const solo = trig === 'solo_run';
    const crew = solo ? [] : [...new Set(['engineer', 'medic', ...[].concat(ev.requires_role || [])])];
    applySetupToState({ trail, ai: [].concat(ev.requires_ai || 'aria')[0], captain: [].concat(ev.captain_background || 'veteran')[0], crew, crop: [].concat(ev.crop_type || 'wheat')[0], ship: 'Audit' });
    STATE.stowaway = null;
    STATE.flags.add('departed');
    STATE.goldAmount = 150;
    for (const k of ['fuel', 'food', 'water', 'o2', 'hull']) STATE.resources[k] = 80;
    if (STATE.cropGrowth) { STATE.cropGrowth.health = 80; STATE.cropGrowth.growth = 50; }
    const sp = eventSpecies(ev);
    if (sp && sp !== 'human') { STATE.voyageSpecies = sp; how.push('voyage species ' + sp); }
    const days = () => { window.passDays = () => {}; };
    days();

    // The flag: the outcome that sets it in play, applied for real.
    const applyOut = o => { const save = Object.assign({}, STATE.resources); applyOutcomeEffects(JSON.parse(JSON.stringify(o))); Object.assign(STATE.resources, save); };
    if (ev.requires_flag) {
      const f = ev.requires_flag;
      const src = __outs.find(x => [].concat(x.o.sets_flag || []).includes(f) && x.ev.active !== false && x.ev.id !== ev.id);
      if (src) { applyOut(src.o); how.push(`flag ${f} ← ${src.ev.id}`); }
      else if (f === 'executed_surrendered_pirate') {
        settleCombatWon({ won: { outcome: 'victory_executed' }, species: 'human', hull: STATE.resources.hull });
        how.push(`flag ${f} ← combat FINISH THEM (settleCombatWon)`);
      } else return { err: 'nothing sets flag ' + f };
      if (!STATE.flags.has(f)) return { err: `the setter did not set ${f}` };
    }
    // The item: the outcome that grants it, else the shelf.
    if (ev.requires_item) {
      const it = ev.requires_item;
      // A source that leaves the event's unless_flag clear (the bone's
      // collector waits for the quest that hands the bone over to end).
      const blocks = o => [].concat(o.sets_flag || []).some(f => [].concat(ev.unless_flag || []).includes(f));
      const src = __outs.find(x => [].concat(x.o.item_grant || []).includes(it) && x.ev.active !== false && x.ev.id !== ev.id && !blocks(x.o));
      if (src) { applyOut(src.o); how.push(`item ${it} ← ${src.ev.id}`); }
      else if ((itemDef(it) || {}).item_source === 'purchasable') { grantItem(it); how.push(`item ${it} ← bought`); }
      else return { err: 'nothing grants item ' + it };
      if (!STATE.items.includes(it)) return { err: `the source did not put ${it} in the hold` };
    }
    // An earlier lost ship on record (the wreck events).
    if (ev.requires_past_run) {
      const r = loadRecords();
      r.runs.push({ kind: 'failure', id: '1:old', ship: 'Old Hope', captain: 'pilot', crop: 'tomato', tone: 'starvation', days: 31, trail: 'mars' });
      localStorage.setItem('transplant_records_v1', JSON.stringify(r));
      if (!window.pastWreck || !window.pastWreck()) {
        // pastWreck is records.js's own; reach it through fitsThisRun
        if (!fitsThisRun(Object.assign({}, ev, { requires_past_run: true }))) return { err: 'a failure on record is not a past wreck' };
      }
      how.push('a lost ship in the records');
    }
    // The situation.
    switch (trig) {
      case 'fab_low': case 'fab_broken': {
        // Wear from a print is 1–3%; the big steps are event outcomes with
        // fab_wear. Some prints' worth, then the heaviest such outcome.
        const fab = STATE.fabricator;
        fab.wear = trig === 'fab_low' ? 35 : 65;
        const src = __outs.concat(Object.values(EVENTS).flatMap(e => { const o = []; (function w(x) { if (x && typeof x === 'object') { if (Number.isFinite(x.fab_wear)) o.push({ ev: e, o: x }); for (const v of Object.values(x)) w(v); } })(e); return o; }))
          .filter(x => Number.isFinite(x.o.fab_wear)).sort((a, b) => b.o.fab_wear - a.o.fab_wear)[0];
        how.push(`fabricator at ${fab.wear}% wear`);
        applyOut({ fab_wear: src.o.fab_wear });
        how.push(`+${src.o.fab_wear} (${src.ev.id}) → ${fab.wear}${fab.broken ? ', broken' : ''}`);
        break;
      }
      case 'engine_strain': {
        STATE.orders.pace = 'plaid'; STATE.plaidLegs = 4;
        const r = Math.random; Math.random = () => 0.01;
        STATE.engineStrain = rollEngineStrain('plaid') || !!STATE.engineStrain;
        Math.random = r;
        how.push(`PLAID, 4 legs of heat: strain ${STATE.engineStrain}`);
        break;
      }
      case 'empty_cargo': {
        const stuck = STATE.items.filter(i => (itemDef(i) || {}).no_jettison);
        if (stuck.length) return { err: 'start cargo cannot be jettisoned: ' + stuck };
        how.push('jettisoned the start cargo (' + STATE.items.join(', ') + ')');
        STATE.items = []; syncItemValues && syncItemValues();
        if (ev.requires_item) return { err: 'needs an item and an empty hold' };
        break;
      }
      case 'solo_run': how.push('a captain flying alone'); break;
      case 'crew_dead': killCrew('medic'); how.push('the medic died (killCrew)'); break;
      case 'crop_dead': {
        STATE.cropGrowth.health = 0;
        checkFailure();
        await new Promise(r => setTimeout(r, 400));
        const scr = (document.querySelector('.screen.active') || {}).id;
        endContinueRun();
        await new Promise(r => setTimeout(r, 400));
        how.push(`crop died → ${scr} → Keep flying`);
        break;
      }
      case 'low_hull': STATE.resources.hull = 20; how.push('hull 20'); break;
      case 'low_o2': STATE.resources.o2 = 20; how.push('o2 20'); break;
      case 'journey_end': break;
      case undefined: break;
      default: return { err: 'no recipe for trigger ' + trig };
    }
    // Where: a stop of its kind, outside the human stretch for a species
    // event, far enough along for journey_end / after_progress.
    const rules = MOD.map_rules.trails[STATE.trail];
    const types = ev.node_type || ['any'];
    const fits = n => n.node_type !== 'fork' && (types.includes('any') ? n.node_type !== 'station' : types.includes(n.node_type))
      && (!sp || sp === 'human' || speciesZone(n, rules) !== 'human');
    let node = STATE.nodes.filter(fits).sort((a, b) => routeFrac(b, rules) - routeFrac(a, rules))[0];
    if (!node) {
      // The map didn't roll one: make the last ordinary stop that kind.
      const base = STATE.nodes.filter(n => n.node_type !== 'station' && n.node_type !== 'fork').slice(-2)[0];
      if (!base) return { err: 'no node' };
      base.node_type = types.includes('any') ? 'planet' : types[0];
      node = base; how.push(`(map had no ${node.node_type}: one made)`);
    }
    // Legs flown: near the end for journey_end, past after_progress, else a third.
    // (ultra: weight 0 until interstellar's late_difficulty, ruling 60)
    const tier = [].concat(ev.difficulty)[0];
    const want = trig === 'journey_end' || (ev.trigger || []).includes('journey_end') || tier === 'ultra' ? 0.9 : Math.max(0.35, ev.after_progress || 0);
    STATE.visited = new Set([STATE.currentId]);
    for (const n of STATE.nodes) { if (STATE.visited.size / pathLegs() >= want) break; if (n.id !== node.id) STATE.visited.add(n.id); }
    STATE.currentId = node.id;
    how.push(`at ${node.node_type}${node.residents ? ' (' + node.residents + ')' : ''}, ${Math.round(journeyFrac() * 100)}% flown`);
    window.__node = node;
    return { how };
  }, id);

  // Why an event is not eligible here: each of eventEligible's rules.
  const why = () => page.evaluate(() => {
    const ev = window.__ev, node = window.__node, t = activeTriggers();
    const r = [];
    if (ev.requires_flag && !STATE.flags.has(ev.requires_flag)) r.push('flag');
    if (ev.requires_item && !STATE.items.includes(ev.requires_item)) r.push('item');
    if (!fitsThisRun(ev)) r.push('fitsThisRun');
    if (!speciesPresent(ev, node)) r.push('speciesPresent');
    if (ev.requires_crop_alive && !(STATE.cropGrowth && STATE.cropGrowth.health > 0)) r.push('crop');
    if (!(ev.trigger || ['any']).some(x => t.has(x))) r.push('trigger (active: ' + [...t].join(' ') + ')');
    return r.join(', ') || '?';
  });

  console.log('— the never-seen events: gate met as play meets it → eligible, drawn, plays');
  const report = [];
  for (const id of NEVER_SEEN) {
    await boot();
    errors.length = 0;
    const f = await force(id);
    if (f.err) { ok(false, `${id}: ${f.err}`); report.push([id, 'GATE', f.err]); continue; }
    await page.evaluate(id => { window.__ev = EVENTS[id]; }, id);
    const d = await page.evaluate(() => {
      const ev = __ev, node = __node;
      const eligible = eventEligible(ev, node, activeTriggers());
      const pool = Object.values(EVENTS).filter(e => eventEligible(e, node, activeTriggers())).length;
      // 1000 real draws at this stop (selectEvent's own pool, weights,
      // cooldown); the streak counters put back after each.
      const keep = { hs: STATE.hardStreak, pr: STATE.pityRelief }, r0 = Math.random;
      Math.random = __lcg(7);
      let won = 0;
      for (let i = 0; i < 1000; i++) { const e = selectEvent(node); if (e && e.id === ev.id) won++; STATE.hardStreak = keep.hs; STATE.pityRelief = keep.pr; }
      Math.random = r0;
      return { eligible, pool, share: won / 1000 };
    });
    if (!d.eligible) { const w = await why(); ok(false, `${id}: NOT eligible with its gate met — ${w} [${f.how.join('; ')}]`); report.push([id, 'BROKEN', w]); continue; }
    // Open it and take its first open choice to the end.
    const p = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      enterEvent(__node, __ev); finishAllTyping(); await wait(300);
      const body = (document.getElementById('enc-narr-body') || {}).textContent || '';
      let steps = 0;
      while (steps++ < 6 && !STATE.currentOutcomeId && !STATE.outcomeMode) {
        const b = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked):not(.leave)')].filter(x => x.offsetParent !== null)[0];
        if (!b) break;
        b.click(); await wait(500); finishAllTyping();
        if (window.MarketModal && MarketModal.isOpen()) { MarketModal.close(); await wait(300); }
        if (document.getElementById('screen-encounter').classList.contains('combat-mode')) { window.abortCombat && abortCombat(); break; }
      }
      return { body: body.slice(0, 60), done: !!(STATE.currentOutcomeId || STATE.outcomeMode) || steps > 1 };
    });
    ok(d.share > 0 && p.body && !errors.length, `${id}: eligible, wins ${(d.share * 100).toFixed(1)}% of draws among ${d.pool} (${f.how.join('; ')}); opens "${p.body}…"` + (errors.length ? ' ERRORS: ' + errors.join(' | ') : ''));
    report.push([id, 'OK', (d.share * 100).toFixed(1) + '% of ' + d.pool, f.how.join('; ')]);
  }

  console.log('— the station visit opens the approach and Market Row (never drawn)');
  await boot();
  const st = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    applySetupToState({ trail: 'mars', ai: 'aria', captain: 'veteran', crew: ['engineer'], crop: 'wheat', ship: 'Audit' });
    STATE.flags.add('departed'); STATE.goldAmount = 150;
    const node = STATE.nodes.find(n => n.node_type === 'station' && n.id !== STATE.currentId);
    const seen = [];
    const real = enterEvent;
    window.enterEvent = function (n, ev, o) { if (ev) seen.push(ev.id); return real(n, ev, o); };
    STATE.currentId = node.id;
    // travelTo's station branch: the stop's draw, then the visit.
    StationVisit.arrive(node, null); // (a drawn arrival-kind event would play instead)
    await wait(600); finishAllTyping();
    const approach = STATE.currentEvent && STATE.currentEvent.id;
    // Through the dock to Market Row (rows named DOCK, then MARKET).
    const click = async re => { const b = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')].find(x => re.test(x.textContent)); if (b) { b.click(); await wait(700); finishAllTyping(); } return !!b; };
    const path = [];
    for (let i = 0; i < 4 && !seen.includes('event_station_013'); i++) {
      if (await click(/market/i)) path.push('MARKET');
      else if (await click(/\bdock\b|continue/i)) path.push('DOCK');
      else if (window.MarketModal && MarketModal.isOpen()) break;
      // the stop's drawn event may play first on DOCK: take its first row
      else { const b = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked):not(.leave)')][0]; if (!b) break; b.click(); await wait(700); finishAllTyping(); path.push('(event)'); }
    }
    return { approach, seen, path };
  });
  ok(st.approach === 'event_station_014', `arriving at a station opens event_station_014 (${st.approach})`);
  ok(st.seen.includes('event_station_013'), `the dock leads to Market Row event_station_013 (${st.path.join(' → ')}; opened ${st.seen.join(', ')})`);

  console.log('— the never-reached endings: hollow (crop lost), pyrrhic (crew lost, stocks low)');
  const arrive = (kind, pickIdx) => page.evaluate(async ({ kind, pickIdx }) => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'Audit' });
    STATE.stowaway = null; STATE.flags.add('departed');
    for (const k of ['fuel', 'food', 'water', 'o2', 'hull']) STATE.resources[k] = 60;
    STATE.daysElapsed = Math.round(STATE.baseDays * 0.9);
    if (kind === 'hollow') { STATE.cropGrowth.health = 0; STATE.flags.add('crop_death_accepted'); }
    if (kind === 'pyrrhic') { killCrew('engineer'); killCrew('medic'); for (const k of ['fuel', 'food', 'water', 'hull']) STATE.resources[k] = 35; }
    const bracket = scoreBracket(), score = Math.round(scoreValue());
    const pool = MOD.endings.filter(e => e.active !== false && (e.ending_score === 'any' || e.ending_score === bracket)).map(e => e.id);
    // filterThenRandomDraw picks uniformly: steer it to entry pickIdx.
    let drawn = null;
    const realEnd = endRun; window.endRun = e => { drawn = e.module && e.module.id; return realEnd(e); };
    const r0 = Math.random; Math.random = () => (pickIdx + 0.5) / pool.length;
    triggerArrival(STATE.byId[STATE.currentId]);
    Math.random = r0; window.endRun = realEnd;
    await wait(1200);
    if (typeof showEndReport === 'function') { showEndReport(); await wait(800); }
    const text = (document.getElementById('screen-end') || document.body).innerText;
    return { bracket, score, pool, drawn, text: text.slice(0, 4000), screen: (document.querySelector('.screen.active') || {}).id };
  }, { kind, pickIdx });
  for (const [kind, want] of [['hollow', ['ending_hollow_002']], ['pyrrhic', ['ending_pyrrhic_001', 'ending_pyrrhic_002']]]) {
    await boot();
    const first = await arrive(kind, 0);
    ok(first.bracket === kind, `a ${kind} arrival scores ${first.score} → bracket ${first.bracket}; draws among ${first.pool.join(', ')}`);
    for (const id of want) {
      await boot(); errors.length = 0;
      const probe = await arrive(kind, 0);
      const r = await arrive(kind, Math.max(0, probe.pool.indexOf(id)));
      const bad = (r.text.match(/\{[a-z_.]+\}|undefined|NaN/gi) || []);
      ok(r.drawn === id && r.screen === 'screen-end' && !bad.length && !errors.length, `${id}: drawn for a ${kind} arrival (${r.drawn}), end screen shows (${r.screen})` + (bad.length ? ' UNRESOLVED: ' + bad.join(' ') : '') + (errors.length ? ' ERRORS: ' + errors.join(' | ') : ''));
    }
  }

  console.log('— suffocation: O2 at zero for the deprivation window ends the run');
  await boot(); errors.length = 0;
  const suf = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    applySetupToState({ trail: 'mars', ai: 'rex', captain: 'veteran', crew: ['engineer'], crop: 'wheat', ship: 'Audit' });
    STATE.stowaway = null; STATE.flags.add('departed');
    for (const k of ['fuel', 'food', 'water', 'hull']) STATE.resources[k] = 100;
    STATE.items = STATE.items.filter(i => i !== 'o2_canister');
    STATE.resources.o2 = 0;
    let days = 0, died = null;
    while (days < 30 && !STATE.ended) { passDays(1); STATE.resources.o2 = 0; days++; checkFailure(); }
    await wait(1200);
    const text = (document.getElementById('screen-end') || document.body).innerText;
    return { ended: STATE.ended, days, deprived: Object.assign({}, STATE.deprived), text: text.slice(0, 600), failAfter: DEPRIVATION.o2 && DEPRIVATION.o2.failAfter };
  });
  ok(suf.ended && /air|breath|suffocat|oxygen/i.test(suf.text) && !/\{[a-z_.]+\}|undefined|NaN/i.test(suf.text), `O2 at zero: the run ends after ${suf.days} days (failAfter ${suf.failAfter}) — "${suf.text.replace(/\s+/g, ' ').slice(0, 140)}…"`);

  console.log('\nsummary');
  for (const r of report) console.log('  ' + r.join(' | '));
  console.log(`\nreach audit: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
