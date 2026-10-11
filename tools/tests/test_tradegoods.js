// Trade-good values (owner ruling 2026-10-11): every items.json item with
// a sell_range rolls its value per copy at pickup (any grant path), keeps
// it through save/load, jettison and sale; the station trader pays exactly
// that value (no CHIP/Merchant cut on selling), the fence FENCE_MULT × it;
// without a spectrometer the INV detail and sell offers show the range,
// with one the exact figure. Pre-ruling saves load and get values once.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function boot(setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
    STATE.items = []; STATE.itemValues = {};
  }, setup || {});
  await page.waitForTimeout(200);
  return page;
}
async function reloadAndContinue(page) {
  await page.reload();
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor);
  await page.evaluate(() => loadRun());
  await page.waitForTimeout(400);
}
const RANGED = ['pre_collapse_artifact', 'corporate_memorabilia', 'unidentified_bone', 'mystery_provisions'];

(async () => {
  browser = await chromium.launch();

  console.log('— the data');
  {
    const page = await boot();
    const r = await page.evaluate(ids => ids.map(id => { const d = itemDef(id); return { id, r: d.sell_range, bp: d.base_price, tag: (d.tags || []).includes('spectrometer_reveals_value') }; }), RANGED);
    ok(r.every(x => Array.isArray(x.r) && x.r[0] <= x.r[1] && x.bp == null && x.tag), 'the four curios carry a sell_range, no fixed base_price, and the spectrometer_reveals_value tag');
    const spec = await page.evaluate(() => { const d = itemDef('spectrometer'); return d.description + ' ' + d.gameplay_effect; });
    ok(/apprais/i.test(spec) && /exact value/i.test(spec) && /sell offers/i.test(spec), 'the spectrometer text says it appraises trade goods');
    await page.close();
  }

  console.log('— rolled at pickup, within range, on every grant path');
  {
    const page = await boot();
    const r = await page.evaluate(ids => {
      const out = {};
      for (const id of ids) {
        const [lo, hi] = sellRangeOf(id); let min = 1e9, max = -1, bad = 0;
        for (let i = 0; i < 600; i++) {
          STATE.items = []; STATE.itemValues = {};
          grantItem(id);
          const v = STATE.itemValues[id] && STATE.itemValues[id][0];
          if (!Number.isInteger(v) || v < lo || v > hi) bad++;
          min = Math.min(min, v); max = Math.max(max, v);
        }
        out[id] = { lo, hi, min, max, bad };
      }
      return out;
    }, RANGED);
    for (const [id, x] of Object.entries(r)) ok(!x.bad && x.min === x.lo && x.max === x.hi, `direct grant ${id}: 600 rolls all integers in [${x.lo}, ${x.hi}], both ends reached (${x.min}..${x.max})`);

    // Event path: event_crisis_006's "save the cans for trade" outcome.
    const ev = await page.evaluate(() => {
      STATE.items = []; STATE.itemValues = {};
      const ev = EVENTS.event_crisis_006;
      const ch = ev.choices.find(c => c.outcome && c.outcome.item_grant === 'mystery_provisions');
      applyOutcomeEffects(ch.outcome);
      const [lo, hi] = sellRangeOf('mystery_provisions'); const v = (STATE.itemValues.mystery_provisions || [])[0];
      return { held: STATE.items.includes('mystery_provisions'), v, lo, hi };
    });
    ok(ev.held && ev.v >= ev.lo && ev.v <= ev.hi, `event grant (event_crisis_006): mystery provisions valued ${ev.v} on pickup`);

    // Verb path: SALVAGE's curiosity roll (cruise.js) through the Stop menu.
    const sv = await page.evaluate(async () => {
      STATE.items = []; STATE.itemValues = {};
      const n = STATE.nodes.find(x => x.node_type !== 'fork' && x.node_type !== 'station'); n.node_type = 'derelict'; STATE.currentId = n.id;
      window.openMinigame = (id, opts, onDone) => onDone('perfect', { salvage: {} });
      const real = Math.random; Math.random = () => 0.1; // < 0.2 → a curio; 0.1×3 → the artifact
      try {
        document.body.classList.remove('stop-active'); document.getElementById('stop-btn').textContent = 'Stop'; returnToHub();
        await new Promise(r => setTimeout(r, 150));
        const b = [...document.querySelectorAll('#stop-choices .stop-choice')].find(x => /SALVAGE/.test(x.textContent));
        b.click();
        await new Promise(r => setTimeout(r, 300));
      } finally { Math.random = real; }
      const [lo, hi] = sellRangeOf('pre_collapse_artifact');
      return { held: STATE.items.includes('pre_collapse_artifact'), v: (STATE.itemValues.pre_collapse_artifact || [])[0], lo, hi };
    });
    ok(sv.held && sv.v >= sv.lo && sv.v <= sv.hi, `verb grant (SALVAGE curio): artifact valued ${sv.v} on pickup`);

    // Market path: the buy hands the ware to grantItem (shelve a curio for the test).
    const mk = await page.evaluate(async () => {
      STATE.items = []; STATE.itemValues = {}; STATE.goldAmount = 500;
      const d = itemDef('unidentified_bone'); const keep = { src: d.item_source, bp: d.base_price };
      d.item_source = 'purchasable'; d.base_price = 10;
      try {
        openMarket({});
        const row = [...document.querySelectorAll('#market-buy-list .market-row')].find(x => /UNIDENTIFIED BONE/.test(x.textContent));
        row.querySelector('.market-row-btn').click();
        MarketModal.close();
      } finally { d.item_source = keep.src; d.base_price = keep.bp; }
      const [lo, hi] = sellRangeOf('unidentified_bone');
      return { held: STATE.items.includes('unidentified_bone'), v: (STATE.itemValues.unidentified_bone || [])[0], lo, hi };
    });
    ok(mk.held && mk.v >= mk.lo && mk.v <= mk.hi, `market grant (BUY): bone valued ${mk.v} on pickup`);
    await page.close();
  }

  console.log('— copies, save/load, jettison');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      // Pin three distinct values so the copies are tellable apart.
      for (let i = 0; i < 3; i++) grantItem('unidentified_bone');
      STATE.itemValues.unidentified_bone = [5, 20, 27];
      grantItem('corporate_memorabilia');
      returnToHub();
      return { n: STATE.items.filter(x => x === 'unidentified_bone').length, vals: itemValuesOf('unidentified_bone'), saved: saveRun() };
    });
    ok(r.n === 3 && JSON.stringify(r.vals) === '[5,20,27]', 'three copies of one curio keep three separate values');
    const memo = await page.evaluate(() => STATE.itemValues.corporate_memorabilia[0]);
    await reloadAndContinue(page);
    const after = await page.evaluate(() => ({ bone: itemValuesOf('unidentified_bone'), memo: itemValuesOf('corporate_memorabilia') }));
    ok(r.saved && JSON.stringify(after.bone) === '[5,20,27]' && after.memo[0] === memo, `save → reload keeps every copy's value (${JSON.stringify(after)})`);
    // Jettison the middle bone (the 20) from the inventory.
    const j = await page.evaluate(() => {
      openInventory();
      const tiles = [...document.querySelectorAll('#inv-grid .inv-tile')].filter(t => /Unidentified Bone/i.test(t.getAttribute('title') || t.dataset.tipTitle || ''));
      tiles[1].click();
      document.getElementById('inv-jett-btn').click();
      document.getElementById('inv-confirm-yes').click();
      const left = itemValuesOf('unidentified_bone');
      hideOverlay('overlay-inventory');
      return { tiles: tiles.length, left, n: STATE.items.filter(x => x === 'unidentified_bone').length };
    });
    ok(j.tiles === 3, 'the inventory shows one tile per copy');
    ok(j.n === 2 && JSON.stringify(j.left) === '[5,27]', `jettisoning a copy takes that copy's value with it (left ${JSON.stringify(j.left)})`);
    // A path that doesn't name a copy (event item_consume) keeps the books straight.
    const c = await page.evaluate(() => {
      applyOutcomeEffects({ item_consume: 'unidentified_bone' });
      grantItem('unidentified_bone');
      const v = itemValuesOf('unidentified_bone');
      return { n: STATE.items.filter(x => x === 'unidentified_bone').length, v };
    });
    ok(c.n === 2 && c.v.length === 2 && c.v[0] === 5 && c.v[1] >= 4 && c.v[1] <= 28, `item_consume then a new pickup: the new copy rolls fresh (${JSON.stringify(c.v)})`);
    await page.close();
  }

  console.log('— an old-format save loads');
  {
    const page = await boot();
    await page.evaluate(() => { grantItem('pre_collapse_artifact'); grantItem('pre_collapse_artifact'); grantItem('sealed_vinyl'); returnToHub(); saveRun();
      const snap = JSON.parse(localStorage.getItem('transplant_save_v1')); delete snap.itemValues; localStorage.setItem('transplant_save_v1', JSON.stringify(snap)); });
    await reloadAndContinue(page);
    const r = await page.evaluate(() => ({ ok: !document.querySelector('#screen-title.active'), items: STATE.items.slice(), vals: itemValuesOf('pre_collapse_artifact'), vinyl: itemValuesOf('sealed_vinyl'), saved: saveRun() }));
    ok(r.ok && r.items.filter(x => x === 'pre_collapse_artifact').length === 2 && r.vals.length === 2 && r.vals.every(v => v >= 15 && v <= 45), `a save without itemValues loads; its curios are valued once on load (${JSON.stringify(r.vals)})`);
    ok(r.vinyl.length === 0, 'a fixed-price good gets no rolled value');
    await reloadAndContinue(page);
    const again = await page.evaluate(() => itemValuesOf('pre_collapse_artifact'));
    ok(JSON.stringify(again) === JSON.stringify(r.vals), 'those load-time values are then saved and stay put');
    await page.close();
  }

  console.log('— hidden without a spectrometer, exact with one');
  {
    const page = await boot();
    const inv = async () => page.evaluate(() => {
      openInventory();
      const tile = [...document.querySelectorAll('#inv-grid .inv-tile')].find(t => /Unidentified Bone/i.test(t.getAttribute('title') || t.dataset.tipTitle || ''));
      tile.click();
      const out = { meta: document.getElementById('inv-detail-meta').textContent, badge: (document.querySelector('#inv-grid .inv-tile.selected .inv-tile-value') || {}).textContent };
      hideOverlay('overlay-inventory');
      return out;
    });
    const offer = async (sinister) => page.evaluate(s => {
      openMarket({ sinister: s });
      const row = [...document.querySelectorAll('#market-sell-list .market-row')].find(x => /UNIDENTIFIED BONE/.test(x.textContent));
      const t = row ? row.querySelector('.market-row-cost').textContent : null;
      MarketModal.close();
      return t;
    }, sinister);
    await page.evaluate(() => { grantItem('unidentified_bone'); STATE.itemValues.unidentified_bone = [17]; });
    let a = await inv();
    ok(/trader pays 4–28g/.test(a.meta) && /needs a spectrometer/.test(a.meta) && !/\b17g/.test(a.meta), `INV detail without a spectrometer: the range, not the number ("${a.meta}")`);
    ok(a.badge === '??', 'INV tile without a spectrometer: ??');
    let s = await offer(false), f = await offer(true);
    ok(s === '+4–28g' && f === '+6–42g', `sell offers without a spectrometer: station "${s}", fence "${f}"`);
    await page.evaluate(() => grantItem('spectrometer'));
    a = await inv();
    ok(/trader pays 17g · fence 26g/.test(a.meta), `INV detail with a spectrometer: exact ("${a.meta}")`);
    ok(a.badge === '17g', 'INV tile with a spectrometer: 17g');
    s = await offer(false); f = await offer(true);
    ok(s === '+17g' && f === '+26g', `sell offers with a spectrometer: station "${s}", fence "${f}"`);
    await page.close();
  }

  console.log('— the sale pays exactly the stored value');
  {
    // CHIP + Merchant: both standing discounts in play — they cut what the
    // station SELLS, never what it pays (same as before the ruling).
    const page = await boot({ captain: 'merchant', ai: 'chip' });
    const r = await page.evaluate(() => {
      for (let i = 0; i < 3; i++) grantItem('pre_collapse_artifact');
      STATE.itemValues.pre_collapse_artifact = [16, 44, 30];
      STATE.goldAmount = 100;
      const mult = stationPriceMult();
      openMarket({});
      const rows = () => [...document.querySelectorAll('#market-sell-list .market-row')].filter(x => /PRE-COLLAPSE ARTIFACT/.test(x.textContent));
      const shown = rows().map(x => x.querySelector('.market-row-cost').textContent);
      // Sell the middle one (44) — hidden: its row shows the range.
      const g0 = STATE.goldAmount;
      rows()[1].querySelector('.market-row-btn').click();
      const paid = STATE.goldAmount - g0;
      const log = document.getElementById('market-log').textContent;
      MarketModal.close();
      return { mult, shown, paid, left: itemValuesOf('pre_collapse_artifact'), log };
    });
    ok(r.mult < 1, `standing discounts active (station price × ${r.mult})`);
    ok(r.shown.length === 3 && r.shown.every(t => t === '+15–45g'), `three separate rows, each showing the range (${r.shown.join(' / ')})`);
    ok(r.paid === 44 && JSON.stringify(r.left) === '[16,30]' && /\+44g/.test(r.log), `selling the 2nd copy pays its stored 44g, logs it, and that copy leaves (${JSON.stringify(r)})`);
    const f = await page.evaluate(() => {
      grantItem('spectrometer');
      STATE.goldAmount = 0;
      openMarket({ sinister: true });
      const row = [...document.querySelectorAll('#market-sell-list .market-row')].find(x => /PRE-COLLAPSE ARTIFACT/.test(x.textContent) && /\+45g/.test(x.textContent));
      const shown = row && row.querySelector('.market-row-cost').textContent;
      row.querySelector('.market-row-btn').click();
      const paid = STATE.goldAmount;
      MarketModal.close();
      return { shown, paid, left: itemValuesOf('pre_collapse_artifact') };
    });
    ok(f.shown === '+45g' && f.paid === 45 && JSON.stringify(f.left) === '[16]', `the fence pays FENCE_MULT × the copy's value (30 → ${f.paid}g) and takes that copy`);
    const v = await page.evaluate(() => { STATE.items.push('sealed_vinyl'); openMarket({}); const st = [...document.querySelectorAll('#market-sell-list .market-row')].find(x => /SEALED VINYL/.test(x.textContent)).querySelector('.market-row-cost').textContent; MarketModal.close();
      openMarket({ sinister: true }); const fe = [...document.querySelectorAll('#market-sell-list .market-row')].find(x => /SEALED VINYL/.test(x.textContent)).querySelector('.market-row-cost').textContent; MarketModal.close();
      return { st, fe, text: itemDef('sealed_vinyl').gameplay_effect }; });
    ok(v.st === '+17g' && v.fe === '+25g' && /17g/.test(v.text) && /25g/.test(v.text), `fixed-value vinyl: station ${v.st}, fence ${v.fe}, as its text says`);
    await page.close();
  }

  ok(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(`\ntradegoods: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
