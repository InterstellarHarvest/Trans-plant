// Hunt-3 lifecycle regression: failure-continue at the destination,
// beacon can't mask a second failure, fresh crop health at the end,
// autosave after the hub's own lines, growbay/inv saves, LOAD log,
// corrupt saves.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
async function boot(trail = 'lunar') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.stack || e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  await page.evaluate(t => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: t, ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
    STATE.stowaway = null;
  }, trail);
  await page.waitForTimeout(300);
  page._errs = errs;
  return page;
}
const toPenultimate = page => page.evaluate(() => {
  const last = STATE.nodes.find(n => connectionsOf(n).length === 0);
  const prev = STATE.nodes.find(n => connectionsOf(n).some(c => (c.id || c) === last.id) || (Array.isArray(n.connects_to) && n.connects_to.includes(last.id)));
  STATE.currentId = prev.id;
  return { last: last.id, prev: prev.id };
});
const resume = async page => { await page.evaluate(() => { const n = [...nextAvailableNodes()][0]; travelTo(n, { skipEvent: true }); }); await page.waitForTimeout(400); };
const endInfo = page => page.evaluate(() => ({
  screen: document.querySelector('.screen.active').id, ended: STATE.ended,
  title: document.getElementById('end-cine-title').textContent,
  btn2: getComputedStyle(document.getElementById('end-cine-btn2')).display !== 'none' ? document.getElementById('end-cine-btn2').textContent : null,
  kind: STATE.endKind || null, cur: STATE.currentId,
}));

(async () => {
  browser = await chromium.launch();

  console.log('— failure-continue on the final leg arrives');
  for (const mode of ['beacon', 'crop']) {
    const page = await boot();
    const ids = await toPenultimate(page);
    await page.evaluate(m => {
      if (m === 'beacon') { STATE.items.push('emergency_beacon'); STATE.resources.fuel = 0.5; }
      else STATE.cropGrowth.health = 0;
      STATE.nodes.forEach(n => { n.skipEvent = true; });
    }, mode);
    await resume(page);
    const a = await endInfo(page);
    if (mode === 'beacon') {
      // Owner ruling 2026-10-10: running dry on the leg INTO the
      // destination is no failure — the ship coasts in and arrives.
      ok(a.screen === 'screen-end' && a.cur === ids.last && !a.btn2, `beacon: empty tank on the final leg arrives directly (${a.title})`);
      await page.close(); continue;
    }
    ok(a.screen === 'screen-end' && a.btn2, `${mode}: failure screen offers a way on (${a.title} / ${a.btn2})`);
    await page.click('#end-cine-btn2');
    await page.waitForTimeout(600);
    const b = await endInfo(page);
    ok(b.screen === 'screen-end' && b.cur === ids.last && b.title !== a.title, `${mode}: pressing on at the destination → arrival ending (${b.title})`);
    ok(!page._errs.length, 'no page errors' + (page._errs.length ? ': ' + page._errs.join(' | ') : ''));
    await page.close();
  }

  console.log('— beacon cannot mask a second failure');
  {
    const page = await boot('mars');
    await page.evaluate(() => { STATE.items.push('emergency_beacon'); STATE.resources.fuel = 0; STATE.resources.hull = 0; });
    await page.evaluate(() => checkFailure());
    await page.waitForTimeout(300);
    const a = await endInfo(page);
    if (a.btn2) { await page.click('#end-cine-btn2'); await page.waitForTimeout(500); }
    const b = await endInfo(page);
    ok(a.btn2 && b.screen === 'screen-end' && b.ended && b.title !== a.title, `fuel+hull both out: beacon → hull failure, not the hub (${a.title} → ${b.title})`);
    await page.close();
  }

  console.log('— crop health is current at the end');
  {
    const page = await boot();
    await toPenultimate(page);
    await page.evaluate(() => {
      Object.assign(STATE.cropGrowth, { health: 1.5, pest: true, lastTickDay: STATE.daysElapsed });
      STATE.resources.water = 0.2; STATE.nodes.forEach(n => { n.skipEvent = true; });
      STATE.flags.add('crop_death_accepted'); // isolate the arrival bracket from crop_dead
    });
    await resume(page);
    const r = await page.evaluate(() => ({ h: STATE.cropGrowth.health, b: scoreBracket() }));
    ok(r.h <= 0 && r.b === 'hollow', `final leg's crop decay counted (health ${r.h}, bracket ${r.b})`);
    await page.close();
  }

  console.log('— autosave freshness');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      showScreen('screen-cruise');
      STATE.resources.fuel = 20; STATE.resources.o2 = 10;
      renderCruise();
      const saved = JSON.parse(localStorage.getItem('transplant_save_v1'));
      return { live: JSON.stringify(STATE.aiWarnLevels), saved: JSON.stringify(saved.aiWarnLevels), liveLog: STATE.shipLog.length, savedLog: saved.shipLog.length };
    });
    ok(r.live === r.saved && r.liveLog === r.savedLog, `save matches the hub after its own lines (${r.saved} / log ${r.savedLog}=${r.liveLog})`);
    const h = await page.evaluate(() => {
      STATE.cropGrowth.growth = 100; STATE.cropGrowth.health = 80;
      openGrowbay(); doHarvest(); closeGrowbay();
      return JSON.parse(localStorage.getItem('transplant_save_v1')).cropGrowth.growth;
    });
    ok(h < 100, `harvest is in the autosave once the growbay closes (saved growth ${h})`);
    const j = await page.evaluate(() => {
      STATE.items.push('geiger_counter'); renderCruise();
      STATE.items.pop();
      document.getElementById('inv-x').click(); // ruling 42 (b4): the footer Close is gone
      return JSON.parse(localStorage.getItem('transplant_save_v1')).items.includes('geiger_counter');
    });
    ok(!j, 'inventory changes saved on close');
    await page.close();
  }

  console.log('— LOAD replaces the hub log');
  {
    const page = await boot();
    await page.evaluate(() => { showScreen('screen-cruise'); renderCruise(); saveRun(); localStorage.setItem('transplant:save:1', localStorage.getItem('transplant_save_v1')); pushCruiseLog('MARKER FROM RUN A'); });
    await page.waitForTimeout(800);
    await page.evaluate(() => loadRun('transplant:save:1'));
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => !/MARKER FROM RUN A/.test(document.getElementById('ai-log').textContent)), 'old timeline\'s log line gone after LOAD');
    await page.close();
  }

  console.log('— corrupt saves');
  {
    const page = await boot();
    const real = await page.evaluate(() => { saveRun(); return localStorage.getItem('transplant_save_v1'); });
    const bad = JSON.parse(real); bad.currentId = 'node_missing';
    for (const [name, v] of [['notjson', '{oops'], ['v2', '{"v":2}'], ['null', 'null'], ['nonodes', '{"v":1,"currentId":"x"}'], ['badcur', JSON.stringify(bad)]]) {
      const r = await page.evaluate(v => { localStorage.setItem('transplant_save_v1', v); return { has: hasSave(), left: localStorage.getItem('transplant_save_v1') }; }, v);
      ok(!r.has && r.left === null, `${name}: no Continue, save cleared`);
    }
    ok(await page.evaluate(r => { localStorage.setItem('transplant_save_v1', r); return hasSave(); }, real), 'a good save still continues');
    await page.close();
  }

  console.log(`\nhunt3c: ${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
