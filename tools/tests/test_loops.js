// Resource loops (owner note 2026-10-10): every consumable that drains
// has ways back — trade, mining side-yields, condenser, drydock, fab.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.stack || e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  await page.evaluate(() => { localStorage.clear(); applySetupToState({ trail: 'interstellar', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' }); STATE.stowaway = null; showScreen('screen-cruise'); renderCruise(); });

  const wares = await page.evaluate(() => { STATE.goldAmount = 500; openMarket({}); const t = document.getElementById('market-buy-list').innerText; MarketModal.close(); return t; });
  for (const w of ['RATION BRICK', 'WATER CANISTER', 'FUEL CELL', 'O2 CANISTER', 'HULL PATCH', 'ATMOSPHERIC CONDENSER']) ok(new RegExp(w, 'i').test(wares), `station sells ${w}`);

  const verb = (type, name, stub) => page.evaluate(async ({ type, name, stub }) => {
    if (stub) (new Function(stub))();
    const n = STATE.nodes.find(x => x.node_type === type);
    STATE.currentId = n.id; renderCruise();
    document.body.classList.remove('stop-active'); // a new region: reopen the menu fresh
    document.getElementById('stop-btn').click();
    await new Promise(r => setTimeout(r, 150));
    const b = [...document.querySelectorAll('#stop-choices .stop-choice')].find(x => x.textContent.includes(name));
    if (!b) return { err: 'no ' + name + ' at ' + type };
    const locked = b.classList.contains('locked'), text = b.textContent;
    b.click();
    await new Promise(r => setTimeout(r, 200));
    return { locked, text, water: STATE.resources.water, fuel: STATE.resources.fuel, hull: STATE.resources.hull, gold: STATE.goldAmount };
  }, { type, name, stub });

  await page.evaluate(() => { STATE.resources.water = 50; STATE.resources.fuel = 50; });
  const ice = await verb('asteroid_field', 'MINE', "window.openMining = cb => setTimeout(() => cb({ inventory: { minerals: 6, metal: 4 } }), 0);");
  ok(ice.water === 55 || (ice.water > 50 && ice.water <= 65), `MINE at an asteroid field melts ice (water 50 → ${ice.water})`);
  const scoop = await verb('nebula', 'MINE', "window.openMining = cb => setTimeout(() => cb({ inventory: { exotic: 4, minerals: 4 } }), 0);");
  ok(scoop.fuel > 50, `MINE in a nebula scoops fuel (fuel 50 → ${scoop.fuel})`);
  const noCond = await verb('nebula', 'CONDENSE');
  ok(noCond.locked && /Atmospheric Condenser/.test(noCond.text), 'CONDENSE locked without the condenser, says why');
  await page.evaluate(() => { STATE.items.push('atmospheric_condenser'); STATE.resources.water = 50; });
  const cond = await verb('nebula', 'CONDENSE');
  ok(!cond.locked && cond.water === 62 - Math.round(0.35 * 1 * 100) / 100 || Math.abs(cond.water - 61.65) < 0.5, `CONDENSE: +12 water for a day (${cond.water})`);
  await page.evaluate(() => { STATE.resources.hull = 40; STATE.goldAmount = 100; });
  const dry = await verb('station', 'DRYDOCK');
  ok(dry.hull === 70 && dry.gold === 70, `DRYDOCK: +30 hull for 30g (${dry.hull}, ${dry.gold}g)`);
  const rec = await page.evaluate(() => (MOD.recipes.recipes || MOD.recipes).some(r => r.id === 'recipe_ration_brick'));
  ok(rec, 'fabricator can turn biocomponents into ration bricks');
  const owned = await page.evaluate(() => { openMarket({}); const t = document.getElementById('market-buy-list').innerText; MarketModal.close(); return t; });
  ok(!/ATMOSPHERIC CONDENSER/i.test(owned), 'an owned upgrade is not offered again');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\nloops: ${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
