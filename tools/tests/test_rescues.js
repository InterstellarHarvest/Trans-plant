// Rescues and stowaways come up again (ruling 125): the two new doors that
// bring someone aboard (The Pod Garden's gardener, The Long Dark Bar's dock
// engineer) join as crew or ride as passengers, the bar hire happens once,
// and the rescue and stowaway pulls lift their events only when they apply.
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
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor && typeof enterEvent === 'function' && typeof applyOutcomeEffects === 'function');
  await page.evaluate(() => { localStorage.removeItem('transplant_save_v1'); });

  console.log('— the new doors');
  const doors = await page.evaluate(() => {
    const setup = crew => { applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew, crop: 'wheat', ship: 'D' }); STATE.stowaway = null; STATE.flags.add('departed'); STATE.goldAmount = 100; };
    const pod = EVENTS.event_derelict_010.choices.find(c => c.text === 'Knock on the last pod');
    const bar = EVENTS.event_station_009.layers.engineer_drink.choices.find(c => c.text === 'Offer them a berth');
    const hire = EVENTS.event_station_009.outcomes[bar.outcome];
    const out = {};
    // A crew slot open (one crew member lost): the gardener joins as botanist.
    setup(['engineer', 'pilot']); STATE.crew = ['pilot'];
    applyOutcomeEffects(pod.outcome);
    out.podJoin = { crew: STATE.crew.slice(), id: (STATE.crewIdentity || {}).botanist, note: STATE.joinNote, passengers: (STATE.passengers || []).length };
    // A full crew: she rides to the next station and pays on landing.
    setup(['engineer', 'pilot']);
    applyOutcomeEffects(pod.outcome);
    out.podRide = { crew: STATE.crew.slice(), passengers: (STATE.passengers || []).map(p => p.name), note: STATE.joinNote };
    const st = STATE.nodes.find(n => n.node_type === 'station');
    const g0 = STATE.goldAmount; disembarkPassengers(st);
    out.podPaid = STATE.goldAmount - g0;
    // The dock engineer: engineer held → passenger; slot and role free → crew.
    setup(['pilot', 'medic']); STATE.crew = ['pilot'];
    applyOutcomeEffects(hire);
    out.barJoin = { crew: STATE.crew.slice(), name: ((STATE.crewIdentity || {}).engineer || {}).name, flag: STATE.flags.has('hired_dock_engineer') };
    // Hired once: the offer is gone on the next visit.
    STATE.currentId = st.id;
    enterEvent(st, EVENTS.event_station_009, { layerStack: ['intro', 'engineer_drink'] }); finishAllTyping();
    out.barHidden = !(STATE._shownChoices || []).includes(bar);
    returnToHub();
    setup(['pilot', 'medic']);
    STATE.currentId = st.id;
    enterEvent(st, EVENTS.event_station_009, { layerStack: ['intro', 'engineer_drink'] }); finishAllTyping();
    out.barShown = (STATE._shownChoices || []).includes(bar);
    returnToHub();
    return out;
  });
  ok(doors.podJoin.crew.includes('botanist') && doors.podJoin.id && doors.podJoin.id.name === 'Hester Quill' && /botanist/.test(doors.podJoin.note || ''), `Pod Garden, a slot open: Hester Quill joins as botanist (${doors.podJoin.note})`);
  ok(!doors.podRide.crew.includes('botanist') && doors.podRide.passengers.includes('Hester Quill'), `Pod Garden, a full crew: she rides as a passenger (${doors.podRide.note})`);
  ok(doors.podPaid === 15, `and her passage pays 15 gold at the next station (${doors.podPaid})`);
  ok(doors.barJoin.crew.includes('engineer') && doors.barJoin.name === 'Tal Okafor' && doors.barJoin.flag, 'the bar: Tal Okafor signs on as engineer');
  ok(doors.barHidden && doors.barShown, 'once hired, the offer is gone; a fresh run offers it again');

  console.log('— the pulls (draws at an ordinary stop)');
  const pulls = await page.evaluate(() => {
    const draws = (n, prep, hit) => {
      let h = 0;
      for (let i = 0; i < n; i++) { prep(); const ev = selectEvent(STATE.byId[STATE.currentId]); if (ev && hit(ev)) h++; }
      return h / n;
    };
    const base = (trail, crew) => {
      applySetupToState({ trail, ai: 'marv', captain: 'veteran', crew, crop: 'wheat', ship: 'D' });
      STATE.stowaway = null; STATE.flags.add('departed');
    };
    // Rescue pull: a derelict stop, crew full vs one lost.
    base('mars', ['engineer', 'pilot']);
    const der = STATE.nodes.find(n => n.node_type === 'derelict' && n.position > 3) || STATE.nodes.find(n => n.node_type === 'derelict');
    const rescue = ev => bringsSomeoneAboard(ev);
    const atDer = lost => () => { STATE.seenEventIds = new Set(); STATE.hardStreak = 0; STATE.pityRelief = 0; STATE.currentId = der.id; STATE.crew = lost ? ['pilot'] : ['engineer', 'pilot']; };
    const full = der ? draws(9000, atDer(false), rescue) : null, short = der ? draws(9000, atDer(true), rescue) : null;
    // A captain who set out alone gets no pull.
    base('mars', []);
    const solo = der ? draws(6000, () => { STATE.seenEventIds = new Set(); STATE.hardStreak = 0; STATE.pityRelief = 0; STATE.currentId = der.id; }, rescue) : null;
    // Stowaway pull: a hidden stowaway, the reveal window open, Lunar.
    base('lunar', ['engineer', 'pilot']);
    const mid = STATE.nodes.find(n => n.node_type !== 'station' && n.node_type !== 'fork' && n.position >= Math.ceil(0.4 * (STATE.nodes.length - 1)));
    const reveal = ev => (ev.trigger || []).includes('stowaway_aboard') || !!ev.stowaway_variant;
    // The reveal window opens past a fifth of the legs (activeTriggers): be ~45% of the way.
    const flown = new Set(STATE.nodes.slice(0, Math.ceil(0.45 * pathLegs())).map(n => n.id));
    const prepStow = () => { STATE.seenEventIds = new Set(); STATE.hardStreak = 0; STATE.pityRelief = 0; STATE.currentId = mid.id; STATE.visited = new Set(flown); STATE.stowaway = { identity: MOD.flavor.stowaway_identities[0], revealed: false }; };
    const withPull = draws(3000, prepStow, reveal);
    return { full, short, solo, withPull, flags: { RESCUE_PULL, RESCUE_PULL_STANDING, STOWAWAY_PULL }, recognised: ['event_derelict_005', 'event_derelict_010', 'event_station_009'].every(id => bringsSomeoneAboard(EVENTS[id])) && !bringsSomeoneAboard(EVENTS.event_station_013) };
  });
  ok(pulls.recognised, 'the three rescue events are recognised, Market Row is not');
  ok(pulls.full != null && pulls.short > pulls.full * 1.5, `a rescue draws more once someone is lost (${(pulls.full * 100).toFixed(1)}% → ${(pulls.short * 100).toFixed(1)}% a derelict stop)`);
  ok(pulls.solo != null && pulls.solo < pulls.short * 0.75, `a captain who set out alone gets only the standing pull (${(pulls.solo * 100).toFixed(1)}%, a crew short of someone ${(pulls.short * 100).toFixed(1)}%)`);
  ok(pulls.withPull > 0.25, `a hidden stowaway is found often once the window is open (${(pulls.withPull * 100).toFixed(1)}% a Lunar stop)`);

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`rescues: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
