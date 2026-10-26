// Save fuzzer: random play (sim.js policies, minigames stubbed) with
// save/reload at random points. Three checks:
//  · hub round trip — save, reload (in-page loadRun, or a real page reload
//    and Continue), save again: the two saves must be identical, and so
//    must what the hub shows (HUD, crew strip, crop card, Stop menu);
//  · event round trip — mid-event, a real reload and Continue lands back in
//    the same event, same layer, same speaker, same choices;
//  · no page errors, and the run keeps playing after every reload.
// Reload-as-quit for each minigame and job is test_save_quit.js; old
// builds' saves are test_save_fixtures.js.
// env: SAVE_FUZZ_RUNS (runs per trail, default 1), SAVE_FUZZ_STEPS (default
// 260), SAVE_FUZZ_SEED (default: random; printed so a failure replays).
const { chromium } = require('playwright');
const { installHarness, step } = require('./sim.js');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const RUNS = parseInt(process.env.SAVE_FUZZ_RUNS || '1', 10);
const STEPS = parseInt(process.env.SAVE_FUZZ_STEPS || '260', 10);
const SEED = parseInt(process.env.SAVE_FUZZ_SEED || String(1 + Math.floor(Math.random() * 1e9)), 10);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

const CAPTAINS = ['botanist', 'engineer', 'medic', 'pilot', 'chef', 'xenobiologist', 'diplomat', 'merchant', 'academic', 'veteran'];
const CREWPOOL = ['botanist', 'engineer', 'medic', 'pilot', 'chef', 'xenobiologist', 'diplomat'];
const CROPS = ['wheat', 'tomato', 'sweet_potato', 'soybean', 'zinnia'];
const AIS = ['aria', 'marv', 'rex', 'chip', 'ajoy'];

