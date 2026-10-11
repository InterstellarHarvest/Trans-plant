// Station approach (owner ruling 2026-10-11): the demo's approach mode,
// ported. A station event that opens over comms (comm_mode "screen" at a
// station node — event_station_004, the docking queue) shows our bridge,
// space behind it and the node's station from sprites/backgrounds/
// station/approach in the viewport: intrinsic size, centred, a
// spritesheet cycling its frames or a static png bobbing. Moving inside
// (an in-person layer, an outcome that docks) shows the interior. The
// cruise hub at a station stop shows the same station above the ship.
// Same node → same station, in both places and after a reload.
// SHOT_DIR=<dir> saves screenshots for a visual check.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const SHOT_DIR = process.env.SHOT_DIR || null;
const ROOT = path.join(__dirname, '../..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
const bad = [];           // non-probe responses ≥ 400
const painted = new Set(); // every station URL the engine painted

async function boot(setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => {
    if (r.status() < 400) return;
    // Pool probing (numbered files / subfolders that aren't there) is how
    // the resolvers discover a pool — those misses are expected.
    const u = decodeURIComponent(r.url());
    if (/\/sprites\/(backgrounds|npc)\//.test(u) || /\/sprites\/minigames\/mining\/bg\d+\.jpg$/.test(u)) return;
    bad.push(r.status() + ' ' + r.url());
  });
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForTimeout(150);
  return page;
}
async function reloadRun(page) {
  await page.reload();
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor);
  await page.evaluate(() => loadRun());
  await page.waitForTimeout(200);
}
async function shot(page, name) {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
}
const click = (page, t) => page.evaluate(t => {
  if (typeof finishAllTyping === 'function') finishAllTyping();
  const b = [...document.querySelectorAll('#enc-choices .enc-choice, #enc-choices button')].find(b => b.textContent.includes(t));
  if (!b) return false; b.click(); return true;
}, t);

// Park the run at a station stop whose art-seed pick is folder k (1-4).
const parkAtStation = (page, k) => page.evaluate(async k => {
  const st = STATE.nodes.find(n => n.node_type === 'station');
  for (let s = 1; s < 2000; s++) {
    STATE.artSeed = s;
    const d = await SceneArt.stationApproachFor(st);
    if (d && d.folder === 'station/approach/' + k) break;
  }
  STATE.currentId = st.id;
  return { id: st.id, seed: STATE.artSeed };
}, k);

