// Hunt C fixes (2026-10-12) not pinned by test_save_quit.js: a reload-quit
// at a station still runs the approach (C4), the Simon briefing names the
// real error limit (C8), the Engine Fault copy (C9) and its demo verbs
// (C10, owner ruling 56), and no save lands mid-REPAIR (C6).
// C1/C2/C3/C5/C7 (reload = quit for the defeat beat, the wait flashes,
// the fight, the harm so far) are in test_save_quit.js.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function boot(setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['pilot', 'medic'], crop: 'wheat', ship: 'Q' }, o));
    STATE.stowaway = null; returnToHub();
  }, setup || {});
  await page.waitForTimeout(300);
  return page;
}
async function reloadContinue(page) {
  await page.reload();
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor && document.getElementById('btn-continue'));
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => document.getElementById('title-buttons').classList.contains('visible'))) break;
    if (i % 10 === 0) await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  }
  await page.click('#btn-continue');
  await page.waitForTimeout(900);
}
const where = page => page.evaluate(() => ({ scr: document.querySelector('.screen.active').id, ev: STATE.currentEvent && STATE.currentEvent.id, phase: STATE.stationVisit && STATE.stationVisit.phase, day: STATE.daysElapsed }));
// A station stop whose drawn event plays before the approach.
const arriveWith = (page, evId) => page.evaluate(async id => {
  const node = STATE.nodes.find(n => n.node_type === 'station');
  STATE.currentId = node.id;
  STATE.seenEventIds.delete(id);
  StationVisit.arrive(node, EVENTS[id]);
  await new Promise(r => setTimeout(r, 300)); finishAllTyping();
  return { kind: STATE.stationVisit.kind, phase: STATE.stationVisit.phase };
}, evId);

