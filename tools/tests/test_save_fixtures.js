// Old saves still load: every real save in fixtures/saves (exported from
// older builds by fixtures/gen_old_saves.js) goes through the title's
// Continue on this build, must land where it was saved (the hub, or back in
// the same event) with a sane, migrated state, keep playing without errors,
// and survive a save → load → save round trip unchanged.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { installHarness, step } = require('./sim.js');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const DIR = path.join(__dirname, 'fixtures', 'saves');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort();
  ok(files.length >= 18, `fixtures present (${files.length})`);
  const builds = [...new Set(files.map(f => f.split('_')[0]))];
  console.log(`— ${files.length} saves from ${builds.join(', ')}`);
  const browser = await chromium.launch();
  for (const f of files) {
    const save = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 780 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.stack || e.message).slice(0, 300)));
    page.on('dialog', d => d.accept());
    await page.clock.install();
    const boot = async () => { await page.clock.runFor(1500); await page.waitForFunction(() => typeof EVENTS !== 'undefined' && Object.keys(EVENTS).length > 0); };
    await page.goto(URL); await boot();
    await page.evaluate(s => localStorage.setItem('transplant_save_v1', JSON.stringify(s)), save);
    await page.reload(); await boot();
    // A key dismisses the poster; the buttons fade in after the intro and
    // Continue lights then (the player's own path).
    await page.keyboard.press('Space');
    for (let i = 0; i < 40 && !(await page.evaluate(() => document.getElementById('title-buttons').classList.contains('visible'))); i++) await page.clock.runFor(500);
    const lit = await page.evaluate(() => hasSave() && !document.getElementById('btn-continue').classList.contains('disabled'));
    ok(lit, `${f}: Continue offered`);
    await page.evaluate(() => { const b = document.getElementById('btn-continue'); b.classList.remove('disabled'); b.click(); });
    await page.clock.runFor(800);
    const st = await page.evaluate(() => {
      const R = STATE.resources;
      return {
        scr: (document.querySelector('.screen.active') || {}).id, ev: STATE.currentEvent && STATE.currentEvent.id, ended: STATE.ended,
        resOk: Object.values(R).every(v => Number.isFinite(v) && v >= 0), oldMorale: 'morale' in R,
        moraleOk: STATE.crew.every(r => Number.isFinite(STATE.crewMorale[r])) && Object.keys(STATE.crewMorale).every(r => STATE.crew.includes(r)),
        warned: typeof STATE.moraleWarned === 'object' && STATE.moraleWarned !== null,
        capHP: STATE.captainHP, crewCap: STATE.crew.length <= 2,
        fab: !!STATE.fabricator && typeof STATE.fabricator === 'object', gold: STATE.goldAmount,
        day: STATE.daysElapsed, crew: STATE.crew.slice(),
      };
    });
    ok(st.resOk, `${f}: resources finite and ≥ 0`);
    ok(!st.oldMorale, `${f}: the old ship morale is migrated away`);
    ok(st.moraleOk && st.warned, `${f}: per-crew morale for exactly the crew aboard ${JSON.stringify(st.crew)}`);
    ok(Number.isFinite(st.capHP) && st.capHP > 0 && st.capHP <= 100, `${f}: captain HP ${st.capHP}`);
    ok(st.crewCap && st.fab && Number.isFinite(st.gold) && st.gold >= 0, `${f}: crew cap, fabricator, gold`);
    ok(st.day === save.daysElapsed, `${f}: day kept (${save.daysElapsed} → ${st.day})`);
    if (save.pendingEvent) ok(st.scr === 'screen-encounter' && st.ev === save.pendingEvent, `${f}: back in ${save.pendingEvent} (got ${st.scr} ${st.ev})`);
    else ok(st.scr === 'screen-cruise' && !st.ended, `${f}: back at the hub (got ${st.scr})`);
    // Keep playing on it.
    await page.evaluate(installHarness, 'greedy');
    let hubChecked = false;
    for (let s = 0; s < 60; s++) {
      const r = await page.evaluate(step).catch(e => { errors.push('step: ' + e.message.slice(0, 200)); return { wait: 300 }; });
      if (r.done || r.stuck) break;
      await page.clock.runFor(r.wait || 100);
      if (!hubChecked && s > 3) {
        const rt = await page.evaluate(() => {
          const scr = (document.querySelector('.screen.active') || {}).id;
          if (scr !== 'screen-cruise' || STATE.currentEvent || STATE.forcedEvent || document.querySelector('#game .overlay.active') || (window.cruiseWaitActive && cruiseWaitActive())) return null;
          if (!saveRun()) return { err: 'saveRun refused' };
          const a = localStorage.getItem('transplant_save_v1');
          loadRun(); saveRun();
          const b = localStorage.getItem('transplant_save_v1');
          const strip = x => { const o = JSON.parse(x); delete o.ts; return JSON.stringify(o); };
          return { same: strip(a) === strip(b) };
        });
        if (rt) { hubChecked = true; ok(!rt.err && rt.same, `${f}: save → load → save round trip identical ${rt.err || ''}`); }
      }
    }
    ok(!errors.length, `${f}: no page errors\n      ` + errors.slice(0, 3).join('\n      '));
    await ctx.close();
  }
  console.log(`save_fixtures: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
