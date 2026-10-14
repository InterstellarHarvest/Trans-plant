// captains.json starting_bonus applied for every captain (owner 2026-10-10).
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.stack || e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  const S = await page.evaluate(() => {
    const out = { marsFood: MOD.map_rules.trails.mars.starting_resources.food };
    for (const c of MOD.captains.captains) {
      localStorage.clear();
      applySetupToState({ trail: 'mars', ai: 'aria', captain: c.background, crew: ['pilot', 'medic'], crop: 'wheat', ship: 'D' });
      out[c.background] = { r: Object.assign({}, STATE.resources), gold: STATE.goldAmount, items: STATE.items.slice(), crop: STATE.cropGrowth.health,
        max: { fuel: resMax('fuel'), hull: resMax('hull'), food: resMax('food') } };
      if (c.background === 'engineer') { applyOutcomeEffects({ resources: { morale: 1 } }); renderHUD(); out.engineerAfter = STATE.resources.hull; }
    }
    return out;
  });
  ok(S.botanist.crop === 85, `botanist: crop starts at 85 (${S.botanist.crop})`);
  ok(S.engineer.r.hull === 105 && S.engineer.max.hull === 105 && S.engineerAfter === 105, `engineer: hull 105, ceiling 105, kept after a change (${S.engineer.r.hull}/${S.engineer.max.hull}/${S.engineerAfter})`);
  ok(S.medic.items.filter(i => i === 'medkit').length === 1, `medic: starts with a medkit (${S.medic.items})`);
  ok(S.pilot.r.fuel === 105 && S.pilot.max.fuel === 105, `pilot: fuel 105 (${S.pilot.r.fuel})`);
  // Mars starts short of food (ruling 69): the Chef's +5 lands on the trail's start; the tank is 100 + 5.
  ok(S.chef.r.food === S.marsFood + 5 && S.chef.max.food === 105, `chef: food ${S.marsFood} + 5 on Mars, ceiling 105 (${S.chef.r.food}/${S.chef.max.food})`);
  ok(S.xenobiologist.items.includes('spectrometer'), 'xenobiologist: spectrometer');
  ok(S.academic.items.includes('gas_analyzer') && !S.veteran.items.includes('gas_analyzer'), 'academic: gas analyzer (others no longer start with one)');
  ok(S.veteran.items.includes('pressure_suit'), 'veteran: pressure suit');
  ok(S.diplomat.gold === 65 && S.merchant.gold === 80 && S.veteran.gold === 50, `credits: diplomat 65, merchant 80, others 50 (${S.diplomat.gold}/${S.merchant.gold}/${S.veteran.gold})`);
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\ncaptains: ${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
