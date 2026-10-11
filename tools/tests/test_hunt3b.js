// Hunt-3 minigame/growbay regression: salvage pays once, X in an end
// beat delivers the result, mining LEAVE keeps the haul, brace tap,
// dead-crop harvest, treat lock, ESC pauses, stall-safe timers.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
async function boot() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.stack || e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  await page.evaluate(() => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
    STATE.stowaway = null;
  });
  await page.waitForTimeout(300);
  page._errs = errs;
  return page;
}
async function clickEl(page, sel) { const b = await page.locator(sel).first().boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
async function stowOne(page) {
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    const st = await page.locator('#sal-stage').boundingBox();
    for (const it of await page.$$('.sal-item:not(.stowed)')) {
      const b = await it.boundingBox(); if (!b) continue;
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      if (cx < st.x + 5 || cx > st.x + st.width - 5 || cy < st.y + 5 || cy > st.y + st.height - 5) continue;
      await page.mouse.move(cx, cy); await page.mouse.down();
      await page.mouse.move(st.x + 0.515 * st.width, st.y + 0.86 * st.height, { steps: 4 });
      await page.waitForTimeout(60); await page.mouse.up();
      await page.waitForTimeout(200);
      if ((await page.textContent('#sal-count')).trim().startsWith('1')) return true;
    }
    await page.waitForTimeout(150);
  }
  return false;
}

