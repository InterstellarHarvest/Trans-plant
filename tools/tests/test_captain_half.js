// Captain backgrounds work at half a crew specialist's strength, and a
// captain and a crew member in the same role don't stack — the better one
// counts (Bible §4.30, captains.json skill_modifier 0.5). Plus the calm
// crops' narrative_hooks reaching the log (owner 2026-10-10).
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
async function boot(setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.stack || e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForTimeout(200);
  page._errs = errs;
  return page;
}
const withRandom = (page, v, fn) => page.evaluate(({ v, src }) => {
  const real = Math.random; Math.random = () => v;
  try { return (0, eval)('(' + src + ')')(); } finally { Math.random = real; }
}, { v, src: fn.toString() });

(async () => {
  browser = await chromium.launch();
  const errors = [];

  console.log('— one rule: passiveMult = specialistMult');
  {
    const page = await boot({ captain: 'medic', crew: ['engineer', 'pilot'] });
    const r = await page.evaluate(() => ({ medic: passiveMult('medic'), same: ['medic', 'engineer', 'pilot', 'chef', 'botanist'].every(k => passiveMult(k) === specialistMult(k)) }));
    ok(r.medic === 0.5, `medic captain alone: passive at half (${r.medic})`);
    ok(r.same, 'passiveMult and specialistMult agree for every role');
    await page.evaluate(() => damageCrew('engineer', 35));
    ok(await page.evaluate(() => STATE.crewHP.engineer) === 72, 'medic captain softens a hit by 20% (35 → 28), half a crew medic');
    errors.push(...page._errs); await page.close();
  }
  {
    const page = await boot({ captain: 'engineer', crew: ['engineer', 'pilot'] });
    ok(await page.evaluate(() => passiveMult('engineer')) === 1, 'engineer captain + healthy crew engineer: 1 (no stacking)');
    await page.evaluate(() => { STATE.crewHP.engineer = 30; });
    ok(await page.evaluate(() => passiveMult('engineer')) === 0.5, 'engineer captain + wounded crew engineer: 0.5');
    errors.push(...page._errs); await page.close();
  }

  console.log('— medic save: 50% crew, 25% captain');
  {
    const page = await boot({ captain: 'medic', crew: ['engineer'] });
    await withRandom(page, 0.2, () => applyOutcomeEffects({ severity: 'lethal', crew_effect: { target: 'specific_role', role: 'engineer' }, time_cost: 'trivial' }));
    ok(await page.evaluate(() => STATE.crew.includes('engineer') && /^You refused/.test(STATE.lethalSaved || '')), 'medic captain: roll 0.2 < 0.25 → saved, credited to you');
    errors.push(...page._errs); await page.close();
    const p2 = await boot({ captain: 'medic', crew: ['engineer'] });
    await withRandom(p2, 0.3, () => applyOutcomeEffects({ severity: 'lethal', crew_effect: { target: 'specific_role', role: 'engineer' }, time_cost: 'trivial' }));
    ok(await p2.evaluate(() => !STATE.crew.includes('engineer')), 'medic captain: roll 0.3 ≥ 0.25 → dies');
    errors.push(...p2._errs); await p2.close();
    const p3 = await boot({ captain: 'medic', crew: ['engineer', 'medic'] });
    await withRandom(p3, 0.4, () => applyOutcomeEffects({ severity: 'lethal', crew_effect: { target: 'specific_role', role: 'engineer' }, time_cost: 'trivial' }));
    ok(await p3.evaluate(() => STATE.crew.includes('engineer') && !/^You/.test(STATE.lethalSaved || '')), 'medic captain + crew medic: the crew medic\'s 50% (roll 0.4), credited to them');
    errors.push(...p3._errs); await p3.close();
  }

  console.log('— breach minigame: engineer captain helps at half');
  {
    const page = await boot({ captain: 'engineer', crew: ['pilot'] });
    await page.evaluate(() => openMinigame('breach', {}, () => {}));
    await page.waitForTimeout(200);
    const txt = await page.evaluate(() => document.body.innerText);
    ok(/ENGINEER ABOARD: \+half a second per breach \(your engineering training\)/.test(txt), 'breach briefing: +half a second per breach (your engineering training)');
    errors.push(...page._errs); await page.close();
  }

  console.log('— fabricator: captain engineer 12, never stacked on a crew engineer');
  {
    const tip = async page => page.evaluate(() => {
      openFabricator();
      // The TIME row's breakdown is a .ui-tip now (parity-shell): title + description.
      const tt = e => e.getAttribute('title') || ((e.dataset.tipTitle || '') + '\n' + (e.dataset.tipDescription || ''));
      const el = [...document.querySelectorAll('[title],[data-tip-title]')].find(e => /FAB SPEED BREAKDOWN/.test(tt(e)));
      const t = el ? tt(el) : '';
      closeFabricator();
      return t;
    });
    const a = await boot({ captain: 'engineer', crew: ['pilot'] });
    const ta = await tip(a);
    ok(/Captain \(Engineer bg\.\)\s+\+120%/.test(ta) && /×2\.2/.test(ta), 'captain engineer alone: +120%, ×2.2');
    errors.push(...a._errs); await a.close();
    const b = await boot({ captain: 'engineer', crew: ['engineer', 'pilot'] });
    const tb = await tip(b);
    ok(!/Captain \(Engineer/.test(tb) && /×3\.5/.test(tb), 'captain engineer + Kazuki: only Kazuki counts, ×3.5');
    errors.push(...b._errs); await b.close();
  }

  console.log('— combat: captain tribute, no stacking, pilot edge');
  {
    const page = await boot({ captain: 'botanist', crew: ['pilot', 'engineer'] });
    await page.evaluate(() => {
      const ev = Object.values(EVENTS).find(e => JSON.stringify(e).includes('"triggerCombat":true'));
      enterEvent(STATE.byId[STATE.currentId], ev); window.triggerCombat({});
    });
    await page.waitForTimeout(450); // after the 200ms choices → actions cross-dissolve
    const harvest = await page.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => /OFFER HARVEST/.test(x.textContent)); return b ? b.textContent : ''; });
    ok(/20%/.test(harvest), `botanist captain can OFFER HARVEST at half odds (${harvest.replace(/\s+/g, ' ').trim()})`);
    errors.push(...page._errs); await page.close();
    const p2 = await boot({ captain: 'chef', crew: ['chef', 'engineer'] });
    await p2.evaluate(() => {
      const ev = Object.values(EVENTS).find(e => JSON.stringify(e).includes('"triggerCombat":true'));
      enterEvent(STATE.byId[STATE.currentId], ev); window.triggerCombat({});
    });
    await p2.waitForTimeout(450); // after the 200ms choices → actions cross-dissolve
    const cookies = await p2.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => /OFFER COOKIES/.test(x.textContent)); return b ? b.textContent : ''; });
    ok(/25%/.test(cookies), `chef captain + crew chef: the crew chef's 25% counts (${cookies.replace(/\s+/g, ' ').trim()})`);
    errors.push(...p2._errs); await p2.close();
  }

  console.log('— calm crops post their hooks (no swing)');
  for (const crop of ['wheat', 'sweet_potato', 'soybean', 'zinnia']) {
    const page = await boot({ crop });
    const r = await page.evaluate(() => {
      const def = MOD.crops.crops.find(c => c.id === 'crop_' + STATE.crop);
      const r0 = Math.random; Math.random = () => 0.01;
      const h0 = STATE.cropGrowth.health, m0 = STATE.resources.morale, l0 = (STATE.shipLog || []).length;
      cropDrama(); Math.random = r0;
      const log = STATE.shipLog || [];
      const last = log.length > l0 ? JSON.stringify(log[log.length - 1]) : '';
      return { swing: STATE.cropGrowth.health !== h0 || STATE.resources.morale !== m0, logged: def.narrative_hooks.some(h => last.includes(h.slice(0, 30))), designy: def.narrative_hooks.some(h => /\bif present\b|in this game|will remind you/.test(h)) };
    });
    ok(r.logged && !r.swing && !r.designy, `${crop}: a hook reaches the log as a plain line, no stat change`);
    errors.push(...page._errs); await page.close();
  }

  console.log('\nerrors: ' + errors.length);
  errors.slice(0, 3).forEach(e => console.log('  ' + e.split('\n')[0]));
  console.log(`\ncaptain-half: ${pass} passed, ${fail + errors.length} failed`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
