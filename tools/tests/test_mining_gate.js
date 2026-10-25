// MINE with crew aboard: BEGIN MINING stays shut until a crew assist is
// picked (a disabled button used to start the run anyway); flying solo it
// starts at once.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const open = async crew => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && typeof window.openMining === 'function');
    await page.evaluate(crew => {
      localStorage.removeItem('transplant_save_v1');
      applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew, crop: 'wheat', ship: 'Gate' });
      STATE.stowaway = null;
      const n = STATE.nodes.find(x => x.node_type !== 'fork' && x.node_type !== 'station' && x.id !== STATE.nodes[0].id);
      n.node_type = 'asteroid_field'; STATE.currentId = n.id; returnToHub();
      window.openMining(() => {});
    }, crew);
    await page.waitForTimeout(600);
    return page;
  };
  const begin = page => page.evaluate(() => [...document.querySelectorAll('#mining-choices .enc-choice')].find(b => /BEGIN MINING/.test(b.textContent)));
  const state = page => page.evaluate(() => {
    const b = [...document.querySelectorAll('#mining-choices .enc-choice')].find(x => /BEGIN MINING/.test(x.textContent));
    return { begin: !!b, disabled: !!(b && b.classList.contains('disabled')), exit: [...document.querySelectorAll('#mining-choices .enc-choice')].some(x => /EXIT MINING/.test(x.textContent)) };
  });
  const clickBegin = page => page.evaluate(() => { const b = [...document.querySelectorAll('#mining-choices .enc-choice')].find(x => /BEGIN MINING/.test(x.textContent)); if (b) b.click(); });

  console.log('— with crew aboard');
  {
    const page = await open(['engineer', 'medic']);
    const s0 = await state(page);
    ok(s0.begin && s0.disabled, 'BEGIN MINING starts disabled until an assist is picked');
    await clickBegin(page); await page.waitForTimeout(300);
    const s1 = await state(page);
    ok(s1.begin && !s1.exit, 'clicking it while disabled does not start the run');
    await page.evaluate(() => document.querySelector('#mining-choices .crew-chip').click());
    await page.waitForTimeout(150);
    ok(!(await state(page)).disabled, 'picking an assist enables it');
    await clickBegin(page); await page.waitForTimeout(300);
    ok((await state(page)).exit, 'then BEGIN MINING starts the run');
    await page.evaluate(() => window.abortMining && abortMining());
    await page.close();
  }
  console.log('— flying solo');
  {
    const page = await open([]);
    const s0 = await state(page);
    ok(s0.begin && !s0.disabled, 'no crew to pick: BEGIN MINING is enabled');
    await clickBegin(page); await page.waitForTimeout(300);
    ok((await state(page)).exit, 'and starts the run');
    await page.evaluate(() => window.abortMining && abortMining());
    await page.close();
  }
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\nmining gate: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
