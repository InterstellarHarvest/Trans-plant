// Text pools (read-through review, section B): five station arrivals in one
// run show five different hail bodies and farewells; a station run wholly by
// one species reads its own approach; the Ship's Log draws a fresh sign-off.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && typeof enterEvent === 'function');
  const r = await page.evaluate(() => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'interstellar', ai: 'marv', captain: 'veteran', crew: ['medic', 'chef'], crop: 'wheat', ship: 'B' });
    STATE.stowaway = null; STATE.flags.add('departed');
    const ap = EVENTS.event_station_014;
    const stations = STATE.nodes.filter(n => n.node_type === 'station');
    const seen = { hail: [], silent: [], farewell: [], ai: [] };
    const lines = [];
    const real = window.pushCruiseLog;
    window.pushCruiseLog = (t, o) => { lines.push(typeof t === 'string' ? t : (t && t.text) || ''); return real(t, o); };
    for (let i = 0; i < 5; i++) {
      const n = stations[i % stations.length];
      n.residents = 'mixed';
      // The i-th station of the run (StationVisit counts visited stations).
      STATE.visited = new Set(stations.slice(0, i).map(s => s.id));
      STATE.currentId = n.id;
      StationVisit.arrive(n, null);
      STATE.stationVisit.hailedFirst = false; STATE.stationVisit.captainHere = false;
      const L = StationVisit.approachLayer('hail', ap.layers.hail);
      const I = StationVisit.approachLayer('intro', ap.layers.intro);
      seen.hail.push(L.body); seen.silent.push(I.body); seen.ai.push(I.ai.marv);
      STATE.stationVisit.phase = 'docked'; STATE.currentEvent = ap; STATE.outcomeMode = false;
      StationVisit.afterEvent();
      seen.farewell.push(lines.filter(x => /pings the comms/.test(x)).pop());
    }
    // A reptile station.
    const n = stations[stations.length - 1]; n.residents = 'reptile'; STATE.currentId = n.id;
    STATE.visited = new Set(); StationVisit.arrive(n, null);
    STATE.stationVisit.hailedFirst = false; STATE.stationVisit.captainHere = false; STATE._layerVisits = {};
    const rep = StationVisit.approachLayer('intro', ap.layers.intro);
    const D = StationVisit.approachLayer('docked', ap.layers.docked);
    const types = v => v.every(x => typeof x === 'string' && x.length > 10);
    return { seen, rep: rep.body, dock: D.body, repPool: ap.by_species.reptile.intro_body, dockPool: ap.by_species.reptile.docked_body, strings: types(seen.hail) && types(seen.silent) && types(seen.ai) };
  });
  ok(r.strings, 'every pooled field resolves to text: ' + JSON.stringify(r.seen).slice(0, 600));
  for (const k of ['hail', 'silent', 'farewell', 'ai']) ok(new Set(r.seen[k]).size === 5, `five stations, five different ${k} texts (${new Set(r.seen[k]).size})`);
  ok(r.seen.farewell.every(x => x && !/next pass/.test(x)), 'no farewell promises a next pass');
  ok(r.repPool.some(x => r.rep.startsWith(x)), 'a reptile station reads its own approach: ' + r.rep.slice(0, 80));
  ok(r.dockPool.includes(r.dock), 'and its own dock');
  // Ship's Log: ten choice entries, no sign-off three times in a row.
  const log = await page.evaluate(() => {
    const out = [];
    const real = window.pushCruiseLog;
    const ev = Object.values(EVENTS).find(e => !e.layers && e.choices && e.choices.length > 1 && e.active !== false);
    const label = String(ev.choices[0].text).replace(/[.!?]+$/, '').slice(0, 12);
    window.pushCruiseLog = (t, o) => { const s = typeof t === 'string' ? t : (t && t.text) || ''; if (s.includes('“' + label)) out.push(s); return real(t, o); };
    for (let i = 0; i < 10; i++) { const r0 = ShipLog.begin(); ShipLog.resolved(r0, ev, ev.choices[0], { narrative: 'It holds.' }); }
    return out;
  });
  ok(log.length === 10, 'ten choice entries logged (' + log.length + ')');
  const kick = log.map(s => s.replace(/^.*”[.,]?\s*/, ''));
  ok(new Set(kick).size >= 4, 'the sign-offs vary: ' + [...new Set(kick)].join(' / '));
  ok(kick.every((k, i) => i < 1 || k !== kick[i - 1]), 'no sign-off twice in a row');
  ok(!errors.length, 'no page errors: ' + errors.slice(0, 3).join(' | '));
  console.log('runread pools: ' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
