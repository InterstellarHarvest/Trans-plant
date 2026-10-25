// Balance pass + owner rulings 2026-10-10 (round 3): O2 draw, mouths,
// effort system, REPAIR materials, path legs, day carry, score, harvest
// surplus, display rounding.
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
    applySetupToState(Object.assign({ trail: 'mars', ai: 'aria', captain: 'veteran', crew: ['pilot', 'medic'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForTimeout(200);
  page._errs = errs;
  return page;
}

(async () => {
  browser = await chromium.launch();

  console.log('— O2 and mouths');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      STATE.cropGrowth.health = 20; STATE.cropGrowth.lastTickDay = STATE.daysElapsed + 1000; // sick crop: no help with the air
      STATE.resources.o2 = 100; STATE.resources.food = 100; passDays(10);
      const o2 = STATE.resources.o2, food = STATE.resources.food;
      STATE.items.push('o2_recycler'); STATE.resources.o2 = 100; passDays(10);
      const o2rec = STATE.resources.o2;
      STATE.items = STATE.items.filter(i => i !== 'o2_recycler'); STATE.cropGrowth.health = 90; STATE.resources.o2 = 100; passDays(10);
      return { o2, food, o2rec, o2crop: STATE.resources.o2, mouths: mouthsMult(), perDay: MOD.map_rules.trails.mars.o2_per_day, cropMult: CROP_O2_DRAW_MULT };
    });
    // Ruling 97: the trail's o2_per_day (Mars 0.4); a healthy crop takes a quarter off.
    const near = (a, b) => Math.abs(a - b) < 0.011;
    ok(near(r.o2, 100 - 10 * r.perDay), `O2 drains the trail's ${r.perDay}/day (${r.o2})`);
    ok(near(r.o2rec, 100 - 5 * r.perDay), `recycler halves it (${r.o2rec})`);
    ok(r.cropMult === 0.75 && near(r.o2crop, 100 - 10 * r.perDay * r.cropMult), `a healthy crop makes some of the air — a quarter off (${r.o2crop})`);
    ok(Math.abs(r.mouths - 1) < 1e-9 && r.food === 95, `captain + 2 crew = reference burn (×${r.mouths}, food ${r.food})`);
    await page.close();
    const solo = await boot({ crew: [] });
    const s = await solo.evaluate(() => mouthsMult());
    await solo.close();
    const kaz = await boot({ crew: ['engineer', 'pilot'] });
    const k = await kaz.evaluate(() => mouthsMult());
    await kaz.close();
    ok(Math.abs(s - 1 / 3) < 1e-9 && Math.abs(k - 4 / 3) < 1e-9, `solo eats a third (×${s.toFixed(2)}), Kazuki eats double (×${k.toFixed(2)})`);
  }

  console.log('— effort system');
  {
    const run = async setup => {
      const page = await boot(setup);
      const r = await page.evaluate(() => {
        const ev = EVENTS.event_crisis_001;
        const ch = ev.choices.find(c => Number.isFinite(c.effort_required));
        const eff = choiceEffort(ch);
        STATE.cropGrowth.lastTickDay = STATE.daysElapsed;
        enterEvent(STATE.byId[STATE.currentId], ev);
        const btn = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.textContent.includes(ch.text.slice(0, 18)));
        const sub = btn ? btn.textContent : '';
        const d0 = STATE.daysElapsed, kits0 = STATE.items.filter(i => i === 'repair_kit').length;
        btn.click();
        return { eff, sub, days: STATE.daysElapsed - d0, kitsUsed: kits0 - STATE.items.filter(i => i === 'repair_kit').length };
      });
      await page.close(); return r;
    };
    const strong = await run({ crew: ['engineer', 'pilot'] });   // engineer + kit + pilot + captain
    const weak = await run({ crew: ['chef'] });
    ok(strong.eff.available > strong.eff.required && strong.days < weak.days, `engineer + kit finish faster (${strong.days}d vs ${weak.days}d; effort ${strong.eff.available} vs ${weak.eff.available} / ${strong.eff.required})`);
    ok(/Effort \d+ \/ \d+ · \d+ days?/.test(strong.sub), `choice shows its effort (${strong.sub.replace(/\s+/g, ' ').slice(0, 70)})`);
    ok(strong.kitsUsed === 1, 'the repair kit is used up');
  }

  console.log('— REPAIR materials');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      window.openEngineRepair = cb => setTimeout(() => cb({ fixedCount: 4, allFixed: true }), 0);
      showScreen('screen-cruise'); renderCruise();
      const start = Object.assign({}, STATE.materials);
      STATE.resources.hull = 50;
      document.getElementById('stop-btn').click();
      await new Promise(r => setTimeout(r, 150));
      const rep = () => [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /REPAIR/.test(b.textContent));
      rep().click();
      await new Promise(r => setTimeout(r, 200));
      const after = Object.assign({}, STATE.materials), hull = STATE.resources.hull;
      // spend the rest with a second REPAIR (2 metal + 1 scrap left), then the menu must lock
      rep().click();
      await new Promise(r => setTimeout(r, 200));
      const b = rep();
      return { start, after, hull, lockedText: b ? b.textContent : 'none', locked: b ? b.classList.contains('locked') : null };
    });
    ok(r.start.metal === 4 && r.start.scrap === 2, `ship stores: 4 metal, 2 scrap (${JSON.stringify(r.start)})`);
    ok(r.after.metal === 2 && r.after.scrap === 1 && r.hull === 70, `REPAIR spends 2 metal + 1 scrap, +20 hull (${JSON.stringify(r.after)}, hull ${r.hull})`);
    ok(r.locked && /2 metal \+ 1 scrap/i.test(r.lockedText), 'without materials REPAIR is locked and says why (' + r.lockedText.replace(/\s+/g, ' ').slice(0, 60) + ' locked=' + r.locked + ')');
    await page.close();
  }

  console.log('— travel, score, harvest, display');
  {
    const page = await boot({ trail: 'interstellar' });
    const r = await page.evaluate(() => {
      const legs = pathLegs();
      // walk the path at RIDICULOUS with no events: total travel days ≈ travel_days
      let days = 0, guard = 0;
      while (connectionsOf(STATE.byId[STATE.currentId]).length && guard++ < 80) {
        STATE.resources.fuel = 100; STATE.resources.food = 100; STATE.resources.water = 100; STATE.resources.o2 = 100; STATE.resources.hull = 100; setCrewMorale(100); STATE.cropGrowth.health = 90; STATE.cropGrowth.pest = false; STATE.flags.add('crop_death_accepted');
        const d0 = STATE.daysElapsed;
        const n = [...nextAvailableNodes()][0] || connectionsOf(STATE.byId[STATE.currentId])[0];
        if (STATE.byId[STATE.currentId].node_type === 'fork') STATE.flags.add('chose_alpha');
        travelTo(n, { skipEvent: true });
        days += STATE.daysElapsed - d0;
        if (STATE.ended) break;
      }
      return { legs, days, base: STATE.baseDays, travel: MOD.map_rules.trails.interstellar.travel_days, ended: STATE.ended };
    });
    // Ruling 99: the path takes the trail's travel_days; the deadline is set apart from it.
    ok(Math.abs(r.days / r.travel - 1) < 0.05 && r.travel < r.base, `path travel ≈ the trail's travel_days (${r.days}/${r.travel} over ${r.legs} legs; deadline ${r.base})`);
    await page.close();
    const p2 = await boot();
    const sc = await p2.evaluate(() => {
      // Ruling 99: the deadline sits close to a careful run's length (Mars
      // brackets from map_rules score_brackets).
      Object.assign(STATE.resources, { fuel: 60, food: 60, water: 60, o2: 60, hull: 60 }); setCrewMorale(60);
      STATE.daysElapsed = Math.round(STATE.baseDays * 0.96);
      const mid = { v: scoreValue(), b: scoreBracket() };
      Object.assign(STATE.resources, { fuel: 95, food: 95, water: 95, o2: 95, hull: 95 }); setCrewMorale(95);
      STATE.daysElapsed = Math.round(STATE.baseDays * 0.85);
      const top = { v: scoreValue(), b: scoreBracket() };
      Object.assign(STATE.resources, { fuel: 30, food: 30, water: 30, o2: 30, hull: 50 }); setCrewMorale(30);
      STATE.daysElapsed = Math.round(STATE.baseDays * 1.06);
      const late = { v: scoreValue(), b: scoreBracket() };
      return { mid, top, late, brackets: MOD.map_rules.trails.mars.score_brackets };
    });
    ok(sc.mid.b === 'good' && sc.top.b === 'legendary' && sc.late.b === 'rough', `brackets ${JSON.stringify(sc.brackets)}: middling run "good" (${sc.mid.v.toFixed(0)}), excellent run "legendary" (${sc.top.v.toFixed(0)}), a worn late arrival "rough" (${sc.late.v.toFixed(0)})`);
    const h = await p2.evaluate(() => {
      STATE.resources.food = 95; STATE.items = [];
      STATE.cropGrowth.growth = 100; STATE.cropGrowth.health = 80; STATE.cropGrowth.pest = false; STATE.cropGrowth.lastTickDay = STATE.daysElapsed;
      openGrowbay(); doHarvest(); closeGrowbay();
      return { food: STATE.resources.food, bricks: STATE.items.filter(i => i === 'ration_brick').length };
    });
    ok(h.food === 100 && h.bricks === 3, `full stores: wheat surplus becomes ration bricks (${JSON.stringify(h)})`);
    const d = await p2.evaluate(() => { STATE.resources.food = 0.4; renderHUD(); return document.querySelector('#hud-enc .hud-r.food, .hud .hud-r.food').textContent; });
    ok(/^\s*1\s*$/.test(d), `a sliver of food reads 1, not 0 (${d.trim()})`); // dots + numbers, no letter codes (ruling 16)
    ok(!p2._errs.length, 'no page errors' + (p2._errs.length ? ': ' + p2._errs.join(' | ') : ''));
    await p2.close();
  }

  console.log(`\nbalance: ${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
