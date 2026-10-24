// Leftovers from the 2026-10-23 hunt:
//   fail_outcome: a hands-on job's authored failure (trader_003's haggle)
//           plays its own outcome — its text, its effects, no generic
//           halving / extra days / setback line — and the tooltip says it.
//   FORAGE: the alien poisoning and the fungus show on the result card,
//           and the close applies the same rolls (cargo full: said so).
//   RECORDS: LAUNCH over a save with a failure left pending records it.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const errors = [];
let browser;

async function boot(nodeType, setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(String(e.stack || e.message).slice(0, 300)));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor && typeof enterEvent === 'function');
  await page.evaluate(([nt, o]) => {
    localStorage.removeItem('transplant_save_v1');
    localStorage.removeItem('transplant_records_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['pilot', 'engineer'], crop: 'wheat', ship: 'Q' }, o));
    STATE.stowaway = null; STATE.forcedEvent = null;
    const n = STATE.nodes.find(x => x.node_type !== 'fork' && x.node_type !== 'station' && x.id !== STATE.nodes[0].id);
    n.node_type = nt; STATE.currentId = n.id; returnToHub();
  }, [nodeType, setup || {}]);
  await page.waitForTimeout(300);
  return page;
}
const verb = async (page, re) => {
  await page.evaluate(() => { document.body.classList.remove('stop-active'); document.getElementById('stop-btn').textContent = 'Stop'; returnToHub(); });
  await page.waitForTimeout(200);
  const found = await page.evaluate(re => { const b = [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => new RegExp(re).test(b.textContent)); if (b) b.click(); return !!b; }, re);
  await page.waitForTimeout(500);
  return found;
};
const lastLog = page => page.evaluate(() => (STATE.shipLog || []).map(e => (typeof e === 'string' ? e : e.text)).filter(t => /◆/.test(t || '')).slice(-1)[0] || '');

