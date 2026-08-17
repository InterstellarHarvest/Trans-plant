#!/usr/bin/env node
'use strict';
/* Randomized full-playthrough fuzz harness with DRAW-CORRECTNESS
 * AUDITING. Run after any engine or content change:
 *
 *   1. python3 -m http.server 8177        (from the Trans-plant root)
 *   2. node tools/fuzz_playthrough.js     (needs Playwright — see the
 *      nvm invocation note below if `require('playwright')` fails)
 *
 * What it guarantees, per run, per event fired:
 *   - the event's requires_flag was actually set at fire time
 *   - at least one of its trigger values was actually active
 *   - its node_type actually matched the node it fired at
 *   - once:true events never fire twice in a run
 * Plus per-leg STATE invariants:
 *   - resources finite and within [0,100]; gold >= 0; days finite
 *   - items all strings; materials finite and >= 0; crop health finite
 * Plus: no stalls (progress signature must change), no console errors,
 * no pageerrors, every run reaches an ending or the leg budget.
 *
 * The draw audit is installed by wrapping enterEvent() in-page, so it
 * checks what ACTUALLY fired, not what the pool math says should fire.
 *
 * nvm note: if system node lacks playwright, run via
 *   NODE_PATH=$HOME/.nvm/versions/node/<ver>/lib/node_modules \
 *     $HOME/.nvm/versions/node/<ver>/bin/node tools/fuzz_playthrough.js
 */
const { chromium } = require('playwright');

const RUNS = parseInt(process.env.FUZZ_RUNS || '6', 10);
const LEG_BUDGET = 300;
const BASE_URL = process.env.FUZZ_URL || 'http://localhost:8177/index.html?debug=fixed_path';

