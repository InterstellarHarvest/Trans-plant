const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
(async () => {
  const b = await chromium.launch(); const page = await b.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items);
  for (const ai of ['marv', 'ajoy']) {
    const r = await page.evaluate(ai => {
      localStorage.clear(); applySetupToState({ trail: 'mars', ai, captain: 'academic', crew: ['engineer','pilot'], crop: 'wheat', ship: 'D' });
      const ev = Object.values(EVENTS).find(e => JSON.stringify(e).includes('"item_grant":["'));
      enterEvent(STATE.byId[STATE.currentId], ev);
      const shown = document.querySelector('.screen.active').id;
      const btn = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')][0]; btn && btn.click();
      return { ev: ev.id, shown, choices: document.querySelectorAll('#enc-choices .enc-choice').length };
    }, ai);
    console.log(ai, JSON.stringify(r));
  }
  console.log('errors:', errs.length ? errs : 'none');
  await b.close(); process.exit(errs.length ? 1 : 0);
})();