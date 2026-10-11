// planted / harvested / ship_computer_crop_comments now reach the log.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.stack || e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  await page.evaluate(() => { applySetupToState({ trail: 'mars', ai: 'rex', captain: 'veteran', crew: ['engineer'], crop: 'soybean', ship: 'C' }); STATE.stowaway = null; });
  await page.waitForTimeout(400);
  const logText = () => page.evaluate(() => (STATE.shipLog || []).map(e => (typeof e === 'string' ? e : e.text)).join('\n'));
  const pool = await page.evaluate(() => ({
    planted: MOD.flavor.ai_universal.crop_lifecycle.planted.rex,
    harvested: MOD.flavor.ai_universal.crop_lifecycle.harvested.rex,
    soy: MOD.flavor.ship_computer_crop_comments.soybean,
  }));
  ok(pool.planted.length === 5 && pool.harvested.length === 5 && pool.soy.length === 5, 'pools at 5 lines');
  let log = await logText();
  ok(pool.planted.some(l => log.includes(l)), 'launch: REX "planted" line in the log');
  ok(await page.evaluate(() => STATE.flags.has('ai_noted_crop_planted')), 'planted flag armed');
  await page.evaluate(() => renderCruise());
  log = await logText();
  ok(pool.planted.filter(l => log.split(l).length > 2).length === 0, 'planted line not repeated on re-render');
  // Harvest via the real growbay button.
  await page.evaluate(() => { STATE.cropGrowth.growth = 100; openGrowbay(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => doHarvest());
  await page.waitForTimeout(200);
  log = await logText();
  ok(pool.harvested.some(l => log.includes(l)), 'harvest: REX "harvested" line in the log');
  ok(await page.evaluate(() => !STATE.flags.has('ai_noted_crop_planted')), 'harvest re-arms planted');
  await page.evaluate(() => { closeGrowbay(); });
  // Ambient: force the ambient branch and the crop-comment roll.
  const got = await page.evaluate(() => {
    const real = Math.random; let n = 0; Math.random = () => (n++ % 2 === 0 ? 0.1 : 0.1);
    try { STATE.lastAmbientNode = null; const node = STATE.byId[STATE.currentId]; const t = node.node_type; node.node_type = 'fork'; renderCruise(); node.node_type = t; } finally { Math.random = real; }
    return (STATE.shipLog || []).map(e => (typeof e === 'string' ? e : e.text)).slice(-3).join('\n');
  });
  ok(pool.soy.some(l => got.includes(l)), 'ambient roll can surface a ship-computer soybean comment');
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\ncrop pools: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
