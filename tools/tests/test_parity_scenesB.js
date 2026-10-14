// Demo parity, batch 2 — scenes B (2026-10-11). Three demo-encounter
// scenarios ported as real layered events, played through the engine:
//   event_derelict_005 "A Pulse"         — demo derelict_survivor: Mira
//     Kastel, rescued into OUR medbay through the shared crew-join path
//     (joinAsCrew, same as a welcomed stowaway) or, with no room, as a
//     passenger who eats and steps off at the next station (reward paid).
//   event_planet_006 "Not Alone"         — demo planet_landing: habitable
//     biome only (event `biome` gate), surface backdrop via {biome}, an
//     empty frame until the LOCAL LIFEFORM steps out on the contact layer.
//   event_shipboard_017 "A Word, Captain" — demo crew_request: whichever
//     of OUR crew is aboard (crew_speaker: medic first, else anyone) in the
//     frame on their own sprite sheet, in the medbay.
//   The station approach (event_station_014 + engine/js/station.js, owner
//     ruling 2026-10-11 design A): every stop opens on the bridge, HAIL /
//     DOCK, dockmaster first 1 in 3, parking fee 1 in 3 (eventGold), the
//     wave-off warning (closes the stop's services, no time), the dock's
//     rooms + GO ELSEWHERE + BACK TO DOCK, LEAVE STATION → the hub.
// Plus draw rates over many generated maps (selectEvent, fresh-state walk).
// SHOT_DIR=<dir> saves screenshots for the visual comparison.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const SHOT_DIR = process.env.SHOT_DIR || null;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];

