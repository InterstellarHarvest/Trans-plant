// Soybean nitrogen fixing + wheat growth_rate (owner ruling 2026-10-11):
// after a pest outbreak is cleared on a soybean crop, its daily health
// recovery runs at crops.json contamination_recovery_multiplier for
// contamination_recovery_days days. Every clearing path opens the window;
// only recovery is multiplied; other crops are untouched; the window
// survives save/reload; the growbay shows it only while it runs. Wheat
// no longer claims a "fast" growth rate.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function boot(setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.crops);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'soybean', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForTimeout(200);
  // A calm, controlled bay: a station (no temperature/light stress), water
  // matched to the crop's need, nobody tending, no random pest onset.
  await page.evaluate(() => {
    STATE.byId[STATE.currentId].node_type = 'station';
    STATE.resources.water = 100;
    STATE.orders.waterSplit = Math.round(cropWaterNeed());
    tickCropGrowth();
    STATE.cropGrowth.tenderId = 'none'; STATE.cropGrowth.tenderChosen = true; // nobody tending, by choice (ruling 41 would seat a botanist)
    window._rand = Math.random; Math.random = () => 0.99;
  });
  return page;
}
const SOY = () => MOD.crops.crops.find(c => c.id === 'crop_soybean').strengths.nitrogen_fixing;

