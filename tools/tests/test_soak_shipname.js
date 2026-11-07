// Clicker soak finding (2026-11-06): the pause menu's SAVE / LOAD slot list
// wrote the ship's name into the page as HTML, so a name with markup in it
// (<b>, <img …>) became real elements there. The name is the player's own
// text: every place it is shown must show it as text. Checks the slot list
// (SAVE and LOAD), the cruise header, the Ship's Log and a wreck
// event that names a lost ship from an earlier run.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const NAME = '<i data-inj>Bad</i> & <b>Co';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor && typeof enterEvent === 'function');
  await page.evaluate(n => {
    localStorage.removeItem('transplant_save_v1');
    for (let i = 1; i <= 3; i++) localStorage.removeItem('transplant_slot_' + i);
    // a lost ship from an earlier run with the same name, for the wreck event
    localStorage.setItem('transplant_records_v1', JSON.stringify({ runs: [{ id: '999:1', kind: 'failure', tone: 'hull_zero', ship: n, crop: 'wheat', captain: 'pilot', trail: 'mars', days: 9, baseDays: 100, crew: 1, startCrew: 2, title: 'LOST', ts: Date.now() }], best: {} }));
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['pilot', 'engineer'], crop: 'wheat', ship: n });
    STATE.stowaway = null; returnToHub(); saveRun();
  }, NAME);
  await page.waitForTimeout(500);
  const injected = () => page.evaluate(() => document.querySelectorAll('[data-inj]').length);

  ok(await injected() === 0 && /<I DATA-INJ>BAD<\/I>/.test(await page.evaluate(() => document.getElementById('cruise-ship-name').textContent)), 'cruise header shows the name as text');

  // Pause → SAVE: write slot 1, the list then names the ship
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  const item = async re => { for (const b of await page.$$('button.pause-item')) if (re.test(await b.textContent())) { await b.click(); return true; } return false; };
  ok(await item(/SAVE/), 'pause menu offers SAVE');
  await page.waitForTimeout(400);
  await page.click('[data-act="save"]'); await page.waitForTimeout(500);
  const slot = await page.evaluate(() => { const m = document.querySelector('.pause-slot-meta'); return m ? m.textContent : ''; });
  ok(await injected() === 0, 'SAVE slot list: the name makes no elements');
  ok(slot.startsWith('<I DATA-INJ>BAD</I> & <B>CO · MARS · DAY'), 'SAVE slot list shows the name as typed — ' + slot.slice(0, 50));
  // back out to the menu, then LOAD lists the same slots
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  if (!(await page.evaluate(() => document.body.classList.contains('pause-open')))) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  ok(await item(/LOAD/), 'pause menu offers LOAD');
  await page.waitForTimeout(400);
  ok(await injected() === 0 && /^<I DATA-INJ>/.test(await page.evaluate(() => (document.querySelector('.pause-slot-meta') || {}).textContent || '')), 'LOAD slot list shows the name as text');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.evaluate(() => { if (typeof PauseMenu !== 'undefined' && PauseMenu.close) PauseMenu.close(); });
  await page.waitForTimeout(300);

  // Ship's Log header
  await page.evaluate(() => { if (typeof openShipsLog === 'function') openShipsLog(); else document.getElementById('btn-log') && document.getElementById('btn-log').click(); });
  await page.waitForTimeout(500);
  ok(await injected() === 0 && /^<I DATA-INJ>/.test(await page.evaluate(() => (document.getElementById('slog-meta') || {}).textContent || '')), "Ship's Log header shows the name as text");

  // Wreck event: {wreck.ship} is the earlier run's name
  await page.evaluate(() => { document.querySelectorAll('.overlay.active').forEach(o => hideOverlay(o.id)); document.body.classList.remove('modal-open');
    const n = STATE.nodes.find(x => x.node_type === 'derelict') || STATE.nodes[1]; enterEvent(n, EVENTS['event_voyage_thin_001']); });
  await page.waitForTimeout(600);
  await page.evaluate(() => { if (typeof finishDelivery === 'function') finishDelivery(); });
  await page.waitForFunction(() => /data-inj/i.test(document.getElementById('enc-narr-body').textContent), null, { timeout: 30000 }).catch(() => {});
  ok(await injected() === 0 && /<i data-inj>Bad<\/i> & <b>Co broke apart/.test(await page.evaluate(() => document.getElementById('enc-narr-body').textContent)), 'wreck event names the lost ship as text');

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
