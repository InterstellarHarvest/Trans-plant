// The black market's doors (ruling 124): which stations keep a BACK ROOM,
// the Stop-menu job that opens it, and the three lane encounters that open
// it with their own lines. The Long Dark Bar's door is older (ruling 39).
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const DOORS = [
  ['event_encounter_toll_001', null, 'Ask what they took off the last ship'],
  ['event_encounter_inspection_001', 'inspect', 'Ask to see the evidence locker'],
  ['event_encounter_trader_004', 'pitch', "Ask what isn't on the screen"],
];

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor && typeof openStopMenu === 'function' && typeof enterEvent === 'function');
  await page.evaluate(() => { localStorage.removeItem('transplant_save_v1'); });

  console.log('— which stations keep a back room');
  const maps = await page.evaluate(() => {
    const bad = { near: 0, dest: 0, none: 0 }; let cand = 0, rooms = 0, runs = 0;
    for (const trail of ['lunar', 'mars', 'interstellar']) for (let i = 0; i < 300; i++) {
      applySetupToState({ trail, ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
      const rules = MOD.map_rules.trails[trail];
      const st = STATE.nodes.filter(n => n.node_type === 'station');
      const open = st.filter(n => speciesZone(n, rules) !== 'human' && n.connects_to && (!Array.isArray(n.connects_to) || n.connects_to.length));
      for (const n of st) if (n.back_room && !open.includes(n)) (speciesZone(n, rules) === 'human' ? bad.near++ : bad.dest++);
      if (open.length && !open.some(n => n.back_room)) bad.none++;
      cand += open.length; rooms += open.filter(n => n.back_room).length; runs++;
    }
    return { bad, share: rooms / cand, perRun: rooms / runs };
  });
  ok(!maps.bad.near && !maps.bad.dest, `never in the human-only stretch or at the destination (${JSON.stringify(maps.bad)})`);
  ok(!maps.bad.none, 'every run keeps at least one');
  ok(maps.share > 0.45 && maps.share < 0.7, `about half the stations past the human stretch (${(maps.share * 100).toFixed(0)}%, ${maps.perRun.toFixed(2)} a run)`);

  console.log('— BACK ROOM on the Stop menu');
  const stop = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    let room = null, plain = null;
    for (let i = 0; i < 50 && !(room && plain); i++) {
      applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
      room = STATE.nodes.find(n => n.node_type === 'station' && n.back_room);
      plain = STATE.nodes.find(n => n.node_type === 'station' && !n.back_room && n.connects_to.length);
    }
    STATE.stowaway = null; STATE.goldAmount = 200;
    STATE.items = STATE.items.filter(i => !['drive_coil', 'o2_recycler', 'repair_fabricator'].includes(i));
    const verbs = () => [...document.querySelectorAll('#stop-choices .stop-choice')].map(b => ({ id: b.dataset.verbId, locked: b.classList.contains('locked') }));
    const at = id => { STATE.currentId = id; STATE.currentEvent = null; STATE.stationVisit = null; returnToHub(); openStopMenu(); };
    at(plain.id); const plainVerbs = verbs();
    at(room.id); const roomVerbs = verbs();
    document.querySelector('#stop-choices .stop-choice[data-verb-id="back_room"]').click();
    await w(150);
    const open = document.getElementById('overlay-market').classList.contains('active');
    const sinister = document.getElementById('enc-market').classList.contains('sinister');
    const wares = [...document.querySelectorAll('#market-buy-list .market-row, #market-buy-list > *')].map(e => e.textContent).join(' | ');
    const log = document.getElementById('market-log').textContent;
    document.getElementById('market-close-btn').click();
    await w(150);
    const closed = !document.getElementById('overlay-market').classList.contains('active');
    const stillStopped = document.body.classList.contains('stop-active') && !STATE.currentEvent;
    // A waved-off station: the door is shut with the rest of its services.
    const real = window.stationServicesClosed; window.stationServicesClosed = () => true;
    at(room.id); const waved = verbs().find(v => v.id === 'back_room');
    window.stationServicesClosed = real;
    return { residents: room.residents, plain: plainVerbs.some(v => v.id === 'back_room'), room: roomVerbs.find(v => v.id === 'back_room'), open, sinister, wares, log, closed, stillStopped, waved };
  });
  ok(!stop.plain, 'a station without one shows no BACK ROOM');
  ok(stop.room && !stop.room.locked, 'a station with one shows BACK ROOM, open');
  ok(stop.open && stop.sinister, 'it opens the black market');
  ok(/DRIVE COIL/i.test(stop.wares) && /RECYCLER/i.test(stop.wares) && /FABRICATOR/i.test(stop.wares), `with the three off-manifest upgrades (${stop.wares.slice(0, 160)})`);
  ok(['human', 'mixed'].includes(stop.residents) ? /No names/.test(stop.log) : stop.log.trim().length > 10 && !/No names/.test(stop.log), `and its greeting (${stop.residents} residents: "${stop.log.trim().slice(0, 60)}")`);
  ok(stop.closed && stop.stillStopped, 'LEAVE goes back to the Stop menu, no event left open');
  ok(stop.waved && stop.waved.locked, 'waved off: BACK ROOM is shut with the other services');

  console.log('— the lane encounters that open it');
  for (const [id, layer, text] of DOORS) {
    const r = await page.evaluate(async ({ id, layer, text }) => {
      const w = ms => new Promise(res => setTimeout(res, ms));
      applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
      STATE.stowaway = null; STATE.goldAmount = 200; STATE.flags.add('departed');
      const ev = EVENTS[id], entry = ev.entryLayer || Object.keys(ev.layers)[0];
      const node = STATE.nodes.find(n => (ev.node_type || []).includes(n.node_type)) || STATE.byId[STATE.currentId];
      STATE.currentId = node.id;
      enterEvent(node, ev, layer ? { layerStack: [entry, layer] } : undefined);
      finishAllTyping();
      const ch = (ev.layers[layer || entry].choices || []).find(c => c.text === text);
      const btn = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.textContent.includes(text));
      const tip = btn ? (btn.dataset.tipDescription || btn.getAttribute('title') || '') : '';
      if (btn) btn.click();
      await w(150);
      const open = document.getElementById('overlay-market').classList.contains('active');
      const sinister = document.getElementById('enc-market').classList.contains('sinister');
      const log = document.getElementById('market-log').textContent;
      const wares = document.getElementById('market-buy-list').textContent.toUpperCase();
      const shelf = (ch && ch.market_stock || []).map(id => itemDef(id).name.toUpperCase());
      const others = ['bulk_o2_tank', 'hot_fuel_cell', 'gray_medkit', 'hull_foam', 'unlabeled_rations'].filter(id => !(ch.market_stock || []).includes(id)).map(id => itemDef(id).name.toUpperCase());
      document.getElementById('market-close-btn').click();
      await w(200);
      return { shelf, stocked: shelf.length === 2 && shelf.every(n => wares.includes(n)) && !others.some(n => wares.includes(n)), has: !!ch, btn: !!btn, tip, open, sinister, greet: ch && log.includes(ch.market_greeting), still: STATE.currentEvent && STATE.currentEvent.id === id,
        back: (STATE.layerStack || []).join('>') === entry, closed: !document.getElementById('overlay-market').classList.contains('active') };
    }, { id, layer, text });
    ok(r.has && r.btn, `${id}: "${text}" is offered${layer ? ' on ' + layer : ''}`);
    ok(r.open && r.sinister && r.greet, `${id}: it opens the black market with the door's own greeting`);
    ok(r.closed && r.still && r.back, `${id}: LEAVE returns to the encounter's opening, still unresolved`);
    ok(r.stocked, `${id}: its own shelf (${r.shelf.join(', ')})`);
    ok(/Effort 2\/5/.test(r.tip), `${id}: costs effort (${r.tip.replace(/\n/g, ' | ').slice(0, 80)})`);
  }

  console.log('— gray-market goods (ruling 124)');
  const gray = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    // A species back room stocks its species' pair and greets in its voice.
    let st = null;
    for (let i = 0; i < 80 && !st; i++) {
      applySetupToState({ trail: 'interstellar', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
      st = STATE.nodes.find(n => n.node_type === 'station' && n.back_room && !['human', 'mixed'].includes(n.residents));
    }
    STATE.currentId = st.id; STATE.currentEvent = null; STATE.stationVisit = null; STATE.goldAmount = 200;
    const want = grayShelf({ backRoom: true });
    returnToHub(); openStopMenu();
    document.querySelector('#stop-choices .stop-choice[data-verb-id="back_room"]').click(); await w(150);
    const wares = document.getElementById('market-buy-list').textContent.toUpperCase();
    const log = document.getElementById('market-log').textContent;
    document.getElementById('market-close-btn').click(); await w(150);
    // A mixed station's pair holds all stop.
    STATE.currentId = STATE.nodes.find(n => n.node_type === 'station' && n.residents === 'mixed').id;
    const mixA = grayShelf({ backRoom: true }).join(), mixB = grayShelf({ backRoom: true }).join();
    // Each good, used from the hold: the full refill, then the backfire.
    const real = Math.random, out = {};
    const run = (id, roll, setup) => {
      setup(); Math.random = () => roll;
      const r0 = Object.assign({}, STATE.resources), m0 = crewMoraleRaw();
      const line = ITEM_USE[id].use(); Math.random = real;
      const d = {}; for (const k of ['o2', 'fuel', 'hull', 'food']) d[k] = Math.round(STATE.resources[k] - r0[k]);
      return { d, morale: Math.round((crewMoraleRaw() || 0) - (m0 || 0)), line };
    };
    const low = () => { STATE.resources.o2 = 20; STATE.resources.fuel = 20; STATE.resources.hull = 30; STATE.resources.food = 20; for (const r of STATE.crew) STATE.crewMorale && (STATE.crewMorale[r] = 70); };
    for (const id of ['bulk_o2_tank', 'hot_fuel_cell', 'hull_foam', 'unlabeled_rations']) out[id] = [run(id, 0.99, low), run(id, 0.01, low)];
    const hurt = () => { setHP('engineer', 20); };
    out.gray_medkit = [run('gray_medkit', 0.99, hurt), run('gray_medkit', 0.01, hurt)].map((x, i) => Object.assign(x, { hp: (setHP('engineer', 20), Math.random = () => (i ? 0.01 : 0.99), ITEM_USE.gray_medkit.use(), Math.random = real, hpOf('engineer')) }));
    const tips = ['bulk_o2_tank', 'hot_fuel_cell', 'hull_foam', 'unlabeled_rations', 'gray_medkit'].map(id => { low(); hurt(); return ITEM_USE[id].tip(); });
    const art = ['bulk_o2_tank', 'hot_fuel_cell', 'gray_medkit', 'hull_foam', 'unlabeled_rations'].map(id => itemSpritePath(id));
    const loads = await Promise.all(art.map(src => new Promise(res => { const im = new Image(); im.onload = () => res(im.naturalWidth === 64); im.onerror = () => res(false); im.src = src; })));
    return { residents: st.residents, want, stocked: want.every(id => wares.includes(itemDef(id).name.toUpperCase())), greet: log, mixA, mixB, out, tips, art, loads };
  });
  ok(gray.stocked, `a ${gray.residents} back room stocks its own pair (${gray.want.join(', ')})`);
  ok(!/No names/.test(gray.greet) && gray.greet.length > 10, `and greets in its own voice ("${gray.greet.slice(0, 70)}")`);
  ok(gray.mixA === gray.mixB && gray.mixA.split(',').length === 2, `a mixed station's pair holds all stop (${gray.mixA})`);
  const G = gray.out;
  ok(G.bulk_o2_tank[0].d.o2 === 35 && G.bulk_o2_tank[1].d.o2 === 8, `bulk O2 tank: +35, or +8 when the valve fails (${G.bulk_o2_tank.map(x => x.d.o2)})`);
  ok(G.hot_fuel_cell[0].d.fuel === 35 && G.hot_fuel_cell[0].d.hull === 0 && G.hot_fuel_cell[1].d.fuel === 10 && G.hot_fuel_cell[1].d.hull === -6, `hot fuel cell: +35, or +10 and −6 hull when it cooks off (${JSON.stringify(G.hot_fuel_cell.map(x => x.d))})`);
  ok(G.hull_foam[0].d.hull === 30 && G.hull_foam[1].d.hull === 10, `hull foam: +30, or +10 when it sets wrong (${G.hull_foam.map(x => x.d.hull)})`);
  ok(G.unlabeled_rations[0].d.food === 25 && G.unlabeled_rations[1].d.food === 5 && G.unlabeled_rations[1].morale < 0 && G.unlabeled_rations[0].morale === 0, `unlabeled rations: +25, or +5 and morale lost when spoiled (${G.unlabeled_rations.map(x => x.d.food + '/' + x.morale)})`);
  ok(G.gray_medkit[0].hp === 100 && G.gray_medkit[1].hp === 60, `gray medkit: full heal, or half when the dose is wrong (${G.gray_medkit.map(x => x.hp)})`);
  ok(gray.tips.every(t => /Black-market goods/.test(t) && !/%/.test(t)), 'every tooltip warns it may go wrong, without the odds');
  ok(gray.loads.every(Boolean), `all five sprites load at 64×64 (${gray.art.join(', ')})`);

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`black market: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
