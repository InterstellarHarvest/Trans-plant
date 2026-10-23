// Batch 4 final owner rulings (2026-10-12):
//  49 — an AI bar's name chip hides when the line already names the AI or
//       says "the ship computer" (encounter, AJOY hindsight, combat,
//       engine room); a first-person line keeps the chip.
//  52 + demo-endings canon — failure titles: no_fuel ADRIFT, mutiny
//       OFFICIAL COMPLAINT, time_expired WE REGRET TO INFORM, hull_zero
//       BREACH, crew_gone AUTOPILOT.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.failures && window.aiChip && window.namesTheAI, null, { timeout: 90000 });
  await page.evaluate(() => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
  });

  console.log('— ruling 49: the AI chip hides when the line names the AI');
  const chipFor = line => page.evaluate(line => {
    const base = EVENTS[Object.keys(EVENTS).find(k => EVENTS[k].choices && !EVENTS[k].layers)];
    const ev = Object.assign({}, base, { ai_flavor: { marv: line } });
    enterEvent(STATE.byId[STATE.currentId], ev); finishAllTyping();
    const chip = document.getElementById('enc-ai-name');
    return { shown: getComputedStyle(chip).display !== 'none', name: chip.textContent, text: document.getElementById('enc-ai-text').textContent };
  }, line);
  let c = await chipFor('MARV reports the hull is holding.');
  ok(!c.shown && /MARV reports/.test(c.text), 'third-person line ("MARV reports…"): chip hidden, line intact');
  c = await chipFor('The ship computer logs a minor anomaly.');
  ok(!c.shown, '"the ship computer" line: chip hidden');
  c = await chipFor('Threat assessment: moderate. Recommending caution.');
  ok(c.shown && c.name === 'MARV', 'first-person line: chip shows MARV');
  const other = await page.evaluate(() => {
    const el = document.createElement('span');
    aiChip(el, 'MARV', 'ARIA would disagree, loudly.'); const a = el.style.display;
    aiChip(el, 'REX', 'Perimeter holds.'); const b = el.style.display;
    return { a, b, txt: el.textContent };
  });
  ok(other.a === 'none' && other.b === '' && other.txt === 'REX', 'chip resets to visible for the next first-person line; any AI name counts');

  console.log('— failure titles = demo-endings');
  const want = { no_fuel: 'ADRIFT', mutiny: 'OFFICIAL COMPLAINT', hull_zero: 'BREACH', crew_gone: 'AUTOPILOT' }; // time_expired retired (ruling 94)
  for (const [type, title] of Object.entries(want)) {
    const t = await page.evaluate(async type => {
      STATE.ended = false;
      window.renderEndScreen({ kind: 'failure', module: MOD.failures.find(f => f.failure_type === type) });
      await new Promise(r => setTimeout(r, 300));
      const el = document.getElementById('end-cine-title');
      return el ? (el.innerText || el.textContent).replace(/\s+/g, ' ').trim().toUpperCase() : '';
    }, type);
    ok(t === title, type + ' → ' + title + ' (' + t + ')');
  }
  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors.slice(0, 3)));
  console.log(`b4_final: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
