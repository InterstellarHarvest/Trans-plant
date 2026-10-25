'use strict';
// Economy simulator: drives many full runs in-page with policies.
// Hunt 5 (2026-10-10): realistic mining yields (13±, measured from the real
// minigame), station shopping (policy suffix :shop), mining runs per visit
// (policy suffix :N), a per-cause resource ledger, and a verb sampler policy.
// :salvage salvages once at every stop that offers it; :farm mines once at
// every asteroid field, nebula and derelict.
// Every policy but random provisions: with water or food under 40 it buys
// water canisters / ration bricks back up to 60 at a station (no selling),
// seeks a lane trader for them, and takes its market's shelf; it also
// takes crop_dead's "Keep flying". :shop is the full market visit on top
// of that: at every station it sells spare materials and trade goods and
// tops fuel, food and water up to its targets whatever they stand at.
// usage: node sim.js <runsPerCell> <policies,comma> <trails,comma> [outfile]
const { chromium } = require('playwright');
const fs = require('fs');
const RUNS = parseInt(process.argv[2] || '10', 10);
const POLICIES = (process.argv[3] || 'random,greedy,stopper').split(',');
const TRAILS = (process.argv[4] || 'lunar,mars,interstellar').split(',');
const OUT = process.argv[5] || __dirname + '/results.json';
const URL = process.env.SIM_URL || 'http://localhost:8177/index.html?debug=econ';

const CAPTAINS = ['botanist', 'engineer', 'medic', 'pilot', 'chef', 'xenobiologist', 'diplomat', 'merchant', 'academic', 'veteran'];
const CREWPOOL = ['botanist', 'engineer', 'medic', 'pilot', 'chef', 'xenobiologist', 'diplomat'];
const CROPS = ['wheat', 'tomato', 'sweet_potato', 'soybean', 'zinnia'];
const pick = a => a[Math.floor(Math.random() * a.length)];

