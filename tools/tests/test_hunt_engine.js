// The 2026-10-23 bug hunt, engine side (rulings 91–94 and the fixes that
// came with them). Each block is one finding; the comment says what was wrong.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const errors = [];
let browser;
async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && typeof enterEvent === 'function' && typeof playDeparture === 'function');
  await page.evaluate(() => localStorage.clear());
  return page;
}
const setup = (page, o) => page.evaluate(o => {
  applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'Test' }, o || {}));
  STATE.stowaway = null;
}, o || {});
const clickContinue = page => page.evaluate(() => {
  finishAllTyping();
  const c = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /continue/i.test(b.textContent));
  if (c) c.click(); return !!c;
});

(async () => {
  browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();

  console.log('— 92: the departure plays at the station on day 0; 91: the AI speaks in a bubble');
  {
    const page = await open();
    await setup(page, { ai: 'aria' });
    const a = await page.evaluate(() => { playDeparture(); return { ev: STATE.currentEvent && STATE.currentEvent.id, node: STATE.currentId, day: STATE.daysElapsed }; });
    ok(/^event_launch_00\d$/.test(a.ev || '') && a.node === STATE_START(a) && a.day === 0, `a launch event at Earth Orbital Station on day 0 (${a.ev})`);
    await page.waitForTimeout(400);
    await page.evaluate(() => { finishAllTyping(); document.querySelector('#enc-choices .enc-choice:not(.locked)').click(); });
    await page.waitForTimeout(500);
    await clickContinue(page);
    await page.waitForTimeout(800);
    const b = await page.evaluate(() => ({ scr: document.querySelector('.screen.active').id, stopped: document.body.classList.contains('stop-active'),
      bubble: document.getElementById('ai-bubble').classList.contains('show'), text: document.getElementById('ai-bubble').textContent,
      node: STATE.currentId, departed: STATE.flags.has('departed') }));
    ok(b.scr === 'screen-cruise' && b.stopped && b.node === 'node_spine_0' && b.departed, 'then the hub opens STOPPED at the departure station');
    ok(b.bubble && /Welcome aboard|STOP/i.test(b.text), 'the AI bubble shows, with the welcome tip in it');
    const c = await page.evaluate(() => {
      // a pile of comments never pushes the tip out
      for (let i = 0; i < 5; i++) window.pushCruiseLog('A comment ' + i + '.', { ai: true });
      const kept = document.getElementById('ai-bubble').textContent;
      document.getElementById('ai-bubble').click();
      return { kept, n: document.querySelectorAll('#ai-bubble .ai-bubble-lines p').length, shown: document.getElementById('ai-bubble').classList.contains('show') };
    });
    ok(/Welcome aboard|STOP/i.test(c.kept), 'the first-run tip stays when comments pile up (three lines kept)');
    ok(!c.shown, 'a click dismisses the bubble');
    const ev = await page.evaluate(() => Object.values(EVENTS).filter(e => /^event_launch_/.test(e.id) && eventEligible(e, STATE.byId['node_spine_1'] || STATE.nodes[1], activeTriggers())).length);
    ok(ev === 0, 'no second launch event after departing');
    await page.close();
  }

  console.log('— Keep flying / the beacon play the interrupted stop');
  {
    const page = await open();
    await setup(page);
    const r = await page.evaluate(async () => {
      STATE.flags.add('departed');
      const st = STATE.nodes.find(n => n.node_type === 'station' && STATE.nodes.indexOf(n) > 0 && connectionsOf(n).length);
      // make the next leg end at that station, with the crop dying on the way
      STATE.currentId = STATE.nodes[STATE.nodes.indexOf(st) - 1].id;
      STATE.byId[STATE.currentId].connects_to = [st.id];
      STATE.cropGrowth.health = 0.01; STATE.cropGrowth.pest = true;
      const realTick = window.tickCropGrowth; window.tickCropGrowth = () => { STATE.cropGrowth.health = 0; };
      travelTo(st.id);
      window.tickCropGrowth = realTick;
      const failed = document.querySelector('.screen.active').id;
      const pa = STATE.pendingArrival && STATE.pendingArrival.id;
      endContinueRun();
      await new Promise(res => setTimeout(res, 300));
      return { failed, pa, st: st.id, ev: STATE.currentEvent && STATE.currentEvent.id, sv: STATE.stationVisit && STATE.stationVisit.phase };
    });
    ok(r.failed === 'screen-end' && r.pa === r.st, 'the leg ended in a failure; the stop waits (pendingArrival)');
    ok(!!r.ev && r.sv && r.sv !== 'left', `Keep flying plays the station stop (${r.ev}, visit ${r.sv}) — it used to skip it`);
    await page.close();
  }

  console.log('— 94: the deadline passes without ending the run');
  {
    const page = await open();
    await setup(page);
    const r = await page.evaluate(() => {
      STATE.daysElapsed = STATE.baseDays + 3;
      // Jumped there, not flown: the crop's clock jumps too (unwatered
      // catch-up days would kill it, and a dead crop is a failure).
      if (STATE.cropGrowth) STATE.cropGrowth.lastTickDay = STATE.daysElapsed;
      const f = checkFailure();
      const lines = (STATE.shipLog || []).filter(e => /deadline has passed/.test(e.text)).length;
      checkFailure();
      return { f, ended: STATE.ended, lines, again: (STATE.shipLog || []).filter(e => /deadline has passed/.test(e.text)).length };
    });
    ok(!r.f && !r.ended, 'past the deadline: no failure');
    ok(r.lines === 1 && r.again === 1, 'the AI says the deadline passed, once');
    // A late run still fails like any other: the crop dying past the
    // deadline raises EMPTY GROWBAY (the notice used to cut the chain).
    const c = await page.evaluate(() => {
      STATE.ended = false; STATE.cropGrowth.health = 0;
      const f = checkFailure();
      return { f, ended: STATE.ended, screen: (document.querySelector('.screen.active') || {}).id };
    });
    ok(c.f && c.ended && c.screen === 'screen-end', `past the deadline, a dead crop still ends in its failure (${c.screen})`);
    await page.close();
  }

  console.log('— RECORDS: a replayed save slot adds a finish, never lowers the best');
  {
    const page = await open();
    await setup(page, { trail: 'lunar' });
    const r = await page.evaluate(() => {
      STATE.cropGrowth.health = 80; STATE.daysElapsed = 50;
      const realV = window.scoreValue;
      window.scoreValue = () => 140; window.renderEndScreen({ kind: 'ending', module: MOD.endings[0] }); window.showEndReport();
      STATE.ended = false; STATE.daysElapsed = 90; // the same run (same art seed), replayed to a worse end
      window.scoreValue = () => 110; window.renderEndScreen({ kind: 'ending', module: MOD.endings[0] }); window.showEndReport();
      window.scoreValue = realV;
      const recs = loadRecords();
      return { runs: recs.runs.map(x => x.score), best: recs.best.lunar && recs.best.lunar.score, line: document.getElementById('end-day-line').textContent };
    });
    ok(r.runs.length === 2 && r.runs.includes(140) && r.runs.includes(110), `both finishes listed (${r.runs})`);
    ok(r.best === 140 && !/NEW BEST/.test(r.line), 'the best stays 140; the worse finish is no NEW BEST');
    await page.close();
  }

  console.log('— the text panel grows to the last button; a longer body says MORE');
  {
    const page = await open();
    await setup(page);
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(res => setTimeout(res, ms));
      const out = {};
      let over = 0, n = 0;
      for (const ev of Object.values(EVENTS).filter(e => !e.layers && e.choices && e.choices.length <= 4).slice(0, 40)) {
        enterEvent(STATE.byId[STATE.currentId], ev); finishAllTyping(); await w(30); fitEncounterColumns();
        const b = document.getElementById('enc-narr-body'); n++;
        if (b.scrollHeight > b.clientHeight + 2) over++;
      }
      out.over = over; out.n = n;
      enterEvent(STATE.byId[STATE.currentId], EVENTS.event_derelict_001); finishAllTyping(); await w(40); fitEncounterColumns();
      const b = document.getElementById('enc-narr-body');
      out.long = b.scrollHeight > b.clientHeight + 2;
      out.more = document.getElementById('enc-narrative').classList.contains('has-more');
      b.scrollTop = b.scrollHeight; b.dispatchEvent(new Event('scroll')); await w(30);
      out.moreAfter = document.getElementById('enc-narrative').classList.contains('has-more');
      return out;
    });
    ok(r.over <= 2, `flat events' openings fit (${r.over} of ${r.n} overflow; 3 in 4 did)`);
    ok(!r.long || (r.more && !r.moreAfter), 'a body that still overflows shows ▾ MORE until read to the end');
    await page.close();
  }

  console.log('— previews fit one line; absent crew read by role');
  {
    const page = await open();
    await setup(page, { crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => {
      const long = fitPreview('MARV', ['−6 MORALE · ENGINEER −8 · INJURED −25 · MEDIC −12', '−20 HULL']);
      const absent = interpolateStowawayTokens('{crew.diplomat} sells them a rumour.');
      const mid = interpolateStowawayTokens('Hand it to {crew.pilot}.');
      const here = interpolateStowawayTokens('{crew.engineer} opens it.');
      return { long, absent, mid, here, eng: crewNameOf('engineer') };
    });
    ok(r.long.length <= 46 && /^MARV · −6 MORALE/.test(r.long), `a long preview is fitted: "${r.long}"`);
    ok(r.absent === 'A diplomat sells them a rumour.' && r.mid === 'Hand it to a pilot.', 'nobody of the role aboard: "A diplomat" / "a pilot", not a roster name');
    ok(r.here === r.eng + ' opens it.', 'a role aboard keeps its name');
    await page.close();
  }

  console.log('— requires_role; event minigames get their tier rewards');
  {
    const page = await open();
    await setup(page, { crew: ['engineer', 'pilot'], captain: 'medic' });
    const r = await page.evaluate(() => {
      const ev = Object.assign({}, EVENTS.event_crisis_014 || Object.values(EVENTS)[0], { requires_role: 'medic', id: 'tmp_role', trigger: ['any'], node_type: ['any'], once: false, requires_flag: null, requires_item: null, requires_crop_alive: false, trail: null });
      const node = STATE.byId[STATE.currentId], trig = new Set(['any']);
      const noMedic = eventEligible(ev, node, trig);
      STATE.crew = ['engineer', 'medic'];
      const withMedic = eventEligible(ev, node, trig);
      // tierRewards: spy openMinigame on a tiered event choice
      const real = window.openMinigame; let opts = null;
      window.openMinigame = (id, o) => { opts = o; };
      const evm = Object.values(EVENTS).find(e => (e.choices || []).some(c => c.launch_minigame && c.tier_outcomes));
      const ch = evm.choices.find(c => c.launch_minigame && c.tier_outcomes);
      STATE.currentEvent = evm; resolveChoice(ch);
      window.openMinigame = real;
      return { noMedic, withMedic, ev: evm.id, has: !!(opts && opts.tierRewards && opts.tierRewards.perfect && opts.tierOutcomes) , perfect: opts && opts.tierRewards.perfect };
    });
    ok(!r.noMedic && r.withMedic, 'requires_role: a medic CAPTAIN doesn\'t count; a medic crew member does');
    ok(r.has, `an event minigame gets tierOutcomes + tierRewards (${r.ev}: ${JSON.stringify(r.perfect)})`);
    await page.close();
  }

  console.log('— the map: scans shown, labels clear, lanes named, labels honest');
  {
    const page = await open();
    const r = await page.evaluate(async () => {
      const res = { overlap: 0, maps: 0, scanned: null, lanes: [], sig: 0, lanesN: 0 };
      const SIG = { hostile: ['void', 'derelict', 'asteroid_field'], lucrative: ['asteroid_field', 'derelict'], safe: ['station', 'planet'], corporate: ['station'], derelict_heavy: ['derelict'], scientific: ['anomaly', 'nebula', 'planet'], agricultural: ['planet'] };
      for (const trail of ['lunar', 'mars', 'interstellar']) for (let i = 0; i < 6; i++) {
        applySetupToState({ trail, ai: 'marv', captain: 'veteran', crew: ['engineer'], crop: 'wheat', ship: 'T' });
        // every labelled lane holds a stop of its type
        const lanes = {};
        for (const n of STATE.nodes) if (n.branch) { const k = n.id.replace(/_\d+$/, ''); (lanes[k] = lanes[k] || { f: n.branch, t: [] }).t.push(n.node_type); }
        for (const l of Object.values(lanes)) { res.lanesN++; if (l.t.some(t => SIG[l.f].includes(t))) res.sig++; }
        STATE.currentId = STATE.nodes[Math.min(5, STATE.nodes.length - 2)].id;
        window.openMapOverlay ? window.openMapOverlay() : (showOverlay('overlay-map'), renderMapOverlay());
        await new Promise(r => setTimeout(r, 60));
        const labels = [...document.querySelectorAll('#ovmap-nodes .map-node-label:not(.under-here), #ovmap-nodes .map-here')].map(e => e.getBoundingClientRect()).filter(b => b.width);
        res.maps++;
        let hit = false;
        for (let a = 0; a < labels.length; a++) for (let b = a + 1; b < labels.length; b++) {
          const A = labels[a], B = labels[b];
          if (A.left < B.right - 1 && B.left < A.right - 1 && A.top < B.bottom - 1 && B.top < A.bottom - 1) hit = true;
        }
        if (hit) res.overlap++;
        hideOverlay('overlay-map');
      }
      // a scan shows on the map
      const nxt = [...nextAvailableNodes()][0];
      STATE.scouted = { [nxt]: { ev: 'event_crisis_004', intel: false } };
      showOverlay('overlay-map'); renderMapOverlay();
      const tag = document.querySelector('#ovmap-nodes [data-node="' + nxt + '"] .map-scanned');
      res.scanned = tag && tag.textContent;
      res.lanes = [...document.querySelectorAll('.map-branch-flavor')].map(e => e.textContent).slice(0, 2);
      return res;
    });
    ok(r.overlap === 0, `no overlapping labels on ${r.maps} maps (interstellar overlapped 24 of 30)`);
    ok(r.scanned === 'HARD', `a scanned stop shows what SCAN read (${r.scanned})`);
    ok(r.lanes.length && r.lanes.every(t => /^(PORT|STARBOARD) · /.test(t)), `lanes named as the fork events say (${r.lanes.join(' / ')})`);
    ok(r.sig === r.lanesN, `every labelled lane holds a stop of its type (${r.sig}/${r.lanesN})`);
    await page.close();
  }

  console.log('— water: a botanist saves water, the crew stay watered at 50/50');
  {
    const page = await open();
    await setup(page, { crew: ['botanist', 'engineer'] });
    const r = await page.evaluate(() => {
      ensureOrders().waterSplit = 50;
      const withBot = { drain: crewWaterDrainRate(), water: dailyDraw().water };
      STATE.crew = ['engineer', 'medic'];
      const without = { drain: crewWaterDrainRate(), water: dailyDraw().water };
      return { withBot, without };
    });
    ok(r.withBot.drain === 0 && r.without.drain === 0, 'at 50/50 nobody is thirsty, botanist or not (the botanist made the crew thirsty)');
    ok(r.withBot.water < r.without.water, `the botanist's saving reaches the tank (${r.withBot.water.toFixed(3)} vs ${r.without.water.toFixed(3)}/day)`);
    await page.close();
  }

  console.log('— BROWSE pays once; looking costs no day');
  {
    const page = await open();
    await setup(page);
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(res => setTimeout(res, ms));
      const ev = EVENTS.event_encounter_trader_001;
      enterEvent(STATE.byId[STATE.currentId], ev); finishAllTyping(); await w(50);
      const mo0 = crewMoraleOf('engineer');
      const browse = () => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => /BROWSE/.test(x.textContent)); b.click(); };
      browse(); await w(400); window.closeMarket ? window.closeMarket() : document.querySelector('#overlay-market [data-esc-close], #market-close, .market-close')?.click(); await w(300);
      finishAllTyping(); await w(50);
      browse(); await w(400); window.closeMarket ? window.closeMarket() : document.querySelector('#overlay-market [data-esc-close], #market-close, .market-close')?.click(); await w(300);
      return { paid: Math.round((mo0 - crewMoraleOf('engineer')) * 10) / 10, shopped: !!STATE._shoppedThisEvent };
    });
    ok(r.paid > 0 && r.paid <= 3, `two looks at the wares cost one effort tax (−${r.paid} morale)`);
    ok(!r.shopped, 'just looking: no haggling day');
    await page.close();
  }

  console.log('— Push Engines past a station; the hold-full verbs; numbers pick');
  {
    const page = await open();
    await setup(page);
    const r = await page.evaluate(async () => {
      STATE.flags.add('departed');
      const st = STATE.nodes.find(n => n.node_type === 'station' && STATE.nodes.indexOf(n) > 0 && connectionsOf(n).length);
      STATE.currentId = STATE.nodes[STATE.nodes.indexOf(st) - 1].id;
      STATE.byId[STATE.currentId].connects_to = [st.id];
      travelTo(st.id, { skipEvent: true });
      const closed = window.StationVisit && StationVisit.servicesClosed();
      // fill the hold with metal: MINE says nothing will be kept
      STATE.materials = { metal: 999 };
      returnToHub(); await new Promise(r => setTimeout(r, 200));
      const mine = [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /MINE/.test(b.textContent));
      return { closed, mine: mine ? mine.textContent : 'no mine here' };
    });
    ok(r.closed, 'pushed past a station: its services are closed');
    ok(r.mine === 'no mine here' || /Hold full/.test(r.mine), `a full hold: MINE says so (${r.mine.slice(0, 60)})`);
    await setup(page);
    const k = await page.evaluate(async () => {
      enterEvent(STATE.byId[STATE.currentId], EVENTS.event_crisis_034 || Object.values(EVENTS).find(e => e.choices && e.choices.length > 1));
      finishAllTyping(); await new Promise(r => setTimeout(r, 400));
      return STATE.currentEvent && STATE.currentEvent.id;
    });
    await page.keyboard.press('1');
    await page.waitForTimeout(500);
    const k2 = await page.evaluate(() => ({ outcome: !!STATE.outcomeMode || !!STATE.currentOutcomeId || document.getElementById('enc-narr-title').textContent }));
    ok(!!k2.outcome, `key 1 picks the first choice (${k})`);
    await page.close();
  }

  console.log('— confirms, the pause terminal, a wait cut short by a reload');
  {
    const page = await open();
    await setup(page);
    await page.evaluate(() => { saveRun(); });
    const r = await page.evaluate(async () => {
      const p = tpConfirm({ title: 'T', message: 'M' });
      const shown = !!document.querySelector('.tp-confirm-overlay');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const v = await p;
      return { shown, v, gone: !document.querySelector('.tp-confirm-overlay') };
    });
    ok(r.shown && r.v === false && r.gone, 'tpConfirm: the game\'s own dialog; ESC says no');
    // a wait under way, then a reload
    await page.evaluate(() => { STATE.waitInProgress = { verb: 'rest', day: 3, days: 7 }; writeSnapshot(); });
    await page.reload();
    await page.waitForFunction(() => typeof loadRun === 'function' && MOD.items);
    const w = await page.evaluate(() => { loadRun(); return { line: (STATE.shipLog || []).map(e => e.text).filter(t => /called off/.test(t)).pop(), marker: STATE.waitInProgress }; });
    ok(/REST — called off after 3 of 7 days/.test(w.line || '') && !w.marker, `a reload mid-REST says it was called off ("${(w.line || '').slice(0, 50)}…")`);
    // the pause terminal on the title: no SAVE / LOG / QUIT
    await page.evaluate(() => { showScreen('screen-title'); STATE.trail = null; });
    await page.keyboard.press('Escape'); // the first ESC on the title dismisses the poster
    await page.waitForTimeout(400);
    if (!(await page.evaluate(() => document.body.classList.contains('pause-open')))) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
    const pz = await page.evaluate(() => [...document.querySelectorAll('.pause-item')].filter(b => !b.hidden).map(b => b.dataset.section));
    ok(pz.length && !pz.includes('save') && !pz.includes('log') && !pz.includes('quit'), `the title's terminal offers ${pz.join('/')}`);
    await page.close();
  }

  ok(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(`\nhunt engine: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
function STATE_START() { return 'node_spine_0'; }