// Encounter stack once the async resolution has landed.
async function hail(page) {
  const read = () => page.evaluate(() => {
    const url = el => { const m = /url\(["']?([^"')]+)["']?\)/.exec(el.style.backgroundImage || ''); return m ? decodeURIComponent(m[1]).replace(/^.*?sprites\/backgrounds\//, '') : null; };
    const main = document.getElementById('enc-backdrop'), base = document.getElementById('enc-backdrop-base');
    const slot = document.getElementById('enc-backdrop-sprite'), ch = document.getElementById('enc-approach-sprite');
    const sr = slot.getBoundingClientRect(), cr = ch.getBoundingClientRect();
    return {
      main: url(main), base: base.classList.contains('hidden') ? null : url(base),
      slotHidden: slot.classList.contains('hidden'), approachMode: slot.classList.contains('approach-mode'),
      slotImage: getComputedStyle(slot).backgroundImage,
      station: ch.dataset.station || null, kind: ch.dataset.kind || null, frame: ch.dataset.frame, url: url(ch),
      visible: getComputedStyle(ch).display !== 'none' && !slot.classList.contains('hidden'),
      anim: getComputedStyle(ch).animationName, bgPos: getComputedStyle(ch).backgroundPosition,
      slotRect: [sr.x, sr.y, sr.width, sr.height], rect: [cr.x, cr.y, cr.width, cr.height],
      sw: +ch.style.getPropertyValue('--sprite-w'), sh: +ch.style.getPropertyValue('--sprite-h'),
      comm: document.getElementById('screen-encounter').classList.contains('comm-screen') ? 'screen' : 'in_person',
      layer: STATE.layerStack ? STATE.layerStack[STATE.layerStack.length - 1] : null,
    };
  });
  let s;
  for (let i = 0; i < 60; i++) { s = await read(); if (s.main && (s.station || !s.approachMode)) break; await page.waitForTimeout(50); }
  await page.waitForTimeout(450); // main layer's 0.4s cross-fade
  s = await read();
  if (s.url) painted.add(s.url);
  return s;
}
async function cruise(page) {
  await page.evaluate(() => { if (typeof showScreen === 'function') showScreen('screen-cruise'); renderCruise(); });
  const read = () => page.evaluate(() => {
    const el = document.getElementById('cruise-station'), scene = document.getElementById('cruise-scene');
    const m = /url\(["']?([^"')]+)["']?\)/.exec(el.style.backgroundImage || '');
    const r = el.getBoundingClientRect(), sr = scene.getBoundingClientRect(), ship = document.getElementById('ship-silhouette').getBoundingClientRect();
    return {
      station: el.dataset.station || null, kind: el.dataset.kind || null, frame: el.dataset.frame,
      url: m ? decodeURIComponent(m[1]).replace(/^.*?sprites\/backgrounds\//, '') : null,
      visible: getComputedStyle(el).display !== 'none', atStation: scene.classList.contains('at-station'),
      anim: getComputedStyle(el).animationName, scale: +el.style.getPropertyValue('--approach-scale'),
      sw: +el.style.getPropertyValue('--sprite-w'), sh: +el.style.getPropertyValue('--sprite-h'),
      rect: [r.x, r.y, r.width, r.height], scene: [sr.x, sr.y, sr.width, sr.height], ship: [ship.x, ship.y, ship.width, ship.height],
      shipBehind: [...scene.children].indexOf(el) < [...scene.children].indexOf(document.getElementById('ship-silhouette')),
    };
  });
  let s;
  for (let i = 0; i < 60; i++) { s = await read(); if (s.station || !s.atStation) break; await page.waitForTimeout(50); }
  await page.waitForTimeout(100);
  s = await read();
  if (s.url) painted.add(s.url);
  return s;
}
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1.5);

(async () => {
  browser = await chromium.launch();
  const KIND = { 1: 'animated', 2: 'static', 3: 'animated', 4: 'static' };

  console.log('— the hail: bridge, space, the station in the viewport (demo approach mode)');
  {
    const page = await boot();
    const at = await parkAtStation(page, 3);
    await page.evaluate(() => enterEvent(STATE.byId[STATE.currentId], EVENTS.event_station_004));
    const a = await hail(page);
    ok(a.main === 'our_ship/bridge.png', `main backdrop is the bridge (${a.main})`);
    ok(a.base && /^space\/deep\/\d\.jpg$/.test(a.base), `space behind it (${a.base})`);
    ok(a.approachMode && a.visible && a.slotImage === 'none', 'viewport slot in approach mode: its own image suppressed, the station child shown');
    ok(a.station === 'station/approach/3' && a.kind === 'animated' && a.url === 'station/approach/3/spritesheet.png', `the station is the node's pick: ${a.station} (${a.kind})`);
    ok(a.comm === 'screen', 'the queue is over comms (comm-screen)');
    // Intrinsic size, centred in the viewport slot (the stage is scaled to
    // the window — compare in the slot's own scale: 640 game px wide).
    const k = a.slotRect[2] / 640;
    ok(near(a.rect[2], a.sw * k) && near(a.rect[3], a.sh * k) && a.sw === 256 && a.sh === 208, `intrinsic size ${a.sw}×${a.sh} (rendered ${a.rect[2].toFixed(1)}×${a.rect[3].toFixed(1)} at stage ×${k.toFixed(3)})`);
    ok(near(a.rect[0] + a.rect[2] / 2, a.slotRect[0] + a.slotRect[2] / 2) && near(a.rect[1] + a.rect[3] / 2, a.slotRect[1] + a.slotRect[3] / 2), 'centred in the viewport');
    const f0 = a.frame, p0 = a.bgPos;
    await page.waitForTimeout(260);
    const b = await page.evaluate(() => { const ch = document.getElementById('enc-approach-sprite'); return { frame: ch.dataset.frame, pos: getComputedStyle(ch).backgroundPosition }; });
    ok(b.frame !== f0 && b.pos !== p0, `the spritesheet animates (frame ${f0} → ${b.frame}, ${p0} → ${b.pos})`);
    ok(a.anim === 'none', 'an animated sheet does not bob (demo: its frames are the motion)');
    await shot(page, 'hail_station3');

    console.log('— a reload mid-hail shows the same station');
    await reloadRun(page);
    const r = await hail(page);
    ok(r.station === a.station && r.main === a.main && r.base === a.base, `after reload: ${r.station}, ${r.base}`);

    console.log('— docking moves inside: the interior replaces the bridge');
    await click(page, 'Wait your turn');
    const c = await hail(page);
    ok(c.main && /^station\/dock\/\d\.jpg$/.test(c.main), `the docked outcome shows the dock interior (${c.main})`);
    ok(c.slotHidden && !c.approachMode && !c.station && c.base === null, 'no starfield, no viewport station, approach mode off');
    const timerOff = await page.evaluate(async () => { const ch = document.getElementById('enc-approach-sprite'); const f = ch.dataset.frame; await new Promise(r => setTimeout(r, 250)); return f === undefined && ch.dataset.frame === undefined; });
    ok(timerOff, 'the frame cycler stops once inside');
    await shot(page, 'docked_interior');

    console.log('— the cruise hub at that stop shows the same station');
    await page.evaluate(() => { if (typeof advanceAfterEvent === 'function') advanceAfterEvent(); });
    await page.waitForTimeout(300);
    const h = await cruise(page);
    ok(h.atStation && h.visible && h.station === a.station && h.kind === 'animated', `hub shows ${h.station} (${h.kind})`);
    ok(h.shipBehind && h.rect[1] + h.rect[3] / 2 < h.ship[1] + h.ship[3] / 2, 'the station sits behind and above the ship');
    ok(h.rect[0] + h.rect[2] / 2 > h.scene[0] + h.scene[2] * 0.7 && h.rect[1] < h.scene[1] + h.scene[3] * 0.3, 'hangs in the distance, upper right of the scene');
    const g0 = h.frame; await page.waitForTimeout(260);
    const g1 = await page.evaluate(() => document.getElementById('cruise-station').dataset.frame);
    ok(g0 !== g1, `animates in the hub too (frame ${g0} → ${g1})`);
    await shot(page, 'hub_station3');
    await reloadRun(page);
    const hr = await cruise(page);
    ok(hr.station === a.station && hr.atStation, `after reload the hub shows the same station (${hr.station})`);
    ok(at.seed === await page.evaluate(() => STATE.artSeed), 'the art seed is the saved one');
    await page.close();
  }

  console.log('— a static station bobs; the hub keeps the pixels whole');
  {
    const page = await boot();
    await parkAtStation(page, 4);
    await page.evaluate(() => enterEvent(STATE.byId[STATE.currentId], EVENTS.event_station_004));
    const a = await hail(page);
    ok(a.station === 'station/approach/4' && a.kind === 'static' && a.url === 'station/approach/4/1.png', `static station: ${a.url}`);
    ok(a.anim === 'enc-ship-bob', `it bobs (animation ${a.anim})`);
    const k = a.slotRect[2] / 640;
    ok(a.sw === 640 && a.sh === 405 && near(a.rect[2], 640 * k) && near(a.rect[1] + a.rect[3] / 2, a.slotRect[1] + a.slotRect[3] / 2, 4), 'intrinsic 640×405 fills the viewport, centred (bob ≤3px)');
    await shot(page, 'hail_station4');
    await click(page, 'Skip the station');
    const s = await hail(page);
    ok(s.station === a.station && s.main === 'our_ship/bridge.png', 'skipping the stop: the outcome plays over the receding station');
    await page.evaluate(() => { if (typeof advanceAfterEvent === 'function') advanceAfterEvent(); });
    await page.waitForTimeout(300);
    const h = await cruise(page);
    ok(h.station === a.station && h.anim === 'cruise-station-bob', `hub: same station, bobbing (${h.anim})`);
    ok(h.scale === 0.25 && h.sw === 640, `640px wide → quartered to sit small in the distance (scale ${h.scale})`);
    await shot(page, 'hub_station4');
    await page.close();
  }

  console.log('— a layered station event: comms layer = approach, in-person layer = the station room');
  {
    const page = await boot();
    await parkAtStation(page, 1);
    await page.evaluate(() => {
      EVENTS.test_station_hail = {
        id: 'test_station_hail', title: 'Test hail', node_type: ['station'], trigger: ['any'],
        scene_type: 'station_interior', comm_mode: 'screen',
        npc: { disposition: 'station_crew', job: 'bartender', species: 'robot' },
        entryLayer: 'hail',
        layers: {
          hail: { title: 'STATION CONTROL', body: 'The ring hangs in the viewport.', line: 'Come on in.', choices: [{ text: 'Dock and walk in', next: 'bar' }] },
          bar: { comm_mode: 'in_person', title: 'THE BAR', body: 'Inside.', choices: [{ text: 'Back to the ship', back: true }] },
        },
        outcomes: {},
      };
      enterEvent(STATE.byId[STATE.currentId], EVENTS.test_station_hail);
    });
    const a = await hail(page);
    ok(a.layer === 'hail' && a.station === 'station/approach/1' && a.kind === 'animated' && a.main === 'our_ship/bridge.png', `comms layer: bridge + ${a.station}`);
    await click(page, 'Dock and walk in');
    const b = await hail(page);
    ok(b.layer === 'bar' && b.main && /^station\/cantina\/\d\.jpg$/.test(b.main) && !b.station && b.slotHidden, `in-person layer: the station room (${b.main})`);
    await shot(page, 'layer_inside');
    await click(page, 'Back to the ship');
    const c = await hail(page);
    ok(c.layer === 'hail' && c.station === a.station && c.base === a.base, 'back on comms: the same station, the same starfield');
    await page.close();
  }

  console.log('— only station hails: an in-person station event and a hail elsewhere keep their scenes');
  {
    const page = await boot();
    await parkAtStation(page, 2);
    const r = await page.evaluate(() => {
      const st = STATE.byId[STATE.currentId];
      const other = STATE.nodes.find(n => n.node_type !== 'station');
      const pirate = Object.values(EVENTS).find(e => e.scene_type === 'ship_exterior' && e.comm_mode === 'screen');
      const npc = pirate.npc ? { disposition: pirate.npc.disposition, species: 'human' } : null;
      return {
        inPerson: SceneArt.layerSpecFor(EVENTS.event_station_001, st, null, null),
        hailHere: SceneArt.layerSpecFor(EVENTS.event_station_004, st, null, null),
        hailElsewhere: SceneArt.layerSpecFor(EVENTS.event_station_004, other, null, null),
        shipHail: SceneArt.layerSpecFor(pirate, st, pirate.layers ? pirate.layers[pirate.entryLayer] : null, npc),
      };
    });
    ok(r.inPerson.bg === 'station/promenade' && !r.inPerson.bgSprite, 'an in-person station event stays inside (promenade)');
    ok(r.hailHere.bgSprite === 'station/approach' && r.hailHere.bg === 'our_ship/bridge', 'event_station_004 at a station: approach composition');
    ok(r.hailElsewhere.bgSprite !== 'station/approach', 'no station sprite away from a station node');
    ok(/^ship_exterior\//.test(r.shipHail.bgSprite || ''), `a ship hail at a station still shows the ship (${r.shipHail.bgSprite})`);
    await page.close();
  }

  console.log('— the cruise hub elsewhere shows no station');
  {
    const page = await boot();
    await parkAtStation(page, 2);
    const s = await cruise(page);
    ok(s.visible && s.station === 'station/approach/2' && s.scale === 0.5 && s.anim === 'cruise-station-bob', `at the station: ${s.station}, halved (whole-pixel), bobbing`);
    await page.evaluate(() => { STATE.currentId = STATE.nodes.find(n => n.node_type !== 'station').id; });
    const n = await cruise(page);
    ok(!n.visible && !n.station && !n.atStation, 'at a non-station stop: no station, ship back in the middle');
    ok(near(n.ship[1] + n.ship[3] / 2, n.scene[1] + n.scene[3] / 2, 8), 'the ship is centred in the scene again');
    await page.close();
  }

  console.log('— all four approach folders are reachable');
  {
    const page = await boot();
    for (const k of [1, 2, 3, 4]) {
      await parkAtStation(page, k);
      await page.evaluate(() => enterEvent(STATE.byId[STATE.currentId], EVENTS.event_station_004));
      const a = await hail(page);
      const h = await cruise(page);
      ok(a.station === 'station/approach/' + k && a.kind === KIND[k] && h.station === a.station && a.visible && h.visible,
        `folder ${k}: ${a.kind} ${a.url} in the hail and the hub`);
      await shot(page, 'hub_station' + k);
    }
    // Every painted file (and the sheets' json) answers 200.
    const urls = [...painted].map(u => 'sprites/backgrounds/' + u);
    urls.push('sprites/backgrounds/station/approach/1/spritesheet.json', 'sprites/backgrounds/station/approach/3/spritesheet.json');
    const st = await page.evaluate(async us => Promise.all(us.map(u => fetch(u).then(r => r.status).catch(() => 0))), urls);
    ok(st.every(s => s === 200), `every painted station file loads (${urls.length}: ${[...new Set(st)].join(',')})`);
    await page.close();
  }

  console.log('— lint: the pool is reachable, no orphans');
  {
    let out = '';
    try { out = execFileSync(process.execPath, [path.join(ROOT, 'tools/lint_modules.js')], { encoding: 'utf8', cwd: ROOT }); } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    ok(/lint_modules: (clean|\d+ issue)/.test(out), 'lint ran');
    ok(!/orphaned backdrop: sprites\/backgrounds\/station\/approach/.test(out), 'no "orphaned backdrop: station/approach" warning');
    ok(!/station\/approach.*(has no|needs frames)/.test(out), 'no path error for the approach pool');
  }

  ok(bad.length === 0, 'no failed requests outside pool probing' + (bad.length ? ': ' + bad.slice(0, 4).join(' | ') : ''));
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
