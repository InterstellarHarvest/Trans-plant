// Ship rooms + station markets (owner 2026-10-11, "are some rooms, like
// medbay and cargo, not used at all right now ever?"): our_ship/cargo,
// our_ship/medbay and the engine room now show for the events set there
// (engine_fixed when the repair works); TRADE at a station opens Market
// Row with the vendor's quarter of the market (human / alien) or the
// mixed concourse; elsewhere a trader ship still answers.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const SHOT_DIR = process.env.SHOT_DIR || null;
const BG_DIR = path.join(__dirname, '../../resources/sprites/backgrounds');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
const painted = new Map(); // every backdrop URL the engine painted → HTTP status

async function boot(setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['diplomat', 'pilot'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForTimeout(150);
  return page;
}
async function reloadRun(page) {
  await page.reload();
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor);
  await page.evaluate(() => loadRun());
  await page.waitForTimeout(150);
}
const click = (page, t) => page.evaluate(t => {
  if (typeof finishAllTyping === 'function') finishAllTyping();
  const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.textContent.includes(t));
  if (!b) return false; b.click(); return true;
}, t);
// The backdrop stack once it has settled (resolution is async; the main
// layer cross-fades for 0.4s). URLs are sprites/backgrounds-relative.
async function scene(page, expectMain) {
  const read = () => page.evaluate(() => {
    const url = el => { const m = /url\(["']?([^"')]+)["']?\)/.exec(el.style.backgroundImage || ''); return m ? decodeURIComponent(m[1]).replace(/^.*?sprites\/backgrounds\//, '') : null; };
    const main = document.getElementById('enc-backdrop'), base = document.getElementById('enc-backdrop-base'), sp = document.getElementById('enc-backdrop-sprite');
    return {
      authored: main.dataset.scene || null,
      main: url(main), computed: getComputedStyle(main).backgroundImage,
      base: base.classList.contains('hidden') ? null : url(base),
      sprite: sp.classList.contains('hidden') ? null : url(sp),
      layer: STATE.layerStack ? STATE.layerStack[STATE.layerStack.length - 1] : null,
      comm: document.getElementById('screen-encounter').classList.contains('comm-screen') ? 'screen' : 'in_person',
      species: STATE.npcCtx && STATE.npcCtx.species,
    };
  });
  let s;
  for (let i = 0; i < 40; i++) {
    s = await read();
    if (s.main && (!expectMain || s.main.startsWith(expectMain))) break;
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(500); // past the 0.4s cross-fade
  s = await read();
  for (const k of ['main', 'base', 'sprite']) if (s[k]) painted.set(s[k], null);
  return s;
}
const computedIs = s => s.computed.includes(s.main.split('/').map(encodeURIComponent).join('/')) || s.computed.includes(s.main);

(async () => {
  browser = await chromium.launch();

  console.log('— events show the room they happen in');
  const ROOMS = {
    'our_ship/cargo': ['event_crisis_006', 'event_general_007', 'event_general_008', 'event_general_009', 'event_general_037', 'event_general_038', 'event_shipboard_001', 'event_shipboard_005'],
    'our_ship/medbay': ['event_crisis_015', 'event_shipboard_007', 'event_shipboard_008'],
    'our_ship/engine_error': ['event_crisis_003', 'event_crisis_017'],
  };
  {
    const page = await boot({ crew: ['engineer', 'pilot'] });
    for (const [room, ids] of Object.entries(ROOMS)) {
      const bad = [];
      for (const id of ids) {
        await page.evaluate(id => { STATE.stowaway = STATE.stowaway || null; enterEvent(STATE.byId[STATE.currentId], EVENTS[id]); }, id);
        const s = await scene(page, room);
        if (!s.main || !s.main.startsWith(room) || !computedIs(s)) bad.push(id + '→' + s.main);
      }
      ok(!bad.length, room + ': ' + ids.length + ' events paint it' + (bad.length ? ' — ' + bad.join(', ') : ''));
    }
    await page.close();
  }

  console.log('— the repair lands: the engine room comes back on');
  for (const [id, pick] of [['event_crisis_017', 'Engineer leads'], ['event_crisis_003', 'Have the pilot tune']]) {
    const page = await boot({ crew: ['engineer', 'pilot'] });
    await page.evaluate(id => enterEvent(STATE.byId[STATE.currentId], EVENTS[id]), id);
    const a = await scene(page, 'our_ship/engine_error');
    const clicked = await click(page, pick);
    const b = await scene(page, 'our_ship/engine_fixed');
    ok(a.main.startsWith('our_ship/engine_error') && clicked && b.main.startsWith('our_ship/engine_fixed'), id + ': engine_error → "' + pick + '" → engine_fixed');
    await page.close();
  }
  {
    const page = await boot({ crew: ['medic', 'pilot'] });
    await page.evaluate(() => { STATE.crewHP.pilot = 30; enterEvent(STATE.byId[STATE.currentId], EVENTS.event_shipboard_006); });
    const a = await scene(page);
    await click(page, 'Medic supervised');
    const b = await scene(page, 'our_ship/medbay');
    ok(a.main.startsWith('our_ship/corridor') && b.main.startsWith('our_ship/medbay'), 'Light Duty: corridor → the medic\'s program happens in the medbay');
    await page.close();
  }

  console.log('— TRADE at a station: Market Row, the vendor\'s quarter of the market');
  {
    const page = await boot();
    const seen = { human: new Set(), alien: new Set() };
    let wrong = [], events = new Set();
    for (let i = 0; i < 80; i++) {
      await page.evaluate(i => {
        STATE.artSeed = 1000 + i * 7919;
        const st = STATE.nodes.filter(n => n.node_type === 'station')[i % 2];
        STATE.currentId = st.id;
        if (typeof clearNpcSlot === 'function') clearNpcSlot();
        STATE.npcCtx = null;
        window.__tradeHere && window.__tradeHere();
      }, i);
      // drive the real verb
      const ev = await page.evaluate(() => { returnToHub(); openStopMenu && openStopMenu(); const b = [...document.querySelectorAll('.stop-choice')].find(b => /TRADE/.test(b.textContent)); if (b) b.click(); return STATE.currentEvent && STATE.currentEvent.id; });
      events.add(ev);
      const s = await scene(page, 'station/market');
      const sp = s.species === 'human' ? 'human' : 'alien';
      const folder = (s.main || '').split('/').slice(0, 3).join('/');
      if (folder !== 'station/market/' + sp && folder !== 'station/market/mixed') wrong.push(s.species + '→' + s.main);
      seen[sp].add(folder);
      const got = new Set([...seen.human, ...seen.alien]);
      if (i >= 8 && got.size === 3) break;
    }
    ok(events.size === 1 && events.has('event_station_013'), 'TRADE at a station opens Market Row (' + [...events].join(', ') + ')');
    ok(!wrong.length, 'every stall shows its vendor\'s quarter or the mixed concourse' + (wrong.length ? ': ' + wrong.join(', ') : ''));
    const all = new Set([...seen.human, ...seen.alien]);
    ok(['station/market/human', 'station/market/alien', 'station/market/mixed'].every(f => all.has(f)), 'human / alien / mixed markets all reached (' + [...all].join(', ') + ')');
    const r = await page.evaluate(() => { finishAllTyping(); const b = [...document.querySelectorAll('#enc-choices .enc-choice')].map(b => b.textContent); return b; });
    ok(r.some(t => /BROWSE THE WARES/.test(t)), 'BROWSE THE WARES is on the stall');
    await click(page, 'BROWSE THE WARES');
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.getElementById('overlay-market').classList.contains('active') || getComputedStyle(document.getElementById('overlay-market')).display !== 'none'), 'and it opens the market');
    await page.close();
  }
  {
    const page = await boot();
    const ev = await page.evaluate(() => {
      const nd = STATE.nodes.find(n => n.node_type !== 'station' && n.node_type !== 'fork');
      STATE.currentId = nd.id; returnToHub(); openStopMenu && openStopMenu();
      const b = [...document.querySelectorAll('.stop-choice')].find(b => /TRADE/.test(b.textContent));
      if (b) b.click(); return STATE.currentEvent && STATE.currentEvent.id;
    });
    ok(ev === 'event_encounter_trader_001' || ev === null, 'away from stations TRADE still hails a trader ship (' + ev + ')');
    await page.close();
  }

  console.log('— no backdrop 404s');
  {
    const page = await browser.newPage();
    const bad = [];
    for (const p of painted.keys()) {
      const st = await page.request.get(URL.replace(/index\.html.*$/, '') + 'sprites/backgrounds/' + p).then(r => r.status()).catch(() => 0);
      if (st !== 200) bad.push(p + ' ' + st);
    }
    ok(painted.size >= 8 && !bad.length, painted.size + ' painted backdrops all load' + (bad.length ? ': ' + bad.join(', ') : ''));
    await page.close();
  }

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(`\nrooms: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
