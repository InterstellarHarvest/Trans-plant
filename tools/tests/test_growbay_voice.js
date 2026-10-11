// Growbay voice: footer name/avatar/quip, Inspect read, TREAT line all
// follow STATE.activeAI; ARIA unchanged.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.stack || e.message));
  for (const ai of ['aria', 'marv', 'rex', 'chip', 'ajoy']) {
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
    await page.evaluate(a => { applySetupToState({ trail: 'mars', ai: a, captain: 'veteran', crew: ['engineer'], crop: 'tomato', ship: 'V' }); STATE.stowaway = null; }, ai);
    await page.waitForTimeout(200);
    await page.evaluate(() => openGrowbay());
    await page.waitForTimeout(400);
    const f = await page.evaluate(() => ({
      name: document.querySelector('.gb-aria-name').textContent,
      av: document.querySelector('.gb-aria-avatar').style.backgroundImage,
      text: document.getElementById('aria-text').textContent,
    }));
    const AI = ai.toUpperCase();
    ok(f.name === AI + ':' && f.av.includes('/' + ai + '.png') && f.text.length > 5, `${AI}: footer speaker + avatar + quip ("${f.text.slice(0, 50)}")`);
    ok(ai === 'chip' || ai === 'aria' || !f.text.includes('!'), `${AI}: exclamation rule holds on the footer line`);
    // TREAT with a pest, no botanist → "alone" line survives the re-render.
    await page.evaluate(() => { const real = Math.random; GSTATE_PEST: { } });
    const treat = await page.evaluate(() => {
      // reach growbay's GSTATE via the pest flag on STATE.cropGrowth (bindGrowbayState syncs it)
      STATE.cropGrowth.pest = true;
      closeGrowbay(); openGrowbay();
      openTreat();
      return { text: document.getElementById('aria-text').textContent, pest: STATE.cropGrowth.pest };
    });
    ok(/treated|neutralized/i.test(treat.text), `${AI}: TREAT line visible after treatment ("${treat.text.slice(0, 50)}")`);
    const nothing = await page.evaluate(() => { openTreat(); return document.getElementById('aria-text').textContent; });
    ok(nothing.length > 5 && !/treated/i.test(nothing) || /nothing|no hostiles/i.test(nothing), `${AI}: nothing-to-treat line ("${nothing.slice(0, 40)}")`);
    if (ai === 'aria') ok(/ARIA checked twice/.test(nothing), 'ARIA keeps her demo line');
    // Inspect read
    const ins = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button, .gb-btn, [onclick]')].find(b => /inspect/i.test(b.textContent));
      if (btn) btn.click();
      const t = document.querySelector('.ins-section-title');
      const titles = [...document.querySelectorAll('.ins-section-title')].map(x => x.textContent);
      const name = document.querySelector('.ins-aria-name');
      return { titles, name: name && name.textContent };
    });
    ok(ins.name === AI + ':' && ins.titles.some(t => t === AI + "'S READ"), `${AI}: Inspect read speaks as ${AI}`);
    await page.evaluate(() => { try { closeGrowbay(); } catch (_) {} });
  }
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\ngrowbay voice: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
