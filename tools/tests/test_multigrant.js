// Multi-item grants: an outcome's item_grant may be a list (event_derelict_004
// grants a drive coil and a vinyl). Every list in the content lands whole
// through applyOutcomeEffects, the choice preview names every item, the
// cargo lock counts the whole list (one free slot is not room for two), and
// an event carrying one renders and plays under each AI.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function boot(ai) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  await page.evaluate(ai => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai, captain: 'academic', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
    STATE.stowaway = null;
    STATE.items = []; STATE.itemValues = {};
  }, ai);
  return page;
}

(async () => {
  browser = await chromium.launch();

  const page = await boot('marv');
  // Every list-valued item_grant in the event content, wherever it sits.
  const grants = await page.evaluate(() => {
    const out = [];
    const walk = (o, ev, at) => {
      if (Array.isArray(o)) { o.forEach((v, i) => walk(v, ev, at + '[' + i + ']')); return; }
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o.item_grant)) out.push({ ev, at, list: o.item_grant.slice() });
      for (const [k, v] of Object.entries(o)) walk(v, ev, at + '.' + k);
    };
    for (const ev of Object.values(EVENTS)) walk(ev, ev.id, '');
    return out;
  });
  ok(grants.length >= 3, `${grants.length} list-valued item_grant outcomes in the content`);

  for (const g of grants) {
    const r = await page.evaluate(g => {
      const ev = EVENTS[g.ev];
      const o = g.at.split(/\.|\[|\]/).filter(Boolean).reduce((x, k) => x[k], ev);
      STATE.items = []; STATE.itemValues = {}; STATE.halfEffect = false; STATE.currentEvent = ev;
      const fact = outcomeFacts(o).find(f => f.text.startsWith('+') && f.text.includes(' + '));
      applyOutcomeEffects(JSON.parse(JSON.stringify(o)));
      const need = {}, got = {};
      for (const id of g.list) need[id] = (need[id] || 0) + 1;
      for (const id of STATE.items) got[id] = (got[id] || 0) + 1;
      return { landed: Object.entries(need).every(([id, n]) => got[id] === n), items: STATE.items.slice(), fact: fact && fact.text };
    }, g);
    const want = '+' + g.list.map(id => id.replace(/_/g, ' ').toUpperCase()).join(' + ');
    ok(r.landed, `${g.ev}${g.at}: every granted item lands (${r.items.join(', ')})`);
    ok(r.fact === want, `${g.ev}${g.at}: the preview names them all ("${r.fact}")`);
  }

  // The lock counts the whole list: with exactly one slot free, the first
  // item of event_general_021's three-item thanks fits alone and the whole
  // grant (two slots: repair kit + artifact; the drive coil is a fitting)
  // locks the choice.
  const lock = await page.evaluate(() => {
    STATE.items = []; STATE.itemValues = {}; STATE.materials = {};
    let n = 0; while (grantItem('sealed_vinyl') && n < 200) n++;
    STATE.items.splice(STATE.items.indexOf('sealed_vinyl'), 1);
    const o = EVENTS.event_general_021.outcomes.recur_thanks;
    STATE.currentEvent = EVENTS.event_general_021;
    return {
      free: cargoCapacity() - cargoSlotsUsed(), need: o.item_grant.reduce((s, id) => s + itemSlotsFor(id, 1), 0),
      one: lockReason({ text: 'x', outcome: { item_grant: o.item_grant[0] } }),
      all: lockReason({ text: 'x', outcome: o }), held: STATE.items.length,
    };
  });
  ok(lock.free === 1 && lock.need === 2, `hold one slot short of full (${lock.held} vinyls, ${lock.free} free); the grant needs ${lock.need}`);
  ok(lock.one === null, 'its first item alone still fits');
  ok(lock.all === 'No cargo space', `the whole grant locks the choice: ${lock.all}`);
  await page.close();

  // The encounter renders and plays a multi-grant event under each AI
  // (AI flavor lines run through the same previews).
  for (const ai of ['marv', 'ajoy']) {
    const p = await boot(ai);
    const r = await p.evaluate(() => {
      enterEvent(STATE.byId[STATE.currentId], EVENTS.event_derelict_004);
      const shown = document.querySelector('.screen.active').id;
      const btns = [...document.querySelectorAll('#enc-choices .enc-choice')];
      const named = btns.some(b => b.textContent.includes('DRIVE COIL + SEALED VINYL'));
      const open = btns.filter(b => !b.classList.contains('locked'));
      if (open[0]) open[0].click();
      return { shown, choices: btns.length, named };
    });
    await p.waitForTimeout(300);
    ok(r.shown === 'screen-encounter' && r.choices > 0, `${ai}: event_derelict_004 opens on the encounter screen with ${r.choices} choices`);
    ok(r.named, `${ai}: its choice preview shows DRIVE COIL + SEALED VINYL`);
    await p.close();
  }

  ok(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(`\nmultigrant: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
