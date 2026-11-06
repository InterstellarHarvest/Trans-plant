// Render sweep (2026-11-05): every event, every layer and every outcome a
// choice leads to, drawn on the 960×640 stage. Per screen:
//   TOKEN    unresolved text ({…}, undefined, NaN, [object …]) in what the
//            player reads: title, body, the NPC's line, choice rows and
//            their tooltips, the AI bar
//   SUBCLIP  a choice sub-label cut short with "…" (authored sub, or the
//            engine's composed preview / hands line — reported apart)
//   SUBWRAP  a sub-label on more than one line
//   SUBLOST  an authored sub-label cut short and missing from the tooltip
//   NARRMORE the story panel needs scrolling ("▾ MORE")
//   OVERLAP  the story panel sits under a choice row
//   COLCLIP  the choice column still needs a scroll after fitting
//   TITLE2   a title on three lines or more
//   ART      an image that failed to load (any 4xx/5xx or a broken <img>)
//   ERROR    a page error
// Markets and fights are opened elsewhere (test_pool500); here their rows
// are drawn, not taken. Workers: SWEEP_WORKERS (4). IDS=a,b narrows.
// OUT=<file.json> writes every finding. ENDS=0 skips the end screens; CANARY=1 plants
// a token, a long sub and a missing backdrop in the first event (the sweep must report them).
// Run: serve the repo, then URL=http://localhost:<port>/index.html node tools/render_sweep.js
// (PW_BROWSER=firefox for Firefox; ~20 min per browser, so it is not in run_all.sh).
const { chromium, firefox } = require('playwright');
const fs = require('fs'), path = require('path');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const ROOT = path.join(__dirname, '..');
const W = +(process.env.SWEEP_WORKERS || 4);
const ALL = fs.readdirSync(path.join(ROOT, 'modules/events')).flatMap(f => {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'modules/events', f)));
  return (Array.isArray(d) ? d : d.events).filter(e => e && e.id && e.active !== false).map(e => e.id);
});
const IDS = process.env.IDS ? process.env.IDS.split(',').map(s => s.startsWith('event_') ? s : 'event_' + s) : ALL;
const findings = [];
let screens = 0;