function installHarness(policy) {
  /* eslint-disable no-undef */
  const P = policy.split(':')[0];
  window.__pol = P; window.__mineRuns = +(policy.split(':')[1] || 1); window.__shop = policy.includes(':shop'); window.__farm = policy.includes(':farm'); window.__salvage = policy.includes(':salvage');
  const T = () => { const r = Math.random(); return r < 0.3 ? 'perfect' : r < 0.7 ? 'good' : r < 0.95 ? 'poor' : 'abandoned'; };
  const S = window.__stats = {
    forageFood: 0, harvests: 0, harvestFood: 0, harvestMorale: 0, verbs: {}, events: 0, eventDays: 0, verbDays: 0, travelDays: 0,
    travelFuel: 0, mins: { fuel: 999, food: 999, water: 999, o2: 999, hull: 999, morale: 999 }, itemUses: {}, goldMax: 0,
    goldIn: 0, goldOut: 0, floats: [], nan: [], combat: 0, traderBuys: 0, medbay: 0, eventIds: [], resDelta: {}, lockedGold: 0,
    deprivedDays: 0, pests: 0, cropDeadAt: null, fuelBought: 0, matsGained: 0, eventFrac: [],
    fires: [], draws: 0, fallbacks: 0, fallbackIds: [], maxScheduleGap: -1, schedule: [],
  };
  // Every event entry with the stop it happened at ([id, stop]; a dock room
  // re-entered is one entry per stop in the analysis), and how many pool
  // draws fell back to the least recently drawn event (the repeat cooldown).
  const realEnter = window.enterEvent;
  window.enterEvent = function (node, ev, ...rest) {
    const v = STATE.visited;
    if (ev) S.fires.push([ev.id, v ? v.size - (v.has(STATE.currentId) ? 1 : 0) : 0]);
    // Schedule gap (ruling 82's behind_schedule): days used minus trail flown, as shares; the worst point of the run.
    if (v && STATE.baseDays > 0 && typeof pathLegs === 'function') { S.maxScheduleGap = Math.max(S.maxScheduleGap, STATE.daysElapsed / STATE.baseDays - v.size / pathLegs()); S.schedule.push([Math.round(1000 * STATE.daysElapsed / STATE.baseDays) / 1000, Math.round(1000 * v.size / pathLegs()) / 1000]); }
    return realEnter(node, ev, ...rest);
  };
  const realSelect = window.selectEvent;
  window.selectEvent = function (...a) {
    const ev = realSelect(...a);
    if (ev) { S.draws++; if (STATE._lastDraw && STATE._lastDraw.fallback) { S.fallbacks++; S.fallbackIds.push(ev.id); } }
    return ev;
  };
  window.openMinigame = (id, opts, onDone) => {
    const tier = T();
    let payload = {};
    if (id === 'forage') payload = { food: tier === 'perfect' ? 55 : tier === 'good' ? 35 : 12, rare_drops: [], sickness: Math.random() < 0.15 ? [{ type: 'poisoning', severity: 'light' }] : [] };
    if (id === 'forage' && tier !== 'abandoned') S.forageFood += payload.food;
    onDone(tier, payload);
  };
  window.openMining = (onDone) => { const runs = window.__mineRuns || 1; const inv = {}; let tot = 0;
    for (let r = 0; r < runs; r++) { const n = Math.max(3, Math.round(13 + (Math.random() + Math.random() + Math.random() - 1.5) * 6)); for (let i = 0; i < n; i++) { const x = Math.random() * 17; const m = x < 6 ? 'minerals' : x < 12 ? 'scrap' : x < 15 ? 'metal' : x < 16 ? 'exotic' : 'biocomponent'; inv[m] = (inv[m] || 0) + 1; } tot += n; }
    S.matsGained += tot; S.mineVisits = (S.mineVisits || 0) + 1; onDone({ inventory: inv, runs }); };
  window.openEngineRepair = (onDone) => { const ok = Math.random() < 0.75; onDone({ fixedCount: ok ? 4 : 2, allFixed: ok }); };
  // One supply bought at the shelf price (items.json base_price × the
  // standing discount: what a station's and a lane trader's market both
  // charge), at most 8 per call, while want() holds and the hold has room.
  window.__buySupply = (id, base, want) => {
    const price = stationPrice(base); let n = 0;
    while (want() && STATE.goldAmount >= price && n < 8) {
      if (!grantItem(id)) break;
      window.__ctxTag = 'shopBuy:' + id; STATE.goldAmount -= price; window.__ctxTag = ''; n++;
      S.shopBuys = S.shopBuys || {}; S.shopBuys[id] = (S.shopBuys[id] || 0) + 1;
    }
    return n;
  };
  // Low on water or food (under 40, counting what's in the hold): buy it
  // back up to 60. Returns whether anything was short.
  window.__provision = () => {
    const R = STATE.resources, cnt = id => STATE.items.filter(x => x === id).length;
    const base = id => (itemDef(id) || {}).base_price;
    const low = (k, id) => R[k] + 10 * cnt(id) < 40;
    const short = low('water', 'water_canister') || low('food', 'ration_brick');
    if (low('water', 'water_canister')) window.__buySupply('water_canister', base('water_canister'), () => R.water + 10 * cnt('water_canister') < 60);
    if (low('food', 'ration_brick')) window.__buySupply('ration_brick', base('ration_brick'), () => R.food + 10 * cnt('ration_brick') < 60);
    if (short) S.provisions = (S.provisions || 0) + 1;
    return short;
  };
  // The market modal closes at once; a provisioning policy first takes
  // what it is short of off a station's or a lane trader's shelf (both
  // stock canisters and bricks; the black market and surplus bin don't).
  window.openMarket = (opts, onClose) => {
    opts = opts || {};
    if (window.__pol !== 'random' && !opts.sinister && opts.vendor !== 'surplus') window.__provision();
    if (onClose) onClose();
  };
  const realEnd = window.endRun;
  window.endRun = function (end) {
    window.__end = { kind: end.kind, type: end.module && end.module.failure_type, id: end.module && end.module.id, bracket: end.kind === 'ending' ? scoreBracket() : null, score: end.kind === 'ending' && typeof scoreValue === 'function' ? Math.round(scoreValue()) : null };
    return realEnd(end);
  };
  // The effort tax (ruling 98): the morale every crew member paid for
  // pips, on event choices and on Stop-menu jobs.
  S.effortTax = { event: 0, verb: 0 };
  const realTax = payEffortTax;
  payEffortTax = function (pips, receipt) { const t = realTax(pips, receipt); S.effortTax[window.__ctx === 'verb' ? 'verb' : 'event'] += t; return t; };
  window.payEffortTax = payEffortTax;
  const realPass = window.passDays;
  // passDays is called bare by inline code; wrap the global binding.
  window.__ctx = 'other';
  passDays = function (d, o) {
    const n = Math.max(0, Math.round(d));
    if (window.__ctx === 'event') S.eventDays += n; else if (window.__ctx === 'verb' || (window.cruiseWaitActive && cruiseWaitActive())) S.verbDays += n; else if (o && o.travel) S.travelDays += n;
    const before = STATE.resources.food;
    const r = realPass(d, o);
    for (const k of ['food', 'water', 'o2']) if (STATE.resources[k] <= 0) S.deprivedDays += n;
    return r;
  };
  window.passDays = passDays;
  // Cargo pressure (per-unit slot ruling 2026-10-11): pickups refused for
  // a full hold, and the fullest the hold got.
  const realGrant = grantItem;
  grantItem = function (id) { const ok = realGrant(id); if (!ok) { S.cargoRefused = (S.cargoRefused || 0) + 1; S.refusedIds = S.refusedIds || {}; S.refusedIds[id] = (S.refusedIds[id] || 0) + 1; } return ok; };
  window.grantItem = grantItem;
  // Materials are cargo too (owner ruling 2026-10-11): units left behind.
  if (typeof grantMaterials === 'function') {
    const realGM = grantMaterials;
    grantMaterials = function (want, opts) { const r = realGM(want, opts); for (const n of Object.values(r.left || {})) S.matLeft = (S.matLeft || 0) + n; if (Object.keys(r.left || {}).length) S.matRefusals = (S.matRefusals || 0) + 1; return r; };
    window.grantMaterials = grantMaterials;
  }
  const realChoices = renderChoicesInner;
  renderChoicesInner = function (choices) {
    const visible = choices.filter(ch => !(ch.requires_flag && !STATE.flags.has(ch.requires_flag)) && !(ch.hideFlag && STATE.flags.has(ch.hideFlag))); // requires_flag hides too (b4 ruling 36)
    window.__choices = visible.filter(ch => !lockReason(ch));
    window.__lockedGold = visible.filter(ch => lockReason(ch) && ch.gate && ch.gate.gold).length;
    return realChoices(choices);
  };
  const realApply = applyOutcomeEffects;
  applyOutcomeEffects = function (o) {
    const before = Object.assign({}, STATE.resources, { gold: STATE.goldAmount, morale: crewMoraleRaw() || 0 }); // morale: the crew average (owner ruling 15)
    const prev = window.__ctx; window.__ctx = 'event';
    const r = realApply(o);
    window.__ctx = prev;
    for (const k of Object.keys(before)) {
      const now = k === 'gold' ? STATE.goldAmount : k === 'morale' ? (crewMoraleRaw() || 0) : STATE.resources[k];
      const d = now - before[k];
      S.resDelta[k] = S.resDelta[k] || { pos: 0, neg: 0 };
      if (k === 'gold') { if (d > 0) S.goldIn += d; else S.goldOut -= d; }
      // exclude the passDays drain approx by only tracking authored deltas
      const authored = o && o.resources && Number.isFinite(o.resources[k]) ? o.resources[k] : 0;
      if (authored > 0) S.resDelta[k].pos += authored; else if (authored < 0) S.resDelta[k].neg += authored;
    }
    return r;
  };
}