// Node-side PRNG (mulberry32): which steps checkpoint, and how.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// In-page: Math.random seeded per page load (the load count is mixed in,
// so a reload does not replay the same rolls).
function seedInit(seed) {
  let n = 0;
  try { n = +(sessionStorage.getItem('__fuzzLoads') || 0); sessionStorage.setItem('__fuzzLoads', String(n + 1)); } catch (_) {}
  let a = (seed + n * 7919) >>> 0;
  Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// The save as written now, without its timestamp.
function readSave() {
  const raw = localStorage.getItem('transplant_save_v1');
  if (!raw) return null;
  const s = JSON.parse(raw); delete s.ts; return s;
}
function freshHubSave() {
  if (!saveRun()) return null;
  const s = JSON.parse(localStorage.getItem('transplant_save_v1')); delete s.ts; return s;
}
// What the player sees at the hub. The AI log is left out: a reload
// rebuilds it from the ship's log on purpose.
function hubView() {
  const t = id => { const e = document.getElementById(id); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; };
  // Read with the Stop menu open (it lists the verbs). Never via the Stop
  // button: pressed while stopped it means RESUME — it travels.
  if (!document.body.classList.contains('stop-active')) openStopMenu();
  const verbs = [...document.querySelectorAll('#stop-choices .stop-choice')].map(b => (b.classList.contains('locked') ? '[L]' : '') + b.innerText.replace(/\s+/g, ' ').trim());
  return {
    // The header ticker scrolls (and cycles its lines): name, gold, day.
    header: [t('cruise-ship-name'), t('cruise-gold'), t('day-counter')].join(' | '), resrow: t('cruise-resrow'), crew: t('crew-strip'), crop: t('crop-card-mini'),
    bottom: t('bottom-resources'), verbs,
  };
}
function hubSafe() {
  const scr = (document.querySelector('.screen.active') || {}).id;
  return scr === 'screen-cruise' && !STATE.ended && !STATE.currentEvent && !STATE.forcedEvent &&
    !document.querySelector('#game .overlay.active') && !(window.cruiseWaitActive && cruiseWaitActive());
}
function eventView() {
  const enc = document.getElementById('screen-encounter');
  if (!enc || !enc.classList.contains('active') || enc.classList.contains('combat-mode') || STATE.outcomeMode || !STATE.currentEvent) return null;
  return {
    ev: STATE.currentEvent.id, variant: STATE.variantIndex, layers: (STATE.layerStack || []).join('>'), speaker: STATE.eventSpeaker || null,
    title: (document.getElementById('enc-narr-title') || {}).textContent || '',
    choices: [...document.querySelectorAll('#enc-choices .enc-choice')].filter(b => b.offsetParent !== null).map(b => (b.classList.contains('locked') ? '[L]' : '') + b.innerText.replace(/\s+/g, ' ').trim()),
  };
}

// Paths where two JSON values differ (first 12).
function diff(a, b, path = '', out = []) {
  if (out.length >= 12) return out;
  if (a === b) return out;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object' || Array.isArray(a) !== Array.isArray(b)) {
    out.push(`${path || '(root)'}: ${JSON.stringify(a)?.slice(0, 90)} → ${JSON.stringify(b)?.slice(0, 90)}`); return out;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], path + (Array.isArray(a) ? `[${k}]` : '.' + k), out);
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const R = rng(SEED);
  const pick = a => a[Math.floor(R() * a.length)];
  console.log(`save fuzz: seed ${SEED} (SAVE_FUZZ_SEED=${SEED} replays), ${RUNS} run(s) per trail, ${STEPS} steps`);
  const stats = { hub: 0, hubReload: 0, event: 0, runs: 0 };
  for (const trail of ['lunar', 'mars', 'interstellar']) for (let run = 0; run < RUNS; run++) {
    const runSeed = Math.floor(R() * 1e9);
    const policy = R() < 0.5 ? 'random' : 'greedy';
    const cfg = { trail, ai: pick(AIS), captain: pick(CAPTAINS), crew: [...new Set([pick(CREWPOOL), pick(CREWPOOL)])].slice(0, Math.floor(R() * 3)), crop: pick(CROPS), ship: 'Fuzz' };
    const tag = `${trail}#${run} ${policy} ${JSON.stringify(cfg)} (SAVE_FUZZ_SEED=${SEED})`;
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 780 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.stack || e.message).slice(0, 300)));
    page.on('dialog', d => d.accept());
    await page.addInitScript(seedInit, runSeed);
    // The in-page helpers, on every load.
    await page.addInitScript(`window.__fz = { readSave: ${readSave}, freshHubSave: ${freshHubSave}, hubView: ${hubView}, hubSafe: ${hubSafe}, eventView: ${eventView} };`);
    await page.clock.install();
    const boot = async () => {
      await page.clock.runFor(1500);
      await page.waitForFunction(() => typeof EVENTS !== 'undefined' && Object.keys(EVENTS).length > 0 && typeof MOD !== 'undefined' && MOD.crew_roster);
    };
    // A real reload: the page is gone, the title's Continue resumes.
    const realReload = async () => {
      await page.reload();
      await boot();
      const can = await page.evaluate(() => typeof hasSave === 'function' && hasSave());
      if (!can) return false;
      // The player's path: a key dismisses the poster, Continue lights.
      await page.keyboard.press('Space');
      for (let i = 0; i < 40 && !(await page.evaluate(() => document.getElementById('title-buttons').classList.contains('visible'))); i++) await page.clock.runFor(500);
      await page.clock.runFor(500); // the menu arms a beat after it appears (ruling 113)
      await page.click('#btn-continue');
      await page.keyboard.press('x'); // a key skips the departure (ruling 113)
      await page.clock.runFor(600);
      await page.evaluate(installHarness, policy);
      await page.clock.runFor(300);
      return true;
    };
    await page.goto(URL);
    await boot();
    await page.evaluate(() => localStorage.removeItem('transplant_save_v1'));
    await page.evaluate(installHarness, policy);
    await page.evaluate(c => { applySetupToState(c); returnToHub(); }, cfg);
    await page.clock.runFor(300);
    stats.runs++;
    let ended = false;
    for (let s = 0; s < STEPS && !ended; s++) {
      let r;
      try { r = await page.evaluate(step); } catch (e) { errors.push('step: ' + String(e.message).slice(0, 200)); r = { wait: 300 }; }
      if (r.done) { ended = true; break; }
      if (r.stuck) { ok(false, `${tag}: stuck at step ${s}`); break; }
      await page.clock.runFor(r.wait || 100);
      const roll = R();
      // ── hub round trip ──
      if (roll < 0.15 && await page.evaluate(() => __fz.hubSafe())) {
        await page.clock.runFor(600); // the hub's own timers (arrival alert) land first
        if (!(await page.evaluate(() => __fz.hubSafe()))) continue;
        const real = R() < 0.35;
        const a = await page.evaluate(() => __fz.freshHubSave());
        if (!a) { ok(false, `${tag}: saveRun refused at a safe hub point (step ${s})`); continue; }
        const va = await page.evaluate(() => __fz.hubView());
        if (real) { if (!(await realReload())) { ok(false, `${tag}: no Continue after a hub save (step ${s})`); break; } stats.hubReload++; }
        else { await page.evaluate(() => { loadRun(); }); await page.clock.runFor(600); }
        stats.hub++;
        const b = await page.evaluate(() => __fz.hubSafe() ? __fz.freshHubSave() : null);
        if (!b) { ok(false, `${tag}: after ${real ? 'reload' : 'loadRun'} the hub is not idle (step ${s}): ${await page.evaluate(() => (document.querySelector('.screen.active') || {}).id + ' ev=' + (STATE.currentEvent && STATE.currentEvent.id) + ' forced=' + JSON.stringify(STATE.forcedEvent))}`); continue; }
        const d = diff(a, b);
        ok(!d.length, `${tag}: save changed across a ${real ? 'page reload' : 'loadRun'} (step ${s}, day ${a.daysElapsed}):\n      ` + d.join('\n      '));
        const vb = await page.evaluate(() => __fz.hubView());
        const dv = diff(va, vb);
        ok(!dv.length, `${tag}: hub view changed across a ${real ? 'page reload' : 'loadRun'} (step ${s}):\n      ` + dv.join('\n      '));
      // ── event round trip ──
      } else if (roll < 0.21) {
        const va = await page.evaluate(() => __fz.eventView());
        if (!va) continue;
        const sa = await page.evaluate(() => __fz.readSave());
        if (!sa || sa.pendingEvent !== va.ev) { ok(false, `${tag}: in ${va.ev} but the save is ${sa ? 'for ' + (sa.pendingEvent || 'the hub') : 'missing'} (step ${s})`); continue; }
        // Whatever the event has changed so far must already be on disk: a
        // reload may not undo (or redo) part of a visit.
        const live = await page.evaluate(() => { writeSnapshot('__fz_probe'); const p = JSON.parse(localStorage.getItem('__fz_probe')); localStorage.removeItem('__fz_probe'); delete p.ts; return p; });
        const strip = o => { const c = Object.assign({}, o); for (const k of Object.keys(c)) if (/^pending/.test(k)) delete c[k]; return c; };
        const du = diff(strip(sa), strip(live));
        ok(!du.length, `${tag}: mid-event (${va.ev}, layer ${va.layers || '-'}) the save on disk is behind the live run (step ${s}):\n      ` + du.join('\n      '));
        if (!(await realReload())) { ok(false, `${tag}: no Continue mid-event (step ${s})`); break; }
        stats.event++;
        const vb = await page.evaluate(() => __fz.eventView());
        const dv = diff(va, vb);
        ok(!dv.length, `${tag}: event changed across a page reload (step ${s}):\n      ` + dv.join('\n      '));
      }
    }
    const end = await page.evaluate(() => ({ ended: STATE.ended, day: STATE.daysElapsed, end: window.__end || null }));
    console.log(`  ${tag}: ${end.end ? end.end.kind + ' ' + (end.end.type || end.end.bracket || '') : 'step budget'} day ${end.day}`);
    ok(!errors.length, `${tag}: page errors:\n      ` + errors.slice(0, 4).join('\n      '));
    await ctx.close();
  }
  console.log(`  checkpoints: ${stats.hub} hub (${stats.hubReload} real reloads), ${stats.event} mid-event reloads, ${stats.runs} runs`);
  ok(stats.hub >= 3 * RUNS, `too few hub checkpoints (${stats.hub})`);
  console.log(`save_fuzz: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
