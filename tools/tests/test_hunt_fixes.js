// Verifies the bug-hunt fixes in the real page.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = []; page.on('pageerror', e => errs.push(e.stack || e.message));
  page.on('dialog', d => d.accept());
  const ev = (fn, a) => page.evaluate(fn, a);
  const boot = async (trail = 'mars') => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
    await ev(t => { localStorage.removeItem('transplant_save_v1'); applySetupToState({ trail: t, ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'H' }); STATE.stowaway = null; }, trail);
    await page.waitForTimeout(300);
  };
  const screen = () => ev(() => document.querySelector('.screen.active').id);
  const clickChoiceUntilHub = async () => {
    for (let i = 0; i < 12; i++) {
      if (await screen() !== 'screen-encounter') return;
      await ev(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')]; (b.find(x => /Continue/.test(x.textContent)) || b[b.length - 1]).click(); });
      await page.waitForTimeout(350);
    }
  };

  console.log('— hub after Continue + autosave');
  await boot();
  await ev(() => { document.getElementById('stop-btn').click(); }); // Stop
  await page.waitForTimeout(150);
  await ev(() => { document.getElementById('stop-btn').click(); }); // Resume → travels
  await page.waitForTimeout(600);
  let sc = await screen();
  if (sc === 'screen-encounter') await clickChoiceUntilHub();
  ok(await screen() === 'screen-cruise', 'after resolving the event, the player is back at the cruise hub');
  const st = await ev(() => ({ ev: STATE.currentEvent, id: STATE.currentId, saved: (JSON.parse(localStorage.getItem('transplant_save_v1') || '{}').currentId) }));
  ok(st.ev === null, 'currentEvent cleared at the hub');
  ok(st.saved === st.id, `autosave written at the new node (${st.saved})`);
  const day = await ev(() => STATE.daysElapsed);
  await ev(() => { document.getElementById('stop-btn').click(); }); await page.waitForTimeout(120);
  await ev(() => { document.getElementById('stop-btn').click(); }); await page.waitForTimeout(600);
  ok(await ev(d => STATE.daysElapsed > d, day), 'Resume travels on (days advance)');

  console.log('— forks');
  await boot('mars');
  const forks = await ev(() => STATE.nodes.filter(n => n.node_type === 'fork').map(n => n.id));
  ok(forks.length >= 2, `mars has ${forks.length} forks`);
  await ev(() => { STATE.flags.add('chose_alpha'); });
  await ev(f => travelTo(f), forks[1]);
  await page.waitForTimeout(500);
  ok(await ev(() => !STATE.flags.has('chose_alpha') && !STATE.flags.has('chose_beta')), 'arriving at a later fork clears the previous branch flag');
  const betaBtn = await ev(() => { const bs = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')]; const i = bs.findIndex(b => true); return EVENTS[STATE.currentEvent.id].choices.map(c => c.outcome && c.outcome.sets_flag); });
  await ev(() => { const cs = STATE.currentEvent.choices; const i = cs.findIndex(c => c.outcome && c.outcome.sets_flag === 'chose_beta' && !c.requires_crew); [...document.querySelectorAll('#enc-choices .enc-choice')][i].click(); });
  await page.waitForTimeout(400);
  await clickChoiceUntilHub();
  const nxt = await ev(() => [...nextAvailableNodes()]);
  ok(nxt.length === 1 && /beta/.test(nxt[0]), `beta pick routes to beta (${nxt})`);

  console.log('— stuck fork');
  await boot('mars');
  await ev(() => { const f = STATE.nodes.find(n => n.node_type === 'fork'); STATE.currentId = f.id; STATE.flags.delete('chose_alpha'); STATE.flags.delete('chose_beta'); returnToHub(); });
  await page.waitForTimeout(200);
  await ev(() => { document.getElementById('stop-btn').click(); }); await page.waitForTimeout(120);
  await ev(() => { document.getElementById('stop-btn').click(); }); await page.waitForTimeout(500);
  ok(await screen() === 'screen-encounter' && await ev(() => (STATE.currentEvent.node_type || []).includes('fork')), 'Resume at an unresolved fork fires a fork event (no dead end)');

  console.log('— ESC / keys');
  await boot();
  await ev(() => openFabricator()); await page.waitForTimeout(300);
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok(await ev(() => !document.getElementById('overlay-fabricator').classList.contains('active') && !document.body.classList.contains('pause-open')), 'ESC closes the fabricator (no pause on top)');
  const before = await ev(() => ({ d: STATE.daysElapsed, m: JSON.stringify(STATE.materials) }));
  await ev(() => openGrowbay()); await page.waitForTimeout(300);
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  const after = await ev(() => ({ d: STATE.daysElapsed, m: JSON.stringify(STATE.materials) }));
  ok(after.d === before.d && after.m === before.m, 'Enter in the growbay does not craft in the hidden fabricator');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  for (const [btn, ov] of [['#inv-btn, [onclick*="Inventory"], .panel-btn.inv', 'overlay-inventory']]) {}
  await ev(() => showOverlay('overlay-inventory')); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(await ev(() => !document.getElementById('overlay-inventory').classList.contains('active') && !document.body.classList.contains('pause-open')), 'ESC closes inventory instead of opening pause');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(await ev(() => document.body.classList.contains('pause-open')), 'ESC on the bare hub still opens pause');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);

  console.log('— engine repair hotspot');
  await boot();
  await ev(() => openEngineRepair(() => {})); await page.waitForTimeout(800);
  const hs = await ev(() => { const el = [...document.querySelectorAll('#engrepair-root [data-comp="switches"], #engrepair-root .er-hotspot')].find(e => /switch/i.test(e.id + e.className + (e.dataset.comp || ''))); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (hs) {
    const topEl = await ev(p => { const e = document.elementFromPoint(p.x, p.y); return e && (e.id + ' ' + e.className); }, hs);
    await page.mouse.click(hs.x, hs.y); await page.waitForTimeout(400);
    ok(!/er-end-choices/.test(topEl) && await ev(() => /IGNITION/i.test(document.getElementById('er-ai-text').textContent + document.body.innerText) ), `ignition hotspot takes the click (top element: ${topEl})`);
  } else ok(false, 'could not locate the switches hotspot');
  await ev(() => document.getElementById('er-ec-abandon').click());

  console.log('— load teardown');
  await boot();
  await ev(() => saveRun());
  await ev(() => { openMinigame('scan', {}, () => { window.__leak = true; }); document.body.classList.add('stop-active'); });
  await page.waitForTimeout(200);
  await ev(() => loadRun());
  await page.waitForTimeout(200);
  ok(await ev(() => !document.querySelector('#game .overlay.active') && !document.body.classList.contains('stop-active')), 'loadRun closes open overlays and the stop menu');

  console.log('— quit');
  await boot();
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  const quitOk = await ev(() => { const b = [...document.querySelectorAll('#pause-overlay *')].find(x => /^\s*QUIT/i.test(x.textContent) && x.children.length === 0); if (b) { b.click(); return true; } return false; });
  await page.waitForTimeout(300);
  await ev(() => { const c = document.querySelector('#pause-overlay [data-act="confirm"]'); if (c) c.click(); });
  await page.waitForTimeout(1500);
  ok(quitOk && (await page.title()) !== '' && !/404|Error/.test(await page.content().then(t => t.slice(0, 400))) && await ev(() => !!document.getElementById('screen-title')), 'pause QUIT returns to the game title (no 404)');

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\nhunt fixes: ${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
