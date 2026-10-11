// Logbook Fragment (owner ruling 2026-10-10): the key to five events tied to
// an earlier crew. Without it the choice shows locked; with it the choice
// resolves, pays out, and the fragment stays in the hold.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const CASES = [
  { ev: 'event_derelict_001', text: 'Follow the logbook', check: s => s.fuelUp && s.mats.scrap > 0 },
  { ev: 'event_derelict_004', text: 'Check the logbook: they sketched', check: s => s.cropUp && s.mats.biocomponent > 0 },
  { ev: 'event_asteroid_003', text: 'Check the logbook: it mentions', check: s => s.flags.includes('read_the_note') && s.mats.minerals >= 3 },
  { ev: 'event_general_013', text: "Read the logbook's page on K", check: s => s.flags.includes('brought_k_home') && s.items.includes('medkit'), flags: ['read_the_note'] },
  { ev: 'event_general_027', text: "Read the logbook's last pages", check: s => s.flags.includes('crossed_the_line') && s.fuelUp },
];

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const c of CASES) {
    for (const has of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(URL);
      await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
      await page.evaluate(({ c, has }) => {
        localStorage.removeItem('transplant_save_v1');
        applySetupToState({ trail: 'interstellar', ai: 'marv', captain: 'veteran', crew: ['chef', 'medic'], crop: 'wheat', ship: 'B' });
        STATE.stowaway = null;
        STATE.resources.fuel = 50;
        if (has) STATE.items.push('logbook_fragment');
        for (const f of (c.flags || [])) STATE.flags.add(f);
        window.__before = { fuel: STATE.resources.fuel, crop: STATE.cropGrowth && STATE.cropGrowth.health, mats: Object.assign({}, STATE.materials) };
        if (STATE.cropGrowth) STATE.cropGrowth.health = 60, window.__before.crop = 60;
        enterEvent(STATE.byId[STATE.currentId], EVENTS[c.ev]);
      }, { c: { ev: c.ev, flags: c.flags || [] }, has });
      await page.waitForTimeout(450);
      const btn = await page.evaluate(t => {
        if (typeof finishAllTyping === 'function') finishAllTyping();
        const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => x.textContent.includes(t));
        return b ? { locked: b.classList.contains('locked') || b.disabled, txt: b.textContent } : null;
      }, c.text);
      if (!has) {
        ok(btn && btn.locked && /logbook fragment/i.test(btn.txt), `${c.ev}: without the fragment the choice shows, locked (${btn ? btn.txt.replace(/\s+/g, ' ').trim().slice(0, 80) : 'missing'})`);
      } else {
        ok(btn && !btn.locked, `${c.ev}: with the fragment the choice is open`);
        await page.evaluate(t => [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => x.textContent.includes(t)).click(), c.text);
        await page.waitForTimeout(400);
        const s = await page.evaluate(() => ({
          outcome: !!STATE.outcomeMode, flags: [...STATE.flags], items: [...STATE.items],
          fuelUp: STATE.resources.fuel > window.__before.fuel,
          cropUp: STATE.cropGrowth && STATE.cropGrowth.health > window.__before.crop,
          mats: Object.fromEntries(Object.entries(STATE.materials || {}).map(([k, v]) => [k, v - (window.__before.mats[k] || 0)])),
        }));
        ok(s.outcome && c.check(s), `${c.ev}: the logbook choice pays out`);
        ok(s.items.includes('logbook_fragment'), `${c.ev}: the fragment stays in the hold`);
      }
      await page.close();
    }
  }
  ok(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(`\nlogbook: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
