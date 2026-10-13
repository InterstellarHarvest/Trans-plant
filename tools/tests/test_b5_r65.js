// Repeat cooldown (ruling 65): a repeatable event (once: false) can't fire
// again within the trail's repeat_cooldown_stops stops (map_rules.json).
// Pins N per trail from data, no recurrence inside the window and a
// recurrence after it, a SCAN lock-in still firing, the fallback when
// every eligible event is cooling down, during-wait interrupts, the
// real travel path recording the stop, and the history's save round-trip.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const REP = 'event_shipboard_018';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.map_rules && typeof selectEvent === 'function' && typeof EVENTS !== 'undefined' && Object.keys(EVENTS).length > 0);

  // A departed run on `trail` with a seeded Math.random, the ship at stop
  // `s` (visited = s stops, the current node not yet among them — the
  // moment a stop is drawn). draws(n, stop) draws n times at a fresh void
  // stop with the once/seen list and pity counter reset before each.
  await page.evaluate(() => {
    window.__r65 = {
      setup(trail) {
        localStorage.removeItem('transplant_save_v1');
        applySetupToState({ trail, ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'R' });
        STATE.stowaway = null; returnToHub();
        STATE.flags.add('departed');
        STATE.eventLastStop = {};
      },
      seed(s) { let a = s >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
      at(s) { STATE.visited = new Set(Array.from({ length: s }, (_, i) => 'r65_' + i)); return currentStop(); }, // the current node stays a real one, not yet visited
      node: { id: 'r65_stop', node_type: 'void', name: 'R65' },
      draws(n, stop) {
        const seen = new Set(STATE.seenEventIds);
        const ids = [];
        for (let i = 0; i < n; i++) {
          STATE.seenEventIds = new Set(seen); STATE.hardStreak = 0; STATE.pityRelief = 0;
          const ev = selectEvent(this.node, stop);
          ids.push(ev ? ev.id : null);
        }
        STATE.seenEventIds = seen;
        return ids;
      },
    };
  });

  console.log('— N per trail, from map_rules.json');
  {
    const r = await page.evaluate(() => Object.keys(MOD.map_rules.trails).map(trail => {
      __r65.setup(trail);
      return { trail, data: MOD.map_rules.trails[trail].repeat_cooldown_stops, engine: repeatCooldownStops() };
    }));
    for (const t of r) ok(Number.isInteger(t.data) && t.data > 0 && t.engine === t.data, `${t.trail}: repeat_cooldown_stops ${t.data} in data, ${t.engine} in the engine`);
    ok(r.find(t => t.trail === 'interstellar').data === 4, 'interstellar: 4 stops (the owner\'s number)');
    const swap = await page.evaluate(() => {
      __r65.setup('mars');
      const t = MOD.map_rules.trails.mars, keep = t.repeat_cooldown_stops;
      t.repeat_cooldown_stops = 2; const two = repeatCooldownStops();
      delete t.repeat_cooldown_stops; const none = repeatCooldownStops();
      t.repeat_cooldown_stops = keep;
      __r65.setup('lunar'); const lunar = repeatCooldownStops();
      return { two, none, lunar, lunarData: MOD.map_rules.trails.lunar.repeat_cooldown_stops };
    });
    ok(swap.two === 2 && swap.none === 0, `the engine follows the data: 2 when the trail says 2, 0 (no cooldown) when unauthored`);
    ok(swap.lunar === swap.lunarData, 'each trail reads its own value');
  }

  console.log('— a repeatable event can\'t recur within N stops, and can after');
  {
    const r = await page.evaluate((REP) => {
      __r65.setup('interstellar'); __r65.seed(65);
      const N = repeatCooldownStops();
      const out = { N, rep: EVENTS[REP] && !EVENTS[REP].once, eligible: eventEligible(EVENTS[REP], __r65.node, activeTriggers()) };
      out.by = {};
      for (let k = 0; k <= N + 2; k++) {
        const stop = __r65.at(10 + k);
        STATE.eventLastStop = { [REP]: 10 };
        const ids = __r65.draws(300, stop);
        out.by[k] = { hits: ids.filter(id => id === REP).length, empty: ids.filter(id => !id).length, fallback: STATE._lastDraw.fallback };
      }
      // Never drawn: no cooldown at all.
      STATE.eventLastStop = {};
      out.fresh = __r65.draws(300, __r65.at(12)).filter(id => id === REP).length;
      // The cooldown leaves once:true events alone (seenEventIds owns them).
      const onceEv = Object.values(EVENTS).find(e => e.once && eventEligible(e, __r65.node, activeTriggers()));
      STATE.eventLastStop = { [onceEv.id]: 12 };
      out.onceHits = __r65.draws(400, __r65.at(12)).filter(id => id === onceEv.id).length;
      return out;
    }, REP);
    ok(r.rep && r.eligible, `${REP} is repeatable and eligible at a void stop`);
    for (let k = 1; k <= r.N; k++) ok(r.by[k].hits === 0 && r.by[k].empty === 0, `drawn at stop 10 → stop ${10 + k} (${k} later): 0 of 300 draws (no empty stops)`);
    ok(r.by[0].hits === 0, 'the same stop again: 0 of 300');
    ok(r.by[r.N + 1].hits > 0, `stop ${10 + r.N + 1} (${r.N + 1} later): back in the pool (${r.by[r.N + 1].hits} of 300)`);
    ok(r.by[r.N + 2].hits > 0, `stop ${10 + r.N + 2}: still in the pool (${r.by[r.N + 2].hits} of 300)`);
    ok(r.fresh > 0, `never drawn this run: in the pool (${r.fresh} of 300)`);
    ok(r.onceHits > 0, `a once:true event isn't held back by a stray history entry (${r.onceHits} of 400)`);
  }

  console.log('— the real stop path records the stop');
  {
    const r = await page.evaluate(() => {
      __r65.setup('interstellar'); __r65.seed(7);
      const rec = [];
      for (let i = 0; i < 6 && !STATE.ended; i++) {
        const next = connectionsOf(STATE.byId[STATE.currentId]).find(id => STATE.byId[id] && connectionsOf(STATE.byId[id]).length);
        if (!next) break;
        STATE.flags.add('chose_alpha');
        const before = currentStop();
        travelTo(next, {});
        const ev = STATE.currentEvent;
        const drawn = STATE.stationVisit && STATE.stationVisit.node === next ? STATE.stationVisit.roomEv : ev && ev.id;
        rec.push({ stop: currentStop(), before, drawn, once: drawn ? !!EVENTS[drawn].once : null, last: drawn ? STATE.eventLastStop[drawn] : null });
        STATE.currentEvent = null; STATE.stationVisit = null; STATE.outcomeMode = false;
        STATE.visited.add(STATE.currentId);
      }
      return rec;
    });
    ok(r.length >= 4, `flew ${r.length} stops`);
    ok(r.every(x => x.stop === x.before + 1), 'each leg moves the stop count on by one');
    const reps = r.filter(x => x.drawn && !x.once);
    ok(reps.every(x => x.last === x.stop), `every repeatable stop event is recorded at its stop (${reps.map(x => x.drawn.replace('event_', '') + '@' + x.stop).join(', ') || 'none drawn'})`);
    ok(r.filter(x => x.drawn && x.once).every(x => x.last == null), 'once:true events stay out of the history');
  }

  console.log('— SCAN: a locked-in event still fires; a scan never locks one into back-to-back stops');
  {
    const r = await page.evaluate((REP) => {
      __r65.setup('interstellar'); __r65.seed(11);
      // Fly to a stop whose next stop is an ordinary (non-fork, non-station,
      // non-destination) node.
      let next = null;
      for (let i = 0; i < 12; i++) {
        const cand = connectionsOf(STATE.byId[STATE.currentId]).map(id => STATE.byId[id]);
        const n = cand.find(n => n && n.node_type !== 'fork' && n.node_type !== 'station' && connectionsOf(n).length);
        if (n && i > 0) { next = n; break; }
        STATE.visited.add(STATE.currentId); STATE.currentId = cand[0].id;
      }
      const here = currentStop();
      STATE.eventLastStop = { [REP]: here }; // fired here: on cooldown at the next stop
      const gapNext = repeatGaps(here + 1)(EVENTS[REP]);
      STATE.scouted = { [next.id]: { ev: REP, intel: false } };
      STATE.visited.add(STATE.currentId);
      travelTo(next.id, {});
      const fired = STATE.currentEvent && STATE.currentEvent.id;
      const out = { gapNext, N: repeatCooldownStops(), fired, last: STATE.eventLastStop[REP], stop: currentStop() };
      STATE.currentEvent = null;
      // A lock-in one stop ahead holds the event back from a draw two
      // stops ahead (and from the stop after the ship arrives there).
      STATE.visited.add(STATE.currentId);
      STATE.eventLastStop = {};
      const ahead = connectionsOf(STATE.byId[STATE.currentId]).find(id => STATE.byId[id] && connectionsOf(STATE.byId[id]).length);
      const beyond = ahead && connectionsOf(STATE.byId[ahead]).find(id => STATE.byId[id]);
      STATE.scouted = { [ahead]: { ev: REP, intel: false } };
      const h2 = currentStop();
      const node2 = STATE.byId[beyond];
      const seen = new Set(STATE.seenEventIds); let hits = 0, eligible = eventEligible(EVENTS[REP], node2, activeTriggers());
      for (let i = 0; i < 300; i++) { STATE.seenEventIds = new Set(seen); STATE.hardStreak = 0; STATE.pityRelief = 0; const ev = selectEvent(node2, h2 + 2); if (ev && ev.id === REP) hits++; }
      out.aheadGap = repeatGaps(h2 + 2)(EVENTS[REP]); out.aheadHits = hits; out.aheadEligible = eligible;
      // A lock on a branch the ship can no longer reach doesn't count.
      STATE.scouted = { r65_elsewhere: { ev: REP, intel: false } };
      out.strayGap = repeatGaps(h2 + 2)(EVENTS[REP]);
      STATE.scouted = {};
      return out;
    }, REP);
    ok(r.gapNext <= r.N, `${REP} fired at this stop is on cooldown at the next (gap ${r.gapNext} ≤ ${r.N})`);
    ok(r.fired === REP, `…but SCAN locked it in there: it fires anyway (fired ${r.fired})`);
    ok(r.last === r.stop, 'and its cooldown restarts from that stop');
    ok(r.aheadEligible && r.aheadGap === 1 && r.aheadHits === 0, `a lock-in at the next stop keeps it out of the draw for the stop after (gap ${r.aheadGap}, ${r.aheadHits} of 300)`);
    ok(r.strayGap === Infinity, 'a lock on an unreachable node is ignored');
  }

  console.log('— the fallback: everything eligible is cooling down');
  {
    const r = await page.evaluate(() => {
      __r65.setup('lunar'); __r65.seed(3);
      const stop = __r65.at(20);
      const node = __r65.node, trig = activeTriggers();
      // Every once:true event already seen: the pool is repeatables only.
      for (const e of Object.values(EVENTS)) if (e.once) STATE.seenEventIds.add(e.id);
      const pool = Object.values(EVENTS).filter(e => eventEligible(e, node, trig));
      const out = { size: pool.length, allRep: pool.every(e => !e.once) };
      // All drawn last stop, but two drawn three stops ago: least recent.
      const oldest = [pool[0].id, pool[pool.length - 1].id];
      STATE.eventLastStop = {};
      for (const e of pool) STATE.eventLastStop[e.id] = stop - 1;
      for (const id of oldest) STATE.eventLastStop[id] = stop - 3;
      const ids = __r65.draws(200, stop);
      out.nulls = ids.filter(x => !x).length;
      out.onlyOldest = ids.every(id => oldest.includes(id));
      out.both = oldest.every(id => ids.includes(id));
      out.fallback = STATE._lastDraw.fallback;
      // One event off cooldown: it wins outright, no fallback.
      STATE.eventLastStop[pool[1].id] = stop - 9;
      const ids2 = __r65.draws(50, stop);
      out.single = ids2.every(id => id === pool[1].id); out.fallback2 = STATE._lastDraw.fallback;
      return out;
    });
    ok(r.size >= 3 && r.allRep, `pool of ${r.size} repeatables, every one inside the window`);
    ok(r.nulls === 0, 'no draw comes up empty');
    ok(r.onlyOldest && r.both, 'the draw falls back to the least recently drawn (both tied oldest turn up, nothing else)');
    ok(r.fallback === true, 'and says so (STATE._lastDraw.fallback)');
    ok(r.single && r.fallback2 === false, 'one event off cooldown is drawn without the fallback');
  }

  console.log('— during-wait interrupts respect the cooldown');
  {
    const r = await page.evaluate(() => {
      __r65.setup('interstellar'); __r65.seed(5);
      let n = null;
      for (let i = 0; i < 12; i++) {
        const cand = connectionsOf(STATE.byId[STATE.currentId]).map(id => STATE.byId[id]);
        n = cand.find(x => x && ['planet', 'derelict', 'asteroid_field', 'anomaly', 'nebula', 'void'].includes(x.node_type));
        if (n) break;
        STATE.visited.add(STATE.currentId); STATE.currentId = cand[0].id;
      }
      STATE.visited.add(STATE.currentId); STATE.currentId = n.id; STATE.visited.add(n.id); // at the hub of an ordinary stop
      const here = currentStop();
      const picks = k => { const c = {}; for (let i = 0; i < 200; i++) { const p = cruiseWaitEventPick(); const id = p ? p.ev : null; c[id] = (c[id] || 0) + 1; } return c; };
      const free = picks();
      STATE.eventLastStop = { event_encounter_pirate_001: here - 1 };
      const held = picks();
      STATE.eventLastStop = { event_encounter_pirate_001: here - 1 - repeatCooldownStops() };
      const after = picks();
      return { free: free.event_encounter_pirate_001 || 0, held: held.event_encounter_pirate_001 || 0, after: after.event_encounter_pirate_001 || 0 };
    });
    ok(r.free > 0, `pirate interrupts with no history (${r.free} of 200)`);
    ok(r.held === 0, 'pirate fired at the stop before: no pirate interrupt (0 of 200)');
    ok(r.after > 0, `pirate fired N+1 stops back: interrupts again (${r.after} of 200)`);
  }

  console.log('— the history saves and loads; old saves load empty');
  {
    const r = await page.evaluate((REP) => {
      __r65.setup('mars');
      STATE.eventLastStop = { [REP]: 3, event_station_002: 5 };
      saveRun();
      const raw = JSON.parse(localStorage.getItem('transplant_save_v1'));
      STATE.eventLastStop = { junk: 1 };
      loadRun();
      const back = JSON.stringify(STATE.eventLastStop);
      // A save from before the field existed.
      delete raw.eventLastStop;
      localStorage.setItem('transplant_save_v1', JSON.stringify(raw));
      STATE.eventLastStop = { leftover: 9 };
      loadRun();
      const old = JSON.stringify(STATE.eventLastStop);
      // A new run starts empty.
      STATE.eventLastStop = { leftover: 9 };
      applySetupToState({ trail: 'lunar', ai: 'marv', captain: 'veteran', crew: ['engineer'], crop: 'wheat', ship: 'R' });
      const fresh = JSON.stringify(STATE.eventLastStop);
      localStorage.removeItem('transplant_save_v1');
      return { inSave: SAVED_FIELDS.includes('eventLastStop'), back, old, fresh };
    }, REP);
    ok(r.inSave, 'eventLastStop is a saved field');
    ok(r.back === JSON.stringify({ [REP]: 3, event_station_002: 5 }), `round-trip keeps the history (${r.back})`);
    ok(r.old === '{}', `an old save loads with an empty history (${r.old})`);
    ok(r.fresh === '{}', 'a new run starts with an empty history');
  }

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
