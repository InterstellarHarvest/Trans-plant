// Demo parity, batch 2 — the finish pass (2026-10-11):
//  1. endings: every arrival shows its destination × crop line and its
//     tier quote (demo-endings ARRIVAL_BODY + TIER_QUOTE), authored in
//     endings.json (MOD.endingLines), with batch 1's motion intact;
//  2. derelict salvage (owner ruling #12): SALVAGE inside a hulk plays the
//     salvage game with sprites/minigames/derelict/ (all 11), pays exactly
//     what the haul card says, quitting keeps nothing; a broken-up derelict
//     (DEBRIS FIELD) keeps the space game;
//  3. map touches: stacked amber YOU ARE HERE, flavor pills — grey ???
//     before the fork, red ??? uncharted, per-flavor colour after; ~35% of
//     forks hide one label;
//  4. items.json gameplay_effect is player text only (design_note holds the
//     authoring notes); no note shows anywhere.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
const SHOTS = process.env.SHOTS || '';
async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.endingLines);
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
const NOTE = /\b(Stackable|Craftable|Fabricated|Pure trade good|Info-only|Gate item|Key for)\b|\b(event|recipe|item|crop)_[a-z0-9_]+|\b[a-z]+_[a-z][a-z_]*\b/;

(async () => {
  browser = await chromium.launch();

  // ── 1. Endings ────────────────────────────────────────────────
  console.log('— endings: destination × crop lines + tier quotes');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(res => setTimeout(res, ms));
      const L = MOD.endingLines;
      const out = { combos: [], data: !!(L && L.arrival_lines && L.tier_quotes), stillEnding: MOD.endings.every(e => e.id && !e._section) };
      const crops = MOD.crops.crops.map(c => c.id.replace(/^crop_/, ''));
      for (const trail of ['lunar', 'mars', 'interstellar']) {
        for (const crop of crops.concat('noplant')) {
          STATE.trail = trail;
          STATE.crop = crop === 'noplant' ? STATE.crop : crop;
          STATE.cropGrowth = STATE.cropGrowth || {};
          STATE.cropGrowth.health = crop === 'noplant' ? 0 : 90;
          STATE.ended = false;
          window.renderEndScreen({ kind: 'ending', module: MOD.endings[0] });
          window.showEndReport(); await w(20);
          const a = document.getElementById('end-report-arrival'), q = document.getElementById('end-report-quote');
          const bracket = scoreBracket();
          out.combos.push({ trail, crop, bracket, shown: a.textContent, want: L.arrival_lines[trail][crop],
            vis: getComputedStyle(a).display !== 'none' && a.getBoundingClientRect().height > 0,
            quote: q.textContent, wantQ: L.tier_quotes[bracket], qvis: getComputedStyle(q).display !== 'none',
            bg: getComputedStyle(document.getElementById('end-scene')).backgroundImage });
        }
      }
      // every bracket's quote
      const real = window.scoreBracket;
      out.brackets = [];
      STATE.crop = 'wheat'; STATE.cropGrowth.health = 90; STATE.trail = 'lunar';
      for (const b of ['legendary', 'good', 'rough', 'pyrrhic', 'hollow']) {
        window.scoreBracket = () => b;
        window.renderEndScreen({ kind: 'ending', module: MOD.endings[0] });
        window.showEndReport(); await w(20);
        out.brackets.push({ b, quote: document.getElementById('end-report-quote').textContent, want: L.tier_quotes[b], title: document.getElementById('end-cine-title').textContent });
      }
      window.scoreBracket = real;
      // styles + motion (batch 1) on a fresh report
      window.renderEndScreen({ kind: 'ending', module: MOD.endings[0] });
      await w(30);
      window.showEndReport(); await w(40);
      const a = document.getElementById('end-report-arrival'), q = document.getElementById('end-report-quote'), b = document.getElementById('end-report-body');
      const cs = getComputedStyle(a);
      out.style = { font: cs.fontFamily, color: cs.color, size: cs.fontSize, qItalic: getComputedStyle(q).fontStyle, order: a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? 'arrival-first' : 'body-first',
        report: document.getElementById('end-report').getAnimations().map(x => x.animationName), card: document.getElementById('end-report-card').getAnimations().map(x => x.animationName) };
      // failures carry no arrival line
      window.renderEndScreen({ kind: 'failure', module: MOD.failures.find(f => f.failure_type === 'no_fuel') });
      window.showEndReport(); await w(20);
      out.failArrival = getComputedStyle(document.getElementById('end-report-arrival')).display;
      return out;
    });
    ok(r.data && r.stillEnding, 'arrival_lines + tier_quotes load from endings.json into MOD.endingLines; MOD.endings holds only endings');
    ok(r.combos.length === 18, `18 destination × crop combos rendered (${r.combos.length})`);
    const bad = r.combos.filter(c => c.shown !== c.want || !c.vis || !c.want);
    ok(!bad.length, `every combo shows its own line on the report (${bad.map(c => c.trail + '/' + c.crop).join(', ') || 'all 18'})`);
    const badQ = r.combos.filter(c => c.quote !== c.wantQ || !c.qvis || !c.wantQ);
    ok(!badQ.length, `every combo shows its bracket's tier quote (${badQ.map(c => c.trail + '/' + c.crop + ':' + c.bracket).join(', ') || 'all 18'})`);
    const lw = r.combos.find(c => c.trail === 'lunar' && c.crop === 'wheat'), fz = r.combos.find(c => c.trail === 'interstellar' && c.crop === 'zinnia');
    ok(lw.shown !== fz.shown && /Lunar wheat/.test(lw.shown) && /Far Garden/.test(fz.shown), `lunar wheat and Far Garden zinnia read differently ("${lw.shown.slice(0, 32)}…" / "${fz.shown.slice(0, 32)}…")`);
    ok(new Set(r.combos.map(c => c.shown)).size === 18, 'all 18 lines distinct');
    ok(r.combos.filter(c => c.crop === 'noplant').every(c => c.bracket === 'hollow' && /noplant/.test(c.bg)), 'a dead crop reads the noplant line under the hollow bracket (matches the noplant backdrop)');
    ok(r.brackets.every(x => x.quote === x.want && x.want), `each of the 5 brackets shows its own quote (${r.brackets.map(x => x.b).join('/')})`);
    ok(/VT323/.test(r.style.font) && r.style.color === 'rgb(232, 216, 160)' && r.style.size === '19px' && r.style.qItalic === 'italic' && r.style.order === 'arrival-first',
      `line in the demo body voice (VT323 19px cream), quote italic, line leads the report (${r.style.font} ${r.style.color} ${r.style.size}, ${r.style.order})`);
    ok(r.style.report.includes('end-fade-in') && r.style.card.includes('end-card-rise'), `batch-1 motion kept (report ${r.style.report}, card ${r.style.card})`);
    ok(r.failArrival === 'none', 'a failure report shows no arrival line');
    const src = await page.evaluate(async () => (await fetch('engine/js/screens/endings.js')).text());
    ok(!/regolith|Far Garden potatoes|Jenkins/.test(src), 'the lines are data (endings.json), not hard-coded in endings.js');
    if (SHOTS) {
      await page.evaluate(async () => { STATE.trail = 'interstellar'; STATE.crop = 'zinnia'; STATE.cropGrowth.health = 90; window.renderEndScreen({ kind: 'ending', module: MOD.endings[0] }); await new Promise(r => setTimeout(r, 600)); window.showEndReport(); });
      await page.waitForTimeout(900);
      await page.screenshot({ path: SHOTS + '/engine_endings_report.png' });
    }
    await page.close();
  }

  // ── 2. gameplay_effect ───────────────────────────────────────
  console.log('— gameplay_effect: player text only, no authoring notes anywhere');
  {
    const page = await boot();
    const d = await page.evaluate(() => MOD.items.map(i => ({ id: i.id, ge: i.gameplay_effect, note: i.design_note })));
    const dirty = d.filter(x => x.ge && NOTE.test(x.ge));
    ok(!dirty.length, `no gameplay_effect carries an authoring note (${dirty.map(x => x.id).join(', ') || d.filter(x => x.ge).length + ' clean'})`);
    ok(d.filter(x => x.note).length >= 20, `the notes moved to design_note (${d.filter(x => x.note).length} items)`);
    const fab = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.items.push('repair_fabricator');
      openFabricator(); await w(300);
      const out = [];
      for (const rec of MOD.recipes.recipes) {
        [...document.querySelectorAll('.fb-recipe-row')].find(r => r.textContent.includes(rec.name)).click();
        out.push({ id: rec.id, eff: document.getElementById('fb-detail-effect').textContent, raw: itemDef(rec.output.item_id).gameplay_effect });
      }
      const all = document.getElementById('overlay-fabricator') ? document.getElementById('overlay-fabricator').innerText : document.body.innerText;
      return { out, all };
    });
    ok(fab.out.every(f => f.eff === '▸ ' + f.raw), `fabricator shows gameplay_effect as written, no display filter (${fab.out.map(f => f.id.replace('recipe_', '')).join(', ')})`);
    const src = await page.evaluate(async () => (await fetch('engine/js/screens/fabricator.js')).text());
    ok(!/Craftable\|Fabricated\|Stackable/.test(src), 'the fabricator\'s display-time note filter is gone');
    // Every item's inventory detail: no design note, no note marker.
    const inv = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const notes = MOD.items.map(i => i.design_note).filter(Boolean);
      const seen = [];
      const ids = MOD.items.map(i => i.id.replace(/^item_/, '').replace(/_\d+$/, ''));
      STATE.items = ids.slice(); if (typeof syncItemValues === 'function') syncItemValues();
      openInventory(); await w(150);
      const n = document.querySelectorAll('#overlay-inventory .inv-tile').length;
      for (let i = 0; i < n; i++) { const t = document.querySelectorAll('#overlay-inventory .inv-tile')[i]; if (!t) break; t.click(); await w(10); seen.push(document.getElementById('overlay-inventory').innerText); }
      closeInventory();
      const text = seen.join('\n');
      return { tiles: n, leak: notes.filter(nt => text.includes(nt)), marker: (text.match(/Stackable \(|Pure trade good|Gate item|Info-only|recipe_[a-z]/) || [])[0] || null };
    });
    ok(inv.tiles > 10 && !inv.leak.length && !inv.marker, `inventory detail for every held item: no design note or marker (${inv.tiles} tiles${inv.marker ? ', saw "' + inv.marker + '"' : ''})`);
    const fabLeak = await page.evaluate(() => MOD.items.map(i => i.design_note).filter(Boolean));
    ok(!fabLeak.some(nt => fab.all.includes(nt)), 'fabricator screen shows no design note');
    await page.close();
  }

  // ── 3. Map touches ───────────────────────────────────────────
  console.log('— map: YOU ARE HERE + branch flavor pills');
  {
    const page = await boot({ trail: 'mars' });
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(res => setTimeout(res, ms));
      // find a fork and its two first branch nodes (fallback: build one from any fork-shaped node)
      const fork = STATE.nodes.find(n => n.node_type === 'fork' && n.connects_to && n.connects_to.alpha) || STATE.nodes.find(n => n.connects_to && !Array.isArray(n.connects_to));
      if (!fork) return { noFork: true };
      const a = STATE.byId[fork.connects_to.alpha[0]], b = STATE.byId[fork.connects_to.beta[0]];
      a.branch_flavor = 'lucrative'; a.branch_hidden = undefined;
      b.branch_flavor = 'hostile'; b.branch_hidden = true;
      const pre = STATE.nodes.find(n => connectionsOf(n).includes(fork.id));
      const read = () => [a, b].map(n => {
        const el = document.querySelector('#ovmap-nodes .map-node[data-node="' + n.id + '"]');
        const bf = el && el.querySelector('.map-branch-flavor'); const cs = bf && getComputedStyle(bf);
        return bf && { text: bf.textContent, color: cs.color, border: cs.borderTopColor, bw: cs.borderTopWidth, bs: cs.borderTopStyle, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, pad: cs.paddingTop + ' ' + cs.paddingLeft, font: cs.fontFamily };
      });
      const out = {};
      // before the fork
      STATE.visited = new Set([pre.id]); STATE.currentId = pre.id;
      document.getElementById('btn-map').click(); await w(150);
      out.before = read();
      const here = document.querySelector('#ovmap-nodes .map-node.current .map-here');
      const node = document.querySelector('#ovmap-nodes .map-node.current .shape').getBoundingClientRect();
      const hcs = here && getComputedStyle(here);
      out.here = here && { text: here.innerText, color: hcs.color, font: hcs.fontFamily, size: hcs.fontSize, lines: here.innerHTML.split('<br>').length,
        above: here.getBoundingClientRect().bottom <= node.top + 1, centred: Math.abs((here.getBoundingClientRect().left + here.getBoundingClientRect().right) / 2 - (node.left + node.right) / 2) < 6,
        anim: here.getAnimations().map(x => x.animationName) };
      hideOverlay('overlay-map'); await w(50);
      // at the fork
      STATE.visited.add(fork.id); STATE.currentId = fork.id;
      document.getElementById('btn-map').click(); await w(150);
      out.after = read();
      hideOverlay('overlay-map'); await w(50);
      // per-flavor colours, every flavor
      out.colours = {};
      for (const f of ['lucrative', 'hostile', 'safe', 'corporate', 'derelict_heavy', 'scientific', 'agricultural']) {
        a.branch_flavor = f;
        document.getElementById('btn-map').click(); await w(60);
        out.colours[f] = read()[0].color;
        hideOverlay('overlay-map'); await w(30);
      }
      return out;
    });
    if (r.noFork) ok(false, 'no fork on the map');
    else {
      const grey = 'rgb(122, 136, 152)';
      ok(r.before.every(x => x && x.text === '???' && x.color === grey), `before the fork both labels are dim grey ??? (${r.before.map(x => x && x.text + ' ' + x.color).join(' | ')})`);
      ok(r.after[0].text === 'LUCRATIVE' && r.after[0].color === 'rgb(255, 172, 0)', `after: lucrative reads LUCRATIVE in amber (${r.after[0].text} ${r.after[0].color})`);
      ok(r.after[1].text === '???' && r.after[1].color === 'rgb(204, 51, 51)', `after: the uncharted branch reads red ??? (${r.after[1].text} ${r.after[1].color})`);
      const p = r.after[0];
      ok(p.bw === '1px' && p.bs === 'solid' && p.radius === '3px' && p.bg === 'rgba(14, 21, 32, 0.7)' && p.pad === '3px 6px' && /Press Start 2P/.test(p.font), `pill chrome: 1px border, 3px radius, navy glass, 3×6 padding, pixel font (${p.bw} ${p.radius} ${p.bg} ${p.pad})`);
      const want = { lucrative: 'rgb(255, 172, 0)', hostile: 'rgb(203, 47, 52)', safe: 'rgb(140, 200, 144)', corporate: 'rgb(53, 198, 191)', derelict_heavy: 'rgb(93, 90, 97)', scientific: 'rgb(140, 127, 200)', agricultural: 'rgb(203, 156, 93)' };
      ok(Object.keys(want).every(f => r.colours[f] === want[f]), `each flavor its own colour (${Object.entries(r.colours).map(([k, v]) => k + ' ' + v).join(', ')})`);
      ok(r.here && r.here.lines === 4 && /YOU\s*ARE\s*HERE\s*▼/.test(r.here.text) && r.here.color === 'rgb(255, 172, 0)' && /Press Start 2P/.test(r.here.font) && r.here.size === '8px',
        `YOU / ARE / HERE / ▼ stacked, amber, 8px pixel font (${r.here && JSON.stringify(r.here.text)} ${r.here && r.here.color})`);
      ok(r.here && r.here.above && r.here.centred && r.here.anim.includes('map-here-bounce'), 'the pointer sits above the current node, centred, bouncing');
    }
    // hunt-6 ruling: ~35% of forks hide one label
    const h = await page.evaluate(() => {
      let forks = 0, hidden = 0, both = 0;
      const save = { nodes: STATE.nodes, byId: STATE.byId, currentId: STATE.currentId, trail: STATE.trail, mapName: STATE.mapName, destination: STATE.destination };
      for (let i = 0; i < 300; i++) {
        generateMap(['lunar', 'mars', 'interstellar'][i % 3]);
        for (const f of STATE.nodes.filter(n => n.node_type === 'fork')) {
          forks++;
          const h2 = ['alpha', 'beta'].filter(k => STATE.byId[f.connects_to[k][0]].branch_hidden).length;
          if (h2 === 1) hidden++; if (h2 === 2) both++;
        }
      }
      Object.assign(STATE, save);
      return { forks, hidden, both };
    });
    const share = h.hidden / h.forks;
    ok(h.forks > 100 && share > 0.28 && share < 0.42 && h.both === 0, `about 35% of forks hide one label (${h.hidden}/${h.forks} = ${(share * 100).toFixed(1)}%, never both)`);
    if (SHOTS) {
      await page.evaluate(async () => {
        const fork = STATE.nodes.find(n => n.node_type === 'fork');
        STATE.visited.add(fork.id); STATE.currentId = fork.id;
        document.getElementById('btn-map').click();
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: SHOTS + '/engine_map_fork.png' });
    }
    await page.close();
  }

  // ── 4. Derelict salvage ──────────────────────────────────────
  console.log('— derelict salvage: hulk vs debris routing');
  const toDerelict = async (page, form) => page.evaluate(form => {
    const n = STATE.nodes.find(x => x.node_type !== 'fork' && x.node_type !== 'station' && connectionsOf(x).length);
    n.node_type = 'derelict'; STATE.currentId = n.id; STATE.visited.add(n.id);
    for (let s = 1; s < 500; s++) { STATE.artSeed = s; if (derelictFormOf(n) === form) break; }
    document.body.classList.remove('stop-active'); document.getElementById('stop-btn').textContent = 'Stop'; returnToHub();
    return { form: derelictFormOf(n), region: cruiseRegionKey() };
  }, form);
  {
    const page = await boot();
    const f = await page.evaluate(() => {
      // stable per node + seed; roughly 60/40 over many seeds
      const n = STATE.nodes.find(x => x.node_type !== 'fork'); const t = n.node_type; n.node_type = 'derelict';
      let hulk = 0; for (let s = 1; s <= 2000; s++) { STATE.artSeed = s; if (derelictFormOf(n) === 'hulk') hulk++; }
      STATE.artSeed = 7; const a = derelictFormOf(n), b = derelictFormOf(n);
      n.node_type = t;
      return { hulk, stable: a === b, other: derelictFormOf(n) };
    });
    ok(f.stable && f.other === null && f.hulk > 1050 && f.hulk < 1350, `a derelict stop is a hulk or debris, fixed per stop (${f.hulk}/2000 hulks; non-derelict → null)`);
    const hk = await toDerelict(page, 'hulk');
    await page.waitForTimeout(200);
    const menuH = await page.evaluate(() => ({ label: document.getElementById('stop-region-label').textContent, sal: [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /SALVAGE/.test(b.textContent)) }));
    const subH = await page.evaluate(() => { const b = [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /SALVAGE/.test(b.textContent)); return b && b.textContent; });
    ok(hk.region === 'derelict' && menuH.label === 'DERELICT' && /Board the hulk/.test(subH || ''), `hulk: region DERELICT, SALVAGE boards it ("${(subH || '').replace(/\s+/g, ' ').slice(0, 60)}")`);
    const dz = await toDerelict(page, 'debris');
    await page.waitForTimeout(200);
    const menuD = await page.evaluate(() => ({ label: document.getElementById('stop-region-label').textContent, sub: ([...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /SALVAGE/.test(b.textContent)) || {}).textContent }));
    ok(dz.region === 'debris_field' && menuD.label === 'DEBRIS FIELD' && /wreckage/.test(menuD.sub || ''), 'debris: region DEBRIS FIELD, SALVAGE sweeps the wreckage');
    // debris → the space game
    await page.evaluate(() => [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /SALVAGE/.test(b.textContent)).click());
    await page.waitForTimeout(300);
    const sp = await page.evaluate(() => ({ title: document.getElementById('mtitle').textContent, brief: document.querySelector('#ga .ready-mechanic').textContent }));
    await page.click('#rstart'); await page.waitForTimeout(1400);
    const spRun = await page.evaluate(() => ({ bg: document.getElementById('sal-bg').getAttribute('src'), items: [...document.querySelectorAll('.sal-item,.sal-hazard')].map(i => i.getAttribute('src')), mark: document.getElementById('sal-bay-glow').classList.contains('sal-bay-mark') }));
    ok(sp.title === 'SALVAGE' && /salvage_bg_/.test(spRun.bg) && spRun.items.every(s => /minigames\/salvage\//.test(s)) && !spRun.mark, `debris field keeps space salvage (${spRun.bg.split('/').pop()}, ${spRun.items.length} drifting, all salvage sprites)`);
    await page.evaluate(() => document.getElementById('mclose').click()); await page.waitForTimeout(300);
    await page.close();
  }

  console.log('— derelict salvage: the game, its sprites, its pay');
  {
    const page = await boot();
    const set = await page.evaluate(async () => {
      const D = window.SALVAGE_DERELICT;
      const sprites = D.items.map(i => i.sprite).concat(D.hazards);
      const loads = await Promise.all(sprites.map(src => new Promise(res => { const im = new Image(); im.onload = () => res(im.naturalWidth > 0); im.onerror = () => res(false); im.src = src; })));
      return { n: sprites.length, uniq: new Set(sprites).size, loads: loads.every(Boolean), weights: D.items.every(i => i.wt > 0), cats: [...new Set(D.items.map(i => i.cat))].sort().join(',') };
    });
    ok(set.n === 11 && set.uniq === 11 && set.loads && set.weights, `all 11 derelict sprites are in the spawn set (8 items + 3 hazards, each weighted) and load by their clean names`);
    ok(set.cats === 'component,food,fuel,medkit', `item kinds: ${set.cats}`);
    await toDerelict(page, 'hulk');
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => {
      STATE.resources.fuel = 30; STATE.resources.food = 30; STATE.items = STATE.items.filter(i => i !== 'medkit');
      STATE.materials = {}; window.__snap = null;
      const real = window.passDays; window.passDays = function () { window.__snap = { fuel: STATE.resources.fuel, food: STATE.resources.food, medkits: STATE.items.filter(i => i === 'medkit').length, mats: JSON.stringify(STATE.materials), items: STATE.items.slice() }; window.passDays = real; return real.apply(this, arguments); };
      // uniform odds so one run sees every kind
      window.__wts = SALVAGE_DERELICT.items.map(i => i.wt); SALVAGE_DERELICT.items.forEach(i => { i.wt = i.cat === 'fuel' ? 1 : (i.cat === 'food' ? 1 : 3); });
      [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /SALVAGE/.test(b.textContent)).click();
      return { day: STATE.daysElapsed, items: STATE.items.slice() };
    });
    await page.waitForTimeout(300);
    const br = await page.evaluate(() => ({ title: document.getElementById('mtitle').textContent, brief: document.querySelector('#ga .ready-mechanic').innerText, sit: document.querySelector('#ga .rsi-text').textContent }));
    ok(br.title === 'DERELICT SALVAGE' && /\+5.*\+10.*\+15/.test(br.brief) && /\+5 food/.test(br.brief) && /1 metal \+ 1 exotic/.test(br.brief) && /medkit/.test(br.brief), `briefing: DERELICT SALVAGE, quotes the real payouts`);
    await page.click('#rstart');
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => {
      const g = document.getElementById('sal-bay-glow'), cs = getComputedStyle(g);
      return { bg: document.getElementById('sal-bg').getAttribute('src'), mark: cs.borderTopStyle, op: cs.opacity, asteroids: document.querySelectorAll('.sal-asteroid').length };
    });
    ok(/ship_interior\/derelict\/[12]\.jpg/.test(st.bg) && st.mark === 'dashed' && +st.op === 1 && st.asteroids === 0, `inside the hulk: ${st.bg.split('backgrounds/')[1]}, marked stowage hatch, no asteroid clutter`);
    if (SHOTS) await page.screenshot({ path: SHOTS + '/engine_derelict_salvage.png' });
    // Play: tractor items into the hatch (prefer kinds not yet caught, one hazard).
    const seen = new Set(), caught = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 17000) {
      const tgt = await page.evaluate(caughtCats => {
        const stage = document.getElementById('sal-stage'); if (!stage || document.getElementById('sal-end') && !document.getElementById('sal-end').hidden) return { done: true };
        const sr = stage.getBoundingClientRect();
        const bay = document.getElementById('sal-bay-glow').getBoundingClientRect();
        const els = [...document.querySelectorAll('.sal-item:not(.stowed):not(.held), .sal-hazard:not(.stowed):not(.held)')].map(e => ({ e, r: e.getBoundingClientRect(), src: e.getAttribute('src') }));
        els.forEach(x => window.__seenSrc = (window.__seenSrc || new Set()).add(x.src));
        const vis = els.filter(x => x.r.left > sr.left + 10 && x.r.right < sr.right - 10 && x.r.top > sr.top + 10 && x.r.bottom < bay.top - 10);
        if (!vis.length) return null;
        const cat = src => /fuelcell/.test(src) ? 'fuel' : /foodcan/.test(src) ? 'food' : /component/.test(src) ? 'component' : /medkit/.test(src) ? 'medkit' : 'hazard';
        vis.sort((a, b) => (caughtCats.includes(cat(a.src)) ? 1 : 0) - (caughtCats.includes(cat(b.src)) ? 1 : 0));
        const x = vis[0];
        return { x: (x.r.left + x.r.right) / 2, y: (x.r.top + x.r.bottom) / 2, bx: (bay.left + bay.right) / 2, by: (bay.top + bay.bottom) / 2, src: x.src, cat: cat(x.src) };
      }, [...seen]);
      if (tgt && tgt.done) break;
      if (!tgt) { await page.waitForTimeout(150); continue; }
      await page.mouse.move(tgt.x, tgt.y); await page.mouse.down();
      await page.mouse.move(tgt.bx, tgt.by, { steps: 4 });
      await page.waitForTimeout(80);
      await page.mouse.up();
      await page.waitForTimeout(60);
      seen.add(tgt.cat); caught.push(tgt.cat);
    }
    // End screen (TIME'S UP / ENERGY DEPLETED → haul card)
    await page.waitForFunction(() => { const e = document.getElementById('sal-end'); return e && !e.hidden && document.getElementById('sal-close'); }, null, { timeout: 30000 });
    const haul = await page.evaluate(() => [...document.querySelectorAll('#sal-haul .sal-haul-tile img')].map(i => i.getAttribute('src')));
    // click every tile (reveal path), then CLOSE
    await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      for (const t of document.querySelectorAll('#sal-haul .sal-haul-tile')) { t.click(); await w(30); const f = document.getElementById('sal-flash'); if (f && !f.hidden) f.click(); await w(30); }
    });
    await page.waitForTimeout(300);
    const invTiles = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#sal-inv .sal-inv-tile')].map(t => [t.dataset.key, +t.querySelector('.sal-inv-badge').textContent])));
    const sizeLabels = await page.evaluate(() => [...document.querySelectorAll('#sal-haul .sal-haul-tile')].map(t => [t.querySelector('img').getAttribute('src').split('/').pop(), (t.querySelector('.sal-haul-sz') || {}).textContent || '']));
    await page.evaluate(() => document.getElementById('sal-close').click());
    await page.waitForTimeout(300);
    await page.evaluate(() => { const b = document.getElementById('rbquit'); if (b && document.getElementById('result').classList.contains('show')) b.click(); });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => { SALVAGE_DERELICT.items.forEach((i, k) => { i.wt = window.__wts[k]; }); return { snap: window.__snap, log: (STATE.shipLog || []).map(e => typeof e === 'string' ? e : e.text).filter(t => /SALVAGE/.test(t)).slice(-1)[0] || '', seen: [...(window.__seenSrc || [])] }; });
    // expected from the haul card's sprites and the published pay table
    const pay = { fuel: { s: 5, m: 10, l: 15 }, food: 5 };
    const exp = { fuel: 0, food: 0, metal: 0, exotic: 0, medkit: 0, useless_scrap: 0 };
    for (const s of haul) {
      const m = s.match(/fuelcell_([sml])/);
      if (m) exp.fuel += pay.fuel[m[1]];
      else if (/foodcan/.test(s)) exp.food += pay.food;
      else if (/component/.test(s)) { exp.metal++; exp.exotic++; }
      else if (/medkit/.test(s)) exp.medkit++;
      else if (/hazard/.test(s)) exp.useless_scrap++;
    }
    const kinds = Object.keys(exp).filter(k => exp[k] > 0);
    ok(haul.length >= 4, `played a real run: ${haul.length} items stowed (${kinds.join(', ')})`);
    ok(Object.keys(exp).every(k => (invTiles[k] || 0) === exp[k]), `haul card inventory = the items' stated pay (${JSON.stringify(invTiles)})`);
    ok(sizeLabels.every(([f, l]) => /fuelcell_([sml])/.test(f) ? l === f.match(/fuelcell_([sml])/)[1].toUpperCase() : /hazard/.test(f) ? l === '?' : l === ''), `fuel cells carry their size tag, hazards the salvage "?", cans/component/medkit none (${sizeLabels.map(x => x[1] || '-').join('')})`);
    const sn = after.snap;
    const medGot = sn ? sn.medkits : -1, mats = sn ? JSON.parse(sn.mats) : {};
    ok(sn && sn.fuel - 30 === exp.fuel && sn.food - 30 === exp.food && (mats.metal || 0) === exp.metal && (mats.exotic || 0) === exp.exotic && medGot === exp.medkit && !mats.useless_scrap,
      `granted exactly that: +${sn && sn.fuel - 30} fuel, +${sn && sn.food - 30} food, ${mats.metal || 0} metal, ${mats.exotic || 0} exotic, ${medGot} medkit(s); hazards nothing`);
    const extra = sn ? sn.items.filter(i => i !== 'medkit' && !before.items.includes(i)) : [];
    ok(extra.every(i => ['pre_collapse_artifact', 'corporate_memorabilia', 'unidentified_bone'].includes(i)) && extra.length <= 1 && (!extra.length || after.log.includes(extra[0].replace(/_/g, ' '))), `nothing else lands except the logged wreck curio roll (${extra.join(', ') || 'none this run'})`);
    ok(/SALVAGE — recovered/.test(after.log), `log: ${after.log.slice(0, 110)}`);
    const seenD = after.seen.filter(s => /minigames\/derelict\//.test(s));
    ok(seenD.length === after.seen.length && seenD.length >= 3, `every drifting sprite came from the derelict set (${seenD.length} distinct seen)`);
    await page.close();
  }

  console.log('— derelict salvage: cruise grants the payload exactly; quitting keeps nothing');
  {
    const page = await boot();
    await toDerelict(page, 'hulk');
    await page.waitForTimeout(200);
    const g = await page.evaluate(async () => {
      STATE.resources.fuel = 40; STATE.resources.food = 40; STATE.materials = {}; STATE.items = STATE.items.filter(i => i !== 'medkit');
      const real = window.openMinigame, realRand = Math.random, realPass = window.passDays;
      let opts = null, snap = null;
      window.openMinigame = (id, o, done) => { opts = o; done('good', { salvage: { fuel: 25, food: 15, metal: 2, exotic: 2, medkit: 2, useless_scrap: 3 } }); };
      window.passDays = function () { snap = { fuel: STATE.resources.fuel, food: STATE.resources.food, mats: Object.assign({}, STATE.materials), med: STATE.items.filter(i => i === 'medkit').length }; window.passDays = realPass; return realPass.apply(this, arguments); };
      Math.random = () => 0.99; // no curio
      try { [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /SALVAGE/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 200)); }
      finally { window.openMinigame = real; Math.random = realRand; }
      return { opts, snap };
    });
    ok(g.opts && g.opts.setting === 'derelict', 'the hulk asks for the derelict game (setting: derelict)');
    ok(g.snap && g.snap.fuel === 65 && g.snap.food === 55 && g.snap.mats.metal === 2 && g.snap.mats.exotic === 2 && g.snap.med === 2 && !g.snap.mats.useless_scrap,
      `payload granted exactly: fuel 40→${g.snap && g.snap.fuel}, food 40→${g.snap && g.snap.food}, metal ${g.snap && g.snap.mats.metal}, exotic ${g.snap && g.snap.mats.exotic}, medkits ${g.snap && g.snap.med}`);
    // quit mid-game: day spent, nothing kept
    const q0 = await page.evaluate(() => { document.body.classList.remove('stop-active'); document.getElementById('stop-btn').textContent = 'Stop'; returnToHub(); return null; });
    await page.waitForTimeout(200);
    const a = await page.evaluate(() => ({ day: STATE.daysElapsed, mats: JSON.stringify(STATE.materials), items: STATE.items.length, fuel: STATE.resources.fuel }));
    await page.evaluate(() => [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /SALVAGE/.test(b.textContent)).click());
    await page.waitForTimeout(300);
    await page.click('#rstart'); await page.waitForTimeout(2500);
    await page.click('#mclose'); await page.waitForTimeout(400);
    const b = await page.evaluate(() => ({ day: STATE.daysElapsed, mats: JSON.stringify(STATE.materials), items: STATE.items.length, fuel: STATE.resources.fuel, ov: document.getElementById('overlay-minigames').classList.contains('active'),
      log: (STATE.shipLog || []).map(e => typeof e === 'string' ? e : e.text).slice(-1)[0] || '' }));
    ok(!b.ov && b.day > a.day && b.mats === a.mats && b.items === a.items && b.fuel <= a.fuel && /abandoned/i.test(b.log), `quit inside the hulk: day spent (${a.day}→${b.day}), nothing kept`);
    await page.close();
  }

  ok(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(`\nparity_finish: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
