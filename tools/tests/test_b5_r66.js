// Rulings 66–67: a reload after a fight's result is decided lands that
// result (never the ATTEMPT ESCAPE break-off of ruling 53): the kill
// (LEAVE IT until SALVAGE is picked), a surrender on offer (taken, +5
// morale), FINISH THEM, their retreat, our completed jump. And the
// Autopilot failure names the passengers still aboard.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const KEY = 'transplant_save_v1';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];

async function open(setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('pageerror', e => errors.push(String(e.stack || e.message).slice(0, 300)));
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['pilot', 'engineer'], crop: 'wheat', ship: 'Q' }, o));
    STATE.stowaway = null;
    const n = STATE.nodes.find(x => x.node_type !== 'fork' && x.node_type !== 'station' && x.id !== STATE.nodes[0].id);
    n.node_type = 'void'; STATE.currentId = n.id; STATE.forcedEvent = null;
    STATE.resources.fuel = 60; STATE.items = [];
    returnToHub(); saveRun();
  }, setup || {});
  await page.waitForTimeout(300);
  return page;
}
async function reloadContinue(page) {
  await page.reload();
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor && document.getElementById('btn-continue'));
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => document.getElementById('title-buttons').classList.contains('visible'))) break;
    if (i % 10 === 0) await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  }
  await page.waitForSelector('#title-buttons.visible', { timeout: 20000 });
  await page.waitForTimeout(500); // the menu arms a beat after it appears (ruling 113)
  await page.click('#btn-continue');
  await page.keyboard.press('x'); // a key skips the departure (ruling 113)
  await page.waitForFunction(() => !document.getElementById('screen-title').classList.contains('active'));
  await page.waitForTimeout(700);
}
const snap = page => page.evaluate(() => ({
  day: STATE.daysElapsed, fuel: STATE.resources.fuel, hull: STATE.resources.hull, gold: STATE.goldAmount,
  morale: crewMoraleRaw(), ended: !!STATE.ended, flags: [...STATE.flags],
  scr: (document.querySelector('.screen.active') || {}).id, ev: STATE.currentEvent && STATE.currentEvent.id,
  log: (STATE.shipLog || []).slice(-2).map(e => (e && e.text) || e).join(' | '),
}));
const pending = page => page.evaluate(k => { const s = JSON.parse(localStorage.getItem(k) || 'null'); return s && s.pendingCombat; }, KEY);
const title = page => page.evaluate(() => document.getElementById('enc-narr-title').textContent);
const has = (page, t) => page.evaluate(t => [...document.querySelectorAll('#enc-choices .enc-choice')].some(b => b.textContent.includes(t) && !b.classList.contains('combat-fading-out')), t);
const click = (page, t) => page.evaluate(t => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.textContent.includes(t) && !b.classList.contains('combat-fading-out')); if (!b) return false; b.click(); return true; }, t);
// A fight with the dice fixed (r), against a species that surrenders or not.
async function fight(page, species, r) {
  await page.evaluate(([sp, r]) => {
    Math.random = () => r;
    enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001);
    STATE.npcCtx.species = sp;
  }, [species, r]);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.triggerCombat({}));
  await page.waitForTimeout(600);
}
// Fire until `until(title)` or an action shows.
async function shootUntil(page, done) {
  for (let i = 0; i < 16; i++) {
    if (await done()) return true;
    if (!(await has(page, 'FIRE LASER'))) { await page.waitForTimeout(400); continue; }
    await click(page, 'FIRE LASER'); await page.waitForTimeout(80);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
  }
  return done();
}
const DAYS = { low: 2, medium: 4, high: 8 };