(async () => {
  browser = await chromium.launch();

  console.log('— fail_outcome: the failed haggle plays its own outcome');
  for (const [roll, want] of [[0.999, 'hag_fuel_wobbled'], [0, 'hag_fuel_haggled']]) {
    const page = await boot('void', { crew: ['engineer'] });
    const r = await page.evaluate(async ([roll]) => {
      STATE.goldAmount = 50; STATE.items = [];
      enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_trader_003);
      STATE.layerStack = ['entry', 'prices'];
      renderEncounterState({ instant: true });
      await new Promise(r => setTimeout(r, 400));
      const btn = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /Haggle for the fuel cell/.test(b.textContent));
      const tip = btn ? (Tooltip.resolve(btn) || {}).description || btn.title || '' : '';
      const sub = btn ? (btn.querySelector('.ch-sub') || {}).textContent || '' : '';
      const g0 = STATE.goldAmount, d0 = STATE.daysElapsed, m0 = { ...STATE.crewMorale };
      const keep = Math.random; Math.random = () => roll;
      try { if (btn) btn.click(); await new Promise(r => setTimeout(r, 600)); } finally { Math.random = keep; }
      const body = document.getElementById('enc-narr-body') ? document.getElementById('enc-narr-body').textContent : '';
      return { found: !!btn, tip, sub, id: STATE.currentOutcomeId, gold: g0 - STATE.goldAmount, days: STATE.daysElapsed - d0, cell: STATE.items.includes('fuel_cell'),
        morale: Object.keys(m0).map(k => STATE.crewMorale[k] - m0[k]), body, con: STATE.effortCon };
    }, [roll]);
    ok(r.found && /Bargain · it can go wrong/.test(r.sub) && /\d+% clean\. Short of effort/.test(r.tip), `the authored sub-label stays; the tooltip gives the odds (${r.sub})`);
    if (want === 'hag_fuel_wobbled') {
      ok(/Short of effort: TALKED UP — .*−20 GOLD/.test(r.tip) && !/half the resource gains/.test(r.tip), 'the tooltip names the authored failure and its cost: ' + (r.tip.split('\n').find(l => /Short of effort/.test(l)) || r.tip));
      ok(r.id === 'hag_fuel_wobbled' && r.gold === 20 && r.cell && r.days === 1, `a failed haggle: TALKED UP, the full 20 gold, the cell, its own day, no extra (${r.id}, −${r.gold}g, ${r.days}d)`);
      ok(r.morale.every(v => v === -2) && r.con === null, `its own −2 morale, no generic setback on top (${r.morale.join(',')})`);
      ok(!/The pitch wobbles at the worst moment/.test(r.body), 'no generic short-of-effort line under it');
    } else {
      ok(r.id === 'hag_fuel_haggled' && r.gold === 10 && r.cell && r.days === 1, `a clean haggle: A PRICE, EVENTUALLY at 10 gold (${r.id}, −${r.gold}g)`);
    }
    await page.close();
  }
  {
    // Every other effort check keeps the generic failure.
    const page = await boot('void');
    const r = await page.evaluate(() => {
      const ev = EVENTS.event_encounter_trader_003;
      STATE.currentEvent = ev;
      const haggle = ev.layers.prices.choices.find(c => c.fail_outcome);
      const plain = Object.assign({}, haggle, { fail_outcome: undefined });
      return { haggle: !!failOutcomeOf(haggle), plain: failOutcomeOf(plain), noCheck: failOutcomeOf({ outcome: 'hag_fuel_list', fail_outcome: 'hag_fuel_wobbled' }) };
    });
    ok(r.haggle && r.plain === null && r.noCheck === null, 'fail_outcome applies only to a choice with an effort check');
    await page.close();
  }

  console.log('— FORAGE: side results on the card, the same rolls landed');
  const forage = async (opts) => {
    const page = await boot(opts.node, opts.setup);
    await page.evaluate(o => {
      STATE.items = []; STATE.materials = {};
      if (o.alien) SceneArt.biomeFor = () => 'alien';
      if (o.full) { let i = 0; while (cargoSlotsUsed() < cargoCapacity() && i++ < 60) STATE.items.push('water_purifier'); }
      window.__keepF = itemDef('suspicious_fungus').find_odds;
      itemDef('suspicious_fungus').find_odds = { forage: o.fungus };
      window.__realRandom = Math.random; Math.random = () => o.roll;
    }, opts);
    const opened = await verb(page, '^(GATHER|HUNT|SCAVENGE|FORAGE)');
    await page.evaluate(t => showResult(t, { food: 5, rare_drops: [], sickness: [] }), opts.tier);
    await page.waitForTimeout(300);
    const card = await page.evaluate(() => [...document.querySelectorAll('#rhaul .rh-line')].map(l => [l.textContent, l.className]));
    const hp0 = await page.evaluate(() => peopleAboard().map(hpOf).reduce((a, b) => a + b, 0));
    await page.click('#rbquit'); await page.waitForTimeout(500);
    const out = await page.evaluate(hp0 => {
      Math.random = window.__realRandom; itemDef('suspicious_fungus').find_odds = window.__keepF;
      return { fungus: STATE.items.includes('suspicious_fungus'), hurt: hp0 - peopleAboard().map(hpOf).reduce((a, b) => a + b, 0) };
    }, hp0);
    const log = await lastLog(page);
    await page.close();
    return Object.assign({ opened, card, log }, out);
  };
  {
    const a = await forage({ node: 'anomaly', tier: 'good', fungus: 1, roll: 0.5 });
    const line = a.card.find(([t]) => /FIND · a fungus/.test(t));
    ok(a.opened && line && /gold/.test(line[1]) && a.fungus && /a fungus nobody can name/.test(a.log), `anomaly, good: the fungus is on the card (${line && line[0]}) and comes aboard`);
    const b = await forage({ node: 'anomaly', tier: 'poor', fungus: 1, roll: 0.5 });
    ok(!b.card.some(([t]) => /fungus/.test(t)) && !b.fungus, 'a poor forage: no fungus on the card, none aboard');
    const c = await forage({ node: 'anomaly', tier: 'good', fungus: 1, roll: 0.5, full: true });
    const cl = c.card.find(([t]) => /fungus/.test(t));
    ok(cl && /CARGO FULL, LEFT BEHIND/.test(cl[0]) && /orange/.test(cl[1]) && !c.fungus, `a full hold: the card says it was left behind (${cl && cl[0]})`);
    const d = await forage({ node: 'anomaly', tier: 'good', fungus: 0.4, roll: 0.5 });
    ok(!d.card.some(([t]) => /fungus/.test(t)) && !d.fungus, 'a roll over the odds: nothing on the card, nothing aboard');
  }
  {
    // An alien world (the planet's biome): one roll in four poisons someone; a 0.1 roll does.
    const e = await forage({ node: 'planet', alien: true, tier: 'good', fungus: 0.01, roll: 0.1 });
    const pl = e.card.find(([t]) => /POISONING/.test(t));
    ok(e.opened && pl && /red/.test(pl[1]) && e.hurt > 0 && /disagreed with|killed/.test(e.log), `alien ground: the poisoning is on the card (${pl && pl[0]}) and lands (−${e.hurt} HP)`);
    const f = await forage({ node: 'planet', alien: true, tier: 'good', fungus: 0.01, roll: 0.9 });
    ok(!f.card.some(([t]) => /POISONING/.test(t)) && f.hurt === 0, 'a clean alien haul: no poisoning on the card, nobody hurt');
  }

  console.log('— RECORDS: LAUNCH over a pending failure records it');
  {
    const page = await boot('void');
    const r = await page.evaluate(async () => {
      const f = MOD.failures.find(x => x.continue_option);
      STATE.artSeed = 4242; STATE.daysElapsed = 17;
      writeSnapshot(SAVE_KEY, { pendingFailure: f.id });
      startNewGame();
      const wait = ms => new Promise(r => setTimeout(r, ms));
      await wait(100);
      // Walk the wizard (a card a step; the solo / incomplete-crew dialogs
      // answered PROCEED) until LAUNCH raises the abandon dialog.
      const dialog = () => document.querySelector('.tp-confirm-overlay');
      let asked = false;
      for (let i = 0; i < 14 && !asked; i++) {
        const d = dialog();
        if (d) { if (/ABANDON THE SAVED VOYAGE/.test(d.textContent)) { asked = true; break; } d.querySelector('[data-act="yes"]').click(); await wait(150); continue; }
        const cards = [...document.querySelectorAll('#setup-right .sel-card')];
        if (cards.length) { if (document.getElementById('crew-count-badge').textContent) { cards[0].click(); cards[1].click(); } else cards[0].click(); }
        document.getElementById('btn-next').click();
        await wait(150);
      }
      if (asked) { dialog().querySelector('[data-act="yes"]').click(); await wait(500); }
      const rec = JSON.parse(localStorage.getItem('transplant_records_v1') || '{"runs":[]}');
      return { asked, f: { id: f.id, type: f.failure_type, title: f.title }, runs: rec.runs, best: rec.best };
    });
    const e = r.runs[0];
    ok(r.asked, 'LAUNCH over the save asks first');
    ok(r.runs.length === 1 && e.kind === 'failure' && e.tone === r.f.type && e.title === String(r.f.title).toUpperCase() && e.days === 17 && e.trail === 'mars' && e.id === '4242:17:' + r.f.type + ':x',
      `the pending failure is recorded as that failure (${e && [e.id, e.title, e.days + 'd'].join(' · ')})`);
    ok(!Object.keys(r.best || {}).length, 'a failure never sets a best');
    // Recorded already (the report was read), then replaced: still one entry.
    const twice = await page.evaluate(() => {
      const f = MOD.failures.find(x => x.continue_option);
      localStorage.setItem('transplant_records_v1', JSON.stringify({ runs: [{ id: '9:3:' + f.failure_type + ':x', kind: 'failure', ts: 1 }], best: {} }));
      const snap = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      Object.assign(snap, { v: 1, artSeed: 9, daysElapsed: 3, pendingFailure: f.id });
      localStorage.setItem(SAVE_KEY, JSON.stringify(snap));
      const res = recordSavedFailure();
      return { res, n: JSON.parse(localStorage.getItem('transplant_records_v1')).runs.length };
    });
    ok(twice.res === null && twice.n === 1, 'a failure already recorded is not added again');
    const none = await page.evaluate(() => { localStorage.removeItem('transplant_records_v1'); writeSnapshot(SAVE_KEY); return [recordSavedFailure(), localStorage.getItem('transplant_records_v1')]; });
    ok(none[0] === null && none[1] === null, 'a save with no failure pending records nothing');
    await page.close();
  }

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\nleftovers: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
