// Integrator fixes from the 2026-10-12 hardening session that no other
// battery pins: the wounded captain's half hands on the fabricator (the rule
// every other hands-on job follows).
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && window.openFabricator);

  console.log('— fabricator: a wounded captain\'s hands count half');
  // Solo captain (no crew help), a non-engineer background: the captain's
  // hands are the whole effort, so a wound doubles the craft time.
  const craft = hp => page.evaluate(hp => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: [], crop: 'wheat', ship: 'D' });
    STATE.stowaway = null; returnToHub();
    STATE.captainHP = hp;
    STATE.materials = { metal: 20, scrap: 20, minerals: 10, biocomponent: 10 };
    STATE.fabricator.wear = 0;
    window.fabSetDayMs(60000);
    openFabricator();
    const row = [...document.querySelectorAll('.fb-recipe-row')].find(x => x.textContent.includes('Field Repair Kit'));
    row.click();
    const time = (document.querySelector('#fb-detail') || document.body).innerText.match(/TIME\s*(\d+)d/);
    craftSelected();
    const c = window.fabCraftState();
    const days = c && c.daysTotal;
    cancelCraft();
    return { days, preview: time ? +time[1] : null };
  }, hp);
  const well = await craft(100), hurt = await craft(30);
  ok(well.days >= 1 && hurt.days === well.days * 2, `wounded: ${well.days}d → ${hurt.days}d (the hands count 5, not 10)`);
  ok(hurt.preview === hurt.days, `the TIME preview says what CRAFT charges (${hurt.preview}d = ${hurt.days}d)`);

  ok(!errors.length, 'no page errors ' + JSON.stringify(errors.slice(0, 2)));
  console.log(`b5_int: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
