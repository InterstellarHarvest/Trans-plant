// Late-game bite (ruling 60): the hard events written for planet, asteroid,
// nebula and shipboard stops, and interstellar's ultra tier. Every choice of
// every new event renders and resolves in the real engine (each minigame
// tier too); no choice is free; the ultra events turn up on interstellar's
// late legs only (seeded draw) and count toward the pity counter.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const HARD = ['event_planet_007', 'event_planet_008', 'event_asteroid_005', 'event_asteroid_006',
  'event_nebula_005', 'event_nebula_006', 'event_shipboard_018', 'event_shipboard_019'];
const ULTRA = ['event_asteroid_007', 'event_nebula_007', 'event_shipboard_020'];
const IDS = [...HARD, ...ULTRA];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.stack || e.message));
  const load = async () => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.map_rules && typeof selectEvent === 'function');
  };
  await load();

  console.log('— the data: tiers, repeatability, no free choice');
  const meta = await page.evaluate(ids => (applySetupToState({ trail: 'interstellar', ai: 'ajoy', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'B' }), ids).map(id => {
    const ev = EVENTS[id];
    if (!ev) return { id, missing: true };
    const TC = Object.keys(TIME_COST_DAYS);
    // Every way a choice can resolve: its outcome, or the outcome merged
    // with each minigame tier (resolveChoice's merge), or a quit (the
    // poor tier's losses, eventMinigameQuit).
    const resolutions = ch => {
      const base = ch.outcome || {};
      if (!ch.launch_minigame) return [['outcome', base]];
      const tiers = ch.tier_outcomes || {};
      return ['perfect', 'good', 'poor'].map(t => [t, Object.assign({}, base, tiers[t] || {}, { resources: Object.assign({}, base.resources || {}, (tiers[t] || {}).resources || {}) })]);
    };
    // A real cost (ruling 60: time, fuel, hull or morale — or anything
    // else the preview lists as a loss): a negative resource or share,
    // harm to someone, an item spent, crop or fabricator damage, or four
    // days or more.
    const costOf = o => {
      const res = Object.entries(o.resources || {}).filter(([, v]) => v < 0).map(([k, v]) => k + v);
      const pct = Object.entries(o.resources_pct || {}).filter(([, v]) => v < 0).map(([k, v]) => k + v + '%');
      const harm = o.severity || (o.crew_effect && /kill|injure/.test(o.crew_effect.type || '')) ? ['harm'] : [];
      const other = [o.item_consume && 'item', o.crop_health < 0 && 'crop', o.fab_wear > 0 && 'fab'].filter(Boolean);
      const days = TC.indexOf(o.time_cost || 'trivial') >= TC.indexOf('medium') ? ['days'] : [];
      return [...res, ...pct, ...harm, ...other, ...days];
    };
    const choices = ev.choices.map(ch => ({
      text: ch.text, crew: ch.requires_crew, item: ch.requires_item, mg: ch.launch_minigame || null,
      effort: !!choiceEffort(ch) || !!effortCheckOf(ch),
      free: resolutions(ch).filter(([, o]) => !costOf(o).length).map(([t]) => t),
      costs: resolutions(ch).map(([t, o]) => t + ':' + costOf(o).join('/')),
      lethal: resolutions(ch).some(([, o]) => o.severity === 'lethal'),
      most: Object.values(ch.outcome.resources_pct || {}).some(v => v <= -35),
      // The fixed outcome's preview lists its costs (choiceCostLines).
      preview: choiceCostLines(ch).join(' | '),
    }));
    return { id, tier: ev.difficulty, once: ev.once, node: ev.node_type, trail: ev.trail || null, flat: !ev.layers, choices };
  }), IDS);
  for (const m of meta) {
    ok(!m.missing, `${m.id} exists`);
    if (m.missing) continue;
    const want = ULTRA.includes(m.id) ? 'ultra' : 'hard';
    ok(m.tier === want, `${m.id}: difficulty ${m.tier}`);
    ok(m.choices.length >= 2 && m.flat, `${m.id}: a flat event with ${m.choices.length} choices (no free leave row)`);
    for (const c of m.choices) {
      ok(!c.free.length, `${m.id} "${c.text}": costs something every way it resolves (${c.costs.join(', ')})`);
      ok(c.mg ? /minigame/.test(c.preview) : /Costs: /.test(c.preview) || /Takes ([4-9]|1\d) days/.test(c.preview), `${m.id} "${c.text}": the preview says what it costs (${c.preview})`);
    }
    if (want === 'ultra') {
      ok(JSON.stringify(m.trail) === '["interstellar"]', `${m.id}: trail-gated to interstellar`);
      ok(m.choices.some(c => c.lethal || c.most), `${m.id}: the worst choice can cost a life or most of a resource`);
      ok(m.choices.some(c => c.crew || c.item || c.mg || c.effort), `${m.id}: the best choices need crew, an item, effort or a minigame`);
    }
  }
  const repeat = meta.filter(m => m.once === false).length;
  ok(repeat * 2 >= meta.length, `${repeat}/${meta.length} new events are repeatable (once: false)`);

  console.log('— every choice renders and resolves (each minigame tier)');
  const runs = [];
  for (const m of meta) for (const [i, c] of m.choices.entries()) {
    for (const tier of c.mg ? ['perfect', 'good', 'poor', 'abandoned'] : [null]) runs.push({ id: m.id, i, c, tier });
  }
  for (const r of runs) {
    await load();
    const crew = [r.c.crew || 'chef', r.c.crew === 'medic' ? 'chef' : 'medic'];
    const before = await page.evaluate(({ id, crew, item, tier }) => {
      applySetupToState({ trail: 'interstellar', ai: 'ajoy', captain: 'veteran', crew, crop: 'wheat', ship: 'B' });
      STATE.stowaway = null;
      if (item && !STATE.items.includes(item)) STATE.items.push(item);
      STATE.resources.hull = 90; STATE.resources.fuel = 80;
      if (tier) window.openMinigame = (mg, opts, cb) => setTimeout(() => cb(tier, {}), 10);
      const node = STATE.byId[STATE.currentId];
      enterEvent(node, EVENTS[id]);
      return { hull: STATE.resources.hull, fuel: STATE.resources.fuel };
    }, { id: r.id, crew, item: r.c.item, tier: r.tier });
    await page.waitForTimeout(400);
    const shown = await page.evaluate(() => {
      if (typeof finishAllTyping === 'function') finishAllTyping();
      return { body: document.getElementById('enc-narr-body').textContent, n: document.querySelectorAll('#enc-choices .enc-choice:not(.leave)').length };
    });
    const tag = `${r.id}#${r.i}${r.tier ? '/' + r.tier : ''}`;
    if (r.i === 0 && !r.tier) ok(shown.body.length > 80 && !/\{[a-z]+(\.[a-z]+)?\}/.test(shown.body), `${r.id}: body renders with every token filled`);
    const clicked = await page.evaluate(t => {
      const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => x.textContent.includes(t));
      if (!b || b.classList.contains('locked')) return 'locked:' + (b ? b.textContent : 'missing');
      b.click(); return 'ok';
    }, r.c.text.replace(/\{crew\.\w+\}/, '').trim().slice(0, 22));
    ok(clicked === 'ok', `${tag} "${r.c.text}" is clickable (${clicked})`);
    await page.waitForTimeout(450);
    const st = await page.evaluate(({ id, i, tier }) => {
      const ch = EVENTS[id].choices[i], base = ch.outcome || {};
      const t = tier && tier !== 'abandoned' ? (ch.tier_outcomes || {})[tier] || {} : {};
      const poor = (ch.tier_outcomes || {}).poor || {};
      // What the hull should have lost: the merged outcome, or a quit's
      // worst-case losses (the poor tier over the base).
      const res = tier === 'abandoned' ? Object.assign({}, base.resources, poor.resources) : Object.assign({}, base.resources, t.resources);
      return {
        outcome: !!STATE.outcomeMode, ended: !!STATE.ended || document.getElementById('screen-end').classList.contains('active'),
        hull: STATE.resources.hull, fuel: STATE.resources.fuel, wantHull: res.hull || 0, pct: base.resources_pct || null,
        // A hands-on job short of effort adds its own setback (EFFORT_CHECKS con).
        conHull: ((effortCheckOf(ch) || {}).con || {}).hull || 0,
        text: document.getElementById('enc-narr-body').textContent,
      };
    }, { id: r.id, i: r.i, tier: r.tier });
    ok(st.outcome || st.ended, `${tag} reached an outcome${st.ended ? ' (the run ended)' : ''}`);
    if (!st.ended) {
      ok(st.hull === before.hull + st.wantHull || (st.conHull && st.hull === before.hull + st.wantHull + st.conHull), `${tag} hull ${before.hull} → ${st.hull} (authored ${st.wantHull}${st.conHull ? ', ' + st.conHull + ' short of effort' : ''})`);
      if (st.pct && st.pct.fuel) ok(st.fuel === before.fuel + Math.round(before.fuel * st.pct.fuel / 100), `${tag} fuel ${before.fuel} → ${st.fuel} (${st.pct.fuel}% of the tank)`);
      ok(!/\{[a-z]+(\.[a-z]+)?\}/.test(st.text), `${tag} outcome text has every token filled`);
    }
  }

  console.log('— where they can fire: every trail for hard, interstellar late legs for ultra');
  await load();
  await page.evaluate(() => {
    window.__r60 = {
      setup(trail) {
        localStorage.removeItem('transplant_save_v1');
        applySetupToState({ trail, ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'R' });
        STATE.stowaway = null; returnToHub();
        STATE.flags.add('departed');
      },
      seed(s) { let a = s >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
      at(frac) { const P = pathLegs(); STATE.visited = new Set(Array.from({ length: Math.round(frac * P) }, (_, i) => 'r60_' + i)); return STATE.visited.size / P; },
      // A planet stop whose biome is (or isn't) in `want`.
      node(type, want) {
        for (let k = 0; k < 400; k++) {
          const n = { id: 'r60_stop_' + k, node_type: type, name: 'R60' };
          if (type !== 'planet' || !want || want.includes(SceneArt.biomeFor(null, n))) return n;
        }
      },
      // n seeded draws at a fresh stop, once/seen and pity reset each time.
      draw(n, type, ids) {
        const node = this.node(type);
        const seen = new Set(STATE.seenEventIds);
        const hits = {}; let total = 0;
        for (let i = 0; i < n; i++) {
          STATE.seenEventIds = new Set(seen); STATE.hardStreak = 0; STATE.pityRelief = 0;
          const ev = selectEvent(node);
          if (!ev) continue;
          total++;
          if (ids.includes(ev.id)) hits[ev.id] = (hits[ev.id] || 0) + 1;
        }
        STATE.seenEventIds = seen; STATE.hardStreak = 0; STATE.pityRelief = 0;
        return { total, hits, n: Object.values(hits).reduce((a, b) => a + b, 0) };
      },
    };
  });
  {
    const r = await page.evaluate(ids => {
      const R = window.__r60, out = [];
      for (const trail of ['lunar', 'mars', 'interstellar']) {
        R.setup(trail); R.at(0.8);
        for (const id of ids) {
          const ev = EVENTS[id];
          const types = ev.node_type.includes('any') ? ['station', 'planet', 'asteroid_field', 'nebula'] : ev.node_type;
          const drawable = types.filter(t => { const n = R.node(t, ev.biome); return eventEligible(ev, n, activeTriggers()); });
          // ...and the map really makes that kind of stop on this trail.
          const made = types.filter(t => (MOD.map_rules.trails[trail].node_weights[t] || 0) > 0);
          out.push({ trail, id, drawable, made });
        }
      }
      return out;
    }, HARD);
    for (const x of r) ok(x.drawable.length && x.drawable.some(t => x.made.includes(t)), `${x.id} is drawable on ${x.trail} (${x.drawable.join('/')}; the map makes ${x.made.join('/') || 'none'})`);
    const bio = await page.evaluate(() => {
      const R = window.__r60; R.setup('mars'); R.at(0.8);
      const ev = EVENTS.event_planet_008;
      const wrong = R.node('planet', ['ice', 'volcanic', 'desert']);
      return { wrong: eventEligible(ev, wrong, activeTriggers()), right: eventEligible(ev, R.node('planet', ev.biome), activeTriggers()) };
    });
    ok(bio.right && !bio.wrong, `event_planet_008 fires on its biomes only (listed ${bio.right}, ice/volcanic/desert ${bio.wrong})`);
  }
  {
    const r = await page.evaluate(ids => {
      const R = window.__r60, out = {};
      for (const trail of ['lunar', 'mars', 'interstellar']) {
        R.setup(trail);
        for (const [label, frac] of [['early', 0.25], ['mid', 0.5], ['late', 0.95]]) {
          R.at(frac);
          for (const type of ['asteroid_field', 'nebula', 'station', 'void', 'planet']) {
            R.seed(6001);
            const d = R.draw(600, type, ids);
            out[trail + '/' + label + '/' + type] = d;
          }
        }
      }
      return out;
    }, ULTRA);
    for (const trail of ['lunar', 'mars']) {
      const n = Object.entries(r).filter(([k]) => k.startsWith(trail + '/')).reduce((s, [, d]) => s + d.n, 0);
      const draws = Object.entries(r).filter(([k]) => k.startsWith(trail + '/')).reduce((s, [, d]) => s + d.total, 0);
      ok(n === 0 && draws > 5000, `${trail}: 0 ultra events in ${draws} seeded draws, early to arrival`);
    }
    for (const label of ['early', 'mid']) {
      const n = ['asteroid_field', 'nebula', 'station', 'void', 'planet'].reduce((s, t) => s + r[`interstellar/${label}/${t}`].n, 0);
      ok(n === 0, `interstellar ${label} (${label === 'early' ? 25 : 50}% of the path): 0 ultra draws`);
    }
    for (const [type, id] of [['asteroid_field', 'event_asteroid_007'], ['nebula', 'event_nebula_007'], ['station', 'event_shipboard_020'], ['void', 'event_shipboard_020']]) {
      const d = r[`interstellar/late/${type}`];
      ok((d.hits[id] || 0) > 0, `interstellar late, ${type}: ${id} drawn ${d.hits[id] || 0}/${d.total} (all ultra ${d.n})`);
    }
  }
  {
    const r = await page.evaluate(() => {
      const R = window.__r60; R.setup('interstellar'); R.at(0.95);
      const pc = MOD.map_rules.pity_counter;
      const w = lateDifficultyWeights(MOD.map_rules.trails.interstellar, journeyFrac());
      // An ultra draw is a hard draw for the pity counter: from one short of
      // the threshold, it arms relief.
      STATE.hardStreak = pc.consecutive_threshold - 1; STATE.pityRelief = 0;
      drawWeightedEvent([EVENTS.event_shipboard_020], activeTriggers(), w, null);
      const armed = { relief: STATE.pityRelief, streak: STATE.hardStreak };
      // Under relief the ultra tier carries no weight at all.
      STATE.pityRelief = 2;
      const rules = MOD.map_rules.trails.interstellar;
      const reliefUltra = (rules.event_difficulty_weights.ultra || 0) * 0.1;
      STATE.pityRelief = 0; STATE.hardStreak = 0;
      return { armed, pc, w, reliefUltra, arrival: rules.late_difficulty.weights_at_arrival.ultra, early: rules.event_difficulty_weights.ultra };
    });
    ok(r.armed.relief === r.pc.relief_duration && r.armed.streak === 0, `an ultra draw counts toward the pity counter (${JSON.stringify(r.armed)})`);
    ok(r.early === 0 && r.arrival >= 10 && r.arrival <= 15, `interstellar ultra weight 0 for the first half → ${r.arrival} at arrival (${r.w.ultra.toFixed(1)} at 95%)`);
    ok(r.reliefUltra === 0, 'pity relief draws no ultra');
  }

  ok(!errors.length, 'no page errors ' + JSON.stringify(errors.slice(0, 2)));
  console.log(`b5_r60b: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