(async () => {
  browser = await chromium.launch();

  console.log('— a reload in the victory beat lands the kill (LEAVE IT until SALVAGE is picked)');
  {
    const page = await open({ crew: ['engineer'] });
    const a = await snap(page);
    await fight(page, 'insect', 0.5);
    ok(await shootUntil(page, async () => /TARGET DESTROYED/.test(await title(page))), 'the ship is destroyed');
    const pc = await pending(page);
    ok(pc && pc.won && pc.won.outcome === 'victory_destroyed' && pc.won.salvaged === false, `the save holds the decided kill (${JSON.stringify(pc && pc.won)})`);
    await reloadContinue(page);
    const r = await snap(page);
    ok(r.scr === 'screen-cruise' && !r.ended && !r.ev, `back at the hub (${r.scr})`);
    ok(r.fuel === a.fuel && r.hull === pc.hull, `no escape: fuel ${a.fuel} → ${r.fuel}, hull as it stood (${pc.hull} → ${r.hull})`);
    ok(r.day - a.day === DAYS.low && r.gold >= a.gold + 4, `LEAVE IT: +${r.day - a.day}d, the partial loot (+${r.gold - a.gold} gold)`);
    ok(/VICTORY · DEPARTED — the fight was decided/.test(r.log), 'the log says what landed');
    await reloadContinue(page);
    const r2 = await snap(page);
    ok(r2.day === r.day && r2.gold === r.gold && r2.fuel === r.fuel, 'a second reload applies nothing again');
    await page.close();
  }

  console.log('— SALVAGE picked, then a reload: the salvage lands');
  {
    const page = await open({ crew: ['engineer'] });
    const a = await snap(page);
    await fight(page, 'insect', 0.5);
    await shootUntil(page, () => has(page, 'SALVAGE WRECKAGE'));
    await click(page, 'SALVAGE WRECKAGE');
    await page.waitForTimeout(100);
    const pc = await pending(page);
    ok(pc && pc.won && pc.won.salvaged === true, 'the pick is saved at once');
    await reloadContinue(page);
    const r = await snap(page);
    ok(r.day - a.day === DAYS.high && r.gold >= a.gold + 8 && /VICTORY · SALVAGED/.test(r.log), `SALVAGE: +${r.day - a.day}d, full loot (+${r.gold - a.gold} gold)`);
    await page.close();
  }

  console.log('— a surrender on offer: a reload takes it, as ACCEPT does');
  {
    // In game first: the same fight, ACCEPT SURRENDER, Continue.
    const g = await open({ crew: ['engineer', 'pilot'] });
    const ga = await snap(g);
    await fight(g, 'human', 0.5);
    ok(await shootUntil(g, () => has(g, 'ACCEPT SURRENDER')), 'they offer to surrender');
    await click(g, 'ACCEPT SURRENDER');
    await g.waitForTimeout(600);
    await g.evaluate(() => { document.getElementById('combat-end-continue').click(); });
    await g.waitForTimeout(600);
    const gr = await snap(g);
    await g.close();

    const page = await open({ crew: ['engineer', 'pilot'] });
    const a = await snap(page);
    await fight(page, 'human', 0.5);
    await shootUntil(page, () => has(page, 'ACCEPT SURRENDER'));
    const pc = await pending(page);
    ok(pc && pc.won && pc.won.outcome === 'victory_surrendered' && pc.won.moraleAdd === 5, `the offer is saved as taken (${JSON.stringify(pc && pc.won)})`);
    await reloadContinue(page);
    const r = await snap(page);
    ok(!r.ended && r.fuel === a.fuel && r.hull === gr.hull, `no escape: fuel ${r.fuel}, hull ${r.hull} (in game ${gr.hull})`);
    ok(r.day - a.day === gr.day - ga.day, `the same time (+${r.day - a.day}d, in game +${gr.day - ga.day}d)`);
    ok(Math.abs((r.morale - a.morale) - (gr.morale - ga.morale)) < 0.6, `the same morale, +5 included (${(r.morale - a.morale).toFixed(1)}, in game ${(gr.morale - ga.morale).toFixed(1)})`);
    ok(r.gold >= a.gold + 3 && /SURRENDER ACCEPTED/.test(r.log), `their tribute (+${r.gold - a.gold} gold)`);
    await page.close();
  }

  console.log('— FINISH THEM, then a reload: the execution lands, flag and all');
  {
    const page = await open({ crew: ['engineer', 'pilot'] });
    const a = await snap(page);
    await fight(page, 'human', 0.5);
    await shootUntil(page, () => has(page, 'FINISH THEM'));
    const before = await page.evaluate(() => crewMoraleRaw());
    await click(page, 'FINISH THEM');
    await page.waitForTimeout(100);
    const pc = await pending(page);
    ok(pc && pc.won && pc.won.outcome === 'victory_executed', 'the execution is saved at once');
    await reloadContinue(page);
    const r = await snap(page);
    ok(r.flags.includes('executed_surrendered_pirate') && r.day - a.day === DAYS.high && /SURRENDER REFUSED/.test(r.log), `the flag, +${r.day - a.day}d`);
    ok(r.morale < before, `the crew saw it (morale ${before.toFixed(1)} → ${r.morale.toFixed(1)})`);
    await page.close();
  }

  console.log('— their retreat, then a reload: they fled, nothing more');
  {
    const page = await open({ crew: ['engineer', 'pilot'] });
    const a = await snap(page);
    await fight(page, 'human', 0.2);
    ok(await shootUntil(page, async () => /ENEMY RETREAT/.test(await title(page))), 'they jump out');
    const pc = await pending(page);
    ok(pc && pc.won && pc.won.outcome === 'enemy_retreat', 'the retreat is saved');
    await reloadContinue(page);
    const r = await snap(page);
    ok(!r.ended && r.fuel === a.fuel && r.hull === pc.hull && r.gold === a.gold && r.day - a.day === DAYS.low && /ENEMY FLED/.test(r.log), `no loot, no fuel, +${r.day - a.day}d`);
    await page.close();
  }

  console.log('— our jump completed, then a reload: the escape, no more volleys');
  {
    const page = await open({ crew: ['engineer', 'pilot'] });
    const a = await snap(page);
    await fight(page, 'insect', 0.9); // 0.9: every charge-turn shot misses or lands the same way, deterministically
    await click(page, 'ATTEMPT ESCAPE');
    for (let i = 0; i < 30 && !/FTL JUMP COMPLETE/.test(await title(page)); i++) await page.waitForTimeout(300);
    ok(/FTL JUMP COMPLETE/.test(await title(page)), 'the drive jumps');
    const pc = await pending(page);
    ok(pc && pc.won && pc.won.outcome === 'escape', 'the jump is saved');
    await reloadContinue(page);
    const r = await snap(page);
    ok(!r.ended && r.fuel === a.fuel - 15 && r.hull === pc.hull && r.day - a.day === DAYS.medium && /FTL ESCAPED/.test(r.log), `−15 fuel, hull as it stood (${pc.hull} → ${r.hull}), +${r.day - a.day}d`);
    await page.close();
  }

  console.log('— Autopilot names the passengers still aboard');
  {
    const page = await open({ crew: [] });
    const end = async setup => {
      await page.evaluate(s => {
        localStorage.removeItem('transplant_save_v1');
        applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: [], crop: 'wheat', ship: 'Q' });
        STATE.stowaway = null; returnToHub();
        (new Function(s))();
        STATE.captainHP = 0; checkFailure();
      }, setup);
      await page.waitForTimeout(1500);
      return page.evaluate(() => ({ title: STATE.ended && document.getElementById('end-cine-title') ? document.getElementById('end-cine-title').textContent : '', body: (document.getElementById('end-cine-body') || {}).textContent || '', quote: document.body.innerText }));
    };
    let e = await end('');
    ok(/nobody left to fly the ship/.test(e.body) && !/passenger/.test(e.body), 'alone: the authored Autopilot copy');
    e = await end('STATE.passengers = [{ id: "x", name: "Ines Vahl", reward: null, farewell: null, boardedDay: 0 }];');
    ok(/Ines Vahl is still aboard/.test(e.body) && /one very quiet passenger and no living crew/.test(e.body), 'a rescued passenger is named');
    ok(/Ines Vahl arrived, and nobody who could fly it/.test(e.quote), 'the epitaph names them too');
    e = await end('STATE.stowaway = { identity: { name: "Pip Andrade" }, revealed: true }; STATE.flags.add("stowaway_passenger"); STATE.passengers = [{ id: "x", name: "Ines Vahl" }];');
    ok(/Pip Andrade and Ines Vahl are still aboard/.test(e.body) && /two very quiet passengers/.test(e.body), 'a stowaway passenger and a rescue: both named');
    await page.close();
  }

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`b5_r66: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
