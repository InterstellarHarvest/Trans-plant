// Unused backdrops (owner ruling 2026-10-11): the demo's per-layer
// bg / bgBase / bgSprite swap, ported. Boarding layers show the pirate /
// generic interiors, the trader's hold shows the trader interior, planet
// choices that go down to the surface show the landing scene of the same
// biome — and a reload mid-layer comes back to the same layer and the
// very same image. SHOT_DIR=<dir> saves screenshots for a visual check.
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
async function shot(page, name) {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
}
function files(rel) { // numbered pool on disk, sprites/backgrounds-relative
  return fs.readdirSync(path.join(BG_DIR, rel)).filter(f => /^\d+\.jpg$/.test(f)).map(f => rel + '/' + f);
}

(async () => {
  browser = await chromium.launch();

  console.log('— the transition: the main backdrop eases between scenes (demo canon)');
  {
    const page = await boot();
    const t = await page.evaluate(() => { const cs = getComputedStyle(document.getElementById('enc-backdrop')); return cs.transitionProperty + ' ' + cs.transitionDuration; });
    ok(/background/.test(t) && /0\.4s/.test(t), `.enc-backdrop transitions its background over 0.4s (${t})`);
    await page.close();
  }

  console.log('— trader: from the bridge into their hold and back');
  {
    const page = await boot();
    await page.evaluate(() => enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_trader_001));
    const a = await scene(page, 'our_ship/bridge');
    ok(a.main === 'our_ship/bridge.png' && /^space\/deep\//.test(a.base) && a.sprite && a.sprite.startsWith('ship_exterior/trader/' + a.species + '/'),
      `the hail is the bridge composition: ${a.main} + ${a.base} + ${a.sprite}`);
    await click(page, 'Hear the pitch');
    const b = await scene(page, 'our_ship/bridge');
    ok(b.main === a.main && b.sprite === a.sprite && b.base === a.base, 'the pitch layer inherits the scene (no bg authored)');
    await click(page, "Ask about the 'miscellaneous'");
    const c = await scene(page, 'ship_interior/trader');
    ok(c.layer === 'misc' && c.main && c.main.startsWith('ship_interior/trader/' + c.species + '/') && /\/\d\.jpg$/.test(c.main),
      `the misc layer is aboard: ${c.main} (species ${c.species})`);
    ok(computedIs(c), 'computed background-image is that file once the fade settles');
    ok(c.base === null && c.sprite === null, 'bgBase/bgSprite "" clear the starfield and the viewport ship');
    ok(c.comm === 'in_person', 'aboard, the trader is in person (layer comm_mode)');
    await shot(page, 'trader_hold');
    await reloadRun(page);
    const r = await scene(page, 'ship_interior/trader');
    ok(r.layer === 'misc' && r.main === c.main && r.species === c.species, `reload mid-layer: back in the hold, same image (${r.main})`);
    await click(page, 'Back to the manifest');
    const d = await scene(page, 'our_ship/bridge');
    ok(d.layer === 'pitch' && d.main === 'our_ship/bridge.png' && d.sprite === a.sprite && d.base === a.base, 'back to the manifest: the bridge, their ship, the same starfield');
    await page.close();
  }

  console.log('— boarding: the squatters\' grafted ship');
  {
    const page = await boot();
    await page.evaluate(() => enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_boarding_001));
    const a = await scene(page, 'ship_interior/derelict');
    ok(a.main && a.main.startsWith('ship_interior/derelict/'), `the wreck: ${a.main}`);
    await click(page, 'Negotiate a split');
    const b = await scene(page, 'ship_interior/pirate');
    ok(b.layer === 'parley' && b.main.startsWith('ship_interior/pirate/' + b.species + '/'), `the parley is aboard their ship: ${b.main}`);
    ok(computedIs(b), 'computed background-image matches');
    await shot(page, 'pirate_galley');
    await reloadRun(page);
    const r = await scene(page, 'ship_interior/pirate');
    ok(r.layer === 'parley' && r.main === b.main, `reload mid-layer: same layer, same image (${r.main})`);
    const gold = await page.evaluate(() => STATE.goldAmount);
    await click(page, 'Walk it back');
    const c = await scene(page, 'ship_interior/derelict');
    ok(c.layer === 'intro' && c.main === a.main, `walking it back returns to the same wreck image (${c.main})`);
    ok(await page.evaluate(g => STATE.goldAmount === g, gold), 'navigation charged nothing extra');
    await page.close();
  }

  console.log('— drifter: docking at the hermit\'s habitat');
  {
    const page = await boot();
    await page.evaluate(() => enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_drifter_001));
    const a = await scene(page, 'our_ship/bridge');
    ok(a.sprite && a.sprite.startsWith('ship_exterior/drifter/'), `the hail shows the habitat in the viewport (${a.sprite})`);
    await click(page, 'Dock and say hello');
    const b = await scene(page, 'ship_interior/generic');
    ok(b.layer === 'visit' && /^ship_interior\/generic\/\d\.jpg$/.test(b.main) && !b.sprite && !b.base, `inside: ${b.main}`);
    await click(page, 'Ask about the old route');
    const c = await scene(page, 'ship_interior/generic');
    ok(c.layer === 'route' && c.main === b.main, 'the next room-layer keeps the same interior (path-stable pick)');
    await page.close();
  }

  console.log('— planet: orbit → surface, same biome');
  {
    const page = await boot();
    await page.evaluate(() => enterEvent(STATE.byId[STATE.currentId], EVENTS.event_planet_003));
    const a = await scene(page, 'planet_surface');
    const biome = (/^planet_surface\/(\w+)\/approach\/\d\.jpg$/.exec(a.main || '') || [])[1];
    ok(!!biome, `arrival is the orbital approach: ${a.main}`);
    await shot(page, 'planet_approach');
    await reloadRun(page);
    const r = await scene(page, 'planet_surface');
    ok(r.main === a.main, `reload at the event: the same approach image (${r.main})`);
    await click(page, 'Open the tanks');
    const b = await scene(page, 'planet_surface/' + biome + '/');
    ok(new RegExp('^planet_surface/' + biome + '/\\d\\.jpg$').test(b.main || ''), `landing scene of the same biome: ${b.main}`);
    ok(computedIs(b), 'computed background-image matches');
    await shot(page, 'planet_surface');
    await page.close();
  }
  {
    const page = await boot();
    await page.evaluate(() => enterEvent(STATE.byId[STATE.currentId], EVENTS.event_planet_004));
    const a = await scene(page, 'planet_surface');
    await click(page, 'Leave it alone');
    const b = await scene(page, 'planet_surface');
    ok(page && await page.evaluate(() => STATE.outcomeMode) && b.main === a.main && /\/approach\//.test(b.main), 'lifting off without landing keeps the approach (no surface scene)');
    await page.close();
  }

  console.log('— combat: an accepted surrender is stripped aboard their ship');
  {
    const page = await boot();
    await page.evaluate(() => { Math.random = () => 0.5; }); // species water — they surrender
    await page.evaluate(() => { enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001); window.triggerCombat({}); });
    await page.waitForTimeout(250);
    for (let i = 0; i < 12; i++) {
      if ((await page.evaluate(() => document.getElementById('enc-choices').innerText)).includes('ACCEPT SURRENDER')) break;
      await click(page, 'FIRE LASER'); await page.waitForTimeout(100);
      await click(page, 'FIRE AT CENTER'); await page.waitForTimeout(1600);
    }
    await click(page, 'ACCEPT SURRENDER');
    await page.waitForTimeout(400);
    const s = await scene(page, 'ship_interior/pirate');
    ok(s.main && s.main.startsWith('ship_interior/pirate/' + s.species + '/'), `SURRENDER ACCEPTED shows their interior (${s.main})`);
    await page.close();
  }

  console.log('— every one of the 39 + 4 + 26 is reachable through the engine');
  {
    const page = await boot();
    const want = [
      ...['human', 'insect', 'rock', 'water', 'reptile', 'robot', 'unknown'].flatMap(sp => files('ship_interior/pirate/' + sp)),
      ...['human', 'insect', 'rock', 'water', 'reptile', 'robot', 'unknown'].flatMap(sp => files('ship_interior/trader/' + sp)),
      ...files('ship_interior/generic'),
      ...['alien', 'desert', 'habitable', 'ice', 'ocean', 'volcanic'].flatMap(b => files('planet_surface/' + b)),
    ];
    ok(want.length === 69, `69 files on disk (${want.length})`);
    const seen = await page.evaluate(async () => {
      const out = new Set();
      const grab = () => { const m = /sprites\/backgrounds\/([^"')]+)/.exec(document.getElementById('enc-backdrop').style.backgroundImage); if (m) out.add(decodeURIComponent(m[1])); };
      const main = document.getElementById('enc-backdrop');
      const settle = async (pred) => { for (let k = 0; k < 40 && !pred(main.style.backgroundImage); k++) await new Promise(r => setTimeout(r, k < 3 ? 0 : 25)); };
      const node = STATE.byId[STATE.currentId];
      const SPECIES = ['human', 'insect', 'rock', 'water', 'reptile', 'robot', 'unknown'];
      const runs = [
        [EVENTS.event_encounter_trader_001, 'misc', 'trader'],
        [EVENTS.event_encounter_boarding_001, 'parley', 'pirate'],
        [EVENTS.event_encounter_drifter_001, 'visit', 'drifter'],
      ];
      for (const [ev, lid, disp] of runs) for (const sp of SPECIES) for (let seed = 1; seed <= 40; seed++) {
        STATE.artSeed = seed; SceneArt.beginEvent(); main.style.backgroundImage = '';
        SceneArt.render(ev, node, ev.layers[lid], { disposition: disp, species: sp, displayName: 'X' }, null, {});
        await settle(b => b.includes('ship_interior')); grab();
      }
      // Planet landings: every surface choice routes through renderOutcome.
      const pev = EVENTS.event_planet_001, landing = pev.choices[0].outcome;
      for (let seed = 1; seed <= 400; seed++) {
        STATE.artSeed = seed; SceneArt.beginEvent(); main.style.backgroundImage = '';
        SceneArt.render(pev, node, null, null, null, {});
        SceneArt.renderOutcome({ scene_bg: landing.scene_bg }, null);
        await settle(b => b.includes('planet_surface') && !b.includes('/approach/')); grab();
      }
      SceneArt.stopTalking();
      return [...out];
    });
    const missing = want.filter(f => !seen.includes(f));
    ok(!missing.length, `all ${want.length} reached in play (${want.length - missing.length}/${want.length})${missing.length ? ' — missing ' + missing.join(', ') : ''}`);
    const loads = await page.evaluate(list => Promise.all(list.map(f => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth > 0 ? null : f); i.onerror = () => r(f); i.src = 'sprites/backgrounds/' + f; }))), want);
    const bad = loads.filter(Boolean);
    ok(!bad.length, 'every one of them loads and decodes' + (bad.length ? ': ' + bad.join(', ') : ''));
    await page.close();
  }

  console.log('— no painted backdrop 404s');
  {
    const page = await boot();
    const list = [...painted.keys()];
    const st = await page.evaluate(list => Promise.all(list.map(f => fetch('sprites/backgrounds/' + f, { method: 'GET' }).then(r => r.status).catch(() => 0))), list);
    const bad = list.filter((f, i) => st[i] !== 200);
    ok(list.length > 10 && !bad.length, `${list.length} painted backdrop files all answer 200${bad.length ? ' — ' + bad.join(', ') : ''}`);
    await page.close();
  }

  ok(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(`\nbackdrops: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