function installLedger() {
  const S = window.__stats;
  S.ledger = {}; S.fuelTrace = []; S.goldTrace = [];
  const IGN = new Set(['set', 'clamp', 'Object.set', 'invAddRes', 'Array.forEach', 'Object.entries', 'eval', '']);
  const src = () => {
    const lines = (new Error().stack || '').split('\n').slice(3, 12);
    const names = lines.map(l => { const m = l.match(/at (?:async )?([^\s(]+)\s*\(/); return m ? m[1] : (/at http/.test(l) ? '<anon>' : ''); });
    const keep = names.filter(n => n && !IGN.has(n));
    return keep.slice(0, 3).join('<');
  };
  const add = (res, d) => {
    if (!d) return;
    const k = res + '|' + (window.__ctxTag || '') + '|' + src();
    const L = S.ledger[k] = S.ledger[k] || [0, 0, 0];
    if (d > 0) L[0] += d; else L[1] += d; L[2]++;
  };
  const R = STATE.resources; const store = Object.assign({}, R);
  for (const key of Object.keys(store)) {
    Object.defineProperty(R, key, { enumerable: true, configurable: true, get: () => store[key], set: v => {
      if (!Number.isFinite(v)) S.nan.push(key + '<-' + v + ' ' + src());
      const d = v - store[key]; store[key] = v; if (Math.abs(d) > 1e-9) add(key, d);
      if (v < 0) S.neg = (S.neg || []).concat([key + '=' + v + ' ' + src()]).slice(0, 5);
    } });
  }
  // Per-crew morale (owner ruling 15): STATE.crewMorale, every change
  // through addCrewMorale — the ledger books the crew-average change.
  const realAddMo = window.addCrewMorale;
  window.addCrewMorale = function (d, who) {
    const b = crewMoraleRaw(); const r = realAddMo(d, who); const a = crewMoraleRaw();
    if (b != null && a != null && Math.abs(a - b) > 1e-9) add('morale', a - b);
    return r;
  };
  const realDesert = window.crewDesertions;
  window.crewDesertions = function (node) { const gone = realDesert(node); S.desertions = (S.desertions || 0) + gone.length; return gone; };
  let g = STATE.goldAmount;
  Object.defineProperty(STATE, 'goldAmount', { enumerable: true, configurable: true, get: () => g, set: v => {
    if (!Number.isFinite(v)) S.nan.push('gold<-' + v + ' ' + src());
    const d = v - g; g = v; if (d) add('gold', d);
    if (d > 0) S.goldIn2 = (S.goldIn2 || 0) + d; else S.goldOut2 = (S.goldOut2 || 0) - d;
  } });
}

function step() {
  const P = window.__pol, S = window.__stats;
  const scr = (document.querySelector('.screen.active') || {}).id;
  const R = STATE.resources;
  for (const k of Object.keys(S.mins)) S.mins[k] = Math.min(S.mins[k], k === 'morale' ? (crewMoraleRaw() ?? 999) : R[k]);
  S.goldMax = Math.max(S.goldMax, STATE.goldAmount);
  for (const [k, v] of Object.entries(R)) {
    if (!Number.isFinite(v)) S.nan.push(k);
    else if (Math.abs(v * 10 - Math.round(v * 10)) > 1e-6 && S.floats.length < 5) S.floats.push(k + '=' + v);
  }
  { const su = cargoSlotsUsed(), sc = cargoCapacity(); S.slotPeak = Math.max(S.slotPeak || 0, su / sc); if (su >= sc) S.fullSteps = (S.fullSteps || 0) + 1; S.steps = (S.steps || 0) + 1; }
  if (STATE.cropGrowth && STATE.cropGrowth.health <= 0 && S.cropDeadAt == null) S.cropDeadAt = STATE.daysElapsed;
  const greedy = P !== 'random';
  // crop_dead offers "Keep flying" (failures.json continue_option): a
  // careful player presses on to arrive without the crop.
  if (greedy && STATE.ended && window.__end && window.__end.type === 'crop_dead' && typeof endContinueRun === 'function') {
    S.keptFlying = STATE.daysElapsed; window.__end = null; endContinueRun(); return { wait: 300 };
  }
  if (STATE.ended || scr === 'screen-end') return { done: true };
  for (const ov of document.querySelectorAll('.overlay.active')) { if (ov.id !== 'overlay-market') ov.classList.remove('active'); }
  document.body.classList.remove('modal-open');

  // ---------- ENCOUNTER ----------
  if (scr === 'screen-encounter') {
    const enc = document.getElementById('screen-encounter');
    if (enc.classList.contains('combat-mode')) {
      S.inCombat = true;
      const bs = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')].filter(b => b.offsetParent !== null);
      const pref = bs.find(b => /accept surrender|stand down|continue|collect|take|leave/i.test(b.textContent))
        || (greedy ? bs.find(b => /fire|attack|shoot/i.test(b.textContent)) : null) || bs[Math.floor(Math.random() * bs.length)];
      if (pref) pref.click();
      return { wait: 1600 };
    }
    if (S.inCombat) { S.inCombat = false; S.combat++; }
    const btns = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')];
    if (!btns.length) return { wait: 300 };
    const nonAdv = btns.filter(b => !b.classList.contains('advance'));
    window.__evSteps = (window.__evSteps || 0) + 1;
    if (!nonAdv.length || STATE.currentOutcomeId || STATE.outcomeMode || window.__evSteps > 25) {
      window.__evSteps = 0; S.events++; S.eventIds.push(STATE.currentEvent && STATE.currentEvent.id); S.eventFrac.push(journeyFrac());
      advanceAfterEvent(); return { wait: 50 };
    }
    // Leave rows are real exits (b4 2026-10-12: every sim run used to burn
    // its 1500-step budget at the first station). The station visit's
    // Market Row offers only BROWSE (the market stub closes at once) and
    // BACK TO DOCK; the dock offers its rooms again and LEAVE STATION —
    // and advanceAfterEvent() routes a room back to the dock, so the
    // old >25-step escape looped room → dock → room forever. A market
    // already browsed at this stop is done; with nothing new to pick, or
    // after too long at one stop, the sim takes the leave row.
    const leaveRow = [...document.querySelectorAll('#enc-choices .enc-choice.leave:not(.locked)')].find(b => b.offsetParent !== null);
    const V = window.__nodeVisit = (window.__nodeVisit && window.__nodeVisit.k === STATE.currentId) ? window.__nodeVisit : { k: STATE.currentId, n: 0, taken: {} };
    V.n++;
    const layerKey = (STATE.currentEvent && STATE.currentEvent.id) + '|' + ((STATE.layerStack || []).slice(-1)[0] || '');
    // A navigation choice (no outcome of its own: a dock room, MARKET,
    // BROWSE THE WARES) already taken at this stop leads where it led
    // last time — skip it.
    let chs = (window.__choices || []).filter(c => !(V.taken[layerKey + '|' + c.text] && !choiceOutcome(c)));
    if (leaveRow && (!chs.length || V.n > 40)) { S.leaveRows = (S.leaveRows || 0) + 1; leaveRow.click(); return { wait: 80 }; }
    if (V.n > 80) { window.__evSteps = 0; S.stallEscapes = (S.stallEscapes || 0) + 1; STATE.stationVisit = null; STATE.visited.add(STATE.currentId); returnToHub(); return { wait: 50 }; }
    if (!chs.length) { advanceAfterEvent(); return { wait: 50 }; }
    S.lockedGold += window.__lockedGold || 0;
    let ch;
    if (!greedy) {
      ch = chs[Math.floor(Math.random() * chs.length)];
    } else {
      const ev = STATE.currentEvent;
      // shopping intent at the trader
      // (ruling 90: any trader of the family — each lays its menus out
      // differently, so a menu that leads to fuel or rations is followed.)
      if (ev && (ev.id === 'event_encounter_trader_001' || ev.family === 'trader') && window.__wantBuy) {
        const fuelRe = /fuel cell/i, foodRe = /rations|ration crate/i;
        const leadsTo = (c, re) => !!(c.next && ev.layers && ev.layers[c.next] && (ev.layers[c.next].choices || []).some(x => re.test(x.text || '')));
        // Water is only on the trader's shelf (BROWSE THE WARES: the
        // openMarket stub buys it); food is in the menus and on the shelf.
        const shelf = c => c.open_market && !c.gate;
        const want = chs.find(c => fuelRe.test(c.text || '') && STATE.resources.fuel < 75)
          || chs.find(c => foodRe.test(c.text || '') && STATE.resources.food < 40)
          || chs.find(c => STATE.resources.fuel < 75 && leadsTo(c, fuelRe))
          || chs.find(c => STATE.resources.food < 40 && leadsTo(c, foodRe))
          || chs.find(c => (STATE.resources.water < 40 || STATE.resources.food < 40) && shelf(c))
          || (ev.id === 'event_encounter_trader_001' ? chs.find(c => /pitch/i.test(c.text || '')) : null);
        if (want) { if (/fuel cell/i.test(want.text)) { S.traderBuys++; S.fuelBought++; } else if (/rations/i.test(want.text) || shelf(want)) S.traderBuys++; ch = want; }
        if (!want) window.__wantBuy = false;
      }
      if (!ch) {
        const w = k => k === 'gold' ? 0.25 : k === 'morale' ? (crewMoraleRaw() == null ? 0 : 1 + (100 - crewMoraleRaw()) / 30) : 1 + (100 - Math.min(100, R[k])) / 20;
        const dayCost = { trivial: 1, low: 2, medium: 4, high: 8, extreme: 14 };
        const scoreOut = (o) => {
          if (!o) return 0;
          // A share of what's aboard (resources_pct) reads as the amount it
          // takes right now, the same figure the choice's tooltip shows.
          o = withPctResources(o);
          let s = 0;
          // Supplies as they land (effectiveResDelta: the trail's supply
          // bite, the recycler, the engineer), as the preview shows them.
          for (const [k, v] of Object.entries(o.resources || {})) if (Number.isFinite(v)) s += (k === 'gold' ? v * 0.25 : k === 'morale' ? v * w(k) : effectiveResDelta(k, v, o) * w(k));
          s -= (dayCost[o.time_cost || 'trivial'] || 1) * 0.6;
          const sev = o.severity || (o.crew_effect && o.crew_effect.type === 'kill' ? 'lethal' : null);
          if (sev === 'lethal') s -= 80; else if (sev === 'delayed') s -= 30; else if (sev === 'injury') s -= 20;
          else if (o.crew_effect && o.crew_effect.type === 'injure') s -= 20;
          if (o.crew_effect && o.crew_effect.type === 'heal') s += 10;
          if (o.item_grant) s += 4;
          if (o.materials) s += 2;
          if (o.item_consume) s -= 3;
          // The crop is the run: a careful player weighs its health too.
          if (Number.isFinite(o.crop_health) && STATE.cropGrowth && STATE.cropGrowth.health > 0) s += o.crop_health * 0.5;
          return s;
        };
        let best = -1e9;
        for (const c of chs) {
          let s;
          const o = choiceOutcome(c);
          if (o) s = scoreOut(o);
          else if (c.launch_minigame) { const t = (c.tier_outcomes || {}).good || {}; s = scoreOut(Object.assign({}, c.outcome || {}, t, { resources: Object.assign({}, (c.outcome || {}).resources || {}, t.resources || {}) })) * 0.9; }
          else if (c.triggerCombat || c.combat_trigger) s = P === 'aggro' ? 5 : -8;
          else if (c.triggerFleeResolve || c.triggerRamResolve) s = -4;
          else if (c.open_market) s = -2;
          else if (c.next) s = 1 - 4 * ((STATE._layerVisits || {})[c.next] ? 1 : 0);
          else if (c.back) s = -3;
          else s = 0;
          // The pips' morale tax, as the tooltip states it.
          if (c.effort) s -= effortTax(c.effort) * w('morale');
          s += Math.random() * 0.5;
          if (s > best) { best = s; ch = c; }
        }
      }
    }
    if (ch) V.taken[layerKey + '|' + ch.text] = true;
    // runChoiceAction lock bypass: call directly
    handleChoiceClick(ch);
    return { wait: 80 };
  }

  // ---------- CRUISE HUB ----------
  if (scr === 'screen-cruise') {
    window.__evSteps = 0;
    // Multi-day WAIT/REST (cruise parity 2026-10-11): let a running wait
    // play out; answer a during-wait event the way the player must.
    if (window.cruiseWaitActive && cruiseWaitActive()) return { wait: 700 };
    if (STATE.forcedEvent) { S.forced = (S.forced || 0) + 1; return { wait: 80 }; } // the event opens on its own after the alert flash (owner ruling 46a)
    if (window.__pendVerb) { const p = window.__pendVerb; window.__pendVerb = null; S.vd = S.vd || [];
      const dr = {}; for (const k of Object.keys(p.r)) dr[k] = Math.round(((k === 'morale' ? (crewMoraleRaw() || 0) : STATE.resources[k]) - p.r[k]) * 10) / 10;
      S.vd.push({ v: p.name, node: (STATE.byId[STATE.currentId] || {}).node_type, ds: Math.round((scoreValue() - p.sc) * 100) / 100, dd: STATE.daysElapsed - p.d, dr, dg: STATE.goldAmount - p.g, dm: Object.values(STATE.materials).reduce((a, b) => a + b, 0) - p.m }); }
    const node = STATE.byId[STATE.currentId];
    window.__acts = window.__acts || {};
    const key = STATE.currentId;
    const acts = window.__acts[key] = window.__acts[key] || { n: 0, did: {} };
    const stopBtn = document.getElementById('stop-btn');
    const verbBtns = () => [...document.querySelectorAll('#stop-choices .stop-choice:not(.locked)')];
    // WAIT FOR TRADER / REST open a 1–7 day picker: REST one day (the old
    // one-click REST), WAIT two days.
    const pickDays = (name, n) => {
      const steps = [...document.querySelectorAll('#stop-choices .day-step')];
      if (!steps.length) return;
      const d = n || (/wait/i.test(name) ? 2 : 1);
      steps[Math.min(steps.length, d) - 1].click();
    };
    const doVerb = (re, name) => {
      if (!document.body.classList.contains('stop-active')) stopBtn.click();
      const b = verbBtns().find(x => re.test(x.querySelector('.stop-choice-body').textContent));
      if (!b) return false;
      acts.n++; acts.did[name] = (acts.did[name] || 0) + 1;
      window.__pendVerb = { name, sc: scoreValue(), d: STATE.daysElapsed, r: Object.assign({}, STATE.resources, { morale: crewMoraleRaw() || 0 }), g: STATE.goldAmount, m: Object.values(STATE.materials).reduce((a, b) => a + b, 0) };
      S.verbs[name] = (S.verbs[name] || 0) + 1;
      window.__ctx = 'verb';
      try { b.click(); pickDays(name); } finally { window.__ctx = 'other'; }
      return true;
    };
    if (greedy) {
      // orders
      if (P === 'fast') { STATE.orders.pace = 'plaid'; STATE.orders.rations = 'pigout'; }
      else if (P === 'plaid') { STATE.orders.pace = 'plaid'; }
      else if (P === 'ludi') { STATE.orders.pace = 'ludicrous'; }
      else if (P === 'frugal') { STATE.orders.pace = 'light'; STATE.orders.rations = 'vending'; }
      // station shopping (emulates the market modal at real prices)
      if (window.__shop && node.node_type === 'station' && !acts.shopped) {
        acts.shopped = true;
        // Sold through the game's own station sale (market.js stationSellOne:
        // the Market Row's and the Cargo Hold's price, one rule).
        const keep = { metal: 4, scrap: 2 };
        for (const [m, q] of Object.entries(STATE.materials)) for (let n = Math.max(0, q - (keep[m] || 0)); n > 0; n--) {
          window.__ctxTag = 'shopSell'; const r = stationSellOne(m); window.__ctxTag = '';
          if (!r.paid) break; S.matsSold = (S.matsSold || 0) + 1;
        }
        // Trade goods: the trader's price, and what a fence would have paid
        // for the same copy (the black market is out of the sim's reach).
        for (const sid of [...new Set(STATE.items)]) {
          if (!((itemDef(sid) || {}).tags || []).includes('trade_good')) continue;
          while (STATE.items.includes(sid)) {
            const v = (typeof itemValuesOf === 'function' ? itemValuesOf(sid) : [])[0];
            const f = fenceBuyPrice(sid, Number.isFinite(v) ? v : undefined);
            window.__ctxTag = 'shopSellGoods'; const r = stationSellOne(sid, 0); window.__ctxTag = '';
            if (!r.paid) break;
            S.goodsSold = (S.goodsSold || 0) + 1; S.goodsGold = (S.goodsGold || 0) + r.paid; S.fenceWouldPay = (S.fenceWouldPay || 0) + (f || r.paid);
          }
        }
        const buy = window.__buySupply;
        const cnt = id => STATE.items.filter(x => x === id).length;
        const fuelNeed = (P === 'fast' || P === 'plaid') ? 90 : P === 'ludi' ? 70 : 50;
        buy('fuel_cell', (window.__prices || {}).fuel_cell || 12, () => R.fuel + 15 * cnt('fuel_cell') < fuelNeed + 30);
        buy('ration_brick', 6, () => R.food + 10 * cnt('ration_brick') < 70);
        buy('water_canister', 8, () => R.water + 10 * cnt('water_canister') < 70);
      }
      // Without :shop, a station is still where a short ship restocks.
      if (!window.__shop && node.node_type === 'station' && !acts.provisioned) { acts.provisioned = true; window.__provision(); }
      if (typeof cropWaterNeed === 'function') setWaterSplit(cropWaterNeed());
      // consumables
      const useIt = (id, cond) => {
        if (!cond || !STATE.items.includes(id) || !ITEM_USE[id] || ITEM_USE[id].can()) return;
        window.__ctxTag = 'item:' + id; ITEM_USE[id].use(); window.__ctxTag = ''; STATE.items.splice(STATE.items.indexOf(id), 1); S.itemUses[id] = (S.itemUses[id] || 0) + 1;
      };
      useIt('fuel_cell', R.fuel < resMax('fuel') - 15); useIt('ration_brick', R.food < 85); useIt('water_canister', R.water < 85);
      useIt('hull_patch', R.hull < 80); useIt('o2_canister', R.o2 < 80); useIt('medkit', peopleAboard().some(r => hpOf(r) < 50)); // the captain has real HP too (owner ruling 29)
      useIt('crop_treatment', STATE.cropGrowth && (STATE.cropGrowth.pest || STATE.cropGrowth.health < 60));
      // growbay
      if (STATE.cropGrowth && STATE.cropGrowth.health > 0 && typeof openGrowbay === 'function') {
        openGrowbay();
        if (STATE.cropGrowth.pest) { S.pests++; window.__ctx = 'verb'; openTreat(); window.__ctx = 'other'; }
        if (STATE.cropGrowth.growth >= 100) {
          const f0 = R.food, m0 = crewMoraleRaw() || 0; doHarvest(); S.harvests++; S.harvestFood += R.food - f0; S.harvestMorale += (crewMoraleRaw() || 0) - m0;
        }
        closeGrowbay();
        if (STATE.ended) return { wait: 50 };
      }
      if (P === 'sampler' && !acts.sampled) {
        acts.sampled = true;
        if (!document.body.classList.contains('stop-active')) stopBtn.click();
        const opts = verbBtns().map(b => b.querySelector('.stop-choice-body').textContent).filter(t => !/FABRICATOR|FAB SERVICE/.test(t));
        if (opts.length && Math.random() < 0.7) { const t = opts[Math.floor(Math.random() * opts.length)]; const nm = t.toLowerCase().replace(/ /g, '_');
          if (doVerb({ test: x => x === t }, nm)) return { wait: 50 }; }
      }
      if (window.__farm && ['asteroid_field', 'nebula', 'derelict'].includes(node.node_type) && !acts.did.mine && doVerb(/^MINE/, 'mine')) return { wait: 50 };
      // :salvage — a careful player picks over every wreck once (SALVAGE is
      // where the curiosities turn up: items.json find_odds.salvage).
      if (window.__salvage && !acts.did.salvage && doVerb(/^SALVAGE/, 'salvage')) return { wait: 50 };
      const cap = P === 'stopper' ? 4 : 2;
      if (acts.n < cap) {
        if (node.node_type === 'station' && peopleAboard().some(r => hpOf(r) < 60) && STATE.goldAmount >= 30 && !acts.did.medbay) { S.medbay++; if (doVerb(/MEDBAY/, 'medbay')) return { wait: 50 }; }
        if (R.hull < (P === 'stopper' ? 85 : 60) && (acts.did.repair || 0) < 2 && doVerb(/^REPAIR/, 'repair')) return { wait: 50 };
        if (crewMoraleRaw() != null && crewMoraleRaw() < (P === 'stopper' ? 80 : 40) && (acts.did.rest || 0) < 2 && doVerb(/^REST/, 'rest')) return { wait: 50 };
        const needSupply = R.fuel < (P === 'stopper' ? 80 : 55) || R.water < 40 || R.food < 40;
        if (needSupply && STATE.goldAmount >= 8 && !acts.did.trade) { window.__wantBuy = true; if (doVerb(/^TRADE$/, 'trade')) return { wait: 50 };
          // No trader in range (presence roll): wait for one, once per stop.
          if (!acts.did.wait_for_trader && doVerb(/^WAIT FOR TRADER$/, 'wait_for_trader')) return { wait: 50 }; }
        if (P === 'stopper') {
          if (!acts.did.forage && R.food < 90 && doVerb(/^(GATHER|HUNT|SCAVENGE|FORAGE)$/, 'forage')) return { wait: 50 };
          if (!acts.did.salvage && doVerb(/^SALVAGE/, 'salvage')) return { wait: 50 };
          if (!acts.did.mine && doVerb(/^MINE/, 'mine')) return { wait: 50 };
        } else if (node.node_type === 'nebula' && R.fuel < 70 && !acts.did.mine && doVerb(/^MINE/, 'mine')) return { wait: 50 };
        else if (node.node_type === 'asteroid_field' && R.water < 60 && !acts.did.mine && doVerb(/^MINE/, 'mine')) return { wait: 50 };
        else if (R.food < 40 && !acts.did.forage && doVerb(/^(GATHER|HUNT|SCAVENGE|FORAGE)$/, 'forage')) return { wait: 50 };
      }
    } else if (!acts.rolled) {
      acts.rolled = true;
      if (Math.random() < 0.25) {
        if (!document.body.classList.contains('stop-active')) stopBtn.click(); // pressed while stopped it is RESUME (travels)
        const vs = verbBtns().filter(b => !/FABRICATOR/.test(b.textContent));
        if (vs.length) { const b = vs[Math.floor(Math.random() * vs.length)]; const nm = b.querySelector('.stop-choice-body').textContent; S.verbs[nm] = (S.verbs[nm] || 0) + 1; window.__ctx = 'verb'; try { b.click(); const st = [...document.querySelectorAll('#stop-choices .day-step')]; if (st.length) st[Math.floor(Math.random() * 3)].click(); } finally { window.__ctx = 'other'; } }
        return { wait: 50 };
      }
    }
    if (STATE.ended) return { wait: 50 };
    if ((document.querySelector('.screen.active') || {}).id !== 'screen-cruise') return { wait: 50 };
    // travel
    const nextIds = [...nextAvailableNodes()];
    const f0 = R.fuel;
    if (nextIds.length === 0) { if (!resolveStuckFork()) { return { stuck: true }; } return { wait: 50 }; }
    if (document.body.classList.contains('stop-active')) document.body.classList.remove('stop-active');
    travelTo(nextIds[Math.floor(Math.random() * nextIds.length)]);
    S.travelFuel += Math.max(0, f0 - STATE.resources.fuel);
    return { wait: 80 };
  }
  return { wait: 200 };
}

// The save fuzzer (test_save_fuzz.js) drives play with the same policies.
module.exports = { installHarness, step };
if (require.main === module) (async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)));
  page.on('dialog', d => d.accept());
  await page.clock.install();
  const results = [];
  for (const policy of POLICIES) for (const trail of TRAILS) for (let run = 0; run < RUNS; run++) {
    const cfg = { trail, ai: pick(['aria', 'marv', 'rex', 'chip', 'ajoy']), captain: pick(CAPTAINS), crew: [...new Set([pick(CREWPOOL), pick(CREWPOOL)])], crop: pick(CROPS), ship: 'Sim' };
    await page.goto(URL);
    await page.clock.runFor(1500);
    await page.waitForFunction(() => typeof EVENTS !== 'undefined' && Object.keys(EVENTS).length > 0);
    await page.evaluate(installHarness, policy);
    await page.evaluate(c => applySetupToState(c), cfg);
    await page.evaluate(installLedger);
    if (process.env.OVR) await page.evaluate(code => { (0, eval)(code); }, process.env.OVR);
    await page.clock.runFor(300);
    let res = null, steps = 0;
    for (; steps < 1500; steps++) {
      let r;
      try { r = await page.evaluate(step); } catch (e) { errors.push('step: ' + String(e.message).slice(0, 200)); r = { wait: 300 }; }
      if (r.done) break;
      if (r.stuck) { errors.push('stuck ' + trail); break; }
      await page.clock.runFor(r.wait || 100);
    }
    res = await page.evaluate(() => ({
      end: window.__end || null, days: STATE.daysElapsed, baseDays: STATE.baseDays, res: Object.assign({}, STATE.resources), gold: STATE.goldAmount,
      crew: STATE.crew.length, crewHP: Object.assign({}, STATE.crewHP), captainHP: captainHPOf(), mats: Object.values(STATE.materials).reduce((a, b) => a + b, 0), items: STATE.items.slice(),
      crop: STATE.cropGrowth ? { g: Math.round(STATE.cropGrowth.growth), h: Math.round(STATE.cropGrowth.health) } : null,
      nodes: STATE.nodes.length, visited: STATE.visited.size, stats: window.__stats,
    }));
    res.policy = policy; res.trail = trail; res.cfg = cfg; res.steps = steps;
    results.push(res);
    process.stdout.write(`${policy}/${trail}#${run}: ${res.end ? (res.end.kind === 'ending' ? 'WIN ' + res.end.bracket : 'FAIL ' + res.end.type) : 'NONE'} d${res.days}/${res.baseDays} ${JSON.stringify(res.res)} g${res.gold}\n`);
  }
  fs.writeFileSync(OUT, JSON.stringify({ results, errors }, null, 1));
  console.log('errors', errors.slice(0, 15));
  await browser.close();
})();
