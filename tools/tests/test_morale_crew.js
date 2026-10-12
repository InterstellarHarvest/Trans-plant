// Per-crew morale (owner ruling 15, batch 3; GAME_BIBLE §8): every crew
// member has their own morale (MO bar on their card), the captain has
// none (no MO bar, never averaged); group changes hit everyone, a named
// change hits one; the crew AVERAGE (crewMoraleAvg) drives low_morale
// (<30) and mutiny (0); a member warned at 0 walks off at the next
// station (Ship's Log entry, role freed) unless raised first; no crew
// aboard → no morale at all ("—", no low_morale / mutiny, REST locked).
// Saves migrate an old single morale; per-member morale round-trips.
// Also (owner, batch 3): the cruise crew strip is always captain + 2
// slots — empty places are placeholders and nothing to the right moves.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const SHOTS = process.env.SHOTS || null;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function open(url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url || URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.captains && MOD.ai_companions);
  await page.evaluate(() => localStorage.removeItem('transplant_save_v1'));
  return page;
}
async function boot(setup) {
  const page = await open();
  await page.evaluate(o => {
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
    renderCruise();
  }, setup || {});
  await page.waitForTimeout(150);
  return page;
}
const shot = async (page, name) => { if (SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: SHOTS + '/' + name + '.png' }); } };
const logText = page => page.evaluate(() => (STATE.shipLog || []).map(e => (e && e.text) || e).join(' | '));
// A station one leg ahead: the first next node, made a station for the test.
const stationAhead = page => page.evaluate(() => {
  const n = [...nextAvailableNodes()][0];
  STATE.byId[n].node_type = 'station';
  return n;
});

