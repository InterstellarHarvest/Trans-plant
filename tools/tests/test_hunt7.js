// Hunt 7 (pool 500, before the push): where rulings 123–126 meet the rest
// of the game. The welcomed stowaway's follow-ups wait on them being aboard;
// a captain with no crew but a rider is not "alone" at the end; passengers
// step off where the ship berths, not where it is waved off; a spent rescue
// stops pulling; the rescue scenes show the newcomer's own face; a black-
// market good's backfire can end the run; gray goods stack; the back room
// is on the route every run flies; the black market takes the standing
// discounts.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor && typeof enterEvent === 'function' && typeof renderCruise === 'function' && typeof openStopMenu === 'function');
  await page.evaluate(() => { localStorage.removeItem('transplant_save_v1'); tpSaveSettings({ showTips: false }); });

  const setup = (crew, trail) => page.evaluate(([crew, trail]) => {
    applySetupToState({ trail: trail || 'mars', ai: 'marv', captain: 'veteran', crew, crop: 'wheat', ship: 'D' });
    STATE.stowaway = null; STATE.flags.add('departed');
    showScreen('screen-cruise'); renderCruise();
  }, [crew, trail]);

  console.log('— the welcomed stowaway, after');
  await setup(['pilot']);
  const after = await page.evaluate(() => {
    const out = {};
    const node = STATE.byId[STATE.currentId];
    const elig = () => eventEligible(EVENTS.event_general_015, node, activeTriggers());
    const crewIdn = MOD.flavor.stowaway_identities.find(s => s.join_role && s.join_role !== 'pilot');
    STATE.stowaway = { identity: crewIdn, revealed: true };
    applyOutcomeEffects({ stowaway_resolve: 'welcome' });
    out.joinedRole = Object.keys(STATE.crewIdentity).find(r => STATE.crewIdentity[r].id === crewIdn.id);
    out.aboard = elig();
    // The AI's callback on a stowaway at work, two legs on.
    const callback = () => {
      STATE.calledBack = []; STATE.flagFirstSeen = { stowaway_working: -10 }; STATE.lastCallbackLeg = null; STATE.lastAmbientNode = null;
      renderCruise();
      return STATE.calledBack.includes('stowaway_working');
    };
    STATE.flags.add('stowaway_working');
    out.cbAboard = callback();
    killCrew(out.joinedRole);
    out.dead = elig();
    out.cbDead = callback();
    // A stowaway riding as a passenger is still aboard.
    STATE.flags.delete('stowaway_welcomed');
    STATE.stowaway = { identity: MOD.flavor.stowaway_identities.find(s => !s.join_role), revealed: true };
    applyOutcomeEffects({ stowaway_resolve: 'welcome' });
    out.riding = elig();
    return out;
  });
  ok(after.joinedRole && after.aboard, `"Crew, More or Less" can come while they hold the ${after.joinedRole} place`);
  ok(!after.dead, 'not once they have died');
  ok(after.riding, 'and still can for a stowaway riding as a passenger');
  ok(after.cbAboard && !after.cbDead, 'the AI brings up their work while they are aboard, not after (flag_payoffs "aboard")');

  console.log('— the arrival with no crew but a rider');
  await setup([]);
  const end = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    STATE.stowaway = { identity: MOD.flavor.stowaway_identities.find(s => !s.join_role), revealed: true };
    applyOutcomeEffects({ stowaway_resolve: 'welcome' });
    const dest = STATE.nodes.find(n => n.connects_to && (Array.isArray(n.connects_to) ? !n.connects_to.length : !Object.keys(n.connects_to).length));
    triggerArrival(dest);
    await w(1500);
    const vb = [...document.querySelectorAll('#screen-end button')].find(x => /View Report/i.test(x.textContent));
    if (vb) vb.click();
    await w(2500); finishAllTyping();
    const t = document.getElementById('screen-end').textContent;
    return { name: STATE.stowaway.identity.name, named: t.includes(STATE.stowaway.identity.name), alone: /disembark alone|walk down the ramp alone|grow in the viewport alone|dock alone|came alone|plant the first bed alone|stood at the dedication alone|One chair on the shuttle/.test(t) };
  });
  ok(end.named && !end.alone, `the ending names ${end.name} and does not say alone`);
  await page.evaluate(() => { STATE.ended = false; });

  console.log('— passengers step off where the ship berths');
  await setup(['engineer', 'pilot']);
  const berth = await page.evaluate(() => {
    const st = STATE.nodes.find(n => n.node_type === 'station' && n.position > 0 && n.connects_to.length);
    const ride = () => { STATE.passengers = [{ id: 'survivor_hester', name: 'Hester Quill', reward: { gold: 15 }, farewell: null }]; };
    ride(); const g0 = STATE.goldAmount;
    arriveAtNode(st, { skipEvent: true }); // Push Engines: blown straight past
    const past = { left: STATE.passengers.length, gold: STATE.goldAmount - g0 };
    stationBerth(st);
    return { past, berthed: STATE.passengers.length, paid: STATE.goldAmount - g0 };
  });
  ok(berth.past.left === 1 && berth.past.gold === 0, 'blown past a station, the rider stays aboard, unpaid');
  ok(berth.berthed === 0 && berth.paid === 15, 'docked, they step off and pay');

  console.log('— rescues: spent and short-handed');
  await setup(['pilot']);
  const pull = await page.evaluate(() => {
    const out = { bar0: bringsSomeoneAboard(EVENTS.event_station_009) };
    STATE.flags.add('hired_dock_engineer');
    out.bar1 = bringsSomeoneAboard(EVENTS.event_station_009);
    out.pod = bringsSomeoneAboard(EVENTS.event_derelict_010);
    out.short0 = crewShortHanded();
    const idn = MOD.flavor.stowaway_identities.find(s => s.join_role && s.join_role !== 'pilot');
    joinAsCrew(idn, 100);
    killCrew('pilot'); // a newcomer filled the place first: one crew, as at launch, but one lost
    out.short1 = crewShortHanded();
    return out;
  });
  ok(pull.bar0 && !pull.bar1 && pull.pod, 'The Long Dark Bar stops pulling once Tal is hired; the Pod Garden still does');
  ok(!pull.short0 && pull.short1, 'a crew that lost someone is short-handed even when a newcomer came aboard first');

  console.log('— the rescue scenes wear the newcomer\'s face');
  await setup(['engineer', 'pilot']);
  const faces = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const der = STATE.nodes.find(n => n.node_type === 'derelict') || STATE.byId[STATE.currentId];
    STATE.currentId = der.id;
    enterEvent(der, EVENTS.event_derelict_005);
    await w(400);
    const mira = { ctx: STATE.npcCtx && STATE.npcCtx.crewId, bg: (document.querySelector('#enc-subject .subj-sprite, #enc-subject') || {}).outerHTML || '' };
    const st = STATE.nodes.find(n => n.node_type === 'station');
    const ctx = resolveLayerNpc(EVENTS.event_station_009.layers.engineer.npc, 'event_station_009', 'engineer');
    return { mira: mira.ctx, miraArt: /spritesheet_survivor_mira/.test(mira.bg), tal: ctx.crewId, st: !!st };
  });
  ok(faces.mira === 'survivor_mira' && faces.miraArt, `the Pod Garden's survivor shows Mira's own sheet (${faces.mira})`);
  ok(faces.tal === 'dock_engineer_tal', `the bar's engineer shows Tal's own sheet (${faces.tal})`);
  await page.evaluate(() => { STATE.currentEvent = null; STATE.npcCtx = null; });

  console.log('— the black market');
  const maps = await page.evaluate(() => {
    const out = {};
    for (const trail of ['lunar', 'mars', 'interstellar']) {
      let avoid = 0; const N = 400;
      for (let i = 0; i < N; i++) {
        applySetupToState({ trail, ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
        const conn = n => Array.isArray(n.connects_to) ? n.connects_to : Object.values(n.connects_to).flat();
        const clear = id => { const n = STATE.byId[id]; if (n.back_room) return false; const c = conn(n); return !c.length || c.some(clear); };
        if (clear(STATE.currentId)) avoid++;
      }
      out[trail] = avoid;
    }
    return out;
  });
  ok(!maps.lunar && !maps.mars && !maps.interstellar, `every route passes a back room (avoidable: ${JSON.stringify(maps)} of 400 a trail)`);

  const market = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    let room = null;
    for (let i = 0; i < 80 && !room; i++) {
      applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
      room = STATE.nodes.find(n => n.node_type === 'station' && n.back_room);
    }
    STATE.stowaway = null; STATE.goldAmount = 300; STATE.currentId = room.id; STATE.currentEvent = null; STATE.stationVisit = null;
    STATE.items = [];
    returnToHub(); openStopMenu();
    document.querySelector('#stop-choices .stop-choice[data-verb-id="back_room"]').click(); await w(200);
    const out = { dim: document.getElementById('overlay-market').classList.contains('dim-behind') };
    out.hubDim = getComputedStyle(document.getElementById('screen-cruise')).filter;
    const shelf = grayShelf({ backRoom: true });
    const name0 = itemDef(shelf[0]).name.toUpperCase();
    const row0 = () => [...document.querySelectorAll('#market-buy-list .market-row')].find(e => e.textContent.includes(name0));
    row0().querySelector('button').click(); await w(50);
    row0().querySelector('button').click(); await w(50);
    out.held = STATE.items.filter(x => x === shelf[0]).length;
    document.getElementById('market-close-btn').click(); await w(200);
    // The bar's door (not a back room) keeps a random pair even at a one-species station.
    room.residents = 'rock';
    out.barShelf = grayShelf({}).join(',');
    out.roomShelf = grayShelf({ backRoom: true }).join(',');
    // CHIP's discount (ruling 110), as the shelf prices it.
    const price = async ai => {
      STATE.activeAI = ai; STATE.items = [];
      returnToHub(); openStopMenu();
      document.querySelector('#stop-choices .stop-choice[data-verb-id="back_room"]').click(); await w(200);
      const row = [...document.querySelectorAll('#market-buy-list .market-row')].find(e => /DRIVE COIL/i.test(e.textContent));
      const g = row ? parseInt((row.textContent.match(/(\d+)\s*g/) || [])[1], 10) : NaN;
      document.getElementById('market-close-btn').click(); await w(200);
      return g;
    };
    out.marv = await price('marv'); out.chip = await price('chip'); STATE.activeAI = 'marv';
    return out;
  });
  ok(market.dim && /brightness/.test(market.hubDim), `the back room dims the hub behind it (${market.hubDim})`);
  ok(market.held === 2, `a gray good buys more than once (${market.held} held)`);
  ok(market.roomShelf === 'hull_foam,hot_fuel_cell' && market.barShelf !== undefined, `a rock back room sells rock goods; the bar's door rolls its own pair (${market.barShelf})`);
  ok(market.chip < market.marv, `CHIP's discount applies at the black market (${market.marv}g → ${market.chip}g)`);

  console.log('— a gray good\'s backfire can end the run');
  await setup(['engineer', 'pilot']);
  const cook = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const st = STATE.nodes.find(n => n.node_type === 'station' && n.position > 0);
    STATE.currentId = st.id;
    STATE.items = ['hot_fuel_cell']; STATE.resources.hull = 4; STATE.resources.fuel = 20;
    openInventory(); await w(100);
    const tile = [...document.querySelectorAll('#inv-grid .inv-tile')].find(t => (t.dataset.key || '').startsWith('hot_fuel_cell'));
    tile.click(); await w(50);
    const tip = document.getElementById('inv-use-btn').dataset.tipDescription || '';
    const real = Math.random; Math.random = () => 0.01;
    document.getElementById('inv-use-btn').click();
    Math.random = real; await w(100);
    return { tip, hull: STATE.resources.hull, ended: !!STATE.ended, invOpen: document.getElementById('overlay-inventory').classList.contains('active') };
  });
  ok(cook.hull === 0 && cook.ended && !cook.invOpen, `hull 4 → 0 from a cook-off ends the run and closes the hold (ended ${cook.ended})`);
  ok(/cooks off against the hull/.test(cook.tip) && !/%/.test(cook.tip), `its tooltip warns of the hull, without the odds ("${cook.tip.slice(-70)}")`);

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`hunt7: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
