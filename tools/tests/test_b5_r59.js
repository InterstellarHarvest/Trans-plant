// Gold to earn (owner ruling 59): raw materials sell for value ×
// materials.json station_sell_multiplier — one number the Market Row, the
// cargo hold's SELL and every SELL PRICE readout read, so the shown price
// is the paid one; trade goods found on SALVAGE / FORAGE roll their
// items.json find_odds; and mining for sale is no faucet: N mining runs at
// one stop cost N days.
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
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.materials && MOD.crew_roster);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
    STATE.items = []; STATE.itemValues = {};
  }, setup || {});
  await page.waitForTimeout(200);
  return page;
}
// Opens the Stop menu at a stop of the given type and clicks the verb.
async function clickVerb(page, nodeType, re) {
  return page.evaluate(async ([nodeType, src]) => {
    const n = STATE.nodes.find(x => x.node_type !== 'fork' && x.node_type !== 'station' && x.id !== STATE.currentId) || STATE.nodes.find(x => x.node_type !== 'fork');
    n.node_type = nodeType; STATE.currentId = n.id;
    document.body.classList.remove('stop-active'); document.getElementById('stop-btn').textContent = 'Stop'; returnToHub();
    await new Promise(r => setTimeout(r, 150));
    if (!document.body.classList.contains('stop-active')) document.getElementById('stop-btn').click();
    await new Promise(r => setTimeout(r, 100));
    const b = [...document.querySelectorAll('#stop-choices .stop-choice:not(.locked)')].find(x => new RegExp(src).test(x.querySelector('.stop-choice-body').textContent));
    if (!b) return false;
    b.click();
    await new Promise(r => setTimeout(r, 300));
    return true;
  }, [nodeType, re]);
}