(async () => {
  browser = await chromium.launch();

  console.log('— the model: per member, no ship-wide morale, captain has none');
  {
    const page = await boot();
    const r = await page.evaluate(() => ({
      res: 'morale' in STATE.resources, mo: Object.assign({}, STATE.crewMorale),
      start: MOD.map_rules.trails.mars.starting_resources.morale, avg: crewMoraleAvg(), cap: crewMoraleOf('captain'),
      slots: [...document.querySelectorAll('#crew-strip .crew-slot')].map(s => ({ captain: s.classList.contains('captain'), empty: s.classList.contains('empty'), mo: !!s.querySelector('.crew-bar.mo'), hp: !!s.querySelector('.crew-bar.hp'), moTip: (s.querySelector('.crew-bar.mo') || {}).title || (s.querySelector('.crew-bar.mo') || { dataset: {} }).dataset.tipDescription || '' })),
    }));
    ok(!r.res, 'STATE.resources has no morale (per-crew is the one source)');
    ok(r.mo.engineer === r.start && r.mo.medic === r.start && Object.keys(r.mo).length === 2, 'each crew member starts at the trail morale (' + JSON.stringify(r.mo) + ')');
    ok(r.avg === r.start && r.cap === null, 'crewMoraleAvg() = ' + r.avg + '; the captain has no morale');
    ok(r.slots.length === 3 && r.slots[0].captain && !r.slots[0].mo && r.slots[0].hp, 'captain card: HP bar, NO MO bar');
    ok(r.slots[1].mo && r.slots[2].mo, 'each crew card carries its own MO bar');
    // The captain's dossier drops the MORALE row; a crew dossier keeps it.
    const d = await page.evaluate(() => {
      openCrewDetail('captain');
      const row = document.getElementById('cd-stat-mo-fill').closest('.cd-stat-row');
      const cap = getComputedStyle(row).display;
      openCrewDetail('medic');
      const crew = getComputedStyle(row).display, val = document.getElementById('cd-stat-mo-val').textContent;
      hideOverlay('overlay-crew');
      return { cap, crew, val };
    });
    ok(d.cap === 'none' && d.crew !== 'none' && d.val === String(r.start), 'dossier: captain has no MORALE row (display ' + d.cap + '), the medic shows theirs (' + d.val + ')');
    await page.close();
  }

  console.log('— group changes hit everyone; a named change hits one');
  {
    const page = await boot({ ai: 'aria' });
    const r = await page.evaluate(() => {
      const out = {};
      setCrewMorale(50); setCrewMorale(70, 'medic');
      applyOutcomeEffects({ resources: { morale: -10 }, time_cost: 'none' });
      out.event = Object.assign({}, STATE.crewMorale);
      payEffortTax(3); // ●●● = −4 each
      out.tax = Object.assign({}, STATE.crewMorale);
      addCrewMorale(5, 'engineer');
      out.named = Object.assign({}, STATE.crewMorale);
      // morale_to "lowest" (event_shipboard_017's quiet one): only the lowest moves, and the preview names them.
      const o = EVENTS.event_shipboard_017.outcomes.crew_quiet;
      out.prev = outcomeFacts(o).map(f => f.text);
      out.lowestName = crewNameOf('engineer').toUpperCase();
      applyOutcomeEffects(Object.assign({}, o, { time_cost: 'none' }));
      out.quiet = Object.assign({}, STATE.crewMorale);
      // ARIA's +1 per leg + the rations/pace drift of the leg land on everyone alike.
      setCrewMorale(40); setCrewMorale(60, 'medic');
      Math.random = () => 0.99;
      travelTo([...nextAvailableNodes()][0], { skipEvent: true });
      out.leg = Object.assign({}, STATE.crewMorale);
      return out;
    });
    ok(r.event.engineer === 40 && r.event.medic === 60, 'event resources.morale −10 → every member (' + JSON.stringify(r.event) + ')');
    ok(r.tax.engineer === 36 && r.tax.medic === 56, 'effort tax ●●● −4 → every member');
    ok(r.named.engineer === 41 && r.named.medic === 56, 'addCrewMorale(5, "engineer") → the engineer only');
    ok(r.prev.includes('+4 ' + r.lowestName + ' MORALE'), 'crew_quiet preview names the quiet one: ' + r.prev.join(', '));
    ok(r.quiet.engineer === 45 && r.quiet.medic === 56, 'morale_to "lowest": +4 to the lowest member only (' + JSON.stringify(r.quiet) + ')');
    ok(Math.abs((r.leg.engineer - 40) - (r.leg.medic - 60)) < 1e-6 && r.leg.engineer !== 40, 'a travel leg (ARIA, rations, pace) moves both by the same ' + (r.leg.engineer - 40).toFixed(2));
    await page.close();
  }

  console.log('— the AVERAGE drives low_morale and mutiny; the captain is never averaged');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const out = {};
      setCrewMorale(20, 'engineer'); setCrewMorale(36, 'medic');
      renderHUD();
      out.avg = crewMoraleAvg();
      out.hud = document.querySelector('#hud-map [data-tip="resource_morale"]').textContent;
      out.low = activeTriggers().has('low_morale');
      setCrewMorale(25, 'engineer'); setCrewMorale(40, 'medic');
      out.avg2 = crewMoraleAvg(); out.low2 = activeTriggers().has('low_morale');
      setCrewMorale(0, 'engineer'); setCrewMorale(50, 'medic');
      out.oneZeroFail = checkFailure();
      setCrewMorale(0);
      window.endRun = e => { window.__end = e; STATE.ended = true; }; // catch which failure fires
      out.allZeroFail = checkFailure();
      out.type = window.__end && window.__end.module && window.__end.module.failure_type;
      return out;
    });
    ok(r.avg === 28 && /28/.test(r.hud), 'average of 20 and 36 = 28 (HUD: ' + r.hud.trim() + ') — the captain not counted');
    ok(r.low, 'average 28 < 30 → low_morale');
    ok(r.avg2 === 33 && !r.low2, 'average 32.5 → 33: no low_morale');
    ok(r.oneZeroFail === false, 'one member at 0, the other at 50: no mutiny (average 25)');
    ok(r.allZeroFail === true && r.type === 'mutiny', 'everyone at 0 → average 0 → mutiny (' + r.type + ')');
    await page.close();
  }

  console.log('— desertion: warned at 0, walks off at the next station, role freed');
  {
    const page = await boot({ captain: 'veteran', crew: ['engineer', 'medic'] });
    const r0 = await page.evaluate(() => {
      setCrewMorale(0, 'medic'); setCrewMorale(60, 'engineer');
      renderCruise();
      const slot = [...document.querySelectorAll('#crew-strip .crew-slot')].find(s => /VASQUEZ/i.test(s.textContent));
      const bar = slot && slot.querySelector('.crew-bar.mo');
      openCrewDetail('medic');
      const status = document.getElementById('cd-status-active').textContent;
      hideOverlay('overlay-crew');
      return { warned: !!(STATE.moraleWarned || {}).medic, zeroCls: !!(bar && bar.classList.contains('zero')), labelColor: bar ? getComputedStyle(bar.querySelector('.crew-bar-label')).color : '', status, passive: passiveMult('medic') };
    });
    let log = await logText(page);
    ok(r0.warned && /Expect them to leave at the next station/.test(log), 'the warning comes first: MARV voices it in the log');
    ok(r0.zeroCls && r0.labelColor === 'rgb(204, 85, 85)', 'their MO label goes red on the crew card (' + r0.labelColor + ')');
    ok(/Deserting/.test(r0.status) && /next station/.test(r0.status), 'dossier status: Deserting · leaves at the next station');
    await shot(page, 'morale_01_warned');
    // A non-station stop first: nobody leaves.
    const r1 = await page.evaluate(() => {
      const n = [...nextAvailableNodes()][0];
      STATE.byId[n].node_type = 'asteroid_field';
      travelTo(n, { skipEvent: true });
      setCrewMorale(0, 'medic'); renderCruise();
      return STATE.crew.slice();
    });
    ok(r1.includes('medic'), 'not a station: the medic is still aboard');
    const st = await stationAhead(page);
    const r2 = await page.evaluate(n => {
      travelTo(n, { skipEvent: true });
      return { crew: STATE.crew.slice(), hp: 'medic' in STATE.crewHP, mo: 'medic' in STATE.crewMorale, warned: 'medic' in (STATE.moraleWarned || {}), charges: 'medic' in (STATE.crewSkillCharges || {}), passive: passiveMult('medic'), ended: STATE.ended,
               slots: [...document.querySelectorAll('#crew-strip .crew-slot')].map(s => s.classList.contains('empty')) };
    }, st);
    log = await logText(page);
    ok(!r2.crew.includes('medic') && r2.crew.includes('engineer') && !r2.ended, 'at the station the medic walked off; the engineer stays; the run goes on');
    ok(/Vasquez walked off at .+ medic post vacant\. Crew now 1\. Predictable\./i.test(log), "Ship's Log entry in MARV's voice (names, role, place, crew left)");
    ok(!r2.hp && !r2.mo && !r2.warned && !r2.charges, 'their HP / morale / warning / skill charges are gone with them');
    ok(r0.passive > 0 && r2.passive === 0, 'role freed: the medic passive went from ' + r0.passive + ' to 0');
    ok(r2.slots.filter(Boolean).length === 1, 'their card is now an empty slot');
    await shot(page, 'morale_02_deserted');
    await page.close();
  }

  console.log('— closed loop: raised above 0 before the station cancels it');
  {
    const page = await boot({ ai: 'rex' });
    await page.evaluate(() => { setCrewMorale(0, 'medic'); renderCruise(); });
    // REST through the real Stop menu (2 days) — every member rises.
    await page.evaluate(() => {
      window.__rnd = Math.random; Math.random = () => 0.99; // no interrupts, no trader
      if (!document.body.classList.contains('stop-active')) document.getElementById('stop-btn').click();
      [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /^REST/.test(b.querySelector('.stop-choice-body').textContent)).click();
      [...document.querySelectorAll('.day-step')][1].click();
    });
    await page.waitForFunction(() => crewMoraleOf('medic') > 0 && !document.querySelector('.stop-choice.day-picker'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2600);
    const r = await page.evaluate(() => { Math.random = window.__rnd; renderCruise(); return { mo: crewMoraleOf('medic'), warned: !!(STATE.moraleWarned || {}).medic }; });
    const log = await logText(page);
    ok(r.mo > 0 && !r.warned, 'REST lifted the medic to ' + r.mo + ': the warning is cleared');
    ok(/Desertion risk cleared/.test(log), "REX's all-clear line is in the log");
    const st = await stationAhead(page);
    const crew = await page.evaluate(n => { document.body.classList.remove('stop-active'); travelTo(n, { skipEvent: true }); return STATE.crew.slice(); }, st);
    ok(crew.includes('medic'), 'next station: the medic stays aboard');
    await page.close();
  }

  console.log('— the warning always comes first (hitting 0 on the leg in)');
  {
    const page = await boot();
    const st = await stationAhead(page);
    const r = await page.evaluate(n => {
      setCrewMorale(0.2, 'medic'); setCrewMorale(80, 'engineer'); renderCruise(); // not yet 0: no warning
      payEffortTax(1); // 0 now, but the hub hasn't warned yet
      travelTo(n, { skipEvent: true });
      const stayed = STATE.crew.includes('medic');
      renderCruise();
      return { stayed, warned: !!(STATE.moraleWarned || {}).medic };
    }, st);
    ok(r.stayed && r.warned, 'hit 0 on the way in: stays this station, warned at the hub for the next');
    await page.close();
  }

  console.log('— a real station arrival (approach + dock) after a desertion stays sound');
  {
    const page = await boot();
    const st = await stationAhead(page);
    await page.evaluate(() => { setCrewMorale(0, 'engineer'); setCrewMorale(50, 'medic'); renderCruise(); });
    const r = await page.evaluate(n => { travelTo(n); return { crew: STATE.crew.slice(), ev: STATE.currentEvent && STATE.currentEvent.id, scr: document.querySelector('.screen.active').id }; }, st);
    ok(!r.crew.includes('engineer') && r.ev && r.scr === 'screen-encounter', 'deserted before the stop\'s event; the station approach opens normally (' + r.ev + ')');
    await page.close();
  }

  console.log('— combat: seeded from the average, the net change lands on everyone');
  {
    const page = await boot({ crew: ['chef', 'medic'] });
    await page.evaluate(() => { setCrewMorale(40, 'chef'); setCrewMorale(60, 'medic'); enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001); });
    await page.waitForTimeout(250);
    await page.evaluate(() => window.triggerCombat({}));
    await page.waitForTimeout(500);
    const hud = await page.evaluate(() => document.getElementById('combat-num-mor').textContent);
    ok(hud === '50', 'combat morale = the crew average (' + hud + ')');
    await page.evaluate(() => { Math.random = () => 0.01; const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.textContent.includes('OFFER COOKIES')); b && b.click(); });
    await page.waitForFunction(() => crewMoraleOf('chef') !== 40, null, { timeout: 6000 }).catch(() => {});
    const r = await page.evaluate(() => ({ chef: crewMoraleOf('chef'), medic: crewMoraleOf('medic') }));
    ok(r.chef > 40 && Math.abs((r.chef - 40) - (r.medic - 60)) < 1e-6, 'tribute +morale: both members moved alike (' + JSON.stringify(r) + ')');
    await page.close();
  }

  console.log('— no crew aboard: no morale at all');
  {
    const page = await boot({ crew: [] });
    const r = await page.evaluate(() => {
      const out = {};
      renderHUD();
      out.avg = crewMoraleAvg(); out.raw = crewMoraleRaw();
      out.hud = document.querySelector('#hud-map [data-tip="resource_morale"]').textContent.trim();
      out.low = activeTriggers().has('low_morale');
      out.fail = checkFailure();
      out.tax = payEffortTax(3); out.taxLabel = effortTax(3);
      out.facts = outcomeFacts({ resources: { morale: 5, food: 3 } }).map(f => f.text);
      applyOutcomeEffects({ resources: { morale: -50 }, time_cost: 'none' });
      out.after = JSON.stringify(STATE.crewMorale); out.fail2 = checkFailure();
      if (!document.body.classList.contains('stop-active')) document.getElementById('stop-btn').click();
      const rest = [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /^REST/.test(b.querySelector('.stop-choice-body').textContent));
      out.rest = rest ? { locked: rest.classList.contains('locked'), text: rest.textContent } : null;
      const verbs = [...document.querySelectorAll('#stop-choices .stop-choice')].map(b => b.textContent + ' ' + (b.getAttribute('title') || ''));
      out.moCost = verbs.some(t => /MO\b|morale/.test(t) && !/^REST/.test(t));
      out.tip = JSON.stringify(Tooltip.get('resource_morale')());
      out.score = scoreValue();
      out.slots = [...document.querySelectorAll('#crew-strip .crew-slot')].map(s => s.classList.contains('empty'));
      return out;
    });
    ok(r.avg === null && r.raw === null, 'crewMoraleAvg() is null');
    ok(r.hud.endsWith('—'), 'HUD morale reads "—" (' + r.hud + ')');
    ok(!r.low && r.fail === false && r.fail2 === false, 'no low_morale, no mutiny — even after a −50 morale outcome');
    ok(r.after === '{}', 'nothing to apply a morale change to');
    ok(r.tax === 0 && r.taxLabel === 0 && !r.moCost, 'the effort tax costs nothing and no verb claims a morale cost');
    ok(!r.facts.some(f => /MORALE/.test(f)) && r.facts.includes('+3 FOOD'), 'previews drop morale (' + r.facts.join(', ') + ')');
    ok(r.rest && r.rest.locked && /No crew aboard/.test(r.rest.text), 'REST is locked: "No crew aboard to rest"');
    ok(/No crew aboard/.test(r.tip), 'the morale tooltip says so');
    ok(Number.isFinite(r.score), 'the ending score still computes (' + Math.round(r.score) + ')');
    ok(r.slots.length === 3 && r.slots[1] && r.slots[2], 'captain + two empty slots');
    await shot(page, 'morale_03_solo');
    // Combat with nobody aboard: morale shows "—", the surrender promises no morale.
    await page.evaluate(() => { document.body.classList.remove('stop-active'); enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001); });
    await page.waitForTimeout(250);
    await page.evaluate(() => window.triggerCombat({}));
    await page.waitForTimeout(500);
    const c = await page.evaluate(() => document.getElementById('combat-num-mor').textContent);
    ok(c === '—', 'combat morale reads "—" with nobody aboard');
    await page.close();
  }

  console.log('— the last crew member leaving: no morale');
  {
    const page = await boot({ crew: ['engineer'] });
    const r = await page.evaluate(() => { killCrew('engineer'); return { avg: crewMoraleAvg(), mo: JSON.stringify(STATE.crewMorale), low: activeTriggers().has('low_morale') }; });
    ok(r.avg === null && r.mo === '{}' && !r.low, 'after the last death: no morale, no low_morale');
    await page.close();
  }

  console.log('— joiners bring their own morale');
  {
    const page = await boot({ crew: ['engineer'] });
    const r = await page.evaluate(() => { setCrewMorale(20); const role = joinAsCrew({ id: 'x', name: 'Test Joiner', story: 's', join_role: 'pilot' }, 100); return { role, mo: crewMoraleOf('pilot'), start: trailStartMorale(), eng: crewMoraleOf('engineer') }; });
    ok(r.role === 'pilot' && r.mo === r.start && r.eng === 20, 'a joiner starts at the trail morale (' + r.mo + '), not the crew\'s 20');
    await page.close();
  }

  console.log('— saves: old single morale migrates; per-member morale round-trips');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const out = {};
      setCrewMorale(12, 'medic'); setCrewMorale(88, 'engineer'); renderCruise();
      out.wrote = writeSnapshot();
      setCrewMorale(50);
      out.loaded = loadRun();
      out.rt = Object.assign({}, STATE.crewMorale); out.rtRes = 'morale' in STATE.resources;
      // An old save: one ship morale, no crewMorale.
      const snap = JSON.parse(localStorage.getItem('transplant_save_v1'));
      delete snap.crewMorale; delete snap.moraleWarned; snap.resources.morale = 37;
      localStorage.setItem('transplant_save_v1', JSON.stringify(snap));
      out.loaded2 = loadRun();
      out.mig = Object.assign({}, STATE.crewMorale); out.migRes = 'morale' in STATE.resources;
      // A warned member survives the round trip and still deserts.
      setCrewMorale(0, 'medic'); renderCruise(); writeSnapshot(); STATE.moraleWarned = {}; loadRun();
      out.warned = !!STATE.moraleWarned.medic;
      return out;
    });
    ok(r.wrote && r.loaded && r.rt.medic === 12 && r.rt.engineer === 88 && !r.rtRes, 'save/load round-trips each member (' + JSON.stringify(r.rt) + ')');
    ok(r.loaded2 && r.mig.medic === 37 && r.mig.engineer === 37 && !r.migRes, 'old save: resources.morale 37 → every crew member 37, and it is gone from resources');
    ok(r.warned, 'the 0-morale warning is saved too (a reload cannot dodge the desertion)');
    await page.close();
  }

  console.log('— crew strip: always captain + 2 slots, nothing shifts');
  {
    const page = await boot();
    const geo = async () => page.evaluate(() => {
      renderCruise();
      const crop = document.getElementById('crop-card-mini').getBoundingClientRect();
      const slots = [...document.querySelectorAll('#crew-strip .crew-slot')];
      const e = slots.find(s => s.classList.contains('empty'));
      const cs = e ? getComputedStyle(e) : null;
      return { n: slots.length, cropX: Math.round(crop.left), widths: slots.map(s => Math.round(s.getBoundingClientRect().width)),
               empty: e ? { bars: e.querySelectorAll('.crew-bar').length, border: cs.borderTopStyle, cursor: cs.cursor, tip: e.getAttribute('title') || e.dataset.tipDescription || '', text: e.textContent } : null,
               crowded: document.getElementById('crew-strip').classList.contains('crowded') };
    });
    const g2 = await geo();
    await page.evaluate(() => killCrew('medic'));
    const g1 = await geo();
    await page.evaluate(() => killCrew('engineer'));
    const g0 = await geo();
    ok(g2.n === 3 && g1.n === 3 && g0.n === 3, 'three slots with 2, 1 and 0 crew aboard');
    ok(g2.cropX === g1.cropX && g1.cropX === g0.cropX, 'the crop card stays at x=' + g2.cropX + ' (' + [g2.cropX, g1.cropX, g0.cropX].join('/') + ')');
    ok([...g1.widths, ...g0.widths].every(w => w === g2.widths[0]), 'every slot, empty or not, is the same width (' + g0.widths.join('/') + ')');
    ok(g1.empty && g1.empty.bars === 0 && g1.empty.border === 'dashed' && /vacant/.test(g1.empty.text), 'empty slot: dashed outline, "— vacant —", no bars');
    ok(g1.empty && !/hand|pointer/.test(g1.empty.cursor) && /Empty crew slot/.test(g1.empty.tip), 'empty slot: default cursor (' + g1.empty.cursor + '), tooltip "' + g1.empty.tip.slice(0, 40) + '…"');
    const click = await page.evaluate(() => { document.querySelector('#crew-strip .crew-slot.empty').click(); return document.getElementById('overlay-crew') ? document.getElementById('overlay-crew').classList.contains('active') : false; });
    ok(!click && !g2.crowded && !g0.crowded, 'empty slot opens nothing; no "crowded" variant');
    const css = await page.evaluate(() => [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => /crowded/.test(r.selectorText || '')); } catch (_) { return false; } }));
    ok(!css, 'the vestigial #crew-strip.crowded CSS is gone');
    await shot(page, 'morale_04_empty_slots');
    await page.close();
  }

  console.log('— the debug fixed path respects the cap');
  {
    const page = await open(URL + '?debug=fixed_path');
    const n = await page.evaluate(() => ({ crew: STATE.crew.slice(), mo: Object.keys(STATE.crewMorale || {}) }));
    ok(n.crew.length === 2 && n.mo.length === 2, 'initState seeds 2 crew (' + n.crew.join(', ') + ') with their morale');
    await page.close();
  }

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
