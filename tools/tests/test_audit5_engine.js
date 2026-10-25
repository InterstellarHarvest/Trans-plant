// Audit 5 engine fixes: what a pause → LOAD (and an in-page restart) leaves
// behind, the cantina's speaker, the end report's crew count.
//  - the AI bubble holds the replaced voyage's lines: LOAD / a new launch clear it
//  - a mining run under way stops on LOAD (no tick, spawner, haul card into
//    the loaded voyage); a stale haul card never covers the next MINE
//  - the fabricator's run loop plays only while it is open
//  - loadRun resets the per-encounter / per-ending transients (BROWSE's paid tax…)
//  - event_station_021: the robot bartender keeps the portrait; the crew
//    member is who it talks about (event_shipboard_017 still shows the crew member)
//  - the end report counts the captain: solo 1 / 1, captain + 2 crew 3 / 3
//  - combat aim: the screen's own layout width sets the scale (no 960/958 drift)
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const SLOT = 'transplant:save:1';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Live timers by kind: the fabricator's 140 ms run loop and the mining tick.
const INSTRUMENT = () => {
  const live = new Map(); let seq = 0;
  const si = window.setInterval, ci = window.clearInterval, raf = window.requestAnimationFrame;
  window.setInterval = function (fn, ms, ...a) { const id = si.call(window, fn, ms, ...a); live.set(id, { ms, src: String(fn) }); return id; };
  window.clearInterval = function (id) { live.delete(id); return ci.call(window, id); };
  window.__liveIntervals = test => [...live.values()].filter(v => test(v)).length;
  window.__mineTicks = 0;
  window.requestAnimationFrame = function (fn) { if (fn && fn.name === 'tick' && String(fn).includes('MSTATE')) window.__mineTicks++; return raf.call(window, fn); };
  window.__fabLoops = () => window.__liveIntervals(v => v.ms === 140 && v.src.includes('setFabFrame'));
  void seq;
};

async function boot(setup) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(INSTRUMENT);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e.stack || e.message).slice(0, 300)));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor && typeof enterEvent === 'function');
  await page.evaluate(o => {
    localStorage.clear();
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'A5' }, o));
    STATE.stowaway = null; STATE.flags.add('departed');
    returnToHub();
  }, setup || {});
  await sleep(250);
  return page;
}
// ESC → LOAD → slot 1 → confirm, by real clicks; then close the terminal.
async function pauseLoad(page) {
  await page.keyboard.press('Escape');
  await page.locator('#pause-overlay:not([hidden])').first().waitFor({ timeout: 4000 });
  await page.click('.pause-item[data-section="load"]');
  await page.click('.pause-slot[data-slot="1"] [data-act="load"]');
  await sleep(300);
  if (await page.locator('.tp-confirm-overlay [data-act="yes"]').count()) await page.click('.tp-confirm-overlay [data-act="yes"]');
  await sleep(400);
  if (await page.evaluate(() => document.body.classList.contains('pause-open'))) await page.click('.pause-close-hint');
  await sleep(200);
}
// The hub with the Stop menu open, at a stop of this kind.
async function stopAt(page, nodeType) {
  await page.evaluate(nt => {
    const n = STATE.byId[STATE.currentId];
    n.node_type = nt; STATE.stationVisit = null; STATE.traderAt = {};
    document.body.classList.remove('stop-active'); document.getElementById('stop-btn').textContent = 'Stop';
    returnToHub();
  }, nodeType);
  await sleep(250);
  if (!(await page.evaluate(() => document.body.classList.contains('stop-active')))) { await page.click('#stop-btn'); await sleep(250); }
}
async function verb(page, id) {
  const sel = `#stop-choices .stop-choice[data-verb-id="${id}"]:not(.locked)`;
  await page.locator(sel).first().waitFor({ timeout: 4000 });
  await page.click(sel); await sleep(350);
}
const bubble = page => page.evaluate(() => {
  const b = document.getElementById('ai-bubble');
  return { shown: b.classList.contains('show'), lines: [...b.querySelectorAll('.ai-bubble-lines p')].map(p => p.textContent) };
});

