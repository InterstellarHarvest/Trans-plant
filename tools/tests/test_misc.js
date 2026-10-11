const { chromium } = require('playwright');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errs = []; page.on('pageerror', e => errs.push(e.stack || e.message));
  await page.goto('http://localhost:8177/index.html');
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  await page.evaluate(() => { applySetupToState({ trail: 'mars', ai: 'aria', captain: 'veteran', crew: ['pilot', 'engineer'], crop: 'tomato', ship: 'M' }); STATE.stowaway = null; });
  await page.waitForTimeout(300);
  // growbay never says wheat on a tomato run
  let wheat = 0;
  for (let i = 0; i < 40; i++) { const t = await page.evaluate(() => { openGrowbay(); const x = document.getElementById('aria-text').textContent; closeGrowbay(); return x; }); if (/wheat/i.test(t)) wheat++; }
  ok(wheat === 0, 'growbay ARIA lines never say "wheat" on a tomato run (40 opens)');
  // combat with wounded crew mounts and plays
  await page.evaluate(() => { STATE.crewHP.pilot = 30; STATE.crewHP.engineer = 30; enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001); });
  await page.waitForTimeout(800);
  const fight = await page.evaluate(() => { for (let i = 0; i < 4; i++) { const b = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')].find(x => /FIGHT|fight|Open fire|OPEN FIRE/.test(x.textContent)); if (b) { b.click(); return true; } const n = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')][0]; if (n) n.click(); } return false; });
  await page.waitForTimeout(900);
  let inCombat = await page.evaluate(() => document.getElementById('screen-encounter').classList.contains('combat-mode'));
  if (!inCombat) { await page.evaluate(() => triggerCombat && triggerCombat()); await page.waitForTimeout(800); inCombat = await page.evaluate(() => document.getElementById('screen-encounter').classList.contains('combat-mode')); }
  ok(inCombat, 'combat mounts with wounded pilot + engineer');
  const subs = await page.evaluate(() => [...document.querySelectorAll('.combat-action, #enc-choices button, #enc-choices .enc-choice')].map(b => b.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  console.log('   actions:', subs.slice(0, 300));
  for (let i = 0; i < 6; i++) { await page.evaluate(() => { const b = [...document.querySelectorAll('button, .enc-choice')].find(x => /FIRE AT CENTER|FIRE LASER|EVADE/.test(x.textContent) && x.offsetParent); if (b) b.click(); }); await page.waitForTimeout(900); }
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`misc: ${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();