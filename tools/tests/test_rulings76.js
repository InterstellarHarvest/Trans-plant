// Owner rulings 76–79 (2026-10-14):
//  76 the breach countdown stays on real seconds; the launching choice's
//     tooltip says so and states the days;
//  77 a finished repair lifts the engineer (crew_roster morale_concern
//     repair_done) — REPAIR, DRYDOCK, the Engine Fault's rebuild and a
//     clean restart — and the previews show it;
//  78 no gold change (nothing to test);
//  79 a fabricator print sells for its materials' value; found copies sell
//     first at the full price; the hold's SELL PRICE and the Market Row say
//     which; the count survives a save.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(90000);
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.recipes && typeof enterEvent === 'function');
  await page.evaluate(() => localStorage.removeItem('transplant_save_v1'));
  return page;
}
async function boot(setup) {
  const page = await open();
  await page.evaluate(o => {
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
    STATE.flags.add('departed');
    for (const r of STATE.crew) setCrewMorale(50, r);
    showScreen('screen-cruise');
    document.body.classList.remove('stop-active'); document.getElementById('stop-btn').textContent = 'Stop';
    renderCruise();
  }, setup || {});
  await page.waitForFunction(() => document.getElementById('screen-cruise').classList.contains('active'));
  return page;
}
const parkAt = (page, type) => page.evaluate(type => {
  let n = STATE.nodes.find(x => x.node_type === type && x.id !== STATE.currentId) || STATE.nodes.find(x => x.node_type === type);
  if (!n) { n = STATE.nodes.find(x => x.id !== STATE.currentId && !['station', 'fork'].includes(x.node_type) && x !== STATE.nodes[0] && x !== STATE.nodes[STATE.nodes.length - 1]); if (n) n.node_type = type; }
  STATE.currentId = n.id;
  document.body.classList.remove('stop-active'); document.getElementById('stop-btn').textContent = 'Stop';
  renderCruise();
  return n.id;
}, type);
const verbRows = page => page.evaluate(() => [...document.querySelectorAll('#stop-choices .stop-choice')].map(b => ({ label: b.querySelector('.stop-choice-body').textContent, locked: b.classList.contains('locked'), tip: Tooltip.resolve(b) })));
const tipText = t => t ? [t.title, t.description, ...(t.rows || []).map(r => r.label + ' ' + r.value)].filter(Boolean).join(' | ') : '';

