// Ruling 90 (owner 2026-10-23): encounter variety, engine side.
//  1. alt_bodies: an event's opening has other tellings; each run starts the
//     rotation at its own place, every later firing in the run moves one on,
//     a reload mid-event keeps the same one, other layers and revisits are
//     untouched, and an event without alt_bodies reads as authored.
//  2. crisisShare: a situation's events share CRISIS_POOL_CAP events' worth of
//     the x15 weight (a pool of 6 gets half each; 3 or fewer keep the full x15).
//  3. The authored alt_bodies (content) all render.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const errors = [];
let browser;
async function boot(page) {
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && typeof enterEvent === 'function' && window.SceneArt);
  await page.evaluate(() => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'D' });
    STATE.stowaway = null;
  });
  await page.waitForTimeout(150);
}
// In-page: fire an event at the current node and read its opening.
const FIRE = `(id) => {
  const ev = EVENTS[id], node = STATE.byId[STATE.currentId];
  enterEvent(node, ev); // renders the entry (a second render would count as a revisit)
  return { text: document.getElementById('enc-narrative').textContent, pick: STATE.bodyPick };
}`;

(async () => {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('pageerror', e => errors.push(e.message));
  await boot(page);

  console.log('— a flat event with alt_bodies');
  const flat = await page.evaluate(async (FIRE) => {
    const fire = eval(FIRE);
    // A flat event with choices; give it two tagged alternates for the test.
    const ev = Object.values(EVENTS).find(e => !e.layers && typeof e.body === 'string' && e.body.length > 40 && !/\{/.test(e.body) && e.choices && e.choices.length && !e.stowaway_variant && !e.standard_variants && !e.alt_bodies);
    const orig = ev.body;
    ev.alt_bodies = ['ALT-ONE ' + orig.slice(0, 30), 'ALT-TWO ' + orig.slice(0, 30)];
    const tag = t => t.includes('ALT-ONE') ? 1 : t.includes('ALT-TWO') ? 2 : t.includes(orig.slice(0, 25)) ? 0 : -1;
    const runs = [];
    for (const seed of [11, 222, 3333, 44444, 555555, 6666666]) {
      STATE.artSeed = seed; STATE.eventDraws = {};
      const seq = [];
      for (let i = 0; i < 4; i++) { const r = fire(ev.id); seq.push({ tag: tag(r.text), pick: r.pick }); }
      runs.push(seq);
    }
    return { id: ev.id, runs, draws: STATE.eventDraws[ev.id] };
  }, FIRE);
  ok(flat.runs.every(seq => seq.every(s => s.tag === s.pick)), `the opening shown is the pick (${flat.id})`);
  ok(flat.runs.every(seq => seq[0].pick !== seq[1].pick && seq[1].pick !== seq[2].pick && new Set(seq.slice(0, 3).map(s => s.pick)).size === 3 && seq[3].pick === seq[0].pick),
    'within a run each firing moves one on: all three openings in three firings, then round again');
  ok(new Set(flat.runs.map(seq => seq[0].pick)).size >= 2, `runs start the rotation in different places (${flat.runs.map(seq => seq[0].pick).join(',')})`);
  ok(flat.draws === 4, 'firings counted (STATE.eventDraws)');

  console.log('— a reload mid-event keeps the opening');
  const reload1 = await page.evaluate(async (FIRE) => {
    const fire = eval(FIRE);
    const ev = Object.values(EVENTS).find(e => e.alt_bodies && e.alt_bodies[0].startsWith('ALT-ONE'));
    STATE.artSeed = 77; STATE.eventDraws = {}; STATE.currentEvent = null;
    fire(ev.id); const r = fire(ev.id);
    // the in-event save (enterEvent wrote it)
    const snap = JSON.parse(localStorage.getItem('transplant_save_v1'));
    return { id: ev.id, pick: r.pick, text: r.text, saved: snap && snap.pendingBodyPick, draws: snap && snap.eventDraws && snap.eventDraws[ev.id] };
  }, FIRE);
  ok(reload1.saved === reload1.pick && reload1.draws === 2, `the in-event save holds the pick (${reload1.saved}) and the count (${reload1.draws})`);
  await page.reload();
  await page.waitForFunction(() => typeof MOD !== 'undefined' && typeof enterEvent === 'function' && window.SceneArt);
  const reload2 = await page.evaluate(async (id) => {
    // the content's own event (no injected alts after a reload): inject the same alts again, then load
    const ev = EVENTS[id]; const orig = ev.body;
    ev.alt_bodies = ['ALT-ONE ' + orig.slice(0, 30), 'ALT-TWO ' + orig.slice(0, 30)];
    const loaded = loadRun();
    await new Promise(r => setTimeout(r, 300));
    return { loaded, pick: STATE.bodyPick, cur: STATE.currentEvent && STATE.currentEvent.id, text: document.getElementById('enc-narrative').textContent, draws: STATE.eventDraws[id] };
  }, reload1.id);
  ok(reload2.loaded && reload2.cur === reload1.id && reload2.pick === reload1.pick && reload2.draws === 2, `after a reload: same event, same opening (pick ${reload2.pick}), count not bumped`);
  ok(reload2.text.slice(0, 60) === reload1.text.slice(0, 60), 'the same words on screen');

  console.log('— layered events: only the entry layer, never a revisit');
  await boot(page);
  const lay = await page.evaluate(async (FIRE) => {
    const fire = eval(FIRE);
    const ev = EVENTS['event_encounter_toll_001'];
    const entry = ev.entryLayer, saveAlts = ev.alt_bodies;
    ev.alt_bodies = ['ALT-ONE {npc.quirk}', 'ALT-TWO {npc.quirk}'];
    STATE.eventDraws = {}; STATE.artSeed = 5;
    let r = fire(ev.id);
    while (r.pick === 0) r = fire(ev.id);
    const first = document.getElementById('enc-narrative').textContent;
    // into another layer, then back to the entry (a revisit)
    const other = Object.keys(ev.layers).find(k => k !== entry);
    STATE.layerStack.push(other); renderEncounterState();
    const otherText = document.getElementById('enc-narrative').textContent;
    STATE.layerStack.pop(); renderEncounterState();
    const back = document.getElementById('enc-narrative').textContent;
    ev.alt_bodies = saveAlts;
    return { first, otherText, otherBody: ev.layers[other].body.slice(0, 20), back, revisitBody: (ev.layers[entry].revisit || {}).body || '' };
  }, FIRE);
  ok(/ALT-(ONE|TWO)/.test(lay.first), 'the entry layer shows the alternate');
  ok(!/ALT-/.test(lay.otherText), 'a deeper layer keeps its own text');
  ok(lay.revisitBody ? lay.back.includes(lay.revisitBody.slice(0, 20)) && !/ALT-/.test(lay.back) : true, 'coming back to the entry shows its authored revisit text');

  console.log('— no alt_bodies: as authored');
  const plain = await page.evaluate(async (FIRE) => {
    const fire = eval(FIRE);
    const ev = Object.values(EVENTS).find(e => !e.layers && typeof e.body === 'string' && !/\{/.test(e.body) && e.choices && !e.alt_bodies && !e.stowaway_variant && !e.standard_variants);
    const a = fire(ev.id), b = fire(ev.id);
    return { pick: [a.pick, b.pick], same: a.text.includes(ev.body.slice(0, 30)) && b.text.includes(ev.body.slice(0, 30)), counted: (STATE.eventDraws || {})[ev.id] };
  }, FIRE);
  ok(plain.pick.every(p => p === 0) && plain.same && plain.counted === undefined, 'pick 0, the authored body, nothing counted');

  console.log('— a situation\'s events share one pull');
  const cap = await page.evaluate(() => {
    const mk = (id, t) => ({ id, trigger: [t], difficulty: 'medium' });
    const trig = new Set(['any', 'low_fuel', 'low_food']);
    const six = Array.from({ length: 6 }, (_, i) => mk('f' + i, 'low_fuel'));
    const two = [mk('w0', 'low_food'), mk('w1', 'low_food')];
    const plain = { id: 'p', trigger: ['any'], difficulty: 'medium' };
    const all = six.concat(two, [plain]);
    return { six: crisisShare(six[0], trig, all), two: crisisShare(two[0], trig, all), plain: crisisShare(plain, trig, all), cap: CRISIS_POOL_CAP,
      both: crisisShare({ id: 'b', trigger: ['low_fuel', 'low_food'] }, trig, all.concat([{ id: 'b', trigger: ['low_fuel', 'low_food'] }])) };
  });
  ok(cap.cap === 3 && Math.abs(cap.six - 0.5) < 1e-9, `six low-fuel events: half the pull each (${cap.six}) — the pool's total stays three events' worth`);
  ok(cap.two === 1, 'two low-food events keep the full x15');
  ok(cap.plain === 1, 'an ordinary event is untouched');
  ok(Math.abs(cap.both - 1) < 1e-9, 'an event in two situations takes its better share');

  console.log('— every authored alt_bodies renders');
  await boot(page);
  const authored = await page.evaluate(async (FIRE) => {
    const fire = eval(FIRE);
    const out = [];
    for (const ev of Object.values(EVENTS).filter(e => Array.isArray(e.alt_bodies))) {
      STATE.eventDraws = {};
      const seen = new Set();
      for (let i = 0; i <= ev.alt_bodies.length; i++) {
        try { const r = fire(ev.id); seen.add(r.pick); if (/\{[a-z_.]+\}/.test(r.text)) out.push({ id: ev.id, bad: 'raw token: ' + r.text.match(/\{[a-z_.]+\}/)[0] }); }
        catch (e) { out.push({ id: ev.id, bad: e.message }); break; }
      }
      if (seen.size !== ev.alt_bodies.length + 1) out.push({ id: ev.id, bad: 'saw ' + seen.size + ' of ' + (ev.alt_bodies.length + 1) });
      out.push({ id: ev.id, n: seen.size });
    }
    return out;
  }, FIRE);
  const bad = authored.filter(a => a.bad);
  const n = authored.filter(a => a.n).length;
  ok(!bad.length, `${n} events with authored alternates: every opening shows, tokens filled (${bad.slice(0, 3).map(b => b.id + ' ' + b.bad).join('; ') || 'clean'})`);

  ok(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(`\nalt_bodies: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
