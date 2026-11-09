// Ruling 147: a choice's hover box warns, in red, when the days it takes
// would run out food, water or air, or when a supply already gone would end
// the run before they are up. Event choices (the Adrift waits above all),
// Stop-menu jobs and a wait's day steps. The figures follow passDays: the
// stock lasts floor(stock / draw) days; only a supply already at 0 can end
// the run within a span (the onset grace).
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && typeof enterEvent === 'function' && EVENTS.event_adrift_001 && window.Tooltip);

  const fresh = (o, dep) => page.evaluate(([o, dep]) => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['pilot', 'engineer'], crop: 'wheat', ship: 'Q' });
    STATE.stowaway = null; STATE.items = [];
    returnToHub();
    Object.assign(STATE.resources, o || {});
    STATE.deprived = dep || {};
  }, [o, dep]);
  const adrift = async () => {
    await page.evaluate(() => { STATE.resources.fuel = 0; openAdrift(); });
    await page.waitForTimeout(400); await page.evaluate(() => finishAllTyping()); await page.waitForTimeout(600);
  };
  const specOf = re => page.evaluate(src => {
    const b = [...document.querySelectorAll('#enc-choices .enc-choice[data-tip-choice], #stop-choices .stop-choice[data-tip-choice]')].find(x => new RegExp(src).test(x.textContent));
    return b ? JSON.parse(b.dataset.tipChoice) : null;
  }, re);
  const draw = () => page.evaluate(() => dailyDraw());

  console.log('— plenty aboard: no warning');
  await fresh({ food: 90, water: 90, o2: 90 });
  await adrift();
  let s = await specOf('CALL FOR HELP');
  ok(s && s.time && s.time.hi === 10 && !(s.warn && s.warn.length), 'CALL FOR HELP (5–10 days) with full tanks says nothing extra');

  console.log('— water that will not last the wait');
  const d = await draw();
  const water = Math.round(d.water * 4.5 * 100) / 100; // lasts exactly 4 days
  await fresh({ food: 90, water, o2: 90 });
  await adrift();
  s = await specOf('CALL FOR HELP');
  ok(s && (s.warn || []).some(w => /^Water runs out after 4 days\./.test(w)), 'warns: ' + JSON.stringify(s && s.warn));
  ok(!(s.warn || []).some(w => /ends the run/.test(w)), 'running out within the wait does not claim it ends the run (the onset grace)');
  s = await specOf('BURN THE HULL');
  ok(!(s && s.warn && s.warn.length), 'BURN THE HULL PLATING (under a day) gets no warning: ' + JSON.stringify(s && s.time));

  console.log('— the choice\'s own cost counts first');
  // CRACK THE WATER: −35% of the water, then 4 days. Enough water for 4
  // days before the crack, not after it.
  const w2 = Math.round(d.water * 5 * 100) / 100;
  await fresh({ food: 90, water: w2, o2: 90 });
  await adrift();
  s = await specOf('CRACK THE WATER');
  const after = w2 + Math.round(w2 * -35 / 100), lasts = Math.floor(Math.max(0, after) / d.water);
  ok(lasts < 4 && (s.warn || []).some(w => new RegExp('^Water runs out ' + (lasts ? 'after ' + lasts + ' days?' : 'on the first day') + '\\.').test(w)), `${w2} water, ${after} after the crack: lasts ${lasts} of 4 days: ` + JSON.stringify(s.warn));

  console.log('— a supply already gone');
  await fresh({ food: 90, water: 0, o2: 90 }, { water: 3 });
  await adrift();
  s = await specOf('CALL FOR HELP');
  ok((s.warn || []).includes('No water aboard: 2 more days without it ends the run.'), 'water gone 3 days (fails at 5): ' + JSON.stringify(s.warn));
  s = await specOf('CRACK THE WATER');
  ok((s.warn || []).some(w => /^No water aboard/.test(w)), 'CRACK THE WATER (4 days) warns too');
  await fresh({ food: 0, water: 90, o2: 90 }, { food: 1 });
  await adrift();
  s = await specOf('CALL FOR HELP');
  ok((s.warn || []).includes('No food aboard: 9 more days without it ends the run.'), 'food gone 1 day (fails at 10): a 10-day wait reaches it: ' + JSON.stringify(s.warn));
  s = await specOf('CRACK THE WATER');
  ok(!(s.warn || []).some(w => /food/i.test(w)), 'a 4-day job does not: no food warning');

  console.log('— in the box, in red');
  await fresh({ food: 90, water, o2: 90 });
  await adrift();
  const h = await page.evaluateHandle(() => [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => /CALL FOR HELP/.test(x.textContent)));
  const r = await h.asElement().evaluate(e => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.mouse.move(r.x, r.y, { steps: 3 }); await page.waitForTimeout(700);
  const box = await page.evaluate(() => { const w = Tooltip.panel.querySelector('.tc-warn'); return w ? { t: w.textContent, c: getComputedStyle(w).color, vis: Tooltip.panel.classList.contains('visible') } : null; });
  ok(box && box.vis && /Water runs out after 4 days/.test(box.t) && /229, 96, 79/.test(box.c), 'the hover box shows it in red: ' + JSON.stringify(box));
  await page.mouse.move(5, 600);

  console.log('— the Stop menu: a wait\'s day steps');
  await fresh({ food: 90, water, o2: 90 });
  const steps = await page.evaluate(async () => {
    const n = STATE.nodes.find(x => x.node_type === 'station') || STATE.nodes.find(x => (x.node_type === 'nebula' || x.node_type === 'asteroid_field'));
    STATE.currentId = n.id; renderCruise(); document.body.classList.remove('stop-active'); document.getElementById('stop-btn').click();
    await new Promise(r => setTimeout(r, 400));
    const rest = [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /^\s*REST/.test(b.textContent));
    if (!rest) return null;
    rest.click(); await new Promise(r => setTimeout(r, 300));
    return [...document.querySelectorAll('.day-step')].map(e => JSON.parse(e.dataset.tipChoice).warn || []);
  });
  ok(steps && steps.length >= 6, 'REST opens its day picker (' + (steps && steps.length) + ' steps)');
  ok(steps && !steps[3].length && steps[4].some(w => /^Water runs out after 4 days/.test(w)), 'step 4 says nothing, step 5 warns: ' + JSON.stringify(steps && steps[4]));

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
