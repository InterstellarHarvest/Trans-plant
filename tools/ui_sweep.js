#!/usr/bin/env node
'use strict';
/* UI SWEEP — the third permanent harness. Drives the REAL clickable
 * game the way a player does (lint checks content, fuzz checks the
 * engine; neither touches the UI). Catches the class of bug where a
 * control's appearance and behavior disagree:
 *
 *   1. Real wizard walkthrough via clicks: title → New Game → every
 *      step (gate refuses with nothing picked, accepts after a pick)
 *      → Launch → cruise.
 *   2. Dead-control sweep on cruise: click EVERY visible button; each
 *      must either change the page signature (DOM/state/overlay) or be
 *      visibly disabled. Looks-enabled-but-inert = flagged.
 *      Looks-disabled-but-acted = flagged.
 *   3. Every overlay that opened must close again (its own close
 *      control or ESC). Stuck overlay = flagged.
 *   4. Encounter: real clicks through a layered event's choices.
 *
 * Run: python3 -m http.server 8177 (from Trans-plant root), then
 *   NODE_PATH=$HOME/.nvm/versions/node/<ver>/lib/node_modules \
 *     $HOME/.nvm/versions/node/<ver>/bin/node tools/ui_sweep.js
 */
const { chromium } = require('playwright');
const BASE_URL = process.env.SWEEP_URL || 'http://localhost:8177/index.html';

