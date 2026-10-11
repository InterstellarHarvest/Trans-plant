// A2 battery: random standard-variant draw, creature payoff chain,
// stowaway join_role/charges, reveal path unchanged.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.stack || e.message));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const boot = async (crew) => {
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
    await ev(c => { applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: c, crop: 'wheat', ship: 'T' }); STATE.stowaway = null; }, crew);
    await page.waitForTimeout(150);
  };
  const body = () => ev(() => { if (typeof finishAllTyping === 'function') finishAllTyping(); return document.getElementById('enc-narr-body').textContent; });
  const choiceTexts = () => ev(() => [...document.querySelectorAll('#enc-choices .enc-choice')].map(b => b.textContent));
  const enterWith = (r) => ev(r => {
    const real = Math.random; Math.random = () => r;
    try { enterEvent(STATE.byId[STATE.currentId], EVENTS.event_shipboard_001); } finally { Math.random = real; }
  }, r);

  console.log('— standard variant draw');
  await boot(['engineer']);
  await enterWith(0.1); await page.waitForTimeout(300);
  ok(/loose crate/i.test(await body()), 'roll 0.1 → loose_crate variant');
  await enterWith(0.9); await page.waitForTimeout(300);
  ok(/small creature/i.test(await body()), 'roll 0.9 → creature variant (was dead content)');
  await ev(() => renderEncounterState()); await page.waitForTimeout(300);
  ok(/small creature/i.test(await body()), 're-render keeps the drawn variant');
  ok((await choiceTexts()).some(t => /Keep it/.test(t)), 'creature choices render');
  const seen = await ev(() => { const s = new Set(); for (let i = 0; i < 60; i++) { enterEvent(STATE.byId[STATE.currentId], EVENTS.event_shipboard_001); s.add(STATE.variantIndex); } return [...s].sort(); });
  ok(JSON.stringify(seen) === '[0,1]', 'unstubbed draws hit both variants over 60 firings');

  console.log('— creature payoff chain');
  await enterWith(0.9); await page.waitForTimeout(300);
  await ev(() => [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /Keep it/.test(b.textContent)).click());
  await page.waitForTimeout(300);
  ok(await ev(() => STATE.flags.has('has_creature')), '"Keep it" sets has_creature');
  const eligible = await ev(() => {
    const node = STATE.nodes.find(n => n.node_type !== 'fork');
    const real = Math.random; const hits = new Set();
    for (let i = 0; i < 400; i++) { const e = selectEvent(node); if (e) hits.add(e.id); }
    return hits.has('event_shipboard_009');
  });
  ok(eligible, 'event_shipboard_009 enters the pool once has_creature is set');
  await ev(() => { STATE.cropGrowth.pest = true; applyOutcomeEffects(EVENTS.event_shipboard_009.choices[1].outcome); });
  ok(await ev(() => STATE.cropGrowth.pest === false), 'growbay patrol clears an active pest');
  await ev(() => { STATE.resources.o2 = 10; });
  ok(await ev(() => activeTriggers().has('low_o2') && !STATE.seenEventIds.has('event_shipboard_010')), 'low_o2 window open for The Creature Found It');

  console.log('— stowaway: Wembly joins as diplomat');
  await boot(['engineer']);
  await ev(() => {
    STATE.stowaway = { identity: MOD.flavor.stowaway_identities.find(i => i.id === 'stowaway_inspector'), revealed: false };
    STATE.daysElapsed = Math.ceil(STATE.baseDays * 0.3);
  });
  ok(await ev(() => STATE.stowaway.identity.join_role) === 'diplomat', 'identity join_role is diplomat');
  ok(await ev(() => activeTriggers().has('stowaway_aboard')), 'reveal window open past 20%');
  await ev(() => enterEvent(STATE.byId[STATE.currentId], EVENTS.event_shipboard_001));
  await page.waitForTimeout(400);
  ok(/Wembly Voss/.test(await body()), 'shipboard_001 renders the stowaway variant with tokens');
  await ev(() => [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')].find(b => /Welcome aboard/.test(b.textContent)).click());
  await page.waitForTimeout(300);
  ok(await ev(() => STATE.crew.includes('diplomat') && STATE.crewHP.diplomat === 100), 'welcomed: diplomat joins with 100 HP');
  ok(await ev(() => STATE.crewSkillCharges.diplomat === 1), 'joined diplomat gets skill charges');
  ok(await ev(() => !STATE.crew.includes('academic')), 'no "academic" pushed into STATE.crew');

  console.log('— welcome_replace cleans up');
  await boot(['engineer', 'pilot']);
  await ev(() => {
    STATE.stowaway = { identity: MOD.flavor.stowaway_identities.find(i => i.id === 'stowaway_chef'), revealed: true };
    STATE.crewPending.pilot = true;
    const real = Math.random; Math.random = () => 0.9; // picks pilot (index 1)
    try { applyOutcomeEffects({ stowaway_resolve: 'welcome_replace', time_cost: 'trivial' }); } finally { Math.random = real; }
  });
  ok(await ev(() => !STATE.crew.includes('pilot') && !('pilot' in STATE.crewSkillCharges) && !STATE.crewPending.pilot), 'departing pilot: charges + pending removed');
  ok(await ev(() => STATE.crew.includes('chef') && STATE.crewSkillCharges.chef === 1), 'chef stowaway joins with charges');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\nA2: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
