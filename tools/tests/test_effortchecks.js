// Hands-on jobs (former "microgame" choices): effort-based pro/con.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.stack || e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  const run = (crew, items, rnd, evId, re) => page.evaluate(({ crew, items, rnd, evId, re }) => {
    localStorage.clear();
    applySetupToState({ trail: 'mars', ai: 'aria', captain: 'veteran', crew, crop: 'wheat', ship: 'D' });
    STATE.stowaway = null; STATE.items = items.slice(); STATE.cropGrowth.lastTickDay = 0;
    setCrewMorale(60); STATE.resources.hull = 60; STATE.goldAmount = 50;
    const ev = EVENTS[evId];
    enterEvent(STATE.byId[STATE.currentId], ev);
    const btn = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => new RegExp(re, 'i').test(b.textContent));
    const sub = btn.textContent.replace(/\s+/g, ' '), tip = btn.getAttribute('title') || ((btn.dataset.tipTitle ? btn.dataset.tipTitle + '\n\n' : '') + (btn.dataset.tipDescription || '')); // title= is upgraded to .ui-tip data (parity-shell)
    const before = { d: STATE.daysElapsed, m: crewMoraleRaw(), h: STATE.resources.hull, mats: Object.assign({}, STATE.materials) };
    Math.random = () => rnd;
    const ch = (ev.choices || []).find(c => new RegExp(re, 'i').test(c.text || ''));
    handleChoiceClick(ch); // direct: the UI's double-click guard ignores a click right after render
    return { sub, tip, days: STATE.daysElapsed - before.d, morale: crewMoraleRaw() - before.m, hull: STATE.resources.hull - before.h,
      matsGained: Object.entries(STATE.materials).reduce((a, [k, v]) => a + v - (before.mats[k] || 0), 0), body: document.getElementById('enc-narr-body').textContent };
  }, { crew, items, rnd, evId, re });

  const bare = await run(['chef'], [], 0.0, 'event_asteroid_001', 'standard equipment');
  const drill = await run(['chef'], ['portable_drill'], 0.0, 'event_asteroid_001', 'standard equipment');
  const pct = s => +((s.match(/(\d+)% clean/) || [])[1]);
  ok(/Effort \d+ \/ 30 · \d+% clean/.test(bare.sub), `button shows effort and odds (${bare.sub.slice(0, 70)})`);
  ok(pct(drill.sub) > pct(bare.sub), `the drill raises the odds (${pct(bare.sub)}% → ${pct(drill.sub)}%)`);
  ok(/Short of effort/.test(bare.tip), 'tooltip explains the downside');
  await page.waitForTimeout(100);
  const clean = await run(['chef'], [], 0.0, 'event_asteroid_001', 'standard equipment');
  const short = await run(['chef'], [], 0.99, 'event_asteroid_001', 'standard equipment');
  ok(short.days === clean.days + 2, `short of effort: two more days (${clean.days} → ${short.days})`);
  ok(short.matsGained < clean.matsGained || clean.matsGained === 0, `short of effort: thinner haul (${clean.matsGained} → ${short.matsGained})`);
  ok(short.morale <= clean.morale - 2, `short of effort: the job's setback (morale ${clean.morale} → ${short.morale})`);
  await page.waitForTimeout(2500);
  const body = await page.evaluate(() => document.getElementById('enc-narr-body').textContent);
  ok(/bit binds/i.test(body), 'outcome text says what went wrong');
  const wr = await run(['engineer', 'pilot'], ['repair_kit'], 0.5, 'event_crisis_011', 'Weld patch');
  ok(pct(wr.sub) === 90 || /Effort/.test(wr.sub), `engineer + kit: near-certain (${wr.sub.slice(0, 60)})`);
  // Previews equal outcomes (owner rule): the effort tax rides in the
  // MORALE figure of MARV's read and of the tooltip's Costs line — one
  // total, not listed again on the Effort line.
  const taxed = (trail, evId, re) => page.evaluate(({ trail, evId, re }) => {
    localStorage.clear();
    applySetupToState({ trail, ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'D' });
    STATE.stowaway = null; setCrewMorale(60);
    const ev = EVENTS[evId], node = STATE.nodes.find(n => n.node_type === (ev.node_type || [])[0]) || STATE.byId[STATE.currentId];
    STATE.currentId = node.id;
    enterEvent(node, ev);
    const btn = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => new RegExp(re, 'i').test(b.textContent));
    const sub = btn.querySelector('.ch-sub').textContent, tip = btn.getAttribute('title') || ((btn.dataset.tipTitle ? btn.dataset.tipTitle + '\n' : '') + (btn.dataset.tipDescription || ''));
    const ch = (ev.choices || []).find(c => new RegExp(re, 'i').test(c.text || ''));
    const before = crewMoraleOf('medic');
    handleChoiceClick(ch);
    return { sub, tip, medic: crewMoraleOf('medic') - before, effort: ch.effort };
  }, { trail, evId, re });
  const fig = s => { const m = (s || '').match(/−(\d+) MORALE/); return m ? -+m[1] : null; };
  for (const [trail, ev, re] of [['interstellar', 'event_station_025', 'Cast off now'], ['mars', 'event_planet_004', 'Survey the ruins properly']]) {
    const t = await taxed(trail, ev, re);
    const costs = (t.tip.split('\n').find(l => /^Costs:/.test(l)) || ''), effLine = (t.tip.split('\n').find(l => /^Effort \d\/5/.test(l)) || '');
    ok(/MARV/.test(t.sub) && fig(t.sub) === t.medic && fig(costs) === t.medic, `${re}: MARV ${fig(t.sub)}, Costs ${fig(costs)}, the crew lost ${t.medic} (effort ${t.effort} pips)`);
    ok(effLine && !/morale/.test(effLine), `${re}: the Effort line doesn't list the tax again ("${effLine}")`);
  }
  const cat = await taxed('mars', 'event_derelict_011', 'Bring the cat aboard');
  ok(/Effort 1\/5 · −1 morale/.test(cat.tip), `no morale cost shown elsewhere: the Effort line keeps the tax (${cat.tip.split('\n')[0]})`);
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\neffort checks: ${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