// Controls whose "no visible change" is BY DESIGN (log lines, toggles
// whose effect is off-screen). Keep short; every entry is a judgment.
const INERT_OK = new Set([]);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const errors = [], flags = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + (e.stack || e.message)));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404') && !m.text().includes('ERR_FILE_NOT_FOUND')) errors.push('[console] ' + m.text()); });
  page.on('dialog', async d => { await d.accept(); });
  const say = (ok, n, d) => console.log((ok ? '  ✓ ' : '  ✗ ') + n + (d ? ' — ' + d : ''));
  const flag = (n, d) => { flags.push(n + (d ? ' — ' + d : '')); say(false, n, d); };

  const sig = () => page.evaluate(() => {
    const active = document.querySelector('.screen.active');
    const overlays = [...document.querySelectorAll('.overlay.active')].map(o => o.id).join(',');
    const modal = document.body.className;
    const st = typeof STATE !== 'undefined' ? [STATE.daysElapsed, STATE.goldAmount, STATE.currentId, (STATE.currentEvent||{}).id, STATE.items.length].join('|') : '';
    // Hash the visible text (minus the typewriting AI log) — comparing
    // only its LENGTH called a button inert when its effect happened to
    // swap in a same-length line (Orders' LUDICROUS preview).
    const logText = (document.getElementById('ai-log') || { innerText: '' }).innerText;
    const text = document.body.innerText.replace(logText, '');
    let h = 0; for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return (active ? active.id : '') + '#' + overlays + '#' + modal + '#' + st + '#' + h;
  });
  const looksDisabled = el => page.evaluate(el => {
    const cs = getComputedStyle(el);
    // A current tab/selection (.active/.selected/aria-selected) is legitimately inert on re-click.
    if ((el.classList.contains('active') || el.classList.contains('selected') || el.getAttribute('aria-selected') === 'true') && /tab|pip|option|card/i.test(el.className)) return true;
    return el.disabled || el.classList.contains('disabled') || el.classList.contains('locked') ||
           el.classList.contains('combat-locked') || cs.pointerEvents === 'none' ||
           (cs.filter !== 'none' && /grayscale|brightness\(0\.[0-6]/.test(cs.filter)) || parseFloat(cs.opacity) < 0.6;
  }, el);

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof EVENTS !== 'undefined' && Object.keys(EVENTS).length > 0);
  await page.evaluate(() => localStorage.removeItem('transplant_save_v1'));

  // ── 0. DOM structure (added 2026-10-09) ───────────────────────
  // A missing </div> once nested #overlay-minigames inside the
  // fabricator overlay, so every minigame rendered at 0×0 for two
  // months. No .overlay/.screen may live inside another one.
  console.log('0. DOM structure');
  const nested = await page.evaluate(() =>
    [...document.querySelectorAll('.overlay .overlay, .screen .screen, .overlay .screen, .screen .overlay')]
      .map(el => el.id + ' inside ' + (el.parentElement.closest('.overlay, .screen') || {}).id));
  if (nested.length) nested.forEach(n => flag('nested overlay/screen', n)); else say(true, 'no nested overlays or screens');

  // ── 1. Wizard via real clicks ─────────────────────────────────
  console.log('1. Setup wizard (real clicks)');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.getElementById('title-buttons').classList.contains('visible'), null, { timeout: 15000 });
  await page.click('#btn-new');
  await page.waitForTimeout(500);
  let steps = 0;
  for (let i = 0; i < 8; i++) {
    const label = await page.evaluate(() => document.getElementById('setup-step-label').textContent);
    const hasCards = await page.evaluate(() => !!document.querySelector('.sel-card'));
    const isName = await page.evaluate(() => !!document.querySelector('#setup-options input, #ship-name-input, input[type=text]'));
    if (hasCards) {
      const isMulti = await page.evaluate(() => !!document.querySelector('.crew-card'));
      const before = await sig();
      await page.click('#btn-next');
      await page.waitForTimeout(250);
      // Multi-select (crew) is deliberately skippable via a solo-run
      // confirm; single-select steps must refuse with nothing picked.
      if (!isMulti && (await sig()) !== before && (await page.evaluate(() => document.getElementById('setup-step-label').textContent)) !== label) {
        flag('wizard advanced with NO selection', label);
      }
      // pick first card (and a second for crew)
      // Click by index in-page — cards re-render, so handles go stale.
      await page.evaluate(() => { const c = document.querySelectorAll('.sel-card'); if (c[0]) c[0].click(); });
      await page.waitForTimeout(120);
      if (isMulti) await page.evaluate(() => { const c = document.querySelectorAll('.sel-card'); if (c[1]) c[1].click(); });
      await page.waitForTimeout(150);
    }
    const isLast = await page.evaluate(() => /launch/i.test(document.getElementById('btn-next').textContent));
    await page.click('#btn-next');
    await page.waitForTimeout(500);
    steps++;
    if (isLast) break;
  }
  const onCruise = await page.evaluate(() => document.getElementById('screen-cruise').classList.contains('active'));
  say(onCruise, 'wizard → cruise via clicks', steps + ' steps');
  if (!onCruise) { flag('never reached cruise'); }

  // ── 2+3. Dead-control sweep on cruise ─────────────────────────
  console.log('2. Cruise dead-control sweep');
  const closeAnyOverlay = async () => {
    for (let k = 0; k < 5; k++) {
      // Pause menu (opened by ESC or a stray click) blocks everything — close it first.
      // (PauseMenu is a top-level const — not on window — so the old
      // window.PauseMenu check never closed it; the cruise ❚❚ button opens it.)
      const pauseOpen = await page.evaluate(() => document.body.classList.contains('pause-open'));
      if (pauseOpen) { await page.evaluate(() => { if (typeof PauseMenu !== 'undefined' && PauseMenu.close) PauseMenu.close(); }); await page.waitForTimeout(150); }
      // Nested modals inside overlays (expand/confirm dialogs) — dismiss by their own buttons.
      await page.evaluate(() => {
        const m = document.getElementById('slog-expand-modal'); if (m && m.style.display === 'flex') m.style.display = 'none';
        const c = document.getElementById('inv-confirm'); if (c && !c.classList.contains('hidden')) c.classList.add('hidden');
      });
      const open = await page.evaluate(() => [...document.querySelectorAll('.overlay.active')].map(o => o.id));
      if (!open.length) return true;
      const top = open[open.length - 1];
      // Try EVERY close-looking control in turn until the overlay closes —
      // a sub-panel's ✕ can match first while the real exit sits further down.
      const tried = [];
      const closed = await page.evaluate(async id => {
        const ov = document.getElementById(id);
        const cands = [...ov.querySelectorAll('button, [role=button], .enc-choice, [onclick], .er-choice, .panel-btn')]
          .filter(b => b.offsetParent !== null && (/close|back to|leave|done|return|abandon|✕|×|^x$|resume/i.test(b.textContent.trim()) || /close|-x$|leave|exit/.test(b.id)));
        const names = [];
        for (const b of cands) {
          names.push(b.textContent.trim().slice(0, 20) || b.id);
          b.click();
          await new Promise(r => setTimeout(r, 300));
          if (!ov.classList.contains('active')) return { ok: true, names };
        }
        return { ok: false, names };
      }, top);
      tried.push(...closed.names);
      const clicked = tried.join(' → ') || null;
      await page.waitForTimeout(100);
      if (closed.ok) continue;
      // Its own close control failed (or none exists) — that IS a finding.
      flag('overlay has no working close control', top + (clicked ? ' (tried: ' + clicked + ' — still open)' : ' (no close-like control found)'));
      await page.evaluate(id => { document.getElementById(id).classList.remove('active'); document.body.classList.remove('modal-open'); }, top);
    }
    return true;
  };
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll('#screen-cruise button, #screen-cruise [role=button], #screen-cruise .readout-cell, #screen-cruise .crew-slot, #screen-cruise #crop-card-mini')]
      .filter(b => b.offsetParent !== null && b.id !== 'stop-btn') // Stop⇄Resume is travel, swept in 2b
      // A control inside a fully transparent, click-through container (the
      // Stop menu while travelling) is off-screen to a player: skip it.
      .filter(b => { for (let e = b; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.opacity === '0' && cs.pointerEvents === 'none') return false; } return true; })
      .map((b, i) => { b.setAttribute('data-sweep', String(i)); return { i, label: (b.textContent || b.title || b.id).trim().slice(0, 30) || b.id || b.className }; }));
  let swept = 0;
  for (const b of buttons) {
    const el = await page.$('[data-sweep="' + b.i + '"]');
    if (!el) continue;
    const visible = await el.isVisible();
    if (!visible) continue;
    const dis = await looksDisabled(el);
    const before = await sig();
    await el.click({ force: true }).catch(() => {});
    await page.waitForTimeout(350);
    const after = await sig();
    const changed = before !== after;
    swept++;
    if (dis && changed) flag('looks DISABLED but acted', b.label);
    if (!dis && !changed && !INERT_OK.has(b.label)) flag('looks ENABLED but inert', b.label);
    // Overlay interior sweep
    const openOv = await page.evaluate(() => [...document.querySelectorAll('.overlay.active')].map(o => o.id));
    for (const ovId of openOv) {
      const inner = await page.evaluate(id => {
        const ov = document.getElementById(id);
        return [...ov.querySelectorAll('button, [role=button], .inv-tile, .od-option, .cd-cycle, .sel-card')]
          .filter(b => b.offsetParent !== null && !/close|back to|leave|done|return|✕|×|^x$|keep it|open the airlock|cancel/i.test(b.textContent.trim()) && !/close|-x$/.test(b.id))
          .map((b, i) => { b.setAttribute('data-sweep-in', id + ':' + i); return { key: id + ':' + i, label: (b.textContent || b.title || b.id).trim().slice(0, 30) || b.className }; });
      }, ovId);
      let n = 0;
      for (const ib of inner) {
        const iel = await page.$('[data-sweep-in="' + ib.key + '"]');
        if (!iel || !(await iel.isVisible())) continue;
        const idis = await looksDisabled(iel);
        const ib4 = await sig();
        await iel.click({ force: true }).catch(() => {});
        await page.waitForTimeout(250);
        const ich = ib4 !== (await sig());
        n++;
        if (idis && ich) flag('[' + ovId + '] looks DISABLED but acted', ib.label);
        if (!idis && !ich && !INERT_OK.has(ib.label)) flag('[' + ovId + '] looks ENABLED but inert', ib.label);
        // A nested overlay/modal may have opened (expand modal, confirm) — leave it to closeAnyOverlay
        if (!(await page.evaluate(id => document.getElementById(id).classList.contains('active'), ovId))) break;
      }
      if (n) say(true, 'swept ' + ovId + ' interior', n + ' controls');
    }
    await closeAnyOverlay();
  }
  say(true, 'swept cruise controls', swept + ' clicked: ' + buttons.map(b => b.label).join(' | '));

  // ── 3b. Stop Menu verbs (growbay/fabricator/mining/repair/etc) ──
  console.log('2b. Stop Menu verb sweep');
  await page.evaluate(() => { if (!document.body.classList.contains('stop-active')) document.getElementById('stop-btn').click(); });
  await page.waitForTimeout(400);
  const verbLabels = await page.evaluate(() =>
    [...document.querySelectorAll('#stop-choices button')].filter(b => b.offsetParent !== null).map(b => b.textContent.trim().slice(0, 28)));
  let vSwept = 0;
  for (let vi = 0; vi < verbLabels.length; vi++) {
    const stopOpen = await page.evaluate(() => document.body.classList.contains('stop-active'));
    if (!stopOpen) { await page.evaluate(() => document.getElementById('stop-btn').click()); await page.waitForTimeout(200); }
    const vb = (await page.$$('#stop-choices button'))[vi];
    if (!vb || !(await vb.isVisible())) continue;
    const label = verbLabels[vi];
    if (/resume|continue|depart|travel|leave station/i.test(label)) continue; // navigation verbs advance the run — not swept here
    const dis = await looksDisabled(vb);
    const before = await sig();
    await vb.click({ force: true }).catch(() => {});
    await page.waitForTimeout(600);
    const changed = before !== (await sig());
    vSwept++;
    if (dis && changed) flag('[stop] looks DISABLED but acted', label);
    if (!dis && !changed && !INERT_OK.has(label)) flag('[stop] looks ENABLED but inert', label);
    // Any overlay it opened: interior sweep + close (reuse the loop body's approach)
    const ovs = await page.evaluate(() => [...document.querySelectorAll('.overlay.active')].map(o => o.id));
    for (const ovId of ovs) {
      const inner = await page.evaluate(id => {
        const ov = document.getElementById(id);
        return [...ov.querySelectorAll('button')].filter(b => b.offsetParent !== null && !/close|back to|leave|done|return|✕|×|^x$|cancel|abandon/i.test(b.textContent.trim()) && !/close|-x$/.test(b.id)).length;
      }, ovId);
      say(true, '[stop] ' + label + ' → ' + ovId, inner + ' interior controls');
    }
    await closeAnyOverlay();
    // Verbs that cost days may have advanced/ended — bail if we left the hub
    if (!(await page.evaluate(() => document.getElementById('screen-cruise').classList.contains('active')))) {
      say(true, '[stop] ' + label + ' left the hub (summoned an event) — resolving it');
      // Click through the encounter (first unlocked choice / Continue) until we're back at the hub.
      for (let k = 0; k < 24; k++) { // event-dense starts can chain several events before the hub
        const onEnc = await page.evaluate(() => document.getElementById('screen-encounter').classList.contains('active'));
        if (!onEnc) break;
        // Prefer the LAST unlocked choice — the walk-away/Continue row — so
        // re-enterable choices (BROWSE THE WARES) can't loop us forever.
        await page.evaluate(() => { const bs = document.querySelectorAll('#enc-choices .enc-choice:not(.locked)'); if (bs.length) bs[bs.length - 1].click(); });
        await page.waitForTimeout(600);
        await closeAnyOverlay();
      }
      if (!(await page.evaluate(() => document.getElementById('screen-cruise').classList.contains('active')))) {
        const where = await page.evaluate(() => ({ screen: (document.querySelector('.screen.active') || {}).id, endTitle: ((document.getElementById('end-title') || document.querySelector('#screen-end h1, #screen-end .end-title') || {}).textContent || '').trim().slice(0, 60), day: STATE.daysElapsed, res: JSON.stringify(STATE.resources), orders: JSON.stringify(STATE.orders), crew: STATE.crew.join(','), ev: STATE.currentEvent && STATE.currentEvent.id, node: STATE.currentId, summoned: STATE.summonedEvent, overlays: [...document.querySelectorAll('.overlay.active')].map(o => o.id).join(','), choices: [...document.querySelectorAll('#enc-choices .enc-choice')].map(x => (x.className.includes('locked') ? '[L]' : '') + x.textContent.trim().slice(0, 18)).join(' | ') }));
        flag('[stop] could not return to hub after ' + label, JSON.stringify(where));
        break;
      }
    }
  }
  say(vSwept > 0, 'swept stop verbs', vSwept + ' of ' + verbLabels.length + ': ' + verbLabels.join(' | '));
  // Close the stop menu without traveling (Resume would burn a leg).
  await page.evaluate(() => { document.body.classList.remove('stop-active'); const b = document.getElementById('stop-btn'); if (b) b.textContent = 'Stop'; });

  // ── 4. Encounter via real clicks ──────────────────────────────
  console.log('3. Encounter choices (real clicks)');
  await page.evaluate(() => { const stn = STATE.nodes.find(n => n.node_type === 'station'); enterEvent(stn, EVENTS['event_station_009']); });
  await page.waitForTimeout(1800);
  let clicksOk = 0;
  for (let i = 0; i < 5; i++) {
    const btns = await page.$$('#enc-choices .enc-choice:not(.locked)');
    if (!btns.length) break;
    const before = await sig();
    const label = await btns[0].evaluate(b => b.textContent.trim().slice(0, 30));
    await btns[0].click();
    await page.waitForTimeout(700);
    await closeAnyOverlay();
    if ((await sig()) === before) flag('encounter choice inert', label); else clicksOk++;
    if (!(await page.evaluate(() => document.getElementById('screen-encounter').classList.contains('active')))) { say(true, 'event resolved and exited after ' + clicksOk + ' clicks'); break; }
    // Continue can travel straight into the NEXT node's random event (a
    // launch_minigame choice there opens a real, harness-unclosable
    // minigame — false flags). This section tests station_009 only.
    if (await page.evaluate(() => !STATE.currentEvent || STATE.currentEvent.id !== 'event_station_009')) { say(true, 'event resolved after ' + clicksOk + ' clicks (moved on to the next node)'); break; }
  }
  say(clicksOk > 0, 'encounter clicks all registered', clicksOk + ' clicks, 0 inert');

  // ── 4. Minigame overlay actually renders ─────────────────────
  console.log('4. Minigame overlay');
  for (const id of ['scan', 'medical']) {
    const vis = await page.evaluate(id => {
      openMinigame(id, {}, () => {});
      const r = document.getElementById('overlay-minigames').getBoundingClientRect();
      const b = [...document.querySelectorAll('#ov button')].find(x => /BEGIN/.test(x.textContent));
      const br = b && b.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), begin: !!(br && br.width && br.height) };
    }, id);
    if (vis.w && vis.h && vis.begin) say(true, `minigame "${id}" renders`, `${vis.w}×${vis.h}, BEGIN visible`);
    else flag('minigame overlay invisible', `${id}: ${vis.w}×${vis.h}, BEGIN visible=${vis.begin}`);
    await page.click('#mclose').catch(() => {});
    await page.waitForTimeout(200);
  }

  console.log('\nFLAGS:', flags.length ? flags : 'none');
  console.log('ERRORS:', errors.length ? errors.slice(0, 6) : 'none');
  await browser.close();
  process.exit(flags.length || errors.length ? 1 : 0);
})();
