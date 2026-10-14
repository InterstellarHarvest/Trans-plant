// Content batch 2 (ruling 81): twelve easy stop events, three hard station
// dockings, five Interstellar ultra set pieces and four forks (two medium,
// two hard). For every option, every minigame tier, every trail: the preview
// equals what lands (resources, days, per-crew morale). Then the batch's
// contract: every stop type has at least 6 events per tier and an ultra;
// ultras are Interstellar-only set pieces with a hands-on choice; hard
// station events play as the docking; every fork option picks a lane.
// Trails: TRAILS=lunar,mars (default all three).
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const TRAILS = (process.env.TRAILS || 'lunar,mars,interstellar').split(',');
const IDS = ['event_asteroid_010', 'event_nebula_010', 'event_nebula_011', 'event_anomaly_008', 'event_anomaly_009', 'event_anomaly_010',
  'event_derelict_010', 'event_derelict_011', 'event_derelict_012', 'event_void_007', 'event_void_008', 'event_void_009',
  'event_station_022', 'event_station_023', 'event_station_024',
  'event_planet_009', 'event_anomaly_011', 'event_derelict_013', 'event_void_010', 'event_station_025',
  'event_general_042', 'event_general_043', 'event_general_044', 'event_general_045'];
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

  console.log('— the batch contract: pool depth, ultras, station dockings, forks, flags');
  await boot();
  const meta = await page.evaluate(ids => ids.map(id => {
    const ev = EVENTS[id];
    if (!ev) return { id, missing: true };
    const js = JSON.stringify(ev);
    return { id, tier: ev.difficulty, node: (ev.node_type || [])[0], trail: ev.trail || null, timed: !!ev.timed,
      kind: window.StationVisit ? StationVisit.kindOf(ev) : null, mg: (js.match(/"launch_minigame":"(\w+)"/g) || []).length,
      fork: (ev.choices || []).every(c => ['chose_alpha', 'chose_beta'].includes((c.outcome || {}).sets_flag)),
      flags: [...new Set((js.match(/"sets_flag":"[a-z_]+"/g) || []).map(x => x.split(':')[1].replace(/"/g, '')))].filter(f => !f.startsWith('chose_')) };
  }), IDS);
  const payoffs = await page.evaluate(() => Object.keys((MOD.flavor && MOD.flavor.flag_payoffs) || {}));
  for (const m of meta) {
    ok(!m.missing, `${m.id}: loaded`);
    if (m.missing) continue;
    if (m.tier === 'ultra') ok(JSON.stringify(m.trail) === '["interstellar"]' && m.mg >= 1 && m.timed, `${m.id}: ultra set piece — Interstellar only, timed, a hands-on choice (${JSON.stringify(m.trail)}, ${m.mg} minigame)`);
    if (m.node === 'station' && (m.tier === 'hard' || m.tier === 'ultra')) ok(m.kind === 'docking', `${m.id}: ${m.tier} station event plays as the docking (${m.kind})`);
    if (m.node === 'fork') ok(m.fork, `${m.id}: every option picks a lane`);
    for (const f of m.flags) ok(payoffs.includes(f), `${m.id}: flag ${f} has a payoff`);
  }
  const grid = await page.evaluate(() => {
    const g = {};
    for (const ev of Object.values(EVENTS)) {
      if (ev.active === false || !(ev.trigger || ['any']).includes('any') || ['event_station_013', 'event_station_014'].includes(ev.id)) continue;
      const t = Array.isArray(ev.difficulty) ? ev.difficulty[0] : (ev.difficulty || 'medium');
      for (const n of ev.node_type || ['any']) { g[n] = g[n] || { easy: 0, medium: 0, hard: 0, ultra: 0 }; g[n][t]++; }
    }
    return g;
  });
  for (const n of ['planet', 'asteroid_field', 'nebula', 'anomaly', 'derelict', 'void', 'station']) {
    const c = grid[n];
    ok(c.easy >= 6 && c.medium >= 6 && c.hard >= 6 && c.ultra >= 1, `${n}: easy ${c.easy}, medium ${c.medium}, hard ${c.hard}, ultra ${c.ultra} (each tier 6+, an ultra)`);
  }
  ok(grid.fork.medium >= 2 && grid.fork.hard >= 2, `forks: easy ${grid.fork.easy}, medium ${grid.fork.medium}, hard ${grid.fork.hard}`);
  // A fork's text names its branches: the tokens resolve at a real fork.
  const fk = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const ev = EVENTS.event_general_044;
    const node = __t.setup('mars', ev, ev.choices[0], null);
    enterEvent(node, ev); finishAllTyping(); await wait(300);
    return { type: node.node_type, body: document.getElementById('enc-narr-body').textContent };
  });
  ok(fk.type === 'fork' && !/\{branch\./.test(fk.body) && /first stop/.test(fk.body), `fork text resolves its branch tokens at a fork (${fk.body.slice(0, 120)}…)`);

  ok(!errors.length, 'page errors: ' + errors.join(' | '));
  console.log(`\ncontent batch 2: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
