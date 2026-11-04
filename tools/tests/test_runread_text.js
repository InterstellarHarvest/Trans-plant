// Read-through text fixes (2026-11-04 review, section D): the Ship's Log's
// sentence cut and capitals skip honorifics, a ??? fork lane reads
// "unmarked", the log names a layered scene by the title on screen, AJOY's
// hindsight says water and item names, a named gain counts as a gain, a
// leg that cost a life carries no AI sign-off, the deprivation endings
// state the real dry days, and a market session logs its own line.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && typeof enterEvent === 'function');
  const r = await page.evaluate(() => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai: 'aria', captain: 'veteran', crew: ['medic', 'chef'], crop: 'wheat', ship: 'B' });
    STATE.stowaway = null; STATE.flags.add('departed');
    const T = ShipLog.text, out = {};
    out.dr = T.oneLine('Dr. Vasquez patches it. Then she sleeps.', 80);
    out.ret = T.capSentences('captain Reeves (Ret.) rides as a passenger. then it ends.');
    out.plain = T.oneLine('It holds. Mostly.', 80);
    // A fork: one lane hidden, one labelled.
    const fork = STATE.nodes.find(n => n.connects_to && n.connects_to.alpha && n.connects_to.beta);
    if (fork) {
      STATE.currentId = fork.id;
      const a = STATE.byId[fork.connects_to.alpha[0]], b = STATE.byId[fork.connects_to.beta[0]];
      a.branch_hidden = true; b.branch_hidden = false; b.branch_flavor = b.branch_flavor || 'trade_lane';
      out.fork = interpolateStowawayTokens('The port lane is marked {branch.alpha.label}. The starboard lane is marked {branch.beta.label}.');
    }
    const layered = Object.values(EVENTS).find(e => e.layers && e.entryLayer && e.layers[e.entryLayer].title && e.layers[e.entryLayer].title.toUpperCase() !== String(e.title).toUpperCase());
    out.scene = { authored: layered.title, entry: layered.layers[layered.entryLayer].title, logged: T.sceneTitle(layered) };
    const flat = Object.values(EVENTS).find(e => !e.layers && e.title);
    out.flat = { authored: flat.title, logged: T.sceneTitle(flat) };
    out.words = ['13 H2O', '4 O2', 'LOGBOOK FRAGMENT', 'A DEATH RISK'].map(hindsightWords);
    // Endings: the real dry days.
    STATE.deprived = { water: 8 };
    const f = MOD.failures.find(x => x.failure_type === 'dehydration');
    out.failure = { body: f.body, has: /\{dry_days\}/.test(f.body) };
    return out;
  });
  ok(r.dr === 'Dr. Vasquez patches it.', 'first sentence keeps "Dr.": ' + r.dr);
  ok(r.ret === 'Captain Reeves (Ret.) rides as a passenger. Then it ends.', '"(Ret.)" raises no capital: ' + r.ret);
  ok(r.plain === 'It holds.', 'a plain first sentence still cuts: ' + r.plain);
  ok(r.fork && /port lane is unmarked\./.test(r.fork) && /starboard lane is marked [A-Z]/.test(r.fork) && !/marked unmarked/.test(r.fork), 'fork lanes: ' + r.fork);
  ok(r.scene.logged.toUpperCase() === r.scene.entry.toUpperCase() && r.scene.logged !== r.scene.entry, `layered scene logged as its screen title, in title case (${r.scene.authored} → ${r.scene.logged})`);
  ok(r.flat.logged === r.flat.authored, 'a flat event keeps its own title');
  ok(r.words[0] === '13 water' && r.words[1] === '4 air' && /^a Logbook Fragment$/i.test(r.words[2]) && r.words[3] === 'a death risk', 'hindsight words: ' + r.words.join(' / '));
  ok(r.failure.has, 'the dehydration failure names its days by token');
  // The dehydration ending as rendered: eight dry days.
  const end = await page.evaluate(() => {
    STATE.deprived = { water: 8 };
    const f = MOD.failures.find(x => x.failure_type === 'dehydration');
    const v = buildEndView({ kind: 'failure', module: f });
    return JSON.stringify([v.body, v.epitaph || v.quote || '']);
  });
  ok(/eight days/.test(end) && /Eight days without water/.test(end) && !/dry_days/i.test(end), 'dehydration ending says eight days: ' + end.slice(0, 160));
  ok(!errors.length, 'no page errors: ' + errors.slice(0, 3).join(' | '));
  console.log('runread text: ' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
