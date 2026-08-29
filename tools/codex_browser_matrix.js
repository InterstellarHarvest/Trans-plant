#!/usr/bin/env node
'use strict';

const { chromium, firefox } = require('playwright');

const targets = [
  ['Chromium', chromium],
  ['Firefox', firefox],
];
const urls = (process.env.REVIEW_URLS || 'http://localhost:8177/index.html?debug=fixed_path').split(',');

(async () => {
  let failed = false;
  for (const url of urls) {
    for (const [name, browserType] of targets) {
      const browser = await browserType.launch();
      const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
      const errors = [];
      page.on('pageerror', e => errors.push('[pageerror] ' + (e.stack || e.message)));
      page.on('console', m => {
        if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('[console] ' + m.text());
      });
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForFunction(() => typeof EVENTS !== 'undefined' && Object.keys(EVENTS).length > 0);
        await page.evaluate(() => applySetupToState({
          trail: 'mars', ai: 'marv', captain: 'pilot',
          crew: ['engineer', 'botanist'], crop: 'tomato', ship: 'Browser Probe'
        }));
        await page.evaluate(() => enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001));
        await page.waitForTimeout(1200);
        await page.evaluate(() => triggerCombat({}));
        await page.waitForTimeout(120);
        const visual = await page.evaluate(() => {
          const head = document.getElementById('enc-subject-head');
          const fx = document.getElementById('combat-fx-canvas');
          const comm = document.querySelector('#screen-encounter .enc-subject-comm');
          const alertStrip = document.querySelector('#screen-encounter .combat-alert-strip');
          const overlay = document.getElementById('overlay-orders');
          return {
            clipPath: getComputedStyle(fx).clipPath,
            imageRendering: getComputedStyle(head).imageRendering,
            frameSize: getComputedStyle(head).backgroundSize,
            framePosition: getComputedStyle(head).backgroundPosition,
            commBlendMode: getComputedStyle(comm).mixBlendMode,
            alertBlendMode: getComputedStyle(alertStrip).mixBlendMode,
            combatMode: document.getElementById('screen-encounter').classList.contains('combat-mode'),
            overlayZ: getComputedStyle(overlay).zIndex,
          };
        });

        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForFunction(() => typeof EVENTS !== 'undefined' && Object.keys(EVENTS).length > 0);
        await page.evaluate(() => applySetupToState({
          trail: 'mars', ai: 'marv', captain: 'pilot',
          crew: ['engineer', 'botanist'], crop: 'tomato', ship: 'Browser Probe'
        }));
        await page.evaluate(() => openOrders());
        const ordersOpen = await page.evaluate(() => document.getElementById('overlay-orders').classList.contains('active'));
        await page.keyboard.press('Escape');
        const ordersClosed = await page.evaluate(() => !document.getElementById('overlay-orders').classList.contains('active'));
        await page.evaluate(() => openCrewDetail('engineer'));
        const crewOpen = await page.evaluate(() => document.getElementById('overlay-crew').classList.contains('active'));
        await page.keyboard.press('Escape');
        const crewClosed = await page.evaluate(() => !document.getElementById('overlay-crew').classList.contains('active'));

        await page.setViewportSize({ width: 800, height: 600 });
        await page.waitForTimeout(100);
        const resize = await page.evaluate(() => {
          const r = document.getElementById('game').getBoundingClientRect();
          return {
            left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height),
            clippedX: r.left < 0 || r.right > innerWidth,
            clippedY: r.top < 0 || r.bottom > innerHeight,
          };
        });
        console.log(JSON.stringify({ url, browser: name, visual, overlays: { ordersOpen, ordersClosed, crewOpen, crewClosed }, resize, errors }, null, 2));
        if (errors.length || !visual.combatMode || visual.clipPath === 'none' ||
            !/pixelated|crisp-edges/.test(visual.imageRendering) ||
            visual.commBlendMode !== 'multiply' || visual.alertBlendMode !== 'screen' ||
            !ordersOpen || !ordersClosed || !crewOpen || !crewClosed || resize.clippedX || resize.clippedY) failed = true;
      } catch (e) {
        failed = true;
        console.error(JSON.stringify({ url, browser: name, fatal: e.stack || e.message }, null, 2));
      }
      await browser.close();
    }
  }
  if (failed) process.exitCode = 1;
})();