const TRAILS = ['lunar', 'mars', 'interstellar'];
const CROPS = ['wheat', 'tomato', 'sweet_potato', 'soybean', 'zinnia'];
const AIS = ['aria', 'marv', 'rex', 'chip', 'ajoy'];
const CAPTAINS = ['botanist', 'engineer', 'medic', 'pilot', 'chef', 'xenobiologist', 'diplomat', 'merchant', 'academic', 'veteran'];
const CREWPOOL = ['botanist', 'engineer', 'medic', 'pilot', 'chef', 'xenobiologist', 'diplomat'];
const pick = a => a[Math.floor(Math.random() * a.length)];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + (e.stack || e.message)));
  page.on('dialog', async d => { await d.accept(); });

  // Stubs: minigames resolve instantly with a random tier (the games
  // themselves are human-playable canvas loops, verified separately);
  // mining returns a small haul. The CONTRACTS stay fully exercised.
  const installHarness = () => page.evaluate(() => {
    window.openMinigame = (id, opts, onDone) => {
      const tier = ['perfect', 'good', 'poor'][Math.floor(Math.random() * 3)];
      setTimeout(() => onDone(tier, {}), 25);
    };
    window.openMining = (onDone) => setTimeout(() => onDone({ inventory: { minerals: 1 } }), 25);
    // Engine-repair scene resolves instantly with a random fault count
    // (0-4) so the REPAIR verb's { fixedCount, allFixed } contract stays
    // fully exercised — including the no-fix/partial/all-fixed branches.
    window.openEngineRepair = (onDone) => setTimeout(() => {
      const n = Math.floor(Math.random() * 5);
      onDone({ fixedCount: n, allFixed: n === 4 });
    }, 25);
    // Market modal resolves instantly (browse, buy nothing, leave) —
    // the fuzzer's blind clicker would otherwise keep punching the
    // hidden choice column behind the open modal. The real modal's
    // buy/sell/close contract is covered by targeted Playwright
    // (scratchpad test_market.js).
    window.openMarket = (opts, onClose) => setTimeout(() => { if (onClose) onClose(); }, 25);

    // Draw-correctness audit: wrap enterEvent and verify the fired
    // event's own gates against live STATE at the moment of firing.
    window.__drawViolations = [];
    window.__firedOnce = new Set();
    const realEnter = window.enterEvent;
    window.enterEvent = function (node, ev) {
      const v = window.__drawViolations;
      if (ev.requires_flag && !STATE.flags.has(ev.requires_flag)) {
        v.push(`${ev.id} fired WITHOUT its requires_flag "${ev.requires_flag}"`);
      }
      const trig = activeTriggers();
      const evTrig = ev.trigger || ['any'];
      if (!evTrig.some(t => trig.has(t))) {
        v.push(`${ev.id} fired with NO active trigger (needs ${JSON.stringify(evTrig)}, active: ${JSON.stringify([...trig])})`);
      }
      if (ev.trail && !ev.trail.includes(STATE.trail)) {
        v.push(`${ev.id} fired on trail "${STATE.trail}" but targets ${JSON.stringify(ev.trail)}`);
      }
      const nts = ev.node_type || ['any'];
      // fork nodes draw only fork-tagged events (engine rule); others
      // accept 'any' or an exact match. Exemption: the trader encounter
      // is not pool-DRAWN at forks — cruise.js's TRADE / WAIT FOR TRADER
      // verbs summon it deliberately at whatever node the ship is parked
      // on, and fork nodes expose those verbs via the deep_space region.
      // (Latent flake surfaced 2026-08-03 during Restoration item 1 —
      // pre-existing behavior, unrelated to that change.)
      if (node.node_type === 'fork') {
        if (!nts.includes('fork') && ev.id !== 'event_encounter_trader_001') v.push(`${ev.id} (non-fork event) fired at a fork node`);
      } else if (!nts.includes('any') && !nts.includes(node.node_type)) {
        v.push(`${ev.id} fired at node_type "${node.node_type}" but targets ${JSON.stringify(nts)}`);
      }
      if (ev.once) {
        if (window.__firedOnce.has(ev.id)) v.push(`once:true event ${ev.id} fired TWICE`);
        window.__firedOnce.add(ev.id);
      }
      return realEnter(node, ev);
    };
  });

  const invariants = () => page.evaluate(() => {
    const bad = [];
    for (const [k, v] of Object.entries(STATE.resources)) {
      if (!Number.isFinite(v) || v < 0 || v > 100) bad.push(`resources.${k}=${v}`);
    }
    if (!Number.isFinite(STATE.goldAmount) || STATE.goldAmount < 0) bad.push(`gold=${STATE.goldAmount}`);
    if (!Number.isFinite(STATE.daysElapsed) || STATE.daysElapsed < 0) bad.push(`days=${STATE.daysElapsed}`);
    for (const it of STATE.items) { if (typeof it !== 'string') bad.push(`items has ${typeof it}`); }
    for (const [m, q] of Object.entries(STATE.materials)) { if (!Number.isFinite(q) || q < 0) bad.push(`materials.${m}=${q}`); }
    if (STATE.cropGrowth && !Number.isFinite(STATE.cropGrowth.health)) bad.push(`cropHealth=${STATE.cropGrowth.health}`);
    return bad.concat(window.__drawViolations.splice(0));
  });

  const totalEvents = new Set();
  const violations = [];

  for (let run = 0; run < RUNS; run++) {
    const cfg = {
      trail: TRAILS[run % 3], ai: pick(AIS), captain: pick(CAPTAINS),
      crew: [...new Set([pick(CREWPOOL), pick(CREWPOOL)])], crop: pick(CROPS), ship: 'Fuzz ' + run,
    };
    await page.goto(BASE_URL);
    await page.waitForTimeout(350);
    await installHarness();
    await page.evaluate((c) => applySetupToState(c), cfg);
    await page.waitForTimeout(200);

    let stall = 0, lastSig = '';
    for (let leg = 0; leg < LEG_BUDGET; leg++) {
      const sig = await page.evaluate(() =>
        document.querySelector('.screen.active').id + '|' + STATE.daysElapsed + '|' +
        (STATE.currentEvent && STATE.currentEvent.id) + '|' + STATE.currentId + '|' +
        (STATE.layerStack ? STATE.layerStack.join('>') : '') + '|' + (STATE.currentOutcomeId || '') + '|' +
        document.getElementById('screen-encounter').className + '|' +
        document.querySelectorAll('#enc-choices .enc-choice').length);
      if (sig === lastSig) { stall++; } else { stall = 0; lastSig = sig; }
      if (stall > 60) { violations.push(`run${run} STALL at ${sig}`); break; }

      const screen = sig.split('|')[0];
      if (screen === 'screen-end') break;

      if (screen === 'screen-encounter') {
        const ev = await page.evaluate(() => STATE.currentEvent && STATE.currentEvent.id);
        if (ev) totalEvents.add(ev);
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('#enc-choices .enc-choice:not(.locked)'));
          if (btns.length) btns[Math.floor(Math.random() * btns.length)].click();
        });
        await page.waitForTimeout(220);
      } else if (screen === 'screen-cruise') {
        if (Math.random() < 0.25) {
          await page.click('#stop-btn'); await page.waitForTimeout(90);
          await page.evaluate(() => {
            const verbs = Array.from(document.querySelectorAll('.stop-choice'));
            if (verbs.length) verbs[Math.floor(Math.random() * verbs.length)].click();
          });
          await page.waitForTimeout(200);
          await page.evaluate(() => {
            for (const id of ['overlay-minigames', 'overlay-mining', 'overlay-engrepair', 'overlay-fabricator', 'overlay-growbay', 'overlay-inventory']) hideOverlay(id);
            document.body.classList.remove('modal-open');
          });
          if (await page.evaluate(() => document.body.classList.contains('stop-active'))) await page.click('#stop-btn');
          await page.waitForTimeout(200);
        } else {
          await page.click('#stop-btn'); await page.waitForTimeout(80);
          await page.click('#stop-btn'); await page.waitForTimeout(220);
        }
      } else {
        await page.waitForTimeout(200);
      }

      const bad = await invariants();
      if (bad.length) { violations.push(`run${run} leg${leg}: ${bad.join(' | ')}`); break; }
    }
    const end = await page.evaluate(() => ({
      screen: document.querySelector('.screen.active').id, days: STATE.daysElapsed, ended: STATE.ended,
      cropHealth: STATE.cropGrowth && Math.round(STATE.cropGrowth.health),
    }));
    console.log(`run${run} [${cfg.trail}/${cfg.crop}/${cfg.ai}]:`, JSON.stringify(end));
  }

  console.log('distinct events across fuzz:', totalEvents.size);
  console.log('VIOLATIONS:', violations.length ? violations : 'none');
  console.log('CONSOLE/PAGE ERRORS:', errors.filter(e => !e.includes('404')).slice(0, 10));
  await browser.close();
  process.exit(violations.length || errors.filter(e => !e.includes('404')).length ? 1 : 0);
})();
