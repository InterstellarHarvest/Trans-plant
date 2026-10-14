// Content batch 3 (ruling 82): twelve events past 200 — crop pests, water
// low, midway, departure, two story follow-ups and the new behind_schedule
// trigger. For every option, every trail: the preview equals what lands.
// Then the contract: the trigger's maths, set_orders "faster" and the named
// orders preview, flag-gated follow-ups, the pest events clear a real
// outbreak, and the game has at least 200 events.
// Trails: TRAILS=lunar,mars (default all three).
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const TRAILS = (process.env.TRAILS || 'lunar,mars,interstellar').split(',');
const IDS = ['event_crisis_026', 'event_crisis_027', 'event_crisis_028', 'event_crisis_029', 'event_crisis_030',
  'event_general_046', 'event_general_047', 'event_general_048', 'event_general_049', 'event_general_050',
  'event_station_026', 'event_shipboard_022', 'event_crisis_031', 'event_crisis_032'];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const boot = async () => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.map_rules && typeof enterEvent === 'function');
    await page.evaluate(() => {
      window.RES_KEYS = ['fuel', 'food', 'water', 'o2', 'hull'];
      window.__t = {
        resolutions(ev, ch) {
          if (typeof ch.outcome === 'string') return [[ch.outcome, ev.outcomes[ch.outcome], null]];
          const base = ch.outcome || {};
          if (!ch.launch_minigame) return [['outcome', base, null]];
          return ['perfect', 'good', 'poor'].map(t => {
            const to = (ch.tier_outcomes || {})[t] || {};
            return [t, Object.assign({}, base, to, { resources: Object.assign({}, base.resources || {}, to.resources || {}) }), t];
          });
        },
        options(ev) {
          const out = [];
          const entry = ev.layers ? (ev.entryLayer || Object.keys(ev.layers)[0]) : null;
          if (ev.choices) ev.choices.forEach((ch, i) => out.push({ layer: null, i, via: -1, text: ch.text }));
          for (const [k, l] of Object.entries(ev.layers || {})) (l.choices || []).forEach((ch, i) => {
            if (ch.back || ch.next || ch.triggerCombat) return;
            out.push({ layer: k, i, via: k === entry ? -1 : ev.layers[entry].choices.findIndex(c => c.next === k), text: ch.text });
          });
          if (ev.leave_as) out.push({ layer: entry, i: -1, via: -1, text: ev.leave_label, leave: true });
          return out;
        },
        choiceOf(ev, p) { return p.leave ? ev.leave_as : (p.layer ? ev.layers[p.layer].choices : ev.choices)[p.i]; },
        setup(trail, ev, ch, via) {
          localStorage.removeItem('transplant_save_v1');
          const role = c => c && (c.requires_crew || (c.gate && c.gate.crew));
          // The roles whose concerns the new events touch, so a concern
          // preview has someone to land on.
          const crew = [...new Set([role(ch), role(via), 'engineer', 'medic', 'botanist', 'diplomat'].filter(r => r && r !== 'any'))].slice(0, CREW_MAX);
          applySetupToState({ trail, ai: 'aria', captain: 'veteran', crew, crop: 'wheat', ship: 'B' });
          STATE.stowaway = null;
          STATE.flags.add('departed');
          STATE.goldAmount = 200;
          for (const k of RES_KEYS) STATE.resources[k] = 80;
          for (const r of STATE.crew) setCrewMorale(50, r);
          const item = ch && (ch.requires_item || (ch.gate && ch.gate.item));
          if (item && !STATE.items.includes(item)) STATE.items.push(item);
          for (const f of [ch && ch.requires_flag, ev.requires_flag].filter(Boolean)) STATE.flags.add(f);
          if (STATE.cropGrowth) { STATE.cropGrowth.health = 80; STATE.cropGrowth.growth = 60; }
          const want = (ev.node_type || [])[0] || 'any';
          const node = STATE.nodes.find(n => n.node_type === want) || STATE.byId[STATE.currentId];
          STATE.currentId = node.id;
          window.dailyDraw = () => ({ food: 0, o2: 0, water: 0 });
          // Days: counted, not lived (the daily morale drift would hide
          // the outcome's own morale figure).
          window.__days = 0;
          window.passDays = (d) => { const n = Math.max(0, Math.round(d)); window.__days += n; STATE.daysElapsed += n; };
          Math.random = () => 0.01;
          return node;
        },
      };
    });
  };

  for (const trail of TRAILS) {
    console.log(`— ${trail}: every option of every new / re-costed event applies its preview`);
    for (const id of IDS) {
      await boot();
      const gated = await page.evaluate(({ id, trail }) => { const ev = EVENTS[id]; return !ev || (ev.trail && !ev.trail.includes(trail)); }, { id, trail });
      if (gated) { console.log(`  ${id}: not on ${trail} (trail gate)`); continue; }
      const opts = await page.evaluate(id => __t.options(EVENTS[id]), id);
      ok(opts.length >= 2, `${trail} ${id}: ${opts.length} options`);
      let resolved = 0;
      for (const p of opts) {
        const tiers = await page.evaluate(({ id, p }) => { const ch = __t.choiceOf(EVENTS[id], p); return ch.launch_minigame ? ['perfect', 'good', 'poor'] : [null]; }, { id, p });
        for (const tier of tiers) {
          const r = await page.evaluate(async ({ id, p, tier, trail }) => {
            const ev = EVENTS[id];
            const ch = __t.choiceOf(ev, p);
            const entry = ev.layers ? (ev.entryLayer || Object.keys(ev.layers)[0]) : null;
            const via = p.via >= 0 ? ev.layers[entry].choices[p.via] : null;
            const node = __t.setup(trail, ev, ch, via);
            if (tier) window.openMinigame = (mg, o, cb) => setTimeout(() => cb(tier, {}), 10);
            enterEvent(node, ev);
            finishAllTyping();
            const wait = ms => new Promise(res => setTimeout(res, ms));
            const btnOf = c => { const i = (STATE._shownChoices || []).indexOf(c); return [...document.querySelectorAll('#enc-choices .enc-choice:not(.leave):not(.advance):not(.locked)')][i]; };
            await wait(300);
            const body = document.getElementById('enc-narr-body').textContent;
            if (via) { const b = btnOf(via); if (!b) return { err: 'cannot open ' + via.next }; b.click(); await wait(400); finishAllTyping(); }
            const btn = p.leave ? document.querySelector('#enc-choices .enc-choice.leave') : btnOf(ch);
            if (!btn) return { err: 'button missing or locked: ' + (lockReason(ch) || '?') };
            const tip = btn.dataset.tipDescription || btn.getAttribute('title') || '';
            const [, o] = __t.resolutions(ev, ch).find(([, , t]) => t === tier);
            const facts = outcomeFacts(withPctPreview(o)).filter(f => !f.good).map(f => f.text);
            const want = {}, fig = {};
            const op = withPctResources(o);
            for (const k of RES_KEYS) { const v = (op.resources || {})[k]; if (Number.isFinite(v) && v) fig[k] = effectiveResDelta(k, v, op); }
            for (const [k, v] of Object.entries(fig)) { const d = clamp(STATE.resources[k] + v, 0, resMax(k)) - STATE.resources[k]; if (d) want[k] = d; }
            // The morale the preview promises: the shared figure for every
            // member (or the one morale_to names), plus each role's concern.
            // HURT lands on whoever is hurt (a crew member, or the captain,
            // who has no morale); an IF LOST concern lands only on a death.
            const mv = Number.isFinite((op.resources || {}).morale) ? effectiveResDelta('morale', op.resources.morale, op) : 0;
            const shared = !STATE.crew.length ? 0 : op.morale_to ? (moraleTargetRole(op.morale_to) ? mv : 0) : mv * STATE.crew.length;
            // The effort tax (the tooltip's "Effort n/5 · −m morale"): every member pays it on click.
            const tax = ch.effort ? effortTax(ch.effort) * STATE.crew.length : 0;
            const cons = outcomeConcerns(op);
            const fixed = cons.filter(c => !c.maybe && c.label !== 'HURT').reduce((a, c) => a + c.v, 0);
            const hurt = cons.filter(c => !c.maybe && c.label === 'HURT').reduce((a, c) => a + c.v, 0);
            const maybe = cons.filter(c => c.maybe).reduce((a, c) => a + c.v, 0);
            const moraleWants = [...new Set([0, hurt, maybe, hurt + maybe].map(x => Math.round((shared - tax + fixed + x) * 100) / 100))];
            const tipDays = (tip.match(/Takes (\d+) day/) || [])[1];
            const before = Object.assign({}, STATE.resources);
            const moBefore = {}; for (const r of STATE.crew) moBefore[r] = crewMoraleOf(r);
            const hpBefore = {}; for (const r of peopleAboard()) hpBefore[r] = hpOf(r);
            window.__days = 0;
            btn.click();
            await wait(500);
            finishAllTyping();
            await wait(50);
            const got = {};
            for (const k of RES_KEYS) { const d = Math.round((STATE.resources[k] - before[k]) * 100) / 100; if (d) got[k] = d; }
            let moGot = 0; const moEach = {};
            for (const r of Object.keys(moBefore)) { const d = STATE.crew.includes(r) ? crewMoraleOf(r) - moBefore[r] : null; moEach[r] = d; if (d != null) moGot += d; }
            moGot = Math.round(moGot * 100) / 100;
            const hurtNow = Object.keys(hpBefore).filter(r => peopleAboard().includes(r) && hpOf(r) < hpBefore[r]);
            const lost = Object.keys(hpBefore).filter(r => !peopleAboard().includes(r));
            const out = document.getElementById('enc-narr-body').textContent;
            // What is on screen: a layered outcome's body, else its narrative (the log line is interpolated the same way).
            const raw = (o.body || o.narrative || '');
            const costWords = {};
            for (const k of ['water', 'food']) if (raw.includes('{cost.' + k + '}')) costWords[k] = numberWords(Math.abs(got[k] || 0));
            return {
              outcome: !!(STATE.outcomeMode || STATE.currentOutcomeId), want, fig, got, tip, facts,
              tokens: (body + ' ' + out).match(/\{[a-z]+(\.[a-z]+)*\}/g) || [], body: body.length,
              days: window.__days, tipDays: tipDays == null ? null : +tipDays, tipNoTime: /Takes no time/.test(tip),
              moraleWants, moGot, moEach, cons, hurtNow, lost, costWords, out, moraleWhy: STATE.moraleWhy,
            };
          }, { id, p, tier, trail });
          const at = `${trail} ${id}${p.layer ? '/' + p.layer : ''} "${p.text}"${tier ? ' [' + tier + ']' : ''}`;
          if (r.err) { ok(false, `${at}: ${r.err}`); continue; }
          ok(r.body > 60, `${at}: the event body renders`);
          ok(r.outcome, `${at}: reached an outcome`);
          ok(!r.tokens.length, `${at}: unresolved tokens ${r.tokens.join(' ')}`);
          ok(JSON.stringify(r.got) === JSON.stringify(r.want), `${at}: applied ${JSON.stringify(r.got)}, preview says ${JSON.stringify(r.want)}`);
          if (!tier) {
            for (const k of ['water', 'food']) if (r.fig[k] < 0) {
              const t = '−' + Math.abs(r.fig[k]) + ' ' + (k === 'water' ? 'H2O' : 'FOOD');
              ok(r.tip.includes(t), `${at}: tooltip shows "${t}" (${r.tip})`);
            }
          }
          if (r.tipDays != null) ok(r.days === r.tipDays, `${at}: took ${r.days} days, tooltip says ${r.tipDays}`);
          else if (r.tipNoTime) ok(r.days === 0, `${at}: took ${r.days} days, tooltip says no time`);
          ok(r.moraleWants.includes(r.moGot), `${at}: crew morale moved ${r.moGot} ${JSON.stringify(r.moEach)}, preview allows ${r.moraleWants.join('/')} (concerns ${JSON.stringify(r.cons)}; hurt ${r.hurtNow}; lost ${r.lost})`);
          for (const [k, w] of Object.entries(r.costWords)) ok(r.out.toLowerCase().includes(w), `${at}: narrative writes the ${k} figure "${w}" (got ${JSON.stringify(r.got)}): ${r.out.slice(0, 160)}`);
          resolved++;
        }
      }
      console.log(`  ${id}: ${resolved} resolutions checked`);
    }
  }

  console.log('— the batch contract: behind_schedule, set_orders, follow-ups, pests, 200+');
  await boot();
  const k = await page.evaluate(() => {
    const out = {};
    const setup = (legs, frac) => {
      localStorage.removeItem('transplant_save_v1');
      applySetupToState({ trail: 'mars', ai: 'aria', captain: 'veteran', crew: ['pilot', 'medic'], crop: 'wheat', ship: 'B' });
      STATE.flags.add('departed');
      const ids = STATE.nodes.map(n => n.id);
      STATE.visited = new Set(ids.slice(0, legs));
      STATE.daysElapsed = Math.round(STATE.baseDays * frac);
    };
    const P = () => pathLegs();
    // Each setup builds a new map: the legs and the days come from that map (frac = visited ÷ pathLegs, as activeTriggers reads them).
    const on = (projected) => { setup(1, 0); const P = pathLegs(); const legs = Math.round(P / 2); STATE.visited = new Set(STATE.nodes.map(n => n.id).slice(0, legs));
      const frac = STATE.visited.size / pathLegs(); STATE.daysElapsed = Math.round(STATE.baseDays * frac * projected); return { hit: activeTriggers().has('behind_schedule'), proj: (STATE.daysElapsed / STATE.baseDays) / frac }; };
    out.ahead = on(0.35).hit;    // the pace projects 35% of the deadline
    out.behind = on(0.93).hit;   // projects 93%
    out.nearly = on(0.86).hit;   // projects 86%
    setup(1, 0); STATE.daysElapsed = Math.round(STATE.baseDays * 0.9); out.early = activeTriggers().has('behind_schedule'); // leg 1: never, however slow
    out.share = SCHEDULE_PROJECTED_SHARE; out.from = SCHEDULE_CHECK_FROM;
    // engine_strain: three PLAID legs in a row through the real travel code; a slower leg resets it.
    setup(1, 0); STATE.orders.pace = 'plaid'; STATE.resources.fuel = 120;
    // Fly one leg forward; at a fork, take the alpha lane so the map has a next stop.
    const fly = () => { let ns = [...nextAvailableNodes()]; if (!ns.length) { STATE.flags.add('chose_alpha'); ns = [...nextAvailableNodes()]; } travelTo(ns[0]); };
    const strain = [];
    for (let i = 0; i < 3; i++) { STATE.currentEvent = null; fly(); strain.push([STATE.plaidLegs, activeTriggers().has('engine_strain')]); }
    STATE.currentEvent = null; STATE.orders.pace = 'ludicrous'; fly(); strain.push([STATE.plaidLegs, activeTriggers().has('engine_strain')]);
    out.strain = strain; out.strainLegs = ENGINE_STRAIN_LEGS;
    // set_orders pace "faster": one notch, never past PLAID; the preview names it.
    setup(4, 0);
    const o = { set_orders: { pace: 'faster' }, resources: {}, time_cost: 'none' };
    STATE.orders.pace = 'ridiculous'; out.factRid = outcomeFacts(o).map(f => f.text); applyOutcomeEffects(o); out.afterRid = STATE.orders.pace;
    STATE.orders.pace = 'plaid'; out.factPlaid = outcomeFacts(o).map(f => f.text); applyOutcomeEffects(o); out.afterPlaid = STATE.orders.pace;
    STATE.orders.rations = 'standard'; out.factRations = outcomeFacts({ set_orders: { rations: 'vending' } }).map(f => f.text);
    out.factSame = outcomeFacts({ set_orders: { rations: 'standard' } }).map(f => f.text);
    // Flag-gated follow-ups: ineligible without the flag, eligible with it.
    const node = t => STATE.nodes.find(n => n.node_type === t) || STATE.byId[STATE.currentId];
    const elig = (id, t) => eventEligible(EVENTS[id], node(t), activeTriggers());
    STATE.flags.delete('left_a_note'); STATE.flags.delete('robot_cat_aboard');
    out.larkNo = elig('event_station_026', 'station'); out.catNo = elig('event_shipboard_022', 'planet');
    STATE.flags.add('left_a_note'); STATE.flags.add('robot_cat_aboard');
    out.larkYes = elig('event_station_026', 'station'); out.catYes = elig('event_shipboard_022', 'planet');
    // A pest event's clearing choice ends a real outbreak.
    STATE.cropGrowth.pest = true; STATE.cropGrowth.health = 60;
    const ch = EVENTS.event_crisis_026.choices[0];
    out.pestFact = outcomeFacts(ch.outcome).map(f => f.text);
    applyOutcomeEffects(ch.outcome); out.pestAfter = !!STATE.cropGrowth.pest;
    out.total = Object.values(EVENTS).filter(e => e.active !== false).length;
    return out;
  });
  ok(k.share === 0.9 && k.from === 0.25, `behind_schedule thresholds: projects ${k.share} of the deadline, from ${k.from} of the trail`);
  ok(!k.ahead && k.behind && !k.nearly && !k.early, `behind_schedule: off when the pace projects 35% (${k.ahead}), on at 93% (${k.behind}), off at 86% (${k.nearly}), off on leg 1 (${k.early})`);
  ok(k.strainLegs === 3 && JSON.stringify(k.strain) === '[[1,false],[2,false],[3,true],[0,false]]', `engine_strain: PLAID legs count 1, 2, 3 (fires), a LUDICROUS leg resets (${JSON.stringify(k.strain)})`);
  ok(k.afterRid === 'ludicrous' && k.factRid.includes('PACE: LUDICROUS SPEED'), `pace "faster" from RIDICULOUS lands LUDICROUS and says so (${k.factRid})`);
  ok(k.afterPlaid === 'plaid' && !k.factPlaid.some(f => /PACE/.test(f)), `pace "faster" at PLAID stays PLAID and promises nothing (${JSON.stringify(k.factPlaid)})`);
  ok(k.factRations.includes('RATIONS: VENDING MACHINE') && !k.factSame.some(f => /RATIONS/.test(f)), `rations change named; no fact for the rations already in force (${k.factRations} / ${JSON.stringify(k.factSame)})`);
  ok(!k.larkNo && !k.catNo && k.larkYes && k.catYes, `follow-ups need their flags (Lark ${k.larkNo}→${k.larkYes}, cat ${k.catNo}→${k.catYes})`);
  ok(k.pestFact.includes('PESTS CLEARED') && !k.pestAfter, `a pest event clears a real outbreak, as previewed (${k.pestFact})`);
  ok(k.total >= 204, `the game has ${k.total} events (204)`);

  ok(!errors.length, 'page errors: ' + errors.join(' | '));
  console.log(`\ncontent batch 3: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