(async () => {
  browser = await chromium.launch();

  console.log('— the AI bubble across pause → LOAD and a new launch');
  {
    const page = await boot({ ai: 'chip', ship: 'Bravo' });
    await page.evaluate(() => saveRun('transplant:save:1'));
    // A second voyage in the same page; its AI says something at the stop.
    await page.evaluate(() => {
      applySetupToState({ trail: 'lunar', ai: 'aria', captain: 'botanist', crew: ['chef', 'pilot'], crop: 'tomato', ship: 'Alpha' });
      STATE.stowaway = null; STATE.flags.add('departed'); returnToHub();
    });
    await sleep(250);
    if (!(await page.evaluate(() => document.body.classList.contains('stop-active')))) await page.click('#stop-btn');
    await page.evaluate(() => window.pushCruiseLog('ARIA LINE FROM THE ALPHA VOYAGE!', { ai: true }));
    await sleep(200);
    const before = await bubble(page);
    ok(before.shown && before.lines.some(t => /ALPHA VOYAGE/.test(t)), `the Alpha voyage's bubble shows its line before LOAD (${before.lines.length} lines)`);
    await pauseLoad(page);
    const loaded = await page.evaluate(() => ({ ai: STATE.activeAI, ship: STATE.shipName }));
    ok(loaded.ai === 'chip' && loaded.ship === 'Bravo', `slot 1 loaded (Bravo, CHIP): ${JSON.stringify(loaded)}`);
    // The loaded voyage's AI says one line; the player stops.
    await page.evaluate(() => window.pushCruiseLog('CHIP LINE AFTER THE LOAD!', { ai: true }));
    if (!(await page.evaluate(() => document.body.classList.contains('stop-active')))) await page.click('#stop-btn');
    await sleep(400);
    const after = await bubble(page);
    ok(after.shown && after.lines.some(t => /AFTER THE LOAD/.test(t)), 'after LOAD + STOP the bubble shows the loaded voyage\'s line');
    ok(!after.lines.some(t => /ALPHA VOYAGE/.test(t)), `…and none of the replaced voyage's (${after.lines.length} lines: ${after.lines.map(t => t.slice(0, 30)).join(' | ')})`);
    // A new launch in-page: the bubble and the hub log start over.
    await page.evaluate(() => window.pushCruiseLog('CHIP LINE FROM BRAVO!', { ai: true }));
    await sleep(150);
    const logBefore = await page.evaluate(() => document.getElementById('ai-log').children.length);
    await page.evaluate(() => { applySetupToState({ trail: 'mars', ai: 'rex', captain: 'veteran', crew: ['engineer'], crop: 'wheat', ship: 'Charlie' }); });
    await sleep(200);
    const fresh = await page.evaluate(() => ({ log: [...document.getElementById('ai-log').children].map(c => c.textContent), bubble: [...document.querySelectorAll('#ai-bubble .ai-bubble-lines p')].map(p => p.textContent) }));
    ok(logBefore > 0 && !fresh.log.some(t => /BRAVO/.test(t)), `a new launch's hub log is its own (${fresh.log.length} lines, none of Bravo's)`);
    ok(!fresh.bubble.some(t => /BRAVO/.test(t)), 'a new launch clears the bubble');
    await page.context().close();
  }

  console.log('— pause → LOAD mid-mining-run');
  {
    const page = await boot();
    await page.evaluate(() => saveRun('transplant:save:1'));
    const life0 = await page.evaluate(() => JSON.stringify(STATE.miningLifetime));
    await stopAt(page, 'asteroid_field'); await verb(page, 'mine');
    await page.locator('#overlay-mining.active').first().waitFor();
    if (await page.locator('#mining-choices .crew-chip').count()) await page.locator('#mining-choices .crew-chip').first().click();
    await page.locator('#mining-choices .enc-choice', { hasText: 'BEGIN MINING' }).click();
    await sleep(1200);
    const live = await page.evaluate(() => ({ kids: document.querySelectorAll('#mining-stage .asteroid, #mining-stage [class*=asteroid]').length, ticks: window.__mineTicks }));
    ok(live.ticks > 10, `the run is live before LOAD (${live.ticks} ticks)`);
    await pauseLoad(page);
    await sleep(300);
    const t0 = await page.evaluate(() => window.__mineTicks);
    await sleep(1500);
    const after = await page.evaluate(() => ({ ticks: window.__mineTicks, kids: document.querySelectorAll('#mining-stage .asteroid, #mining-stage [class*=asteroid]').length, ov: document.getElementById('overlay-mining').classList.contains('active'), haul: document.getElementById('haul-overlay').classList.contains('visible'), life: JSON.stringify(STATE.miningLifetime) }));
    ok(after.ticks === t0, `no mining tick runs after LOAD (${after.ticks - t0} in 1.5 s)`);
    ok(after.kids === 0, `the field is cleared (${after.kids} rocks left; ${live.kids} before)`);
    ok(!after.ov && !after.haul, 'no mining overlay, no haul card over the loaded voyage');
    ok(after.life === life0, `the loaded voyage's mining record is untouched (${after.life})`);
    // MINE in the loaded voyage opens on its own armed view.
    await stopAt(page, 'asteroid_field'); await verb(page, 'mine');
    await page.locator('#overlay-mining.active').first().waitFor();
    const seen = await page.evaluate(() => ({ haul: document.getElementById('haul-overlay').classList.contains('visible'), begin: [...document.querySelectorAll('#mining-choices .enc-choice')].some(b => /BEGIN MINING/.test(b.textContent)) }));
    ok(!seen.haul && seen.begin, `MINE in the loaded voyage shows BEGIN MINING, no stale card (${JSON.stringify(seen)})`);
    // A haul card left over (any path) is cleared when MINE opens.
    await page.locator('#mining-choices .enc-choice', { hasText: /LEAVE/ }).first().click().catch(() => {});
    await sleep(300);
    await page.evaluate(() => { window.abortMining(); const h = document.getElementById('haul-overlay'); h.innerHTML = '<div class="haul-card">STALE</div>'; h.classList.add('visible'); });
    await stopAt(page, 'asteroid_field'); await verb(page, 'mine');
    await page.locator('#overlay-mining.active').first().waitFor();
    const stale = await page.evaluate(() => ({ vis: document.getElementById('haul-overlay').classList.contains('visible'), text: document.getElementById('haul-overlay').textContent }));
    ok(!stale.vis && !/STALE/.test(stale.text), 'openMining clears a stale haul card');
    await page.context().close();
  }

  console.log('— the fabricator run loop');
  {
    const page = await boot();
    await page.evaluate(() => { STATE.materials = { metal: 20, scrap: 20, electronics: 10, polymer: 10, crystal: 6, ice: 6 }; renderHUD(); saveRun('transplant:save:1'); });
    await stopAt(page, 'void'); await verb(page, 'fab');
    await page.locator('#overlay-fabricator.active').first().waitFor();
    let crafted = false;
    const n = await page.locator('.fb-recipe-row').count();
    for (let i = 0; i < n && !crafted; i++) {
      await page.locator('.fb-recipe-row').nth(i).click(); await sleep(50);
      if (await page.evaluate(() => { const b = document.getElementById('fb-craft-btn'); return b && !b.disabled && !b.classList.contains('disabled') && b.offsetParent !== null; })) { await page.click('#fb-craft-btn'); crafted = true; }
    }
    await sleep(500);
    ok(crafted, 'a craft started');
    ok(await page.evaluate(() => window.__fabLoops()) === 1, 'the run loop plays while the fabricator is open');
    await page.click('.fb-close'); await sleep(300);
    ok(await page.evaluate(() => window.__fabLoops()) === 0, 'closing the fabricator (job held) stops the run loop');
    await verb(page, 'fab');
    await page.locator('#overlay-fabricator.active').first().waitFor(); await sleep(300);
    ok(await page.evaluate(() => window.__fabLoops()) === 1, 'reopening with the job on the bed starts it again');
    await page.evaluate(() => window.abortFabricator()); await sleep(100);
    ok(await page.evaluate(() => window.__fabLoops()) === 0, 'abortFabricator stops it');
    await page.evaluate(() => window.openFabricator()); await sleep(300);
    ok(await page.evaluate(() => window.__fabLoops()) === 1, '(open again)');
    // (ESC closes the fabricator first; a load over it goes through loadRun's teardown.)
    await page.evaluate(slot => loadRun(slot), SLOT); await sleep(200);
    ok(await page.evaluate(() => window.__fabLoops()) === 0, 'a LOAD with the fabricator open stops the loop');
    await page.context().close();
  }

  console.log('— loadRun resets the transients');
  {
    const page = await boot();
    await page.evaluate(() => saveRun('transplant:save:1'));
    const r = await page.evaluate(() => {
      Object.assign(STATE, {
        _marketTaxPaid: true, _resumableEnd: true, lastPick: { picked: {}, shown: [] }, _shownChoices: [{ text: 'x' }],
        halfEffect: true, lethalSaved: 'x', effortScale: 3, effortCon: { line: 'x', days: 2 }, goneNames: { pilot: 'X' },
        eventSpeaker: 'medic', joinNote: 'x', lastSpeaker: { displayName: 'X' }, _layerVisits: { intro: true }, _lastDraw: { ev: 'x' },
      });
      loadRun('transplant:save:1');
      return {
        _marketTaxPaid: STATE._marketTaxPaid, _resumableEnd: STATE._resumableEnd, lastPick: STATE.lastPick, _shownChoices: STATE._shownChoices,
        halfEffect: STATE.halfEffect, lethalSaved: STATE.lethalSaved, effortScale: STATE.effortScale, effortCon: STATE.effortCon, goneNames: STATE.goneNames,
        eventSpeaker: STATE.eventSpeaker, joinNote: STATE.joinNote, lastSpeaker: STATE.lastSpeaker, _layerVisits: STATE._layerVisits, _lastDraw: STATE._lastDraw,
      };
    });
    ok(r._marketTaxPaid === false, 'a paid BROWSE does not carry into the loaded voyage');
    ok(r._resumableEnd === false, '_resumableEnd is reset');
    const rest = Object.entries(r).filter(([k, v]) => !['_marketTaxPaid', '_resumableEnd'].includes(k) && !(v === null || v === false || v === 1 || (v && typeof v === 'object' && !Object.keys(v).length)));
    ok(!rest.length, `every other per-encounter transient is reset (${rest.map(([k]) => k).join(', ') || 'all clean'})`);
    // In play: a voyage saved at a trader's opening (an in-event save) is
    // loaded over one that had paid its BROWSE: BROWSE's effort lands again.
    const tax = await page.evaluate(() => {
      const ev = EVENTS.event_encounter_trader_001;
      enterEvent(STATE.byId[STATE.currentId], ev); // writes the in-event save
      STATE._marketTaxPaid = true; // the replaced voyage browsed
      loadRun();
      const before = STATE.crew.map(r => crewMoraleOf(r));
      const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => /BROWSE/i.test(x.textContent));
      if (b) b.click();
      return { resumed: STATE.currentEvent && STATE.currentEvent.id, clicked: !!b, before: before.join(','), after: STATE.crew.map(r => crewMoraleOf(r)).join(','), drop: before.reduce((a, v, i) => a + v - crewMoraleOf(STATE.crew[i]), 0) };
    });
    ok(tax.resumed === 'event_encounter_trader_001' && tax.clicked && tax.drop > 0, `BROWSE pays its effort in the loaded voyage (${JSON.stringify(tax)})`);
    await page.context().close();
  }

  console.log('— event_station_021: the bartender keeps the portrait');
  {
    const page = await boot({ crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => {
      enterEvent(STATE.byId[STATE.currentId], EVENTS.event_station_021);
      const name = document.getElementById('enc-subject-name').textContent.trim();
      const speaker = STATE.eventSpeaker, crewName = crewNameOf(speaker);
      const line = (document.getElementById('enc-dialog') || {}).textContent || '';
      const body = (document.getElementById('enc-narr-body') || {}).textContent || '';
      return { name, crewName, npc: STATE.npcCtx && STATE.npcCtx.displayName, job: STATE.npcCtx && STATE.npcCtx.job, line, body, noSubject: document.getElementById('screen-encounter').classList.contains('no-subject') };
    });
    ok(!r.noSubject && r.name && r.name === (r.npc || '').toUpperCase() || r.name === r.npc, `the name plate is the bartender's (${r.name}; npc ${r.npc}, ${r.job})`);
    ok(r.name.toUpperCase() !== r.crewName.toUpperCase(), `not the crew member's (${r.crewName})`);
    ok(r.body.includes(r.crewName) || r.line.includes(r.crewName), 'the crew member is named in the text ({speaker.name})');
    // Its "who" layer: still the bartender.
    const r2 = await page.evaluate(() => {
      const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => /Who are they/i.test(x.textContent));
      if (b) b.click();
      return { name: document.getElementById('enc-subject-name').textContent.trim(), layer: STATE.layerStack && STATE.layerStack[STATE.layerStack.length - 1], crewName: crewNameOf(STATE.eventSpeaker) };
    });
    ok(r2.layer === 'who' && r2.name === r.name, `the "who" layer keeps the bartender (${r2.name})`);
    await page.context().close();
  }
  {
    // Every other crew_speaker event (no npc) still puts the crew member in the frame.
    const page = await boot({ crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => Object.values(EVENTS).filter(e => e.crew_speaker && !e.npc).map(ev => {
      enterEvent(STATE.byId[STATE.currentId], ev);
      const out = { id: ev.id, name: document.getElementById('enc-subject-name').textContent.trim(), crew: STATE.eventSpeaker ? crewNameOf(STATE.eventSpeaker).toUpperCase() : null };
      returnToHub();
      return out;
    }));
    ok(r.length > 0 && r.every(x => x.crew && x.name === x.crew), `crew_speaker events without an npc show the crew member: ${JSON.stringify(r)}`);
    await page.context().close();
  }

  console.log('— the end report counts the captain');
  const endCrew = async (crew, prep) => {
    const page = await boot({ crew });
    const r = await page.evaluate(prep => {
      if (prep === 'lose1') { releaseCrewRole(STATE.crew[0]); STATE.flags.add('crew_lost'); }
      const last = STATE.nodes.find(n => connectionsOf(n).length === 0);
      STATE.cropGrowth.health = 80; STATE.cropGrowth.lastTickDay = STATE.daysElapsed;
      triggerArrival(last);
      window.showEndReport();
      return { val: document.getElementById('end-crew-val').textContent, pips: document.querySelectorAll('#end-crew-pips .crew-pip').length, filled: document.querySelectorAll('#end-crew-pips .crew-pip.filled').length, crewLeft: STATE.crew.length };
    }, prep);
    await page.context().close();
    return r;
  };
  {
    const solo = await endCrew([]);
    ok(solo.val === '1 / 1' && solo.pips === 1 && solo.filled === 1, `a solo arrival reads 1 / 1, one full pip (${JSON.stringify(solo)})`);
    const full = await endCrew(['engineer', 'medic']);
    ok(full.val === '3 / 3' && full.pips === 3 && full.filled === 3, `captain + 2 crew arrive 3 / 3 (${JSON.stringify(full)})`);
    const lost = await endCrew(['engineer', 'medic'], 'lose1');
    ok(lost.crewLeft === 1 && lost.val === '2 / 3' && lost.pips === 3 && lost.filled === 2, `one crew lost: 2 / 3 (${JSON.stringify(lost)})`);
    // The captain lost (a failure with a report): the captain's pip is empty.
    const page = await boot({ crew: ['engineer', 'medic'] });
    const cl = await page.evaluate(() => {
      STATE.captainHP = 0; checkFailure();
      if (typeof window.showEndReport === 'function') window.showEndReport();
      const p = document.getElementById('end-report-score');
      return { shown: p && p.style.display !== 'none', val: document.getElementById('end-crew-val').textContent, filled: document.querySelectorAll('#end-crew-pips .crew-pip.filled').length };
    });
    ok(!cl.shown || (cl.val === '2 / 3' && cl.filled === 2), `the captain lost: 2 / 3, the captain not counted alive (${JSON.stringify(cl)})`);
    await page.context().close();
  }
  console.log('— combat aim scale');
  {
    const page = await boot();
    await page.evaluate(() => { returnToHub(); enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001); });
    const visible = re => page.waitForFunction(src => { const c = document.getElementById('enc-choices'); return c && !c.classList.contains('held') && [...c.querySelectorAll('.enc-choice')].some(b => new RegExp(src).test(b.textContent) && +getComputedStyle(b).opacity > 0.9); }, re, { timeout: 30000 });
    const press = async re => { await visible(re); const h = await page.evaluateHandle(src => [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => new RegExp(src).test(b.textContent)), re); await h.asElement().click(); };
    await press('Open Fire');
    await visible('FIRE LASER'); await sleep(300);
    const r = await page.evaluate(() => {
      const sc = document.getElementById('screen-encounter'), cv = document.getElementById('combat-cursor-canvas');
      return { screenW: sc.offsetWidth, canvasCssW: cv.offsetWidth, canvasW: cv.width };
    });
    // The canvas sits at its natural 960 px from the screen's corner: one
    // layout pixel of the screen is one canvas pixel, whatever the frame does.
    ok(r.canvasCssW === r.canvasW, `the cursor canvas is drawn at its natural size (${r.canvasCssW} css px for ${r.canvasW}; screen ${r.screenW})`);
    await press('FIRE LASER'); await sleep(500);
    const crosshairAt = async (fx, fy) => {
      const target = await page.evaluate(([fx, fy]) => { const r = document.getElementById('screen-encounter').getBoundingClientRect(); return { x: Math.round(r.left + r.width * fx), y: Math.round(r.top + r.height * fy) }; }, [fx, fy]); // whole pixels: a mouse event's clientX is a whole pixel
      await page.mouse.move(target.x - 4, target.y - 4); await page.mouse.move(target.x, target.y); await sleep(250);
      const cc = await page.evaluate(() => {
        const c = document.getElementById('combat-cursor-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
        const r = c.getBoundingClientRect(); const s = r.width / c.width;
        // a pixel spans [x, x + 1): the drawn centre is (x0 + x1 + 1) / 2
        return x1 < 0 ? null : { x: r.left + (x0 + x1 + 1) / 2 * s, y: r.top + (y0 + y1 + 1) / 2 * s, s };
      });
      return { target, cc };
    };
    for (const [vw, vh] of [[1280, 800], [800, 600]]) {
      await page.setViewportSize({ width: vw, height: vh }); await sleep(400);
      // Far from the corner, where a 960-over-958 scale drifted ~2 px (a
      // window smaller than the frame scrolls — stay inside the view).
      const { target, cc } = vw < 960 ? await crosshairAt(0.78, 0.85) : await crosshairAt(0.95, 0.9);
      const err = cc ? Math.max(Math.abs(cc.x - target.x), Math.abs(cc.y - target.y)) / cc.s : 99; // in game pixels
      ok(err <= 0.75, `${vw}×${vh}: the crosshair is drawn under the pointer (off by ${err.toFixed(2)} game px; pointer ${target.x.toFixed(1)},${target.y.toFixed(1)}, drawn ${cc && cc.x.toFixed(1)},${cc && cc.y.toFixed(1)})`);
    }
    await page.context().close();
  }

  console.log('— page errors');
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
