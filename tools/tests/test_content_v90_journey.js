// Variety pass (ruling 90), journey group: three departures (journey_start,
// event_launch_003–005), three midpoints (journey_mid, event_general_054–056)
// and three arrivals (journey_end, event_general_057–059). For every option,
// every trail: the preview equals what lands. Then: each launch event sets
// 'departed' and drops out once the ship has departed; the triggers match.
// Trails: TRAILS=lunar,mars (default all three).
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const TRAILS = (process.env.TRAILS || 'lunar,mars,interstellar').split(',');
const IDS = ['event_launch_003', 'event_launch_004', 'event_launch_005',
  'event_general_054', 'event_general_055', 'event_general_056',
  'event_general_057', 'event_general_058', 'event_general_059'];
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

  console.log('— the journey contract: departed flag, launch exclusivity, triggers');
  await boot();
  const k = await page.evaluate(() => {
    const out = {};
    const L = ['event_launch_003', 'event_launch_004', 'event_launch_005'];
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai: 'aria', captain: 'veteran', crew: ['pilot', 'diplomat'], crop: 'wheat', ship: 'B' });
    STATE.flags.delete('departed');
    const node = STATE.nodes.find(n => n.node_type === 'planet') || STATE.nodes.find(n => n.node_type !== 'station' && n.node_type !== 'fork');
    STATE.visited = new Set(STATE.nodes.map(n => n.id).slice(0, 1));
    const tr = activeTriggers();
    out.start = tr.has('journey_start');
    out.before = L.map(id => eventEligible(EVENTS[id], node, tr));
    out.sets = L.map(id => EVENTS[id].sets_flag);
    STATE.flags.add('departed');
    out.after = L.map(id => eventEligible(EVENTS[id], node, activeTriggers()));
    out.trig = ['event_general_054', 'event_general_055', 'event_general_056', 'event_general_057', 'event_general_058', 'event_general_059'].map(id => EVENTS[id].trigger.join() + (EVENTS[id].once ? '' : ' REPEAT'));
    out.trail059 = (EVENTS.event_general_059.trail || []).join();
    return out;
  });
  ok(k.start && k.before.every(Boolean), `on the first stop, before departure, every new launch event is eligible (${k.before})`);
  ok(k.sets.every(s => s === 'departed'), `every new launch event sets 'departed' (${k.sets})`);
  ok(k.after.every(x => !x), `once departed, no new launch event is eligible (${k.after})`);
  ok(JSON.stringify(k.trig) === JSON.stringify(['journey_mid', 'journey_mid', 'journey_mid', 'journey_end', 'journey_end', 'journey_end']), `midpoint and arrival triggers, all one-shot (${k.trig})`);
  ok(k.trail059 === 'mars', `the dust storm is Mars-only (${k.trail059})`);

  ok(!errors.length, 'page errors: ' + errors.join(' | '));
  console.log(`\nv90 journey: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