async function worker(browser, ids, wi) {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  let where = '';
  page.on('pageerror', e => findings.push({ kind: 'ERROR', where, text: e.message }));
  // The scene art probes for variants (scene_art.js probeImage: a 404 ends
  // the probe), so a failed request is only missing art when something on
  // screen is drawing that URL.
  const failed = new Set();
  const norm = u => decodeURIComponent(u).replace(/^.*?\/sprites\//, 'sprites/').replace(/^.*?\/resources\/sprites\//, 'sprites/');
  // Variant probes end on a 404 by design: numbered files (deep/5.png),
  // numbered folders' spritesheets, extension fallbacks (deep.jpg → deep/).
  // Any other failed image means the engine fell back from art it wanted.
  const PROBE = /\/\d+\.(png|jpe?g)$|\/spritesheet\.(png|json)$|\/bg\d+\.(png|jpe?g)$/i;
  let screenFails = [];
  const onFail = u => { u = norm(u); failed.add(u); if (!PROBE.test(u)) screenFails.push(u); };
  // …and probes try name.jpg, name.png and the name/ folder: a miss counts
  // only when no form of that path ever loaded.
  const loaded = new Set();
  page.on('response', r => { if (!/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(r.url())) return; if (r.status() >= 400) onFail(r.url()); else loaded.add(norm(r.url())); });
  const stem = u => u.replace(/\.(png|jpe?g|gif|webp|svg)$/i, '');
  const anyLoaded = u => { const b = stem(u); for (const l of loaded) if (l === u || stem(l) === b || l.startsWith(b + '/')) return true; return false; };
  page.on('requestfailed', r => { if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(r.url())) onFail(r.url()); });
  const boot = async () => {
    // A reload now and then stalls under several workers: try it again.
    for (let tries = 3; ; tries--) {
      try {
        await page.goto(URL);
        await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.map_rules && typeof enterEvent === 'function', null, { timeout: 30000 });
        break;
      } catch (e) { if (tries <= 1) throw e; }
    }
    // CANARY=1: plant one of each fault in the first event, to prove the
    // sweep sees them (a token, a long authored sub, a missing backdrop).
    if (process.env.CANARY) await page.evaluate(id => {
      const ev = EVENTS[id], chs = ev.layers ? ev.layers[ev.entryLayer || Object.keys(ev.layers)[0]].choices : ev.choices;
      if (ev.layers) ev.layers[ev.entryLayer || Object.keys(ev.layers)[0]].body += ' {canary.token}'; else ev.body += ' {canary.token}';
      chs[0].sub = 'A sub-label far too long to sit on one line of the column';
      const o = typeof chs[0].outcome === 'string' ? ev.outcomes[chs[0].outcome] : chs[0].outcome; if (o) o.scene_bg = 'planet/canary_missing.jpg';
    }, ids[0]);
    await page.evaluate(() => {
      window.__s = {
        // Meet a screen's gates so its rows draw open, as play would.
        setup(ev, chs, flagChs) {
          flagChs = flagChs || chs;
          localStorage.removeItem('transplant_save_v1');
          const role = c => c && (c.requires_crew || (c.gate && c.gate.crew));
          const crew = [...new Set([...chs.map(role), ...[].concat(ev.requires_role || []), ...[].concat(ev.crew_speaker || []), 'engineer', 'medic', 'diplomat'].filter(r => r && r !== 'any'))].slice(0, CREW_MAX);
          const trail = ev.trail ? ev.trail[0] : 'mars';
          applySetupToState({ trail, ai: [].concat(ev.requires_ai || 'aria')[0], captain: [].concat(ev.captain_background || 'veteran')[0], crew, crop: [].concat(ev.crop_type || 'wheat')[0], ship: 'Sweep' });
          STATE.stowaway = null;
          STATE.flags.add('departed');
          STATE.goldAmount = 300;
          for (const k of ['fuel', 'food', 'water', 'o2', 'hull']) STATE.resources[k] = 80;
          if (STATE.cropGrowth) { STATE.cropGrowth.health = 80; STATE.cropGrowth.growth = 60; }
          const sp = eventSpecies(ev); if (sp && sp !== 'human') STATE.voyageSpecies = sp;
          for (const c of chs) {
            const item = c && (c.requires_item || (c.gate && c.gate.item));
            if (item && !STATE.items.includes(item)) grantItem(item);
          }
          for (const c of flagChs) if (c && c.requires_flag) STATE.flags.add(c.requires_flag);
          if (ev.requires_flag) STATE.flags.add(ev.requires_flag);
          if (ev.requires_item && !STATE.items.includes(ev.requires_item)) grantItem(ev.requires_item);
          const types = ev.node_type || ['any'];
          const node = STATE.nodes.find(n => types.includes(n.node_type)) || STATE.nodes.find(n => n.node_type === 'planet') || STATE.byId[STATE.currentId];
          if (!types.includes('any') && node.node_type !== types[0] && !types.includes(node.node_type)) node.node_type = types[0];
          STATE.currentId = node.id;
          window.passDays = d => { STATE.daysElapsed += Math.max(0, Math.round(d)); };
          window.openMinigame = (id, o, cb) => setTimeout(() => cb('good', {}), 10);
          return node;
        },
        paths(ev) {
          const entry = ev.entryLayer || Object.keys(ev.layers)[0];
          const P = { [entry]: [entry] }, q = [entry];
          while (q.length) { const k = q.shift(); (ev.layers[k].choices || []).forEach(c => { if (c.next && ev.layers[c.next] && !(c.next in P)) { P[c.next] = P[k].concat([c.next]); q.push(c.next); } }); }
          return P;
        },
        // What the player sees now, measured.
        measure() {
          const out = [];
          const scr = document.getElementById('screen-encounter');
          if (!scr || !scr.classList.contains('active')) return { out: [{ kind: 'NOSCREEN', text: 'encounter screen not shown (' + ((document.querySelector('.screen.active') || {}).id) + ')' }], urls: [] };
          const BAD = /\{[A-Za-z_.]{1,40}\}|\bundefined\b|\bNaN\b|\[object \w+\]/;
          const texts = [];
          for (const id of ['enc-narr-body', 'enc-dialog-line', 'enc-subject-name', 'enc-ai-text', 'enc-meta']) { const el = document.getElementById(id); if (el) texts.push([id, el.textContent]); }
          const title = document.querySelector('#enc-narrative .enc-narr-title'); if (title) texts.push(['title', title.textContent]);
          for (const b of document.querySelectorAll('#enc-choices .enc-choice')) {
            texts.push(['choice', b.textContent]);
            for (const a of ['title', 'data-tip-description', 'data-tip-title', 'data-tip']) if (b.getAttribute(a)) texts.push(['tooltip', b.getAttribute(a)]);
          }
          for (const [k, t] of texts) { const m = (t || '').match(BAD); if (m) out.push({ kind: 'TOKEN', text: `${k}: …${t.slice(Math.max(0, m.index - 40), m.index + 50)}…` }); }
          // Sub-labels.
          const shown = STATE._shownChoices || [];
          const rows = [...document.querySelectorAll('#enc-choices .enc-choice')];
          for (const b of rows) {
            const st = b.querySelector('.ch-sub-text'), sub = b.querySelector('.ch-sub');
            if (st && st.scrollWidth > st.clientWidth + 1) {
              const txt = b.querySelector('.ch-text').textContent;
              const ch = (currentLayer() ? currentLayer().choices : (STATE.currentEvent.choices || [])).find(c => c && pricedText(interpolateStowawayTokens(c.text || c.label || ''), c) === txt);
              const authored = ch && ch.sub && st.textContent.includes(pricedText(interpolateStowawayTokens(ch.sub), ch).slice(0, 12));
              out.push({ kind: authored ? 'SUBCLIP' : 'SUBCLIP_COMPOSED', text: `"${txt}" — ${st.textContent}` + (b.classList.contains('has-gate') ? ' [gated]' : '') });
              // Cut short is allowed; lost is not: the tooltip must hold it.
              const tip = [b.getAttribute('title'), b.getAttribute('data-tip-description'), b.getAttribute('data-tip')].filter(Boolean).join(' ');
              if (authored && !tip.includes(pricedText(interpolateStowawayTokens(ch.sub), ch))) out.push({ kind: 'SUBLOST', text: `"${txt}" — "${ch.sub}" not in the tooltip (${tip.slice(0, 120)})` });
            }
            if (sub && sub.getClientRects().length && sub.getBoundingClientRect().height > 22) out.push({ kind: 'SUBWRAP', text: `${b.querySelector('.ch-text').textContent}: ${sub.textContent} (${Math.round(sub.getBoundingClientRect().height)}px)` });
          }
          const narr = document.getElementById('enc-narrative'), col = document.getElementById('enc-choices'), body = document.getElementById('enc-narr-body');
          if (narr && narr.classList.contains('has-more')) out.push({ kind: 'NARRMORE', text: `body ${body.scrollHeight}px in ${body.clientHeight}px` });
          if (narr) {
            const nr = narr.getBoundingClientRect();
            for (const b of rows) { const r = b.getBoundingClientRect(); if (r.height && r.bottom > nr.top + 2 && r.top < nr.bottom && r.left < nr.right && r.right > nr.left) { out.push({ kind: 'OVERLAP', text: `row "${b.querySelector('.ch-text') ? b.querySelector('.ch-text').textContent : b.textContent}" bottom ${Math.round(r.bottom)} under panel top ${Math.round(nr.top)}` }); break; } }
            if (nr.bottom > 641 || nr.top < 0) out.push({ kind: 'OVERLAP', text: `story panel off the stage (${Math.round(nr.top)}–${Math.round(nr.bottom)})` });
          }
          if (col && col.scrollHeight > col.clientHeight + 2) out.push({ kind: 'COLCLIP', text: `${rows.length} rows, ${col.scrollHeight}px in ${col.clientHeight}px` });
          if (title) { const lh = parseFloat(getComputedStyle(title).lineHeight) || 18; if (title.getBoundingClientRect().height > lh * 2.5) out.push({ kind: 'TITLE2', text: title.textContent }); }
          for (const im of document.querySelectorAll('#screen-encounter img')) if (im.offsetParent && im.complete && !im.naturalWidth && im.getAttribute('src')) out.push({ kind: 'ART', text: 'broken <img> ' + im.getAttribute('src') });
          // Every image the screen is drawing (checked against failed loads).
          const urls = new Set();
          for (const el of scr.querySelectorAll('*')) {
            if (!el.getClientRects().length) continue;
            const bg = getComputedStyle(el).backgroundImage;
            if (bg && bg !== 'none') for (const m of bg.matchAll(/url\("?([^")]+)"?\)/g)) urls.add(m[1]);
            if (el.tagName === 'IMG' && el.src) urls.add(el.src);
          }
          return { out, urls: [...urls] };
        },
      };
    });
  };
  const settle = () => page.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); await w(120); finishAllTyping(); await w(150); if (typeof fitEncounterColumns === 'function') fitEncounterColumns(); await w(60); });

  for (const id of ids) {
    await boot();
    const plan = await page.evaluate(id => {
      const ev = EVENTS[id];
      const screensOf = [];
      if (ev.layers) {
        const P = __s.paths(ev);
        for (const [k, stack] of Object.entries(P)) {
          // Rows gated on different flags are a quest's routes (one per
          // run): the layer is drawn once per route, as play shows it.
          const routes = [...new Set((ev.layers[k].choices || []).map(c => c.requires_flag).filter(Boolean))];
          if (routes.length > 1) for (const f of routes) screensOf.push({ stack, i: null, route: f }); else screensOf.push({ stack, i: null });
          (ev.layers[k].choices || []).forEach((c, i) => { if (!c.next && !c.back && !c.triggerCombat && !c.open_market && !c.market_vendor && !c.triggerRamResolve) screensOf.push({ stack, i }); });
        }
        // Layers the station visit opens itself (wave-off, docked): drawn directly.
        const entry = ev.entryLayer || Object.keys(ev.layers)[0];
        for (const k of Object.keys(ev.layers)) if (!(k in P)) { screensOf.push({ stack: [entry, k], i: null, direct: true }); if (!ev.station_approach && ev.id !== 'event_station_013') screensOf.push({ unreached: k }); }
      } else {
        const routes = [...new Set((ev.choices || []).map(c => c.requires_flag).filter(Boolean))];
        if (routes.length > 1) for (const f of routes) screensOf.push({ stack: null, i: null, route: f }); else screensOf.push({ stack: null, i: null });
        (ev.choices || []).forEach((c, i) => { if (!c.triggerCombat && !c.open_market) screensOf.push({ stack: null, i }); });
      }
      return screensOf;
    }, id);
    for (const s of plan) {
      if (s.unreached) { findings.push({ kind: 'UNREACHED_LAYER', where: id, text: s.unreached }); continue; }
      where = id + (s.stack ? '/' + s.stack[s.stack.length - 1] : '') + (s.i != null ? ' #' + s.i : '') + (s.route ? ' [' + s.route + ']' : '');
      screenFails = [];
      const err = await page.evaluate(async ({ id, s }) => {
        const ev = EVENTS[id];
        const layerChs = s.stack ? (ev.layers[s.stack[s.stack.length - 1]].choices || []) : (ev.choices || []);
        const vias = s.stack ? s.stack.slice(1).map((k, j) => (ev.layers[s.stack[j]].choices || []).find(c => c.next === k)) : [];
        // Flags: the route drawn, or the row taken (and the way there).
        const flagChs = s.route ? layerChs.filter(c => c.requires_flag === s.route).concat(vias) : s.i != null ? [layerChs[s.i], ...vias] : [...layerChs, ...vias];
        const node = __s.setup(ev, [...layerChs, ...vias], flagChs);
        enterEvent(node, ev, s.stack ? { layerStack: s.stack } : undefined);
        return null;
      }, { id, s });
      await settle();
      if (s.i != null) {
        const r = await page.evaluate(async ({ id, s }) => {
          const ev = EVENTS[id];
          const ch = (s.stack ? ev.layers[s.stack[s.stack.length - 1]].choices : ev.choices)[s.i];
          if (!choiceShown(ch)) return 'hidden';
          if (lockReason(ch)) return 'locked: ' + lockReason(ch);
          const i = [...document.querySelectorAll('#enc-choices .enc-choice:not(.leave):not(.advance):not(.locked)')];
          const b = i[(STATE._shownChoices || []).indexOf(ch)];
          if (!b) return 'no button';
          b.click();
          await new Promise(r => setTimeout(r, 450));
          return null;
        }, { id, s });
        if (r) { if (!/^hidden|^locked/.test(r)) findings.push({ kind: 'NOROW', where, text: r }); continue; }
        await settle();
      }
      await page.waitForTimeout(150); // let the backdrop's images land
      const m = await page.evaluate(() => __s.measure());
      for (const f of m.out) findings.push(Object.assign({ where }, f));
      for (const u of m.urls) if (failed.has(norm(u))) findings.push({ kind: 'ART', where, text: 'shown but missing: ' + norm(u) });
      for (const u of new Set(screenFails)) if (!anyLoaded(u)) findings.push({ kind: 'ART_FALLBACK', where, text: 'wanted, missing: ' + u });
      screens++;
    }
    process.stdout.write(`\r  worker ${wi}: ${ids.indexOf(id) + 1}/${ids.length}   `);
  }
  await page.close();
}

