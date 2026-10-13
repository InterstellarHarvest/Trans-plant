// Lunar/Mars bite (ruling 64): hard-event costs re-pointed at water and food.
//   1. Every option of every edited event renders, resolves in the real
//      engine and applies exactly what its preview lists (the tooltip's
//      "Costs:" line, or the minigame tier it played). The daily draw is
//      held at zero so a water or food figure is the outcome's own.
//   2. No edited option is free (lint's hard-event rule, read off the
//      engine's own facts).
//   3. The hard pool Lunar and Mars can draw costs more water and food
//      than it did before the ruling (figures below).
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const EDITED = ['event_anomaly_003', 'event_asteroid_005', 'event_asteroid_006',
  'event_crisis_004', 'event_crisis_008', 'event_crisis_016', 'event_crisis_017',
  'event_derelict_006', 'event_encounter_toll_001', 'event_encounter_boarding_002',
  'event_general_039', 'event_general_040', 'event_general_041',
  'event_nebula_005', 'event_planet_007', 'event_planet_008',
  'event_shipboard_018', 'event_shipboard_019', 'event_station_015', 'event_station_016'];
// Water + food the hard pool can cost, summed over every way each option
// resolves (each minigame tier, each layered outcome): before ruling 64
// (a168a59) and after it.
const POOL_BEFORE = { lunar: { water: 83, food: 80 }, mars: { water: 83, food: 80 } };
const POOL_AFTER = { lunar: { water: 180, food: 170 }, mars: { water: 180, food: 181 } };
const RES = ['fuel', 'food', 'water', 'o2', 'hull'];
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
      window.__r64 = {
        // Every way an option resolves: [label, merged outcome, tier|null].
        resolutions(ev, ch) {
          if (typeof ch.outcome === 'string') return [[ch.outcome, ev.outcomes[ch.outcome], null]];
          const base = ch.outcome || {};
          if (!ch.launch_minigame) return [['outcome', base, null]];
          return ['perfect', 'good', 'poor'].map(t => {
            const to = (ch.tier_outcomes || {})[t] || {};
            return [t, Object.assign({}, base, to, { resources: Object.assign({}, base.resources || {}, to.resources || {}) }), t];
          });
        },
        // Options: flat choices, layered choices that resolve, the leave row.
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
        setup(ev, ch, via) {
          localStorage.removeItem('transplant_save_v1');
          const role = c => c && (c.requires_crew || (c.gate && c.gate.crew));
          const crew = [...new Set([role(ch), role(via), 'medic', 'chef'].filter(Boolean))].slice(0, CREW_MAX);
          applySetupToState({ trail: 'mars', ai: 'aria', captain: 'veteran', crew, crop: 'wheat', ship: 'B' });
          STATE.stowaway = null;
          STATE.flags.add('departed');
          STATE.goldAmount = 200;
          for (const k of RES_KEYS) STATE.resources[k] = 80;
          const item = ch && (ch.requires_item || (ch.gate && ch.gate.item));
          if (item && !STATE.items.includes(item)) STATE.items.push(item);
          for (const f of [ch && ch.requires_flag, ev.requires_flag].filter(Boolean)) STATE.flags.add(f);
          if (STATE.cropGrowth) STATE.cropGrowth.health = 80;
          const want = (ev.node_type || [])[0] || 'any';
          const node = STATE.nodes.find(n => n.node_type === want) || STATE.byId[STATE.currentId];
          STATE.currentId = node.id;
          // The day's upkeep (food, water, air) held at zero: what moves is
          // the outcome's own figure.
          window.dailyDraw = () => ({ food: 0, o2: 0, water: 0 });
          // A hands-on job rolls its clean-result odds (EFFORT_CHECKS): a low
          // roll lands clean, so the outcome is the authored one in every browser.
          Math.random = () => 0.01;
          return node;
        },
      };
      window.RES_KEYS = ['fuel', 'food', 'water', 'o2', 'hull'];
    });
  };
  await boot();

  console.log('— 1. every option of every edited event: renders, resolves, applies its preview');
  for (const id of EDITED) {
    await boot();
    const opts = await page.evaluate(id => __r64.options(EVENTS[id]), id);
    ok(opts.length >= 2, `${id}: ${opts.length} options`);
    let resolved = 0;
    for (const p of opts) {
      const tiers = await page.evaluate(({ id, p }) => { const ch = __r64.choiceOf(EVENTS[id], p); return ch.launch_minigame ? ['perfect', 'good', 'poor'] : [null]; }, { id, p });
      for (const tier of tiers) {
        const r = await page.evaluate(async ({ id, p, tier }) => {
          const ev = EVENTS[id];
          const ch = __r64.choiceOf(ev, p);
          const entry = ev.layers ? (ev.entryLayer || Object.keys(ev.layers)[0]) : null;
          const via = p.via >= 0 ? ev.layers[entry].choices[p.via] : null;
          const node = __r64.setup(ev, ch, via);
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
          // What the preview promises: the fixed outcome's facts, or for a
          // minigame the tier it plays (merged as resolveChoice merges).
          const [, o] = __r64.resolutions(ev, ch).find(([, , t]) => t === tier);
          const facts = outcomeFacts(withPctPreview(o)).filter(f => !f.good).map(f => f.text);
          const want = {};
          const op = withPctResources(o); // a share of the tank, as it lands now
          for (const k of RES_KEYS) { const v = (op.resources || {})[k]; if (Number.isFinite(v) && v) want[k] = effectiveResDelta(k, v); }
          const before = Object.assign({}, STATE.resources);
          btn.click();
          await wait(500);
          const got = {};
          for (const k of RES_KEYS) { const d = Math.round((STATE.resources[k] - before[k]) * 100) / 100; if (d) got[k] = d; }
          const out = document.getElementById('enc-narr-body').textContent;
          return {
            outcome: !!(STATE.outcomeMode || STATE.currentOutcomeId), want, got, tip, facts,
            tokens: (body + ' ' + out).match(/\{[a-z]+(\.[a-z]+)*\}/g) || [], body: body.length,
          };
        }, { id, p, tier });
        const at = `${id}${p.layer ? '/' + p.layer : ''} "${p.text}"${tier ? ' [' + tier + ']' : ''}`;
        if (r.err) { ok(false, `${at}: ${r.err}`); continue; }
        ok(r.body > 60, `${at}: the event body renders`);
        ok(r.outcome, `${at}: reached an outcome`);
        ok(!r.tokens.length, `${at}: unresolved tokens ${r.tokens.join(' ')}`);
        ok(JSON.stringify(r.got) === JSON.stringify(r.want), `${at}: applied ${JSON.stringify(r.got)}, outcome says ${JSON.stringify(r.want)}`);
        // The tooltip lists every water and food cost it applies (a
        // minigame's tooltip says the tier decides).
        if (tier) ok(/minigame/.test(r.tip), `${at}: tooltip says a minigame decides (${r.tip})`);
        else {
          for (const k of ['water', 'food']) if (r.want[k] < 0) {
            const t = '−' + Math.abs(r.want[k]) + ' ' + (k === 'water' ? 'H2O' : 'FOOD');
            ok(r.tip.includes(t), `${at}: tooltip shows "${t}" (${r.tip})`);
          }
          ok(r.facts.length > 0 || /Takes ([4-9]|1\d) days/.test(r.tip), `${at}: costs something (${r.tip})`);
        }
        resolved++;
      }
    }
    console.log(`  ${id}: ${resolved} resolutions checked`);
  }

  console.log('— 2. the Lunar and Mars hard pools cost more water and food');
  await boot();
  const pool = await page.evaluate(() => {
    const rules = MOD.map_rules.trails;
    const types = trail => {
      const s = new Set(['fork', 'station']);
      for (const tbl of ['node_weights', 'node_weights_start']) for (const [t, w] of Object.entries(rules[trail][tbl] || {})) if (w > 0) s.add(t);
      return s;
    };
    const out = {};
    for (const trail of ['lunar', 'mars']) {
      const ty = types(trail);
      const sum = { water: 0, food: 0, events: 0 };
      for (const ev of Object.values(EVENTS)) {
        const tier = Array.isArray(ev.difficulty) ? ev.difficulty[0] : ev.difficulty;
        if (ev.active === false || tier !== 'hard') continue;
        if (ev.trail && !ev.trail.includes('any') && !ev.trail.includes(trail)) continue;
        const nts = ev.node_type || ['any'];
        if (!nts.includes('any') && !nts.some(t => ty.has(t))) continue;
        sum.events++;
        const outs = [];
        if (ev.outcomes) outs.push(...Object.values(ev.outcomes));
        for (const ch of ev.choices || []) outs.push(...__r64.resolutions(ev, ch).map(([, o]) => o));
        for (const o of outs) for (const k of ['water', 'food']) { const v = (o.resources || {})[k]; if (v < 0) sum[k] -= v; }
      }
      out[trail] = sum;
    }
    return out;
  });
  for (const trail of ['lunar', 'mars']) {
    const p = pool[trail], b = POOL_BEFORE[trail], a = POOL_AFTER[trail];
    console.log(`  ${trail}: ${p.events} hard events, water ${b.water} → ${p.water}, food ${b.food} → ${p.food}`);
    ok(p.water === a.water && p.food === a.food, `${trail}: pool water/food ${p.water}/${p.food} match the recorded ${a.water}/${a.food}`);
    ok(p.water + p.food > b.water + b.food && p.water >= b.water && p.food >= b.food, `${trail}: water + food rose (${b.water + b.food} → ${p.water + p.food})`);
  }

  ok(!errors.length, 'page errors: ' + errors.join(' | '));
  console.log(`\nruling 64: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
