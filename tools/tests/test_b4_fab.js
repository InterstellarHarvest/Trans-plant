// Batch 4 (final re-audit), fabricator + Cargo Hold + the shared modal
// close (resources/REAUDIT_SHIP_SCREENS.md; PARITY_AUDIT Tier C 27/28/42).
//   Fabricator: ruling 27 per-day crafting (days tick through passDays,
//   CANCEL refunds materials and keeps the unspent days, a day-0 cancel
//   costs nothing, a closed modal holds the job, a reload neither dodges
//   nor repeats a day or an output, misfire rolled at the end, the
//   deadline lock holds); A7 one-line locked label; B1 demo sizes unless
//   two warnings; B2 line-height normal; B7 effort-tax preview; B8 no $.
//   Cargo Hold: A11 trader + fence SELL PRICE (one fence rule, the black
//   market agrees); A12 per-item SLOT COST; A13 H2O USE vs EMPTY; B4
//   corners 10px + per-item 64px emoji; B5 materials NEW + Recent; B6
//   material flavor; ruling 28 SELL when docked + classified ⚠ + NOTES;
//   ruling 42 no footer Close.
//   Modals (A14): close eases 1 → 0.96 with no first-frame snap and no
//   double scale / double fade.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const BASE = URL.replace(/index\.html.*$/, '');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor && window.openFabricator && window.openInventory);
  return page;
}
async function boot(setup) {
  const page = await open();
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

(async () => {
  browser = await chromium.launch();

  console.log('— ruling 27: the fabricator pays per day');
  {
    const page = await boot();
    const s0 = await page.evaluate(() => {
      STATE.materials = { metal: 20, scrap: 20, minerals: 10, biocomponent: 10 };
      STATE.fabricator.wear = 0;
      window.fabSetDayMs(400);
      openFabricator();
      return { d: STATE.daysElapsed, food: STATE.resources.food, mo: crewMoraleOf('pilot'), metal: STATE.materials.metal };
    });
    await pickRecipe(page, 'Field Repair Kit');
    const s1 = await page.evaluate(() => {
      craftSelected();
      const c = window.fabCraftState();
      return { d: STATE.daysElapsed, metal: STATE.materials.metal, mo: crewMoraleOf('pilot'), wear: STATE.fabricator.wear, c, tax: effortTax(1),
        savedCraft: JSON.parse(localStorage.getItem('transplant_save_v1')).fabricator.craft, strip: document.getElementById('fb-progress-days').textContent };
    });
    ok(s1.c && s1.c.daysTotal === 3 && s1.c.daysDone === 0 && s1.d === s0.d, `CRAFT starts a ${s1.c && s1.c.daysTotal}-day job and passes no day up front (day ${s0.d} → ${s1.d})`);
    ok(s1.metal === s0.metal - 5 && s1.mo === s0.mo - s1.tax && s1.wear > 0, `CRAFT spends the materials (metal ${s0.metal} → ${s1.metal}), the effort tax (morale −${s1.tax} each) and the wear (${s1.wear}%)`);
    ok(s1.savedCraft && s1.savedCraft.recipeId === 'repair_kit' && s1.savedCraft.daysDone === 0, 'the job on the bed is in the save at once (daysDone 0)');
    ok(s1.strip === '0d / 3d', `the strip starts at the real day count ("${s1.strip}")`);
    await page.waitForFunction(() => window.fabCraftState() && window.fabCraftState().daysDone === 1, null, { timeout: 5000 });
    const s2 = await page.evaluate(() => ({ d: STATE.daysElapsed, food: STATE.resources.food, head: +document.getElementById('fb-trip-day').textContent,
      strip: document.getElementById('fb-progress-days').textContent, sv: JSON.parse(localStorage.getItem('transplant_save_v1')) }));
    ok(s2.d === s0.d + 1 && s2.head === s2.d, `one day of the job is one real day (day ${s2.d}, header ${s2.head})`);
    ok(s2.food < s0.food, `the day drains food like any other day (${s0.food} → ${s2.food})`);
    ok(/^1d \/ 3d/.test(s2.strip), `strip shows the real days passed ("${s2.strip}")`);
    ok(s2.sv.daysElapsed === s2.d && s2.sv.fabricator.craft.daysDone === 1, 'each day is saved with the job (save: day ' + s2.sv.daysElapsed + ', daysDone ' + s2.sv.fabricator.craft.daysDone + ')');
    await page.waitForFunction(() => !window.fabCraftState(), null, { timeout: 8000 });
    const s3 = await page.evaluate(() => ({ d: STATE.daysElapsed, owed: STATE.fabricator.owedOutput, ready: document.getElementById('fb-output-slot').classList.contains('ready'), kits: STATE.items.filter(x => x === 'repair_kit').length }));
    ok(s3.d === s0.d + 3 && s3.owed === 'repair_kit' && s3.ready, `the print comes out after exactly 3 days (day ${s3.d}) and waits in the bay`);
    const k0 = s3.kits;
    const s4 = await page.evaluate(() => { claimOutput(false); return { kits: STATE.items.filter(x => x === 'repair_kit').length, owed: STATE.fabricator.owedOutput }; });
    ok(s4.kits === k0 + 1 && !s4.owed, 'claiming it puts one repair kit in the hold');
    await page.close();
  }

  console.log('— ruling 27: every day is a real day (deprivation, failure)');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.materials = { metal: 20, scrap: 20 };
      STATE.resources.food = 0; STATE.deprived = { food: 0 };
      window.fabSetDayMs(80);
      openFabricator();
      [...document.querySelectorAll('.fb-recipe-row')].find(x => /Repair Kit/.test(x.textContent)).click();
      craftSelected();
      for (let i = 0; i < 60 && (!window.fabCraftState() || window.fabCraftState().daysDone < 2); i++) await w(25);
      return { dep: STATE.deprived.food, done: window.fabCraftState() && window.fabCraftState().daysDone };
    });
    ok(r.dep >= 1, `a craft day at 0 food counts toward starvation like any day (deprived.food ${r.dep} after ${r.done} days)`);
    const f = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.resources.o2 = 0; STATE.deprived.o2 = 2; // the next day at 0 O2 is the 3rd: suffocation
      for (let i = 0; i < 80 && !STATE.ended; i++) await w(25);
      return { ended: STATE.ended, fb: document.getElementById('overlay-fabricator').classList.contains('active'), screen: document.querySelector('.screen.active') && document.querySelector('.screen.active').id };
    });
    ok(f.ended && !f.fb && f.screen === 'screen-end', `a craft day can end the run (suffocation): overlay closed, end screen up (${f.screen})`);
    await page.close();
  }

  console.log('— ruling 27: CANCEL keeps the unspent days (ruling 55: after day 1, half the materials)');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.materials = { metal: 20, scrap: 20 }; STATE.fabricator.wear = 10;
      window.fabSetDayMs(150);
      openFabricator();
      [...document.querySelectorAll('.fb-recipe-row')].find(x => /Repair Kit/.test(x.textContent)).click();
      const before = { d: STATE.daysElapsed, metal: STATE.materials.metal, scrap: STATE.materials.scrap, mo: crewMoraleOf('pilot'), wear: STATE.fabricator.wear };
      // Day 0: cancel costs nothing.
      craftSelected();
      const tip0 = document.getElementById('fb-progress-cancel').dataset.tipDescription;
      cancelCraft();
      const zero = { d: STATE.daysElapsed, metal: STATE.materials.metal, scrap: STATE.materials.scrap, mo: crewMoraleOf('pilot'), wear: STATE.fabricator.wear, craft: window.fabCraftState() };
      // After a day: materials back, the days (and tax, wear) stay spent.
      craftSelected();
      const mid = { mo: crewMoraleOf('pilot'), wear: STATE.fabricator.wear };
      for (let i = 0; i < 80 && window.fabCraftState().daysDone < 1; i++) await w(25);
      const tip1 = document.getElementById('fb-progress-cancel').dataset.tipDescription;
      cancelCraft();
      const one = { d: STATE.daysElapsed, metal: STATE.materials.metal, scrap: STATE.materials.scrap, mo: crewMoraleOf('pilot'), wear: STATE.fabricator.wear, craft: window.fabCraftState(),
        owed: STATE.fabricator.owedOutput, log: STATE.shipLog.slice(-1)[0].text, strip: document.getElementById('fb-progress').classList.contains('active') };
      await w(500);
      return { before, zero, mid, one, tip0, tip1, dAfter: STATE.daysElapsed };
    });
    ok(!r.zero.craft && r.zero.d === r.before.d && r.zero.metal === r.before.metal && r.zero.scrap === r.before.scrap && r.zero.mo === r.before.mo && r.zero.wear === r.before.wear,
      `cancelled before its first day it costs nothing (materials, morale ${r.zero.mo}, wear ${r.zero.wear} all back)`);
    ok(/Nothing has been spent/.test(r.tip0) && /1 day already spent/.test(r.tip1), 'the CANCEL tooltip says which (day 0 vs after a day)');
    // Ruling 55: after its first day a cancel refunds half (Repair Kit 5 metal + 3 scrap → 2 + 1).
    ok(!r.one.craft && !r.one.owed && !r.one.strip && r.one.metal === r.before.metal - 3 && r.one.scrap === r.before.scrap - 2, `after a day: half the materials back (metal ${r.one.metal}, scrap ${r.one.scrap}), no output, strip idle`);
    ok(r.one.d === r.before.d + 1 && r.dAfter === r.one.d, `…the day spent stays spent, the 2 unspent days stay yours (day ${r.before.d} → ${r.one.d}, still ${r.dAfter} later)`);
    ok(r.one.mo === r.mid.mo - 0 || r.one.mo <= r.mid.mo, `…the effort tax stays paid (morale ${r.mid.mo} → ${r.one.mo}) and so does the wear (${r.one.wear}% = ${r.mid.wear}%)`);
    ok(r.one.wear === r.mid.wear && /cancelled after 1 day/.test(r.one.log), `logged: "${r.one.log.slice(0, 90)}"`);
    await page.close();
  }

  console.log('— ruling 27: a closed fabricator holds the job; a reload resumes it');
  {
    const page = await boot();
    await page.evaluate(() => {
      STATE.materials = { metal: 20, scrap: 20 };
      window.fabSetDayMs(200);
      openFabricator();
      [...document.querySelectorAll('.fb-recipe-row')].find(x => /Repair Kit/.test(x.textContent)).click();
      window.__d0 = STATE.daysElapsed;
      craftSelected();
    });
    await page.waitForFunction(() => window.fabCraftState() && window.fabCraftState().daysDone === 1, null, { timeout: 5000 });
    const held = await page.evaluate(async () => {
      closeFabricator();
      const d = STATE.daysElapsed;
      await new Promise(r => setTimeout(r, 900)); // > 4 fabricator days
      return { d, d2: STATE.daysElapsed, c: window.fabCraftState(), log: STATE.shipLog.slice(-1)[0].text };
    });
    ok(held.d2 === held.d && held.c.daysDone === 1, `closed: no day passes (day ${held.d} → ${held.d2}, job at ${held.c.daysDone}/3)`);
    ok(/held at day 1 of 3/.test(held.log), `the log says the job is held ("${held.log.slice(0, 70)}")`);
    const sv = await saved(page);
    // Reload mid-craft: the save has day 1 of the job and its day.
    await page.reload();
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor && window.openFabricator);
    const re = await page.evaluate(() => { loadRun(); return { d: STATE.daysElapsed, c: STATE.fabricator.craft, metal: STATE.materials.metal, kits: STATE.items.filter(x => x === 'repair_kit').length }; });
    ok(re.d === sv.daysElapsed && re.c && re.c.daysDone === 1 && re.metal === sv.materials.metal, `reload: same day (${re.d}), same job (day ${re.c && re.c.daysDone}/3), materials still spent (metal ${re.metal})`);
    await page.evaluate(() => { window.fabSetDayMs(120); openFabricator(); });
    const st = await page.evaluate(() => ({ strip: document.getElementById('fb-progress-days').textContent, active: document.getElementById('fb-progress').classList.contains('active') }));
    ok(st.active && /^1d \/ 3d/.test(st.strip), `reopened: the strip picks up at "${st.strip}"`);
    await page.waitForFunction(() => !window.fabCraftState(), null, { timeout: 6000 });
    const end = await page.evaluate(() => ({ d: STATE.daysElapsed, owed: STATE.fabricator.owedOutput, kits: STATE.items.filter(x => x === 'repair_kit').length }));
    ok(end.d === re.d + 2 && end.owed === 'repair_kit', `finishes after exactly the 2 remaining days (day ${re.d} → ${end.d}); the job's 3 days total, none dodged or repeated`);
    await page.evaluate(() => { claimOutput(false); closeFabricator(); });
    await page.reload();
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor && window.openFabricator);
    const twice = await page.evaluate(() => { loadRun(); openFabricator(); return { kits: STATE.items.filter(x => x === 'repair_kit').length, owed: STATE.fabricator.owedOutput, craft: STATE.fabricator.craft, ready: document.getElementById('fb-output-slot').classList.contains('ready') }; });
    ok(twice.kits === re.kits + 1 && !twice.owed && !twice.craft && !twice.ready, `one output, once: a reload after the claim brings no second kit (kits ${re.kits} → ${twice.kits})`);
    await page.close();
  }

  console.log('— ruling 27: misfire at the end; the deadline lock still holds');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.materials = { metal: 20, scrap: 20 }; STATE.fabricator.wear = 60;
      window.fabSetDayMs(60);
      openFabricator();
      [...document.querySelectorAll('.fb-recipe-row')].find(x => /Hull Patch/.test(x.textContent)).click();
      const d0 = STATE.daysElapsed;
      craftSelected();
      const early = fabNoticeText();
      const rnd = Math.random; Math.random = () => 0.01;
      for (let i = 0; i < 80 && window.fabCraftState(); i++) await w(20);
      Math.random = rnd;
      return { early, late: fabNoticeText(), owed: STATE.fabricator.owedOutput, days: STATE.daysElapsed - d0 };
    });
    ok(!/MISFIRE/.test(r.early) && /MISFIRE/.test(r.late) && !r.owed && r.days === 1, `the misfire is rolled when the print finishes, after its day (${r.days}d): "${r.late.slice(0, 50)}"`);
    // A held job that no longer fits the deadline waits instead of ending the run.
    const h = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      closeFabricator(); window.fabSetDayMs(60);
      openFabricator();
      [...document.querySelectorAll('.fb-recipe-row')].find(x => /Repair Kit/.test(x.textContent)).click();
      craftSelected(); closeFabricator();
      const base = STATE.baseDays; STATE.baseDays = STATE.daysElapsed; // the voyage clock ran out meanwhile
      openFabricator(); const d = STATE.daysElapsed;
      await w(400);
      const out = { d, d2: STATE.daysElapsed, ended: STATE.ended, strip: document.getElementById('fb-progress-days').textContent, held: window.fabCraftState().held };
      STATE.baseDays = base;
      return out;
    });
    ok(h.d2 === h.d && !h.ended && h.held === 'PAST DEADLINE' && /PAST DEADLINE/.test(h.strip), `a job that would run past the deadline holds — no day, no failure ("${h.strip}")`);
    await page.close();
  }

  console.log('— coordinator audit: pause, header after days elsewhere, full-hold cancel, claim = pickup, crew data');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.materials = { metal: 20, scrap: 20 };
      window.fabSetDayMs(120);
      openFabricator();
      [...document.querySelectorAll('.fb-recipe-row')].find(x => /Repair Kit/.test(x.textContent)).click();
      craftSelected();
      // Pause menu open: the clock stops.
      PauseBus.pause(); const d0 = STATE.daysElapsed; await w(500); const paused = { d: STATE.daysElapsed - d0, done: window.fabCraftState().daysDone };
      PauseBus.resume();
      for (let i = 0; i < 80 && window.fabCraftState().daysDone < 1; i++) await w(20);
      // Days spent elsewhere while the job is held: the header and the
      // deadline maths read the real day on reopen.
      closeFabricator(); passDays(3); openFabricator();
      const head = { h: +document.getElementById('fb-trip-day').textContent, d: STATE.daysElapsed, left: document.getElementById('fb-days-left').textContent, want: (STATE.baseDays - STATE.daysElapsed) + ' LEFT' };
      // A cancel whose materials no longer fit the hold is refused, nothing lost.
      closeFabricator();
      STATE.materials.metal = 10; // 1 slot; the 5 back would make it 2
      const metal = STATE.materials.metal;
      while (cargoSlotsUsed() < cargoCapacity()) STATE.items.push('gas_analyzer');
      openFabricator(); cancelCraft();
      const full = { craft: !!window.fabCraftState(), metal: STATE.materials.metal === metal, notice: fabNoticeText() };
      STATE.items = STATE.items.filter(x => x !== 'gas_analyzer');
      cancelCraft();
      return { paused, head, full, after: { craft: !!window.fabCraftState(), metal: STATE.materials.metal - metal } };
    });
    ok(r.paused.d === 0 && r.paused.done === 0, 'the pause menu holds the job (no day passes while PauseBus is paused)');
    ok(r.head.h === r.head.d && r.head.left === r.head.want, `days spent elsewhere: the reopened header reads the real day (${r.head.h} = ${r.head.d}, ${r.head.left})`);
    ok(r.full.craft && r.full.metal && /HOLD FULL/.test(r.full.notice), `a cancel the hold can't take back is refused, nothing lost ("${r.full.notice.slice(0, 50)}")`);
    ok(!r.after.craft && r.after.metal === 2, `with room made, the cancel refunds its half (+${r.after.metal} metal, ruling 55)`);
    const c = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      window.fabSetDayMs(40);
      [...document.querySelectorAll('.fb-recipe-row')].find(x => /Hull Patch/.test(x.textContent)).click();
      const rnd = Math.random; Math.random = () => 0.99; // no misfire
      craftSelected();
      for (let i = 0; i < 80 && window.fabCraftState(); i++) await w(20);
      Math.random = rnd;
      const seq0 = STATE.itemSeq;
      claimOutput(false);
      const marks = STATE.itemPickups.hull_patch || [];
      return { isNew: marks.length && marks[marks.length - 1].n, seq: marks.length && marks[marks.length - 1].s > seq0 };
    });
    ok(c.isNew && c.seq, 'a claimed print comes aboard through grantItem: NEW, newest in Recent');
    await page.close();
    const eng = await boot({ crew: ['engineer', 'pilot'] });
    const t = await eng.evaluate(() => {
      const tip = () => { openFabricator(); const el = [...document.querySelectorAll('[data-tip-title]')].find(e => /FAB SPEED BREAKDOWN/.test(e.dataset.tipTitle)); const v = el ? el.dataset.tipDescription : ''; closeFabricator(); return v; };
      const a = tip();
      MOD.crew_roster.find(c => c.role === 'engineer').passive_skill.fabricator_contribution = 15;
      const b = tip();
      return { a, b };
    });
    ok(/Engineer\)\s+\+250%/.test(t.a) && /Engineer\)\s+\+150%/.test(t.b), 'crew fab speed is read from crew_roster.json (engineer 25 → +250%; the data says 15 → +150%)');
    await eng.close();
  }

  console.log('— A7 / B7 / B8: one-line labels, the effort tax, no $ on loot locks');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      STATE.materials = { metal: 20, scrap: 20, minerals: 20, biocomponent: 20 };
      openFabricator();
      const btn = document.getElementById('fb-craft-btn');
      [...document.querySelectorAll('.fb-recipe-row')].find(x => /Hull Patch/.test(x.textContent)).click();
      const h0 = btn.getBoundingClientRect().height;
      // A locked row can't be selected by a click: select it the way the data does.
      const fuel = [...document.querySelectorAll('.fb-recipe-row')].find(x => /Fuel Cell/.test(x.textContent));
      const dollar = !!document.querySelector('.fb-recipe-row .dollar');
      const glyph = fuel.querySelector('.lock-glyph') && fuel.querySelector('.lock-glyph').textContent;
      return { h0, dollar, glyph, row: fuel.className };
    });
    ok(!r.dollar && r.glyph === '🔒' && /locked-purchase/.test(r.row), 'loot-only locked rows: 🔒 without the $ buy glyph (B8)');
    // Every label CRAFT can wear stays one line.
    const labels = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const btn = document.getElementById('fb-craft-btn');
      const measure = () => ({ t: btn.textContent, h: Math.round(btn.getBoundingClientRect().height), tipT: btn.dataset.tipTitle || '', tip: btn.dataset.tipDescription || '' });
      const out = [];
      closeFabricator();
      // LOCKED · NEEDS UPGRADE: select the locked fuel cell via the keyboard path's data (selectedId).
      STATE.items = STATE.items.filter(x => x !== 'repair_fabricator');
      openFabricator();
      const prev = MOD.recipes.recipes.find(x => x.id === 'recipe_fuel_cell');
      // Arrow keys skip locked rows, so give the fab the part, select, then take it away.
      STATE.items.push('repair_fabricator'); closeFabricator(); openFabricator();
      [...document.querySelectorAll('.fb-recipe-row')].find(x => /Fuel Cell/.test(x.textContent)).click();
      STATE.items = STATE.items.filter(x => x !== 'repair_fabricator'); closeFabricator(); openFabricator();
      out.push(measure());
      STATE.items.push('repair_fabricator'); STATE.materials = {}; closeFabricator(); openFabricator(); out.push(measure());
      STATE.materials = { metal: 20, scrap: 20, minerals: 20, exotic: 5 }; STATE.fabricator.broken = true; closeFabricator(); openFabricator(); out.push(measure());
      STATE.fabricator.broken = false; const base = STATE.baseDays; STATE.baseDays = STATE.daysElapsed; closeFabricator(); openFabricator(); out.push(measure()); STATE.baseDays = base;
      closeFabricator(); openFabricator(); out.push(measure());
      return out;
    });
    const craftH = labels[labels.length - 1].h;
    ok(labels[0].t === 'LOCKED · NEEDS UPGRADE' && /Field Repair Fabricator/.test(labels[0].tip), `locked label is short ("${labels[0].t}"), the part goes to the tooltip ("${labels[0].tip}")`);
    ok(labels.every(l => l.h === craftH), `every CRAFT label is one line, ${craftH}px: ${labels.map(l => l.t + ' ' + l.h).join(' | ')}`);
    const tax = await page.evaluate(() => {
      const cell = [...document.querySelectorAll('#fb-meta .label')].find(l => l.textContent === 'MORALE');
      const val = cell && cell.nextElementSibling.textContent;
      const before = crewMoraleOf('pilot');
      craftSelected();
      const paid = before - crewMoraleOf('pilot');
      cancelCraft();
      return { val, paid, tip: cell && cell.dataset.tipDescription };
    });
    ok(tax.val === '−' + tax.paid + ' each' && tax.paid === 1 && /every crew member/i.test(tax.tip || ''), `B7: the effort tax is previewed ("MORALE ${tax.val}") and is what CRAFT takes (−${tax.paid})`);
    await page.close();
    const solo = await boot({ crew: [] });
    const none = await solo.evaluate(() => { openFabricator(); return [...document.querySelectorAll('#fb-meta .label')].some(l => l.textContent === 'MORALE'); });
    ok(!none, 'no crew aboard: no tax, no MORALE cell');
    await solo.close();
  }

  console.log('— B1 / B2: demo sizes unless two warnings; Press Start line-height');
  {
    const demo = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await demo.goto(BASE + 'resources/demo-fabricator.html'); await demo.waitForTimeout(800);
    const d = await demo.evaluate(() => ({ slot: document.getElementById('fb-slot').offsetHeight, craft: document.getElementById('fb-craft-btn').offsetHeight, sprite: document.querySelector('.fb-detail-sprite').offsetHeight, out: document.getElementById('fb-output-slot').offsetHeight }));
    await demo.close();
    const page = await boot();
    const e = await page.evaluate(() => {
      STATE.materials = { metal: 20, scrap: 20, minerals: 20, biocomponent: 20, exotic: 5 }; STATE.items.push('repair_fabricator');
      openFabricator();
      const out = [];
      for (const rec of MOD.recipes.recipes) {
        [...document.querySelectorAll('.fb-recipe-row')].find(x => x.textContent.includes(rec.name)).click();
        const det = document.getElementById('fb-detail').getBoundingClientRect(), b = document.getElementById('fb-craft-btn').getBoundingClientRect();
        out.push({ id: rec.id, slot: document.getElementById('fb-slot').offsetHeight, craft: document.getElementById('fb-craft-btn').offsetHeight, sprite: document.querySelector('.fb-detail-sprite').offsetHeight, out: document.getElementById('fb-output-slot').offsetHeight, inside: b.bottom <= det.bottom - 2 });
      }
      const lh = ['.fb-title', '.fb-day-label', '#fb-craft-btn', '.fb-progress-label', '.fb-close'].map(s => getComputedStyle(document.querySelector('#overlay-fabricator ' + s)).lineHeight);
      return { out, lh };
    });
    ok(e.out.every(x => x.slot === d.slot && x.craft === d.craft && x.sprite === d.sprite && x.out === d.out && x.inside),
      `no warnings: every recipe at the demo's art ${d.slot} / bay ${d.out} / sprite ${d.sprite} / CRAFT ${d.craft}, CRAFT inside (${e.out.map(x => x.slot + '/' + x.craft).join(' ')})`);
    ok(e.lh.every(v => v === 'normal'), `fabricator Press Start labels: line-height normal (${e.lh.join(', ')})`);
    const w2 = await page.evaluate(() => {
      closeFabricator(); STATE.fabricator.wear = 99.5; STATE.baseDays = STATE.daysElapsed; openFabricator();
      const out = [];
      for (const rec of MOD.recipes.recipes) {
        [...document.querySelectorAll('.fb-recipe-row')].find(x => x.textContent.includes(rec.name)).click();
        const det = document.getElementById('fb-detail').getBoundingClientRect(), b = document.getElementById('fb-craft-btn').getBoundingClientRect();
        out.push({ warns: document.querySelectorAll('#fb-meta .fb-warn').length, inside: b.bottom <= det.bottom - 2 && b.top >= det.top, slot: document.getElementById('fb-slot').offsetHeight,
          cut: [...document.querySelectorAll('#fb-meta .fb-warn')].filter(x => x.scrollWidth > x.clientWidth + 1).map(x => x.textContent) });
      }
      return out;
    });
    ok(w2.every(x => x.warns === 2 && x.inside), `two warnings: CRAFT still inside on every recipe (art ${[...new Set(w2.map(x => x.slot))].join('/')})`);
    ok(w2.every(x => !x.cut.length), `no warning is cut off by its ellipsis ${JSON.stringify(w2.flatMap(x => x.cut).slice(0, 2))}`);
    await page.close();
  }

  console.log('— Cargo Hold: SELL PRICE (A11), SLOT COST (A12), H2O (A13)');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      STATE.items = ['sealed_vinyl', 'alien_seed_pod', 'fab_surplus', 'pressure_suit', 'pressure_suit', 'fuel_cell', 'fuel_cell', 'insulated_cargo_bay', 'unidentified_bone', 'spectrometer'];
      syncItemValues(); STATE.itemValues.unidentified_bone = [20];
      openInventory();
      const rows = id => { const t = document.querySelector('#inv-grid .inv-tile[data-id="' + id + '"]'); t.click(); return [...document.querySelectorAll('#inv-detail-meta .detail-stat')].map(x => x.textContent); };
      const out = {};
      for (const id of ['sealed_vinyl', 'alien_seed_pod', 'fab_surplus', 'unidentified_bone', 'pressure_suit', 'fuel_cell']) out[id] = rows(id);
      invSetTab('upgrades'); out.bay = rows('insulated_cargo_bay');
      const h2o = [...document.querySelectorAll('#inv-res-tiles .res-tile')].find(t => t.dataset.res === 'water');
      const stat = k => [...h2o.querySelectorAll('.res-tile-stat')].find(s => s.firstChild.textContent === k).lastChild.textContent;
      out.h2o = { use: stat('USE'), empty: stat('EMPTY'), want: 'DAY ' + (STATE.daysElapsed + Math.floor(STATE.resources.water / ORDERS_BASE.waterPerDay)) };
      return out;
    });
    ok(r.sealed_vinyl[2] === 'SELL PRICE17g · fence 25g' && r.alien_seed_pod[2] === 'SELL PRICE30g · fence 45g' && r.fab_surplus[2] === 'SELL PRICE8g · fence 12g',
      `fixed-value trade goods show trader + fence like rolled ones: ${[r.sealed_vinyl[2], r.alien_seed_pod[2], r.fab_surplus[2]].join(' | ')}`);
    ok(r.unidentified_bone[2] === 'SELL PRICE20g · fence 30g', `a rolled copy: its value, fence × 1.5 (${r.unidentified_bone[2]})`);
    ok(r.pressure_suit[1] === 'SLOT COST1 2 total' && r.fuel_cell[1] === 'SLOT COST0.3 per unit 1 total' && r.bay[1] === 'SLOT COST0 (+5 cap)',
      `SLOT COST is per item, plus the stack total: ${r.pressure_suit[1]} | ${r.fuel_cell[1]} | ${r.bay[1]}`);
    ok(r.h2o.use === '~0.35 / DAY' && r.h2o.empty === r.h2o.want, `H2O tile: USE ${r.h2o.use} agrees with EMPTY ${r.h2o.empty}`);
    // The black market (fence) pays the same figures the hold shows.
    const fence = await page.evaluate(async () => {
      openMarket({ sinister: true }); await new Promise(r => setTimeout(r, 100));
      const row = n => { const x = [...document.querySelectorAll('#market-sell-list .market-row')].find(y => y.textContent.includes(n)); return x && x.querySelector('.market-row-cost').textContent; };
      const out = { pod: row('SEED POD'), vinyl: row('SEALED VINYL'), surplus: row('FABRICATOR SURPLUS') };
      MarketModal.close();
      return out;
    });
    ok(fence.pod === '+45g' && fence.vinyl === '+25g' && fence.surplus === '+12g', `the fence pays them: pod ${fence.pod}, vinyl ${fence.vinyl}, surplus ${fence.surplus} (one rule, fenceBuyPrice)`);
    await page.close();
  }

  console.log('— Cargo Hold: corners + emoji (B4), materials NEW/Recent (B5), flavor (B6)');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      STATE.items = ['geiger_counter', 'logbook_fragment', 'pressure_suit'];
      openInventory();
      const tile = document.querySelector('#inv-grid .inv-tile[data-id="pressure_suit"]');
      const pr = tile.querySelector('.inv-tile-price'), cs = getComputedStyle(pr), tr = document.querySelector('#inv-grid .inv-tile[data-id="logbook_fragment"] .inv-tile-trade');
      const corners = { price: cs.fontSize, right: cs.right, bottom: cs.bottom, trade: getComputedStyle(tr).fontSize, tradeLeft: getComputedStyle(tr).left };
      // Missing art: the item's own emoji at 64px (onerror path).
      const real = window.itemSpritePath; window.itemSpritePath = () => 'sprites/none/missing.png';
      renderInventory();
      await new Promise(res => setTimeout(res, 300));
      const emo = document.querySelector('#inv-grid .inv-tile[data-id="geiger_counter"] .inv-tile-emoji');
      const emoji = emo ? { t: emo.textContent, fs: getComputedStyle(emo).fontSize } : null;
      window.itemSpritePath = real; closeInventory();
      return { corners, emoji };
    });
    ok(r.corners.price === '10px' && r.corners.right === '3px' && r.corners.bottom === '3px' && r.corners.trade === '10px' && r.corners.tradeLeft === '3px', `corners 10px at 3px (price ${r.corners.price}, ⇄ ${r.corners.trade})`);
    ok(r.emoji && r.emoji.t === '☢️' && r.emoji.fs === '64px', `missing art: the item's own emoji at 64px (${r.emoji && r.emoji.t} ${r.emoji && r.emoji.fs})`);
    const m = await page.evaluate(() => {
      STATE.materials = { metal: 4, scrap: 2 }; STATE.materialPickups = {};
      openInventory(); invSetTab('materials');
      const order0 = [...document.querySelectorAll('#inv-grid .inv-tile')].map(t => t.dataset.id + (t.querySelector('.inv-tile-new') ? '*' : ''));
      grantMaterials({ minerals: 3 }); grantMaterials({ scrap: 1 });
      renderInventory();
      const order1 = [...document.querySelectorAll('#inv-grid .inv-tile')].map(t => t.dataset.id + (t.querySelector('.inv-tile-new') ? '*' : ''));
      document.querySelector('#inv-grid .inv-tile[data-id="scrap"]').click();
      const order2 = [...document.querySelectorAll('#inv-grid .inv-tile')].map(t => t.dataset.id + (t.querySelector('.inv-tile-new') ? '*' : ''));
      const flavor = document.getElementById('inv-detail-flavor').textContent;
      const sv = saveRun() && JSON.parse(localStorage.getItem('transplant_save_v1')).materialPickups;
      return { order0, order1, order2, flavor, want: MOD.materials.materials.find(x => x.id === 'scrap').flavor, sv, mats: JSON.stringify(MOD.materials.materials) };
    });
    ok(m.order0.join() === 'metal,scrap' && m.order1.join() === 'scrap*,minerals*,metal', `materials: new stacks NEW and newest first (${m.order0.join()} → ${m.order1.join()})`);
    ok(m.order2.join() === 'scrap,minerals*,metal' && m.sv && m.sv.scrap && m.sv.scrap.n === false && m.sv.minerals.n === true, `a click clears NEW; the marks are saved (${m.order2.join()})`);
    ok(m.flavor && m.flavor === m.want, `material flavor line (B6): "${m.flavor}"`);
    ok(!/\d\s*g\b|=\s*\d/.test(m.mats.replace(/"value":\s*[\d.]+/g, '').replace(/"cargo_slots_per_10":\s*\d+/g, '')) && !/"notes"/.test(m.mats), 'materials.json states no price in its player text (the old "5 metal = 1g" notes are gone)');
    await page.close();
  }

  console.log('— ruling 28: SELL when docked, classified ⚠ + NOTES');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const st = STATE.nodes.find(n => n.node_type === 'station'), deep = STATE.nodes.find(n => n.node_type !== 'station' && n.node_type !== 'fork');
      STATE.items = ['sealed_vinyl', 'sealed_vinyl', 'classified_cargo', 'logbook_fragment', 'unidentified_bone'];
      syncItemValues(); STATE.itemValues.unidentified_bone = [11];
      STATE.materials = { metal: 3 };
      const look = id => { document.querySelector('#inv-grid .inv-tile[data-id="' + id + '"]').click(); const b = document.getElementById('inv-sell-btn'); return { shown: getComputedStyle(b).display !== 'none', text: b.textContent, notes: document.getElementById('inv-detail-notes').textContent }; };
      STATE.currentId = deep.id; STATE.stationVisit = null;
      openInventory();
      const away = { vinyl: look('sealed_vinyl'), warn: !!document.querySelector('.inv-tile-classified') };
      closeInventory();
      STATE.currentId = st.id;
      openInventory();
      const docked = { vinyl: look('sealed_vinyl'), cls: look('classified_cargo'), log: look('logbook_fragment'), warn: !!document.querySelector('#inv-grid .inv-tile[data-id="classified_cargo"] .inv-tile-classified') };
      const g0 = STATE.goldAmount;
      document.querySelector('#inv-grid .inv-tile[data-id="sealed_vinyl"]').click();
      document.getElementById('inv-sell-btn').click();
      const sold = { gold: STATE.goldAmount - g0, left: STATE.items.filter(x => x === 'sealed_vinyl').length, log: STATE.shipLog.slice(-1)[0].text, price: stationBuyPrice('sealed_vinyl') };
      const g1 = STATE.goldAmount;
      document.querySelector('#inv-grid .inv-tile[data-id="unidentified_bone"]').click();
      document.getElementById('inv-sell-btn').click();
      const bone = { gold: STATE.goldAmount - g1, left: STATE.items.includes('unidentified_bone'), vals: JSON.stringify(STATE.itemValues.unidentified_bone || []) };
      invSetTab('materials');
      const g2 = STATE.goldAmount;
      document.querySelector('#inv-grid .inv-tile[data-id="metal"]').click();
      document.getElementById('inv-sell-btn').click();
      const metal = { gold: STATE.goldAmount - g2, left: STATE.materials.metal, price: stationBuyPrice('metal') };
      closeInventory();
      // A wave-off closes the station's services: no SELL there either.
      STATE.stationVisit = { node: st.id, wavedOff: true, roomsDone: [], phase: 'left' };
      openInventory(); invSetTab('gear');
      const waved = look('sealed_vinyl');
      closeInventory();
      return { away, docked, sold, bone, metal, waved };
    });
    ok(!r.away.vinyl.shown && !r.away.warn, 'away from a station: no SELL, no ⚠');
    ok(r.docked.vinyl.shown && /SELL · 17g/i.test(r.docked.vinyl.text) && !r.docked.cls.shown && !r.docked.log.shown, `docked: SELL on what the trader buys ("${r.docked.vinyl.text}"); none on classified / story cargo`);
    ok(r.docked.warn && /⚠Classified/.test(r.docked.cls.notes) && /NOTES/.test(r.docked.cls.notes), `docked: the classified tile wears ⚠ and NOTES explains it ("${r.docked.cls.notes.slice(0, 60)}")`);
    ok(r.sold.gold === r.sold.price && r.sold.left === 1 && /Sold from the hold: Sealed Vinyl/.test(r.sold.log), `SELL pays the Market Row price (+${r.sold.gold}g = stationBuyPrice), one unit, logged`);
    ok(r.bone.gold === 11 && !r.bone.left && r.bone.vals === '[]', `a rolled copy sells for its own value (+${r.bone.gold}g) and leaves with it`);
    ok(r.metal.gold === r.metal.price && r.metal.left === 2, `materials sell by the unit (+${r.metal.gold}g, ${r.metal.left} left)`);
    ok(!r.waved.shown, 'waved off: the station sells nothing, the hold neither');
    await page.close();
  }

  console.log('— ruling 42: no footer Close; Esc / backdrop / ✕ close the hold');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      openInventory(); await w(300);
      const card = document.getElementById('inv-card').getBoundingClientRect(), body = document.getElementById('inv-body').getBoundingClientRect();
      return { footer: !!document.getElementById('inv-footer'), closeBtn: !!document.getElementById('inv-close'), gap: Math.round(card.bottom - body.bottom), esc: !!document.querySelector('#inv-x[data-esc-close]') };
    });
    ok(!r.footer && !r.closeBtn && r.gap <= 4, `no footer: the grid runs to the card's edge (${r.gap}px left for the border)`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('overlay-inventory').classList.contains('active'), null, { timeout: 2000 }).catch(() => {});
    const escClosed = await page.evaluate(() => !document.getElementById('overlay-inventory').classList.contains('active') && !document.body.classList.contains('pause-open'));
    ok(r.esc && escClosed, 'Esc closes the hold (the ✕ carries data-esc-close), no pause menu on top');
    const bd = await page.evaluate(async () => { openInventory(); await new Promise(r => setTimeout(r, 300)); document.getElementById('overlay-inventory').dispatchEvent(new MouseEvent('click', { bubbles: true })); const a = document.getElementById('overlay-inventory').classList.contains('active'); openInventory(); document.getElementById('inv-x').click(); return { a, b: document.getElementById('overlay-inventory').classList.contains('active') }; });
    ok(!bd.a && !bd.b, 'backdrop and ✕ close it');
    const lh = await page.evaluate(() => ['.inv-title', '.inv-tab', '.modal-x', '.res-tile-label', '.grid-section-header'].map(s => { const el = document.querySelector('#overlay-inventory ' + s); return el ? getComputedStyle(el).lineHeight : 'missing'; }));
    ok(lh.every(v => v === 'normal'), `hold Press Start labels: line-height normal (${lh.join(', ')})`);
    await page.close();
  }

  console.log('— A14: modals close like the demo (1 → 0.96 eased, no snap, no double)');
  {
    const page = await boot({ crew: ['engineer', 'pilot'] });
    const M = [['overlay-growbay', '#gb-modal', 'openGrowbay()', 'closeGrowbay()'],
      ['overlay-fabricator', '#fb-modal', 'openFabricator()', 'closeFabricator()'],
      ['overlay-inventory', '#inv-card', 'openInventory()', 'closeInventory()'],
      ['overlay-crew', '#cd-modal', "openCrewDetail('engineer')", "hideOverlay('overlay-crew')"],
      ['overlay-orders', '#od-modal', 'openOrders()', "document.getElementById('od-cancel').click()"]];
    for (const [ov, panel, o, c] of M) {
      await page.evaluate(js => eval(js), o);
      await page.waitForFunction(([ov, p]) => getComputedStyle(document.querySelector('#' + ov + ' ' + p)).scale.replace('none', '1') === '1' && +getComputedStyle(document.getElementById(ov)).opacity === 1, [ov, panel], { timeout: 3000 }).catch(() => {});
      const r = await page.evaluate(([ov, p, c]) => {
        const el = document.querySelector('#' + ov + ' ' + p);
        eval(c);
        const first = getComputedStyle(el).scale.replace('none', '1'); // the first close frame's value
        const t = el.getAnimations().find(a => a.transitionProperty === 'scale');
        const kf = t ? t.effect.getKeyframes() : [];
        return { first, dur: t ? Math.round(t.effect.getTiming().duration) : 0, easing: t ? t.effect.getTiming().easing : '', from: kf[0] && kf[0].scale, to: kf[kf.length - 1] && kf[kf.length - 1].scale, others: el.getAnimations().filter(a => a !== t).map(a => a.animationName || a.transitionProperty) };
      }, [ov, panel, c]);
      // Mid-close sample, read off the running transition.
      const mid = await page.evaluate(async ([ov, p]) => {
        const el = document.querySelector('#' + ov + ' ' + p);
        const t = el.getAnimations().find(a => a.transitionProperty === 'scale');
        if (!t) return null;
        // Seek the running transition to a third of the way (frame timing
        // in headless runs is too uneven to sample by waiting).
        t.pause(); t.currentTime = 83;
        const s = parseFloat(getComputedStyle(el).scale), at = Math.round(t.currentTime);
        t.play();
        return { s, at };
      }, [ov, panel]);
      await page.waitForFunction(([ov, p]) => getComputedStyle(document.getElementById(ov)).visibility === 'hidden' && !document.querySelector('#' + ov + ' ' + p).getAnimations().length, [ov, panel], { timeout: 5000 }).catch(() => {});
      const end = await page.evaluate(([ov, p]) => { const el = document.querySelector('#' + ov + ' ' + p); const m = new DOMMatrix(getComputedStyle(el).transform); return { scale: getComputedStyle(el).scale, tScale: Math.round(Math.hypot(m.a, m.b) * 1000) / 1000, op: getComputedStyle(el).opacity }; }, [ov, panel]);
      ok(r.first === '1' && r.dur === 250 && r.easing === 'ease' && r.from === '1' && r.to === '0.96' && !r.others.length, `${ov}: close starts at 1 (no snap), eases 1 → 0.96 over 250ms (${r.from}→${r.to} ${r.easing} ${r.dur}ms${r.others.length ? '; also ' + r.others.join(',') : ''})`);
      ok(mid && mid.s < 0.99 && mid.s > 0.97, `${ov}: a third of the way the ease reads ${mid && mid.s} at ${mid && mid.at}ms (demo ~0.977)`);
      ok(end.scale === '0.96' && end.tScale === 1 && end.op === '1', `${ov}: closed at 0.96 once (scale ${end.scale}) — no extra transform scale (${end.tScale}), the panel itself never fades (opacity ${end.op}; the overlay does)`);
    }
    await page.close();
  }

  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors.slice(0, 3)));
  console.log(`b4_fab: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
