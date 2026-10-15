// First-run tips (ruling 87): the AI says one tip in its own voice at the
// first new stop where a topic applies; the most urgent first, then the
// introductions one stop at a time; each once per run (saved); the pause
// menu's SHOW TIPS switch silences them.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const TOPICS = ['treat', 'wounded', 'supplies_low', 'morale_low', 'harvest', 'station', 'fabricator', 'fork', 'cargo', 'stop_menu', 'orders', 'growbay', 'map'];
const AIS = ['aria', 'marv', 'rex', 'chip', 'ajoy'];
(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.flavor && typeof applySetupToState === 'function');
  await page.evaluate(() => localStorage.removeItem('transplant:settings'));

  console.log('— the lines');
  const lines = await page.evaluate(({ TOPICS, AIS }) => {
    const t = MOD.flavor.ai_universal.tips || {};
    return TOPICS.map(k => [k, AIS.filter(a => !(t[k] && Array.isArray(t[k][a]) && t[k][a].length && t[k][a][0].trim())), AIS.filter(a => ['marv', 'rex', 'ajoy'].includes(a) && t[k] && /!/.test((t[k][a] || [''])[0]))]);
  }, { TOPICS, AIS });
  for (const [k, missing, loud] of lines) ok(!missing.length && !loud.length, `${k}: a line for every AI (missing ${missing.join(',') || 'none'}), MARV/REX/AJOY without "!"`);

  // A clean run on the cruise screen; step to the next stop and render, as play does.
  const fresh = (ai) => page.evaluate(ai => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai, captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'B' });
    STATE.flags.add('departed'); STATE.items = []; STATE.materials = {};
    for (const k of Object.keys(STATE.resources)) STATE.resources[k] = 90;
    for (const r of STATE.crew) setCrewMorale(70, r);
    STATE.cropGrowth.growth = 20; STATE.cropGrowth.health = 80; STATE.cropGrowth.pest = false;
    STATE.visited = new Set([STATE.nodes[0].id]); STATE.currentId = STATE.nodes[0].id; STATE.lastAmbientNode = STATE.currentId;
    showScreen('screen-cruise');
  }, ai);
  const step = () => page.evaluate(() => {
    // The next plain stop (not a fork or station), so only the intended topic applies.
    const id = STATE.nodes.find(n => !STATE.visited.has(n.id) && !['fork', 'station'].includes(n.node_type) && n !== STATE.nodes[STATE.nodes.length - 1]).id;
    STATE.visited.add(id); STATE.currentId = id;
    const before = STATE.shipLog.length; renderCruise();
    const added = STATE.shipLog.slice(before).filter(e => e.voice);
    return { shown: (STATE.tipsShown || []).slice(), said: added.map(e => e.text) };
  });

  console.log('— the welcome at departure, then one introduction per stop, in order');
  await fresh('marv');
  const start = await page.evaluate(() => (STATE.tipsShown || []).slice());
  ok(JSON.stringify(start) === '["stop_menu"]', `the departure stop says the welcome first (${start})`);
  const steps = [];
  for (let i = 0; i < 6; i++) steps.push(await step());
  const final = steps[steps.length - 1].shown;
  const intro = ['stop_menu', 'orders', 'growbay', 'map'];
  const order = final.filter(t => intro.includes(t));
  ok(JSON.stringify(order) === JSON.stringify(intro), `introductions in order: ${order.join(' → ')} (all: ${final.join(', ')})`);
  ok(new Set(final).size === final.length, 'no topic twice');
  let prev = start.length, oneAtATime = true;
  for (const r of steps) { if (r.shown.length - prev > 1) oneAtATime = false; prev = r.shown.length; }
  ok(oneAtATime, 'at most one tip per stop');
  const marv = await page.evaluate(() => MOD.flavor.ai_universal.tips.orders.marv[0]);
  ok(steps.some(r => r.said.some(t => t.includes(marv))), "each tip is the active AI's own line (MARV's Orders tip)");

  console.log('— an urgent problem comes first, once');
  await fresh('aria');
  await page.evaluate(() => { STATE.cropGrowth.pest = true; });
  const u1 = await step(), u2 = await step();
  const treat = await page.evaluate(() => MOD.flavor.ai_universal.tips.treat.aria[0]);
  ok(u1.shown.slice(-1)[0] === 'treat' && u1.said.some(t => t.includes(treat)), `pests: the TREAT tip at the next stop (${u1.shown})`);
  ok(u2.shown.filter(x => x === 'treat').length === 1 && u2.shown.length === u1.shown.length + 1, `next stop: another tip, treat once (${u2.shown})`);

  console.log('— saved with the run');
  const saved = await page.evaluate(() => { saveRun(); const shown = JSON.parse(localStorage.getItem('transplant_save_v1')).tipsShown; STATE.tipsShown = []; loadRun(); return { shown, back: STATE.tipsShown }; });
  ok(saved.shown.length === 3 && saved.shown.includes('treat') && JSON.stringify(saved.back) === JSON.stringify(saved.shown), `the save keeps the tips shown (${JSON.stringify(saved.back)})`);

  console.log('— SHOW TIPS off');
  await page.evaluate(() => tpSaveSettings({ showTips: false }));
  await fresh('rex');
  const off0 = await page.evaluate(() => (STATE.tipsShown || []).length);
  const off = await step();
  const allTips = await page.evaluate(() => Object.entries(MOD.flavor.ai_universal.tips).filter(([k]) => k !== '_note').flatMap(([, v]) => Object.values(v).flat()));
  ok(off0 === 0 && off.shown.length === 0 && !off.said.some(t => allTips.some(l => t.includes(l))), `switched off: no tip at departure or the next stop (other AI lines may still speak: ${off.said.length})`);
  await page.evaluate(() => tpSaveSettings({ showTips: true }));
  const on = await step();
  ok(on.shown.length === 1 && on.shown[0] === 'stop_menu', `switched back on: the next stop says the welcome (${on.shown})`);

  console.log('— the pause menu switch');
  const pm = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(200);
    const tab = [...document.querySelectorAll('.pause-overlay button, .pause-nav button, [data-panel]')].find(b => /SETTINGS/.test(b.textContent));
    if (tab) tab.click(); await wait(200);
    const t = document.querySelector('.pause-toggle[data-field="showTips"]');
    if (!t) return { found: false };
    const before = t.textContent; t.click(); const after = t.textContent; const stored = tpLoadSettings().showTips; t.click();
    return { found: true, before, after, stored, restored: tpLoadSettings().showTips };
  });
  ok(pm.found && pm.before === 'ON' && pm.after === 'OFF' && pm.stored === false && pm.restored === true, `SHOW TIPS in the pause menu: ${JSON.stringify(pm)}`);

  ok(!errors.length, 'page errors: ' + errors.join(' | '));
  console.log(`\ntips: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
