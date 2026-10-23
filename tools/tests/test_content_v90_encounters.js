// v90 encounters (variety pass, ruling 90): three new traders and two new
// pirates sharing the old single trader's / pirate's draw weight. For every
// non-combat, non-market option of every layer (walked from the entry
// layer, however deep), every trail: the preview equals what lands. The
// market choices open the market and come back to their layer; the combat
// choices mount the fight. Then the draw-weight contract: the traders and
// the pirates each sum to the old single event's weight.
// Trails: TRAILS=lunar,mars (default all three).
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const TRAILS = (process.env.TRAILS || 'lunar,mars,interstellar').split(',');
const IDS = ['event_encounter_trader_002', 'event_encounter_trader_003', 'event_encounter_trader_004',
  'event_encounter_pirate_002', 'event_encounter_pirate_003'];
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
        // Path to each layer: [[layer, choiceIndex], ...] from the entry layer (BFS).
        paths(ev) {
          const entry = ev.entryLayer || Object.keys(ev.layers)[0];
          const P = { [entry]: [] }, q = [entry];
          while (q.length) { const k = q.shift(); (ev.layers[k].choices || []).forEach((c, i) => { if (c.next && !(c.next in P)) { P[c.next] = P[k].concat([[k, i]]); q.push(c.next); } }); }
          return P;
        },
        options(ev, kinds) {
          const want = kinds || 'outcome';
          const out = [];
          const entry = ev.layers ? (ev.entryLayer || Object.keys(ev.layers)[0]) : null;
          if (ev.choices && want === 'outcome') ev.choices.forEach((ch, i) => out.push({ layer: null, i, path: [], text: ch.text }));
          const P = ev.layers ? this.paths(ev) : {};
          for (const [k, l] of Object.entries(ev.layers || {})) (l.choices || []).forEach((ch, i) => {
            if (ch.back || ch.next) return;
            const kind = ch.triggerCombat ? 'combat' : ch.open_market ? 'market' : 'outcome';
            if (kind !== want) return;
            out.push({ layer: k, i, path: P[k] || null, text: ch.text });
          });
          if (ev.leave_as && want === 'outcome') out.push({ layer: entry, i: -1, path: [], text: ev.leave_label, leave: true });
          return out;
        },
        choiceOf(ev, p) { return p.leave ? ev.leave_as : (p.layer ? ev.layers[p.layer].choices : ev.choices)[p.i]; },
        setup(trail, ev, ch, vias) {
          localStorage.removeItem('transplant_save_v1');
          const role = c => c && (c.requires_crew || (c.gate && c.gate.crew));
          // The roles whose concerns the new events touch, so a concern
          // preview has someone to land on.
          const crew = [...new Set([role(ch), ...vias.map(role), 'engineer', 'medic', 'botanist', 'diplomat'].filter(r => r && r !== 'any'))].slice(0, CREW_MAX);
          applySetupToState({ trail, ai: 'aria', captain: 'veteran', crew, crop: 'wheat', ship: 'B' });
          STATE.stowaway = null;
          STATE.flags.add('departed');
          STATE.goldAmount = 200;
          for (const k of RES_KEYS) STATE.resources[k] = 80;
          for (const r of STATE.crew) setCrewMorale(50, r);
          for (const c of [ch, ...vias]) {
            const item = c && (c.requires_item || (c.gate && c.gate.item));
            if (item && !STATE.items.includes(item)) grantItem(item);
          }
          for (const f of [ch && ch.requires_flag, ...vias.map(v => v.requires_flag), ev.requires_flag].filter(Boolean)) STATE.flags.add(f);
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
      ok(opts.every(p => p.path), `${trail} ${id}: every layer is reachable from the entry`);
      let resolved = 0;
      for (const p of opts) {
        const tiers = await page.evaluate(({ id, p }) => { const ch = __t.choiceOf(EVENTS[id], p); return ch.launch_minigame ? ['perfect', 'good', 'poor'] : [null]; }, { id, p });
        for (const tier of tiers) {
          const r = await page.evaluate(async ({ id, p, tier, trail }) => {
            const ev = EVENTS[id];
            const ch = __t.choiceOf(ev, p);
            const vias = (p.path || []).map(([k, i]) => ev.layers[k].choices[i]);
            const node = __t.setup(trail, ev, ch, vias);
            if (tier) window.openMinigame = (mg, o, cb) => setTimeout(() => cb(tier, {}), 10);
            enterEvent(node, ev);
            finishAllTyping();
            const wait = ms => new Promise(res => setTimeout(res, ms));
            const btnOf = c => { const i = (STATE._shownChoices || []).indexOf(c); return [...document.querySelectorAll('#enc-choices .enc-choice:not(.leave):not(.advance):not(.locked)')][i]; };
            await wait(300);
            const body = document.getElementById('enc-narr-body').textContent;
            for (const via of vias) { const b = btnOf(via); if (!b) return { err: 'cannot open ' + via.next + ' (' + (lockReason(via) || 'not shown') + ')' }; b.click(); await wait(400); finishAllTyping(); }
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

  console.log('— market and combat choices: the market opens and returns to its layer; combat mounts');
  for (const id of IDS) {
    for (const kind of ['market', 'combat']) {
      await boot();
      const opts = await page.evaluate(({ id, kind }) => __t.options(EVENTS[id], kind), { id, kind });
      for (const p of opts) {
        await boot();
        const r = await page.evaluate(async ({ id, p, kind }) => {
          const ev = EVENTS[id];
          const ch = __t.choiceOf(ev, p);
          const vias = (p.path || []).map(([k, i]) => ev.layers[k].choices[i]);
          const node = __t.setup('mars', ev, ch, vias);
          enterEvent(node, ev);
          finishAllTyping();
          const wait = ms => new Promise(res => setTimeout(res, ms));
          const btnOf = c => { const i = (STATE._shownChoices || []).indexOf(c); return [...document.querySelectorAll('#enc-choices .enc-choice:not(.leave):not(.advance):not(.locked)')][i]; };
          await wait(300);
          for (const via of vias) { const b = btnOf(via); if (!b) return { err: 'cannot open ' + via.next }; b.click(); await wait(400); finishAllTyping(); }
          const layerBefore = STATE.layerStack[STATE.layerStack.length - 1];
          const btn = btnOf(ch);
          if (!btn) return { err: 'button missing or locked: ' + (lockReason(ch) || '?') };
          const tip = btn.dataset.tipDescription || btn.getAttribute('title') || '';
          btn.click();
          await wait(kind === 'combat' ? 900 : 400);
          if (kind === 'market') {
            const open = MarketModal.isOpen();
            const subject = (document.getElementById('enc-subject-name') || {}).textContent || '';
            MarketModal.close();
            await wait(400); finishAllTyping();
            const back = STATE.layerStack[STATE.layerStack.length - 1];
            return { open, subject, back, layerBefore, shown: (STATE._shownChoices || []).length, outcome: !!STATE.currentOutcomeId };
          }
          const mounted = document.getElementById('screen-encounter').classList.contains('combat-mode');
          const narr = document.getElementById('enc-narrative').textContent;
          window.abortCombat && abortCombat();
          return { mounted, tip, narr, intro: ch.combat_intro ? ev.outcomes[ch.combat_intro].title : null };
        }, { id, p, kind });
        const at = `${id}/${p.layer} "${p.text}"`;
        if (r.err) { ok(false, `${at}: ${r.err}`); continue; }
        if (kind === 'market') {
          ok(r.open, `${at}: opens the market (${r.subject})`);
          ok(r.back === r.layerBefore && r.shown > 0 && !r.outcome, `${at}: closing returns to ${r.layerBefore} (${r.back}, ${r.shown} choices)`);
        } else {
          ok(r.mounted, `${at}: mounts ship-to-ship combat`);
          ok(/combat/i.test(r.tip), `${at}: tooltip says it is a fight (${r.tip})`);
          if (r.intro) ok(r.narr.includes(r.intro), `${at}: combat_intro "${r.intro}" opens the fight (${r.narr.slice(0, 80)})`);
        }
      }
      console.log(`  ${id}: ${opts.length} ${kind} choice(s) checked`);
    }
  }

  console.log("— draw weights: the traders and the pirates keep the old single event's share");
  await boot();
  const w = await page.evaluate(() => {
    const T = ['event_encounter_trader_001', 'event_encounter_trader_002', 'event_encounter_trader_003', 'event_encounter_trader_004'].map(i => EVENTS[i]);
    const P = ['event_encounter_pirate_001', 'event_encounter_pirate_002', 'event_encounter_pirate_003'].map(i => EVENTS[i]);
    const sum = a => Math.round(a.reduce((s, e) => s + e.draw_weight, 0) * 1000) / 1000;
    const same = (a, k) => new Set(a.map(e => JSON.stringify(e[k]))).size === 1;
    // drawWeightedEvent itself, swept over Math.random: against one weight-1
    // filler of the same tier, the family should win exactly what the single
    // event did (half).
    const base = { easy: 1, medium: 1, hard: 1, ultra: 1 };
    const share = (pool, ids) => {
      const orig = Math.random, hs = STATE.hardStreak, pr = STATE.pityRelief; let n = 0;
      for (let i = 0; i < 4000; i++) { Math.random = () => (i + 0.5) / 4000; if (ids.includes(drawWeightedEvent(pool, new Set(['any']), base, null).id)) n++; }
      Math.random = orig; STATE.hardStreak = hs; STATE.pityRelief = pr; return n / 4000;
    };
    const fill = tier => ({ id: 'filler', difficulty: tier, trigger: ['any'] });
    const tShare = share([fill('easy'), ...T], T.map(e => e.id)), pShare = share([fill('medium'), ...P], P.map(e => e.id));
    const tags = a => a.map(e => JSON.stringify(eventBranchTags(e)));
    return { tSum: sum(T), pSum: sum(P), tSame: ['difficulty', 'node_type', 'trigger', 'once'].every(k => same(T, k)), pSame: ['difficulty', 'node_type', 'trigger', 'once'].every(k => same(P, k)),
      tShare, pShare, tTags: tags(T), pTags: tags(P) };
  });
  ok(w.tSum === 1 && w.pSum === 1, `draw weights sum to one old event: traders ${w.tSum}, pirates ${w.pSum}`);
  ok(w.tSame && w.pSame, 'each family shares difficulty, node_type, trigger and once with its original');
  ok(Math.abs(w.tShare - 0.5) < 0.01 && Math.abs(w.pShare - 0.5) < 0.01, `against one weight-1 filler the family wins half the draws, as the single event did (traders ${w.tShare}, pirates ${w.pShare})`);
  ok(new Set(w.tTags).size === 1 && new Set(w.pTags).size === 1, `branch tags match within each family (traders ${[...new Set(w.tTags)]}, pirates ${[...new Set(w.pTags)]})`);

  ok(!errors.length, 'page errors: ' + errors.join(' | '));
  console.log(`\nv90 encounters: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