(async () => {
  browser = await chromium.launch();

  console.log('— salvage: tile reveal + ✕ pays once');
  {
    const page = await boot();
    await page.evaluate(() => { window.__res = []; openMinigame('salvage', {}, (t, p) => window.__res.push([t, p])); });
    await page.waitForTimeout(300); await clickEl(page, '#rstart');
    const stowed = await stowOne(page);
    await page.waitForSelector('#sal-close', { state: 'visible', timeout: 40000 });
    await page.waitForTimeout(300);
    await clickEl(page, '.sal-haul-tile');
    await page.waitForTimeout(250);
    const inv = await page.$$eval('.sal-inv-tile', ts => Object.fromEntries(ts.map(t => [t.dataset.key, +t.querySelector('.sal-inv-badge').textContent.replace(/\D/g, '') || 1])));
    await clickEl(page, '#mclose');
    await page.waitForTimeout(500);
    const res = await page.evaluate(() => window.__res);
    ok(stowed && res.length === 1 && res[0][0] !== 'abandoned', `one hand-off, not abandoned (${JSON.stringify(res.map(r => r[0]))})`);
    ok(res[0] && JSON.stringify(res[0][1].salvage) === JSON.stringify(inv), `payload = what the reveal showed (${JSON.stringify(res[0] && res[0][1].salvage)} vs ${JSON.stringify(inv)})`);
    await page.close();
  }

  console.log('— salvage: ✕ during the end flash keeps the run');
  {
    const page = await boot();
    await page.evaluate(() => { window.__res = []; openMinigame('salvage', {}, (t, p) => window.__res.push([t, p])); });
    await page.waitForTimeout(300); await clickEl(page, '#rstart');
    await stowOne(page);
    await page.waitForSelector('.sal-depleted', { timeout: 40000 });
    await clickEl(page, '#mclose');
    await page.waitForTimeout(3500);
    const res = await page.evaluate(() => window.__res);
    ok(res.length === 1 && res[0][0] !== 'abandoned' && res[0][1] && Object.keys(res[0][1].salvage).length > 0, `✕ in TIME'S UP/DEPLETED beat → haul delivered (${JSON.stringify(res)})`);
    ok(await page.evaluate(() => !document.getElementById('overlay-minigames').classList.contains('active')), 'overlay closed after delivery');
    await page.close();
  }

  console.log('— brace / scan end beats');
  {
    const page = await boot();
    await page.evaluate(() => { window.__res = null; openMinigame('brace', {}, t => window.__res = t); });
    await page.waitForTimeout(200); await clickEl(page, '#rstart'); await page.waitForTimeout(100);
    const b = await page.locator('#bbrtn').boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
    await page.waitForTimeout(8500);
    const tier = await page.evaluate(() => document.querySelector('#rtier').textContent);
    ok(tier === 'INSUFFICIENT', `brace: one 80ms tap scores poor (${tier})`);
    await clickEl(page, '#rbquit');
    // ✕ during the brace's 750ms end beat → result, not abandoned
    await page.evaluate(() => { window.__res = null; openMinigame('brace', {}, t => window.__res = t); });
    await page.waitForTimeout(200); await clickEl(page, '#rstart');
    await page.waitForFunction(() => /end-/.test(document.getElementById('bbrtn').className), null, { timeout: 12000 });
    await clickEl(page, '#mclose');
    await page.waitForTimeout(1200);
    ok(await page.evaluate(() => window.__res && window.__res !== 'abandoned'), `✕ during brace end beat delivers the result (${await page.evaluate(() => window.__res)})`);
    await page.close();
  }

  console.log('— mining: MINE AGAIN → LEAVE keeps the haul');
  {
    const page = await boot();
    await page.evaluate(() => { window.__res = []; STATE.materials = {}; openMining(h => window.__res.push(h.inventory)); });
    await page.waitForTimeout(500);
    await clickEl(page, '.crew-chip'); await clickEl(page, '#mining-choices .enc-choice:not(.leave)');
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      const st = await page.locator('#mining-stage').boundingBox();
      for (const a of (await page.$$('#mining-stage .mine-asteroid')).slice(0, 3)) {
        const b = await a.boundingBox(); if (!b) continue;
        const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
        if (cx > st.x + 10 && cx < st.x + st.width - 10 && cy > st.y + 10 && cy < st.y + st.height - 10) { await page.mouse.click(cx, cy); await page.waitForTimeout(120); }
      }
      await page.waitForTimeout(100);
    }
    await clickEl(page, '#mining-choices .enc-choice.leave');
    await page.waitForTimeout(600);
    await page.locator('.haul-btn', { hasText: 'MINE AGAIN' }).click();
    await page.waitForTimeout(400);
    await page.locator('#mining-choices .enc-choice.leave').click();
    await page.waitForTimeout(400);
    const inv = await page.evaluate(() => window.__res[0] || {});
    ok(Object.values(inv).reduce((a, b) => a + b, 0) > 0, `LEAVE after a run banks it (${JSON.stringify(inv)})`);
    await page.close();
  }

  console.log('— growbay');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      STATE.cropGrowth.growth = 100; STATE.cropGrowth.health = 0; STATE.resources.food = 20;
      openGrowbay();
      const locked = document.getElementById('harvest-btn').classList.contains('locked');
      doHarvest();
      const treatLockedNoPest = document.getElementById('treat-btn').classList.contains('locked');
      return { locked, food: STATE.resources.food, treatLockedNoPest };
    });
    ok(r.locked && r.food === 20, `dead crop: harvest locked, no food (${JSON.stringify(r)})`);
    const t = await page.evaluate(() => {
      closeGrowbay && closeGrowbay();
      STATE.cropGrowth.growth = 40; STATE.cropGrowth.health = 60; STATE.cropGrowth.pest = false; STATE.resources.water = 0;
      openGrowbay();
      const dry = document.getElementById('treat-btn').classList.contains('locked');
      if (window.closeGrowbay) closeGrowbay();
      STATE.cropGrowth.pest = true; openGrowbay();
      const pest = document.getElementById('treat-btn').classList.contains('locked');
      return { dry, pest };
    }).catch(e => ({ err: e.message }));
    ok(t.dry === true && t.pest === false, `treat locked unless pests (${JSON.stringify(t)})`);
    await page.close();
  }

  console.log('— ESC pauses a minigame; no save mid-game; stall-safe timer');
  {
    const page = await boot();
    await page.evaluate(() => { openMinigame('scan', {}, () => {}); });
    await page.waitForTimeout(200); await clickEl(page, '#rstart'); await page.waitForTimeout(500);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(await page.evaluate(() => document.body.classList.contains('pause-open')), 'ESC mid-scan opens the pause menu');
    ok(await page.evaluate(() => saveRun() === false), 'saveRun refuses mid-minigame');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const w0 = await page.evaluate(() => parseFloat(document.getElementById('scan-tb').style.width));
    await page.evaluate(() => { const t = performance.now(); while (performance.now() - t < 3000); });
    await page.waitForTimeout(200);
    const w1 = await page.evaluate(() => parseFloat(document.getElementById('scan-tb').style.width));
    ok(w0 - w1 < 8, `a 3s stall doesn't eat the timer (${w0.toFixed(1)}% → ${w1.toFixed(1)}%)`);
    ok(!page._errs.length, 'no page errors' + (page._errs.length ? ': ' + page._errs.join(' | ') : ''));
    await page.close();
  }

  console.log(`\nhunt3b: ${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
