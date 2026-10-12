// Demo parity, batch 2 — the Cargo Hold (resources/demo-inventory.html).
// Per-unit slot rule (owner ruling 2026-10-11), SHIP RESOURCES row from
// the real burn rates, tabs + 1/2/3 keys, SORT, NEW badge (saved; the
// owner dropped provenance), GEAR sections, detail rows / USED FOR / ⇄ NOTES / AI line in
// five voices, jettison picker + ALL + poof, slot readout states, gold
// roll, side-column layout, "Required for:" only from real event data.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function open() {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor && MOD.materials);
  await page.evaluate(() => localStorage.removeItem('transplant_save_v1'));
  return page;
}
async function boot(setup) {
  const page = await open();
  await page.evaluate(o => {
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
    returnToHub();
  }, setup || {});
  await page.waitForTimeout(150);
  return page;
}
async function reloadAndContinue(page) {
  await page.reload();
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor);
  await page.evaluate(() => loadRun());
  await page.waitForTimeout(300);
}
const STACKABLES = ['ration_brick', 'water_canister', 'fuel_cell', 'medkit', 'hull_patch', 'crop_treatment', 'o2_canister'];

(async () => {
  browser = await chromium.launch();

  console.log('— per-unit slot rule (owner ruling: ceil(count × per10 / 10))');
  {
    const page = await boot();
    const r = await page.evaluate(ids => {
      STATE.materials = {}; // items only here (materials: their own section)
      const out = [];
      for (const id of ids) {
        const p10 = itemDef(id).cargo_slots_per_10;
        for (const n of [1, 5, 10, 11]) {
          STATE.items = Array(n).fill(id);
          out.push({ id, n, p10, got: cargoSlotsUsed(), want: Math.ceil(n * p10 / 10) });
        }
      }
      STATE.items = [];
      return out;
    }, STACKABLES);
    ok(r.every(x => x.got === x.want), 'every stackable at 1/5/10/11: ' + r.filter(x => x.id === 'fuel_cell').map(x => x.n + '→' + x.got).join(' ') + ' (fuel cell); all ' + r.length + ' cases match');
    ok(r.find(x => x.id === 'fuel_cell' && x.n === 1).got === 1 && r.find(x => x.id === 'medkit' && x.n === 10).got === 1 && r.find(x => x.id === 'fuel_cell' && x.n === 11).got === 4,
      'one fuel cell = 1 slot (was 3); ten medkits = 1; eleven fuel cells = 4 (was 6)');
    const g = await page.evaluate(() => {
      STATE.items = []; STATE.materials = {}; // (materials are cargo too — their own section below)
      const cap = cargoCapacity();
      let n = 0; while (grantItem('fuel_cell') && n < 200) n++;
      const capFull = cargoSlotsUsed();
      const lock = lockReason({ text: 'x', outcome: { item_grant: 'fuel_cell' } });
      const lockMedkit = lockReason({ text: 'x', outcome: { item_grant: 'medkit' } });
      grantItem('insulated_cargo_bay');
      const cap2 = cargoCapacity(), parts = cargoCapacityParts();
      let m = 0; while (grantItem('fuel_cell') && m < 200) m++;
      return { cap, n, capFull, lock, lockMedkit, cap2, parts, m, canBay: canRemoveItem('insulated_cargo_bay') };
    });
    ok(g.n === Math.floor(g.cap * 10 / 3) && g.capFull <= g.cap, `capacity gate on the new rule: ${g.n} fuel cells fit a ${g.cap}-slot hold (⌈${g.n}×0.3⌉ = ${g.capFull}); the next is refused`);
    ok(g.lock === 'No cargo space' && g.lockMedkit === 'No cargo space', 'choice lock previews the new rule (no room for one more)');
    ok(g.cap2 === g.cap + 5 && g.parts.bonus === 5 && g.m === Math.floor(g.cap2 * 10 / 3) - g.n, `cargo bay: items.json slot_bonus +5 (cap ${g.cap2}); ${g.m} more cells fit`);
    ok(!g.canBay, 'the cargo bay still cannot leave while its slots are in use');
    await page.close();
  }

  console.log('— materials are cargo (owner ruling: Bible §14.1, cargo_slots_per_10 1)');
  {
    const page = await boot();
    const d = await page.evaluate(() => ({
      per10: MOD.materials.materials.map(m => m.id + ':' + m.cargo_slots_per_10),
      legacy: MOD.materials.materials.some(m => 'cargo_slots' in m),
      metal: [1, 5, 10, 11, 35].map(n => itemSlotsFor('metal', n)),
      start: Object.assign({}, STATE.materials), startSlots: materialSlotsUsed(), used: cargoSlotsUsed(), items: STATE.items.slice(),
    }));
    ok(d.per10.every(x => x.endsWith(':1')) && !d.legacy, 'materials.json: every material cargo_slots_per_10 1 (' + d.per10.join(' ') + ')');
    ok(JSON.stringify(d.metal) === '[1,1,1,2,4]', 'metal at 1/5/10/11/35 = ' + d.metal.join('/') + ' slots (ceil(n × 1 / 10))');
    ok(d.startSlots === 2 && JSON.stringify(d.start) === '{"metal":4,"scrap":2}', `starting stores (metal 4, scrap 2) take ${d.startSlots} slots (hold ${d.used} used with ${d.items.join('+')})`);
    // The one grant path: take what fits, log what stays behind.
    const g = await page.evaluate(() => {
      STATE.materials = {}; STATE.items = [];
      while (cargoSlotsUsed() < cargoCapacity() - 1) STATE.items.push('gas_analyzer');
      const r = grantMaterials({ metal: 25 });
      const log = (STATE.shipLog || []).slice(-1)[0].text;
      const full = grantMaterial('scrap', 3);
      return { got: r.got, left: r.left, metal: STATE.materials.metal, used: cargoSlotsUsed(), cap: cargoCapacity(), log, full, log2: STATE.shipLog.slice(-1)[0].text };
    });
    ok(g.got.metal === 10 && g.left.metal === 15 && g.metal === 10 && g.used === g.cap, `grantMaterials: 25 metal into 1 free slot → 10 aboard, 15 left (${g.used}/${g.cap})`);
    ok(/CARGO FULL — 15 metal left behind/.test(g.log) && g.full === 0 && /3 scrap left behind/.test(g.log2), `no silent loss: "${g.log}"`);
    // Event outcome materials (incl. the botanist's OFFER A SAMPLE) + an honest preview.
    const e = await page.evaluate(() => {
      STATE.materials = {}; STATE.items = [];
      while (cargoSlotsUsed() < cargoCapacity() - 1) STATE.items.push('gas_analyzer');
      const facts = outcomeFacts({ materials: { biocomponent: 30 } }).map(f => f.text);
      applyOutcomeEffects({ materials: { biocomponent: 30 } });
      const after = STATE.materials.biocomponent;
      const none = outcomeFacts({ materials: { exotic: 2 } }).map(f => f.text);
      STATE.materials.biocomponent = 5; STATE.items = [];
      const fits = outcomeFacts({ materials: { biocomponent: 3 } }).map(f => f.text);
      const ev = EVENTS.event_station_012;
      const sample = JSON.stringify(ev).match(/"materials":\{"biocomponent":3\}/) || JSON.stringify(ev).match(/"materials": \{"biocomponent": 3\}/);
      const cost = (applyOutcomeEffects({ materials: { biocomponent: -2 } }), STATE.materials.biocomponent);
      return { facts, after, none, fits, sample: !!sample, cost };
    });
    ok(e.facts.includes('+10 BIOCOMPONENT (HOLD FULL)') && e.after === 10, `event materials: preview "${e.facts.join(', ')}" = what lands (${e.after})`);
    ok(e.none.includes('NO ROOM FOR EXOTIC') && e.fits.includes('+3 BIOCOMPONENT'), 'a full hold previews NO ROOM; room previews the full gain');
    ok(e.sample && e.cost === 3, "the botanist's sample trade rides the same outcome path; material costs still subtract");
    // MINE and SALVAGE through the real verbs (minigames stubbed to a fixed haul).
    const verb = async (type, re, stub) => page.evaluate(async ({ type, re, stub }) => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      returnToHub(); await w(50);
      STATE.materials = {}; STATE.items = [];
      while (cargoSlotsUsed() < cargoCapacity() - 2) STATE.items.push('gas_analyzer');
      const node = STATE.byId[STATE.currentId]; node.node_type = type; STATE.traderAt = {};
      if (stub === 'mine') window.openMining = cb => cb({ inventory: { metal: 15, minerals: 20 }, runs: 1 });
      else window.openMinigame = (id, o, cb) => cb('good', { salvage: { scrap: 25, metal: 5 } });
      renderCruise(); await w(50);
      if (!document.body.classList.contains('stop-active')) document.getElementById('stop-btn').click();
      if (typeof window.refreshStopMenu === 'function') window.refreshStopMenu(); // the verb list follows the (re-typed) node
      await w(80);
      const btn = [...document.querySelectorAll('#stop-choices .stop-choice:not(.locked)')].find(b => new RegExp(re).test((b.querySelector('.stop-choice-body') || b).textContent));
      if (!btn) return { missing: [...document.querySelectorAll('#stop-choices .stop-choice')].map(b => b.textContent.trim().slice(0, 20)) };
      btn.click(); await w(150);
      const step = document.querySelector('#stop-choices .day-step'); if (step) { step.click(); await w(150); }
      return { mats: Object.assign({}, STATE.materials), used: cargoSlotsUsed(), cap: cargoCapacity(), log: STATE.shipLog.slice(-4).map(x => x.text).join(' | ') };
    }, { type, re, stub });
    const m = await verb('asteroid_field', '^MINE', 'mine');
    ok(!m.missing && m.mats.metal === 15 && !m.mats.minerals && m.used === m.cap && /20 minerals left behind/.test(m.log) && /no room for minerals/.test(m.log), `MINE: the haul lands as far as the hold allows (${JSON.stringify(m.mats || m.missing)}; ${(m.log || '').slice(0, 140)})`);
    const v = await verb('derelict', '^SALVAGE', 'salvage');
    ok(!v.missing && v.mats.scrap === 20 && !v.mats.metal && /5 scrap, 5 metal left behind/.test(v.log), `SALVAGE: same rule (${JSON.stringify(v.mats || v.missing)}; ${(v.log || '').slice(0, 140)})`);
    await page.close();
  }

  console.log('— materials: market locks, sells and the fabricator free space, inventory');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.items = []; STATE.goldAmount = 500;
      STATE.materials = { metal: 1 };
      while (cargoSlotsUsed() < cargoCapacity()) STATE.items.push('gas_analyzer');
      openMarket({}); await w(50);
      const row = () => [...document.querySelectorAll('#market-buy-list .market-row')].find(x => /FUEL CELL/.test(x.textContent));
      const locked = { btn: row().querySelector('.market-row-btn').textContent, dis: row().querySelector('.market-row-btn').disabled, tip: row().dataset.tipDescription };
      const metalRow = [...document.querySelectorAll('#market-sell-list .market-row')].find(x => /METAL/.test(x.textContent));
      metalRow.querySelector('button').click(); await w(50);
      const after = { btn: row().querySelector('.market-row-btn').textContent, dis: row().querySelector('.market-row-btn').disabled, metal: STATE.materials.metal || 0, used: cargoSlotsUsed(), cap: cargoCapacity() };
      MarketModal.close(); await w(50);
      // The fabricator spends materials → space comes back.
      STATE.items = []; STATE.materials = { metal: 11, scrap: 11, minerals: 11, biocomponent: 11, exotic: 11 }; // 2 slots each: any unit spent frees one
      const before = materialSlotsUsed();
      openFabricator(); await w(300);
      const rec = MOD.recipes.recipes.find(x => x.id === 'recipe_hull_patch') || MOD.recipes.recipes[0];
      [...document.querySelectorAll('.fb-recipe-row')].find(x => x.textContent.includes(rec.name)).click();
      craftSelected(); await w(50);
      const fab = { before, after: materialSlotsUsed(), mats: Object.assign({}, STATE.materials) };
      closeFabricator(); if (window.abortFabricator) window.abortFabricator();
      return { locked, after, fab };
    });
    ok(r.locked.btn === 'NO ROOM' && r.locked.dis && /No room in the hold/.test(r.locked.tip || ''), `a buy the hold can't take is locked with the reason ("${r.locked.btn}" — ${r.locked.tip})`);
    ok(r.after.metal === 0 && r.after.used < r.after.cap && r.after.btn === 'BUY' && !r.after.dis, `selling the metal frees its slot; the buy unlocks (${r.after.used}/${r.after.cap})`);
    ok(r.fab.after < r.fab.before, `fabricator consumption frees space (materials ${r.fab.before} → ${r.fab.after} slots)`);
    const inv = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.items = ['gas_analyzer', 'gas_analyzer']; STATE.materials = { metal: 35, scrap: 46 };
      openInventory();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true })); await w(20);
      document.querySelector('#inv-grid .inv-tile[data-id="metal"]').click();
      const rows = [...document.querySelectorAll('#inv-detail-meta .detail-stat')].map(d => d.textContent);
      const tip = document.getElementById('inv-slots').dataset.tipDescription;
      const tipRows = JSON.parse(document.getElementById('inv-slots').dataset.tipRows);
      const footer = document.getElementById('inv-footer') ? document.getElementById('inv-footer').textContent.trim() : ''; // ruling 42 (b4): no footer
      const jettShown = getComputedStyle(document.getElementById('inv-jett-btn')).display !== 'none';
      document.querySelector('#inv-grid .inv-tile[data-id="scrap"]').click();
      const used0 = cargoSlotsUsed();
      document.getElementById('inv-jett-btn').click();
      const max = document.getElementById('inv-jett-all').classList.contains('hidden') ? 0 : 1;
      document.getElementById('inv-jett-all').click();
      return { rows, tip, tipRows, footer, jettShown, max, scrap: STATE.materials.scrap, used0, used1: cargoSlotsUsed(), log: STATE.shipLog.slice(-1)[0].text,
        copy: document.getElementById('inv-card').textContent, pools: JSON.stringify(MOD.flavor.ai_universal.cargo_hold.category.material) };
    });
    ok(inv.rows[1] === 'SLOT COST0.1 per unit 4 total', `MATERIALS detail carries the slot cost ("${inv.rows[1]}")`);
    ok(/^2 gear · 9 materials/.test(inv.tip) && inv.tipRows[0].value === '2' && inv.tipRows[1].label === 'Materials' && inv.tipRows[1].value === '9', `readout breakdown (Bible): "${inv.tip.slice(0, 22)}"`);
    ok(inv.footer === '' && !/don.t use cargo|own stores|off the cargo manifest|don.t take cargo/i.test(inv.copy + inv.pools), 'the "materials are free" copy is gone (footer, detail, AI lines)');
    ok(inv.jettShown && inv.max && inv.scrap === 0 && inv.used1 === inv.used0 - 5 && /Jettisoned: 46 scrap/.test(inv.log), `materials can go out the airlock too (JETTISON ALL scrap: ${inv.used0} → ${inv.used1} slots)`);
    await page.close();
  }

  console.log('— materials: combat loot into a full hold');
  {
    const page = await boot({ captain: 'engineer', crew: ['botanist', 'chef'] });
    const click = t => page.evaluate(t => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.textContent.includes(t) && !b.classList.contains('combat-fading-out')); if (!b) return false; b.click(); return true; }, t);
    const has = t => page.evaluate(t => [...document.querySelectorAll('#enc-choices .enc-choice')].some(b => b.textContent.includes(t)), t);
    await page.evaluate(() => { Math.random = () => 0.5; enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001); });
    await page.waitForTimeout(250);
    await page.evaluate(() => window.triggerCombat({}));
    await page.waitForTimeout(450);
    // Fight until the pirate is beaten (wrecked → SALVAGE WRECKAGE, or it
    // surrenders → FINISH THEM); both pay metal/scrap through the same path.
    let end = null;
    for (let i = 0; i < 14 && !end; i++) {
      if (await has('SALVAGE WRECKAGE')) end = 'SALVAGE WRECKAGE';
      else if (await has('FINISH THEM')) end = 'FINISH THEM'; // a surrender pays no materials; finishing them does
      else { if (await has('FIRE LASER')) { await click('FIRE LASER'); await page.waitForTimeout(80); await page.keyboard.press('Enter'); } await page.waitForTimeout(1300); }
    }
    // A full hold: every drop (Math.random 0.2) meets no room.
    await page.evaluate(() => { STATE.materials = {}; STATE.items = []; while (cargoSlotsUsed() < cargoCapacity()) STATE.items.push('gas_analyzer'); Math.random = () => 0.2; });
    await click(end || 'SALVAGE WRECKAGE');
    for (let i = 0; i < 20 && end === 'FINISH THEM' && !(await page.evaluate(() => document.getElementById('combat-end-overlay').classList.contains('show'))); i++) { if (await has('SALVAGE WRECKAGE')) { await click('SALVAGE WRECKAGE'); break; } await page.waitForTimeout(200); }
    await page.waitForFunction(() => document.getElementById('combat-end-overlay').classList.contains('show'), null, { timeout: 4000 }).catch(() => {});
    const r = await page.evaluate(() => ({ mats: Object.assign({}, STATE.materials), notes: (document.querySelector('#combat-end-loot .end-loot-notes') || {}).textContent || '',
      tiles: [...document.querySelectorAll('#combat-end-loot .end-loot-tile')].map(t => t.dataset.id + ':' + t.dataset.count) }));
    ok(end && !Object.values(r.mats).some(v => v > 0) && /Hold full: .*× Metal.*left behind/.test(r.notes) && !r.tiles.some(t => /^(metal|scrap):[1-9]/.test(t)),
      `combat loot (${end}): metal meets a full hold → nothing lands, the card names what was left ("${r.notes.slice(0, 110)}")`);
    await page.close();
  }

  console.log('— SHIP RESOURCES row: real burn rates');
  {
    const page = await boot({ captain: 'veteran', crew: ['engineer', 'medic'] });
    const read = () => page.evaluate(() => {
      openInventory();
      return [...document.querySelectorAll('#inv-res-tiles .res-tile')].map(t => ({
        key: t.dataset.res,
        bg: getComputedStyle(t.querySelector('.res-tile-frame')).backgroundImage,
        lit: t.querySelectorAll('.gauge-seg.lit').length, segs: t.querySelectorAll('.gauge-seg').length,
        litOpacity: (t.querySelector('.gauge-seg.lit') ? getComputedStyle(t.querySelector('.gauge-seg.lit')).opacity : null),
        stats: [...t.querySelectorAll('.res-tile-stat strong')].map(s => s.textContent),
      }));
    });
    await page.evaluate(() => { STATE.resources.fuel = 64; STATE.resources.food = 31; STATE.resources.water = 7; STATE.daysElapsed = 20; });
    let t = await read();
    ok(t.length === 3 && ['cargo_fuel', 'cargo_food', 'cargo_water'].every((s, i) => t[i].bg.includes(s + '.png')), 'fuel / food / H2O tiles use sprites/cargo/cargo_fuel|food|water.png');
    ok(t.every(x => x.segs === 10) && t[0].lit === 6 && t[1].lit === 3 && t[2].lit === 1 && t[0].litOpacity === '1', `10-segment gauges lit from the level: ${t.map(x => x.lit).join('/')}`);
    const want = await page.evaluate(() => {
      const leg = legTravelCost();
      const f = leg.fuel / leg.exactDays;
      const food = ORDERS_BASE.foodPerDay * ordersRations().foodMult * foodBurnMult() * mouthsMult();
      const w = ORDERS_BASE.waterPerDay;
      return { f, food, w, ef: 20 + Math.floor(64 / f), efood: 20 + Math.floor(31 / food), ew: 20 + Math.floor(7 / w) };
    });
    // b4 A13: one decimal when exact, else two — the figure EMPTY uses (0.35 read "0.3").
    const fmt = v => '~' + (Math.abs(Math.round(v * 10) / 10 - v) < 1e-9 ? v.toFixed(1) : (Math.round(v * 100) / 100).toFixed(2)) + ' / DAY';
    ok(t[0].stats[0] === '64 / 100' && t[0].stats[1] === fmt(want.f) && t[0].stats[2] === 'DAY ' + want.ef, `FUEL: ${t[0].stats.join(' · ')} (legTravelCost: pace × fuelBurnMult)`);
    ok(t[1].stats[1] === fmt(want.food) && t[1].stats[2] === 'DAY ' + want.efood, `FOOD: ${t[1].stats.join(' · ')} (rations × foodBurnMult × mouths)`);
    ok(t[2].stats[1] === fmt(want.w) && t[2].stats[2] === 'DAY ' + want.ew, `H2O: ${t[2].stats.join(' · ')}`);
    await page.evaluate(() => { ensureOrders().pace = 'plaid'; ensureOrders().rations = 'pigout'; STATE.crew.push('chef'); STATE.crewHP.chef = 100; });
    const t2 = await read();
    ok(parseFloat(t2[0].stats[1].slice(1)) > parseFloat(t[0].stats[1].slice(1)) && parseFloat(t2[1].stats[1].slice(1)) !== parseFloat(t[1].stats[1].slice(1)),
      `PLAID + PIG OUT + a third mouth move USE: fuel ${t[0].stats[1]} → ${t2[0].stats[1]}, food ${t[1].stats[1]} → ${t2[1].stats[1]}`);
    await page.evaluate(() => { STATE.resources.water = 0; });
    const t3 = await read();
    ok(t3[2].stats[2] === 'NOW', 'an empty tank reads EMPTY NOW');
    // Click-through detail + the AI line in all five voices.
    const d = await page.evaluate(() => {
      for (let i = 0; i < 3; i++) grantItem('fuel_cell');
      const out = {};
      for (const ai of ['aria', 'marv', 'rex', 'chip', 'ajoy']) {
        STATE.activeAI = ai;
        openInventory();
        document.querySelector('.res-tile[data-res="fuel"]').click();
        const line = document.getElementById('inv-detail-ai').textContent;
        const pool = MOD.flavor.ai_universal.cargo_hold.resource.fuel[ai];
        out[ai] = { line, inPool: pool.some(p => line.endsWith(p)), name: document.querySelector('#inv-detail-ai .detail-ai-name').textContent };
      }
      out.name = document.getElementById('inv-detail-name').textContent;
      out.cat = document.getElementById('inv-detail-cat').textContent;
      out.meta = document.getElementById('inv-detail-meta').textContent;
      out.selected = document.querySelector('.res-tile[data-res="fuel"]').classList.contains('selected');
      out.actions = getComputedStyle(document.getElementById('inv-detail-actions')).display;
      return out;
    });
    ok(d.name === 'FUEL' && d.cat === 'SHIP RESOURCE' && /IN CARGO×3 Fuel Cell/.test(d.meta), `resource detail: ${d.name} · ${d.cat} · "${d.meta}"`);
    ok(['aria', 'marv', 'rex', 'chip', 'ajoy'].every(a => d[a].inPool && d[a].name === a.toUpperCase() + ':'), 'the AI line comes from cargo_hold.resource in all 5 voices (' + d.ajoy.line.slice(0, 50) + '…)');
    ok(d.selected && d.actions === 'none', 'the tile shows selected; no item actions under a resource');
    const pools = await page.evaluate(() => { const c = MOD.flavor.ai_universal.cargo_hold; let n = 0; for (const s of ['resource', 'category']) for (const k of Object.keys(c[s])) for (const ai of ['aria', 'marv', 'rex', 'chip', 'ajoy']) n += (c[s][k][ai] || []).length ? 1 : 0; return n; });
    ok(pools === 45, `flavor pool slot filled: 3 resources + 6 categories × 5 AIs (${pools}/45)`);
    await page.close();
  }

  console.log('— tabs, counts, 1/2/3 keys, sections, empty states');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.items = []; STATE.materials = {};
      openInventory();
      const empties = {};
      for (const k of ['1', '2', '3']) { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); await w(20); empties[_invTab] = document.querySelector('#inv-grid .inv-empty').textContent; }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
      for (const id of ['gas_analyzer', 'fuel_cell', 'fuel_cell', 'medkit', 'pre_collapse_artifact', 'logbook_fragment', 'hull_plating', 'insulated_cargo_bay']) grantItem(id);
      STATE.materials = { metal: 9, scrap: 3 };
      renderInventory();
      const counts = ['gear', 'materials', 'upgrades'].map(t => document.getElementById('inv-count-' + t).textContent);
      const sections = [...document.querySelectorAll('#inv-grid .grid-section-header')].map(h => h.textContent);
      const order = [...document.querySelectorAll('#inv-grid > *')].map(e => e.classList.contains('grid-section-header') ? '|' : e.dataset.id);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true })); await w(20);
      const up = { tab: _invTab, tiles: [...document.querySelectorAll('#inv-grid .inv-tile')].map(t => t.dataset.id), active: document.querySelector('.inv-tab.active').dataset.tab,
        activeColor: getComputedStyle(document.querySelector('.inv-tab.active')).color, underline: getComputedStyle(document.querySelector('.inv-tab.active'), '::after').backgroundColor };
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true })); await w(20);
      const mats = [...document.querySelectorAll('#inv-grid .inv-tile')].map(t => t.dataset.id);
      return { empties, counts, sections, order, up, mats };
    });
    ok(r.empties.gear === '"Bare."' && r.empties.materials === '"Nothing mined yet."' && r.empties.upgrades === '"Stock configuration."', 'demo empty-state copy per tab, and 1/2/3 switch tabs');
    ok(r.counts[0] === '(5)' && r.counts[1] === '(2)' && r.counts[2] === '(2 INSTALLED)', 'tab counts: ' + r.counts.join(' '));
    ok(JSON.stringify(r.sections) === JSON.stringify(['— Instruments —', '— Consumables —', '— Curiosities —', '— Story —']), 'GEAR sections in demo order');
    ok(r.order.join(',').startsWith('|,gas_analyzer,|,') && r.order.indexOf('logbook_fragment') > r.order.indexOf('pre_collapse_artifact'), 'items file under their section: ' + r.order.join(','));
    ok(r.up.tab === 'upgrades' && r.up.active === 'upgrades' && r.up.tiles.length === 2 && r.up.activeColor === 'rgb(208, 200, 144)' && r.up.underline === 'rgb(232, 136, 48)', 'key 3 → UPGRADES (active tab cream, orange underline)');
    ok(JSON.stringify(r.mats) === JSON.stringify(['metal', 'scrap']), 'key 2 → MATERIALS (materials.json order)');
    await page.close();
  }

  console.log('— SORT dropdown');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.items = []; STATE.itemPickups = {};
      // pickup order: medkit, repair_kit, sealed_vinyl, fuel_cell×5, spectrometer
      grantItem('medkit'); grantItem('repair_kit'); grantItem('sealed_vinyl');
      for (let i = 0; i < 5; i++) grantItem('fuel_cell');
      grantItem('spectrometer');
      openInventory();
      const ids = () => [...document.querySelectorAll('#inv-grid .inv-tile')].map(t => t.dataset.id);
      const out = { recent: ids() };
      for (const s of ['alpha', 'slots', 'price']) {
        document.getElementById('inv-sort-btn').click(); await w(20);
        const open = document.getElementById('inv-sort').classList.contains('open') && getComputedStyle(document.querySelector('#inv-sort .sort-flyout')).display === 'block';
        document.querySelector('#inv-sort .sort-option[data-sort="' + s + '"]').click(); await w(20);
        out[s] = { ids: ids(), open, closed: !document.getElementById('inv-sort').classList.contains('open'), label: document.getElementById('inv-sort-current').textContent };
      }
      document.getElementById('inv-sort-btn').click(); await w(10);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await w(10);
      out.escClosesFlyout = !document.getElementById('inv-sort').classList.contains('open') && document.getElementById('overlay-inventory').classList.contains('active');
      out.prices = Object.fromEntries(['medkit', 'repair_kit', 'sealed_vinyl', 'fuel_cell', 'spectrometer'].map(id => [id, stationBuyPrice(id)]));
      return out;
    });
    // Within sections: instruments (spectrometer) / consumables (repair_kit is one_use, medkit, fuel_cell) / curiosities (sealed_vinyl)
    ok(JSON.stringify(r.recent) === JSON.stringify(['spectrometer', 'fuel_cell', 'repair_kit', 'medkit', 'sealed_vinyl']), 'Recent: newest pickup first within each section — ' + r.recent.join(','));
    ok(r.alpha.label === 'A–Z' && r.alpha.open && r.alpha.closed && JSON.stringify(r.alpha.ids) === JSON.stringify(['spectrometer', 'fuel_cell', 'medkit', 'repair_kit', 'sealed_vinyl']), 'A–Z — ' + r.alpha.ids.join(','));
    ok(r.slots.label === 'Slot cost' && JSON.stringify(r.slots.ids.slice(1, 4)) === JSON.stringify(['fuel_cell', 'medkit', 'repair_kit']), 'Slot cost: 5 fuel cells (2) before a medkit / repair kit (1) — ' + r.slots.ids.join(','));
    ok(r.price.label === 'Sell price' && JSON.stringify(r.price.ids.slice(1, 4)) === JSON.stringify(['repair_kit', 'fuel_cell', 'medkit']),
      `Sell price — ${r.price.ids.join(',')} (${JSON.stringify(r.prices)})`);
    ok(r.escClosesFlyout, 'Esc closes the open flyout, not the hold');
    await page.close();
  }

  console.log('— NEW badge (fresh pickups, cleared once seen), saved; no provenance');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      grantItem('gas_analyzer');
      grantItem('pre_collapse_artifact');
      openInventory();
      const tile = id => document.querySelector('#inv-grid .inv-tile[data-id="' + id + '"]');
      const newBadge = tile('gas_analyzer').querySelector('.inv-tile-new');
      const out = { newShown: !!newBadge, anim: newBadge && getComputedStyle(newBadge).animationName, kitNew: !!tile('soil_sampler').querySelector('.inv-tile-new') };
      tile('gas_analyzer').click();
      out.newAfter = !!tile('gas_analyzer').querySelector('.inv-tile-new');
      out.noAcq = !document.getElementById('inv-detail-acquired') && !/ACQUIRED/.test(document.getElementById('inv-card').textContent);
      out.marks = JSON.stringify(STATE.itemPickups.gas_analyzer);
      closeInventory();
      return out;
    });
    ok(r.newShown && r.anim === 'inv-new-pulse' && !r.kitNew, 'a fresh pickup wears the pulsing NEW badge; the launch loadout does not');
    ok(!r.newAfter, 'NEW clears once the tile is clicked');
    ok(r.noAcq && !/"d"|"w"/.test(r.marks), 'owner ruling: no ACQUIRED line, no day/place recorded (' + r.marks + ')');
    await reloadAndContinue(page);
    const after = await page.evaluate(() => {
      openInventory();
      const tile = id => document.querySelector('#inv-grid .inv-tile[data-id="' + id + '"]');
      return { gasNew: !!tile('gas_analyzer').querySelector('.inv-tile-new'), artNew: !!tile('pre_collapse_artifact').querySelector('.inv-tile-new') };
    });
    ok(!after.gasNew && after.artNew, 'save → reload keeps which pickups are still NEW');
    // An old save (no itemPickups / itemSeq) loads clean.
    await page.evaluate(() => { grantItem('medkit'); returnToHub(); saveRun();
      const snap = JSON.parse(localStorage.getItem('transplant_save_v1')); delete snap.itemPickups; delete snap.itemSeq; localStorage.setItem('transplant_save_v1', JSON.stringify(snap)); });
    await reloadAndContinue(page);
    const old = await page.evaluate(() => {
      openInventory();
      const t = document.querySelector('#inv-grid .inv-tile[data-id="medkit"]');
      const isNew = !!t.querySelector('.inv-tile-new');
      grantItem('fuel_cell'); renderInventory();
      const fresh = !!document.querySelector('#inv-grid .inv-tile[data-id="fuel_cell"] .inv-tile-new');
      return { ok: !document.querySelector('#screen-title.active'), isNew, fresh, marks: STATE.itemPickups.medkit, saved: saveRun() };
    });
    ok(old.ok && !old.isNew && old.fresh && old.marks.length === 1 && old.saved, 'a pre-ruling save loads: nothing aboard is NEW; the next pickup is');
    // A fabricator claim (pushed outside grantItem) still arrives NEW.
    const fab = await page.evaluate(() => { STATE.items.push('hull_patch'); openInventory(); return !!document.querySelector('#inv-grid .inv-tile[data-id="hull_patch"] .inv-tile-new'); });
    ok(fab, 'a print claimed from the fabricator arrives NEW');
    await page.close();
  }

  console.log('— detail rows, price corner, ⇄ NOTES, USED FOR, rolled values');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      for (let i = 0; i < 5; i++) grantItem('fuel_cell');
      grantItem('insulated_cargo_bay'); grantItem('logbook_fragment'); grantItem('unidentified_bone');
      STATE.itemValues.unidentified_bone = [17];
      STATE.materials = { metal: 7 };
      openInventory();
      const pick = (sel) => { document.querySelector(sel).click(); };
      const rows = () => [...document.querySelectorAll('#inv-detail-meta .detail-stat')].map(d => d.textContent);
      const out = {};
      pick('#inv-grid .inv-tile[data-id="fuel_cell"]');
      out.fuel = { rows: rows(), cat: document.getElementById('inv-detail-cat').textContent, used: document.getElementById('inv-detail-used').textContent,
        corner: document.querySelector('#inv-grid .inv-tile[data-id="fuel_cell"] .inv-tile-price').textContent, count: document.querySelector('#inv-grid .inv-tile[data-id="fuel_cell"] .inv-tile-count').textContent,
        ai: document.getElementById('inv-detail-ai').textContent };
      pick('#inv-grid .inv-tile[data-id="logbook_fragment"]');
      out.log = { rows: rows(), cat: document.getElementById('inv-detail-cat').textContent, notes: document.getElementById('inv-detail-notes').textContent,
        marker: (document.querySelector('#inv-grid .inv-tile[data-id="logbook_fragment"] .inv-tile-trade') || {}).textContent, used: document.getElementById('inv-detail-used').textContent };
      pick('#inv-grid .inv-tile[data-id="unidentified_bone"]');
      out.bone = { rows: rows(), corner: document.querySelector('#inv-grid .inv-tile.selected .inv-tile-value').textContent, notes: document.getElementById('inv-detail-notes').textContent };
      grantItem('spectrometer'); renderInventory();
      out.boneKnown = { rows: rows(), corner: document.querySelector('#inv-grid .inv-tile.selected .inv-tile-value').textContent };
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
      pick('#inv-grid .inv-tile[data-id="insulated_cargo_bay"]');
      out.bay = { rows: rows(), cat: document.getElementById('inv-detail-cat').textContent };
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
      pick('#inv-grid .inv-tile[data-id="metal"]');
      out.metal = { rows: rows(), cat: document.getElementById('inv-detail-cat').textContent, name: document.getElementById('inv-detail-name').textContent, acts: getComputedStyle(document.getElementById('inv-detail-actions')).display, use: getComputedStyle(document.getElementById('inv-use-btn')).display, jett: getComputedStyle(document.getElementById('inv-jett-btn')).display, slot: rows()[1] };
      out.wantFuel = stationBuyPrice('fuel_cell'); out.wantMetal = stationBuyPrice('metal');
      out.fumes = Object.values(EVENTS).find(e => JSON.stringify(e).includes('"requires_item": "fuel_cell"') || JSON.stringify(e).includes('"requires_item":"fuel_cell"'));
      out.fumes = out.fumes && out.fumes.title;
      return out;
    });
    ok(r.fuel.cat === 'CONSUMABLE' && JSON.stringify(r.fuel.rows) === JSON.stringify(['COUNT×5', 'SLOT COST0.3 per unit 2 total', 'SELL PRICE' + r.wantFuel + 'g each']), 'stack detail: ' + r.fuel.rows.join(' | '));
    ok(r.fuel.corner === r.wantFuel + 'g' && r.fuel.count === '×5', `tile corners: count ${r.fuel.count}, price ${r.fuel.corner}`);
    ok(r.fumes && r.fuel.used === 'USED FOR: ' + r.fumes, `USED FOR from the events (${r.fuel.used})`);
    ok(/^MARV:/.test(r.fuel.ai), 'an AI line in the item detail (category pool): ' + r.fuel.ai.slice(0, 60));
    ok(r.log.cat === 'STORY' && r.log.marker === '⇄' && /NOTES⇄Not for sale/.test(r.log.notes) && r.log.rows[2] === 'SELL PRICE—' && /USED FOR: .+ · /.test(r.log.used), 'story item: ⇄ corner, NOTES, SELL PRICE —, several USED FOR events');
    ok(r.bone.corner === '??' && r.bone.rows[2] === 'SELL PRICE4–28g · fence 6–42g' && /needs a spectrometer/.test(r.bone.rows[3]) && r.bone.notes === '', 'rolled value hidden without a spectrometer (range + ??)');
    ok(r.boneKnown.corner === '17g' && r.boneKnown.rows[2] === 'SELL PRICE17g · fence 26g', 'with a spectrometer: the exact copy value');
    ok(r.bay.cat === 'UPGRADE' && r.bay.rows[1] === 'SLOT COST0 (+5 cap)', 'cargo bay: SLOT COST 0 (+5 cap)');
    ok(r.metal.cat === 'MATERIAL' && r.metal.name === 'Metal' && r.metal.rows[2] === 'SELL PRICE' + r.wantMetal + 'g each' && r.metal.use === 'none' && r.metal.jett !== 'none' && /^SLOT COST0\.1 per unit/.test(r.metal.slot), 'material detail: name from materials.json, slot cost, unit price, JETTISON (no USE)');
    await page.close();
  }

  console.log('— jettison: picker, ALL, red overlay, poof, the right copy');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < 5; i++) grantItem('fuel_cell');
      openInventory();
      document.querySelector('#inv-grid .inv-tile[data-id="fuel_cell"]').click();
      document.getElementById('inv-jett-btn').click();
      const panel = document.getElementById('inv-jett-panel');
      const out = { border: getComputedStyle(panel).borderTopColor, title: document.querySelector('#inv-confirm .jettison-title').textContent,
        rowShown: getComputedStyle(document.getElementById('inv-jett-count-row')).display !== 'none', allShown: getComputedStyle(document.getElementById('inv-jett-all')).display !== 'none',
        minusOff: document.getElementById('inv-jett-minus').disabled, warn: getComputedStyle(document.getElementById('inv-route-warn')).display };
      for (let i = 0; i < 9; i++) document.getElementById('inv-jett-plus').click();
      out.capped = document.getElementById('inv-jett-count').textContent;
      document.getElementById('inv-jett-minus').click(); document.getElementById('inv-jett-minus').click();
      out.label = document.getElementById('inv-confirm-yes').textContent;
      const tile = document.querySelector('#inv-grid .inv-tile[data-id="fuel_cell"]');
      document.getElementById('inv-confirm-yes').click();
      document.getElementById('inv-confirm-yes').click(); // double click: one trip
      out.left = STATE.items.filter(x => x === 'fuel_cell').length;
      out.poof = tile.querySelectorAll('.poof-particle').length;
      out.partialFade = tile.classList.contains('jettisoning');
      await w(450);
      out.count = document.querySelector('#inv-grid .inv-tile[data-id="fuel_cell"] .inv-tile-count').textContent;
      document.querySelector('#inv-grid .inv-tile[data-id="fuel_cell"]').click();
      document.getElementById('inv-jett-btn').click();
      const t2 = document.querySelector('#inv-grid .inv-tile[data-id="fuel_cell"]');
      document.getElementById('inv-jett-all').click();
      out.allLeft = STATE.items.filter(x => x === 'fuel_cell').length;
      out.fade = t2.classList.contains('jettisoning');
      await w(60);
      out.fadeAnim = getComputedStyle(t2).animationName;
      await w(600);
      out.gone = !document.querySelector('#inv-grid .inv-tile[data-id="fuel_cell"]');
      out.detailEmpty = !document.getElementById('inv-detail-empty').classList.contains('hidden');
      return out;
    });
    ok(r.border === 'rgb(204, 51, 51)' && r.title === '⚠ JETTISON?' && r.warn === 'none', 'red ⚠ JETTISON? overlay (no route warning for a fuel cell)');
    ok(r.rowShown && r.allShown && r.minusOff && r.capped === '5', '−N+ picker capped at the stack (5), JETTISON ALL shown');
    ok(r.label === 'JETTISON 3' && r.left === 2, 'JETTISON 3 of 5 leaves 2 (a double click is one trip)');
    ok(r.poof >= 7 && r.poof <= 9 && !r.partialFade && r.count === '×2', `poof particles (${r.poof}); a partial stack stays put (×2)`);
    ok(r.allLeft === 0 && r.fade && r.fadeAnim === 'inv-tile-jettison' && r.gone && r.detailEmpty, 'JETTISON ALL: the tile zoom-fades out, then the grid repaints');
    const c = await page.evaluate(() => {
      for (let i = 0; i < 3; i++) grantItem('unidentified_bone');
      STATE.itemValues.unidentified_bone = [5, 20, 27];
      openInventory();
      const tiles = [...document.querySelectorAll('#inv-grid .inv-tile[data-id="unidentified_bone"]')];
      tiles[1].click();
      document.getElementById('inv-jett-btn').click();
      const single = getComputedStyle(document.getElementById('inv-jett-count-row')).display === 'none';
      const origins = itemPickupsOf('unidentified_bone').map(o => o.s);
      document.getElementById('inv-confirm-yes').click();
      return { single, left: itemValuesOf('unidentified_bone'), before: origins, after: itemPickupsOf('unidentified_bone').map(o => o.s) };
    });
    ok(c.single && JSON.stringify(c.left) === '[5,27]' && JSON.stringify(c.after) === JSON.stringify([c.before[0], c.before[2]]), 'one rolled-value copy leaves with its own value and mark (' + JSON.stringify(c.left) + ')');
    // Required for: only from real event data.
    const q = await page.evaluate(() => {
      grantItem('classified_cargo');
      openInventory();
      const tryJ = () => { document.querySelector('#inv-grid .inv-tile[data-id="classified_cargo"]').click(); document.getElementById('inv-jett-btn').click();
        const w = document.getElementById('inv-route-warn'); const out = { shown: getComputedStyle(w).display !== 'none', text: w.textContent, pulse: getComputedStyle(document.getElementById('inv-jett-panel')).animationName };
        document.getElementById('inv-confirm-no').click(); return out; };
      const without = tryJ();
      STATE.flags.add('courier_job_taken');
      const withFlag = tryJ();
      STATE.seenEventIds.add('event_station_010');
      const handoff = EVENTS.event_station_010;
      return { without, withFlag, once: handoff.once, title: handoff.title };
    });
    ok(!q.without.shown && q.withFlag.shown && q.withFlag.text === 'Required for: ' + q.title && q.withFlag.pulse === 'inv-jettison-warn',
      `"Required for: ${q.title}" only once the courier job is taken (the event needs it aboard to fire)`);
    await page.close();
  }

  console.log('— slot readout states, gold roll, layout');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.items = []; STATE.materials = {}; STATE.goldAmount = 140;
      const cap = cargoCapacity();
      openInventory();
      const g0 = +document.getElementById('inv-gold').textContent;
      await w(120);
      const gMid = +document.getElementById('inv-gold').textContent;
      await w(1000);
      const gEnd = +document.getElementById('inv-gold').textContent;
      const el = document.getElementById('inv-slots');
      const strong = document.getElementById('inv-slots-used');
      const color = () => getComputedStyle(strong).color;
      const normal = color();
      while (cargoSlotsUsed() < Math.ceil(cap * 0.9)) STATE.items.push('gas_analyzer');
      renderInventory(); await w(250);
      const near = { cls: el.classList.contains('near-cap'), color: color(), flash: strong.classList.contains('readout-flash') };
      while (cargoSlotsUsed() < cap) STATE.items.push('gas_analyzer');
      renderInventory(); await w(250);
      const at = { cls: el.classList.contains('at-cap'), color: color(), anim: getComputedStyle(el).animationName };
      const rows = JSON.parse(el.dataset.tipRows);
      const card = document.getElementById('inv-card').getBoundingClientRect();
      const col = document.getElementById('inv-detail-col').getBoundingClientRect();
      const grid = document.getElementById('inv-grid-host').getBoundingClientRect();
      const tile = document.querySelector('#inv-grid .inv-tile').getBoundingClientRect();
      return { g0, gMid, gEnd, normal, near, at, rows, cap, layout: { cw: card.width, ch: card.height, col: col.width, side: col.left > grid.right - 1, tile: tile.width },
        empty: document.getElementById('inv-detail-empty').textContent, sb: getComputedStyle(document.getElementById('inv-detail-scroll')).scrollbarWidth };
    });
    ok(r.g0 < 140 && r.gMid > r.g0 && r.gMid < 140 && r.gEnd === 140, `gold readout rolls up (${r.g0} → ${r.gMid} → ${r.gEnd})`);
    ok(r.near.cls && r.near.color === 'rgb(216, 168, 64)' && r.near.flash, 'amber at ≥90%, number flashes on change');
    ok(r.at.cls && r.at.color === 'rgb(204, 51, 51)' && r.at.anim === 'inv-slot-pulse', 'red pulse at the cap');
    ok(r.rows.some(x => x.label === 'Gear' && +x.value === r.cap) && r.rows.some(x => x.label === 'Materials' && x.value === '0') && r.rows.some(x => x.label === 'Capacity'), 'slot readout tip breaks the hold down (' + JSON.stringify(r.rows) + ')');
    ok(r.layout.cw === 816 && r.layout.ch === 600 && Math.round(r.layout.col) === 295 && r.layout.side && Math.round(r.layout.tile) === 88, 'side-column layout: 816×600 card, 88px tiles, 295px detail column right of the grid');
    ok(r.empty === 'Click an item or resource tile for details.' && r.sb === 'none', 'demo empty-detail copy; detail column uses the gold scrollbar');
    await page.close();
  }

  console.log('— Esc / close paths still hold');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      grantItem('medkit'); grantItem('medkit');
      openInventory(); await w(50);
      document.querySelector('#inv-grid .inv-tile[data-id="medkit"]').click();
      document.getElementById('inv-jett-btn').click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
      const tabStayed = _invTab === 'gear';
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await w(20);
      const a = { confirm: !document.getElementById('inv-confirm').classList.contains('hidden'), open: document.getElementById('overlay-inventory').classList.contains('active') };
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await w(20);
      return { tabStayed, a, closed: !document.getElementById('overlay-inventory').classList.contains('active'), medkits: STATE.items.filter(x => x === 'medkit').length };
    });
    ok(r.tabStayed && !r.a.confirm && r.a.open && r.closed && r.medkits === 2, 'number keys ignored under the confirm; Esc peels confirm, then the hold; nothing jettisoned');
    await page.close();
  }

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