(async () => {
  browser = await chromium.launch();

  console.log('— the data');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const crops = MOD.crops.crops, nf = crops.find(c => c.id === 'crop_soybean').strengths.nitrogen_fixing;
      const wheat = crops.find(c => c.id === 'crop_wheat');
      const META = id => cropMetaOf(id).maturity_days;
      const rated = crops.filter(c => JSON.stringify(c).includes('"growth_rate"')).map(c => c.id);
      return { mult: nf.contamination_recovery_multiplier, days: nf.contamination_recovery_days, desc: nf.description,
               sdesc: crops.find(c => c.id === 'crop_soybean').strengths.description,
               wheatJson: JSON.stringify(wheat), rated, wheatMat: META('wheat'), others: ['tomato', 'zinnia'].map(META) };
    });
    ok(r.mult === 2 && r.days === 10, `soybean: contamination_recovery_multiplier ${r.mult}, contamination_recovery_days ${r.days}`);
    ok(/health recovers 2x for 10 days/i.test(r.desc) && /pest outbreak is cleared/i.test(r.desc), 'nitrogen_fixing promise says exactly what is built: ' + r.desc.slice(-60));
    ok(/recovers 2x for 10 days after a pest outbreak is cleared/i.test(r.sdesc) && !/soil recovers|biological crises/i.test(r.sdesc), 'soybean strengths.description matches the mechanic');
    ok(!/"growth_rate"/.test(r.wheatJson) && !/\bfast\b/i.test(r.wheatJson), 'wheat no longer claims a "fast" growth rate (maturity ' + r.wheatMat + 'd vs tomato/zinnia ' + r.others.join('/') + 'd)');
    ok(r.rated.length === 0, 'no crop carries an unread growth_rate that could contradict its maturity days');
    await page.close();
  }

  console.log('— every clearing path opens the window (soybean)');
  {
    const page = await boot({ crew: ['engineer', 'pilot'] });
    const r = await page.evaluate(async () => {
      const out = {};
      const cg = () => STATE.cropGrowth;
      const reset = () => { cg().pest = true; cg().recoveryBoostUntil = 0; cg().health = 50; tickCropGrowth(); };
      // 1. growbay TREAT (no botanist: costs a day after the clear)
      reset(); openGrowbay(); let d0 = STATE.daysElapsed; openTreat(); closeGrowbay();
      out.treat = { pest: cg().pest, until: cg().recoveryBoostUntil, expect: d0 + 10, left: cropRecoveryBoostDaysLeft(), passed: STATE.daysElapsed - d0 };
      // 2. TREAT with a botanist aboard (the day is spared)
      STATE.crew = ['botanist', 'pilot']; STATE.crewHP.botanist = 100;
      reset(); openGrowbay(); d0 = STATE.daysElapsed; Math.random = () => 0.0; openTreat(); Math.random = () => 0.99; closeGrowbay();
      out.treatBot = { pest: cg().pest, until: cg().recoveryBoostUntil, expect: d0 + 10, passed: STATE.daysElapsed - d0 };
      STATE.crew = ['engineer', 'pilot'];
      // 3. the crop treatment item from the inventory
      reset(); d0 = STATE.daysElapsed;
      const msg = ITEM_USE.crop_treatment.use();
      out.item = { pest: cg().pest, until: cg().recoveryBoostUntil, expect: d0 + 10, health: cg().health, msg };
      // 4. events: every authored clears_pest outcome
      out.events = [];
      for (const ev of Object.values(EVENTS)) for (const ch of (ev.choices || [])) {
        if (!ch.outcome || !ch.outcome.clears_pest) continue;
        reset(); d0 = STATE.daysElapsed;
        applyOutcomeEffects(ch.outcome);
        out.events.push({ id: ev.id, text: ch.text.slice(0, 30), pest: cg().pest, ok: cg().recoveryBoostUntil === d0 + 10 });
      }
      // 5. a clears_pest with no outbreak: nothing cleared, no window
      cg().pest = false; cg().recoveryBoostUntil = 0;
      applyOutcomeEffects({ clears_pest: true, time_cost: 'trivial' });
      out.noPest = cg().recoveryBoostUntil;
      ITEM_USE.crop_treatment.use();
      out.noPestItem = cg().recoveryBoostUntil;
      // 6. a second clear inside the window restarts it from the new day
      reset(); clearCropPest(); const first = cg().recoveryBoostUntil;
      STATE.daysElapsed += 4; tickCropGrowth(); cg().pest = true; clearCropPest();
      out.restart = { first, second: cg().recoveryBoostUntil, expect: STATE.daysElapsed + 10 };
      // 7. the clear posts a cruise-log line
      out.log = JSON.stringify((STATE.shipLog || []).slice(-6));
      return out;
    });
    ok(!r.treat.pest && r.treat.until === r.treat.expect && r.treat.left === 10 - r.treat.passed, `growbay TREAT clears and opens the window (until day ${r.treat.until}, ${r.treat.left} days left after its ${r.treat.passed} day)`);
    ok(!r.treatBot.pest && r.treatBot.until === r.treatBot.expect && r.treatBot.passed === 0, 'TREAT with the botanist (no day spent) opens it too');
    ok(!r.item.pest && r.item.until === r.item.expect && r.item.health === 80 && /pests cleared/.test(r.item.msg), 'the crop treatment item clears, heals +30 and opens the window');
    ok(r.events.length >= 5 && r.events.every(e => !e.pest && e.ok), `every authored clears_pest outcome opens it (${r.events.map(e => e.id).join(', ')})`);
    ok(r.events.some(e => e.id === 'event_crisis_013'), 'the crisis crop-treatment choice clears pests like the item does');
    ok(r.noPest === 0 && r.noPestItem === 0, 'a clear with no outbreak opens no window');
    ok(r.restart.second === r.restart.expect && r.restart.second > r.restart.first, 'a second clear inside the window restarts it from that day');
    ok(/soybeans fix nitrogen into the cleared beds: health recovery ×2 for 10 days/.test(r.log), 'the clear is announced in the cruise log');
    await page.close();
  }

  console.log('— the arithmetic: recovery ×2 inside the window, ×1 after');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const cg = STATE.cropGrowth;
      const step = n => { const h = cg.health; STATE.daysElapsed += n; tickCropGrowth(); return Math.round((cg.health - h) * 1000) / 1000; };
      const out = {};
      cg.health = 50; cg.pest = false; cg.recoveryBoostUntil = 0;
      out.base = step(1);                         // no window: +0.5
      cg.pest = true; clearCropPest();            // window opens: next 10 ticks boosted
      out.perDay = [];
      for (let i = 0; i < 12; i++) out.perDay.push(step(1));
      // A lump catch-up across the window edge charges day by day.
      cg.health = 40; cg.pest = true; clearCropPest();
      out.lump = step(15);                        // 10×1.0 + 5×0.5 = 12.5
      // Damage is not multiplied — only recovery: a pest inside the window.
      cg.health = 50; cg.pest = true; clearCropPest(); cg.pest = true;
      out.pestDay = step(1);                      // −1.5 + 0.5×2 = −0.5
      cg.pest = false;
      // Nothing to recover (dry ship): the window adds nothing.
      cg.health = 50; STATE.resources.water = 0; out.dry = step(1); STATE.resources.water = 100;
      return out;
    });
    ok(r.base === 0.5, 'baseline recovery at matched water: +0.5/day');
    ok(r.perDay.slice(0, 10).every(d => d === 1) && r.perDay.slice(10).every(d => d === 0.5), 'days 1–10 after the clear +1.0/day (×2), days 11–12 back to +0.5: ' + r.perDay.join(' '));
    ok(r.lump === 12.5, `a 15-day catch-up across the edge: +${r.lump} (10×1.0 + 5×0.5)`);
    ok(r.pestDay === -0.5, `damage is not doubled — a pest day in the window: ${r.pestDay} (−1.5 + 0.5×2)`);
    ok(r.dry === -3, `with nothing to recover the window adds nothing (dry ship ${r.dry}/day)`);
    await page.close();
  }

  console.log('— other crops are unaffected');
  for (const crop of ['wheat', 'tomato', 'sweet_potato', 'zinnia']) {
    const page = await boot({ crop });
    const r = await page.evaluate(() => {
      const cg = STATE.cropGrowth;
      cg.health = 50; cg.pest = false;
      const before = cg.health; STATE.daysElapsed += 1; tickCropGrowth(); const base = cg.health - before;
      cg.pest = true; const cleared = clearCropPest();
      const h = cg.health; STATE.daysElapsed += 1; tickCropGrowth();
      // even a window forced into the save does nothing for them
      cg.recoveryBoostUntil = STATE.daysElapsed + 10;
      const h2 = cg.health; STATE.daysElapsed += 1; tickCropGrowth();
      openGrowbay(); const row = !!document.querySelector('#mod-list-active .gb-mod-row.boost'); closeGrowbay();
      return { cleared, until: cg.recoveryBoostUntil, base, after: cg.health - h2, d1: Math.round((h2 - h) * 1000) / 1000, row, left: cropRecoveryBoostDaysLeft() };
    });
    ok(r.cleared && r.d1 === Math.round(r.base * 1000) / 1000 && Math.abs(r.after - r.base) < 1e-9 && !r.row && r.left === 0, `${crop}: a cleared pest opens no window (+${r.base}/day before and after, no growbay row)`);
    await page.close();
  }

  console.log('— wheat still recovers ×2 when thriving (now read from a number, not its prose)');
  {
    const page = await boot({ crop: 'wheat' });
    const r = await page.evaluate(() => {
      const cg = STATE.cropGrowth, step = () => { const h = cg.health; STATE.daysElapsed += 1; tickCropGrowth(); return Math.round((cg.health - h) * 1000) / 1000; };
      cg.health = 80; const hi = step(); cg.health = 50; const lo = step();
      return { hi, lo, mult: MOD.crops.crops.find(c => c.id === 'crop_wheat').strengths.healthy_recovery_multiplier };
    });
    ok(r.mult === 2 && r.hi === 1 && r.lo === 0.5, `wheat at/above healthy +${r.hi}/day, below +${r.lo}/day (healthy_recovery_multiplier ${r.mult})`);
    await page.close();
  }

  console.log('— the window survives save / reload');
  {
    const page = await boot();
    const before = await page.evaluate(() => {
      STATE.cropGrowth.pest = true; clearCropPest(); STATE.daysElapsed += 3; tickCropGrowth();
      return { saved: saveRun(), until: STATE.cropGrowth.recoveryBoostUntil, left: cropRecoveryBoostDaysLeft() };
    });
    await page.reload();
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor && MOD.crops);
    const after = await page.evaluate(() => {
      loadRun(); Math.random = () => 0.99;
      const cg = STATE.cropGrowth; cg.health = 50;
      const left = cropRecoveryBoostDaysLeft();
      const h = cg.health; STATE.daysElapsed += 1; tickCropGrowth();
      return { until: cg.recoveryBoostUntil, left, d: Math.round((cg.health - h) * 1000) / 1000 };
    });
    ok(before.saved && after.until === before.until && after.left === before.left && before.left === 7, `saved with ${before.left} days left; reloaded with ${after.left}`);
    ok(after.d === 1, `after the reload the boost still applies (+${after.d}/day)`);
    await page.close();
  }

  console.log('— the growbay shows the boost only while it runs');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const cg = STATE.cropGrowth; cg.health = 50;
      const read = () => {
        openGrowbay();
        const row = document.querySelector('#mod-list-active .gb-mod-row.boost');
        const out = row ? { name: row.querySelector('.mod-name').textContent, delta: row.querySelector('.mod-delta').textContent, tip: row.getAttribute('title') || row.dataset.tipDescription || '', cls: row.className } : null;
        openInspect();
        const vit = [...document.querySelectorAll('.ins-vital')].map(v => v.textContent).find(t => /^Recovery/.test(t)) || null;
        const notes = (document.querySelector('.ins-notes') || {}).textContent || '';
        closeInspect(); closeGrowbay();
        return { row: out, vit, notes };
      };
      const none = read();
      cg.pest = true; clearCropPest();
      const on = read();
      STATE.daysElapsed += 9; tickCropGrowth();
      const last = read();
      STATE.resources.water = 0; const dry = read(); STATE.resources.water = 100;
      STATE.daysElapsed += 1; tickCropGrowth();
      const off = read();
      return { none, on, last, dry, off };
    });
    ok(!r.none.row && !r.none.vit, 'no boost row or vital before any pest is cleared');
    ok(r.on.row && r.on.row.name === 'Nitrogen fix ×2 · 10d' && r.on.row.delta === '+0.5 health/day' && /positive/.test(r.on.row.cls), `while active: "${r.on.row && r.on.row.name}" ${r.on.row && r.on.row.delta} (the extra it really adds)`);
    ok(r.on.row && /for 10 days after an outbreak is cleared, health recovery runs ×2\. 10 days left\./.test(r.on.row.tip), 'the row carries a tooltip: ' + (r.on.row && r.on.row.tip));
    ok(/×2/.test(r.on.vit || '') && /10d left/.test(r.on.vit || ''), 'Inspect vitals show it: ' + r.on.vit);
    ok(r.last.row && r.last.row.name === 'Nitrogen fix ×2 · 1d' && /1 day left\./.test(r.last.row.tip), 'counts down to its last day: ' + (r.last.row && r.last.row.name));
    ok(r.dry.row && r.dry.row.delta === 'nothing to recover', 'on a day with nothing to recover it says so instead of a number');
    ok(!r.off.row && !r.off.vit, 'gone once the window ends');
    ok(/Once a pest outbreak is cleared, its health recovers ×2 for 10 days\./.test(r.on.notes), 'the species note describes it');
    await page.close();
  }

  console.log('— player-facing copy');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      // Walk the setup wizard to the crop step.
      showScreen('screen-setup');
      for (let i = 0; i < 6 && document.getElementById('setup-category-title').textContent !== 'The Mission'; i++) {
        const card = document.querySelector('#setup-right .sel-card');
        if (card && !document.querySelector('#setup-right .sel-card.selected')) card.click();
        document.getElementById('btn-next').click();
        await new Promise(r => setTimeout(r, 50));
      }
      const cards = [...document.querySelectorAll('#setup-right .sel-card')].map(c => c.textContent);
      // Event preview: PESTS CLEARED only when there is an outbreak to clear.
      const ev = EVENTS.event_shipboard_009, ch = ev.choices.find(c => c.outcome && c.outcome.clears_pest);
      STATE.cropGrowth.pest = false; const clean = outcomeFacts(ch.outcome).map(f => f.text);
      STATE.cropGrowth.pest = true; const pest = outcomeFacts(ch.outcome).map(f => f.text);
      STATE.cropGrowth.pest = false;
      const cleanMsg = ITEM_USE.crop_treatment.use();
      return { title: document.getElementById('setup-category-title').textContent, soy: cards.find(t => /Soybeans/.test(t)), wheat: cards.find(t => /Wheat/.test(t)), clean, pest, cleanMsg };
    });
    ok(r.title === 'The Mission' && /Recovery ×2 for 10d after pests/.test(r.soy || ''), 'setup crop card: ' + r.soy);
    ok(r.soy && !/contamination/i.test(r.soy), 'setup no longer promises unbuilt contamination resistance beyond pests');
    ok(r.wheat && !/fast/i.test(r.wheat), 'setup wheat card makes no speed claim: ' + r.wheat);
    ok(!r.clean.includes('PESTS CLEARED') && r.pest.includes('PESTS CLEARED'), 'event previews promise PESTS CLEARED only when there are pests');
    ok(/^Crop treatment applied\. (\+\d+ crop health|No health to add)\.$/.test(r.cleanMsg), 'the item no longer reports clearing pests that were not there');
    await page.close();
  }

  ok(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(`\nsoybean: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
