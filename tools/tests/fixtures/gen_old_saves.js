// Makes the old-save fixtures for test_save_fixtures.js: plays each old
// build with its own sim.js policy and exports real localStorage saves
// (a hub save and an in-event save per trail).
//
//   git worktree add --detach ../_worktrees/old-<sha> <sha>
//   (cd ../_worktrees/old-<sha> && python3 -m http.server <port>)
//   node tools/tests/fixtures/gen_old_saves.js <sha> http://localhost:<port>/index.html ../_worktrees/old-<sha>
//
// Writes tools/tests/fixtures/saves/<sha>_<trail>_<hub|event>.json. Add a
// build whenever the save format changes; never edit a fixture by hand.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [SHA, URL, TREE] = process.argv.slice(2);
if (!SHA || !URL || !TREE) { console.log('usage: gen_old_saves.js <sha> <url> <worktree>'); process.exit(2); }
const OUT = path.join(__dirname, 'saves');
fs.mkdirSync(OUT, { recursive: true });

// That build's own sim policies (sim.js ran its main on require then).
const src = fs.readFileSync(path.join(TREE, 'tools/tests/sim.js'), 'utf8');
const body = src.slice(0, src.lastIndexOf('(async () => {'));
const sim = new Function('require', '__dirname', 'process', body + '\nreturn { installHarness, step };')(require, path.join(TREE, 'tools/tests'), { argv: [], env: {} });

const CFG = {
  lunar: { trail: 'lunar', ai: 'aria', captain: 'medic', crew: ['engineer', 'botanist'], crop: 'wheat', ship: 'Fixture' },
  mars: { trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['pilot'], crop: 'tomato', ship: 'Fixture' },
  interstellar: { trail: 'interstellar', ai: 'chip', captain: 'academic', crew: ['xenobiologist', 'chef'], crop: 'soybean', ship: 'Fixture' },
};

(async () => {
  const browser = await chromium.launch();
  for (const [trail, cfg] of Object.entries(CFG)) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)));
    page.on('dialog', d => d.accept());
    await page.clock.install();
    await page.goto(URL);
    await page.clock.runFor(1500);
    await page.waitForFunction(() => typeof EVENTS !== 'undefined' && Object.keys(EVENTS).length > 0);
    await page.evaluate(() => localStorage.removeItem('transplant_save_v1'));
    await page.evaluate(sim.installHarness, 'greedy');
    await page.evaluate(c => { applySetupToState(c); returnToHub(); }, cfg);
    await page.clock.runFor(300);
    const got = {};
    let lastHub = null;
    for (let s = 0; s < 400 && !(got.hub && got.event); s++) {
      const r = await page.evaluate(sim.step).catch(e => ({ wait: 300, err: e.message }));
      if (r.done) break;
      await page.clock.runFor(r.wait || 100);
      const snap = await page.evaluate(() => {
        const scr = (document.querySelector('.screen.active') || {}).id;
        const enc = document.getElementById('screen-encounter');
        if (scr === 'screen-cruise' && !STATE.currentEvent && !document.querySelector('#game .overlay.active') && saveRun()) return { kind: 'hub', raw: localStorage.getItem('transplant_save_v1') };
        if (scr === 'screen-encounter' && !enc.classList.contains('combat-mode') && !STATE.outcomeMode) {
          const raw = localStorage.getItem('transplant_save_v1');
          if (raw && JSON.parse(raw).pendingEvent) return { kind: 'event', raw };
        }
        return null;
      });
      // Late enough in the run that the save carries a log, flags, a crop.
      if (snap && !got[snap.kind] && s >= (snap.kind === 'hub' ? 30 : 12)) got[snap.kind] = snap.raw;
      if (snap && snap.kind === 'hub') lastHub = snap.raw;
    }
    // Older sims stall at the first station: take the last hub save seen.
    if (!got.hub && lastHub) got.hub = lastHub;
    for (const [kind, raw] of Object.entries(got)) {
      const f = path.join(OUT, `${SHA}_${trail}_${kind}.json`);
      fs.writeFileSync(f, JSON.stringify(JSON.parse(raw), null, 1));
      console.log(`${SHA} ${trail} ${kind}: day ${JSON.parse(raw).daysElapsed}, ${raw.length} bytes → ${path.basename(f)}`);
    }
    if (!got.hub || !got.event) console.log(`${SHA} ${trail}: missing ${['hub', 'event'].filter(k => !got[k]).join(', ')}`);
    if (errors.length) console.log(`${SHA} ${trail}: page errors`, errors.slice(0, 3));
    await page.close();
  }
  await browser.close();
})();
