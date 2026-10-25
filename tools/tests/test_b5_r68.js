// Per-trail supply bite (ruling 68): map_rules event_supply_cost_mult
// scales what an event outcome costs in water and food, once, in the
// engine (eventSupplyCost via effectiveResDelta).
//   1. The multiplier is read per trail, and an unauthored one is 1.
//   2. A flat cost event: the tooltip, the SCAN sub-label and the outcome
//      all show the scaled figure on every trail (ruling 96 gave
//      Interstellar a bite too, lighter than Mars).
//   3. A layered outcome run as the leave row (leave_as): tooltip = outcome.
//   4. Minigame tier outcomes are scaled, and so is a quit (the poor tier's
//      losses).
//   5. Gains, a fight's own tally (combat_net), a resources_pct share and
//      the daily draw are not scaled.
//   6. Narratives write the real figure ({cost.water} / {cost.food},
//      ruling 70): the scaled one, in words, capitalised opening a
//      sentence.
//   7. Mars starts short of water and food (ruling 69), and the setup
//      card's "Food N" says what a Chef captain really starts with.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const TRAILS = ['lunar', 'mars', 'interstellar'];

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const boot = async () => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.map_rules && typeof enterEvent === 'function');
    await page.evaluate(() => {
      window.__r68 = {
        setup(trail, crew, nodeType) {
          localStorage.removeItem('transplant_save_v1');
          applySetupToState({ trail, ai: 'aria', captain: 'veteran', crew: crew || ['medic', 'chef'], crop: 'wheat', ship: 'B' });
          STATE.stowaway = null;
          STATE.flags.add('departed');
          STATE.goldAmount = 200;
          for (const k of ['fuel', 'food', 'water', 'o2', 'hull']) STATE.resources[k] = 80;
          const node = STATE.nodes.find(n => n.node_type === nodeType) || STATE.byId[STATE.currentId];
          STATE.currentId = node.id;
          // The day's upkeep held at zero: what moves is the outcome's own figure.
          window.dailyDraw = () => ({ food: 0, o2: 0, water: 0 });
          Math.random = () => 0.01;
          return node;
        },
        mult(trail, k) { const m = MOD.map_rules.trails[trail].event_supply_cost_mult; return (m && m[k]) || 1; },
        scaled(trail, k, v) { return -Math.round(-v * this.mult(trail, k)); },
        wait: ms => new Promise(res => setTimeout(res, ms)),
        btnOf(c) { const i = (STATE._shownChoices || []).indexOf(c); return [...document.querySelectorAll('#enc-choices .enc-choice:not(.leave):not(.advance):not(.locked)')][i]; },
      };
    });
  };
  await boot();

  console.log('— 1. the multiplier is read per trail');
  const m = await page.evaluate(() => {
    const out = {};
    for (const trail of ['lunar', 'mars', 'interstellar']) {
      __r68.setup(trail);
      out[trail] = { authored: MOD.map_rules.trails[trail].event_supply_cost_mult, water: effectiveResDelta('water', -10, {}), food: effectiveResDelta('food', -7, {}), fuel: effectiveResDelta('fuel', -10, {}), want: { water: __r68.scaled(trail, 'water', -10), food: __r68.scaled(trail, 'food', -7) } };
    }
    // Unauthored: as authored (×1).
    __r68.setup('mars');
    const saved = MOD.map_rules.trails.mars.event_supply_cost_mult;
    delete MOD.map_rules.trails.mars.event_supply_cost_mult;
    out.unauthored = effectiveResDelta('water', -10, {});
    MOD.map_rules.trails.mars.event_supply_cost_mult = saved;
    return out;
  });
  for (const t of TRAILS) {
    const r = m[t];
    ok(r.authored && Number.isFinite(r.authored.water) && Number.isFinite(r.authored.food), `${t}: event_supply_cost_mult authored (${JSON.stringify(r.authored)})`);
    ok(r.water === r.want.water && r.food === r.want.food, `${t}: −10 water → ${r.water} (want ${r.want.water}), −7 food → ${r.food} (want ${r.want.food})`);
    ok(r.fuel === -10, `${t}: fuel is not scaled (${r.fuel})`);
    console.log(`  ${t}: ×${r.authored.water} water, ×${r.authored.food} food → −10 water = ${r.water}, −7 food = ${r.food}`);
  }
  ok(m.mars.authored.water > 1 && m.lunar.authored.water > 1, 'Mars and Lunar bite harder than as authored');
  ok(m.interstellar.authored.water > 1 && m.interstellar.authored.water < m.mars.authored.water && m.interstellar.authored.food < m.mars.authored.food, 'Interstellar bites too, less than Mars (ruling 96)');
  ok(m.mars.authored.water >= m.lunar.authored.water && m.mars.authored.food >= m.lunar.authored.food, 'Mars bites at least as hard as Lunar');
  ok(m.unauthored === -10, `an unauthored trail is ×1 (${m.unauthored})`);

  console.log('— 2. a flat cost event: tooltip, SCAN sub-label and outcome agree');
  for (const trail of TRAILS) {
    for (const [ci, k, v] of [[1, 'food', -10], [3, 'water', -12]]) {
      await boot();
      const r = await page.evaluate(async ({ trail, ci }) => {
        const ev = EVENTS.event_station_015;
        const node = __r68.setup(trail, null, 'station');
        STATE.scanIntelEvent = ev.id; // a perfect SCAN: every choice's outcome on its sub-label
        enterEvent(node, ev);
        finishAllTyping();
        await __r68.wait(300);
        const ch = ev.choices[ci];
        const btn = __r68.btnOf(ch);
        if (!btn) return { err: 'button missing: ' + (lockReason(ch) || '?') };
        const tip = btn.dataset.tipDescription || btn.getAttribute('title') || '';
        const sub = (btn.querySelector('.ch-sub') || {}).textContent || '';
        const before = Object.assign({}, STATE.resources);
        btn.click();
        await __r68.wait(500);
        const got = {};
        for (const k of ['fuel', 'food', 'water', 'o2', 'hull']) { const d = STATE.resources[k] - before[k]; if (d) got[k] = d; }
        return { tip, sub, got };
      }, { trail, ci });
      const at = `${trail} station_015 #${ci}`;
      if (r.err) { ok(false, `${at}: ${r.err}`); continue; }
      const want = await page.evaluate(({ trail, k, v }) => __r68.scaled(trail, k, v), { trail, k, v });
      const label = '−' + Math.abs(want) + ' ' + (k === 'water' ? 'H2O' : 'FOOD');
      ok(r.got[k] === want, `${at}: outcome ${k} ${r.got[k]}, want ${want}`);
      ok(r.tip.includes('Costs: ') && r.tip.includes(label), `${at}: tooltip shows "${label}" (${r.tip.replace(/\n/g, ' | ')})`);
      ok(r.sub.includes(label), `${at}: SCAN sub-label shows "${label}" (${r.sub})`);
      if (trail !== 'lunar') ok(want < v, `${at}: ${trail} shows more than the authored ${v} (${want})`);
    }
  }

  console.log('— 3. a layered outcome as the leave row (leave_as): tooltip = outcome');
  for (const trail of TRAILS) {
    await boot();
    const r = await page.evaluate(async ({ trail }) => {
      const ev = EVENTS.event_encounter_toll_001;
      const node = __r68.setup(trail, null, (ev.node_type || [])[0]);
      enterEvent(node, ev);
      finishAllTyping();
      await __r68.wait(300);
      const leave = document.querySelector('#enc-choices .enc-choice.leave');
      if (!leave) return { err: 'no leave row' };
      const tip = leave.dataset.tipDescription || leave.getAttribute('title') || '';
      const authored = ev.outcomes[ev.leave_as.outcome].resources.food;
      const before = STATE.resources.food;
      leave.click();
      await __r68.wait(500);
      return { tip, got: STATE.resources.food - before, authored };
    }, { trail });
    if (r.err) { ok(false, `${trail} toll_001: ${r.err}`); continue; }
    const want = await page.evaluate(({ trail, v }) => __r68.scaled(trail, 'food', v), { trail, v: r.authored });
    ok(r.got === want, `${trail} toll_001 leave_as: food ${r.got}, want ${want} (authored ${r.authored})`);
    ok(r.tip.includes('−' + Math.abs(want) + ' FOOD'), `${trail} toll_001 leave_as: tooltip shows −${Math.abs(want)} FOOD (${r.tip.replace(/\n/g, ' | ')})`);
  }

  console.log('— 4. minigame tier outcomes are scaled (and a quit)');
  for (const trail of ['mars', 'interstellar']) {
    for (const tier of ['perfect', 'good', 'poor', 'abandoned']) {
      await boot();
      const r = await page.evaluate(async ({ trail, tier }) => {
        const ev = EVENTS.event_crisis_016;
        const node = __r68.setup(trail);
        window.openMinigame = (mg, o, cb) => setTimeout(() => cb(tier, {}), 10);
        enterEvent(node, ev);
        finishAllTyping();
        await __r68.wait(300);
        const ch = ev.choices[0];
        const btn = __r68.btnOf(ch);
        if (!btn) return { err: 'button missing' };
        const before = STATE.resources.water;
        btn.click();
        await __r68.wait(500);
        const t = ch.tier_outcomes[tier === 'abandoned' ? 'poor' : tier];
        return { got: STATE.resources.water - before, authored: Object.assign({}, (ch.outcome || {}).resources, t.resources).water };
      }, { trail, tier });
      if (r.err) { ok(false, `${trail} crisis_016 [${tier}]: ${r.err}`); continue; }
      const want = await page.evaluate(({ trail, v }) => __r68.scaled(trail, 'water', v), { trail, v: r.authored });
      ok(r.got === want, `${trail} crisis_016 [${tier}]: water ${r.got}, want ${want} (authored ${r.authored})`);
    }
  }

  console.log('— 5. gains, a fight\'s tally, a resources_pct share and the daily draw are not scaled');
  await boot();
  const g = await page.evaluate(() => {
    __r68.setup('mars');
    const out = {};
    out.gainDelta = [effectiveResDelta('water', 10, {}), effectiveResDelta('food', 6, {})];
    const b0 = Object.assign({}, STATE.resources);
    applyOutcomeEffects({ resources: { water: 10, food: 6 }, time_cost: 'none' });
    out.gainApplied = [STATE.resources.water - b0.water, STATE.resources.food - b0.food];
    out.gainFacts = outcomeFacts({ resources: { water: 10 } }).map(f => f.text);
    const b1 = STATE.resources.food;
    applyOutcomeEffects({ resources: { food: -10 }, combat_net: true, time_cost: 'none' });
    out.combat = STATE.resources.food - b1;
    // A share of the tank: 45% of 80 = 36, whatever the trail.
    STATE.resources.food = 80;
    const pctO = { resources_pct: { food: -45 }, time_cost: 'none' };
    out.pctFacts = outcomeFacts(pctO).map(f => f.text);
    out.pctTip = outcomeFacts(withPctPreview(pctO)).map(f => f.text);
    applyOutcomeEffects(pctO);
    out.pct = STATE.resources.food - 80;
    // A share plus a flat cost: only the flat part is scaled.
    STATE.resources.food = 80;
    const mixed = { resources: { food: -5 }, resources_pct: { food: -25 }, time_cost: 'none' };
    out.mixedTip = outcomeFacts(withPctPreview(mixed)).map(f => f.text);
    applyOutcomeEffects(mixed);
    out.mixed = STATE.resources.food - 80;
    out.mixedWant = -20 + __r68.scaled('mars', 'food', -5);
    return out;
  });
  ok(g.gainDelta[0] === 10 && g.gainDelta[1] === 6, `mars: gains not scaled in effectiveResDelta (${g.gainDelta})`);
  ok(g.gainApplied[0] === 10 && g.gainApplied[1] === 6, `mars: gains not scaled when applied (${g.gainApplied})`);
  ok(g.gainFacts.includes('+10 H2O'), `mars: a gain previews as authored (${g.gainFacts})`);
  ok(g.combat === -10, `mars: a fight's own food tally lands as fought (${g.combat})`);
  ok(g.pct === -36, `mars: −45% food takes 45% of 80 = 36 (${g.pct})`);
  ok(g.pctFacts.includes('−45% FOOD'), `mars: the share previews as −45% FOOD (${g.pctFacts})`);
  ok(g.pctTip.includes('−36 FOOD'), `mars: the tooltip's figure is the share aboard (${g.pctTip})`);
  ok(g.mixed === g.mixedWant && g.mixedTip.includes('−' + Math.abs(g.mixedWant) + ' FOOD'), `mars: share + flat cost lands ${g.mixed} (want ${g.mixedWant}), tooltip ${g.mixedTip}`);

  // The daily draw is the ship's own burn, not an event cost.
  await boot();
  const dd = await page.evaluate(() => {
    const out = {};
    for (const trail of ['mars', 'interstellar']) {
      localStorage.removeItem('transplant_save_v1');
      applySetupToState({ trail, ai: 'aria', captain: 'veteran', crew: ['medic', 'chef'], crop: 'wheat', ship: 'B' });
      const t = MOD.map_rules.trails[trail];
      // The trail's own draw (rulings 96, 97: o2_per_day, water_per_day), a healthy crop's quarter off the air.
      out[trail] = { draw: dailyDraw(), water: t.water_per_day || ORDERS_BASE.waterPerDay, o2: (t.o2_per_day || ORDERS_BASE.o2PerDay) * CROP_O2_DRAW_MULT };
    }
    return out;
  });
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  ok(near(dd.mars.draw.food, dd.interstellar.draw.food) && ['mars', 'interstellar'].every(t => near(dd[t].draw.water, dd[t].water) && near(dd[t].draw.o2, dd[t].o2)),
    `the daily draw is the trail's own, never the supply bite (${JSON.stringify(dd)})`);

  console.log('— 6. narratives write the real figure ({cost.*})');
  const words = await page.evaluate(() => [numberWords(0), numberWords(6), numberWords(22), numberWords(66), numberWords(110), interpolateCostTokens('{cost.water} gone. Then {cost.water} more, {cost.food.num} food.', { resources: { water: -4, food: -10 } })]);
  ok(JSON.stringify(words.slice(0, 5)) === JSON.stringify(['no', 'six', 'twenty-two', 'sixty-six', 'a hundred and ten']), `numberWords ${JSON.stringify(words.slice(0, 5))}`);
  const inter = await page.evaluate(() => {
    __r68.setup('interstellar');
    const w = numberWords(-__r68.scaled('interstellar', 'water', -4));
    return { got: interpolateCostTokens('{cost.water} gone. Then {cost.water} more, {cost.food.num} food.', { resources: { water: -4, food: -10 } }),
      want: w.charAt(0).toUpperCase() + w.slice(1) + ' gone. Then ' + w + ' more, ' + -__r68.scaled('interstellar', 'food', -10) + ' food.' };
  });
  ok(inter.got === inter.want && inter.want !== 'Four gone. Then four more, 10 food.', `interstellar tokens: "${inter.got}" (want "${inter.want}")`);
  // [event, choice index, crew, tier|null, resource, the sentence with {n} for the figure]
  const CASES = [
    ['event_shipboard_018', 3, ['medic', 'chef'], null, 'water', 'It throws away {n} points as sludge'],
    ['event_shipboard_019', 1, ['chef', 'medic'], null, 'food', '{N} points of food went with it.'],
    ['event_crisis_016', 0, ['medic', 'chef'], 'good', 'water', 'boiling off {n} points of water'],
  ];
  for (const trail of ['mars', 'interstellar']) {
    for (const [id, ci, crew, tier, k, sentence] of CASES) {
      await boot();
      const r = await page.evaluate(async ({ id, ci, crew, tier, trail }) => {
        const ev = EVENTS[id];
        const node = __r68.setup(trail, crew);
        const item = ev.choices[ci].requires_item || (ev.choices[ci].gate && ev.choices[ci].gate.item);
        if (item && !STATE.items.includes(item)) STATE.items.push(item);
        if (tier) window.openMinigame = (mg, o, cb) => setTimeout(() => cb(tier, {}), 10);
        enterEvent(node, ev);
        finishAllTyping();
        await __r68.wait(300);
        const ch = ev.choices[ci];
        const btn = __r68.btnOf(ch);
        if (!btn) return { err: 'button missing: ' + (lockReason(ch) || '?') };
        btn.click();
        await __r68.wait(500);
        finishAllTyping();
        await __r68.wait(100);
        const o = Object.assign({}, ch.outcome, tier ? ch.tier_outcomes[tier] : {}, { resources: Object.assign({}, (ch.outcome || {}).resources, tier ? ch.tier_outcomes[tier].resources : {}) });
        return { body: document.getElementById('enc-narr-body').textContent, log: (STATE.shipLog || []).map(e => (e && e.text) || String(e)).join(' | '), authored: o.resources };
      }, { id, ci, crew, tier, trail });
      const at = `${trail} ${id}${tier ? ' [' + tier + ']' : ''}`;
      if (r.err) { ok(false, `${at}: ${r.err}`); continue; }
      const fig = await page.evaluate(({ trail, k, v }) => -__r68.scaled(trail, k, v), { trail, k, v: r.authored[k] });
      const w = await page.evaluate(n => numberWords(n), fig);
      const want = sentence.replace('{n}', w).replace('{N}', w.charAt(0).toUpperCase() + w.slice(1));
      ok(r.body.includes(want), `${at}: narrative says "${want}" (${r.body.slice(0, 160)}…)`);
      ok(!/\{cost\./.test(r.body) && !/\{cost\./.test(r.log), `${at}: no raw {cost.*} token in the narrative or the log`);
      if (trail !== 'lunar') ok(fig > -r.authored[k], `${at}: ${trail} states more than the authored ${-r.authored[k]} (${fig})`);
    }
  }

  console.log('— 7. Mars starts short of water and food; the setup card says so');
  await boot();
  const st = await page.evaluate(async () => {
    const out = { rules: {}, state: {} };
    for (const trail of ['lunar', 'mars', 'interstellar']) {
      out.rules[trail] = MOD.map_rules.trails[trail].starting_resources;
      __r68.setup(trail);
      applySetupToState({ trail, ai: 'aria', captain: 'chef', crew: ['medic', 'pilot'], crop: 'wheat', ship: 'B' });
      out.state[trail] = { food: STATE.resources.food, water: STATE.resources.water, foodMax: resMax('food') };
    }
    // The setup wizard: Mars, then the captain step's Chef card.
    localStorage.removeItem('transplant_save_v1');
    startNewGame();
    const wait = ms => new Promise(r => setTimeout(r, ms));
    await wait(100);
    const cards = () => [...document.querySelectorAll('#setup-right .sel-card')];
    const stat = () => [...document.querySelectorAll('#setup-right .card-stat')].map(e => e.textContent);
    cards()[1].click(); document.getElementById('btn-next').click(); await wait(100); // Mars
    cards()[0].click(); document.getElementById('btn-next').click(); await wait(100); // an AI
    out.marsCards = stat();
    return out;
  });
  for (const k of ['water', 'food']) {
    ok(st.rules.mars[k] < st.rules.lunar[k] && st.rules.mars[k] < st.rules.interstellar[k], `Mars starts with less ${k} (${st.rules.mars[k]} vs ${st.rules.lunar[k]}/${st.rules.interstellar[k]})`);
    ok(st.state.mars[k] === st.rules.mars[k] + (k === 'food' ? 5 : 0), `Mars run starts at ${st.state.mars[k]} ${k} (map_rules ${st.rules.mars[k]}, + the Chef's 5 food)`);
  }
  ok(st.state.lunar.food === st.rules.lunar.food + 5 && st.state.interstellar.food === st.rules.interstellar.food + 5, `Lunar/Interstellar Chef food = the trail's start + 5 (${st.state.lunar.food}/${st.state.interstellar.food})`);
  ok(st.state.mars.foodMax === 105, `the tank is still 100 (+5 Chef): ${st.state.mars.foodMax}`);
  const chefWant = 'Food ' + (st.rules.mars.food + 5);
  ok(st.marsCards.some(s => s.includes(chefWant)), `Mars setup: Chef card says "${chefWant}" (${st.marsCards.filter(s => /Food/.test(s)).join(' | ')})`);

  ok(!errors.length, 'page errors: ' + errors.join(' | '));
  console.log(`\nruling 68: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
