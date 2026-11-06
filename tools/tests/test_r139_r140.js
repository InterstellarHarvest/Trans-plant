// Ruling 139: five repeatable crises offer a big job on the fabricator —
// as good as the best plain way out, paid in wear, shut while it is
// broken — so a run that leans on it meets its low-health trouble.
// Ruling 140: Interstellar's five easy void-only scenes draw at 10, so a
// void stop turns one up about one time in ten.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const JOBS = [
  ['event_crisis_042', 'Print a new membrane', 'o2', 12, 25],
  ['event_crisis_012', 'Print condenser fins for the air loop', 'water', 12, 20],
  ['event_crisis_017', 'Print a patch plate for every hole', 'hull', 12, 25],
  ['event_crisis_049', 'Print a slow-release feed', 'crop', 18, 20],
  ['event_crisis_018', 'Print fine mesh for every planter', 'pest', 0, 20],
];
const EASY_VOID = ['event_void_005', 'event_void_006', 'event_void_007', 'event_void_008', 'event_void_009'];

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.map_rules && typeof enterEvent === 'function');

  console.log('— ruling 139: the big fabricator jobs');
  for (const [id, text, what, gain, wear] of JOBS) {
    const r = await page.evaluate(async ({ id, text }) => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const setup = (fab) => {
        localStorage.removeItem('transplant_save_v1');
        applySetupToState({ trail: 'mars', ai: 'aria', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'T' });
        STATE.stowaway = null; STATE.flags.add('departed');
        STATE.resources.o2 = 20; STATE.resources.water = 20; STATE.resources.hull = 25;
        STATE.cropGrowth.health = 40; STATE.cropGrowth.pest = true;
        STATE.fabricator = fab;
      };
      const ch = EVENTS[id].choices.find(c => c.text === text);
      if (!ch) return { missing: true };
      const node = () => STATE.nodes.find(n => n.node_type !== 'station' && n.node_type !== 'fork');
      // Broken: the row is shut and says why.
      setup({ wear: 100, broken: true });
      enterEvent(node(), EVENTS[id]); await w(120); finishAllTyping(); await w(150);
      const rowOf = () => [...document.querySelectorAll('#enc-choices > *')].find(b => b.textContent.includes(text));
      const brokenRow = rowOf();
      const brokenLocked = !!brokenRow && (brokenRow.disabled || brokenRow.classList.contains('locked') || /broken/i.test(brokenRow.textContent + (brokenRow.getAttribute('title') || '') + (brokenRow.getAttribute('data-tip-description') || '')));
      // Working at 60% wear: the row is open, its preview names the wear,
      // and taking it lands the gain and crosses into fab_low.
      setup({ wear: 60, broken: false });
      enterEvent(node(), EVENTS[id]); await w(120); finishAllTyping(); await w(150);
      const row = rowOf();
      const open = !!row && !row.disabled && !row.classList.contains('locked');
      const sub = row ? ((row.querySelector('.ch-sub-text') || {}).textContent || '') : '';
      const tip = row ? [row.getAttribute('title'), row.getAttribute('data-tip-description'), row.textContent].join(' ') : '';
      const before = { o2: STATE.resources.o2, water: STATE.resources.water, hull: STATE.resources.hull, crop: STATE.cropGrowth.health };
      applyOutcomeEffects(ch.outcome);
      const after = { o2: STATE.resources.o2, water: STATE.resources.water, hull: STATE.resources.hull, crop: STATE.cropGrowth.health };
      return { brokenLocked, open, sub, tip, before, after, wear: STATE.fabricator.wear, pest: STATE.cropGrowth.pest, fabLow: activeTriggers().has('fab_low') };
    }, { id, text });
    if (r.missing) { ok(false, `${id}: "${text}" missing`); continue; }
    ok(r.brokenLocked, `${id} "${text}": shut while the fabricator is broken`);
    ok(r.open && /fabricator/i.test(r.sub) && r.sub.length <= 30, `${id}: open when working, one-line sub "${r.sub}"`);
    ok(new RegExp('\\+' + wear + '% FAB WEAR').test(r.tip) || r.tip.includes(wear + '%'), `${id}: the preview names +${wear}% wear`);
    ok(r.wear === 60 + wear && r.fabLow, `${id}: 60% → ${r.wear}% wear, fab_low now active (${r.fabLow})`);
    if (what === 'pest') ok(r.pest === false, `${id}: the pests are cleared`);
    else ok(r.after[what] - r.before[what] >= gain * 0.5, `${id}: ${what} ${r.before[what]} → ${r.after[what]} (+${gain})`);
  }

  console.log('— ruling 140: the easy void scenes turn up at a void stop');
  {
    const r = await page.evaluate((EASY) => {
      let hit = 0, N = 0;
      for (let k = 0; k < 6; k++) {
        applySetupToState({ trail: 'interstellar', ai: 'aria', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'T' });
        STATE.flags.add('departed'); STATE.voyageSpecies = ['robot', 'insect', 'rock', 'water', 'reptile', 'unknown'][k];
        let node = STATE.nodes.find(n => n.node_type === 'void');
        if (!node) { node = STATE.nodes.filter(n => n.node_type !== 'station' && n.node_type !== 'fork').slice(-2)[0]; node.node_type = 'void'; }
        STATE.visited = new Set([STATE.currentId]);
        for (const n of STATE.nodes) { if (STATE.visited.size / pathLegs() >= 0.5) break; if (n.id !== node.id) STATE.visited.add(n.id); }
        STATE.currentId = node.id;
        for (let i = 0; i < 500; i++) { STATE.hardStreak = 0; STATE.pityRelief = 0; const ev = selectEvent(node); N++; if (ev && EASY.includes(ev.id)) hit++; }
      }
      return { share: hit / N, weights: EASY.map(id => EVENTS[id].draw_weight) };
    }, EASY_VOID);
    ok(r.weights.every(w => w === 10), `the five easy void scenes draw at 10 (${r.weights.join(', ')})`);
    ok(r.share > 0.05 && r.share < 0.25, `together ${(r.share * 100).toFixed(1)}% of a void stop's draws, halfway (about 1% before)`);
  }
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\nrulings 139–140: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