async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor);
  await page.evaluate(() => localStorage.removeItem('transplant_save_v1'));
  return page;
}
async function boot(setup) {
  const page = await open();
  await page.evaluate(o => {
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForTimeout(150);
  return page;
}
async function shot(page, name) {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.waitForTimeout(500);
  await page.evaluate(() => { if (typeof finishAllTyping === 'function') finishAllTyping(); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
}
// A node of this type to stand at — the map's own if it has one, else a
// node retyped (random maps don't promise every type).
const standAt = (page, type) => page.evaluate(type => {
  let n = STATE.nodes.find(x => x.node_type === type && (Array.isArray(x.connects_to) ? x.connects_to.length : true));
  if (!n) { n = STATE.nodes.find(x => x.node_type !== 'fork' && Array.isArray(x.connects_to) && x.connects_to.length && x.id !== STATE.currentId); n.node_type = type; }
  STATE.currentId = n.id;
  return n.id;
}, type);
const enter = (page, evId) => page.evaluate(id => { enterEvent(STATE.byId[STATE.currentId], EVENTS[id]); finishAllTyping(); }, evId);
// One choice action per 300ms (index.html runChoiceAction's double-click
// guard) — wait it out after every click.
const click = async (page, t) => {
  const r = await page.evaluate(t => {
    finishAllTyping();
    const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.querySelector('.ch-text') && b.querySelector('.ch-text').textContent.trim() === t);
    if (!b || b.classList.contains('locked')) return false;
    b.click(); finishAllTyping(); return true;
  }, t);
  await page.waitForTimeout(340);
  await page.evaluate(() => finishAllTyping());
  return r;
};
const choiceInfo = (page, t) => page.evaluate(t => {
  const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.querySelector('.ch-text') && b.querySelector('.ch-text').textContent.trim() === t);
  if (!b) return null;
  const sub = b.querySelector('.ch-sub');
  // title= is upgraded to a .ui-tip (data-tip-*) by shared.js Tooltip.
  return { locked: b.classList.contains('locked'), sub: sub ? sub.textContent : '', tip: [b.title, b.dataset.tipTitle, b.dataset.tipDescription, b.dataset.tipList, b.dataset.tipRows].filter(Boolean).join('\n'), risky: b.classList.contains('risky'), hint: b.classList.contains('hint') };
}, t);
const view = page => page.evaluate(() => {
  const scr = document.getElementById('screen-encounter');
  const head = document.getElementById('enc-subject-head');
  const leave = document.querySelector('#enc-choices .enc-choice.leave');
  const dlg = document.getElementById('enc-dialog');
  return {
    title: document.getElementById('enc-narr-title').textContent,
    body: document.getElementById('enc-narr-body').textContent,
    ai: document.getElementById('enc-ai-text').textContent,
    line: dlg.classList.contains('hidden') ? null : document.getElementById('enc-dialog-line').textContent,
    speaker: dlg.classList.contains('hidden') ? null : document.getElementById('enc-dialog-name').textContent,
    noSubject: scr.classList.contains('no-subject'),
    plate: document.getElementById('enc-subject-name').textContent,
    sheet: head.style.getPropertyValue('--sheet-url'),
    emoji: head.textContent,
    scene: document.getElementById('enc-backdrop').dataset.scene,
    leave: leave ? leave.querySelector('.ch-text').textContent : null,
    leaveColor: leave ? getComputedStyle(leave).borderTopColor : null,
    layer: STATE.layerStack ? STATE.layerStack[STATE.layerStack.length - 1] : null,
    outcome: STATE.currentOutcomeId,
    choices: [...document.querySelectorAll('#enc-choices .enc-choice:not(.leave) .ch-text')].map(e => e.textContent.trim()),
  };
});
// Wait until the subject's sheet / emoji has resolved (async probe).
const settleSubject = page => page.waitForFunction(() => {
  const scr = document.getElementById('screen-encounter'), head = document.getElementById('enc-subject-head');
  return scr.classList.contains('no-subject') || head.style.getPropertyValue('--sheet-url') || head.textContent.trim() || head.style.getPropertyValue('--subj-sprite');
}, null, { timeout: 4000 }).catch(() => {});

(async () => {
  browser = await chromium.launch();

  // ─────────────────────────────────────────── 1. DERELICT SURVIVOR
  console.log('— derelict survivor (event_derelict_005, demo derelict_survivor)');
  {
    // ARIA aboard: MARV's cost preview would take the sub line (its text moves to the tooltip).
    const page = await boot({ crew: ['pilot'], ai: 'aria' });
    await standAt(page, 'derelict');
    const elig = await page.evaluate(() => {
      const ev = EVENTS.event_derelict_005, here = STATE.byId[STATE.currentId];
      const planet = Object.assign({}, here, { node_type: 'planet' });
      return { here: eventEligible(ev, here, activeTriggers()), planet: eventEligible(ev, planet, activeTriggers()), diff: ev.difficulty, once: ev.once };
    });
    ok(elig.here && !elig.planet, 'drawable at a derelict, not elsewhere (difficulty ' + elig.diff + ', once)');
    await enter(page, 'event_derelict_005');
    await settleSubject(page);
    let v = await view(page);
    ok(v.title === 'A PULSE' && /last operating compartment/.test(v.body), 'intro: demo title + body');
    ok(v.scene === 'ship_interior/derelict', 'backdrop: ship_interior/derelict (' + v.scene + ')');
    ok(v.plate === 'SURVIVOR' && !v.noSubject, 'subject frame: the SURVIVOR (drifter talking head)');
    ok(/Alive! How wonderful!/.test(v.ai), 'ARIA voices the demo line');
    ok(v.leave === 'LEAVE THEM', 'leave row reads LEAVE THEM');
    ok(JSON.stringify(v.choices) === JSON.stringify(['"What\'s your name?"', 'TRIAGE', 'OFFER WATER', 'ASK WHAT HAPPENED']), 'intro choices are the demo four: ' + v.choices.join(' | '));
    const tri = await choiceInfo(page, 'TRIAGE');
    ok(tri.locked && /Need: Medic/.test(tri.sub), 'TRIAGE locked without a medic ("' + tri.sub.trim() + '")');
    await shot(page, 'survivor_intro');
    ok(await click(page, '"What\'s your name?"'), 'asks her name');
    v = await view(page);
    ok(/Mira Kastel/.test(v.line || '') && v.speaker === 'SURVIVOR', 'she says it: "' + v.line + '"');
    const take = await choiceInfo(page, 'TAKE HER ABOARD');
    ok(take && /costs O2 · joins as engineer/.test(take.sub), 'room aboard → sub says she joins as engineer ("' + (take && take.sub) + '")');
    ok(take && /Mira Kastel joins the crew as engineer/.test(take.tip), 'tooltip says who she is');
    const before = await page.evaluate(() => ({ o2: STATE.resources.o2, crew: STATE.crew.slice() }));
    ok(await click(page, 'TAKE HER ABOARD'), 'TAKE HER ABOARD');
    await page.waitForTimeout(200);
    v = await view(page);
    const after = await page.evaluate(() => ({ o2: STATE.resources.o2, crew: STATE.crew.slice(), hp: STATE.crewHP.engineer, idn: STATE.crewIdentity.engineer, name: crewNameOf('engineer'), flag: STATE.flags.has('rescued_mira'), pas: (STATE.passengers || []).length }));
    ok(v.outcome === 'surv_rescue' && v.title === 'ABOARD', 'outcome ABOARD');
    ok(v.scene === 'our_ship/medbay', 'the rescue lands in OUR medbay (' + v.scene + ')');
    ok(before.o2 - after.o2 >= 8 && before.o2 - after.o2 < 8.5, 'O2 −8, plus the day it took to breathe (' + before.o2 + ' → ' + after.o2 + ')');
    ok(after.crew.includes('engineer') && after.idn && after.idn.name === 'Mira Kastel' && after.idn.origin === 'rescued', 'Mira joins STATE.crew as engineer (crewIdentity, origin rescued)');
    ok(after.hp === 50 && after.name === 'Mira Kastel' && after.pas === 0, 'her own name in the role, HP 50 (vitals poor but stable), not a passenger');
    ok(/joins the crew as engineer/.test(v.body) && v.line === '“Thank you.”' || /Thank you/.test(v.line || ''), 'outcome says so; she says "Thank you."');
    ok(after.flag, 'flag rescued_mira (flag_payoffs epilogue + AI callbacks)');
    await shot(page, 'survivor_rescued');
    // The crew screen shows her as Rescued, not Stowaway.
    const crewTag = await page.evaluate(() => { window.openCrewDetail('engineer'); return document.body.innerText.includes('Rescued') && document.body.innerText.includes('Mira Kastel'); });
    ok(crewTag, 'crew dossier: Mira Kastel, tagged Rescued');
    await page.close();
  }
  {
    // Full crew: she rides as a passenger, eats, steps off at the next station.
    const page = await boot({ crew: ['engineer', 'pilot'], ai: 'aria' });
    await standAt(page, 'derelict');
    await enter(page, 'event_derelict_005');
    await click(page, 'OFFER WATER');
    let v = await view(page);
    ok(v.layer === 'triage' && /I'm okay/.test(v.line || ''), 'OFFER WATER → STABLE ("I\'m okay.")');
    const take = await choiceInfo(page, 'TAKE HER ABOARD');
    ok(take && /rides to the next station/.test(take.sub), 'crew full → sub says she rides to the next station');
    const m0 = await page.evaluate(() => mouthsMult());
    await click(page, 'TAKE HER ABOARD');
    const r = await page.evaluate(() => ({ crew: STATE.crew.slice(), pas: STATE.passengers.slice(), m: mouthsMult(), body: document.getElementById('enc-narr-body').textContent }));
    ok(r.crew.join() === 'engineer,pilot' && r.pas.length === 1 && r.pas[0].name === 'Mira Kastel', 'no room: a passenger, the crew unchanged');
    ok(Math.abs((r.m - m0) - 1 / 3) < 1e-9, 'she eats: mouthsMult +1 mouth (' + m0.toFixed(3) + ' → ' + r.m.toFixed(3) + ')');
    ok(/rides along as a passenger/.test(r.body), 'outcome says she rides as a passenger');
    // Save/load keeps her aboard.
    await page.evaluate(() => { advanceAfterEvent(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { writeSnapshot(); });
    await page.reload();
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.flavor);
    await page.evaluate(() => loadRun());
    await page.waitForTimeout(200);
    ok(await page.evaluate(() => (STATE.passengers || []).length === 1), 'a reload keeps the passenger');
    // Next station: she steps off, the family pays.
    const off = await page.evaluate(() => {
      const st = STATE.nodes.find(n => n.node_type === 'station' && Array.isArray(n.connects_to) && n.connects_to.length) || STATE.nodes.find(n => Array.isArray(n.connects_to) && n.connects_to.length && n.id !== STATE.currentId);
      st.node_type = 'station';
      setCrewMorale(50);
      const g0 = STATE.goldAmount;
      const realEnter = window.enterEvent; let entered = null;
      enterEvent = (n, ev) => { entered = ev && ev.id; };
      travelTo(st.id);
      enterEvent = realEnter;
      const log = (STATE.shipLog || []).map(e => e.text || '').join('\n');
      return { pas: STATE.passengers.length, gold: STATE.goldAmount - g0, morale: crewMoraleRaw(), log: /Mira Kastel steps off at/.test(log) };
    });
    ok(off.pas === 0 && off.gold === 20 && off.log, 'next station: she steps off, +20 gold reunification transfer, logged');
    ok(off.morale >= 50, 'and +4 morale (net of the leg: ' + off.morale + ')');
    await page.close();
  }
  {
    // Her story → leave her with supplies / copy the flight recorder.
    const page = await boot({ crew: ['engineer', 'pilot'] });
    await standAt(page, 'derelict');
    await enter(page, 'event_derelict_005');
    await click(page, 'ASK WHAT HAPPENED');
    let v = await view(page);
    ok(v.layer === 'story' && /Something came out of the nebula/.test(v.line || ''), 'ASK WHAT HAPPENED → her story');
    const copy = await choiceInfo(page, 'COPY HER FLIGHT RECORDER');
    ok(copy.locked && /Need: Gas Analyzer/.test(copy.sub), 'COPY HER FLIGHT RECORDER needs the analyzer');
    const leave = await choiceInfo(page, 'LEAVE HER WITH SUPPLIES');
    ok(leave.risky, 'LEAVE HER WITH SUPPLIES is risky (red strip)');
    const b = await page.evaluate(() => ({ f: STATE.resources.food, w: STATE.resources.water }));
    await click(page, 'LEAVE HER WITH SUPPLIES');
    const a = await page.evaluate(() => ({ f: STATE.resources.food, w: STATE.resources.water, flag: STATE.flags.has('promised_mira'), tone: document.getElementById('enc-narrative').classList.contains('tone-danger') }));
    // The authored −4 / −4, through the trail's supply bite (ruling 68).
    const want = await page.evaluate(() => ({ f: -effectiveResDelta('food', -4, {}), w: -effectiveResDelta('water', -4, {}) }));
    ok(b.f - a.f >= want.f && b.f - a.f < want.f + 1 && b.w - a.w >= want.w && b.w - a.w < want.w + 1 && a.flag && a.tone, `LEFT: −${want.f} food, −${want.w} water, flag promised_mira, danger tone`);
    await page.close();
  }
  {
    const page = await boot({ crew: ['medic'] });
    await page.evaluate(() => STATE.items.push('gas_analyzer'));
    await standAt(page, 'derelict');
    await enter(page, 'event_derelict_005');
    const tri = await choiceInfo(page, 'TRIAGE');
    ok(tri && !tri.locked && /●●○○○/.test(tri.sub), 'TRIAGE open with a medic, effort ●●○○○');
    const mo = await page.evaluate(() => crewMoraleRaw());
    await click(page, 'TRIAGE');
    ok(await page.evaluate(m => crewMoraleRaw() === m - 2, mo), 'TRIAGE pays the effort tax (−2 morale)');
    await click(page, '"What was the Bluejay\'s heading?"');
    await click(page, 'COPY HER FLIGHT RECORDER');
    const r = await page.evaluate(() => ({ out: STATE.currentOutcomeId, log: STATE.items.includes('logbook_fragment'), mira: crewNameOf('engineer') }));
    ok(r.out === 'surv_logs' && r.log && r.mira === 'Mira Kastel', 'LOGS PULLED: logbook fragment in the hold, and she comes too');
    await page.close();
  }

  // ─────────────────────────────────────────── 2. PLANET LIFEFORM
  console.log('— planet lifeform (event_planet_006, demo planet_landing)');
  {
    const page = await boot({ crew: ['engineer', 'pilot'] });
    await standAt(page, 'planet');
    const g = await page.evaluate(() => {
      const here = STATE.byId[STATE.currentId], ev = EVENTS.event_planet_006;
      let hab = null, other = null;
      for (let s = 1; s < 500 && (!hab || !other); s++) {
        STATE.artSeed = s;
        const b = SceneArt.biomeFor(null, here);
        if (b === 'habitable' && !hab) hab = s;
        if (b !== 'habitable' && !other) other = { s, b };
      }
      STATE.artSeed = other.s; const no = eventEligible(ev, here, activeTriggers());
      STATE.artSeed = hab; const yes = eventEligible(ev, here, activeTriggers());
      return { yes, no, otherBiome: other.b };
    });
    ok(g.yes && !g.no, 'fires on a habitable planet only (not on ' + g.otherBiome + ')');
    await enter(page, 'event_planet_006');
    await page.waitForTimeout(200);
    let v = await view(page);
    ok(v.title === 'TOUCHDOWN' && /greener than any planetologist/.test(v.body), 'intro: demo body');
    ok(v.scene === 'planet_surface/habitable', 'surface backdrop via {biome}: ' + v.scene);
    ok(v.noSubject, 'nobody in the frame yet — it is still in the tree line');
    ok(v.leave === 'RETURN TO ORBIT', 'leave row reads RETURN TO ORBIT');
    const sv = await choiceInfo(page, 'SURVEY');
    ok(sv.locked && /Need: Gas Analyzer/.test(sv.sub), 'SURVEY needs the analyzer');
    const ap = await choiceInfo(page, 'APPROACH CAREFULLY');
    ok(ap.risky && /●●○○○/.test(ap.sub), 'APPROACH CAREFULLY: risky, effort ●●○○○');
    await shot(page, 'lifeform_intro');
    await click(page, 'WAVE');
    await settleSubject(page);
    v = await view(page);
    const npc = await page.evaluate(() => { const k = Object.keys(STATE.npcCache).find(k => k.includes('LOCAL LIFEFORM')); return k && STATE.npcCache[k]; });
    ok(v.layer === 'contact' && !v.noSubject && v.plate === 'LOCAL LIFEFORM', 'WAVE → NOT ALONE: the LOCAL LIFEFORM steps into the frame');
    ok(npc && npc.species === 'rock' && npc.disposition === 'drifter', 'a silicate drifter, as MARV reads it ("Silicate-based") — species rock');
    ok(/drifter\/rock/.test(v.sheet), 'its talking-head sheet: ' + (v.sheet.match(/npc\/[^']+/) || [''])[0]);
    ok(v.line === null, 'it does not speak (no dialog strip)');
    const tr = await choiceInfo(page, 'OFFER A TRADE');
    ok(tr.locked && /Need: Diplomat/.test(tr.sub), 'OFFER A TRADE needs a diplomat');
    await shot(page, 'lifeform_contact');
    const mo = await page.evaluate(() => crewMoraleRaw());
    await click(page, '"We come in peace."');
    v = await view(page);
    ok(v.title === 'UNDERSTOOD' && await page.evaluate(m => crewMoraleRaw() === Math.min(100, m + 5), mo), 'UNDERSTOOD: +5 morale');
    await page.close();
  }
  {
    const page = await boot({ crew: ['diplomat', 'pilot'] });
    await standAt(page, 'planet');
    await enter(page, 'event_planet_006');
    const m0 = await page.evaluate(() => Object.assign({}, STATE.materials));
    await click(page, 'COLLECT SAMPLES');
    const m1 = await page.evaluate(() => Object.assign({}, STATE.materials));
    ok((m1.biocomponent || 0) - (m0.biocomponent || 0) === 3 && (m1.minerals || 0) - (m0.minerals || 0) === 2 && (m1.exotic || 0) - (m0.exotic || 0) === 1, 'COLLECTED (soil sampler): +3 biocomponent, +2 minerals, +1 exotic (the humming one)');
    await page.close();
  }
  {
    const page = await boot({ crew: ['diplomat', 'pilot'] });
    await standAt(page, 'planet');
    await page.evaluate(() => { STATE.resources.fuel = 40; });
    await enter(page, 'event_planet_006');
    await click(page, 'APPROACH CAREFULLY');
    await click(page, 'OFFER A TRADE');
    ok(await page.evaluate(() => STATE.currentOutcomeId === 'planet_trade' && STATE.resources.fuel === 50), 'A TRADE (diplomat): the warm thing is a power source, +10 fuel');
    await page.close();
  }
  {
    // MARV's preview names the costliest choice's costs and it is exactly what lands.
    const page = await boot({ crew: ['chef', 'pilot'] });
    await page.evaluate(() => STATE.items.push('medkit'));
    await standAt(page, 'planet');
    await enter(page, 'event_planet_006');
    await click(page, 'WAVE');
    const s = await choiceInfo(page, 'TAKE A SAMPLE');
    ok(/MARV · −2 MORALE/.test(s.sub), 'MARV previews TAKE A SAMPLE: ' + s.sub.trim());
    const mo = await page.evaluate(() => crewMoraleRaw());
    await click(page, 'TAKE A SAMPLE');
    ok(await page.evaluate(m => crewMoraleRaw() === m - 2 && STATE.items.includes('medkit'), mo), 'the swab lands as previewed (−2 morale), the medkit is not used up');
    await page.close();
  }

  // ─────────────────────────────────────────── 3. CREW IN-PERSON REQUEST
  console.log('— crew in-person request (event_shipboard_017, demo crew_request)');
  {
    const page = await boot({ crew: ['medic', 'pilot'] });
    await standAt(page, 'nebula');
    ok(await page.evaluate(() => eventEligible(EVENTS.event_shipboard_017, STATE.byId[STATE.currentId], activeTriggers())), 'drawable with crew aboard');
    await enter(page, 'event_shipboard_017');
    await settleSubject(page);
    let v = await view(page);
    ok(await page.evaluate(() => STATE.eventSpeaker === 'medic'), 'the medic speaks first when aboard');
    ok(v.plate === 'DR. VASQUEZ' && /spritesheet_vasquez/.test(v.sheet), 'subject: Dr. Vasquez on her crew sheet (' + v.sheet + ')');
    ok(v.scene === 'our_ship/medbay', 'in our medbay');
    ok(v.body === 'Your medic closes the medbay door behind you.' && /morale meds are half/.test(v.line || '') && v.speaker === 'DR. VASQUEZ', 'demo body + line, spoken by the medic');
    ok(v.leave === 'NOT NOW', 'leave row reads NOT NOW');
    const full = await choiceInfo(page, '"Full dose. We\'ll find more."');
    ok(full.locked && /Need: Medkit/.test(full.sub), 'full dose needs a medkit to dose from');
    await shot(page, 'crew_request_medic');
    await click(page, '"Why tell me now?"');
    v = await view(page);
    ok(v.body === 'Dr. Vasquez exhales.' && /You're the captain/.test(v.line || ''), 'BECAUSE: {speaker.name} → "Dr. Vasquez exhales."');
    const mo = await page.evaluate(() => crewMoraleRaw());
    await click(page, '"We share it. Always."');
    v = await view(page);
    ok(v.title === 'SHARED' && /Good/.test(v.line || '') && v.speaker === 'DR. VASQUEZ', 'SHARED, she answers "Good."');
    ok(await page.evaluate(m => crewMoraleRaw() === Math.min(100, m + 3), mo), '+3 morale');
    await page.close();
  }
  {
    const page = await boot({ crew: ['pilot', 'chef'] });
    await page.evaluate(() => { STATE.items.push('medkit'); });
    await standAt(page, 'nebula');
    await enter(page, 'event_shipboard_017');
    await settleSubject(page);
    const v = await view(page);
    const who = await page.evaluate(() => ({ r: STATE.eventSpeaker, n: crewNameOf(STATE.eventSpeaker) }));
    ok(['pilot', 'chef'].includes(who.r), 'no medic: one of the crew aboard speaks (' + who.r + ')');
    const sheetOk = who.r === 'pilot' ? /spritesheet_reeves/.test(v.sheet) : /spritesheet_reyes/.test(v.sheet);
    ok(sheetOk && v.plate === who.n.toUpperCase(), 'their own crew sheet + name plate (' + v.plate + ')');
    ok(v.body.startsWith(who.n + ' closes the medbay door') && /med locker/.test(v.body), 'body_by_speaker: the keeper of the med locker');
    await shot(page, 'crew_request_other');
    // Reload mid-event: same speaker.
    await page.evaluate(() => { saveEventProgress(); });
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('transplant_save_v1')); s.pendingSpeaker = s.pendingSpeaker; localStorage.setItem('transplant_save_v1', JSON.stringify(s)); });
    await page.reload();
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.flavor);
    await page.evaluate(() => loadRun());
    await page.waitForTimeout(200);
    ok(await page.evaluate(r => STATE.currentEvent && STATE.currentEvent.id === 'event_shipboard_017' && STATE.eventSpeaker === r, who.r), 'a reload mid-conversation keeps the same speaker');
    await click(page, '"Full dose. We\'ll find more."');
    ok(await page.evaluate(() => STATE.currentOutcomeId === 'crew_full' && !STATE.items.includes('medkit')), 'FULL DOSE: the medkit goes into it');
    await page.close();
  }
  {
    const page = await boot({ crew: [] });
    await standAt(page, 'nebula');
    ok(await page.evaluate(() => !eventEligible(EVENTS.event_shipboard_017, STATE.byId[STATE.currentId], activeTriggers())), 'solo run: never drawn (nobody to ask)');
    await page.close();
  }
  {
    // A joined stowaway holding the role speaks under their own name (emoji face).
    const page = await boot({ crew: ['medic', 'pilot'] });
    await page.evaluate(() => { STATE.crewIdentity.medic = { id: 'x', name: 'Old Marrow', story: '...', origin: 'stowaway' }; });
    await standAt(page, 'nebula');
    await enter(page, 'event_shipboard_017');
    await settleSubject(page);
    const v = await view(page);
    ok(v.plate === 'OLD MARROW' && !v.sheet && v.emoji.trim().length > 0, 'a stowaway in the medic role: their name, the role emoji (no roster sheet)');
    await page.close();
  }

  // ─────────────────────────────────────────── 4. STATION APPROACH
  console.log('— station approach (event_station_014 + engine/js/station.js, demo station_approach; owner ruling design A)');
  // Arrive at a station whose drawn event is evId (null = nothing drawn);
  // `set` overrides this visit's rolls, then the approach repaints.
  const arriveAt = (page, evId, set) => page.evaluate(([evId, set]) => {
    let s = STATE.nodes.find(n => n.node_type === 'station' && n.connects_to && Object.keys(n.connects_to).length && n.id !== STATE.currentId);
    if (!s) { s = STATE.nodes.find(n => Array.isArray(n.connects_to) && n.connects_to.length && n.id !== STATE.currentId); s.node_type = 'station'; }
    const realSel = selectEvent;
    selectEvent = () => (evId ? EVENTS[evId] : null);
    try { travelTo(s.id); } finally { selectEvent = realSel; }
    if (set && STATE.stationVisit) {
      Object.assign(STATE.stationVisit, set);
      if ('hailedFirst' in set) STATE.stationVisit.captainHere = set.hailedFirst;
      if (STATE.currentEvent && STATE.currentEvent.id === 'event_station_014') enterEvent(s, EVENTS.event_station_014, { layerStack: ['intro'] });
    }
    finishAllTyping();
    return s.id;
  }, [evId, set || null]);
  const leaveRow = page => page.evaluate(() => {
    const l = document.querySelector('#enc-choices .enc-choice.leave');
    return l ? { text: l.querySelector('.ch-text').textContent, sub: (l.querySelector('.ch-sub') || {}).textContent || '' } : null;
  });
  const clickLeave = async page => { await page.evaluate(() => { finishAllTyping(); document.querySelector('#enc-choices .enc-choice.leave').click(); }); await page.waitForTimeout(340); await page.evaluate(() => finishAllTyping()); };
  const continueOn = async page => { await page.evaluate(() => { finishAllTyping(); const b = document.querySelector('#enc-choices .enc-choice.advance'); if (b) b.click(); }); await page.waitForTimeout(340); };
  // needy: give every station service something to do first — since b4
  // (demo hideWhen) MEDBAY / DRYDOCK / FAB SERVICE / REPAIR are hidden
  // when nobody is hurt / the hull is intact / the fabricator is fresh.
  const stopVerbs = (page, needy) => page.evaluate(needy => {
    if (needy) {
      STATE.resources.hull = Math.min(STATE.resources.hull, 60);
      if (STATE.crew[0]) STATE.crewHP[STATE.crew[0]] = Math.min(crewHPOf(STATE.crew[0]), 80);
      STATE.fabricator = Object.assign({}, STATE.fabricator, { wear: Math.max(40, (STATE.fabricator && STATE.fabricator.wear) || 0) });
      if (document.body.classList.contains('stop-active')) openStopMenu();
    }
    if (typeof renderStopMenu === 'function') renderStopMenu();
    const out = {};
    document.querySelectorAll('#stop-choices [data-verb-id]').forEach(b => { out[b.dataset.verbId] = b.classList.contains('locked') ? 'locked:' + b.innerText.replace(/\s+/g, ' ') : 'open'; });
    return out;
  }, !!needy);
  const approachArt = page => page.waitForFunction(() => document.getElementById('enc-approach-sprite').dataset.station, null, { timeout: 4000 }).then(() => true).catch(() => false);
  {
    // Every station arrival opens the approach; rolls ≈ 1 in 3.
    const page = await boot({ crew: ['engineer', 'pilot'], ai: 'aria' });
    const r = await page.evaluate(() => {
      const s = STATE.nodes.find(n => n.node_type === 'station' && n.connects_to && Object.keys(n.connects_to).length) || STATE.nodes.find(n => Array.isArray(n.connects_to) && n.connects_to.length);
      s.node_type = 'station';
      let approach = 0, hailed = 0, fee = 0, first = 0, N = 600;
      const from = STATE.nodes.find(n => n.id !== s.id).id;
      const realEnter = enterEvent, realEnd = endRun, realFail = checkFailure;
      let entered = null;
      enterEvent = (n, ev) => { entered = ev && ev.id; };
      // 600 legs into one stop: the clock / crop would end the run partway —
      // this loop only measures the arrival routing.
      endRun = () => {}; checkFailure = () => false;
      for (let i = 0; i < N; i++) {
        STATE.currentId = from; STATE.stationVisit = null; entered = null; STATE.ended = false;
        Object.assign(STATE.resources, { fuel: 100, food: 100, water: 100, o2: 100, hull: 100 }); setCrewMorale(100); STATE.daysElapsed = 0;
        travelTo(s.id);
        const v = STATE.stationVisit;
        if (!v || v.node !== s.id) continue;
        // The approach opens now, or right after a non-station event that plays first.
        if (entered === 'event_station_014' || (v.phase === 'arrival' && v.kind === 'arrival' && entered === v.roomEv)) approach++;
        if (v.phase === 'arrival') first++;
        if (v.hailedFirst) hailed++; if (v.fee) fee++;
      }
      enterEvent = realEnter; endRun = realEnd; checkFailure = realFail; STATE.ended = false;
      return { approach, hailed: hailed / N, fee: fee / N, first, N };
    });
    ok(r.approach === r.N, 'every station arrival opens the approach (' + r.approach + '/' + r.N + '; ' + r.first + ' after a non-station event played first)');
    ok(r.hailed > 0.27 && r.hailed < 0.40, 'the dockmaster hails first about 1 in 3 (' + r.hailed.toFixed(3) + ')');
    ok(r.fee > 0.27 && r.fee < 0.40, 'a parking fee about 1 in 3 (' + r.fee.toFixed(3) + ')');
    await page.close();
  }
  {
    // Bypasses: delayed crisis and Push Engines skip the approach (and recharge on arrival).
    const page = await boot({ crew: ['engineer', 'pilot'], ai: 'aria' });
    const r = await page.evaluate(() => {
      const s = STATE.nodes.find(n => n.node_type === 'station' && n.connects_to && Object.keys(n.connects_to).length) || STATE.nodes.find(n => Array.isArray(n.connects_to) && n.connects_to.length);
      s.node_type = 'station';
      STATE.crewHP.pilot = 30; STATE.crewPending = { pilot: true }; STATE.crewSkillCharges.engineer = 0;
      travelTo(s.id);
      const crisis = { ev: STATE.currentEvent && STATE.currentEvent.id, trig: STATE.currentEvent && STATE.currentEvent.trigger, charged: STATE.crewSkillCharges.engineer };
      returnToHub();
      const t = STATE.nodes.find(n => n.id !== s.id && Array.isArray(n.connects_to) && n.connects_to.length && n.node_type !== 'fork');
      t.node_type = 'station'; STATE.crewSkillCharges.engineer = 0;
      travelTo(t.id, { skipEvent: true });
      return { crisis, push: { ev: STATE.currentEvent, charged: STATE.crewSkillCharges.engineer } };
    });
    ok(r.crisis.trig && r.crisis.trig.includes('delayed_crisis') && r.crisis.charged === 1, 'a delayed crisis still takes the arrival directly (no approach), skills recharged on arrival');
    ok(r.push.ev === null && r.push.charged === 1, 'Push Engines skips the approach too, skills recharged on arrival');
    await page.close();
  }
  {
    // The silent approach: bridge + station, HAIL, the hail layers, DOCK, the dock, a room, Market Row, LEAVE STATION.
    const page = await boot({ crew: ['engineer', 'pilot'], ai: 'aria' });
    await page.evaluate(() => { STATE.crewSkillCharges.engineer = 0; });
    await arriveAt(page, 'event_station_009', { hailedFirst: false, fee: null });
    await approachArt(page);
    await settleSubject(page);
    let v = await view(page);
    const art = await page.evaluate(() => ({ base: document.getElementById('enc-backdrop-base').classList.contains('hidden') ? null : 'shown', station: document.getElementById('enc-approach-sprite').dataset.station, comm: document.getElementById('screen-encounter').classList.contains('comm-screen') }));
    ok(v.title === 'STATION INBOUND' && v.scene === 'our_ship/bridge' && art.base && art.station && art.comm, 'arrival: our bridge, space behind, the node\'s station in the viewport (' + art.station + '), comm screen');
    ok(v.noSubject && /make the first move/.test(v.body) && v.line === null, 'nobody on comms yet (2 in 3): no subject, the silent body');
    ok(JSON.stringify(v.choices) === '["HAIL"]', 'only HAIL until comms open');
    let lr = await leaveRow(page);
    ok(lr && lr.text === 'LEAVE STATION' && /Skip the stop · risky/.test(lr.sub), 'leave row: LEAVE STATION · Skip the stop · risky');
    ok(/All those people/.test(v.ai), 'ARIA voices the demo line');
    await shot(page, 'station_approach_silent');
    await click(page, 'HAIL');
    await settleSubject(page);
    v = await view(page);
    ok(v.layer === 'hail' && v.plate === 'STATION CAPTAIN' && /Identify, state intent/.test(v.line || '') && /Three coffees deep/.test(v.body), 'HAIL: the station captain on screen, the demo line');
    ok(!(await leaveRow(page)), 'hail layers hide the leave row (demo leaveHidden)');
    await click(page, '"Standard cargo, peaceful intent."');
    v = await view(page);
    ok(v.layer === 'hail_polite' && /Ring three is open/.test(v.line || '') && JSON.stringify(v.choices) === '["DOCK","BACK"]', 'polite reply → "Ring three is open", DOCK right there');
    await click(page, 'BACK'); await click(page, 'BACK');
    v = await view(page);
    ok(v.layer === 'intro' && /Comms are open/.test(v.body) && JSON.stringify(v.choices) === '["DOCK"]' && !v.noSubject, 'back on the intro: comms open, the captain stays, DOCK replaces HAIL');
    const d0 = await page.evaluate(() => STATE.daysElapsed);
    await click(page, 'DOCK');
    await page.waitForTimeout(200);
    v = await view(page);
    const dock = await page.evaluate(() => ({ charged: STATE.crewSkillCharges.engineer, days: STATE.daysElapsed, log: STATE.shipLog.slice(-3).map(e => e.text).join('|') }));
    ok(v.layer === 'docked' && v.scene === 'station/dock' && v.noSubject, 'DOCK → DOCKED: station/dock, no talking head');
    ok(JSON.stringify(v.choices) === '["CANTINA","MARKET"]', 'the dock: this stop\'s room (the bar → CANTINA) + MARKET');
    ok(dock.charged === 1 && /crew skills recharged/.test(dock.log), 'crew skills recharge on DOCK');
    ok(dock.days === d0, 'docking costs no day');
    lr = await leaveRow(page);
    ok(lr && lr.text === 'LEAVE STATION' && /Back to the bridge/.test(lr.sub), 'dock leave row: LEAVE STATION · Back to the bridge');
    await shot(page, 'station_docked');
    await click(page, 'CANTINA');
    v = await view(page);
    lr = await leaveRow(page);
    ok(v.title === 'THE LONG DARK BAR' && v.choices.includes('GO ELSEWHERE'), 'CANTINA → The Long Dark Bar, with GO ELSEWHERE');
    ok(lr && lr.text === 'BACK TO DOCK' && /Pay the tab/.test(lr.sub), 'its leave row: BACK TO DOCK · Pay the tab. Such as it is');
    await shot(page, 'station_room_cantina');
    await click(page, 'GO ELSEWHERE');
    v = await view(page);
    ok(v.layer === '_elsewhere' && JSON.stringify(v.choices) === '["MARKET","BACK TO DOCK","BACK"]' && v.title === 'ELSEWHERE ON THE STATION', 'GO ELSEWHERE: MARKET / BACK TO DOCK / BACK');
    await click(page, 'MARKET');
    v = await view(page);
    ok(v.title === 'MARKET ROW' && v.choices.includes('GO ELSEWHERE') && (await leaveRow(page)).text === 'BACK TO DOCK', 'MARKET → Market Row, GO ELSEWHERE + BACK TO DOCK');
    // Shopping then walking to another room costs the haggling day.
    const d1 = await page.evaluate(() => { STATE._shoppedThisEvent = true; return STATE.daysElapsed; });
    await click(page, 'GO ELSEWHERE'); await click(page, 'CANTINA');
    ok(await page.evaluate(d => STATE.daysElapsed === d + 1 && STATE.currentEvent.id === 'event_station_009', d1), 'shopping, then GO ELSEWHERE: the haggling day is charged');
    // Resolve the bar: its outcome's Continue goes back to the dock; the room is done.
    const out = await page.evaluate(() => { const ev = STATE.currentEvent; const id = Object.keys(ev.outcomes)[0]; applyOutcomeEffects(ev.outcomes[id]); STATE.currentOutcomeId = id; renderEncounterState(); finishAllTyping(); return id; });
    await continueOn(page);
    v = await view(page);
    const cant = await choiceInfo(page, 'CANTINA');
    ok(v.layer === 'docked' && /Back at the airlock/.test(v.body), 'a room\'s outcome → Continue → back at the dock (revisit copy)');
    ok(cant && cant.locked && /Nothing more for you here/.test(cant.sub), 'the resolved room is done for the visit (' + out + ')');
    // A reload in the dock resumes there with the same visit.
    await page.evaluate(() => saveEventProgress());
    await page.reload();
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.flavor);
    await page.evaluate(() => loadRun()); await page.waitForTimeout(250);
    v = await view(page);
    ok(v.layer === 'docked' && await page.evaluate(() => STATE.stationVisit && STATE.stationVisit.phase === 'docked' && STATE.stationVisit.roomsDone.includes('event_station_009')), 'a reload in the dock comes back to the dock, the visit intact');
    await clickLeave(page);
    const hub = await page.evaluate(() => ({ ev: STATE.currentEvent, scr: document.querySelector('#screen-cruise.active') ? 'cruise' : null, log: STATE.shipLog.slice(-4).map(e => e.text).join('|'), station: document.getElementById('cruise-station').dataset.station || null }));
    ok(!hub.ev && hub.scr === 'cruise' && /Safe burns out there/.test(hub.log), 'LEAVE STATION → the hub (intro_returning): the captain\'s farewell on the log');
    const sv = await stopVerbs(page);
    ok(sv.trade === 'open' && !/Waved off/.test(sv.medbay || '') && !/Waved off/.test(sv.drydock || ''), 'after docking the Stop menu keeps TRADE / MEDBAY / DRYDOCK / FAB SERVICE');
    await page.waitForTimeout(400);
    await shot(page, 'station_intro_returning_hub');
    await page.close();
  }
  {
    // Dockmaster first + fee: the welcome names the fee; CHIP's discount applies to gate, sub, line and charge.
    const page = await boot({ crew: ['engineer', 'pilot'], ai: 'chip' });
    await arriveAt(page, null, { hailedFirst: true, fee: { reason: 'AIR-TAX', detail: "You're breathing their air on approach. Itemized.", cost: 5 } });
    await settleSubject(page);
    const disc = await page.evaluate(() => eventGold(5));
    let v = await view(page);
    ok(!v.noSubject && v.plate === 'STATION CAPTAIN' && /Comms light up/.test(v.body), 'the dockmaster hails first: on screen as we arrive');
    ok(new RegExp('Mind the air-tax on the manifest — ' + disc + ' gold').test(v.line || ''), 'their welcome names the fee: "' + v.line + '"');
    const dk = await choiceInfo(page, 'DOCK');
    ok(JSON.stringify(v.choices) === '["DOCK"]' && new RegExp('AIR-TAX · ' + disc + ' gold').test(dk.sub), 'DOCK carries the fee (CHIP-discounted: ' + disc + 'g): ' + dk.sub.trim());
    await shot(page, 'station_approach_hailed_fee');
    const g0 = await page.evaluate(() => STATE.goldAmount);
    await click(page, 'DOCK');
    ok(await page.evaluate(([g, d]) => STATE.goldAmount === g - d, [g0, disc]), 'DOCK charges ' + disc + 'g once');
    // Nothing drawn: the dock is just MARKET.
    v = await view(page);
    ok(JSON.stringify(v.choices) === '["MARKET"]', 'nothing drawn at this stop: the dock holds MARKET only');
    await page.close();
  }
  {
    // Broke + fee: DOCK locked, the leave row is the way out (no stray Continue).
    const page = await boot({ crew: ['engineer', 'pilot'], ai: 'aria' });
    await page.evaluate(() => { STATE.goldAmount = 2; });
    await arriveAt(page, null, { hailedFirst: true, fee: { reason: 'BERTHING FEE', detail: 'Standard. Probably.', cost: 5 } });
    const dk = await choiceInfo(page, 'DOCK');
    const adv = await page.evaluate(() => !!document.querySelector('#enc-choices .enc-choice.advance'));
    ok(dk && dk.locked && /Need: 5g/.test(dk.sub) && !adv && (await leaveRow(page)).text === 'LEAVE STATION', 'broke: DOCK locked "Need: 5g", the leave row still there');
    await page.close();
  }
  {
    // Wave-off: the warning, NEVERMIND, CONFIRM — no time, the services close, no recharge.
    const page = await boot({ crew: ['engineer', 'pilot'], ai: 'marv' });
    await page.evaluate(() => { STATE.crewSkillCharges.engineer = 0; });
    await arriveAt(page, 'event_station_007', { hailedFirst: false, fee: null });
    await clickLeave(page);
    let v = await view(page);
    ok(v.layer === 'waveoff_warn' && v.title === 'WAVE OFF?' && v.noSubject && /Probability of regret/.test(v.ai), 'LEAVE STATION → WAVE OFF? (the AI pleads; nobody on comms)');
    ok(!(await leaveRow(page)) && JSON.stringify(v.choices) === '["CONFIRM · WAVE OFF","NEVERMIND"]', 'CONFIRM · WAVE OFF / NEVERMIND');
    await shot(page, 'station_waveoff_warn');
    await click(page, 'NEVERMIND');
    ok((await view(page)).layer === 'intro', 'NEVERMIND → back to the approach');
    await clickLeave(page);
    const d0 = await page.evaluate(() => STATE.daysElapsed);
    await click(page, 'CONFIRM · WAVE OFF');
    v = await view(page);
    ok(v.title === 'BACK TO THE BLACK' && v.scene === 'space/deep', 'BACK TO THE BLACK');
    ok(await page.evaluate(d => STATE.daysElapsed === d, d0), 'a wave-off costs no time');
    await continueOn(page);
    const sv = await stopVerbs(page, true);
    ok(['trade', 'medbay', 'drydock', 'fab_service'].every(k => /Waved off — no berth here/.test(sv[k] || '')), 'the stop\'s TRADE / MEDBAY / DRYDOCK / FAB SERVICE close: "Waved off — no berth here"');
    ok(sv.repair && !/Waved off/.test(sv.repair) && sv.rest && !/Waved off/.test(sv.rest), 'ship-side verbs (REPAIR, REST) stay');
    ok(await page.evaluate(() => STATE.crewSkillCharges.engineer === 0 && !STATE.seenEventIds.has('event_station_007')), 'no berth, no recharge; the clinic never happened (still drawable later)');
    await page.close();
  }
  {
    // Docking-moment event (the docking queue) plays on DOCK; its skip closes services, costs no time.
    const page = await boot({ crew: ['engineer', 'pilot'], ai: 'aria' });
    await arriveAt(page, 'event_station_004', { hailedFirst: true, fee: null });
    await click(page, 'DOCK');
    let v = await view(page);
    ok(v.title === 'The Docking Queue' || /DOCKING QUEUE/i.test(v.title), 'DOCK → the docking queue plays as the docking itself (' + v.title + ')');
    ok(v.scene === 'our_ship/bridge', 'still on the bridge (it is a comm-screen event)');
    await click(page, 'Wait your turn like a civilized vessel');
    await continueOn(page);
    v = await view(page);
    ok(v.layer === 'docked' && JSON.stringify(v.choices) === '["MARKET"]', 'its outcome → Continue → the dock (MARKET)');
    await page.close();
  }
  for (const id of ['event_station_004', 'event_station_003']) {
    const page = await boot({ crew: ['engineer', 'pilot'], ai: 'aria' });
    await arriveAt(page, id, { hailedFirst: true, fee: null });
    await click(page, 'DOCK');
    const label = await page.evaluate(() => [...document.querySelectorAll('#enc-choices .enc-choice .ch-text')].map(e => e.textContent.trim()).find(t => t.startsWith('Skip the station')));
    const d0 = await page.evaluate(() => STATE.daysElapsed);
    await click(page, label);
    const days = await page.evaluate(d => STATE.daysElapsed - d, d0);
    await continueOn(page);
    const sv = await stopVerbs(page, true);
    ok(days === 0 && await page.evaluate(() => !STATE.currentEvent) && /Waved off/.test(sv.medbay || '') && /Waved off/.test(sv.trade || ''), id + ' "' + label + '": no time, straight to the hub, services closed');
    await page.close();
  }
  {
    // An any-node event drawn at a station plays first, then the approach.
    const page = await boot({ crew: ['engineer', 'pilot'], ai: 'aria' });
    await arriveAt(page, 'event_shipboard_002');
    ok(await page.evaluate(() => STATE.currentEvent.id === 'event_shipboard_002' && STATE.stationVisit.phase === 'arrival'), 'a ship-board event drawn at a station plays first');
    await click(page, 'Acknowledge the report and continue');
    await continueOn(page);
    ok(await page.evaluate(() => STATE.currentEvent && STATE.currentEvent.id === 'event_station_014'), '… then the approach');
    await page.close();
  }
  {
    // Room names, and one dockmaster per stop.
    const page = await boot({ crew: ['engineer', 'pilot'], ai: 'aria' });
    const rooms = await page.evaluate(() => Object.fromEntries(['event_station_006', 'event_station_007', 'event_station_008', 'event_station_009', 'event_station_010', 'event_station_012', 'event_station_013', 'event_station_004', 'event_station_001'].map(id => [id, StationVisit.roomOf(EVENTS[id]) + '/' + StationVisit.kindOf(EVENTS[id])])));
    ok(rooms.event_station_009 === 'cantina/room' && rooms.event_station_007 === 'clinic/room' && rooms.event_station_010 === 'office/room' && rooms.event_station_006 === 'promenade/room' && rooms.event_station_012 === 'promenade/room' && rooms.event_station_008 === 'dockmaster/room' && rooms.event_station_013 === 'market/room', 'rooms: bar CANTINA, clinic CLINIC, security OFFICE, janitor/botanist PROMENADE, Next of Kin DOCKMASTER, Market Row MARKET');
    ok(rooms.event_station_004 === 'null/docking' && rooms.event_station_001 === 'null/docking', 'flat / comm-screen station events play on DOCK');
    await arriveAt(page, 'event_station_007', { hailedFirst: true, fee: null });
    const clinic = await page.evaluate(() => { const c = EVENTS.event_station_014.station_rooms.clinic; return c.label; });
    ok(clinic === 'CLINIC', 'the Walk-In Clinic room is CLINIC (MEDBAY stays the Stop-menu service)');
    const same = await page.evaluate(() => {
      const appr = Object.entries(STATE.npcCache).find(([k]) => k.startsWith('event_station_014@'));
      const kin = resolveNpc(EVENTS.event_station_008);
      return appr && kin && appr[1].species === kin.species;
    });
    ok(same, 'one dockmaster per stop: Next of Kin\'s desk has the captain who hailed you');
    await page.close();
  }

  // ─────────────────────────────────────────── 5. DRAW RATES
  console.log('— draw rates over generated runs (selectEvent along random paths, fresh state)');
  {
    const page = await open();
    const RUNS = +(process.env.RATE_RUNS || 400);
    const rates = await page.evaluate(RUNS => {
      const ids = ['event_derelict_005', 'event_planet_006', 'event_shipboard_017'];
      const CREW = ['botanist', 'engineer', 'medic', 'pilot', 'chef', 'xenobiologist', 'diplomat'];
      const out = {};
      for (const trail of ['lunar', 'mars', 'interstellar']) {
        const hit = Object.fromEntries(ids.map(i => [i, 0]));
        let habitable = 0, derelicts = 0; const kinds = { room: 0, docking: 0, arrival: 0, none: 0 };
        for (let r = 0; r < RUNS; r++) {
          const c = CREW.slice().sort(() => Math.random() - 0.5).slice(0, 2);
          applySetupToState({ trail, ai: 'marv', captain: 'veteran', crew: c, crop: 'wheat', ship: 'D' });
          STATE.stowaway = null;
          let id = STATE.currentId; let guard = 0;
          while (guard++ < 60) {
            const node = STATE.byId[id];
            const next = connectionsOf(node);
            if (!next.length) break;
            const nid = next[Math.floor(Math.random() * next.length)];
            STATE.visited.add(id); STATE.currentId = nid;
            const n = STATE.byId[nid];
            if (!connectionsOf(n).length) break;
            if (n.node_type === 'derelict') derelicts++;
            if (n.node_type === 'planet' && SceneArt.biomeFor(null, n) === 'habitable') habitable++;
            const ev = selectEvent(n);
            if (n.node_type === 'station') kinds[StationVisit.kindOf(ev) || 'none']++;
            if (ev) {
              STATE.seenEventIds.add(ev.id);
              if (ev.sets_flag) STATE.flags.add(ev.sets_flag);
              if (/^event_launch_/.test(ev.id)) STATE.flags.add('departed');
              if (ids.includes(ev.id)) hit[ev.id]++;
            }
            id = nid;
          }
        }
        out[trail] = { hit: Object.fromEntries(Object.entries(hit).map(([k, v]) => [k, Math.round(1000 * v / RUNS) / 10])), habitablePerRun: Math.round(100 * habitable / RUNS) / 100, derelictsPerRun: Math.round(100 * derelicts / RUNS) / 100, kinds };
      }
      return out;
    }, RUNS);
    for (const [t, r] of Object.entries(rates)) console.log('    ' + t + ': % of runs — survivor ' + r.hit.event_derelict_005 + ', lifeform ' + r.hit.event_planet_006 + ', crew request ' + r.hit.event_shipboard_017 + '  (derelicts/run ' + r.derelictsPerRun + ', habitable planets/run ' + r.habitablePerRun + ')');
    for (const [t, r] of Object.entries(rates)) { const k = r.kinds, n = Object.values(k).reduce((a, b) => a + b, 0) || 1; console.log('    ' + t + ' station stops: drawn event as a dock room ' + Math.round(100 * k.room / n) + '%, plays on DOCK ' + Math.round(100 * k.docking / n) + '%, plays first ' + Math.round(100 * k.arrival / n) + '%, nothing drawn ' + Math.round(100 * k.none / n) + '%'); }
    const all = Object.values(rates);
    ok(all.some(r => r.hit.event_derelict_005 > 0), 'the survivor is drawn on real maps');
    ok(all.some(r => r.hit.event_planet_006 > 0), 'the lifeform is drawn on real maps');
    ok(all.every(r => r.hit.event_shipboard_017 > 0), 'the crew request is drawn on every trail');
    await page.close();
  }

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\nparity scenesB: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