(async () => {
  browser = await chromium.launch();

  console.log('— C4: a reload-quit of a station arrival event still runs the approach');
  for (const mode of ['quit', 'reload']) {
    const page = await boot();
    const v = await arriveWith(page, 'event_crisis_025');
    await page.evaluate(() => [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => /restart/i.test(x.textContent)).click());
    await page.waitForSelector('#rstart'); await page.click('#rstart'); await page.waitForTimeout(600);
    if (mode === 'quit') {
      await page.click('#mclose'); await page.waitForTimeout(400);
      await page.evaluate(() => document.querySelector('#enc-choices .enc-choice.advance').click());
      await page.waitForTimeout(600);
    } else await reloadContinue(page);
    const w = await where(page);
    ok(v.kind === 'arrival' && w.scr === 'screen-encounter' && w.ev === 'event_station_014' && w.phase === 'approach', `${mode}: Engine Fault on arrival → the approach (${w.ev}, phase ${w.phase})`);
    if (mode === 'reload') {
      await reloadContinue(page);
      const w2 = await where(page);
      ok(w2.ev === 'event_station_014' && w2.day === w.day, 'a second reload: still the approach, no time spent again');
    }
    await page.close();
  }
  {
    const page = await boot();
    const evId = await page.evaluate(() => Object.values(EVENTS).find(e => JSON.stringify(e).includes('"triggerCombat":true') && StationVisit.kindOf(e) === 'arrival').id);
    const v = await arriveWith(page, evId);
    await page.evaluate(async () => { STATE.resources.hull = 90; STATE.resources.fuel = 60; window.triggerCombat({}); await new Promise(r => setTimeout(r, 1200)); });
    const pc = await page.evaluate(() => JSON.parse(localStorage.getItem('transplant_save_v1')).pendingCombat);
    await reloadContinue(page);
    const w = await where(page);
    ok(v.kind === 'arrival' && pc && pc.ev === evId && w.ev === 'event_station_014' && w.phase === 'approach', `a fight broken off by a reload (${evId}) → the approach (${w.ev}, phase ${w.phase})`);
    await page.close();
  }

  console.log('— C6: no save mid-REPAIR');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      showOverlay('overlay-engrepair');
      const out = { save: saveRun(), why: saveBlockedReason() };
      hideOverlay('overlay-engrepair');
      out.after = saveRun();
      return out;
    });
    ok(r.save === false && r.why === 'FINISH THE JOB FIRST' && r.after === true, `saveRun ${r.save}, pause SAVE "${r.why}" while the engine room is open; saves again after (${r.after})`);
    await page.close();
  }

  console.log('— C8: the Simon briefing names the real error limit');
  for (const [ai, word] of [['marv', 'Three'], ['rex', 'Four']]) {
    const page = await boot({ ai });
    const t = await page.evaluate(async () => {
      openMinigame('engine', {}, () => {});
      await new Promise(r => setTimeout(r, 200));
      const m = document.querySelector('#ga .ready-mechanic').textContent;
      document.getElementById('mclose').click();
      return { m };
    });
    ok(t.m.includes(word + ' wrong clicks') && !/\{/.test(t.m), `${ai.toUpperCase()}: "${word} wrong clicks" (REX forgives a 4th)`);
    await page.close();
  }

  console.log('— C9 / C10: Engine Fault copy and the demo verbs (ruling 56)');
  {
    const page = await boot({ crew: ['pilot', 'engineer'] });
    const d = await page.evaluate(() => {
      const ev = EVENTS.event_crisis_025;
      const perfect = ev.choices[0].tier_outcomes.perfect.narrative;
      return { perfect, lines: ev.choices.map(c => choiceCostLines(c).join(' / ')), eng: ev.choices[1], limp: ev.choices[2] };
    });
    ok(!/crew/i.test(d.perfect) && !/coil, injector, valve, relay/i.test(d.perfect) && !/in order on the first pass/.test(d.perfect), 'the perfect tier names no crew and no fixed order');
    ok(d.eng.effort === 3 && d.eng.outcome.time_days === 6 && d.lines[1] === 'Takes 6 days', `FIELD REPAIR: effort 3, 6 days (tooltip "${d.lines[1]}")`);
    ok(d.limp.effort === 1 && d.limp.outcome.time_cost === 'low' && d.limp.outcome.resources.fuel === -2 && d.lines[2] === 'Takes 2 days / Costs: −2 FUEL', `LIMP MODE: effort 1, 2 days, −2 fuel (tooltip "${d.lines[2]}")`);
    for (const [i, days, fuel, tax] of [[1, 6, 0, 3], [2, 2, -2, 1]]) {
      const r = await page.evaluate(async ([i, tax]) => {
        setCrewMorale(60); STATE.resources.fuel = 80; STATE.seenEventIds.delete('event_crisis_025');
        enterEvent(STATE.byId[STATE.currentId], EVENTS.event_crisis_025);
        await new Promise(r => setTimeout(r, 300)); finishAllTyping();
        const a = { day: STATE.daysElapsed, fuel: STATE.resources.fuel, mo: crewMoraleRaw(), tax: effortTax(tax) };
        const pips = document.querySelectorAll('#enc-choices .enc-choice')[i].querySelector('.effort');
        a.pips = pips && pips.textContent;
        document.querySelectorAll('#enc-choices .enc-choice')[i].click();
        await new Promise(r => setTimeout(r, 500));
        return Object.assign(a, { day2: STATE.daysElapsed, fuel2: STATE.resources.fuel, mo2: crewMoraleRaw() });
      }, [i, tax]);
      ok(r.day2 - r.day === days && Math.round(r.fuel2 - r.fuel) === fuel && Math.abs((r.mo - r.mo2) - r.tax) < 0.01 && r.pips === '●'.repeat(tax) + '○'.repeat(5 - tax),
        `choice ${i}: +${r.day2 - r.day}d, fuel ${Math.round(r.fuel2 - r.fuel)}, the ${r.pips} effort tax (−${r.tax} morale) — as previewed`);
      await page.evaluate(() => { const b = document.querySelector('#enc-choices .enc-choice.advance'); b && b.click(); });
      await page.waitForTimeout(300);
    }
    await page.close();
  }

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\nb5_c: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
