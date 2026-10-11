// Audit-4 regression: content fields / promises made real.
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
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForTimeout(200);
  page._errs = errs;
  return page;
}
const nodeOfType = (page, t) => page.evaluate(t => { const n = STATE.nodes.find(x => x.node_type === t); return n && n.id; }, t);

(async () => {
  browser = await chromium.launch();

  console.log('— engine plumbing');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      enterEvent(STATE.byId[STATE.currentId], EVENTS.event_anomaly_001);
      const flag = STATE.flags.has(EVENTS.event_anomaly_001.sets_flag);
      returnToHub();
      STATE.fabricator.wear = 100; STATE.fabricator.broken = false;
      const trig = activeTriggers().has('fab_broken');
      applyOutcomeEffects({ set_orders: { rations: 'vending', pace: 'light', waterSplit: 30 } });
      return { flag, trig, orders: JSON.stringify(STATE.orders), wp: STATE.cropGrowth.waterPlant };
    });
    ok(r.flag, 'event-level sets_flag applied');
    ok(r.trig, 'wear 100 raises fab_broken');
    ok(/vending/.test(r.orders) && /light/.test(r.orders) && /"waterSplit":30/.test(r.orders) && r.wp === 30, `set_orders changes standing orders (${r.orders})`);
    const fs = await page.evaluate(() => {
      showScreen('screen-cruise');
      const st = STATE.nodes.find(n => n.node_type === 'station' && n.id !== STATE.currentId) || STATE.byId[STATE.currentId];
      STATE.currentId = st.id; renderCruise();
      STATE.goldAmount = 100; STATE.fabricator.wear = 85;
      document.getElementById('stop-btn').click();
      const b = [...document.querySelectorAll('#stop-choices .stop-choice')].find(x => /FAB SERVICE/.test(x.textContent));
      if (!b) return { err: 'no verb' };
      b.click();
      return { wear: STATE.fabricator.wear, gold: STATE.goldAmount };
    });
    ok(fs.wear === 0 && fs.gold === 60, `FAB SERVICE: wear 0 for 40g (${JSON.stringify(fs)})`);
    await page.close();
  }

  console.log('— friendly pirates');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const ev = Object.values(EVENTS).find(e => JSON.stringify(e).includes('"triggerCombat":true'));
      enterEvent(STATE.byId[STATE.currentId], ev);
      const sp = (STATE.npcCtx && STATE.npcCtx.species) || 'human';
      STATE.flags.add('friendly_with_pirate_' + sp);
      window.triggerCombat({});
      return document.getElementById('enc-narr-title').textContent;
    });
    ok(r === 'OLD FRIENDS', `cookie crew waves you through (${r})`);
    const cleared = await page.evaluate(() => {
      returnToHub();
      const st = STATE.nodes.find(n => n.node_type === 'station' && n.position > 0);
      const prev = STATE.nodes.find(n => connectionsOf(n).includes(st.id));
      STATE.currentId = prev.id; travelTo(st.id, { skipEvent: true });
      return [...STATE.flags].some(f => f.startsWith('friendly_with_pirate_'));
    });
    ok(!cleared, 'friendly tag clears at the next station');
    await page.close();
  }

  console.log('— item passives');
  {
    const page = await boot({ ai: 'aria' });
    const r = await page.evaluate(() => {
      const planet = STATE.nodes.find(n => n.node_type === 'planet');
      STATE.items.push('solar_array', 'water_purifier', 'soil_sampler', 'medical_scanner', 'repair_kit', 'geiger_counter');
      STATE.resources.water = 50; STATE.resources.fuel = 50;
      const f0 = STATE.resources.fuel;
      arrivalPassives(planet);
      const out = { fuel: STATE.resources.fuel - f0, water: STATE.resources.water, surveys: STATE.soilSurveys };
      const voidN = STATE.nodes.find(n => n.node_type === 'void') || { node_type: 'void' };
      const f1 = STATE.resources.fuel; arrivalPassives(voidN); out.voidFuel = STATE.resources.fuel - f1;
      STATE.crop = 'wheat';
      out.need = cropWaterNeed();
      STATE.crewHP.engineer = 30;
      const h0 = STATE.crewHP.engineer;
      return out;
    });
    ok(r.fuel === 2 && r.voidFuel === 0, `solar array +2 fuel near stars, 0 in the void (${r.fuel}/${r.voidFuel})`);
    ok(r.water === 58 && r.surveys === 1, `purifier +8 water at a planet, soil survey logged (${r.water}, ${r.surveys})`);
    ok(Math.abs(r.need - 45) < 0.01, `purifier: crop water need 50 → ${r.need}`);
    const prev = await page.evaluate(() => {
      const ev = Object.values(EVENTS).find(e => !e.layers && (e.choices || []).some(c => c.outcome && typeof c.outcome === 'object' && c.outcome.severity && !c.requires_crew && !c.requires_item && !c.requires_flag && !c.gate && !c.launch_minigame));
      enterEvent(STATE.byId[STATE.currentId], ev);
      return [...document.querySelectorAll('#enc-choices .previewed')].map(b => b.textContent).join(' | ');
    });
    ok(/GEIGER · CREW HAZARD/.test(prev), `geiger flags crew hazards (${prev.slice(0, 80)})`);
    const kit = await page.evaluate(() => { returnToHub(); STATE.resources.hull = 50; openInventory(); _invSelected = 'repair_kit'; renderInventory(); document.getElementById('inv-use-btn').click(); return STATE.resources.hull; });
    ok(kit === 60, `repair kit: +10 hull (${kit})`);
    await page.close();
  }

  console.log('— crops');
  {
    const page = await boot({ crop: 'zinnia', ai: 'marv' });
    const r = await page.evaluate(() => {
      STATE.cropGrowth.health = 80; STATE.resources.morale = 50;
      arrivalPassives(STATE.nodes.find(n => n.node_type === 'planet'));
      const healthy = STATE.resources.morale;
      STATE.cropGrowth.health = 20; arrivalPassives(STATE.nodes.find(n => n.node_type === 'planet'));
      return { healthy, sick: STATE.resources.morale };
    });
    ok(r.healthy === 58 && r.sick === 53, `zinnia morale +8 healthy / −5 sick per leg (${r.healthy}, ${r.sick})`);
    await page.close();
    const p2 = await boot({ crop: 'tomato', trail: 'interstellar' });
    const g = await p2.evaluate(() => {
      const st = STATE.byId[STATE.currentId];
      STATE.cropGrowth.health = 80;
      const atStation = cropGrowthFactorAt(60);
      const v = STATE.nodes.find(n => n.node_type === 'void');
      STATE.currentId = v.id;
      const atVoid = cropGrowthFactorAt(60);
      return { atStation, atVoid };
    });
    ok(g.atVoid < g.atStation * 0.75, `tomato grows slower in the cold, dim void (${g.atStation.toFixed(2)} → ${g.atVoid.toFixed(2)})`);
    await p2.close();
  }

  console.log('— endings');
  {
    const page = await boot({ crop: 'zinnia', crew: ['engineer', 'pilot'] });
    const r = await page.evaluate(() => {
      const last = STATE.nodes.find(n => connectionsOf(n).length === 0);
      STATE.cropGrowth.health = 80; STATE.cropGrowth.lastTickDay = STATE.daysElapsed;
      triggerArrival(last);
      window.showEndReport();
      return { body: document.getElementById('end-report-body').textContent, crewVal: document.getElementById('end-crew-val').textContent, pips: document.querySelectorAll('#end-crew-pips .crew-pip').length };
    });
    ok(!/empty spaces where people used to stand/.test(r.body), 'intact 2-person crew does not read as losses');
    ok(r.crewVal === '2 / 2' && r.pips === 2, `crew panel ${r.crewVal}, ${r.pips} pips`);
    ok(/always the point/.test(r.body) || /zinnias/i.test(r.body), 'living zinnias add their paragraph');
    await page.close();
  }

  console.log('— content payoffs');
  {
    const page = await boot({ crew: ['xenobiologist', 'chef'] });
    const r = await page.evaluate(() => {
      STATE.items.push('alien_seed_pod');
      enterEvent(STATE.byId[STATE.currentId], EVENTS.event_anomaly_002);
      const pod = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /seed pod/i.test(b.textContent));
      const podOk = pod && !pod.classList.contains('locked');
      returnToHub();
      STATE.items.push('suspicious_fungus');
      const chefEv = EVENTS.event_shipboard_016;
      enterEvent(STATE.byId[STATE.currentId], chefEv);
      const chefOk = [...document.querySelectorAll('#enc-choices .enc-choice')].some(b => /chef finish/i.test(b.textContent) && !b.classList.contains('locked'));
      return { podOk, chefOk };
    });
    ok(r.podOk, 'seed pod has its anomaly payoff (xenobiologist)');
    ok(r.chefOk, "chef's Secret Project fires with the fungus");
    await page.close();
  }

  console.log('— map, cargo, market');
  {
    const page = await boot({ trail: 'interstellar' });
    const r = await page.evaluate(() => {
      const named = STATE.nodes.filter(n => ['station', 'planet', 'derelict'].includes(n.node_type) && !/^(Station|Planet|Derelict) \d+$/.test(n.name));
      return { named: named.length, cap: cargoCapacity(), mapName: STATE.mapName };
    });
    ok(r.named > 3, `places get real names (${r.named})`);
    ok(r.cap === 12, `interstellar hold capacity 12 (${r.cap})`);
    ok(r.mapName && r.mapName !== 'Interstellar Trail', `map name from the pool ("${r.mapName}")`);
    const m = await page.evaluate(() => {
      STATE.materials = { exotic: 2, scrap: 3 }; STATE.goldAmount = 10;
      openMarket({});
      const rows = document.getElementById('market-sell-list').innerText;
      const btn = [...document.querySelectorAll('#market-sell-list .market-row')].find(r => /EXOTIC/i.test(r.textContent)).querySelector('.market-row-btn');
      btn.click();
      const after = { gold: STATE.goldAmount, exotic: STATE.materials.exotic };
      MarketModal.close();
      return { rows, after };
    });
    ok(/EXOTIC/.test(m.rows) && m.after.gold === 20 && m.after.exotic === 1, `station buys materials (${JSON.stringify(m.after)})`);
    ok(!page._errs.length, 'no page errors' + (page._errs.length ? ': ' + page._errs.join(' | ') : ''));
    await page.close();
  }

  console.log('— passives & numbers');
  {
    const page = await boot({ crew: ['engineer', 'botanist'] });
    const r = await page.evaluate(() => {
      STATE.resources.hull = 50; applyOutcomeEffects({ resources: { hull: 20 } });
      const hull = STATE.resources.hull;
      STATE.cropGrowth.health = 50; applyOutcomeEffects({ crop_health: 20 });
      return { hull, crop: STATE.cropGrowth.health, tomatoYield: cropMetaOf('tomato').yield_amount };
    });
    ok(r.hull === 75, `engineer: +20 hull repair lands +25 (${r.hull})`);
    ok(r.crop === 75, `botanist: +20 crop health lands +25 (${r.crop})`);
    ok(r.tomatoYield === 50, 'tomato yield is the highest food per day');
    await page.close();
  }

  console.log(`\naudit4: ${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
