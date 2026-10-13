// Harder late legs (ruling 58): over the second half of a trail the event
// draw's difficulty weights move toward hard (map_rules.json
// late_difficulty). Pins the curve, a seeded draw that leans hard late,
// pity relief still pulling toward easy/medium late in the run, and the
// draw's eligibility unchanged (the shift only re-weights).
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.map_rules && typeof selectEvent === 'function');

  // A run on `trail`, departed, with a seeded Math.random, sitting at
  // `frac` of the path (legs flown = visited stops). draw(n, opts) draws
  // n times at a fresh stop of `type` with the once/seen list and the pity
  // counter reset before each draw, so every draw sees the same pool.
  await page.evaluate(() => {
    window.__r58 = {
      setup(trail) {
        localStorage.removeItem('transplant_save_v1');
        applySetupToState({ trail, ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'R' });
        STATE.stowaway = null; returnToHub();
        STATE.flags.add('departed');
      },
      seed(s) { let a = s >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
      at(frac) { const P = pathLegs(); STATE.visited = new Set(Array.from({ length: Math.round(frac * P) }, (_, i) => 'r58_' + i)); return STATE.visited.size / P; },
      tierOf: ev => Array.isArray(ev.difficulty) ? ev.difficulty[0] : (ev.difficulty || 'medium'),
      draw(n, type, relief) {
        const node = { id: 'r58_stop', node_type: type, name: 'R58' };
        const seen = new Set(STATE.seenEventIds);
        const c = { easy: 0, medium: 0, hard: 0, ultra: 0, n: 0, ineligible: [] };
        for (let i = 0; i < n; i++) {
          STATE.seenEventIds = new Set(seen); STATE.hardStreak = 0; STATE.pityRelief = relief || 0;
          const triggers = activeTriggers();
          const ev = selectEvent(node);
          if (!ev) continue;
          if (!eventEligible(ev, node, triggers)) c.ineligible.push(ev.id);
          c[this.tierOf(ev)]++; c.n++;
        }
        STATE.seenEventIds = seen; STATE.hardStreak = 0; STATE.pityRelief = 0;
        c.hardShare = (c.hard + c.ultra) / Math.max(1, c.n);
        return c;
      },
    };
  });

  console.log('— the curve: map_rules.json late_difficulty, per trail');
  {
    const r = await page.evaluate(() => Object.entries(MOD.map_rules.trails).map(([trail, t]) => {
      const base = t.event_difficulty_weights, late = t.late_difficulty;
      const share = w => (w.hard + w.ultra) / Object.values(w).reduce((a, b) => a + b, 0);
      return {
        trail, has: !!late, from: late && late.from_progress,
        early: JSON.stringify(lateDifficultyWeights(t, 0.25)) === JSON.stringify(base),
        atFrom: JSON.stringify(lateDifficultyWeights(t, late.from_progress)) === JSON.stringify(base),
        arrive: Object.keys(late.weights_at_arrival).every(k => Math.abs(lateDifficultyWeights(t, 1)[k] - late.weights_at_arrival[k]) < 1e-9),
        mid: Object.keys(base).every(k => Math.abs(lateDifficultyWeights(t, (1 + late.from_progress) / 2)[k] - (base[k] + late.weights_at_arrival[k]) / 2) < 1e-9),
        past: JSON.stringify(lateDifficultyWeights(t, 1.3)) === JSON.stringify(lateDifficultyWeights(t, 1)),
        shares: [share(base), share(lateDifficultyWeights(t, 0.75)), share(lateDifficultyWeights(t, 1))].map(x => Math.round(x * 100)),
        keepsTiers: Object.keys(base).every(k => !(base[k] > 0) || late.weights_at_arrival[k] > 0),
        ultra: late.weights_at_arrival.ultra,
      };
    }));
    for (const t of r) {
      ok(t.has && t.from >= 0.4 && t.from <= 0.6, `${t.trail}: late_difficulty starts near the midpoint (from_progress ${t.from})`);
      ok(t.early && t.atFrom, `${t.trail}: the first half draws on event_difficulty_weights unchanged`);
      ok(t.arrive && t.mid && t.past, `${t.trail}: a straight line to weights_at_arrival at the destination (and no further)`);
      ok(t.shares[0] < t.shares[1] && t.shares[1] < t.shares[2], `${t.trail}: hard share ${t.shares.join('% → ')}% (start → 3/4 → arrival)`);
      ok(t.keepsTiers, `${t.trail}: every tier the trail weights stays weighted at arrival (re-weights, never removes)`);
      // Ruling 60: the ultra tier is interstellar's late legs only.
      if (t.trail === 'interstellar') ok(t.ultra > 0, `${t.trail}: ultra rises to ${t.ultra} at arrival (0 in the first half)`);
      else ok(t.ultra === 0, `${t.trail}: ultra stays 0`);
    }
  }

  console.log('— seeded draw: late stops lean hard measurably more than early ones');
  for (const [trail, type] of [['lunar', 'planet'], ['mars', 'derelict'], ['interstellar', 'void']]) {
    const r = await page.evaluate(([trail, type]) => {
      const R = window.__r58; R.setup(trail);
      R.seed(5801); const fe = R.at(0.2); const early = R.draw(1500, type);
      R.seed(5801); const fl = R.at(0.95); const late = R.draw(1500, type);
      return { fe, fl, early, late };
    }, [trail, type]);
    ok(r.early.n > 1000 && r.late.n > 1000, `${trail}/${type}: ${r.early.n} early and ${r.late.n} late draws`);
    ok(r.late.hardShare - r.early.hardShare >= 0.05 && r.late.hardShare >= r.early.hardShare * 1.3,
      `${trail}/${type}: hard share ${(100 * r.early.hardShare).toFixed(1)}% at ${(100 * r.fe).toFixed(0)}% of the path → ${(100 * r.late.hardShare).toFixed(1)}% at ${(100 * r.fl).toFixed(0)}%`);
    ok(!r.early.ineligible.length && !r.late.ineligible.length, `${trail}/${type}: every drawn event was eligible at its stop`);
  }

  console.log('— pity relief still pulls toward easy/medium late in the run');
  {
    const r = await page.evaluate(() => {
      const R = window.__r58; R.setup('interstellar');
      const pc = MOD.map_rules.pity_counter;
      R.at(1);
      R.seed(5802); const late = R.draw(1500, 'void', 0);
      R.seed(5802); const relief = R.draw(1500, 'void', 2);
      R.at(0.2);
      R.seed(5802); const earlyRelief = R.draw(1500, 'void', 2);
      // The streak itself: from one short of the threshold, the next hard
      // draw late in the run arms relief and clears the streak.
      R.at(1); R.seed(5803);
      const node = { id: 'r58_stop', node_type: 'void', name: 'R58' };
      const seen = new Set(STATE.seenEventIds);
      let armed = null;
      for (let i = 0; i < 200 && !armed; i++) {
        STATE.seenEventIds = new Set(seen); STATE.hardStreak = pc.consecutive_threshold - 1; STATE.pityRelief = 0;
        const ev = selectEvent(node);
        if (ev && ['hard', 'ultra'].includes(R.tierOf(ev))) armed = { relief: STATE.pityRelief, streak: STATE.hardStreak };
      }
      // Relief then counts down on the easy/medium draws it buys.
      STATE.pityRelief = pc.relief_duration; let left = null;
      for (let i = 0; i < 200 && left === null; i++) {
        STATE.seenEventIds = new Set(seen); STATE.hardStreak = 0; const before = STATE.pityRelief;
        const ev = selectEvent(node);
        if (ev && !['hard', 'ultra'].includes(R.tierOf(ev))) left = [before, STATE.pityRelief];
      }
      STATE.seenEventIds = seen; STATE.pityRelief = 0; STATE.hardStreak = 0;
      return { late, relief, earlyRelief, armed, left, pc };
    });
    ok(r.relief.hardShare < r.late.hardShare / 2, `late, relief cuts the hard share ${(100 * r.late.hardShare).toFixed(1)}% → ${(100 * r.relief.hardShare).toFixed(1)}%`);
    ok(Math.abs(r.relief.hardShare - r.earlyRelief.hardShare) < 0.04, `relief draws the same late as early (${(100 * r.relief.hardShare).toFixed(1)}% vs ${(100 * r.earlyRelief.hardShare).toFixed(1)}% hard): the late shift is suspended`);
    ok(r.armed && r.armed.relief === r.pc.relief_duration && r.armed.streak === 0, `late in the run, hard draw #${r.pc.consecutive_threshold} arms ${r.pc.relief_duration} relief draws and clears the streak (${JSON.stringify(r.armed)})`);
    ok(r.left && r.left[1] === r.left[0] - 1, `an easy/medium draw spends one relief draw (${r.left && r.left.join(' → ')})`);
  }

  console.log('— eligibility unchanged: the shift only re-weights');
  {
    const r = await page.evaluate(() => {
      const R = window.__r58; const out = [];
      for (const trail of ['lunar', 'mars', 'interstellar']) {
        R.setup(trail);
        const rules = MOD.map_rules.trails[trail];
        for (const type of ['station', 'planet', 'derelict', 'asteroid_field', 'nebula', 'anomaly', 'void']) {
          for (const frac of [0.6, 0.8, 1]) {
            R.at(frac);
            const node = { id: 'r58_stop', node_type: type, name: 'R58' };
            const tr = activeTriggers();
            const pool = Object.values(EVENTS).filter(ev => eventEligible(ev, node, tr));
            // An event is drawable when its tier carries weight: the same set
            // under the trail's own table and under the shifted one.
            const live = w => pool.filter(ev => (w[R.tierOf(ev)] ?? 1) > 0).map(ev => ev.id).sort().join();
            // The one tier the shift may bring in is ultra (0 for the first
            // half, rising late on interstellar — ruling 60).
            const noUltra = w => Object.assign({}, w, { ultra: 0 });
            const same = live(noUltra(rules.event_difficulty_weights)) === live(noUltra(lateDifficultyWeights(rules, journeyFrac())));
            out.push({ trail, type, frac, n: pool.length, same });
          }
        }
      }
      return out;
    });
    const bad = r.filter(x => !x.same);
    ok(!bad.length, `${r.length} trail × stop × progress cells: the shifted table makes the same events drawable as the base table${bad.length ? ' — ' + JSON.stringify(bad.slice(0, 3)) : ''}`);
  }

  ok(!errors.length, 'no page errors ' + JSON.stringify(errors.slice(0, 2)));
  console.log(`b5_r58: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
