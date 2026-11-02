// Ruling 120: events gated on who this run is, on the route share flown, and
// on a lost ship in the player's own history, plus the wreck tokens.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.materials && MOD.crew_roster && MOD.flavor);
  const r = await page.evaluate(() => {
    localStorage.removeItem('transplant_records_v1');
    applySetupToState({ trail: 'mars', ai: 'rex', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'tomato', ship: 'D' });
    STATE.visited = new Set([STATE.currentId]);
    const F = e => fitsThisRun(e);
    const out = {
      plain: F({}), cap: F({ captain_background: 'veteran' }), capList: F({ captain_background: ['medic', 'veteran'] }), capNo: F({ captain_background: 'medic' }),
      crop: F({ crop_type: 'tomato' }), cropNo: F({ crop_type: 'wheat' }), ai: F({ requires_ai: 'rex' }), aiNo: F({ requires_ai: 'aria' }),
      early: F({ after_progress: 0.5 }), wreckNone: F({ requires_past_run: true }),
    };
    STATE.visited = new Set(STATE.nodes.slice(0, Math.ceil(pathLegs() * 0.6) + 1).map(n => n.id));
    out.late = F({ after_progress: 0.5 });
    out.stepEarly = F({ after_event: 'event_voyage_quest_001' });
    STATE.seenEventIds.add('event_voyage_quest_001');
    out.stepDue = F({ after_event: 'event_voyage_quest_001' });
    STATE.flags.add('case_on');
    out.openerBlocked = F({ unless_flag: ['case_on', 'book_on'] });
    out.openerFree = F({ unless_flag: ['book_on'] });
    // A lost run of this same art seed is this run's own save: never its own wreck.
    const seed = STATE.artSeed;
    localStorage.setItem('transplant_records_v1', JSON.stringify({ best: {}, runs: [{ id: seed + ':9:mutiny:x', kind: 'failure', ship: 'Own Ship', tone: 'mutiny', days: 9 }] }));
    out.ownOnly = F({ requires_past_run: true });
    localStorage.setItem('transplant_records_v1', JSON.stringify({ best: {}, runs: [
      { id: (seed + 1) + ':80:dehydration:x', kind: 'failure', ship: 'The Working Title', captain: 'medic', crop: 'wheat', tone: 'dehydration', days: 80 },
      { id: (seed + 2) + ':90:good:1', kind: 'arrival', ship: 'Winner', captain: 'pilot', crop: 'wheat', tone: 'good', days: 90 }] }));
    out.wreck = F({ requires_past_run: true });
    out.text = interpolateStowawayTokens('The {wreck.ship}, {wreck.captain}, {wreck.crop}, {wreck.fate} on day {wreck.days}.');
    out.same = window.pastWreck().ship === window.pastWreck().ship;
    STATE.artSeed = seed + 1; out.ownSkipped = window.pastWreck();
    localStorage.removeItem('transplant_records_v1');
    out.fallback = interpolateStowawayTokens('{wreck.ship} {wreck.fate}');
    STATE.items = ['borrowed_charm', 'locked_case'];
    out.cursed = !!itemDef('borrowed_charm').no_jettison;
    const vis = (chs) => chs.filter(ch => !(ch.unless_item && STATE.items.includes(ch.unless_item))).length;
    out.unlessHeld = vis([{ unless_item: 'locked_case' }, {}]);
    STATE.items = ['borrowed_charm'];
    out.unlessGone = vis([{ unless_item: 'locked_case' }, {}]);
    STATE.items = [];
    out.airPlain = interpolateCostTokens('{cost.o2}', { resources: { o2: -10 } });
    STATE.items = ['o2_recycler'];
    out.airRecycled = interpolateCostTokens('{cost.o2}', { resources: { o2: -10 } });
    STATE.items = [];
    STATE.trail = 'mars';
    out.costBig = effectiveResDelta('water', -30, {});
    out.costSmall = effectiveResDelta('water', -2, {});
    const fab = (MOD.recipes.recipes || []).filter(x => x.requires_item && x.requires_item.startsWith('blueprint_')).map(x => [x.id, !!itemDef(x.requires_item), !!itemDef(x.output.item_id)]);
    out.fab = fab;
    out.items = ['talking_crate', 'borrowed_charm', 'hold_sprout', 'urgent_parcel', 'blueprint_still', 'blueprint_poultice', 'landing_deed', 'locked_case', 'heirloom_packet', 'overdue_book'].map(i => [invItemCategory(i), invEmojiOf(i) !== '📦', itemSpritePath(i)]);
    return out;
  });
  ok(r.plain && r.cap && r.capList && !r.capNo, 'captain_background: one value or a list');
  ok(r.crop && !r.cropNo, 'crop_type gates on the run\'s crop');
  ok(r.ai && !r.aiNo, 'requires_ai gates on the run\'s AI');
  ok(!r.early && r.late, 'after_progress holds an event back until that share of the route');
  ok(!r.stepEarly && r.stepDue, 'a quest step waits for the step before it');
  ok(!r.openerBlocked && r.openerFree, 'an opener stands aside for a quest under way');
  ok(!r.wreckNone, 'no history: a wreck event stays out');
  ok(!r.ownOnly, 'a run is never its own wreck');
  ok(r.wreck && r.same, 'a lost ship on record: the wreck event can fire, and it is the same ship all run');
  ok(r.text === 'The The Working Title, medic, wheat, ran out of water on day 80.', 'wreck tokens fill in: ' + r.text);
  ok(r.ownSkipped === null, 'an arrival is not a wreck');
  ok(r.fallback === 'the wreck never arrived', 'wreck tokens never show raw text with no history');
  ok(r.fab.length === 2 && r.fab.every(x => x[1] && x[2]), 'two blueprint recipes, each with its item and output');
  ok(r.items.every(x => x[0] === 'STORY' && /^sprites\/cargo\/items\/.+\.png$/.test(x[2])), 'ten new items, filed under Story, with their art');
  ok(r.cursed, 'the Borrowed Charm cannot be jettisoned');
  ok(r.unlessHeld === 1 && r.unlessGone === 2, 'an unless_item row shows only while the item is gone');
  ok(r.airPlain === 'ten' && r.airRecycled !== 'ten', '{cost.o2} states the air an outcome really costs, recycler included: ' + r.airPlain + ' / ' + r.airRecycled);
  ok(r.costBig === -60, 'one event never costs more than the cap: ' + r.costBig);
  ok(r.costSmall === -13, 'the trail multiplier still applies below it: ' + r.costSmall);
  ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
  await browser.close();
  console.log(`\nrun identity: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
