// Batch 5 fixes, hunter B: fabricator per-day crafting + Cargo Hold /
// Market Row SELL.
//   B1 a job whose days are all spent completes and never charges another
//      day: a resumable failure on its last day (Keep flying), a reload,
//      reopening, and a finished job at the deadline (no PAST DEADLINE hold).
//   B2 the crew behind time / wear / preview is the live crew (rebound
//      after every craft day, no reopen needed).
//   B3 a started craft is never stopped by wear: it runs to the end and
//      the fab breaks (wear 100) when it comes out.
//   B5 SELL of cargo invRequiredFor lists asks first, with the jettison
//      confirm, in the Cargo Hold and in the Market Row.
//   B8 CANCEL's refund comes back through the material grant (NEW mark).
//   B9 a job whose required part leaves the ship loses the part's wear
//      discount when it comes out.
//   B4 (ruling 54) Hold SELL stays free; its tooltip says no day is spent.
//   B6 (ruling 55) craft days roll no interrupts; a CANCEL after the
//      job's first day refunds half the materials (rounded down per
//      material) — tooltip = outcome, hold-full refusal on the half,
//      pickup marks kept.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
const ready = page => page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor && MOD.failures && window.openFabricator && window.openInventory);
async function boot(setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await ready(page);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['pilot', 'medic'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
    returnToHub();
  }, setup || {});
  await page.waitForTimeout(150);
  return page;
}
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('transplant_save_v1') || 'null'));
const pickRecipe = (page, name) => page.evaluate(n => { const r = [...document.querySelectorAll('.fb-recipe-row')].find(x => x.textContent.includes(n)); r.click(); return !!r; }, name);
const MATS = { metal: 20, scrap: 20, minerals: 10, biocomponent: 10, exotic: 2 };