(async () => {
  browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();

  console.log('— ruling 76: the breach choice says it is timed on a real clock, and the days');
  {
    const page = await open();
    const r = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      applySetupToState({ trail: 'interstellar', ai: 'aria', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'B' });
      STATE.flags.add('departed'); STATE.resources.hull = 40;
      const out = {};
      for (const id of ['event_crisis_017', 'event_shipboard_020']) {
        enterEvent(STATE.byId[STATE.currentId], EVENTS[id]); finishAllTyping(); await wait(300);
        const ch = EVENTS[id].choices.find(c => c.launch_minigame === 'breach');
        const i = (STATE._shownChoices || []).indexOf(ch);
        const b = [...document.querySelectorAll('#enc-choices .enc-choice:not(.leave):not(.advance):not(.locked)')][i];
        out[id] = b ? (b.dataset.tipDescription || b.getAttribute('title') || '') : null;
      }
      return out;
    });
    for (const [id, tip] of Object.entries(r)) {
      ok(tip && /Takes \d+ days?/.test(tip), `${id}: the breach choice states its days (${JSON.stringify(tip)})`);
      ok(tip && /Timed: a real clock/.test(tip) && /engineer/.test(tip), `${id}: …and that it is timed on a real clock`);
    }
    await page.close();
  }

  console.log('— ruling 77: REPAIR and DRYDOCK lift the engineer, and their tooltips say so');
  {
    const page = await boot();
    await parkAt(page, 'deep_space');
    await page.evaluate(() => { STATE.resources.hull = 50; STATE.materials = Object.assign({}, STATE.materials, { metal: 5, scrap: 5 }); openStopMenu(); });
    let v = await verbRows(page);
    const rep = v.find(x => x.label === 'REPAIR');
    ok(rep && !rep.locked && /ENGINEER \+3 MORALE/.test(tipText(rep.tip)), `REPAIR tooltip shows the lift (${tipText(rep && rep.tip)})`);
    const r1 = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      window.openEngineRepair = cb => setTimeout(() => cb({ fixedCount: 4, allFixed: true }), 10);
      const before = { eng: crewMoraleOf('engineer'), med: crewMoraleOf('medic'), hull: STATE.resources.hull };
      [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /^REPAIR/.test(b.textContent)).click();
      await wait(400);
      return { before, eng: crewMoraleOf('engineer'), med: crewMoraleOf('medic'), hull: STATE.resources.hull, tax: effortTax(3), why: STATE.moraleWhy && STATE.moraleWhy.engineer, tip: crewMoraleTip('engineer') };
    });
    ok(r1.hull > r1.before.hull, `REPAIR patched the hull (${r1.before.hull} → ${r1.hull})`);
    ok(r1.eng === r1.before.eng - r1.tax + 3 && r1.med === r1.before.med - r1.tax, `engineer −${r1.tax} tax +3 lift = ${r1.eng}; medic −${r1.tax} = ${r1.med}`);
    ok(r1.why && r1.why.id === 'repair_done' && /finished repair lifts/.test(r1.tip), `the MO tooltip says why ("${r1.tip}")`);
    // DRYDOCK at a station.
    await parkAt(page, 'station');
    await page.evaluate(() => { STATE.resources.hull = 50; STATE.goldAmount = 200; for (const r of STATE.crew) setCrewMorale(50, r); openStopMenu(); });
    v = await verbRows(page);
    const dry = v.find(x => x.label === 'DRYDOCK');
    ok(dry && !dry.locked && /ENGINEER \+3 MORALE/.test(tipText(dry.tip)), `DRYDOCK tooltip shows the lift (${tipText(dry && dry.tip)})`);
    const r2 = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /^DRYDOCK/.test(b.textContent)).click();
      await wait(300);
      return { eng: crewMoraleOf('engineer'), med: crewMoraleOf('medic'), hull: STATE.resources.hull, tax: effortTax(1) };
    });
    ok(r2.hull === 80 && r2.eng === 50 - r2.tax + 3 && r2.med === 50 - r2.tax, `DRYDOCK: hull 80, engineer ${r2.eng} (−${r2.tax} +3), medic ${r2.med}`);
    // No engineer aboard: no lift promised, none paid.
    const page2 = await boot({ crew: ['medic', 'chef'] });
    await parkAt(page2, 'station');
    await page2.evaluate(() => { STATE.resources.hull = 50; STATE.goldAmount = 200; openStopMenu(); });
    v = await verbRows(page2);
    const dry2 = v.find(x => x.label === 'DRYDOCK');
    ok(dry2 && !/ENGINEER/.test(tipText(dry2.tip)), `no engineer: DRYDOCK promises no lift (${tipText(dry2 && dry2.tip)})`);
    await page.close(); await page2.close();
  }

  console.log('— ruling 77: the Engine Fault rebuild and a clean restart lift the engineer, preview = outcome');
  {
    const page = await open();
    const r = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const out = {};
      const setup = () => {
        localStorage.removeItem('transplant_save_v1');
        applySetupToState({ trail: 'mars', ai: 'aria', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'B' });
        STATE.flags.add('departed');
        for (const r of STATE.crew) setCrewMorale(50, r);
        window.dailyDraw = () => ({ food: 0, o2: 0, water: 0 });
        window.passDays = d => { STATE.daysElapsed += Math.max(0, Math.round(d)); };
        Math.random = () => 0.01;
      };
      const ev = EVENTS['event_crisis_025'];
      const btnOf = c => { const i = (STATE._shownChoices || []).indexOf(c); return [...document.querySelectorAll('#enc-choices .enc-choice:not(.leave):not(.advance):not(.locked)')][i]; };
      // The rebuild (FIELD REPAIR): effort 3 tax, +3 lift.
      setup();
      enterEvent(STATE.byId[STATE.currentId], ev); finishAllTyping(); await wait(300);
      const field = ev.choices.find(c => c.requires_crew === 'engineer');
      let b = btnOf(field);
      out.fieldTip = b.dataset.tipDescription || b.getAttribute('title') || '';
      out.fieldFacts = outcomeFacts(field.outcome).map(f => f.text);
      b.click(); await wait(400);
      out.field = { eng: crewMoraleOf('engineer'), med: crewMoraleOf('medic'), tax: effortTax(3), why: STATE.moraleWhy.engineer };
      // The restart: perfect and good lift, poor does not.
      for (const tier of ['perfect', 'good', 'poor']) {
        setup();
        window.openMinigame = (mg, o, cb) => setTimeout(() => cb(tier, {}), 10);
        enterEvent(STATE.byId[STATE.currentId], ev); finishAllTyping(); await wait(300);
        const sim = ev.choices.find(c => c.launch_minigame === 'engine');
        b = btnOf(sim);
        const to = sim.tier_outcomes[tier];
        const merged = Object.assign({}, sim.outcome, to, { resources: Object.assign({}, sim.outcome.resources || {}, to.resources || {}) });
        const facts = outcomeFacts(merged).map(f => f.text);
        b.click(); await wait(500);
        out[tier] = { facts, eng: crewMoraleOf('engineer'), med: crewMoraleOf('medic'), shared: (to.resources || {}).morale || 0, why: STATE.moraleWhy.engineer && STATE.moraleWhy.engineer.id };
      }
      return out;
    });
    // The hover lists costs only (ruling 34); the lift is a gain, shown by the preview facts (MARV's sub-label, Research).
    ok(r.fieldFacts.includes('ENGINEER +3 MORALE'), `FIELD REPAIR's preview facts show the lift (${JSON.stringify(r.fieldFacts)}; hover: ${r.fieldTip.replace(/\n/g, ' | ')})`);
    ok(r.field.eng === 50 - r.field.tax + 3 && r.field.med === 50 - r.field.tax && r.field.why && r.field.why.id === 'repair_done', `FIELD REPAIR lands it: engineer ${r.field.eng}, medic ${r.field.med}`);
    for (const tier of ['perfect', 'good']) ok(r[tier].facts.some(f => /ENGINEER \+3/.test(f)) && r[tier].eng === 50 + r[tier].shared + 3 && r[tier].med === 50 + r[tier].shared && r[tier].why === 'repair_done', `restart ${tier}: facts ${JSON.stringify(r[tier].facts)}, engineer ${r[tier].eng}, medic ${r[tier].med}`);
    // Poor: the shared −3, the hull concern on the engineer (−4 hull → ENGINEER −2), no lift.
    ok(!r.poor.facts.some(f => /ENGINEER \+/.test(f)) && r.poor.why !== 'repair_done' && r.poor.med === 50 + r.poor.shared && r.poor.eng === r.poor.med - 2, `restart poor: no lift (engineer ${r.poor.eng}, medic ${r.poor.med}, facts ${JSON.stringify(r.poor.facts)})`);
    await page.close();
  }

  console.log('— ruling 79: a print sells for its materials; found copies first; hold + Market Row agree; the save keeps the count');
  {
    const page = await boot({ crew: ['pilot', 'medic'] });
    // Craft a real kit through the fabricator, with a found kit already aboard.
    const c0 = await page.evaluate(() => {
      STATE.items = STATE.items.filter(x => x !== 'repair_kit');
      grantItem('repair_kit'); // found
      STATE.materials = { metal: 20, scrap: 20, minerals: 10, biocomponent: 10 };
      STATE.fabricator.wear = 0;
      window.fabSetDayMs(150);
      openFabricator();
      const r = [...document.querySelectorAll('.fb-recipe-row')].find(x => x.textContent.includes('Field Repair Kit')); r.click();
      craftSelected();
      return { crafted: Object.assign({}, STATE.crafted || {}), price: craftedPrice('repair_kit'), patch: craftedPrice('hull_patch'), found: stationBuyPrice('repair_kit') };
    });
    ok(c0.price === 8 && c0.patch === 5, `a kit's materials are worth ${c0.price}g, a hull patch's ${c0.patch}g (the shelf pays ${c0.found}g)`);
    ok(!c0.crafted.repair_kit, 'nothing counted as crafted before the print is claimed');
    await page.waitForFunction(() => !window.fabCraftState() && STATE.fabricator.owedOutput === 'repair_kit', null, { timeout: 15000 });
    const c1 = await page.evaluate(() => { claimOutput(false); closeFabricator(); return { kits: STATE.items.filter(x => x === 'repair_kit').length, crafted: STATE.crafted.repair_kit, held: craftedHeld('repair_kit'), next: stationBuyPriceNext('repair_kit') }; });
    ok(c1.kits === 2 && c1.crafted === 1 && c1.held === 1, `claiming the print counts it (2 kits aboard, 1 crafted)`);
    ok(c1.next === 27, `the next sale is the found copy at the full ${c1.next}g`);
    // Save round trip keeps the count.
    const sv = await page.evaluate(() => { saveRun(); const s = JSON.parse(localStorage.getItem('transplant_save_v1')); STATE.crafted = {}; loadRun(); return { saved: s.crafted, back: STATE.crafted }; });
    ok(sv.saved && sv.saved.repair_kit === 1 && sv.back && sv.back.repair_kit === 1, `the save carries crafted counts (${JSON.stringify(sv.saved)}) and a load restores them`);
    // The hold's readout at a station.
    await parkAt(page, 'station');
    const inv = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      openInventory(); await wait(100);
      document.querySelector('#inv-grid .inv-tile[data-key="repair_kit"]').click(); await wait(100);
      const meta = document.getElementById('inv-detail-meta').innerText.replace(/\s+/g, ' ');
      const sell = document.getElementById('inv-sell-btn') || [...document.querySelectorAll('#overlay-inventory button')].find(b => /^SELL/.test(b.textContent));
      return { meta, sell: sell ? sell.textContent : null };
    });
    ok(/SELL PRICE 27g each/.test(inv.meta) && /1 of these is a print and pays 8g/.test(inv.meta), `hold readout: "${inv.meta}"`);
    ok(inv.sell && /27g/.test(inv.sell), `the hold's SELL button offers the found price first (${inv.sell})`);
    // The Market Row: two rows, +27g and +8g; sell the print at 8g.
    const mk = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      hideOverlay('overlay-inventory');
      STATE.goldAmount = 100;
      openMarket({}); await wait(100);
      const kitName = String(itemDef('repair_kit').name).toUpperCase();
      const rows = () => [...document.querySelectorAll('#market-sell-list .market-row')].filter(x => x.textContent.toUpperCase().includes(kitName));
      const shown = rows().map(x => x.querySelector('.market-row-cost').textContent);
      const printRow = rows().find(x => /\+8g/.test(x.textContent));
      if (printRow) printRow.querySelector('.market-row-btn').click();
      await wait(100);
      const after = { gold: STATE.goldAmount, kits: STATE.items.filter(x => x === 'repair_kit').length, crafted: STATE.crafted.repair_kit || 0, rows: rows().map(x => x.querySelector('.market-row-cost').textContent) };
      MarketModal.close();
      return { shown, after };
    });
    ok(mk.shown.length === 2 && mk.shown.includes('+27g') && mk.shown.includes('+8g'), `Market Row lists the found kit at +27g and the print at +8g (${mk.shown.join(' / ')})`);
    ok(mk.after.gold === 108 && mk.after.kits === 1 && mk.after.crafted === 0 && JSON.stringify(mk.after.rows) === '["+27g"]', `selling the print pays 8g, leaves the found kit at +27g (${JSON.stringify(mk.after)})`);
    // The hold's SELL sells the found copy at 27, and with only prints left pays 8.
    const hs = await page.evaluate(() => {
      const a = stationSellOne('repair_kit');
      STATE.items = STATE.items.filter(x => x !== 'repair_kit'); STATE.items.push('repair_kit', 'repair_kit'); STATE.crafted = { repair_kit: 2 };
      const next = stationBuyPriceNext('repair_kit');
      const b = stationSellOne('repair_kit');
      return { a, next, b, crafted: STATE.crafted.repair_kit, extra: craftedHeld('nonexistent_thing') };
    });
    ok(hs.a.paid === 27 && !hs.a.crafted && hs.next === 8 && hs.b.paid === 8 && hs.b.crafted && hs.crafted === 1 && hs.extra === 0, `hold SELL: found 27g, then prints 8g each (${JSON.stringify(hs)})`);
    await page.close();
  }

  ok(!errors.length, 'page errors: ' + errors.join(' | '));
  console.log(`\nrulings 76–79: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
