'use strict';
// Economy simulator: drives many full runs in-page with policies.
// Hunt 5 (2026-10-10): realistic mining yields (13±, measured from the real
// minigame), station shopping (policy suffix :shop), mining runs per visit
// (policy suffix :N), a per-cause resource ledger, and a verb sampler policy.
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
  window.__pol = P; window.__mineRuns = +(policy.split(':')[1] || 1); window.__shop = policy.includes(':shop'); window.__farm = policy.includes(':farm');
  const T = () => { const r = Math.random(); return r < 0.3 ? 'perfect' : r < 0.7 ? 'good' : r < 0.95 ? 'poor' : 'abandoned'; };
  const S = window.__stats = {
    forageFood: 0, harvests: 0, harvestFood: 0, harvestMorale: 0, verbs: {}, events: 0, eventDays: 0, verbDays: 0, travelDays: 0,
    travelFuel: 0, mins: { fuel: 999, food: 999, water: 999, o2: 999, hull: 999, morale: 999 }, itemUses: {}, goldMax: 0,
    goldIn: 0, goldOut: 0, floats: [], nan: [], combat: 0, traderBuys: 0, medbay: 0, eventIds: [], resDelta: {}, lockedGold: 0,
    deprivedDays: 0, pests: 0, cropDeadAt: null, fuelBought: 0, matsGained: 0,
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
  window.openMarket = (opts, onClose) => { if (onClose) onClose(); };
  const realEnd = window.endRun;
  window.endRun = function (end) {
    window.__end = { kind: end.kind, type: end.module && end.module.failure_type, id: end.module && end.module.id, bracket: end.kind === 'ending' ? scoreBracket() : null, score: end.kind === 'ending' && typeof scoreValue === 'function' ? Math.round(scoreValue()) : null };
    return realEnd(end);
  };
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
  const realChoices = renderChoicesInner;
  renderChoicesInner = function (choices) {
    const visible = choices.filter(ch => !(ch.showFlag && !STATE.flags.has(ch.showFlag)) && !(ch.hideFlag && STATE.flags.has(ch.hideFlag)));
    window.__choices = visible.filter(ch => !lockReason(ch));
    window.__lockedGold = visible.filter(ch => lockReason(ch) && ch.gate && ch.gate.gold).length;
    return realChoices(choices);
  };
  const realApply = applyOutcomeEffects;
  applyOutcomeEffects = function (o) {
    const before = Object.assign({}, STATE.resources, { gold: STATE.goldAmount });
    const prev = window.__ctx; window.__ctx = 'event';
    const r = realApply(o);
    window.__ctx = prev;
    for (const k of Object.keys(before)) {
      const now = k === 'gold' ? STATE.goldAmount : STATE.resources[k];
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
  for (const k of Object.keys(S.mins)) S.mins[k] = Math.min(S.mins[k], R[k]);
  S.goldMax = Math.max(S.goldMax, STATE.goldAmount);
  for (const [k, v] of Object.entries(R)) {
    if (!Number.isFinite(v)) S.nan.push(k);
    else if (Math.abs(v * 10 - Math.round(v * 10)) > 1e-6 && S.floats.length < 5) S.floats.push(k + '=' + v);
  }
  if (STATE.cropGrowth && STATE.cropGrowth.health <= 0 && S.cropDeadAt == null) S.cropDeadAt = STATE.daysElapsed;
  if (STATE.ended || scr === 'screen-end') return { done: true };
  for (const ov of document.querySelectorAll('.overlay.active')) { if (ov.id !== 'overlay-market') ov.classList.remove('active'); }
  document.body.classList.remove('modal-open');

  const greedy = P !== 'random';
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
      window.__evSteps = 0; S.events++; S.eventIds.push(STATE.currentEvent && STATE.currentEvent.id);
      advanceAfterEvent(); return { wait: 50 };
    }
    let chs = (window.__choices || []).slice();
    if (!chs.length) { advanceAfterEvent(); return { wait: 50 }; }
    S.lockedGold += window.__lockedGold || 0;
    let ch;
    if (!greedy) {
      ch = chs[Math.floor(Math.random() * chs.length)];
    } else {
      const ev = STATE.currentEvent;
      // shopping intent at the trader
      if (ev && ev.id === 'event_encounter_trader_001' && window.__wantBuy) {
        const want = chs.find(c => /fuel cell/i.test(c.text || '') && STATE.resources.fuel < 75)
          || chs.find(c => /sealed rations/i.test(c.text || '') && STATE.resources.food < 40)
          || chs.find(c => /pitch/i.test(c.text || ''));
        if (want) { if (/fuel cell/i.test(want.text)) { S.traderBuys++; S.fuelBought++; } else if (/rations/i.test(want.text)) S.traderBuys++; ch = want; }
        if (!want) window.__wantBuy = false;
      }
      if (!ch) {
        const w = k => k === 'gold' ? 0.25 : k === 'morale' ? 1 + (100 - R.morale) / 30 : 1 + (100 - Math.min(100, R[k])) / 20;
        const dayCost = { trivial: 1, low: 2, medium: 4, high: 8, extreme: 14 };
        const scoreOut = (o) => {
          if (!o) return 0;
          let s = 0;
          for (const [k, v] of Object.entries(o.resources || {})) if (Number.isFinite(v)) s += (k === 'gold' ? v * 0.25 : v * w(k));
          s -= (dayCost[o.time_cost || 'trivial'] || 1) * 0.6;
          const sev = o.severity || (o.crew_effect && o.crew_effect.type === 'kill' ? 'lethal' : null);
          if (sev === 'lethal') s -= 80; else if (sev === 'delayed') s -= 30; else if (sev === 'injury') s -= 20;
          else if (o.crew_effect && o.crew_effect.type === 'injure') s -= 20;
          if (o.crew_effect && o.crew_effect.type === 'heal') s += 10;
          if (o.item_grant) s += 4;
          if (o.materials) s += 2;
          if (o.item_consume) s -= 3;
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
          else if (c.scenario) s = 0;
          else s = 0;
          s += Math.random() * 0.5;
          if (s > best) { best = s; ch = c; }
        }
      }
    }
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
    if (STATE.forcedEvent) { S.forced = (S.forced || 0) + 1; const fb = document.querySelector('#stop-choices .stop-choice'); if (fb) fb.click(); return { wait: 80 }; }
    if (window.__pendVerb) { const p = window.__pendVerb; window.__pendVerb = null; S.vd = S.vd || [];
      const dr = {}; for (const k of Object.keys(p.r)) dr[k] = Math.round((STATE.resources[k] - p.r[k]) * 10) / 10;
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
      window.__pendVerb = { name, sc: scoreValue(), d: STATE.daysElapsed, r: Object.assign({}, STATE.resources), g: STATE.goldAmount, m: Object.values(STATE.materials).reduce((a, b) => a + b, 0) };
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
        // the station's real buy-back (market.js materialPrice: value × 2.5, min 1)
        const MATP = window.__matp || Object.fromEntries(((MOD.materials && MOD.materials.materials) || []).map(m => [m.id, Math.max(1, Math.round((m.value || 0.2) * 2.5))]));
        const keep = { metal: 4, scrap: 2 };
        for (const [m, q] of Object.entries(STATE.materials)) { const sell = Math.max(0, q - (keep[m] || 0)); if (sell > 0) { STATE.materials[m] -= sell; window.__ctxTag = 'shopSell'; STATE.goldAmount += sell * MATP[m]; window.__ctxTag = ''; S.matsSold = (S.matsSold || 0) + sell; } }
        const buy = (id, base, want) => { let n = 0; while (want() && STATE.goldAmount >= stationPrice(base) && n < 8) { if (!grantItem(id)) break; window.__ctxTag = 'shopBuy:' + id; STATE.goldAmount -= stationPrice(base); window.__ctxTag = ''; n++; S.shopBuys = S.shopBuys || {}; S.shopBuys[id] = (S.shopBuys[id] || 0) + 1; } };
        const cnt = id => STATE.items.filter(x => x === id).length;
        const fuelNeed = (P === 'fast' || P === 'plaid') ? 90 : P === 'ludi' ? 70 : 50;
        buy('fuel_cell', (window.__prices || {}).fuel_cell || 12, () => R.fuel + 15 * cnt('fuel_cell') < fuelNeed + 30);
        buy('ration_brick', 6, () => R.food + 10 * cnt('ration_brick') < 70);
        buy('water_canister', 8, () => R.water + 10 * cnt('water_canister') < 70);
      }
      if (typeof cropWaterNeed === 'function') setWaterSplit(cropWaterNeed());
      // consumables
      const useIt = (id, cond) => {
        if (!cond || !STATE.items.includes(id) || !ITEM_USE[id] || ITEM_USE[id].can()) return;
        window.__ctxTag = 'item:' + id; ITEM_USE[id].use(); window.__ctxTag = ''; STATE.items.splice(STATE.items.indexOf(id), 1); S.itemUses[id] = (S.itemUses[id] || 0) + 1;
      };
      useIt('fuel_cell', R.fuel < resMax('fuel') - 15); useIt('ration_brick', R.food < 85); useIt('water_canister', R.water < 85);
      useIt('hull_patch', R.hull < 80); useIt('o2_canister', R.o2 < 80); useIt('medkit', STATE.crew.some(r => crewHPOf(r) < 50));
      useIt('crop_treatment', STATE.cropGrowth && (STATE.cropGrowth.pest || STATE.cropGrowth.health < 60));
      // growbay
      if (STATE.cropGrowth && STATE.cropGrowth.health > 0 && typeof openGrowbay === 'function') {
        openGrowbay();
        if (STATE.cropGrowth.pest) { S.pests++; window.__ctx = 'verb'; openTreat(); window.__ctx = 'other'; }
        if (STATE.cropGrowth.growth >= 100) {
          const f0 = R.food, m0 = R.morale; doHarvest(); S.harvests++; S.harvestFood += R.food - f0; S.harvestMorale += R.morale - m0;
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
      const cap = P === 'stopper' ? 4 : 2;
      if (acts.n < cap) {
        if (node.node_type === 'station' && STATE.crew.some(r => crewHPOf(r) < 60) && STATE.goldAmount >= 30 && !acts.did.medbay) { S.medbay++; if (doVerb(/MEDBAY/, 'medbay')) return { wait: 50 }; }
        if (R.hull < (P === 'stopper' ? 85 : 60) && (acts.did.repair || 0) < 2 && doVerb(/^REPAIR/, 'repair')) return { wait: 50 };
        if (R.morale < (P === 'stopper' ? 80 : 40) && (acts.did.rest || 0) < 2 && doVerb(/^REST/, 'rest')) return { wait: 50 };
        if (R.fuel < (P === 'stopper' ? 80 : 55) && STATE.goldAmount >= 12 && !acts.did.trade) { window.__wantBuy = true; if (doVerb(/^TRADE$/, 'trade')) return { wait: 50 };
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
        stopBtn.click();
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

(async () => {
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
      crew: STATE.crew.length, crewHP: Object.assign({}, STATE.crewHP), mats: Object.values(STATE.materials).reduce((a, b) => a + b, 0), items: STATE.items.slice(),
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