(async () => {
  browser = await chromium.launch();

  console.log('— B1: a crop death on the last craft day → Keep flying → reopen: no extra day');
  {
    const page = await boot();
    const d0 = await page.evaluate(m => { STATE.materials = Object.assign({}, m); STATE.fabricator.wear = 0; window.fabSetDayMs(300); openFabricator(); return STATE.daysElapsed; }, MATS);
    await pickRecipe(page, 'Hull Patch');
    await page.evaluate(() => { craftSelected(); STATE.cropGrowth.health = 0; });
    await page.waitForFunction(() => STATE.ended, null, { timeout: 5000 });
    const sv = await saved(page);
    ok(sv && sv.pendingFailure && !sv.fabricator.craft && sv.fabricator.owedOutput === 'hull_patch',
      `the failure's save holds the print owed, not a spent job (craft ${JSON.stringify(sv && sv.fabricator.craft)}, owed ${sv && sv.fabricator.owedOutput})`);
    await page.evaluate(() => endContinueRun());
    await page.waitForTimeout(200);
    await page.evaluate(() => openFabricator());
    await page.waitForTimeout(900); // > 2 fabricator days
    const r = await page.evaluate(() => ({ d: STATE.daysElapsed, craft: STATE.fabricator.craft, owed: STATE.fabricator.owedOutput, ready: document.getElementById('fb-output-slot').classList.contains('ready') }));
    ok(r.d === d0 + 1 && !r.craft && r.owed === 'hull_patch' && r.ready, `Keep flying + reopen: the 1-day job cost 1 day (day ${d0} → ${r.d}), print in the bay`);
    await page.close();
  }

  console.log('— B1: the same, through a reload');
  {
    const page = await boot();
    const d0 = await page.evaluate(m => { STATE.materials = Object.assign({}, m); STATE.fabricator.wear = 0; window.fabSetDayMs(300); openFabricator(); return STATE.daysElapsed; }, MATS);
    await pickRecipe(page, 'Hull Patch');
    await page.evaluate(() => { craftSelected(); STATE.cropGrowth.health = 0; });
    await page.waitForFunction(() => STATE.ended, null, { timeout: 5000 });
    await page.reload();
    await ready(page);
    await page.evaluate(() => { loadRun(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { if (STATE.ended) endContinueRun(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.fabSetDayMs(300); openFabricator(); });
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => ({ d: STATE.daysElapsed, ended: STATE.ended, craft: STATE.fabricator.craft, owed: STATE.fabricator.owedOutput }));
    ok(!r.ended && r.d === d0 + 1 && !r.craft && r.owed === 'hull_patch', `reload + Keep flying + reopen: day ${d0} → ${r.d}, print owed (${r.owed})`);
    await page.close();
  }

  console.log('— B1: a finished job on the bed (older save) comes out on open, even at the deadline');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      STATE.baseDays = STATE.daysElapsed + 1;
      STATE.daysElapsed = STATE.baseDays; // the deadline day: not one more day fits
      STATE.fabricator.wear = 0.8;
      STATE.fabricator.craft = { recipeId: 'hull_patch', daysTotal: 1, daysDone: 1, startDay: STATE.daysElapsed - 1, misfireP: 0, wearBefore: 0, wearAdded: 0.8, tax: {} };
      writeSnapshot(); STATE.fabricator.craft = null; loadRun();
      const d = STATE.daysElapsed;
      const held = window.fabCraftState() && window.fabCraftState().held;
      window.fabSetDayMs(200);
      openFabricator();
      return { d, held, d2: STATE.daysElapsed, craft: STATE.fabricator.craft, owed: STATE.fabricator.owedOutput, ended: STATE.ended };
    });
    ok(!r.held, `a job with every day spent is never held (held: ${r.held})`);
    ok(r.d2 === r.d && !r.craft && r.owed === 'hull_patch' && !r.ended, `open: the print comes out with no further day (day ${r.d} → ${r.d2}, owed ${r.owed}, no PAST DEADLINE)`);
    await page.close();
  }

  console.log('— B2: a craft day that kills the engineer — the next craft reads the live crew');
  {
    const page = await boot({ crew: ['pilot', 'engineer'] });
    // Just the two recipes' materials and an empty hold: room for the claim.
    await page.evaluate(() => { STATE.items = []; STATE.materials = { metal: 8, scrap: 5 }; STATE.fabricator.wear = 0; window.fabSetDayMs(300); openFabricator(); });
    await pickRecipe(page, 'Hull Patch');
    await page.evaluate(() => { craftSelected(); STATE.resources.food = 0; STATE.crewHP.engineer = 1; });
    await page.waitForFunction(() => !window.fabCraftState(), null, { timeout: 5000 });
    const crew = await page.evaluate(() => STATE.crew.slice());
    await page.evaluate(() => claimOutput(false));
    await pickRecipe(page, 'Field Repair Kit');
    const pre = await page.evaluate(() => document.getElementById('fb-meta').innerText.replace(/\s+/g, ' '));
    const c = await page.evaluate(() => { craftSelected(); return window.fabCraftState(); });
    ok(!crew.includes('engineer'), `the engineer died on the craft day (crew ${crew.join(',')})`);
    ok(/TIME 3d base/.test(pre) && !/Crew Engineering Bonus/.test(pre), `the TIME preview drops the dead engineer's bonus without a reopen ("${pre.slice(0, 40)}")`);
    ok(c && c.daysTotal === 3, `the next craft takes the solo 3 days (daysTotal ${c && c.daysTotal})`);
    await page.close();
  }

  console.log('— B3: a craft that takes wear to 100 runs to the end, then the fab breaks');
  {
    const page = await boot();
    await page.evaluate(m => { STATE.materials = Object.assign({}, m); STATE.fabricator.wear = 99.5; window.fabSetDayMs(300); openFabricator(); }, MATS);
    await pickRecipe(page, 'Hull Patch');
    const pre = await page.evaluate(() => [...document.querySelectorAll('.fb-warn')].map(x => x.textContent).join(' | '));
    const d0 = await page.evaluate(() => { craftSelected(); return STATE.daysElapsed; });
    const mid = await page.evaluate(() => ({ c: window.fabCraftState(), btn: document.getElementById('fb-craft-btn').textContent, broken: document.getElementById('fb-slot').classList.contains('state-broken') }));
    ok(/Will break the fab/.test(pre), `the preview warns: "${pre}"`);
    ok(mid.c && !mid.c.held && mid.c.running && !mid.broken, `the job runs at 100% wear (held: ${mid.c && mid.c.held}, slot broken: ${mid.broken}, CRAFT: ${mid.btn})`);
    await page.waitForFunction(() => !window.fabCraftState(), null, { timeout: 5000 });
    const end = await page.evaluate(() => ({ d: STATE.daysElapsed, wear: STATE.fabricator.wear, broken: STATE.fabricator.broken, owed: STATE.fabricator.owedOutput, notice: window.fabNoticeText(), btn: document.getElementById('fb-craft-btn').textContent }));
    ok(end.d === d0 + 1, `it took its day (day ${d0} → ${end.d})`);
    ok(end.wear === 100 && end.broken, `then the fab is broken (wear ${end.wear}, broken ${end.broken})`);
    ok(/FAB BROKEN/.test(end.notice) || /MISFIRE/.test(end.notice), `the modal says so ("${end.notice.slice(0, 60)}")`);
    await page.close();
  }
  {
    // An older save stuck at wear 100 with the job on the bed resumes.
    const page = await boot();
    const r = await page.evaluate(async () => {
      STATE.fabricator.wear = 100;
      STATE.fabricator.craft = { recipeId: 'hull_patch', daysTotal: 1, daysDone: 0, startDay: STATE.daysElapsed, misfireP: 0, wearBefore: 99.5, wearAdded: 0.5, tax: {} };
      window.fabSetDayMs(200); openFabricator();
      const held = window.fabCraftState().held;
      await new Promise(res => setTimeout(res, 700));
      return { held, craft: STATE.fabricator.craft, owed: STATE.fabricator.owedOutput, broken: STATE.fabricator.broken };
    });
    ok(!r.held && !r.craft && r.owed === 'hull_patch' && r.broken, `a job left at 100% wear finishes on reopen (held ${r.held}, owed ${r.owed}, broken ${r.broken})`);
    await page.close();
  }

  console.log('— B5: Cargo Hold SELL of cargo an event ahead needs asks first');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const st = STATE.nodes.find(n => n.node_type === 'station');
      STATE.currentId = st.id; STATE.stationVisit = null;
      STATE.items = ['alien_seed_pod', 'hull_plating'];
      syncItemValues(); syncItemPickups();
      openInventory();
      const conf = () => !document.getElementById('inv-confirm').classList.contains('hidden');
      const sell = id => { document.querySelector('#inv-grid .inv-tile[data-id="' + id + '"]').click(); document.getElementById('inv-sell-btn').click(); };
      const req = invRequiredFor('alien_seed_pod');
      const g0 = STATE.goldAmount;
      sell('alien_seed_pod');
      const asked = { open: conf(), still: STATE.items.includes('alien_seed_pod'), gold: STATE.goldAmount - g0,
        title: document.querySelector('#inv-jett-panel .jettison-title').textContent, warn: document.getElementById('inv-route-warn').textContent,
        yes: document.getElementById('inv-confirm-yes').textContent, count: !document.getElementById('inv-jett-count-row').classList.contains('hidden') };
      document.getElementById('inv-confirm-no').click();
      const cancelled = { open: conf(), still: STATE.items.includes('alien_seed_pod') };
      sell('alien_seed_pod');
      document.getElementById('inv-confirm-yes').click();
      const sold = { open: conf(), still: STATE.items.includes('alien_seed_pod'), gold: STATE.goldAmount - g0 };
      invSetTab('upgrades');
      sell('hull_plating');
      const plain = { open: conf(), still: STATE.items.includes('hull_plating') };
      closeInventory();
      return { req, asked, cancelled, sold, plain };
    });
    ok(r.req.length > 0, `alien_seed_pod is required ahead (${r.req.join(' · ')})`);
    ok(r.asked.open && r.asked.still && r.asked.gold === 0 && /SELL\?/.test(r.asked.title) && /Required for/.test(r.asked.warn) && r.asked.yes === 'SELL 1' && !r.asked.count,
      `SELL opens the jettison confirm: "${r.asked.title}" / "${r.asked.warn}" / ${r.asked.yes}; nothing sold yet`);
    ok(!r.cancelled.open && r.cancelled.still, 'CANCEL keeps it');
    ok(!r.sold.open && !r.sold.still && r.sold.gold > 0, `the confirm's yes sells it (+${r.sold.gold}g)`);
    ok(!r.plain.open && !r.plain.still, 'cargo nothing needs still sells in one click');
    await page.close();
  }

  console.log('— B5: Market Row SELL of cargo an event ahead needs asks first');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      STATE.items = ['alien_seed_pod', 'hull_plating'];
      syncItemValues(); syncItemPickups();
      openMarket({});
      await new Promise(res => setTimeout(res, 100));
      const conf = () => !document.getElementById('market-confirm').classList.contains('hidden');
      const sell = n => [...document.querySelectorAll('#market-sell-list .market-row')].find(x => x.textContent.includes(n)).querySelector('.market-row-btn').click();
      const g0 = STATE.goldAmount;
      sell('SEED POD');
      const asked = { open: conf(), still: STATE.items.includes('alien_seed_pod'), gold: STATE.goldAmount - g0, warn: document.getElementById('market-route-warn').textContent };
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const esc = { open: conf(), market: MarketModal.isOpen(), still: STATE.items.includes('alien_seed_pod') };
      sell('SEED POD');
      document.getElementById('market-confirm-no').click();
      const no = { open: conf(), still: STATE.items.includes('alien_seed_pod') };
      sell('SEED POD');
      document.getElementById('market-confirm-yes').click();
      const sold = { open: conf(), still: STATE.items.includes('alien_seed_pod'), gold: STATE.goldAmount - g0 };
      await new Promise(res => setTimeout(res, 400)); // past the double-click guard
      sell('HULL PLATING');
      const plain = { open: conf(), still: STATE.items.includes('hull_plating') };
      MarketModal.close();
      return { asked, esc, no, sold, plain };
    });
    ok(r.asked.open && r.asked.still && r.asked.gold === 0 && /Required for/.test(r.asked.warn), `SELL opens the confirm ("${r.asked.warn}"); nothing sold yet`);
    ok(!r.esc.open && r.esc.market && r.esc.still, 'Escape cancels the confirm, not the market');
    ok(!r.no.open && r.no.still, 'CANCEL keeps it');
    ok(!r.sold.open && !r.sold.still && r.sold.gold > 0, `the confirm's yes sells it (+${r.sold.gold}g)`);
    ok(!r.plain.open && !r.plain.still, 'cargo nothing needs still sells in one click');
    await page.close();
  }

  console.log('— B8: CANCEL refunds through the material grant');
  {
    const page = await boot();
    await page.evaluate(m => { STATE.materials = Object.assign({}, m); STATE.materialPickups = {}; STATE.fabricator.wear = 0; window.fabSetDayMs(5000); openFabricator(); }, MATS);
    await pickRecipe(page, 'Hull Patch');
    const r = await page.evaluate(() => {
      craftSelected();
      const seq = STATE.itemSeq || 0;
      STATE.materialPickups = {};
      cancelCraft();
      return { seq, metal: STATE.materials.metal, scrap: STATE.materials.scrap, mp: STATE.materialPickups };
    });
    ok(r.metal === 20 && r.scrap === 20, `the materials are back (metal ${r.metal}, scrap ${r.scrap})`);
    ok(r.mp.metal && r.mp.metal.n && r.mp.metal.s > r.seq && r.mp.scrap && r.mp.scrap.n, `marked NEW and newest like any pickup (${JSON.stringify(r.mp)})`);
    await page.close();
  }

  console.log('— B9: the required part leaves mid-craft — the job finishes without its wear discount');
  {
    const page = await boot();
    await page.evaluate(m => { STATE.materials = Object.assign({}, m); STATE.items = ['repair_fabricator']; STATE.fabricator.wear = 10; window.fabSetDayMs(600); openFabricator(); }, MATS);
    await pickRecipe(page, 'O2 Canister');
    const a = await page.evaluate(() => { craftSelected(); const c = window.fabCraftState(); STATE.items = STATE.items.filter(x => x !== 'repair_fabricator'); return { c, wear: STATE.fabricator.wear }; });
    await page.waitForFunction(() => !window.fabCraftState(), null, { timeout: 5000 });
    const b = await page.evaluate(() => ({ wear: STATE.fabricator.wear, owed: STATE.fabricator.owedOutput, log: STATE.shipLog.map(e => (e && e.text) || e).join(' | ') }));
    ok(a.c && a.c.wearAdded === 1.8 && a.c.partWear === 0.2, `CRAFT charged the discounted wear (+${a.c && a.c.wearAdded}, part's share ${a.c && a.c.partWear})`);
    ok(b.owed === 'o2_canister', 'the job still finishes');
    ok(Math.abs(b.wear - 12) < 1e-9 && /no Field Repair Fabricator aboard/.test(b.log), `and pays the full wear (10 → ${b.wear})`);
    await page.close();
  }
  {
    // With the part still aboard: the discount stands.
    const page = await boot();
    await page.evaluate(m => { STATE.materials = Object.assign({}, m); STATE.items = ['repair_fabricator']; STATE.fabricator.wear = 10; window.fabSetDayMs(300); openFabricator(); }, MATS);
    await pickRecipe(page, 'O2 Canister');
    await page.evaluate(() => craftSelected());
    await page.waitForFunction(() => !window.fabCraftState(), null, { timeout: 5000 });
    const w = await page.evaluate(() => STATE.fabricator.wear);
    ok(Math.abs(w - 11.8) < 1e-9, `part aboard to the end: the discounted wear only (10 → ${w})`);
    await page.close();
  }

  console.log('— B4 (ruling 54): Hold SELL is free, and its tooltip says so');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const st = STATE.nodes.find(n => n.node_type === 'station');
      STATE.currentId = st.id; STATE.stationVisit = null;
      STATE.items = ['hull_plating'];
      syncItemValues(); syncItemPickups();
      openInventory(); invSetTab('upgrades');
      document.querySelector('#inv-grid .inv-tile[data-id="hull_plating"]').click();
      const btn = document.getElementById('inv-sell-btn');
      const tip = btn.dataset.tipDescription, label = btn.textContent;
      const d = STATE.daysElapsed, mo = crewMoraleOf('pilot');
      btn.click();
      const out = { tip, label, sold: !STATE.items.includes('hull_plating'), dd: STATE.daysElapsed - d, dmo: crewMoraleOf('pilot') - mo };
      closeInventory();
      return out;
    });
    ok(/Same price as the stall · no day spent\./.test(r.tip), `the SELL tooltip: "${r.tip}"`);
    ok(r.sold && r.dd === 0 && r.dmo === 0, `and it is free: sold, ${r.dd} days, ${r.dmo} morale`);
    await page.close();
  }

  console.log('— B6 (ruling 55): CANCEL after the first day refunds half the materials');
  {
    const page = await boot();
    await page.evaluate(() => { STATE.materials = { metal: 20, scrap: 20 }; STATE.materialPickups = {}; STATE.fabricator.wear = 0; window.fabSetDayMs(150); openFabricator(); });
    await pickRecipe(page, 'Field Repair Kit'); // 5 metal + 3 scrap, 3 days solo
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(res => setTimeout(res, ms));
      craftSelected();
      const tip0 = document.getElementById('fb-progress-cancel').dataset.tipDescription;
      for (let i = 0; i < 80 && window.fabCraftState().daysDone < 1; i++) await w(20);
      window.fabSetDayMs(60000); // hold the clock on day 1
      await w(80);
      const tip1 = document.getElementById('fb-progress-cancel').dataset.tipDescription;
      const before = { metal: STATE.materials.metal, scrap: STATE.materials.scrap, d: STATE.daysElapsed, seq: STATE.itemSeq || 0 };
      STATE.materialPickups = {};
      cancelCraft();
      return { tip0, tip1, before, metal: STATE.materials.metal, scrap: STATE.materials.scrap, d: STATE.daysElapsed, mp: STATE.materialPickups,
        log: STATE.shipLog.slice(-1)[0].text, craft: window.fabCraftState() };
    });
    ok(/Nothing has been spent/.test(r.tip0), `day 0: "${r.tip0.slice(0, 50)}"`);
    ok(/^Refunds half the materials \(2 METAL, 1 SCRAP\)/.test(r.tip1), `after a day the tooltip names the half: "${r.tip1.slice(0, 60)}"`);
    ok(!r.craft && r.metal === r.before.metal + 2 && r.scrap === r.before.scrap + 1, `…and that is what comes back (+${r.metal - r.before.metal} metal, +${r.scrap - r.before.scrap} scrap)`);
    ok(r.d === r.before.d, 'the day already spent stays spent; no further day');
    ok(r.mp.metal && r.mp.metal.n && r.mp.metal.s > r.before.seq && r.mp.scrap && r.mp.scrap.n, `the half comes back as a pickup (NEW, newest): ${JSON.stringify(r.mp)}`);
    ok(/Half the materials are back in the hold \(2 metal, 1 scrap\)/.test(r.log), `the log says the same ("${r.log.slice(0, 90)}")`);
    await page.close();
  }
  {
    // The hold-full refusal is measured on the half: room for 2 metal + 1
    // scrap (not for the full 5 + 3) lets the cancel through.
    const page = await boot();
    await page.evaluate(() => { STATE.materials = { metal: 13, scrap: 4 }; STATE.fabricator.wear = 0; window.fabSetDayMs(150); openFabricator(); });
    await pickRecipe(page, 'Field Repair Kit');
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(res => setTimeout(res, ms));
      craftSelected(); // metal 8, scrap 1: one slot each
      for (let i = 0; i < 80 && window.fabCraftState().daysDone < 1; i++) await w(20);
      window.fabSetDayMs(60000);
      while (cargoSlotsUsed() < cargoCapacity()) STATE.items.push('gas_analyzer');
      const fullLand = materialLandings({ metal: 5, scrap: 3 });
      cancelCraft();
      const half = { craft: !!window.fabCraftState(), metal: STATE.materials.metal, scrap: STATE.materials.scrap, notice: fabNoticeText() };
      return { fullLand, half };
    });
    ok(r.fullLand.metal < 5, `the full refund would not fit (metal lands ${r.fullLand.metal}/5)`);
    ok(!r.half.craft && r.half.metal === 10 && r.half.scrap === 2 && !/HOLD FULL/.test(r.half.notice), `the half fits, so the cancel goes through (metal ${r.half.metal}, scrap ${r.half.scrap})`);
    // …and a half that doesn't fit is refused, nothing lost.
    await page.evaluate(m => { STATE.items = STATE.items.filter(x => x !== 'gas_analyzer'); STATE.materials = { metal: 10, scrap: 10 }; window.fabSetDayMs(150); }, null);
    await pickRecipe(page, 'Field Repair Kit');
    const f = await page.evaluate(async () => {
      const w = ms => new Promise(res => setTimeout(res, ms));
      craftSelected(); // metal 5, scrap 7
      for (let i = 0; i < 80 && window.fabCraftState().daysDone < 1; i++) await w(20);
      window.fabSetDayMs(60000);
      STATE.materials.metal = 10; // a full slot: the 2 back would need another
      while (cargoSlotsUsed() < cargoCapacity()) STATE.items.push('gas_analyzer');
      cancelCraft();
      return { craft: !!window.fabCraftState(), metal: STATE.materials.metal, notice: fabNoticeText() };
    });
    ok(f.craft && f.metal === 10 && /HOLD FULL/.test(f.notice), `a half the hold can't take is refused, nothing lost ("${f.notice.slice(0, 40)}")`);
    await page.close();
  }

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(`\ntest_b5_b: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
