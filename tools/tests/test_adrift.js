// Ruling 144: Adrift is a scene, not a screen. The leg that runs the tank
// dry still arrives (the ship coasts in); flying on with nothing in the tank
// opens the Adrift scene (never pool-drawn). Its ways out: burn the plating
// (a weak hull may not survive it), crack the water, the emergency beacon
// (someone always answers), call and wait (a roll: rescued, pirates, or
// nobody), or give up — the Adrift ending.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor && typeof enterEvent === 'function' && EVENTS.event_adrift_001);

  const fresh = (o) => page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['pilot', 'engineer'], crop: 'wheat', ship: 'Q' });
    STATE.stowaway = null; STATE.goldAmount = 100;
    Object.assign(STATE.resources, o || {});
    returnToHub();
  }, o);
  const settle = () => page.evaluate(() => { if (typeof finishAllTyping === 'function') finishAllTyping(); });
  const choices = () => page.evaluate(() => [...document.querySelectorAll('#enc-choices .enc-choice')].map(b => ({ text: b.querySelector('.ch-text, .enc-choice-body') ? (b.querySelector('.ch-text, .enc-choice-body').textContent || '') : b.textContent, locked: b.classList.contains('locked'), sub: (b.querySelector('.enc-choice-sub') || {}).textContent || '' })));
  const pick = async re => {
    await settle(); await page.waitForTimeout(300);
    const r = await page.evaluate(src => {
      const b = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')].find(x => new RegExp(src).test(x.textContent));
      if (!b) return false; b.click(); return true;
    }, re);
    await page.waitForTimeout(500); await settle();
    return r;
  };

  console.log('— the leg that empties the tank still arrives');
  await fresh({ fuel: 1 });
  const legIn = await page.evaluate(() => {
    document.body.classList.remove('stop-active');
    const nx = [...nextAvailableNodes()][0];
    travelTo(nx);
    return { fuel: STATE.resources.fuel, ended: !!STATE.ended, at: STATE.currentId === nx, ev: STATE.currentEvent && STATE.currentEvent.id };
  });
  ok(legIn.fuel === 0 && !legIn.ended && legIn.at, 'fuel 0 on the leg in: no failure, the ship coasts in to the stop (' + (legIn.ev || 'hub') + ')');

  console.log('— flying on with an empty tank opens the scene');
  await fresh({ fuel: 0 });
  const opened = await page.evaluate(() => {
    const here = STATE.currentId;
    document.body.classList.remove('stop-active');
    travelTo([...nextAvailableNodes()][0]);
    return { ev: STATE.currentEvent && STATE.currentEvent.id, moved: STATE.currentId !== here, day: STATE.daysElapsed, ended: !!STATE.ended };
  });
  ok(opened.ev === 'event_adrift_001' && !opened.moved && !opened.ended, 'travelTo with fuel 0 opens Adrift and the ship does not move');
  await settle();
  let ch = await choices();
  ok(ch.some(c => /BURN THE HULL/.test(c.text)) && ch.some(c => /CRACK THE WATER/.test(c.text)) && ch.some(c => /CALL FOR HELP/.test(c.text)) && ch.some(c => /SHUT IT ALL DOWN/.test(c.text)), 'the ways out: ' + ch.filter(c => !c.locked).map(c => c.text.trim().split('\n')[0]).join(' | '));
  const beaconRow = ch.find(c => /EMERGENCY BEACON/.test(c.text));
  ok(!beaconRow || beaconRow.locked, 'the emergency beacon is not on offer without the item');
  ok(await page.evaluate(() => { const l = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /CAN.T LEAVE/.test(b.textContent)); return !!l && l.classList.contains('locked'); }), "no walking away: CAN'T LEAVE (NO FUEL)");
  const callTip = await page.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => /CALL FOR HELP/.test(x.textContent)); return b ? (b.dataset.tipDescription || '') : ''; });
  ok(/Takes 5–10 days/.test(callTip) && /40% · \+20 FUEL/.test(callTip) && /20% · [^\n]*\+10 FUEL/.test(callTip) && /40% · −6 MORALE/.test(callTip), 'a chance choice says its days and every way it can go, with the odds: ' + callTip.split('\n').slice(0, 5).join(' / '));
  ok(await page.evaluate(() => !(EVENTS.event_adrift_001.trigger || []).some(t => activeTriggers().has(t))), 'never pool-drawn: its trigger is never active');

  console.log('— burn the plating');
  const h0 = await page.evaluate(() => ({ hull: STATE.resources.hull, fuel: STATE.resources.fuel }));
  ok(await pick('BURN THE HULL'), 'BURN THE HULL PLATING taken');
  const burn = await page.evaluate(() => ({ hull: STATE.resources.hull, fuel: STATE.resources.fuel, out: STATE.currentOutcomeId }));
  ok(burn.out === 'adrift_burn' && Math.round(h0.hull - burn.hull) === 25 && Math.round(burn.fuel) === 15, `−25 hull, +15 fuel (${h0.hull} → ${burn.hull}, fuel ${burn.fuel})`);
  const flew = await page.evaluate(() => { returnToHub(); document.body.classList.remove('stop-active'); const here = STATE.currentId; travelTo([...nextAvailableNodes()][0]); return STATE.currentId !== here; });
  ok(flew, 'with fuel in the tank the ship flies on');

  console.log('— a weak hull does not survive the stripping');
  await fresh({ fuel: 0, hull: 20 });
  await page.evaluate(() => { document.body.classList.remove('stop-active'); travelTo([...nextAvailableNodes()][0]); });
  await pick('BURN THE HULL');
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => STATE.ended && document.getElementById('screen-end').classList.contains('active')), 'hull 20 → stripped to nothing: the run ends (BREACH)');

  console.log('— crack the water');
  await fresh({ fuel: 0, water: 60 });
  await page.evaluate(() => { document.body.classList.remove('stop-active'); travelTo([...nextAvailableNodes()][0]); });
  const c0 = await page.evaluate(() => ({ water: STATE.resources.water, day: STATE.daysElapsed }));
  await pick('CRACK THE WATER');
  const crack = await page.evaluate(() => ({ water: STATE.resources.water, fuel: STATE.resources.fuel, day: STATE.daysElapsed }));
  ok(Math.round(crack.fuel) === 12 && crack.day - c0.day === 4 && crack.water < c0.water - 15, `+12 fuel, 4 days, about a third of the water (${c0.water} → ${Math.round(crack.water)}, the crew drinking too)`);

  console.log('— call for help: the roll');
  const rollRun = async (u) => {
    await fresh({ fuel: 0 });
    await page.evaluate(() => { document.body.classList.remove('stop-active'); travelTo([...nextAvailableNodes()][0]); });
    await settle(); await page.waitForTimeout(300);
    return page.evaluate(u => {
      const real = Math.random; let first = true;
      Math.random = () => { if (first) { first = false; return u; } return real(); };
      const b = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')].find(x => /CALL FOR HELP/.test(x.textContent));
      const d0 = STATE.daysElapsed, g0 = STATE.goldAmount;
      b.click();
      Math.random = real;
      return { out: STATE.currentOutcomeId, fuel: STATE.resources.fuel, days: STATE.daysElapsed - d0, gold: g0 - STATE.goldAmount };
    }, u);
  };
  const resc = await rollRun(0.1), pir = await rollRun(0.5), none = await rollRun(0.95);
  ok(resc.out === 'adrift_rescued' && Math.round(resc.fuel) === 20 && resc.days === 6 && resc.gold === 30, `rescued: +20 fuel, 6 days, a 30% bill (${JSON.stringify(resc)})`);
  ok(pir.out === 'adrift_pirates' && Math.round(pir.fuel) === 10 && pir.gold === 60, `the wrong somebody: +10 fuel, 60% of the gold (${JSON.stringify(pir)})`);
  ok(none.out === 'adrift_unanswered' && none.fuel === 0 && none.days === 10, `nobody: 10 days gone, still empty (${JSON.stringify(none)})`);
  const again = await page.evaluate(() => { returnToHub(); document.body.classList.remove('stop-active'); travelTo([...nextAvailableNodes()][0]); return STATE.currentEvent && STATE.currentEvent.id; });
  ok(again === 'event_adrift_001', 'still empty: flying on opens the scene again');
  await settle();
  ok(await page.evaluate(() => /still reads zero/.test(document.getElementById('enc-narr-body').textContent) && !/coughs once/.test(document.getElementById('enc-narr-body').textContent)), 'the second time it says so (revisit text)');

  console.log('— the emergency beacon');
  await fresh({ fuel: 0 });
  await page.evaluate(() => { STATE.items.push('emergency_beacon'); document.body.classList.remove('stop-active'); travelTo([...nextAvailableNodes()][0]); });
  await settle(); await page.waitForTimeout(300);
  ch = await choices();
  ok(ch.some(c => /EMERGENCY BEACON/.test(c.text) && !c.locked), 'carried, the beacon is on offer');
  await pick('EMERGENCY BEACON');
  const bea = await page.evaluate(() => ({ out: STATE.currentOutcomeId, fuel: STATE.resources.fuel, has: STATE.items.includes('emergency_beacon') }));
  ok(/^adrift_beacon_/.test(bea.out) && bea.fuel >= 20 && !bea.has, `someone answered (${bea.out}), fuel ${bea.fuel}, the beacon spent`);

  console.log('— giving up');
  await fresh({ fuel: 0 });
  await page.evaluate(() => { document.body.classList.remove('stop-active'); travelTo([...nextAvailableNodes()][0]); });
  await pick('SHUT IT ALL DOWN');
  await page.waitForTimeout(800);
  const end = await page.evaluate(() => ({ ended: !!STATE.ended, scr: document.querySelector('.screen.active').id, title: (document.getElementById('end-title') || document.querySelector('#screen-end h1') || {}).textContent || document.getElementById('screen-end').innerText.slice(0, 80) }));
  ok(end.ended && end.scr === 'screen-end' && /ADRIFT/i.test(end.title), 'SHUT IT ALL DOWN ends the run: ' + String(end.title).replace(/\s+/g, ' ').trim().slice(0, 40));

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
