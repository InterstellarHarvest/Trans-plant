// Planet names by place (ruling 135): Lunar planets come from the Lunar
// pool or a Lunar designation; a far planet in the voyage species' space
// from that species' pool or designations; names are unique on a map and
// no pattern token is left unfilled.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.flavor && typeof applySetupToState === 'function');
  const r = await page.evaluate(() => {
    const F = MOD.flavor, out = { bad: [], lunar: 0, far: 0, gen: 0, total: 0, dup: 0 };
    const toRe = p => new RegExp('^' + p.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{L\}/g, '[A-Z]').replace(/\{N\}/g, '[1-9]').replace(/\{b\}/g, '[b-g]') + '$');
    const pats = k => (F.planet_name_patterns[k] || F.planet_name_patterns.any).map(toRe);
    for (const trail of ['lunar', 'mars', 'interstellar']) for (let i = 0; i < 40; i++) {
      localStorage.removeItem('transplant_save_v1');
      applySetupToState({ trail, ai: 'marv', captain: 'veteran', crew: ['medic', 'chef'], crop: 'wheat', ship: 'B' });
      const rules = MOD.map_rules.trails[trail];
      const names = STATE.nodes.filter(n => n.node_type !== 'fork').map(n => n.name); // every fork is "Route Decision"
      if (new Set(names).size !== names.length) out.dup++;
      for (const n of STATE.nodes.filter(x => x.node_type === 'planet' && x.position !== rules.total_nodes - 1)) {
        out.total++;
        if (/[{}]/.test(n.name)) out.bad.push(trail + ': unfilled ' + n.name);
        const sp = speciesZone(n, rules) === 'far' ? STATE.voyageSpecies : null;
        const key = sp || trail;
        const gen = pats(key).some(re => re.test(n.name));
        if (gen) out.gen++;
        if (trail === 'lunar') { out.lunar++; if (!gen && !F.planet_names_by_trail.lunar.includes(n.name)) out.bad.push('lunar: ' + n.name); }
        else if (sp) { out.far++; if (!gen && !F.planet_names_by_species[sp].includes(n.name)) out.bad.push(trail + ' far ' + sp + ': ' + n.name); }
        else if (!gen && !F.planet_names.includes(n.name)) out.bad.push(trail + ' near: ' + n.name);
      }
    }
    return out;
  });
  ok(r.lunar > 30 && r.far > 20, `planets checked: ${r.total} (${r.lunar} Lunar, ${r.far} in species space)`);
  ok(!r.bad.length, 'every planet name comes from its place\'s pool or designations: ' + r.bad.slice(0, 6).join(' | '));
  ok(r.gen / r.total > 0.15 && r.gen / r.total < 0.45, `about a third are designations (${(100 * r.gen / r.total).toFixed(0)}%)`);
  ok(r.dup === 0, 'names unique on every map (' + r.dup + ' maps with a repeat)');
  ok(!errors.length, 'no page errors: ' + errors.slice(0, 3).join(' | '));
  console.log('ruling 135: ' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