(async () => {
  browser = await chromium.launch();

  console.log('— the multiplier is data');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const mult = MOD.materials.station_sell_multiplier;
      const mats = MOD.materials.materials.map(m => ({ id: m.id, want: Math.max(1, Math.round(m.value * mult)), got: stationBuyPrice(m.id) }));
      return { mult, mats };
    });
    ok(r.mult === 4, `materials.json station_sell_multiplier = ${r.mult}`);
    ok(r.mats.every(m => m.got === m.want), 'every material sells for max(1, round(value × multiplier)): ' + r.mats.map(m => m.id + ' ' + m.got + 'g').join(', '));
    await page.close();
  }

  console.log('— one price: the Market Row, the cargo hold SELL, the readouts');
  {
    const page = await boot();
    const look = () => page.evaluate(() => {
      const st = STATE.nodes.find(n => n.node_type === 'station');
      STATE.currentId = st.id; STATE.stationVisit = null;
      STATE.materials = { exotic: 3, biocomponent: 3, minerals: 3 };
      const out = { want: {}, row: {}, rowPaid: {}, detail: {}, btn: {}, tip: {}, corner: {}, sold: {} };
      // The Market Row: the row's figure, and what one click pays.
      for (const id of ['exotic', 'biocomponent', 'minerals']) {
        openMarket({});
        out.want[id] = stationBuyPrice(id);
        const row = [...document.querySelectorAll('#market-sell-list .market-row')].find(x => new RegExp(id, 'i').test(x.textContent));
        out.row[id] = row && row.querySelector('.market-row-cost').textContent;
        const g0 = STATE.goldAmount;
        row.querySelector('.market-row-btn').click();
        out.rowPaid[id] = STATE.goldAmount - g0;
        MarketModal.close();
      }
      // The cargo hold: SELL PRICE row, tile corner, SELL button + tooltip,
      // and what the button pays (stationSellOne).
      openInventory(); invSetTab('materials');
      for (const id of ['exotic', 'biocomponent', 'minerals']) {
        const tile = document.querySelector('#inv-grid .inv-tile[data-id="' + id + '"]');
        tile.click();
        out.detail[id] = [...document.querySelectorAll('#inv-detail-meta .detail-stat')].map(d => d.textContent)[2];
        out.corner[id] = (tile.querySelector('.inv-tile-price') || {}).textContent;
        const b = document.getElementById('inv-sell-btn');
        out.btn[id] = b.textContent; out.tip[id] = b.dataset.tipDescription;
        const g0 = STATE.goldAmount;
        b.click();
        out.sold[id] = STATE.goldAmount - g0;
      }
      closeInventory();
      return out;
    });
    const a = await look();
    for (const id of ['exotic', 'biocomponent', 'minerals']) {
      const p = a.want[id];
      ok(a.row[id] === '+' + p + 'g' && a.rowPaid[id] === p, `${id}: Market Row shows ${a.row[id]} and pays +${a.rowPaid[id]}g`);
      ok(a.detail[id] === 'SELL PRICE' + p + 'g each' && a.corner[id] === p + 'g', `${id}: cargo hold SELL PRICE "${a.detail[id]}", tile corner ${a.corner[id]}`);
      ok(a.btn[id] === 'SELL · ' + p + 'g' && a.tip[id].includes('buys one for ' + p + 'g') && a.sold[id] === p, `${id}: SELL button "${a.btn[id]}" pays +${a.sold[id]}g, as its tooltip says`);
    }
    // Retune the data in place: every readout and payout follows it.
    await page.evaluate(() => { MOD.materials.station_sell_multiplier = 3; });
    const b = await look();
    ok(b.want.exotic === 6 && b.want.biocomponent === 3, `at ×3 the trader pays exotic ${b.want.exotic}g, biocomponent ${b.want.biocomponent}g`);
    ok(['exotic', 'biocomponent', 'minerals'].every(id => b.row[id] === '+' + b.want[id] + 'g' && b.rowPaid[id] === b.want[id] && b.detail[id] === 'SELL PRICE' + b.want[id] + 'g each' && b.sold[id] === b.want[id]),
      'retuned: the Market Row, the SELL PRICE row and both payouts all read the new multiplier');
    await page.close();
  }

  console.log('— trade-good find odds come from items.json');
  {
    const page = await boot();
    const d = await page.evaluate(() => {
      const found = id => (itemDef(id).find_odds || {});
      return { salvage: itemsFoundBy('salvage'), forage: itemsFoundBy('forage'), odds: ['pre_collapse_artifact', 'corporate_memorabilia', 'unidentified_bone', 'suspicious_fungus'].map(id => [id, found(id)]),
        goods: itemsFoundBy('salvage').concat(itemsFoundBy('forage')).every(id => (itemDef(id).tags || []).includes('trade_good')),
        read: itemFindOdds('unidentified_bone', 'salvage') === itemDef('unidentified_bone').find_odds.salvage };
    });
    ok(JSON.stringify(d.salvage) === JSON.stringify(['pre_collapse_artifact', 'corporate_memorabilia', 'unidentified_bone']) && JSON.stringify(d.forage) === JSON.stringify(['suspicious_fungus']),
      `salvage finds ${d.salvage.join(', ')}; forage finds ${d.forage.join(', ')}`);
    ok(d.goods && d.read && d.odds.every(([, o]) => Object.values(o).every(p => p > 0 && p <= 1)), 'every find is a trade good with a chance in (0, 1]: ' + d.odds.map(([id, o]) => id + ' ' + JSON.stringify(o)).join(', '));

    // SALVAGE: the roll is each item's find_odds.salvage. Odds 1 for the
    // bone only, and a roll of 0.99: exactly the bone comes aboard.
    const salvage = async (odds, roll) => {
      await page.evaluate(([odds, roll]) => {
        STATE.items = []; STATE.itemValues = {};
        window.__keep = {};
        for (const id of ['pre_collapse_artifact', 'corporate_memorabilia', 'unidentified_bone']) { window.__keep[id] = itemDef(id).find_odds; itemDef(id).find_odds = odds[id] ? { salvage: odds[id] } : undefined; }
        window.openMinigame = (id, opts, onDone) => onDone('perfect', { salvage: {} });
        window.__realRandom = Math.random; Math.random = () => roll;
      }, [odds, roll]);
      try { await clickVerb(page, 'derelict', '^SALVAGE'); }
      finally {
        await page.evaluate(() => { Math.random = window.__realRandom; for (const [id, o] of Object.entries(window.__keep)) itemDef(id).find_odds = o; });
      }
      return page.evaluate(() => STATE.items.slice());
    };
    const s1 = await salvage({ unidentified_bone: 1 }, 0.99);
    ok(JSON.stringify(s1) === '["unidentified_bone"]', `find_odds.salvage 1 on the bone alone, a 0.99 roll: the bone (${JSON.stringify(s1)})`);
    const s2 = await salvage({}, 0);
    ok(!s2.length, `no find_odds: nothing found even on a 0 roll (${JSON.stringify(s2)})`);
    const s3 = await salvage({ pre_collapse_artifact: 0.5, corporate_memorabilia: 0.5, unidentified_bone: 0.5 }, 0.4);
    ok(s3.length === 3, `each item is its own roll: three at 0.5 under a 0.4 roll (${JSON.stringify(s3)})`);

    // FORAGE: the fungus rolls find_odds.forage on a good forage on alien ground.
    const forage = async (p, roll) => {
      await page.evaluate(([p, roll]) => {
        STATE.items = []; STATE.itemValues = {};
        window.__keepF = itemDef('suspicious_fungus').find_odds;
        itemDef('suspicious_fungus').find_odds = p ? { forage: p } : undefined;
        window.openMinigame = (id, opts, onDone) => onDone('good', { food: 5, rare_drops: [], sickness: [] });
        window.__realRandom = Math.random; Math.random = () => roll;
      }, [p, roll]);
      try { await clickVerb(page, 'anomaly', '^(GATHER|HUNT|SCAVENGE|FORAGE)$'); }
      finally { await page.evaluate(() => { Math.random = window.__realRandom; itemDef('suspicious_fungus').find_odds = window.__keepF; }); }
      return page.evaluate(() => STATE.items.includes('suspicious_fungus'));
    };
    const f1 = await forage(0.5, 0.45), f2 = await forage(0.5, 0.55);
    ok(f1 && !f2, `the fungus: found under its find_odds.forage (0.45 < 0.5: ${f1}), not over it (0.55: ${f2})`);
    await page.close();
  }

  console.log('— no faucet: N mining runs at one stop cost N days');
  {
    const page = await boot();
    const runs = [];
    for (const n of [1, 3, 5]) {
      await page.evaluate(n => {
        window.__d0 = STATE.daysElapsed; window.__m0 = STATE.materials.minerals || 0;
        Object.assign(STATE.resources, { food: 100, water: 100, o2: 100 });
        window.openMining = onDone => onDone({ inventory: { minerals: 3 * n }, runs: n });
      }, n);
      const clicked = await clickVerb(page, 'asteroid_field', '^MINE');
      runs.push(await page.evaluate(([n, clicked]) => ({ n, clicked, days: STATE.daysElapsed - window.__d0, mined: (STATE.materials.minerals || 0) - window.__m0 }), [n, clicked]));
    }
    ok(runs.every(r => r.clicked && r.days === r.n && r.mined === 3 * r.n), 'each mining run is a day: ' + runs.map(r => `${r.n} run(s) → ${r.days} day(s)`).join(', '));
    // A run's haul at the trader: what one day of mining pays, at the real
    // field's odds (shared.js CRATE_POOLS.asteroid) and the sim's 13 units.
    // At ×5 minerals round up to 2g — the old faucet's price.
    const day = await page.evaluate(() => {
      const pool = CRATE_POOLS.asteroid, w = pool.reduce((s, p) => s + p.w, 0);
      const pays = () => Math.round(13 * pool.reduce((s, p) => s + p.w / w * stationBuyPrice(p.r), 0) * 10) / 10;
      const keep = MOD.materials.station_sell_multiplier;
      const now = pays();
      MOD.materials.station_sell_multiplier = 5; const at5 = pays();
      MOD.materials.station_sell_multiplier = keep;
      return { now, at5 };
    });
    ok(day.now > 0 && day.now < 25 && day.now < day.at5, `a mining day's haul sells for ~${day.now}g (13 units at the field's odds), not the ~${day.at5}g it paid at ×5`);
    await page.close();
  }

  ok(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(`\nb5_r59: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
