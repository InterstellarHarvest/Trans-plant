#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');

const BASE_URL = process.env.REVIEW_URL || 'http://localhost:8177/index.html?debug=codex_player';
const trails = ['lunar', 'mars', 'interstellar'];
const pace = process.env.REVIEW_PACE || 'ridiculous';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + (e.stack || e.message)));
  page.on('console', m => {
    if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('[console] ' + m.text());
  });
  page.on('dialog', d => d.accept());

  for (const trail of trails) {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof EVENTS !== 'undefined' && Object.keys(EVENTS).length > 0);
    await page.evaluate(t => applySetupToState({
      trail: t, ai: 'marv', captain: 'pilot',
      crew: ['engineer', 'botanist'], crop: 'sweet_potato', ship: 'Cold Review'
    }), trail);
    await page.evaluate(p => { STATE.orders.pace = p; renderCruise(); }, pace);

    const visitedEvents = new Set();
    for (let step = 0; step < 500; step++) {
      const state = await page.evaluate(() => ({
        screen: (document.querySelector('.screen.active') || {}).id,
        event: STATE.currentEvent && STATE.currentEvent.id,
        ended: STATE.ended,
        combat: document.getElementById('screen-encounter').classList.contains('combat-mode'),
        overlays: [...document.querySelectorAll('.overlay.active')].map(o => o.id),
      }));
      if (state.event) visitedEvents.add(state.event);
      if (state.ended || state.screen === 'screen-end') break;

      if (state.overlays.length) {
        const closed = await page.evaluate(() => {
          const ov = [...document.querySelectorAll('.overlay.active')].pop();
          if (!ov) return true;
          const buttons = [...ov.querySelectorAll('button, [role=button], .enc-choice')].filter(b => b.offsetParent !== null);
          const exit = buttons.find(b => /leave|abandon|return|close|done|cancel|step back/i.test(b.textContent));
          if (exit) { exit.click(); return true; }
          return false;
        });
        if (!closed) await page.keyboard.press('Escape');
        await page.waitForTimeout(350);
        continue;
      }

      if (state.screen === 'screen-cruise') {
        await page.click('#stop-btn');
        await page.waitForTimeout(80);
        await page.click('#stop-btn');
        await page.waitForTimeout(350);
        continue;
      }

      if (state.screen === 'screen-encounter') {
        if (state.combat) {
          const acted = await page.evaluate(() => {
            const bs = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')].filter(b => b.offsetParent !== null);
            const preferred = bs.find(b => /attempt escape|accept surrender|stand down/i.test(b.textContent));
            if (preferred) { preferred.click(); return true; }
            const abortOnly = bs.length && bs.every(b => /abort ftl/i.test(b.textContent));
            if (abortOnly) return false;
            if (bs[0]) { bs[0].click(); return true; }
            return false;
          });
          await page.waitForTimeout(acted ? 500 : 900);
        } else {
          await page.waitForTimeout(320);
          await page.evaluate(() => {
            const bs = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')].filter(b => b.offsetParent !== null);
            if (bs.length) bs[bs.length - 1].click();
          });
          await page.waitForTimeout(380);
        }
        continue;
      }
      await page.waitForTimeout(250);
    }

    const result = await page.evaluate(() => ({
      screen: (document.querySelector('.screen.active') || {}).id,
      ended: STATE.ended,
      days: STATE.daysElapsed,
      resources: STATE.resources,
      crew: STATE.crew.slice(),
      items: STATE.items.slice(),
    }));
    console.log(JSON.stringify({ trail, pace, result, distinctEvents: visitedEvents.size }, null, 2));
    if (!result.ended || result.screen !== 'screen-end') process.exitCode = 1;
  }

  console.log('ERRORS:', errors.length ? errors : 'none');
  if (errors.length) process.exitCode = 1;
  await browser.close();
})().catch(err => {
  console.error(err.stack || err);
  process.exitCode = 1;
});
