// Owner rulings 2026-10-11 (the ten handoff questions), the engine-side
// half: ship name pool + re-roll, ultra weights 0 / corrupted rule
// dropped, captain & AI numbers read from the JSON (one source of
// truth) and written into setup's labels, passive_flavor in the INV
// detail, the pilot captain's coin-flip FTL, the veteran's dormant
// promise gone.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.captains && MOD.ships);
  await page.evaluate(() => localStorage.removeItem('transplant_save_v1'));
  return page;
}
async function boot(setup) {
  const page = await open();
  await page.evaluate(o => {
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForTimeout(150);
  return page;
}
const close = (a, b) => Math.abs(a - b) < 1e-9;

(async () => {
  browser = await chromium.launch();

  console.log('— map rules: ultra weighted 0 everywhere, corrupted rule dropped');
  {
    const page = await open();
    const r = await page.evaluate(() => {
      const t = MOD.map_rules.trails;
      return { ultra: Object.values(t).map(x => x.event_difficulty_weights.ultra), corrupted: Object.values(t).some(x => 'corrupted_events_start_at_node' in x) };
    });
    ok(r.ultra.every(v => v === 0), 'ultra weight is 0 on every trail (' + r.ultra.join('/') + ')');
    ok(!r.corrupted, 'corrupted_events_start_at_node is gone from map_rules');
    await page.close();
  }

  console.log('— veteran: no screen-clear promise');
  {
    const page = await open();
    const v = await page.evaluate(() => JSON.stringify(MOD.captains.captains.find(c => c.background === 'veteran')));
    ok(!/screen.clear|screen_clear/i.test(v), 'captains.json veteran no longer mentions a screen-clear');
    await page.close();
  }

  console.log('— captain numbers come from captains.json');
  {
    const page = await boot({ captain: 'chef', crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => {
      const out = {};
      out.food = foodBurnMult();
      out.chefMorale = roleAmount('chef', 'morale_passive', 'morale_passive', 1);
      MOD.captains.captains.find(c => c.background === 'chef').passive_effect.food_consumption_modifier = 0.8;
      out.foodEdited = foodBurnMult();
      return out;
    });
    ok(close(r.food, 0.93), 'chef captain: food burn ×0.93 (captains.json), was ' + r.food);
    ok(close(r.chefMorale, 0.5), 'chef captain: meal morale +0.5 (captains.json morale_passive)');
    ok(close(r.foodEdited, 0.8), 'editing captains.json food_consumption_modifier changes the engine (one source)');
    await page.close();
  }
  {
    const page = await boot({ captain: 'chef', crew: ['chef', 'medic'] });
    const r = await page.evaluate(() => { const a = foodBurnMult(); STATE.crewHP.chef = 30; return [a, foodBurnMult()]; });
    ok(close(r[0], 0.85), 'crew chef + chef captain: the crew\'s ×0.85 counts, no stacking');
    ok(close(r[1], 0.925) || close(r[1], 0.93), 'wounded crew chef (×0.925) vs captain (×0.93): the better counts → ' + r[1]);
    await page.close();
  }
  {
    const page = await boot({ captain: 'pilot', crew: ['engineer', 'medic'] });
    ok(close(await page.evaluate(() => fuelBurnMult()), 0.95), 'pilot captain: fuel burn ×0.95');
    await page.close();
  }
  {
    const page = await boot({ captain: 'botanist', crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => { const base = (cropMetaOf(STATE.crop) || {}).water_need || 50; return cropWaterNeed() / base; });
    ok(close(Math.round(r * 1000) / 1000, 0.93), 'botanist captain: crop water ×0.93 → ' + r);
    await page.close();
  }
  {
    const page = await boot({ captain: 'veteran', crew: ['botanist', 'medic'] });
    const r = await page.evaluate(() => { const base = (cropMetaOf(STATE.crop) || {}).water_need || 50; return cropWaterNeed() / base; });
    ok(close(Math.round(r * 1000) / 1000, 0.85), 'crew botanist: crop water ×0.85 (crew_roster crop_water_modifier) → ' + r);
    await page.close();
  }
  {
    const page = await boot({ captain: 'engineer', crew: ['pilot', 'medic'] });
    const r = await page.evaluate(() => [roleAmount('engineer', 'fabricator_wear_modifier', 'fabricator_wear_modifier', 0.8, true), captainPassive('fabricator_contribution')]);
    ok(close(r[0], 0.1), 'engineer captain: fabricator wear cut 10%');
    ok(r[1] === 12, 'engineer captain: fabricator contribution 12 from captains.json');
    await page.close();
  }
  {
    const page = await boot({ captain: 'medic', crew: ['engineer', 'pilot'] });
    const r = await page.evaluate(() => {
      const res = [];
      for (const roll of [0.2, 0.3]) {
        applySetupToState({ trail: 'mars', ai: 'marv', captain: 'medic', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' });
        const rnd = Math.random; Math.random = () => roll;
        applySeverity('pilot', 'lethal');
        Math.random = rnd;
        res.push(STATE.crew.includes('pilot'));
      }
      return res;
    });
    ok(r[0] === true && r[1] === false, 'medic captain: 25% lethal→injury (roll 0.20 saves, 0.30 doesn\'t)');
    await page.close();
  }

  console.log('— AI numbers come from ai_companions.json');
  {
    const page = await boot({ ai: 'chip', captain: 'merchant' });
    const r = await page.evaluate(() => {
      const a = stationPriceMult();
      MOD.ai_companions.find(x => x.id === 'ai_chip').passive_effect.value = 0.5;
      const b = stationPriceMult();
      return [a, b];
    });
    ok(close(r[0], 0.85 * 0.9), 'CHIP ×0.85 and Merchant ×0.9 stack on station prices');
    ok(close(r[1], 0.5 * 0.9), 'editing CHIP\'s price_reduction changes the engine (one source)');
    await page.close();
  }
  {
    const page = await boot({ ai: 'aria' });
    ok(await page.evaluate(() => aiPassive('morale_bonus')) === 1, 'ARIA: morale_bonus 1 read from ai_companions.json');
    ok(await page.evaluate(() => aiPassive('morale_bonus', 'marv')) === null, 'MARV has no morale bonus');
    await page.close();
  }

  console.log('— setup labels are written from the JSON');
  {
    const page = await open();
    const stats = await page.evaluate(async () => {
      startNewGame();
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const read = () => [...document.querySelectorAll('#setup-right .card-stat')].map(e => e.textContent);
      const out = {};
      await wait(100);
      document.querySelector('#setup-right .sel-card').click(); document.getElementById('btn-next').click(); await wait(100);
      out.ai = read();
      document.querySelector('#setup-right .sel-card').click(); document.getElementById('btn-next').click(); await wait(100);
      out.captain = read();
      return out;
    });
    const all = stats.ai.concat(stats.captain).join(' | ');
    ok(!/[{}]/.test(all), 'no unfilled {token} on the AI or captain cards');
    ok(stats.ai.some(s => s.includes('Station prices -15%')), 'CHIP card: "Station prices -15%"');
    ok(stats.ai.some(s => s.includes('Morale +1 per leg')), 'ARIA card: "Morale +1 per leg"');
    for (const want of ['Crop water -7% · Crop +5', 'Fab wear -10% · Hull 105', '25% lethal→injury', 'Fuel -5% · Fuel 105', 'Food -7% · Food 105', 'Gold +15', 'Prices -10% · Gold +30'])
      ok(stats.captain.some(s => s.includes(want)), 'captain card: "' + want + '"');
    await page.close();
  }

  console.log('— ship name: pre-filled from the pool, RE-ROLL, blank draws one');
  {
    const page = await open();
    const r = await page.evaluate(async () => {
      startNewGame();
      const wait = ms => new Promise(r => setTimeout(r, ms));
      await wait(100);
      for (let i = 0; i < 8 && !document.getElementById('ship-name-input'); i++) {
        const cards = [...document.querySelectorAll('#setup-right .sel-card')];
        if (document.getElementById('crew-count-badge').textContent) { cards[0].click(); cards[1].click(); }
        else cards[0].click();
        document.getElementById('btn-next').click();
        await wait(100);
      }
      const inp = document.getElementById('ship-name-input');
      const pool = shipNamePool();
      const first = inp && inp.value;
      const seen = new Set([first]);
      let alwaysNew = true;
      for (let i = 0; i < 10; i++) { const before = inp.value; document.getElementById('ship-name-reroll').click(); if (inp.value === before) alwaysNew = false; seen.add(inp.value); }
      return { has: !!inp, first, inPool: pool.includes(first), allInPool: [...seen].every(n => pool.includes(n)), alwaysNew, distinct: seen.size };
    });
    ok(r.has && r.inPool, 'name step opens with a pool name ("' + r.first + '")');
    ok(r.allInPool && r.alwaysNew && r.distinct > 3, 'RE-ROLL always draws a different pool name (' + r.distinct + ' seen)');
    const blank = await page.evaluate(() => { applySetupToState({ trail: 'lunar', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: '   ' }); return STATE.shipName; });
    ok(await page.evaluate(n => shipNamePool().includes(n), blank), 'a blank name draws from the pool ("' + blank + '")');
    const typed = await page.evaluate(() => { applySetupToState({ trail: 'lunar', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'Rosalind' }); return STATE.shipName; });
    ok(typed === 'Rosalind', 'a typed name is kept');
    await page.close();
  }

  console.log('— passive_flavor shows in the INV detail');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      STATE.items.push('gas_analyzer');
      returnToHub(); openInventory(); _invSelected = 'gas_analyzer'; renderInventory();
      const a = document.getElementById('inv-detail-flavor');
      const shown = a && a.textContent;
      const vis = a && getComputedStyle(a).display !== 'none';
      _invSelected = 'repair_kit'; renderInventory();
      return { shown, vis, after: document.getElementById('inv-detail-flavor').textContent, want: itemDef('gas_analyzer').passive_flavor };
    });
    ok(r.shown === r.want && r.vis, 'gas analyzer: its passive_flavor line is shown');
    ok(r.after === '', 'an item with no passive_flavor shows none (no stale line)');
    await page.close();
  }

  console.log('— pilot captain: the 2-turn FTL is a coin flip');
  {
    const page = await boot({ captain: 'pilot', crew: ['engineer', 'medic'] });
    const r = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const out = { label: null, turns: [] };
      for (const roll of [0.1, 0.9]) {
        const ev = Object.values(EVENTS).find(e => JSON.stringify(e).includes('"triggerCombat":true'));
        enterEvent(STATE.byId[STATE.currentId], ev);
        window.triggerCombat({});
        await wait(450); // choices → actions cross-dissolve: the panel paints at 200ms
        const btn = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.textContent.includes('ATTEMPT ESCAPE'));
        out.label = btn && btn.textContent;
        const rnd = Math.random; Math.random = () => roll;
        btn.click();
        Math.random = rnd;
        await wait(100);
        const m = (document.getElementById('enc-narr-body') || document.body).textContent.match(/FTL spool turn 1 of (\d)/) || document.body.textContent.match(/TURN 1 \/ (\d)/);
        out.turns.push(m ? +m[1] : null);
        window.abortCombat && window.abortCombat();
        await wait(100);
      }
      return out;
    });
    ok(r.label && r.label.includes('2–3-turn FTL'), 'ESCAPE reads "2–3-turn FTL charge" for a pilot captain');
    ok(r.turns[0] === 2 && r.turns[1] === 3, 'the flip lands 2 turns on a win, 3 on a loss (' + r.turns.join(', ') + ')');
    await page.close();
  }
  {
    const page = await boot({ captain: 'veteran', crew: ['pilot', 'medic'] });
    const label = await page.evaluate(async () => {
      const ev = Object.values(EVENTS).find(e => JSON.stringify(e).includes('"triggerCombat":true'));
      enterEvent(STATE.byId[STATE.currentId], ev);
      window.triggerCombat({});
      await new Promise(r => setTimeout(r, 450)); // after the 200ms cross-dissolve
      const btn = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.textContent.includes('ATTEMPT ESCAPE'));
      return btn && btn.textContent;
    });
    ok(label && label.includes('2-turn FTL') && !label.includes('–'), 'a healthy crew pilot still always spools in 2');
    await page.close();
  }

  console.log('— a long spoken line never runs under the narrative panel');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const node = STATE.byId[STATE.currentId];
      const bad = [], checked = [];
      for (const ev of Object.values(EVENTS)) {
        const layers = ev.layers ? Object.keys(ev.layers) : [null];
        for (const lid of layers) {
          const layer = lid ? ev.layers[lid] : ev;
          if (!layer || !layer.line) continue;
          showScreen('screen-cruise'); // enter from the hub each time: the first paint happens before the screen lays out
          enterEvent(node, ev, lid ? { layerStack: [lid] } : undefined);
          await wait(80);
          if (typeof finishAllTyping === 'function') finishAllTyping();
          await wait(20);
          const d = document.getElementById('enc-dialog'), n = document.getElementById('enc-narrative');
          if (d.classList.contains('hidden') || getComputedStyle(d).display === 'none') continue;
          const gap = n.getBoundingClientRect().top - d.getBoundingClientRect().bottom;
          checked.push(ev.id + (lid ? '/' + lid : ''));
          if (gap < 0) bad.push(ev.id + (lid ? '/' + lid : '') + ' ' + Math.round(gap));
        }
      }
      return { bad, n: checked.length, has008: checked.some(x => x.startsWith('event_station_008')) };
    });
    ok(r.n > 20 && r.has008, 'checked ' + r.n + ' spoken lines (incl. event_station_008)');
    ok(r.bad.length === 0, 'no spoken line overlaps the narrative panel' + (r.bad.length ? ': ' + r.bad.slice(0, 5).join(', ') : ''));
    await page.close();
  }

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
