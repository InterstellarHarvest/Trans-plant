// Hunt-3 regression: combat resolution/accounting, stowaway identity,
// patient lock, market sells, upgrades, captain/AI economy passives.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
async function boot(setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.stack || e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'interstellar', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  page._errs = errs;
  return page;
}
const click = (page, t) => page.evaluate(t => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.textContent.includes(t)); if (!b) return false; b.click(); return true; }, t);
async function startCombat(page, pre) {
  await page.evaluate(pre => {
    if (pre) (new Function(pre))();
    const ev = Object.values(EVENTS).find(e => JSON.stringify(e).includes('"triggerCombat":true'));
    enterEvent(STATE.byId[STATE.currentId], ev);
    window.triggerCombat({});
  }, pre || null);
  await page.waitForTimeout(200);
}
const hud = page => page.evaluate(() => document.getElementById('combat-num-foe').textContent + '/' + document.getElementById('combat-num-hull').textContent);

(async () => {
  browser = await chromium.launch();

  console.log('— combat: no extra turns');
  const res = {};
  for (const mode of ['single', 'double']) {
    const page = await boot();
    await page.evaluate(() => { Math.random = () => 0.5; });
    await startCombat(page);
    await click(page, 'FIRE LASER');
    await page.keyboard.press('Enter');
    if (mode === 'double') { await page.waitForTimeout(450); await page.keyboard.press('Enter'); }
    await page.waitForTimeout(2500);
    res[mode] = await hud(page);
    await page.close();
  }
  ok(res.single === res.double, `double Enter = one shot, one enemy turn (${res.single} vs ${res.double})`);
  for (const mode of ['single', 'double']) {
    const page = await boot();
    await page.evaluate(() => { Math.random = () => 0.5; });
    await startCombat(page);
    await click(page, 'EVASIVE');
    if (mode === 'double') { await page.waitForTimeout(150); await page.keyboard.press('Space'); }
    await page.waitForTimeout(2500);
    res['e' + mode] = await hud(page);
    await page.close();
  }
  ok(res.esingle === res.edouble, `EVASIVE + Space = one enemy turn (${res.esingle} vs ${res.edouble})`);

  console.log('— combat: one resolution');
  for (const hull of [60, 10]) {
    const page = await boot();
    await page.evaluate(h => { Math.random = () => 0.5; STATE.resources.morale = 10; STATE.resources.hull = h; }, hull);
    await startCombat(page);
    await page.waitForTimeout(1050);
    await click(page, 'STAND DOWN');
    await page.waitForTimeout(80);
    const mid = await page.evaluate(() => ({ t: document.getElementById('enc-narr-title').textContent, d: STATE.daysElapsed, h: STATE.resources.hull }));
    await page.waitForTimeout(1600);
    const end = await page.evaluate(() => ({ t: document.getElementById('enc-narr-title').textContent, d: STATE.daysElapsed, h: STATE.resources.hull }));
    ok(mid.t === end.t && mid.d === end.d && mid.h === end.h, `hull ${hull}: stand-down not overwritten by a late shot (${mid.t} → ${end.t})`);
    await page.close();
  }

  console.log('— combat: morale/food accounting');
  for (const [which, delta] of [['ACCEPT SURRENDER', 5], ['FINISH THEM', -10]]) {
    const page = await boot();
    await page.evaluate(() => { Math.random = () => 0.5; });
    await startCombat(page);
    for (let i = 0; i < 10; i++) {
      if ((await page.evaluate(() => document.getElementById('enc-choices').innerText)).includes(which)) break;
      await click(page, 'FIRE LASER'); await page.waitForTimeout(100);
      await click(page, 'FIRE AT CENTER'); await page.waitForTimeout(1600);
    }
    const shown = +(await page.evaluate(() => document.getElementById('combat-num-mor').textContent)).replace(/\D/g, '');
    await click(page, which);
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => Math.round(STATE.resources.morale));
    ok(Math.abs(after - (shown + delta)) <= 1, `${which}: morale ${shown} → ${after} (expected ≈${shown + delta})`);
    await page.close();
  }
  {
    const page = await boot({ crew: ['chef', 'medic'] });
    const before = await page.evaluate(() => STATE.resources.food);
    await startCombat(page);
    await page.evaluate(() => { Math.random = () => 0.01; });
    await click(page, 'OFFER COOKIES');
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => STATE.resources.food);
    ok(before - after >= 3, `successful tribute costs food (${before} → ${after.toFixed(1)})`);
    await page.close();
  }
  for (const crew of [[], ['engineer', 'medic']]) {
    const page = await boot({ crew });
    await page.evaluate(() => {
      STATE.resources.morale = 10;
      const ev = Object.values(EVENTS).find(e => JSON.stringify(e).includes('"triggerCombat":true'));
      enterEvent(STATE.byId[STATE.currentId], ev);
      STATE.npcCtx.species = 'insect';
      window.triggerCombat({});
      Math.random = () => 0.01;
    });
    await page.waitForTimeout(300);
    await click(page, 'STAND DOWN');
    await page.waitForTimeout(1300);
    const r = await page.evaluate(() => ({ crew: STATE.crew.length, body: document.getElementById('enc-narr-body').textContent }));
    const claimsLoss = /didn't make it|crew lost/i.test(r.body);
    ok(crew.length ? (claimsLoss === (r.crew < crew.length)) : !claimsLoss, `defeat text matches crew (${crew.length}→${r.crew}): "${r.body.slice(0, 90)}"`);
    ok(!/\b(engineer|medic) is hurt/.test(r.body), 'defeat text uses names, not role ids');
    await page.close();
  }

  console.log('— stowaway identity');
  {
    const page = await boot({ crew: ['engineer'] });
    const r = await page.evaluate(() => {
      STATE.stowaway = { identity: MOD.flavor.stowaway_identities.find(s => s.join_role === 'diplomat'), revealed: true };
      const ev = Object.values(EVENTS).find(e => (e.trigger || []).includes('stowaway_aboard') && JSON.stringify(e).includes('"stowaway_resolve":"welcome"'));
      const ch = (ev.choices || []).find(c => c.outcome && c.outcome.stowaway_resolve === 'welcome');
      enterEvent(STATE.byId[STATE.currentId], ev);
      handleChoiceClick(ch);
      returnToHub(); renderCruise();
      const strip = document.getElementById('crew-strip').innerText;
      openCrewDetail('diplomat');
      return { crew: STATE.crew.slice(), strip, name: document.getElementById('cd-name').textContent, bio: document.getElementById('cd-bio').textContent };
    });
    ok(r.crew.includes('diplomat'), 'Wembly joins as diplomat');
    ok(/WEMBLY/i.test(r.strip) && !/HARGROVE/i.test(r.strip), 'crew strip says Wembly, not Hargrove');
    ok(/Wembly/i.test(r.name) && /inspector/i.test(r.bio), 'dossier shows Wembly + their story');
    await page.evaluate(() => { saveRun(); STATE.crewIdentity = {}; loadRun(); });
    ok(await page.evaluate(() => crewNameOf('diplomat') === 'Wembly Voss'), 'identity survives save/load');
    await page.evaluate(() => { killCrew('diplomat'); });
    const log = await page.evaluate(() => STATE.shipLog.slice(-1)[0]);
    ok(/Wembly/.test(log.text) && !log.crewId, 'epitaph names Wembly, no Hargrove portrait');
    ok(await page.evaluate(() => !STATE.crewIdentity.diplomat), 'identity cleared on death');
    ok(!page._errs.length, 'no page errors' + (page._errs.length ? ': ' + page._errs.join(' | ') : ''));
    await page.close();
  }

  console.log('— patient cannot operate');
  {
    const page = await boot({ crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => {
      applySeverity('medic', 'delayed');
      STATE.crisisPatient = 'medic';
      enterEvent(STATE.byId[STATE.currentId], EVENTS.event_crisis_021);
      return [...document.querySelectorAll('#enc-choices .enc-choice')].filter(b => /MEDIC OPERATES/i.test(b.innerText)).map(b => b.classList.contains('locked'));
    });
    ok(r.length && r.every(Boolean), 'medic-patient: "the medic operates" is locked');
    await page.close();
  }

  console.log('— market');
  {
    const page = await boot({ captain: 'veteran' });
    const r = await page.evaluate(() => {
      STATE.items = ['soil_sampler', 'gas_analyzer'];
      STATE.goldAmount = 50;
      openMarket({});
      return true;
    });
    await page.waitForTimeout(300);
    const btn = await page.$('#enc-market .market-row-btn:text("SELL")');
    if (btn) await btn.dblclick();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ items: STATE.items.slice(), gold: STATE.goldAmount }));
    ok(after.items.length === 1, `double-click SELL sells one item (${JSON.stringify(after)})`);
    await page.evaluate(() => MarketModal.close());
    // hold space frees immediately
    const fit = await page.evaluate(() => {
      STATE.items = []; while (cargoSlotsUsed() < cargoCapacity()) STATE.items.push('geiger_counter');
      STATE.goldAmount = 500;
      openMarket({});
      const sell = [...document.querySelectorAll('#enc-market .market-row-btn')].find(b => b.textContent === 'SELL' && !b.disabled);
      sell.click();
      const n = STATE.items.length;
      return { n, used: cargoSlotsUsed(), cap: cargoCapacity() };
    });
    ok(fit.used < fit.cap, `a sale frees hold space at once (${fit.used}/${fit.cap})`);
    await page.evaluate(() => MarketModal.close());
    // cargo bay can't be sold while it holds cargo
    const bay = await page.evaluate(() => {
      STATE.items = ['insulated_cargo_bay']; while (cargoSlotsUsed() < cargoCapacity()) STATE.items.push('geiger_counter');
      return { can: canRemoveItem('insulated_cargo_bay'), used: cargoSlotsUsed(), cap: cargoCapacity() };
    });
    ok(!bay.can, `full hold: cargo bay can't be removed (${bay.used}/${bay.cap})`);
    const wares = await page.evaluate(() => { STATE.items = ['insulated_cargo_bay']; openMarket({}); const t = document.getElementById('market-buy-list').innerText; MarketModal.close(); return t; });
    ok(!/CARGO BAY/i.test(wares), 'second cargo bay not offered');
    await page.close();
  }

  console.log('— economy passives & upgrades');
  {
    const page = await boot({ captain: 'merchant', ai: 'chip' });
    const price = await page.evaluate(() => { STATE.goldAmount = 999; openMarket({}); const rows = [...document.querySelectorAll('#enc-market .market-row')].map(r => r.innerText); MarketModal.close(); return rows.join(' | '); });
    ok(/GAS ANALYZER[\s\S]*?\b61g/i.test(price) || /\b61g/.test(price), 'merchant + CHIP: 80g item costs 61g (×0.9×0.85)');
    await page.close();
    const d = await boot({ captain: 'diplomat' });
    ok(await d.evaluate(() => STATE.goldAmount) === 65, 'diplomat captain starts with 65 gold');
    await d.close();
    const p2 = await boot({ crew: ['engineer'], captain: 'veteran' });
    const base = await p2.evaluate(() => legTravelCost().fuel);
    const coil = await p2.evaluate(() => { STATE.items.push('drive_coil'); return legTravelCost().fuel; });
    ok(Math.abs(coil - base * 0.8) < 0.11, `drive coil: fuel/leg ${base} → ${coil}`);
    await p2.close();
    const p3 = await boot({ crew: ['pilot', 'chef'], captain: 'veteran' });
    const f3 = await p3.evaluate(() => ({ fuel: fuelBurnMult(), food: foodBurnMult() })); // multipliers: per-leg fuel varies with each random map's path length
    const p4 = await boot({ crew: ['engineer'], captain: 'pilot' });
    const f4 = await p4.evaluate(() => ({ fuel: fuelBurnMult() }));
    ok(Math.abs(f3.fuel - 0.9) < 1e-9 && Math.abs(f3.food - 0.85) < 1e-9, `crew pilot −10% fuel (${f3.fuel}), crew chef −15% food (${f3.food})`);
    ok(Math.abs(f4.fuel - 0.95) < 1e-9, `captain pilot −5% fuel (${f4.fuel})`);
    const tank = await p4.evaluate(() => {
      STATE.items.push('expanded_fuel_tank', 'hull_plating');
      applyOutcomeEffects({ resources: { fuel: 50, hull: 50 } });
      const up = { fuel: STATE.resources.fuel, hull: STATE.resources.hull };
      STATE.items = STATE.items.filter(i => i !== 'expanded_fuel_tank'); renderHUD();
      return { up, after: STATE.resources.fuel };
    });
    ok(tank.up.fuel === 125 && tank.up.hull === 115 && tank.after === 105, `tank/plating raise caps to 120/115 (+5 pilot captain fuel), removal drops back (${JSON.stringify(tank)})`);
    const o2 = await p4.evaluate(() => { STATE.resources.o2 = 100; STATE.items.push('o2_recycler'); applyOutcomeEffects({ resources: { o2: -20 } }); return STATE.resources.o2; });
    ok(Math.abs(o2 - 85) <= 0.5, `O2 recycler: −20 O2 becomes −15 (${o2}; the day itself breathes a little)`);
    ok(!p3._errs.length && !p4._errs.length, 'no page errors');
    await p3.close(); await p4.close();
  }

  console.log(`\nhunt3: ${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
