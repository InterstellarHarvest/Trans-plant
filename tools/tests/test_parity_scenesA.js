// Demo-parity batch 2, scenes A (2026-10-11): four demo-combat scenario
// beats ported as real layered events —
//   1. pirates board OUR ship (demo `boarding`)       event_encounter_boarding_002
//   2. returning pirate, full scene (`returning_pirate`) event_general_021 (rebuilt)
//   3. void entity talking head (`void_corrupted`)     event_void_004
//   4. unknown alien signal (`unknown_signal`)         event_encounter_unknown_001
// Each is reached through the real pool draw, its layers navigate, gates
// lock/unlock, backdrops + subject paint (computed styles, not class
// names), outcomes apply exactly what their previews say, flags have both
// ends. Also: npc.displayName / npc.variant / npc.recall (engine support
// added for these scenes). DRAW_RUNS=<n> sets the draw-rate sample
// (default 400 runs per trail); SHOT_DIR=<dir> saves screenshots.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const SHOT_DIR = process.env.SHOT_DIR || null;
const DRAW_RUNS = parseInt(process.env.DRAW_RUNS || '400', 10);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];

async function boot(setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'diplomat'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForTimeout(150);
  return page;
}
async function reloadRun(page) {
  await page.reload();
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor);
  await page.evaluate(() => loadRun());
  await page.waitForTimeout(200);
}
// Enter an event at a node of a type it can fire at (random maps may lack
// the type: then the current node is retyped — never a lookup that
// depends on map luck).
async function enter(page, id, nodeType) {
  return page.evaluate(([id, nt]) => {
    let node = STATE.nodes.find(n => n.node_type === nt && n.id !== STATE.currentId);
    if (!node) { node = STATE.byId[STATE.currentId]; node.node_type = nt; }
    STATE.currentId = node.id;
    enterEvent(node, EVENTS[id]);
    return node.id;
  }, [id, nodeType]);
}
// (index.html runChoiceAction holds a 300ms double-click lock across re-renders.)
const click = async (page, t) => { await page.waitForTimeout(320); return page.evaluate(t => {
  if (typeof finishAllTyping === 'function') finishAllTyping();
  const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.querySelector('.ch-text') && b.querySelector('.ch-text').textContent.trim() === t);
  if (!b) return false; b.click(); return true;
}, t); };
const choiceInfo = (page) => page.evaluate(() => {
  if (typeof finishAllTyping === 'function') finishAllTyping();
  return [...document.querySelectorAll('#enc-choices .enc-choice')].map(b => ({
    text: (b.querySelector('.ch-text') || {}).textContent || '',
    sub: (b.querySelector('.ch-sub') || {}).textContent || '',
    locked: b.classList.contains('locked'), leave: b.classList.contains('leave'),
    strip: getComputedStyle(b).borderRightColor, tip: b.dataset.tip || b.title || '',
  }));
});
// Settled scene: backdrop stack + subject (async resolution, 0.4s fade).
async function scene(page, expectMain) {
  const read = () => page.evaluate(() => {
    const url = el => { const m = /url\(["']?([^"')]+)["']?\)/.exec(el.style.backgroundImage || ''); return m ? decodeURIComponent(m[1]).replace(/^.*?sprites\/backgrounds\//, '') : null; };
    const main = document.getElementById('enc-backdrop'), base = document.getElementById('enc-backdrop-base'), sp = document.getElementById('enc-backdrop-sprite');
    const scr = document.getElementById('screen-encounter');
    const subj = document.getElementById('enc-subject'), head = document.getElementById('enc-subject-head');
    const sheet = (head.style.getPropertyValue('--sheet-url') || '').replace(/^url\(['"]?|['"]?\)$/g, '');
    return {
      main: url(main), mainComputed: getComputedStyle(main).backgroundImage,
      base: base.classList.contains('hidden') ? null : url(base),
      sprite: sp.classList.contains('hidden') ? null : url(sp),
      spriteComputed: getComputedStyle(sp).backgroundImage, spriteVisible: getComputedStyle(sp).display !== 'none' && getComputedStyle(sp).visibility !== 'hidden',
      layer: STATE.layerStack ? STATE.layerStack[STATE.layerStack.length - 1] : null,
      screenComm: scr.classList.contains('comm-corrupted') ? 'corrupted' : scr.classList.contains('comm-screen') ? 'screen' : 'in_person',
      subjVisible: !scr.classList.contains('no-subject') && getComputedStyle(subj).display !== 'none' && subj.getBoundingClientRect().width > 0,
      subjFilter: getComputedStyle(head).filter, subjAnim: getComputedStyle(subj).animationName + '|' + getComputedStyle(head).animationName,
      plate: (document.getElementById('enc-subject-name') || {}).textContent || '',
      sheet: sheet.replace(/^.*?sprites\//, ''),
      headBg: getComputedStyle(head).backgroundImage,
      dialogName: (document.getElementById('enc-dialog-name') || {}).textContent || '',
      dialogHidden: document.getElementById('enc-dialog').classList.contains('hidden'),
      line: (document.getElementById('enc-dialog-line') || {}).textContent || '',
      title: document.getElementById('enc-narr-title').textContent,
      npc: STATE.npcCtx ? Object.assign({}, STATE.npcCtx) : null,
      aiCorrupt: document.getElementById('enc-ai-bar').classList.contains('corrupted'),
      dialogCorrupt: document.getElementById('enc-dialog').classList.contains('corrupted'),
      aiFilter: getComputedStyle(document.getElementById('enc-ai-bar')).filter + '|' + getComputedStyle(document.getElementById('enc-ai-bar')).animationName,
      outcome: STATE.currentOutcomeId,
    };
  });
  let s;
  for (let i = 0; i < 60; i++) {
    if (typeof finishAllTyping === 'function') {}
    s = await read();
    if (s.main && (!expectMain || s.main.startsWith(expectMain)) && (!s.npc || s.sheet || s.headBg !== 'none')) break;
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(500);
  return read();
}
async function shot(page, name) {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.evaluate(() => typeof finishAllTyping === 'function' && finishAllTyping());
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
}
// Applies a layered outcome through the real click and returns the
// before/after state the outcome touched.
// Role concerns (ruling 57: the wounded, the engineer's hull, a pilot's
// pace or the chef's rations over the days an outcome takes) move morale on
// top of an outcome's own: tapped, so an expectation adds what the game
// really applied, as the crew average (window.__conc).
const tapConcerns = page => page.evaluate(() => {
  window.__conc = 0;
  if (window.__concTapped) return;
  window.__concTapped = true;
  const real = applyConcern;
  applyConcern = function (role) { const b = crewMoraleOf(role); const r = real.apply(this, arguments); window.__conc += (crewMoraleOf(role) - b) / STATE.crew.length; return r; };
});
const concerns = page => page.evaluate(() => window.__conc || 0);
const snap = page => page.evaluate(() => ({
  res: Object.assign({}, STATE.resources, { morale: crewMoraleRaw() }) /* per-crew morale: the crew average */, gold: STATE.goldAmount, items: STATE.items.slice(),
  flags: [...STATE.flags], day: STATE.daysElapsed, crewHP: Object.assign({}, STATE.crewHP, Number.isFinite(STATE.captainHP) ? { captain: STATE.captainHP } : {}) /* the captain can be hurt too (ruling 29) */, mats: Object.assign({}, STATE.materials),
}));

(async () => {
  browser = await chromium.launch();

  // ───────────────────────── reachability: real pool draws ─────────────────────────
  console.log(`— draw rates (${DRAW_RUNS} generated runs per trail, the real selectEvent walk)`);
  {
    const page = await boot();
    const rates = await page.evaluate(RUNS => {
      const IDS = ['event_encounter_boarding_002', 'event_general_021', 'event_void_004', 'event_encounter_unknown_001'];
      const out = {};
      const CREW = ['botanist', 'engineer', 'medic', 'pilot', 'chef', 'xenobiologist', 'diplomat'];
      const pick = a => a[Math.floor(Math.random() * a.length)];
      for (const trail of ['lunar', 'mars', 'interstellar']) {
        const hit = Object.fromEntries(IDS.map(i => [i, 0]));
        let sympRuns = 0, sympThenReturn = 0, events = 0, voidNodes = 0, voidHits = 0;
        for (let r = 0; r < RUNS; r++) {
          const c1 = pick(CREW); let c2 = pick(CREW); while (c2 === c1) c2 = pick(CREW);
          applySetupToState({ trail, ai: pick(['aria', 'marv', 'rex', 'chip', 'ajoy']), captain: 'veteran', crew: [c1, c2], crop: 'wheat', ship: 'D' });
          STATE.stowaway = null;
          let node = STATE.byId[STATE.currentId];
          let symp = false;
          for (let guard = 0; guard < 80; guard++) {
            const c = node.connects_to;
            const nexts = !c ? [] : Array.isArray(c) ? c : (c[pick(Object.keys(c))] || []);
            if (!nexts.length) break;
            STATE.visited.add(node.id);
            node = STATE.byId[pick(nexts)];
            STATE.currentId = node.id;
            const nc = node.connects_to;
            if (!nc || (Array.isArray(nc) ? !nc.length : !Object.keys(nc).length)) break; // arrival
            if (node.node_type === 'fork') continue;
            const ev = selectEvent(node);
            if (!ev) continue;
            events++;
            STATE.seenEventIds.add(ev.id);
            if (ev.sets_flag) STATE.flags.add(ev.sets_flag);
            if (/^event_launch_/.test(ev.id)) STATE.flags.add('departed');
            if (node.node_type === 'void') { voidNodes++; if (ev.id === 'event_void_004') voidHits++; }
            if (IDS.includes(ev.id)) hit[ev.id]++;
            if (ev.id === 'event_general_021' && symp) sympThenReturn++;
            // The mercy that schedules the returning pirate (diplomat → NEGOTIATE →
            // medic's "We have injured crew aboard"): assumed taken at half the
            // pirate meetings, whatever the crew, so the conditional rate has samples.
            if (ev.id === 'event_encounter_pirate_001' && !symp && Math.random() < 0.5) {
              symp = true; STATE.flags.add('pirate_sympathy'); sympRuns++;
            }
          }
        }
        out[trail] = { runs: RUNS, events, hit, sympRuns, sympThenReturn, voidNodes, voidHits };
      }
      return out;
    }, DRAW_RUNS);
    for (const [trail, r] of Object.entries(rates)) {
      const pct = id => (100 * r.hit[id] / r.runs).toFixed(1) + '%';
      console.log(`    ${trail}: boarding ${pct('event_encounter_boarding_002')} · unknown signal ${pct('event_encounter_unknown_001')} · void entity ${pct('event_void_004')} · returning pirate ${pct('event_general_021')} of all runs` +
        ` (${r.sympThenReturn}/${r.sympRuns} = ${r.sympRuns ? (100 * r.sympThenReturn / r.sympRuns).toFixed(0) : '–'}% of runs that earned the mercy)`);
    }
    ok(['lunar', 'mars', 'interstellar'].every(t => rates[t].hit.event_encounter_boarding_002 > 0), 'pirates-board-us is drawn on every trail');
    ok(['lunar', 'mars', 'interstellar'].every(t => rates[t].hit.event_encounter_unknown_001 > 0), 'the unknown signal is drawn on every trail');
    ok(rates.mars.hit.event_void_004 > 0 && rates.interstellar.hit.event_void_004 > 0, 'the void entity is drawn on mars (anomalies) and interstellar (void + anomalies)');
    ok(rates.lunar.hit.event_void_004 === 0, 'the void entity never appears on lunar (no void or anomaly nodes there)');
    const sym = ['mars', 'interstellar', 'lunar'].reduce((a, t) => [a[0] + rates[t].sympRuns, a[1] + rates[t].sympThenReturn], [0, 0]);
    ok(sym[0] > 0 && sym[1] > 0, `the returning pirate fires after the mercy (${sym[1]}/${sym[0]} runs)`);
    ok(['lunar', 'mars', 'interstellar'].every(t => rates[t].hit.event_general_021 === rates[t].sympThenReturn), 'the returning pirate never fires without pirate_sympathy');
    await page.close();
  }

  // ───────────────────────── 1. pirates board OUR ship ─────────────────────────
  console.log('— 1. pirates board our ship (demo boarding)');
  {
    const page = await boot({ crew: ['engineer', 'diplomat'] });
    await enter(page, 'event_encounter_boarding_002', 'nebula');
    const a = await scene(page, 'our_ship/cargo');
    ok(a.main === 'our_ship/cargo.jpg' && /cargo\.jpg/.test(a.mainComputed), `the security feed is our cargo bay: ${a.main}`);
    ok(a.base === null && a.sprite === null, 'no starfield or viewport ship behind the cargo bay');
    ok(a.screenComm === 'screen' && a.subjVisible, 'the intruder is on the security feed (comm-screen, subject frame shown)');
    ok(a.plate === 'INTRUDER' && a.npc.disposition === 'pirate' && /^npc\/pirate\//.test(a.sheet), `name plate INTRUDER over a pirate talking head (${a.sheet})`);
    ok(/sepia|hue-rotate|saturate|contrast|brightness/.test(a.subjFilter) || a.subjFilter !== 'none', `screen-mode tint on the subject (filter ${a.subjFilter.slice(0, 40)})`);
    ok(a.dialogHidden, 'no spoken line on the intro (the intruder only waves)');
    let ch = await choiceInfo(page);
    const leave = ch.find(c => c.leave);
    ok(leave && leave.locked && leave.text === "CAN'T LEAVE (THEY'RE HERE)", `leave row locked: "${leave && leave.text}"`);
    ok(['SEAL THE DECK', 'FIGHT', 'NEGOTIATE', 'HIDE'].every(t => ch.some(c => c.text === t && !c.locked)), 'SEAL / FIGHT / NEGOTIATE / HIDE all open with an engineer + diplomat');
    await shot(page, 'scenesA_boarding_intro');
    // NEGOTIATE → the intercom layer on the bridge.
    await click(page, 'NEGOTIATE');
    const b = await scene(page, 'our_ship/bridge');
    ok(b.layer === 'talk' && b.main === 'our_ship/bridge.png' && b.base && /^space\/deep\//.test(b.base), `COMMS OPEN: the bridge with space through the window (${b.main} + ${b.base})`);
    ok(!b.dialogHidden && /Fuel\. Food\. Your medic\./.test(b.line) && b.dialogName === 'INTRUDER', `the intruder speaks: ${b.line}`);
    ch = await choiceInfo(page);
    const who = ch.find(c => c.text === '"Who is sick?"');
    ok(who && who.locked && /Need: Medic/.test(who.sub), `"Who is sick?" locked without a medic (${who && who.sub})`);
    ok(ch.find(c => c.leave).locked, 'leave row still locked on the intercom layer');
    await shot(page, 'scenesA_boarding_talk');
    await click(page, 'Go back');
    const back = await page.evaluate(() => ({ layer: STATE.layerStack.slice(-1)[0], body: document.getElementById('enc-narr-body').textContent }));
    ok(back.layer === 'intro' && /Nobody has waved again/.test(back.body), 'Go back → intro, with its revisit line');
    // HIDE → success, the rations they take, corridor.
    const s0 = await snap(page);
    await tapConcerns(page);
    await click(page, 'HIDE');
    const h = await scene(page, 'our_ship/corridor');
    const s1 = await snap(page);
    const c1 = await concerns(page);
    ok(h.outcome === 'boarding_hide' && h.main === 'our_ship/corridor.jpg', `HIDE → PAST YOU over the corridor (${h.main})`);
    // Ruling 60: a hard event has no free option — hiding costs the rations
    // they leave with (it was +2 morale).
    ok(s1.res.food <= s0.res.food - 10 && Math.abs(s1.res.morale - (s0.res.morale + c1)) < 0.01 && s1.day > s0.day, `−10 food (${s0.res.food.toFixed(1)} → ${s1.res.food.toFixed(1)} with the days' rations), morale only by role concerns (${c1.toFixed(2)}), days pass (${s0.day}→${s1.day})`);
    await page.close();
  }
  {
    // "Take the fuel. Leave." = exactly half the fuel; previews say so.
    const page = await boot({ crew: ['diplomat', 'pilot'], ai: 'marv' });
    await page.evaluate(() => { STATE.resources.fuel = 80; });
    await enter(page, 'event_encounter_boarding_002', 'planet');
    await click(page, 'NEGOTIATE');
    await page.waitForTimeout(100);
    const ch = await choiceInfo(page);
    const half = ch.find(c => c.text === '"Take the fuel. Leave."');
    ok(half && /Give them half|−50% FUEL/.test(half.sub + half.tip), `"Take the fuel" promises half (${half && half.sub})`);
    const marv = ch.find(c => /MARV ·/.test(c.sub));
    ok(marv && /−50% FUEL|INJURY|HULL/.test(marv.sub), `MARV previews the costliest line: ${marv && marv.sub}`);
    const s0 = await snap(page);
    await click(page, '"Take the fuel. Leave."');
    const s1 = await snap(page);
    ok(s1.res.fuel === s0.res.fuel - 40, `fuel ${s0.res.fuel} → ${s1.res.fuel} (−50%)`);
    const o = await scene(page, 'our_ship/cargo');
    ok(o.outcome === 'boarding_fuel_only' && o.main === 'our_ship/cargo.jpg', 'FUEL TAKEN in the cargo bay');
    await page.close();
  }
  {
    // "Who is sick?" with a medic: Isa, the flag, the bridge.
    const page = await boot({ crew: ['diplomat', 'medic'] });
    await enter(page, 'event_encounter_boarding_002', 'asteroid_field');
    await click(page, 'NEGOTIATE');
    const s0 = await snap(page);
    ok(await click(page, '"Who is sick?"'), '"Who is sick?" open with a medic aboard');
    const o = await scene(page, 'our_ship/bridge');
    const s1 = await snap(page);
    ok(o.outcome === 'boarding_who' && /Her name is Isa\./.test(o.line), `AN ANSWER: "${o.line}"`);
    ok(s1.flags.includes('treated_isa') && s1.res.morale === Math.min(100, s0.res.morale + 5), 'treated_isa set, +5 morale');
    const body = await page.evaluate(() => { finishAllTyping(); return document.getElementById('enc-narr-body').textContent; }); // typed in full (b4 B5: at the demo's 18ms the ▍ cursor can sit mid-name)
    ok(!/\{crew\./.test(body) && body.includes(await page.evaluate(() => crewNameOf('medic'))), 'the medic is named ({crew.medic})');
    const pay = await page.evaluate(() => MOD.flavor.flag_payoffs.treated_isa);
    ok(pay && pay.epilogue && ['aria', 'marv', 'rex', 'chip', 'ajoy'].every(k => pay.callback[k]), 'treated_isa has its payoff (epilogue + five callbacks)');
    await shot(page, 'scenesA_boarding_isa');
    await page.close();
  }
  {
    // FIGHT / SEAL / "Not the medic." apply what they say.
    for (const [label, crew, nav, expect] of [
      ['FIGHT', ['pilot', 'chef'], null, { hull: -6, injury: true, tax: 4 }],
      ['SEAL THE DECK', ['engineer', 'chef'], null, { food: -8, morale: 3, tax: 2 }],
      ['"Not the medic."', ['diplomat', 'chef'], 'NEGOTIATE', { hull: -10, morale: -4, injury: true }],
    ]) {
      const page = await boot({ crew, ai: 'rex' });
      await enter(page, 'event_encounter_boarding_002', 'derelict');
      if (nav) await click(page, nav);
      await page.waitForTimeout(50);
      const s0 = await snap(page);
      await tapConcerns(page);
      await click(page, label);
      const s1 = await snap(page);
      const conc = await concerns(page);
      const hurt = Object.keys(s1.crewHP).filter(r => s1.crewHP[r] < 40);
      const res = k => k === 'morale' ? Math.round((s1.res.morale - s0.res.morale - conc) * 100) / 100 : s1.res[k] - s0.res[k];
      const checks = [];
      if (expect.hull) checks.push(res('hull') === expect.hull);
      if (expect.food) checks.push(res('food') < 0 && res('food') <= expect.food);
      if (expect.injury) checks.push(hurt.length === 1);
      if (expect.morale && !expect.tax) checks.push(res('morale') === expect.morale);
      if (expect.tax && expect.morale) checks.push(res('morale') === expect.morale - expect.tax);
      if (expect.tax && !expect.morale) checks.push(res('morale') === -expect.tax);
      ok(checks.every(Boolean), `${label}: hull ${res('hull')}, food ${res('food')}, morale ${res('morale')} (role concerns ${conc.toFixed(2)} on top), wounded ${hurt.join(',') || 'none'}`);
      await page.close();
    }
  }

  // ───────────────────────── 2. returning pirate ─────────────────────────
  console.log('— 2. returning pirate, full scene (demo returning_pirate)');
  {
    const page = await boot({ crew: ['diplomat', 'medic'] });
    // Earn the mercy for real: pirate_001 → NEGOTIATE → "We have injured crew aboard".
    const first = await enter(page, 'event_encounter_pirate_001', 'nebula');
    const p = await scene(page, 'our_ship/bridge');
    await click(page, 'Negotiate');
    await click(page, '"We have injured crew aboard."'); // b4 B7: a spoken dialog choice now (demo-combat)
    await page.waitForTimeout(100);
    const mem = await page.evaluate(() => ({ flag: STATE.flags.has('pirate_sympathy'), m: STATE.npcCache['flag:pirate_sympathy'] }));
    ok(mem.flag && mem.m && mem.m.species === p.npc.species && /^event_encounter_pirate_001@/.test(mem.m.artKey), `the mercy remembers who it was (${mem.m && mem.m.species}, ${mem.m && mem.m.artKey})`);
    const eligible = await page.evaluate(() => { const n = STATE.nodes.find(n => n.node_type === 'planet') || STATE.byId[STATE.currentId]; return eventEligible(EVENTS.event_general_021, Object.assign({}, n, { node_type: 'planet' }), activeTriggers()); });
    ok(eligible, 'event_general_021 enters the pool once pirate_sympathy is set');
    await page.evaluate(() => advanceAfterEvent());
    // A later stop.
    await page.evaluate(first => {
      const n = STATE.nodes.find(n => n.id !== first && n.node_type !== 'station' && n.node_type !== 'fork') || STATE.nodes.find(n => n.id !== first);
      n.node_type = 'planet';
      STATE.currentId = n.id;
      enterEvent(n, EVENTS.event_general_021);
    }, first);
    const a = await scene(page, 'our_ship/bridge');
    ok(a.main === 'our_ship/bridge.png' && /^space\//.test(a.base || '') && a.sprite && a.sprite === p.sprite, `the familiar ship in the window: ${a.sprite} (first met: ${p.sprite})`);
    ok(a.npc.species === p.npc.species && a.sheet === p.sheet, `the same captain's face (${a.sheet})`);
    ok(a.plate === 'FAMILIAR CAPTAIN' && a.screenComm === 'screen', 'FAMILIAR CAPTAIN over the hail (comm-screen)');
    let ch = await choiceInfo(page);
    ok(['"What do you want?"', '"Last time worked out, then?"', 'WEAPONS HOT', 'IGNORE THE HAIL'].every(t => ch.some(c => c.text === t)), 'intro choices are the demo\'s four');
    const leave = ch.find(c => c.leave);
    ok(leave && !leave.locked && leave.text === 'PART WAYS', 'leave row: PART WAYS');
    await shot(page, 'scenesA_returning_intro');
    await click(page, '"Last time worked out, then?"');
    const b = await scene(page, 'our_ship/bridge');
    ok(b.layer === 'what' && /running ahead of you/.test(b.line) && b.dialogName === 'FAMILIAR CAPTAIN', `A DEBT: "${b.line.slice(0, 50)}…"`);
    ok(b.sprite === a.sprite, 'the gift layer keeps their ship in the window');
    await shot(page, 'scenesA_returning_gift');
    const s0 = await snap(page);
    await click(page, '"The jar. What is it?"');
    const s1 = await snap(page);
    const o = await scene(page, 'our_ship/bridge');
    const added = s1.items.filter((x, i, arr) => arr.filter(y => y === x).length > s0.items.filter(y => y === x).length);
    ok(o.outcome === 'recur_jar' && ['repair_kit', 'drive_coil', 'pre_collapse_artifact'].every(i => added.includes(i)), `THE JAR: the crate lands (${[...new Set(added)].join(', ')})`);
    ok(s1.flags.includes('pirates_squared') && s1.res.morale === Math.min(100, s0.res.morale + 5), 'pirates_squared set, +5 morale');
    ok(/worth a lot to someone/.test(o.line), 'their captain says what the jar is');
    await reloadRun(page);
    ok(await page.evaluate(() => !!STATE.npcCache['flag:pirate_sympathy'] && STATE.seenEventIds.has('event_general_021')), 'the remembered NPC survives a save/load');
    await page.close();
  }
  {
    // WEAPONS HOT = the real combat, with the demo's "FIRED ON A FRIEND" opening; the flag is recorded.
    const page = await boot({ crew: ['diplomat', 'medic'] });
    await page.evaluate(() => { STATE.flags.add('pirate_sympathy'); });
    await enter(page, 'event_general_021', 'void');
    await scene(page, 'our_ship/bridge');
    await click(page, 'WEAPONS HOT');
    await page.waitForFunction(() => document.getElementById('screen-encounter').classList.contains('combat-mode'));
    const c = await page.evaluate(() => ({ flag: STATE.flags.has('fired_on_old_debtors'), narr: document.getElementById('enc-narrative').textContent }));
    ok(c.flag, 'WEAPONS HOT records fired_on_old_debtors');
    ok(/FIRED ON A FRIEND/.test(c.narr), 'the fight opens on the demo\'s FIRED ON A FRIEND beat (combat_intro)');
    await shot(page, 'scenesA_returning_weapons_hot');
    await page.evaluate(() => window.abortCombat && window.abortCombat());
    await page.close();
  }
  {
    // REFUSE THE GIFT / IGNORE: their effects.
    const page = await boot({ crew: ['pilot', 'chef'] });
    await page.evaluate(() => { STATE.flags.add('pirate_sympathy'); });
    await enter(page, 'event_general_021', 'derelict');
    const sp = await page.evaluate(() => STATE.npcCtx.species);
    ok(!!sp, `no remembered NPC (an old save): a pirate is rolled (${sp})`);
    await click(page, '"What do you want?"');
    const s0 = await snap(page);
    await click(page, 'REFUSE THE GIFT');
    const s1 = await snap(page);
    ok(s1.flags.includes('pirates_indebted') && s1.res.morale === s0.res.morale - 3 && s1.items.length === s0.items.length, 'REFUSE: pirates_indebted, −3 morale, nothing taken aboard');
    await page.close();
  }

  // ───────────────────────── 3. void entity ─────────────────────────
  console.log('— 3. void entity talking head (demo void_corrupted)');
  {
    const page = await boot({ trail: 'interstellar', crew: ['xenobiologist', 'medic'], ai: 'aria' });
    await enter(page, 'event_void_004', 'void');
    const a = await scene(page, 'anomaly/void');
    ok(/^anomaly\/void\/\d\.jpg$/.test(a.main), `backdrop: ${a.main}`);
    ok(a.screenComm === 'corrupted' && a.aiCorrupt && a.dialogCorrupt, 'corrupted comm on the screen, the AI bar and the dialog strip');
    ok(a.subjVisible && a.plate === '????', 'the entity is in the subject frame, name plate ????');
    ok(a.sheet === 'npc/drifter/unknown/1/spritesheet.png', `pinned entity art: ${a.sheet}`);
    ok(a.subjAnim !== 'none|none' || a.subjFilter !== 'none', `glitch treatment on the head (${a.subjAnim}; ${a.subjFilter.slice(0, 30)})`);
    ok(/we̷ know your n̴ame/.test(a.line) && a.dialogName === '????', 'the corrupted line is spoken by ????');
    const ch = await choiceInfo(page);
    ok(['LISTEN', 'TRANSMIT YOUR NAME', 'FIRE EVERYTHING', 'PULL BACK'].every(t => ch.some(c => c.text === t && !c.locked)), 'LISTEN / TRANSMIT / FIRE / PULL BACK (xenobiologist aboard)');
    ok(ch.find(c => c.leave).text === 'WITHDRAW', 'leave row: WITHDRAW');
    await shot(page, 'scenesA_void_intro');
    await click(page, 'LISTEN');
    const b = await scene(page, 'anomaly/void');
    ok(b.layer === 'listen' && b.main === a.main && b.sheet === a.sheet, 'LISTEN → A NAME, same void, same entity');
    const ch2 = await choiceInfo(page);
    const rec = ch2.find(c => c.text === 'RECORD AND LEAVE');
    ok(rec && rec.locked && /Need: Spectrometer/.test(rec.sub), `RECORD AND LEAVE needs the spectrometer (${rec && rec.sub})`);
    await shot(page, 'scenesA_void_listen');
    const s0 = await snap(page);
    await click(page, 'SPEAK THE THIRD NAME');
    const s1 = await snap(page);
    ok(s1.flags.includes('spoke_the_third_name') && s1.res.morale === Math.min(100, s0.res.morale + 6), 'A RECOGNITION: flag + 6 morale');
    await page.close();
  }
  {
    // Spectrometer: RECORD AND LEAVE grants the logbook fragment; the subject keeps its pin across a reload.
    const page = await boot({ trail: 'interstellar', crew: ['pilot', 'chef'] });
    await page.evaluate(() => { STATE.items.push('spectrometer'); });
    await enter(page, 'event_void_004', 'anomaly');
    const a = await scene(page, 'anomaly/void');
    ok(a.main && a.main.startsWith('anomaly/void/'), 'at an anomaly node too, the void backdrop');
    const tx = (await choiceInfo(page)).find(c => c.text === 'TRANSMIT YOUR NAME');
    ok(tx && tx.locked, 'TRANSMIT YOUR NAME locked without a xenobiologist');
    await click(page, 'LISTEN');
    await reloadRun(page);
    const r = await scene(page, 'anomaly/void');
    ok(r.layer === 'listen' && r.sheet === 'npc/drifter/unknown/1/spritesheet.png' && r.main === a.main, 'reload mid-layer: same layer, same void, same entity');
    const s0 = await snap(page);
    await click(page, 'RECORD AND LEAVE');
    const s1 = await snap(page);
    ok(s1.items.filter(i => i === 'logbook_fragment').length === s0.items.filter(i => i === 'logbook_fragment').length + 1, 'LOGGED: a logbook fragment comes aboard');
    await page.close();
  }
  {
    // PULL BACK: sane space, fuel + morale.
    const page = await boot({ trail: 'interstellar', crew: ['pilot', 'chef'] });
    await enter(page, 'event_void_004', 'void');
    await scene(page, 'anomaly/void');
    const s0 = await snap(page);
    await click(page, 'PULL BACK');
    const o = await scene(page, 'space/deep');
    const s1 = await snap(page);
    ok(o.main && o.main.startsWith('space/deep/') && s1.res.fuel === s0.res.fuel - 4 && s1.res.morale === s0.res.morale - 3, `RETREATED to ${o.main}: −4 fuel, −3 morale`);
    await page.close();
  }

  // ───────────────────────── 4. unknown signal ─────────────────────────
  console.log('— 4. unknown alien signal (demo unknown_signal)');
  {
    const page = await boot({ crew: ['xenobiologist', 'pilot'], ai: 'ajoy' });
    await enter(page, 'event_encounter_unknown_001', 'nebula');
    const a = await scene(page, 'our_ship/bridge');
    ok(a.main === 'our_ship/bridge.png' && /^space\//.test(a.base || ''), `the bridge with space behind (${a.base})`);
    ok(/^ship_exterior\/unknown\/\d\.jpg$/.test(a.sprite || '') && a.spriteVisible && /ship_exterior\/unknown/.test(a.spriteComputed), `ship_exterior/unknown in the window: ${a.sprite}`);
    ok(a.screenComm === 'screen' && a.plate === '????' && a.sheet === 'npc/drifter/unknown/2/spritesheet.png', `???? hailing on the screen (${a.sheet})`);
    ok(/pulse of clean tone, twice/.test(a.line), 'the hail is two pulses');
    const ch = await choiceInfo(page);
    ok(['RESPOND WITH ONE PULSE', 'SCAN THEM', 'WEAPONS HOT', 'WITHDRAW'].every(t => ch.some(c => c.text === t)), 'xeno / scan / weapons / withdraw');
    ok(ch.find(c => c.text === 'SCAN THEM').locked && !ch.find(c => c.text === 'RESPOND WITH ONE PULSE').locked, 'SCAN locked without a spectrometer; the xenobiologist can answer');
    ok(ch.find(c => c.leave).text === 'IGNORE', 'leave row: IGNORE');
    await shot(page, 'scenesA_unknown_intro');
    const s0 = await snap(page);
    await click(page, 'RESPOND WITH ONE PULSE');
    const o = await scene(page, 'our_ship/bridge');
    const s1 = await snap(page);
    ok(o.outcome === 'unknown_yes' && /long warm chord/.test(o.line) && s1.flags.includes('answered_the_pulses') && s1.res.morale === Math.min(100, s0.res.morale + 8), 'CONTACT: the chord, the flag, +8 morale');
    await page.close();
  }
  {
    const page = await boot({ crew: ['pilot', 'chef'] });
    await page.evaluate(() => { STATE.items.push('spectrometer'); });
    await enter(page, 'event_encounter_unknown_001', 'void');
    await scene(page, 'our_ship/bridge');
    let s0 = await snap(page);
    await click(page, 'SCAN THEM');
    let s1 = await snap(page);
    ok(s1.items.filter(i => i === 'star_chart_fragment').length === s0.items.filter(i => i === 'star_chart_fragment').length + 1, 'SCAN THEM: their nav plot comes aboard as a star chart fragment');
    await page.close();
  }
  {
    const page = await boot({ crew: ['pilot', 'chef'] });
    await enter(page, 'event_encounter_unknown_001', 'asteroid_field');
    await scene(page, 'our_ship/bridge');
    const s0 = await snap(page);
    await click(page, 'WEAPONS HOT');
    const s1 = await snap(page);
    ok(s1.res.hull === s0.res.hull - 12 && s1.res.morale === s0.res.morale - 3, 'WEAPONS HOT: −12 hull, −3 morale');
    await page.close();
  }
  {
    const page = await boot({ crew: ['pilot', 'chef'] });
    await enter(page, 'event_encounter_unknown_001', 'planet');
    await scene(page, 'our_ship/bridge');
    const s0 = await snap(page);
    await click(page, 'WITHDRAW');
    const o = await scene(page, 'space/deep');
    const s1 = await snap(page);
    ok(o.main.startsWith('space/deep/') && o.sprite === null && o.base === null && s1.res.fuel === s0.res.fuel - 4, `PASSED: open space (${o.main}), −4 fuel, their ship gone`);
    await page.close();
  }

  // ───────────────────────── every outcome does something ─────────────────────────
  console.log('— every outcome has an effect; flags have readers');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const ids = ['event_encounter_boarding_002', 'event_general_021', 'event_void_004', 'event_encounter_unknown_001'];
      const empty = [], flags = new Set(), unread = [];
      const combatIntros = new Set();
      for (const id of ids) for (const l of Object.values(EVENTS[id].layers)) for (const c of l.choices) if (c.combat_intro) combatIntros.add(id + ':' + c.combat_intro);
      for (const id of ids) for (const [oid, o] of Object.entries(EVENTS[id].outcomes)) {
        if (combatIntros.has(id + ':' + oid)) continue;
        if (!outcomeFacts(o).length && !o.sets_flag) empty.push(id + ':' + oid);
        if (o.sets_flag) flags.add(o.sets_flag);
      }
      for (const id of ids) for (const l of Object.values(EVENTS[id].layers)) for (const c of l.choices) if (c.setFlag) flags.add(c.setFlag);
      for (const f of flags) {
        const read = Object.values(EVENTS).some(e => e.requires_flag === f || JSON.stringify(e).includes('"' + f + '"') && e.requires_flag === f) || (MOD.flavor.flag_payoffs[f]);
        if (!read) unread.push(f);
      }
      return { empty, flags: [...flags], unread };
    });
    ok(!r.empty.length, 'every outcome shows at least one real effect' + (r.empty.length ? ' — empty: ' + r.empty.join(', ') : ''));
    ok(!r.unread.length, `every flag these scenes set has a reader or a payoff (${r.flags.join(', ')})`);
    await page.close();
  }

  console.log(errors.length ? 'page errors:\n  ' + errors.slice(0, 5).join('\n  ') : 'no page errors');
  if (errors.length) fail++;
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
