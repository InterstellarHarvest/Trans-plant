// Hunt 6 robustness (2026-10-11): a reload or a load can't undo, re-roll
// or leak a fight, a job or a craft; pause stops combat; cancel refunds.
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
const startFight = page => page.evaluate(async () => {
  const ev = Object.values(EVENTS).find(e => JSON.stringify(e).includes('"triggerCombat":true'));
  enterEvent(STATE.byId[STATE.currentId], ev); window.triggerCombat({});
  await new Promise(r => setTimeout(r, 300));
});
const btn = (page, re) => page.evaluate(src => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => new RegExp(src).test(x.textContent)); if (b) b.click(); return !!b; }, re);

(async () => {
  browser = await chromium.launch();

  console.log('— a load discards the replaced fight');
  {
    const page = await boot();
    await startFight(page);
    const r = await page.evaluate(async () => {
      Math.random = () => 0.99;
      const before = { hull: STATE.resources.hull, day: STATE.daysElapsed, items: STATE.items.length };
      const evade = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => /EVASIVE/.test(x.textContent));
      evade && evade.click();                       // the enemy turn is now in flight
      window.abortCombat();                          // what LOAD does first
      STATE.currentEvent = null; STATE.outcomeMode = false;
      await new Promise(r => setTimeout(r, 3000));
      return { before, after: { hull: STATE.resources.hull, day: STATE.daysElapsed, items: STATE.items.length, outcome: STATE.outcomeMode } };
    });
    ok(JSON.stringify(r.before) === JSON.stringify({ hull: r.after.hull, day: r.after.day, items: r.after.items }) && !r.after.outcome, 'no stale shot or outcome lands after an abort');
    await page.close();
  }

  console.log('— pause stops combat');
  {
    const page = await boot();
    await startFight(page);
    const r = await page.evaluate(async () => {
      Math.random = () => 0.6;
      const h0 = document.getElementById('combat-num-hull').textContent;
      [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => /EVASIVE/.test(x.textContent)).click();
      PauseBus.paused = true;
      await new Promise(r => setTimeout(r, 2500));
      const hPaused = document.getElementById('combat-num-hull').textContent;
      PauseBus.paused = false;
      await new Promise(r => setTimeout(r, 1500));
      return { h0, hPaused, h1: document.getElementById('combat-num-hull').textContent };
    });
    ok(r.hPaused === r.h0 && r.h1 !== r.h0, `the enemy turn waits for the pause (${r.h0} → paused ${r.hPaused} → ${r.h1})`);
    await page.close();
  }

  console.log('— a reload mid-fight breaks it off (no free escape)');
  {
    const page = await boot();
    await page.evaluate(() => { STATE.resources.fuel = 60; });
    await startFight(page);
    await page.evaluate(async () => {
      Math.random = () => 0.6;
      [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => /EVASIVE/.test(x.textContent)).click();
      await new Promise(r => setTimeout(r, 1500));
    });
    const hullInFight = await page.evaluate(() => parseInt(document.getElementById('combat-num-hull').textContent, 10));
    const d0 = await page.evaluate(() => STATE.daysElapsed);
    await reloadAndContinue(page);
    const r = await page.evaluate(() => ({ ev: STATE.currentEvent && STATE.currentEvent.id, fuel: STATE.resources.fuel, hull: STATE.resources.hull, day: STATE.daysElapsed }));
    ok(!r.ev && r.fuel === 45 && Math.round(r.hull) === hullInFight && r.day > d0, `settled as an escape (fuel ${r.fuel}, hull ${Math.round(r.hull)} = fight ${hullInFight}, days +${r.day - d0})`);
    await page.close();
  }

  console.log('— a reload keeps the NPC you met');
  {
    const page = await boot();
    const ev = await page.evaluate(() => { const e = Object.values(EVENTS).find(x => x.npc && !x.npc.species && x.layers); enterEvent(STATE.byId[STATE.currentId], e); return { id: e.id, sp: STATE.npcCtx.species }; });
    const seen = new Set([ev.sp]);
    for (let i = 0; i < 4; i++) { await reloadAndContinue(page); seen.add(await page.evaluate(() => STATE.npcCtx && STATE.npcCtx.species)); }
    ok(seen.size === 1, `species stays ${ev.sp} across 4 reloads (${[...seen].join(', ')})`);
    await page.close();
  }

  console.log('— a fabricator misfire is saved at once');
  {
    const page = await boot();
    const before = await page.evaluate(() => {
      STATE.materials = { metal: 20, scrap: 20, minerals: 20, exotic: 5, biocomponent: 5 };
      STATE.fabricator = { wear: 95, broken: false };
      returnToHub(); openFabricator();
      return JSON.stringify(STATE.materials);
    });
    await page.evaluate(() => { Math.random = () => 0.01; const b = document.querySelector('.fb-recipe:not(.locked), .recipe:not(.locked), [data-recipe]'); if (b) b.click(); window.craftSelected(); });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => JSON.stringify(STATE.materials));
    await reloadAndContinue(page);
    const reloaded = await page.evaluate(() => JSON.stringify(STATE.materials));
    ok(after !== before && reloaded === after, 'misfire spent the materials and a reload keeps them spent');
    await page.close();
  }

  console.log('— Stop-menu jobs: reload = quit, cancel = refund, backdrop can\'t quit a running job');
  {
    const page = await boot();
    const r0 = await page.evaluate(async () => {
      const RE = /SALVAGE|SCAN|HUNT|GATHER|SCAVENGE/;
      let b = null;
      for (const n of STATE.nodes.filter(x => x.node_type !== 'fork')) {
        STATE.currentId = n.id; returnToHub(); renderCruise();
        document.body.classList.remove('stop-active'); document.getElementById('stop-btn').click();
        await new Promise(r => setTimeout(r, 60));
        b = [...document.querySelectorAll('#stop-choices .stop-choice')].find(x => RE.test(x.textContent) && !x.classList.contains('locked'));
        if (b) break;
      }
      STATE.resources.morale = 70;
      const label = b.textContent; b.click();
      await new Promise(r => setTimeout(r, 300));
      const taxed = STATE.resources.morale;
      document.getElementById('mclose').click();             // closed at the briefing
      await new Promise(r => setTimeout(r, 200));
      return { label, taxed, refunded: STATE.resources.morale };
    });
    ok(r0.taxed < 70 && r0.refunded === 70, `a free cancel refunds the effort tax (${r0.taxed} → ${r0.refunded})`);
    const r1 = await page.evaluate(async () => {
      const b = [...document.querySelectorAll('#stop-choices .stop-choice')].find(x => /SALVAGE|SCAN|HUNT|GATHER|SCAVENGE/.test(x.textContent) && !x.classList.contains('locked'));
      b.click(); await new Promise(r => setTimeout(r, 300));
      const begin = [...document.querySelectorAll('#ov button, #ov .btn')].find(x => /BEGIN/i.test(x.textContent));
      begin && begin.click(); await new Promise(r => setTimeout(r, 300));
      const ov = document.getElementById('ov');
      ov.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); ov.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      return { stillOpen: ov.classList.contains('open'), day: STATE.daysElapsed, morale: STATE.resources.morale };
    });
    ok(r1.stillOpen, 'a backdrop press does not quit a running job');
    await reloadAndContinue(page);
    const r2 = await page.evaluate(() => ({ day: STATE.daysElapsed, morale: STATE.resources.morale, log: JSON.stringify((STATE.shipLog || []).slice(-2)) }));
    ok(r2.day === r1.day + 1 && r2.morale === r1.morale && /abandoned partway/.test(r2.log), `a reload mid-job settles as a quit (day +${r2.day - r1.day}, tax kept)`);
    await page.close();
  }

  console.log('— small ones');
  {
    const page = await boot({ crew: ['engineer'] });
    const r = await page.evaluate(() => {
      crewHPOf('medic');
      const phantom = 'medic' in STATE.crewHP;
      const g1 = grantItem('mystery_provisions'), g2 = grantItem('mystery_provisions');
      // the cargo bay can't be taken while its slots are in use
      STATE.items = ['insulated_cargo_bay']; while (cargoSlotsUsed() < cargoCapacity()) STATE.items.push('medkit');
      for (let i = 0; i < 40; i++) removeRandomItem();
      const bay = STATE.items.includes('insulated_cargo_bay') || cargoSlotsUsed() <= cargoCapacity();
      const tb = getComputedStyle(document.querySelector('#screen-title .title-buttons'));
      return { phantom, g1, g2, bay, over: cargoSlotsUsed() > cargoCapacity() };
    });
    ok(!r.phantom, 'asking about an absent role creates no HP entry');
    ok(r.g1 && r.g2 === false, 'a unique_instance item is granted once');
    ok(!r.over, 'random item loss never leaves the hold over capacity');
    const pe = await page.evaluate(() => { const el = document.querySelector('#screen-title .title-buttons'); el.classList.remove('visible'); return getComputedStyle(el).pointerEvents; });
    ok(pe === 'none', 'title buttons ignore clicks until they are visible');
    await page.close();
  }

  ok(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(`\nhunt6b: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
