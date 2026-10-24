// Event minigames speak for their event: every launch_minigame choice's
// briefing and result quip come from its minigame_opts, per AI (MEDICAL's
// fed-up result too). Keyboard: a click or key finishes the title intro,
// Tab skips locked choices and verbs, ENTER takes the setup's next step.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const errors = [];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(String(e.stack || e.message).slice(0, 300)));

  console.log('— title: a click or key finishes the intro');
  await page.goto(URL);
  await page.waitForTimeout(600);
  await page.keyboard.press('Space'); // dismisses the poster; the intro starts
  await page.waitForTimeout(1500);
  const mid = await page.evaluate(() => ({ typed: document.getElementById('title-tagline').textContent.length, buttons: document.getElementById('title-buttons').classList.contains('visible') }));
  await page.mouse.click(640, 200);
  await page.waitForTimeout(150);
  const done = await page.evaluate(() => ({ lines: ['title-tagline', 'title-tagline-2', 'title-tagline-3'].map(id => document.getElementById(id).textContent), buttons: document.getElementById('title-buttons').classList.contains('visible') }));
  ok(!mid.buttons && done.buttons && done.lines.every(l => l.length > 10), `a click mid-intro shows every tagline and the buttons (${done.lines.map(l => l.length).join('/')} chars)`);

  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && typeof enterEvent === 'function' && window.openMinigame);
  const all = await page.evaluate(() => {
    const out = [];
    for (const ev of Object.values(EVENTS)) {
      const sets = [ev.choices || []].concat(Object.values(ev.layers || {}).map(l => l.choices || []));
      for (const cs of sets) for (const c of cs) if (c.launch_minigame) out.push({ id: ev.id, game: c.launch_minigame, text: c.text });
    }
    return out;
  });
  ok(all.length >= 23, `${all.length} event minigame choices`);

  console.log('— each event minigame shows its own briefing and quip, per AI');
  const bad = [];
  for (const ai of ['aria', 'marv', 'rex', 'chip', 'ajoy']) {
    for (const c of all) {
      const r = await page.evaluate(async ([c, ai]) => {
        localStorage.removeItem('transplant_save_v1');
        applySetupToState({ trail: 'mars', ai, captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'D' });
        STATE.stowaway = null;
        const ev = EVENTS[c.id];
        enterEvent(STATE.byId[STATE.currentId], ev);
        const choice = [ev.choices || []].concat(Object.values(ev.layers || {}).map(l => l.choices || [])).flat().find(x => x.text === c.text);
        resolveChoice(choice);
        await new Promise(r => setTimeout(r, 250));
        const brief = (document.querySelector('#ga .rsi-text') || {}).textContent || '';
        const tier = ['perfect', 'good', 'poor'][Math.floor(Math.random() * 3)];
        showResult(c.game === 'medical' ? 'fedup' : tier, null);
        await new Promise(r => setTimeout(r, 150));
        const quip = document.querySelector('#rquip .rtext').textContent;
        const o = choice.minigame_opts;
        const want = c.game === 'medical' ? (o.quips.fedup || o.quips.poor)[ai] : o.quips[tier][ai];
        abortMinigame();
        return { brief: brief === o.briefing[ai], quip: quip === want, got: quip };
      }, [c, ai]);
      if (!r.brief || !r.quip) bad.push(`${ai} ${c.id}: brief ${r.brief} quip ${r.quip} ("${r.got}")`);
    }
  }
  ok(!bad.length, `every briefing and result quip is the event's own, for all five AIs${bad.length ? ': ' + bad.slice(0, 4).join(' | ') : ''}`);
  const generic = await page.evaluate(() => { applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer'], crop: 'wheat', ship: 'D' }); openMinigame('scan', {}, () => {}); const t = document.querySelector('#ga .rsi-text').textContent; abortMinigame(); return t; });
  ok(/signal/i.test(generic), `free play keeps the generic briefing ("${generic}")`);

  console.log('— Tab skips locked choices');
  const tab = await page.evaluate(async () => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer'], crop: 'wheat', ship: 'D' });
    const ev = Object.values(EVENTS).find(e => !e.layers && (e.choices || []).some(c => c.requires_crew === 'diplomat'));
    enterEvent(STATE.byId[STATE.currentId], ev);
    await new Promise(r => setTimeout(r, 300));
    snapDelivery();
    await new Promise(r => setTimeout(r, 1500));
    const btns = [...document.querySelectorAll('#enc-choices .enc-choice')];
    return { locked: btns.filter(b => b.classList.contains('locked')).map(b => [b.tabIndex, b.getAttribute('aria-disabled')]), open: btns.filter(b => !b.classList.contains('locked')).map(b => b.tabIndex) };
  });
  ok(tab.locked.length && tab.locked.every(([t, a]) => t === -1 && a === 'true') && tab.open.every(t => t === 0), `locked choices leave the Tab order (${JSON.stringify(tab)})`);
  const verbs = await page.evaluate(async () => {
    // A dented hull with no metal: REPAIR shows, locked.
    STATE.resources.hull = 50; STATE.materials = {};
    STATE.currentEvent = null; returnToHub();
    await new Promise(r => setTimeout(r, 200));
    if (!document.body.classList.contains('stop-active')) document.getElementById('stop-btn').click();
    await new Promise(r => setTimeout(r, 300));
    return [...document.querySelectorAll('#stop-choices .stop-choice.locked')].map(b => b.tabIndex);
  });
  ok(verbs.length && verbs.every(t => t === -1), `locked Stop-menu verbs leave the Tab order too (${verbs.length} locked)`);

  console.log('— ENTER takes the setup\'s next step');
  const enter = await page.evaluate(async () => {
    startNewGame();
    await new Promise(r => setTimeout(r, 200));
    const step = () => document.querySelector('#setup-right') && document.getElementById('setup-step-label') ? document.getElementById('setup-step-label').textContent : document.getElementById('btn-next').textContent + '|' + document.querySelectorAll('#setup-right .sel-card').length + '|' + (document.querySelector('#setup-right .sel-card .card-name') || {}).textContent;
    document.querySelector('#setup-right .sel-card').click();
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    const before = step();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    return [before, step()];
  });
  ok(enter[0] !== enter[1], `ENTER advanced the wizard (${enter[0]} → ${enter[1]})`);

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\nevent mg lines: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