// The end screens: every ending under each crop state (thriving / sick /
// dead) and crew state (full / partial / solo), and every failure (with
// passengers aboard where it has text for them): the cinematic and the
// report. ENDS=0 skips.
async function endScreens(browser) {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  let where = '';
  const failed = new Set();
  const norm = u => decodeURIComponent(u).replace(/^.*?\/sprites\//, 'sprites/');
  page.on('pageerror', e => findings.push({ kind: 'ERROR', where, text: e.message }));
  page.on('response', r => { if (r.status() >= 400 && /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(r.url())) failed.add(norm(r.url())); });
  const cases = [];
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.endings && typeof renderEndScreen === 'function');
  const ids = await page.evaluate(() => ({ endings: MOD.endings.filter(e => e.id && e.active !== false).map(e => e.id), failures: MOD.failures.filter(f => f.id && f.active !== false).map(f => f.id) }));
  for (const id of ids.endings) for (const crop of ['thriving', 'sick', 'dead']) for (const crew of ['full', 'partial', 'solo']) cases.push({ id, crop, crew, kind: 'ending' });
  for (const id of ids.failures) for (const pax of [false, true]) cases.push({ id, pax, kind: 'failure' });
  for (const c of cases) {
    where = c.id + (c.kind === 'ending' ? ` crop ${c.crop} crew ${c.crew}` : c.pax ? ' (passengers)' : '');
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.endings && typeof renderEndScreen === 'function');
    const r = await page.evaluate(async c => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      localStorage.removeItem('transplant_save_v1'); localStorage.removeItem('transplant_records_v1');
      applySetupToState({ trail: 'mars', ai: 'chip', captain: 'veteran', crew: c.crew === 'solo' ? [] : ['engineer', 'medic'], crop: 'zinnia', ship: 'Sweep' });
      STATE.stowaway = null; STATE.flags.add('departed');
      for (const k of ['fuel', 'food', 'water', 'o2', 'hull']) STATE.resources[k] = 60;
      STATE.daysElapsed = Math.round(STATE.baseDays * 0.8);
      if (c.crew === 'partial') killCrew('medic');
      if (c.kind === 'ending') {
        STATE.cropGrowth.health = c.crop === 'thriving' ? 95 : c.crop === 'sick' ? 20 : 0; STATE.cropGrowth.growth = 80;
        endRun({ kind: 'ending', module: MOD.endings.find(e => e.id === c.id) });
      } else {
        if (c.pax) STATE.passengers = [{ name: 'Ines Okafor', role: 'passenger' }];
        endRun({ kind: 'failure', module: MOD.failures.find(f => f.id === c.id) });
      }
      await w(1500);
      const BAD = /\{[A-Za-z_.]{1,40}\}|\bundefined\b|\bNaN\b|\[object \w+\]/;
      const out = [];
      const scan = (k, t) => { const m = (t || '').match(BAD); if (m) out.push({ kind: 'TOKEN', text: `${k}: …${t.slice(Math.max(0, m.index - 40), m.index + 50)}…` }); };
      scan('cinematic', (document.getElementById('end-cinematic') || {}).innerText);
      const cine = document.getElementById('end-cine-group');
      if (cine) { const r = cine.getBoundingClientRect(); if (r.top < -1 || r.bottom > 641) out.push({ kind: 'OVERLAP', text: `cinematic text off the stage (${Math.round(r.top)}–${Math.round(r.bottom)})` }); }
      showEndReport(); await w(900);
      const more = document.getElementById('end-report-more'); if (more && more.offsetParent) { more.click(); await w(500); }
      scan('report', (document.getElementById('end-report') || {}).innerText);
      for (const id of ['end-report-card', 'end-report-scroll']) { const el = document.getElementById(id); if (el && el.offsetParent) { const r = el.getBoundingClientRect(); if (r.bottom > 641 || r.top < -1) out.push({ kind: 'OVERLAP', text: `${id} off the stage (${Math.round(r.top)}–${Math.round(r.bottom)})` }); } }
      const urls = new Set();
      for (const el of document.querySelectorAll('#screen-end *')) { if (!el.getClientRects().length) continue; const bg = getComputedStyle(el).backgroundImage; if (bg && bg !== 'none') for (const m of bg.matchAll(/url\("?([^")]+)"?\)/g)) urls.add(m[1]); if (el.tagName === 'IMG' && el.src) urls.add(el.src); }
      return { out, urls: [...urls], screen: (document.querySelector('.screen.active') || {}).id };
    }, c);
    if (r.screen !== 'screen-end') findings.push({ kind: 'NOSCREEN', where, text: r.screen });
    for (const f of r.out) findings.push(Object.assign({ where }, f));
    for (const u of r.urls) if (failed.has(norm(u))) findings.push({ kind: 'ART', where, text: 'shown but missing: ' + norm(u) });
    screens++;
  }
  await page.close();
}

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const shards = Array.from({ length: W }, (_, i) => IDS.filter((_, j) => j % W === i));
  await Promise.all([...shards.map((ids, i) => worker(browser, ids, i)), process.env.ENDS === '0' ? null : endScreens(browser)]);
  await browser.close();
  console.log('\n');
  const by = {};
  for (const f of findings) (by[f.kind] = by[f.kind] || []).push(f);
  console.log(`render sweep (${process.env.PW_BROWSER || 'chromium'}, 960×640): ${IDS.length} events, ${screens} screens`);
  for (const [k, list] of Object.entries(by).sort()) {
    console.log(`  ${k}: ${list.length}`);
    for (const f of list.slice(0, +(process.env.SHOW || 6))) console.log(`    ${f.where} — ${f.text.replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ screens, findings }, null, 1));
  const hard = findings.filter(f => ['TOKEN', 'ART', 'ART_FALLBACK', 'ERROR', 'SUBWRAP', 'SUBLOST', 'OVERLAP', 'COLCLIP', 'NOROW', 'NOSCREEN', 'UNREACHED_LAYER'].includes(f.kind)).length;
  console.log(`\nrender sweep: ${screens - hard} passed, ${hard} failed`);
  process.exit(hard ? 1 : 0);
})();
