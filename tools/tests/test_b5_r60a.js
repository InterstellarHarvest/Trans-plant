// Late-game bite (ruling 60): no hard event has a free option, and the new
// hard events load, render and resolve.
//   1. Every option of every active hard/ultra event costs something the
//      engine itself shows: a cost in outcomeFacts (what the tooltip's
//      "Costs:" line lists), time past the low tier, an effort tax or a
//      gold charge — a minigame choice in every tier, a fight always. A
//      layered event's leave row is locked or a costed leave_as.
//   2. The same, read off the rendered buttons: each option's tooltip
//      states its cost (previews equal outcomes).
//   3. Every option of every new event, clicked in the real engine: it
//      resolves, applies what its outcome says, and throws no page error.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const NEW = ['event_station_015', 'event_station_016', 'event_station_017',
  'event_general_039', 'event_general_040', 'event_general_041',
  'event_derelict_006', 'event_derelict_007',
  'event_encounter_toll_001', 'event_encounter_inspection_001'];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const boot = async () => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && typeof enterEvent === 'function');
    await page.evaluate(() => {
      // A fresh run whose crew, cargo, gold and flags unlock `ch`
      // (CREW_MAX is 2: the role it needs plus one other).
      window.__r60 = {
        tierOf: ev => Array.isArray(ev.difficulty) ? ev.difficulty[0] : (ev.difficulty || 'medium'),
        hard: () => Object.values(EVENTS).filter(ev => ev.active !== false && ['hard', 'ultra'].includes(__r60.tierOf(ev))),
        sets(ev) {
          const out = [];
          if (ev.choices) out.push({ layer: null, choices: ev.choices });
          for (const [k, l] of Object.entries(ev.layers || {})) if (l.choices) out.push({ layer: k, choices: l.choices });
          return out;
        },
        setup(ch, ev, also) {
          localStorage.removeItem('transplant_save_v1');
          const role = c => c && (c.requires_crew || (c.gate && c.gate.crew));
          const crew = [...new Set([role(ch), role(also), 'medic', 'chef'].filter(Boolean))].slice(0, CREW_MAX);
          applySetupToState({ trail: 'interstellar', ai: 'aria', captain: 'veteran', crew, crop: 'wheat', ship: 'B' });
          STATE.stowaway = null;
          STATE.flags.add('departed');
          STATE.goldAmount = 200;
          STATE.resources.hull = 80; STATE.resources.fuel = 80; STATE.resources.food = 80; STATE.resources.water = 80; STATE.resources.o2 = 80;
          for (const it of ['hull_patch', 'medkit', 'pressure_suit', 'spectrometer', 'solar_array', 'alien_seed_pod']) if (!STATE.items.includes(it)) STATE.items.push(it);
          // …and whatever item the option (or its pair) itself requires.
          const item = c => c && (c.requires_item || (c.gate && c.gate.item));
          for (const it of [item(ch), item(also)].filter(Boolean)) if (!STATE.items.includes(it)) STATE.items.push(it);
          for (const f of [ch && ch.requires_flag, ev && ev.requires_flag].filter(Boolean)) STATE.flags.add(f);
          if (STATE.cropGrowth) STATE.cropGrowth.health = 80;
          const want = (ev && (ev.node_type || [])[0]) || 'any';
          const node = STATE.nodes.find(n => n.node_type === want) || STATE.byId[STATE.currentId];
          STATE.currentId = node.id;
          return node;
        },
        // What the engine shows a choice costs (null: navigation, not an option).
        cost(ev, ch) {
          STATE.currentEvent = ev;
          const parts = [];
          if (ch.triggerCombat || ch.combat_trigger) return ['a fight'];
          if (ch.effort && effortTax(ch.effort)) parts.push('effort −' + effortTax(ch.effort) + ' morale');
          if (ch.gold_cost) parts.push(ch.gold_cost + ' gold');
          const read = o => {
            const r = outcomeFacts(withPctPreview(o)).filter(f => !f.good).map(f => f.text);
            const days = outcomeDays(o, 1);
            if (days > TIME_COST_DAYS.low) r.push(days + ' days');
            return r;
          };
          if (ch.launch_minigame) {
            const b = (ch.outcome && typeof ch.outcome === 'object') ? ch.outcome : {};
            const tiers = Object.entries(ch.tier_outcomes || {});
            const per = (tiers.length ? tiers : [['base', {}]]).map(([, t]) => read(Object.assign({}, b, t, { resources: Object.assign({}, b.resources || {}, t.resources || {}) })));
            return per.some(p => !p.length) && !parts.length ? [] : parts.concat(per.reduce((a, p) => (p.length < a.length ? p : a)));
          }
          const o = choiceCostOutcome(ch);
          if (!o) return null;
          return parts.concat(read(o));
        },
      };
    });
  };
  await boot();

  console.log('— 1. every hard option costs something (engine facts)');
  {
    const r = await page.evaluate(() => {
      const rows = [];
      for (const ev of __r60.hard()) {
        for (const { layer, choices } of __r60.sets(ev)) {
          for (const ch of choices) {
            __r60.setup(ch, ev);
            const c = __r60.cost(ev, ch);
            if (c !== null) rows.push({ ev: ev.id, layer, text: ch.text, cost: c });
          }
        }
        if (ev.layers && !ev.leave_disabled) {
          __r60.setup(null, ev);
          rows.push({ ev: ev.id, layer: 'leave row', text: ev.leave_label, cost: ev.leave_as ? __r60.cost(ev, ev.leave_as) || [] : [] });
        }
      }
      return { n: __r60.hard().length, rows };
    });
    ok(r.n >= 26, `${r.n} active hard/ultra events (16 before ruling 60, +10 new)`);
    for (const row of r.rows) ok(row.cost.length > 0, `${row.ev}${row.layer ? '/' + row.layer : ''} "${row.text}" is free`);
    console.log(`  ${r.rows.length} options checked across ${r.n} events`);
  }

  console.log('— 2. the rendered tooltip says what each option costs');
  {
    const r = await page.evaluate(() => {
      const bad = [];
      let n = 0;
      const tipOf = b => (b && (b.dataset.tipDescription || b.getAttribute('title'))) || '';
      const states = tip => /Costs: /.test(tip) || /minigame/.test(tip) || /combat/.test(tip) || /Effort \d\/5 · −\d+ morale/.test(tip) || /-\d+ gold|costs \d+ gold/.test(tip)
        || (+(tip.match(/Takes (\d+) days/) || [])[1] > TIME_COST_DAYS.low);
      for (const ev of __r60.hard()) {
        const entry = ev.layers ? (ev.entryLayer || Object.keys(ev.layers)[0]) : null;
        for (const { layer, choices } of __r60.sets(ev)) {
          for (const ch of choices) {
            if (__r60.cost(ev, ch) === null) continue;
            const node = __r60.setup(ch, ev);
            enterEvent(node, ev, layer && layer !== entry ? { layerStack: [entry, layer] } : undefined);
            finishAllTyping();
            if (lockReason(ch)) { bad.push(`${ev.id} "${ch.text}" locked in a set-up run: ${lockReason(ch)}`); continue; }
            const i = (STATE._shownChoices || []).indexOf(ch);
            const btns = [...document.querySelectorAll('#enc-choices .enc-choice:not(.leave):not(.advance):not(.locked)')];
            const tip = tipOf(btns[i]);
            n++;
            if (i < 0 || !states(tip)) bad.push(`${ev.id}${layer ? '/' + layer : ''} "${ch.text}" tooltip: ${JSON.stringify(tip)}`);
          }
        }
        if (ev.leave_as) {
          const node = __r60.setup(null, ev);
          enterEvent(node, ev);
          finishAllTyping();
          const tip = tipOf(document.querySelector('#enc-choices .enc-choice.leave'));
          n++;
          if (!/Costs: /.test(tip)) bad.push(`${ev.id} leave row tooltip: ${JSON.stringify(tip)}`);
        }
      }
      return { n, bad };
    });
    for (const b of r.bad) ok(false, b);
    ok(r.n > 80, `${r.n} rendered options read`);
  }

  console.log('— 3. every option of every new event resolves in the engine');
  for (const id of NEW) {
    await boot();
    const paths = await page.evaluate(id => {
      const ev = EVENTS[id];
      const out = [];
      const entry = ev.layers ? (ev.entryLayer || Object.keys(ev.layers)[0]) : null;
      for (const { layer, choices } of __r60.sets(ev)) {
        choices.forEach((ch, i) => {
          if (ch.back || ch.next) return;
          // A deeper layer is reached by clicking the choice that opens it.
          const via = layer && layer !== entry ? ev.layers[entry].choices.findIndex(c => c.next === layer) : -1;
          out.push({ layer, i, via, text: ch.text, combat: !!ch.triggerCombat });
        });
      }
      if (ev.leave_as) out.push({ layer: entry, i: -1, via: -1, text: ev.leave_label, leave: true });
      return out;
    }, id);
    let resolved = 0;
    for (const p of paths) {
      const r = await page.evaluate(async ({ id, p }) => {
        const ev = EVENTS[id];
        const set = ev.layers ? ev.layers[p.layer].choices : ev.choices;
        const ch = p.leave ? ev.leave_as : set[p.i];
        const via = p.via >= 0 ? ev.layers[ev.entryLayer || Object.keys(ev.layers)[0]].choices[p.via] : null;
        const node = __r60.setup(ch, ev, via);
        enterEvent(node, ev);
        finishAllTyping();
        const wait = ms => new Promise(res => setTimeout(res, ms));
        const press = (pick) => {
          const btn = pick();
          if (!btn) return false;
          btn.click();
          return true;
        };
        const byIndex = c => () => { const i = (STATE._shownChoices || []).indexOf(c); return [...document.querySelectorAll('#enc-choices .enc-choice:not(.leave):not(.advance):not(.locked)')][i]; };
        if (via) {
          await wait(400);
          if (!press(byIndex(via))) return { err: 'could not open ' + via.next };
          await wait(400);
          finishAllTyping();
        }
        await wait(400);
        const before = { res: Object.assign({}, STATE.resources), gold: STATE.goldAmount, day: STATE.daysElapsed, crop: STATE.cropGrowth && STATE.cropGrowth.health,
          wear: STATE.fabricator && STATE.fabricator.wear, items: STATE.items.slice() };
        const o = ch.triggerCombat ? null : (typeof ch.outcome === 'string' ? ev.outcomes[ch.outcome] : ch.outcome);
        if (ch.triggerCombat) {
          const ok = press(byIndex(ch));
          await wait(600);
          const fight = document.getElementById('screen-encounter').classList.contains('combat-mode');
          if (window.abortCombat) abortCombat();
          return { combat: true, ok, fight };
        }
        if (!press(p.leave ? () => document.querySelector('#enc-choices .enc-choice.leave') : byIndex(ch))) return { err: 'button missing or locked: ' + (lockReason(ch) || '?') };
        await wait(500);
        const body = document.getElementById('enc-narr-body') ? document.getElementById('enc-narr-body').textContent : '';
        const d = k => STATE.resources[k] - before.res[k];
        const want = {}, got = {};
        for (const [k, v] of Object.entries((o && o.resources) || {})) {
          if (!(v < 0)) continue;
          if (k === 'gold') { want.gold = -eventGold(-v); got.gold = STATE.goldAmount - before.gold; } else if (k !== 'morale') { want[k] = v; got[k] = d(k); }
        }
        for (const [k, pct] of Object.entries((o && o.resources_pct) || {})) { want[k] = Math.round(before.res[k] * pct / 100); got[k] = d(k); }
        if (o && Number.isFinite(o.crop_health)) { want.crop = o.crop_health; got.crop = STATE.cropGrowth.health - before.crop; }
        if (o && o.fab_wear) { want.wear = o.fab_wear; got.wear = STATE.fabricator.wear - before.wear; }
        if (o && o.item_consume) { want.item = 1; got.item = before.items.filter(x => x === o.item_consume).length - STATE.items.filter(x => x === o.item_consume).length; }
        want.days = outcomeDays(o, 1); got.days = STATE.daysElapsed - before.day;
        return {
          outcome: !!(STATE.outcomeMode || STATE.currentOutcomeId), want, got, tokens: (body.match(/\{[a-z]+\.[a-z]+\}/g) || []),
          flag: o && o.sets_flag ? STATE.flags.has(o.sets_flag) : null, wavedOff: o && o.waves_off ? stationServicesClosed() : null,
        };
      }, { id, p });
      const at = `${id}${p.layer ? '/' + p.layer : ''} "${p.text}"`;
      if (r.err) { ok(false, `${at}: ${r.err}`); continue; }
      if (r.combat) { ok(r.ok && r.fight, `${at}: the fight starts`); resolved++; continue; }
      ok(r.outcome, `${at}: reached an outcome`);
      // The outcome's days run the daily upkeep too (food, water and air
      // eaten, the crop's health drifting a point a day), so those land
      // within a few points of the outcome's own figure.
      const UPKEEP = { food: 3, water: 3, o2: 3, crop: 1.5 };
      const close = Object.keys(r.want).every(k => UPKEEP[k] ? Math.abs(r.got[k] - r.want[k]) <= UPKEEP[k] * r.want.days && Math.sign(r.got[k]) === Math.sign(r.want[k]) : r.got[k] === r.want[k]);
      ok(close, `${at}: applied ${JSON.stringify(r.got)}, outcome says ${JSON.stringify(r.want)}`);
      ok(!r.tokens.length, `${at}: unresolved tokens ${r.tokens.join(' ')}`);
      if (r.flag !== null) ok(r.flag, `${at}: sets its flag`);
      if (r.wavedOff !== null) ok(r.wavedOff, `${at}: closes the station's services`);
      resolved++;
    }
    console.log(`  ${id}: ${resolved}/${paths.length} options resolved`);
  }

  console.log('— 4. a hard station event plays as the docking, not an optional room');
  {
    await boot();
    const r = await page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const out = [];
      for (const ev of __r60.hard().filter(e => (e.node_type || []).includes('station') && !(e.trigger || []).includes('delayed_crisis'))) {
        const node = __r60.setup(null, ev);
        StationVisit.arrive(node, ev);
        StationVisit.act({ station: 'dock' });
        out.push({ id: ev.id, kind: StationVisit.kindOf(ev), current: STATE.currentEvent && STATE.currentEvent.id });
      }
      // Refusing the fumigation closes the stop: the visit ends on the bridge.
      const ev = EVENTS.event_station_017;
      const ch = ev.choices.find(c => c.outcome.waves_off);
      const node = __r60.setup(ch, ev);
      StationVisit.arrive(node, ev);
      StationVisit.act({ station: 'dock' });
      finishAllTyping();
      handleChoiceClick(ch);
      await wait(300);
      advanceAfterEvent();
      await wait(300);
      return { out, closed: stationServicesClosed(), phase: STATE.stationVisit && STATE.stationVisit.phase };
    });
    for (const x of r.out) ok(x.kind === 'docking' && x.current === x.id, `${x.id}: DOCK opens it (${x.kind}, ${x.current})`);
    ok(r.out.length >= 3, `${r.out.length} hard station events`);
    ok(r.closed && r.phase === 'left', `refusing fumigation leaves the stop with its services closed (${r.phase})`);
  }

  ok(!errors.length, 'page errors: ' + errors.join(' | '));
  console.log(`\nruling 60 (r60a): ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
