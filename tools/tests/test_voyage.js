// Voyage species + species stations (ruling 119): who lives where on every
// map, who the rolled NPCs are, where species events can fire, and that a
// save keeps it all. A save from before the ruling keeps the old even roll.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const ALIENS = ['insect', 'rock', 'water', 'reptile', 'robot', 'unknown'];

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.materials && MOD.crew_roster && MOD.flavor);
  await page.evaluate(() => { localStorage.removeItem('transplant_save_v1'); });

  // Every rule, over many generated routes.
  const maps = await page.evaluate(aliens => {
    const bad = { human: 0, lunar: 0, last: 0, cap: 0, near: 0, label: 0, reach: 0 };
    const voy = {}; let singles = 0, mixedFar = 0;
    for (const trail of ['lunar', 'mars', 'interstellar']) for (let i = 0; i < 400; i++) {
      applySetupToState({ trail, ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
      const rules = MOD.map_rules.trails[trail], v = STATE.voyageSpecies;
      voy[v] = (voy[v] || 0) + 1;
      const st = STATE.nodes.filter(n => n.node_type === 'station');
      const count = {};
      for (const n of st) {
        const z = speciesZone(n, rules);
        if (z === 'human' && n.residents !== 'human') bad.human++;
        if (trail === 'lunar' && !['human', 'mixed'].includes(n.residents)) bad.lunar++;
        if (aliens.includes(n.residents)) {
          count[n.residents] = (count[n.residents] || 0) + 1;
          singles++;
          if (z !== 'far') bad.near++;
          if (!n.short.toLowerCase().startsWith(n.residents)) bad.label++;
        } else if (z === 'far') mixedFar++;
      }
      for (const [sp, c] of Object.entries(count)) if (c > (sp === v ? 2 : 1)) bad.cap++;
      if (trail !== 'lunar') {
        const last = STATE.byId['node_spine_' + (rules.total_nodes - 2)];
        if (last.residents !== v) bad.last++;
      }
    }
    return { bad, voy, singles, mixedFar };
  }, ALIENS);
  ok(maps.bad.human === 0, 'every station in the first section is human');
  ok(maps.bad.lunar === 0, 'Lunar never has a single-species station');
  ok(maps.bad.near === 0, 'single-species stations only in the far section');
  ok(maps.bad.last === 0, 'Mars and Interstellar: the last stop is always the voyage species');
  ok(maps.bad.cap === 0, 'each species holds one station a run, the voyage species at most two');
  ok(maps.bad.label === 0, 'a single-species station says so on the map');
  ok(maps.singles > 0 && maps.mixedFar > 0, `far stations come both ways (${maps.singles} single, ${maps.mixedFar} mixed)`);
  const vals = ALIENS.map(a => maps.voy[a] || 0);
  ok(Math.min(...vals) > 120, 'every alien species gets its turn as voyage species: ' + vals.join('/'));

  // Who the rolled NPCs are.
  const npcs = await page.evaluate(() => {
    applySetupToState({ trail: 'interstellar', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
    const st = STATE.nodes.filter(n => n.node_type === 'station' && n.residents !== 'mixed');
    const human = st.find(n => n.residents === 'human'), own = STATE.byId['node_spine_13'];
    const rolls = (node, disp, n = 400) => { const c = {}; STATE.currentId = node.id; for (let i = 0; i < n; i++) { STATE.npcCache = {}; const s = rollNpcSpecies(disp); c[s] = (c[s] || 0) + 1; } return c; };
    const v = STATE.voyageSpecies;
    const first = STATE.byId['node_spine_1'], deep = STATE.byId['node_spine_13'];
    const openNear = rolls(first, 'pirate', 2000);
    const openFar = rolls(deep, 'pirate', 2000);
    STATE.currentId = own.id; STATE.npcCache = {};
    const bar = resolveNpc(EVENTS.event_station_009);
    return { v, resident: human && rolls(human, 'station_crew'), trader: human && rolls(human, 'trader'), own: rolls(own, 'station_crew'), ownSp: own.residents, openNear, openFar, bar: bar.species };
  });
  ok(Object.keys(npcs.resident).join() === 'human', 'a human station staffs only humans');
  ok(Object.keys(npcs.trader).join() === 'human', 'its market traders are human too');
  ok(Object.keys(npcs.own).join() === npcs.ownSp, `a ${npcs.ownSp} station staffs only ${npcs.ownSp}`);
  ok(npcs.bar === 'robot', "the Warlock bartender stays at a single-species station");
  const humanNear = (npcs.openNear.human || 0) / 2000, humanFar = (npcs.openFar.human || 0) / 2000;
  ok(humanNear > 0.55 && humanNear < 0.72, `open space near home is mostly human (${humanNear.toFixed(2)})`);
  ok(humanFar < 0.25, `open space far out is mostly alien (${humanFar.toFixed(2)})`);
  const others = ALIENS.filter(a => a !== npcs.v).map(a => npcs.openFar[a] || 0);
  ok((npcs.openFar[npcs.v] || 0) > Math.max(...others), 'far out, the voyage species is the likeliest alien');

  // Where species events can fire.
  const gate = await page.evaluate(() => {
    applySetupToState({ trail: 'interstellar', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
    const rules = MOD.map_rules.trails.interstellar;
    const mk = (type, position, residents) => ({ id: 'x', node_type: type, position, residents, connects_to: [] });
    const P = (id, n) => speciesPresent(EVENTS[id], n);
    return {
      earlyAlien: P('event_species_insect_001', mk('planet', 1)),
      earlyHuman: P('event_species_human_001', mk('planet', 1)),
      lateAlien: P('event_species_insect_001', mk('planet', 11)),
      ownStation: P('event_species_insect_003', mk('station', 11, 'insect')),
      otherStation: P('event_species_insect_003', mk('station', 11, 'rock')),
      mixedStation: P('event_species_insect_003', mk('station', 8, 'mixed')),
      humanAtAlien: P('event_species_human_002', mk('station', 11, 'rock')),
      humanAtHuman: P('event_species_human_002', mk('station', 1, 'human')),
      bartender: eventSpecies(EVENTS.event_station_009),
      faceless: eventSpecies(EVENTS.event_species_insect_005),
      unlanded: Object.values(EVENTS).filter(e => /^event_species_(?!fortune)/.test(e.id) && !e.species_lane).length,
    };
  });
  ok(gate.earlyAlien === false && gate.earlyHuman === true, 'near home: human events fire, alien events do not');
  ok(gate.lateAlien === true, 'further out, alien events fire in open space');
  ok(gate.ownStation && gate.mixedStation && !gate.otherStation, 'a species event fires at its own or a mixed station, not at another species');
  ok(!gate.humanAtAlien && gate.humanAtHuman, 'a human event stays off an alien station');
  ok(gate.bartender === null, 'the bartender belongs to no species for the draw');
  ok(gate.faceless === 'insect' && gate.unlanded === 0, "a species' hazards and forks carry their lane");

  // The pull.
  const pull = await page.evaluate(() => {
    applySetupToState({ trail: 'interstellar', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
    STATE.voyageSpecies = 'insect';
    const a = EVENTS.event_species_insect_001, b = EVENTS.event_species_rock_001, c = { insect: 0, rock: 0 };
    const w = { easy: 1, medium: 1, hard: 1, ultra: 1 };
    for (let i = 0; i < 3000; i++) { const e = drawWeightedEvent([a, b], new Set(['any']), w, null); c[e === a ? 'insect' : 'rock']++; }
    return c;
  });
  ok(pull.insect / pull.rock > 2.4 && pull.insect / pull.rock < 3.7, `the voyage species draws about 3× (${pull.insect}:${pull.rock})`);

  // The AI says it once, in its own voice.
  const lines = await page.evaluate(aliens => {
    const v = MOD.flavor.voyage_species, gaps = [];
    for (const a of aliens) { if (!v[a] || !v[a].station) gaps.push(a); for (const k of ['aria', 'marv', 'rex', 'chip', 'ajoy']) if (!v[a] || !v[a].ai[k]) gaps.push(a + '/' + k); }
    applySetupToState({ trail: 'mars', ai: 'rex', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
    const log = []; const real = window.pushCruiseLog; window.pushCruiseLog = t => { log.push(t); return real(t); };
    STATE.activeAI = 'rex';
    playDeparture();
    window.pushCruiseLog = real;
    return { gaps, log, want: v[STATE.voyageSpecies].ai.rex };
  }, ALIENS);
  ok(lines.gaps.length === 0, 'every species has a station line and all five AI lines ' + lines.gaps.join(' '));
  ok(lines.log.filter(l => String(l).includes(lines.want)).length === 1, 'the AI names the species once at departure');

  // A reload keeps the run's species, stations and labels.
  const save = await page.evaluate(() => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
    const sig = () => JSON.stringify([STATE.voyageSpecies, STATE.nodes.filter(n => n.node_type === 'station').map(n => [n.id, n.residents, n.short, n.description])]);
    STATE.currentEvent = null;
    STATE.flags.add('departed');
    const before = sig();
    writeSnapshot('tp_voyage_test');
    STATE.voyageSpecies = 'none'; for (const n of STATE.nodes) n.residents = 'none';
    loadRun('tp_voyage_test');
    localStorage.removeItem('tp_voyage_test');
    return { same: before === sig() };
  }).catch(e => ({ err: e.message }));
  ok(save.same === true, 'a reload keeps the voyage species and every station ' + (save.err || ''));

  // A save from before the ruling.
  const old = await page.evaluate(() => {
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
    STATE.voyageSpecies = undefined; for (const n of STATE.nodes) delete n.residents;
    const c = {}; STATE.currentId = 'node_spine_1';
    for (let i = 0; i < 1400; i++) { STATE.npcCache = {}; const s = rollNpcSpecies('station_crew'); c[s] = (c[s] || 0) + 1; }
    return { c, gate: speciesPresent(EVENTS.event_species_insect_001, STATE.byId.node_spine_1) };
  });
  ok(Object.values(old.c).length === 7 && Math.min(...Object.values(old.c)) > 130, 'an older save keeps the old even roll');
  ok(old.gate === true, 'an older save keeps the old event pool');

  ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
  await browser.close();
  console.log(`\nvoyage: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
