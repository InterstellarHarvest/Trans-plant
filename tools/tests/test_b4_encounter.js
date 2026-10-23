// Batch 4 (final re-audit fixes) — encounter + NPC + combat
// (resources/REAUDIT_ENCOUNTER_COMBAT.md A1–A4, B1–B12; PARITY_AUDIT Tier C
// rulings 33–37, 39, 40, 43, 47b). Asserts real engine state, computed
// styles and geometry (stage px = rect / scale), never class names alone.
// SHOT_DIR=<dir> saves engine screenshots for the demo side-by-sides.
const { chromium } = require('playwright');
const path = require('path');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const SHOT_DIR = process.env.SHOT_DIR || null;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];

async function boot(setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { timeout: 90000 });
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor, null, { timeout: 60000 });
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    tpSaveSettings({ textSpeed: 'normal' });
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'diplomat'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForFunction(() => STATE.nodes && STATE.nodes.length > 2);
  return page;
}
// Enter an event at a node of the given type (fallback: any node — random
// maps lack types); `species` pins the NPC's face via npcCache.
const enter = (page, id, o) => page.evaluate(({ id, o }) => {
  const want = (o && o.nodeType) || 'void';
  const node = STATE.nodes.find(n => n.node_type === want) || STATE.nodes[2] || STATE.nodes[1];
  if (o && o.name) node.name = o.name;
  STATE.currentId = node.id;
  const ev = EVENTS[id];
  if (o && o.species && ev.npc) {
    STATE.npcCache[ev.id + '@' + node.id] = { species: o.species, disposition: ev.npc.disposition, job: ev.npc.job || null,
      displayName: (ev.npc.disposition || '').toUpperCase(), quirk: '' };
  }
  enterEvent(node, ev, o && o.layer ? { layerStack: [o.layer] } : undefined);
  return node.node_type;
}, { id, o });
const snap = page => page.evaluate(() => finishAllTyping());
const landed = page => page.waitForFunction(() => !document.querySelector('#enc-choices.held, #enc-choices .enc-choice.entering, .enc-tw-cursor'), null, { timeout: 30000 });
const clickText = (page, t) => page.evaluate(t => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.textContent.includes(t)); if (!b) return false; b.click(); return true; }, t);
// Stage-px rect of an element (the 960×640 stage may be CSS-scaled).
const stageRect = (page, sel) => page.evaluate(sel => {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  const g = document.getElementById('screen-encounter').getBoundingClientRect(), s = g.width / 960;
  const r = el.getBoundingClientRect();
  return { l: (r.left - g.left) / s, t: (r.top - g.top) / s, w: r.width / s, h: r.height / s, b: (r.bottom - g.top) / s, r: (r.right - g.left) / s };
}, sel);
async function shot(page, name) {
  if (!SHOT_DIR) return;
  await page.waitForTimeout(500);
  const g = await page.$('#game');
  await (g || page).screenshot({ path: path.join(SHOT_DIR, name + '.png') }).catch(() => {});
}
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1 : tol);

(async () => {
  browser = await chromium.launch();

  console.log('— A1 market geometry (demo-encounter :889-916, 160px portrait)');
  {
    const page = await boot();
    await enter(page, 'event_encounter_trader_001', { nodeType: 'void', species: 'robot' });
    await snap(page);
    await landed(page);
    ok(await clickText(page, 'BROWSE THE WARES'), 'BROWSE THE WARES opens the market');
    await page.waitForFunction(() => { const o = document.getElementById('overlay-market'); return o && getComputedStyle(o).visibility !== 'hidden' && document.querySelector('#overlay-market .enc-market'); });
    await page.waitForTimeout(400);
    const vars = await page.evaluate(() => { const cs = getComputedStyle(document.getElementById('overlay-market')); return [cs.getPropertyValue('--subj-size').trim(), cs.getPropertyValue('--subj-top').trim()]; });
    ok(vars[0] === '160px' && vars[1] === '60px', `#overlay-market --subj-size/--subj-top = ${vars.join(' / ')} (was 240px / 100px)`);
    await page.waitForFunction(() => { const o = document.getElementById('overlay-market'); return getComputedStyle(o).opacity === '1'; }, null, { timeout: 5000 }).catch(() => {});
    const m = await stageRect(page, '#overlay-market .enc-market');
    const mcs = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('#overlay-market .enc-market')); return [cs.left, cs.top]; });
    ok(mcs[0] === '212px' && mcs[1] === '60px' && near(m.l, 212, 2) && near(m.t, 60, 2), `modal starts past the portrait column: left ${mcs[0]} (40+160+12), top ${mcs[1]} (rect ${m.l.toFixed(1)},${m.t.toFixed(1)})`);
    const log = await stageRect(page, '#market-log');
    ok(near(log.l, 40) && near(log.t, 256) && near(log.w, 160), `log column under the portrait: left ${Math.round(log.l)}, top ${Math.round(log.t)}, width ${Math.round(log.w)} (demo 40 / 256 / 160)`);
    const subj = await stageRect(page, '#enc-subject');
    ok(near(subj.l, 40) && near(subj.t, 60), `portrait at 40,60 under the market (${Math.round(subj.l)},${Math.round(subj.t)})`);
    const cut = await page.evaluate(() => [...document.querySelectorAll('#overlay-market .market-row-name')].filter(n => n.offsetWidth && n.scrollWidth > n.clientWidth + 1).map(n => n.textContent));
    ok(!cut.length, 'no ware / cargo name is cut short (' + (cut.join(', ') || 'none') + ')');
    await shot(page, 'b4_market');
    await page.close();
  }

  console.log('— A2 + ruling 35: location label in the title row, display names, portrait at top 60');
  {
    const page = await boot();
    const type = await enter(page, 'event_encounter_pirate_001', { nodeType: 'asteroid_field', name: "Kepler's Rest", species: 'rock' });
    await snap(page);
    await landed(page);
    const r = await page.evaluate(() => {
      const meta = document.getElementById('enc-meta');
      return { text: meta.textContent, kind: (meta.querySelector('.kind') || {}).textContent || '', inHead: !!meta.closest('.enc-narr-head') && !!meta.closest('#enc-narrative'),
        titleRow: meta.parentNode.querySelector('#enc-narr-title') !== null,
        labels: ['station', 'planet', 'asteroid_field', 'derelict', 'nebula', 'void', 'anomaly', 'fork', 'mystery_zone'].map(nodeTypeLabel) };
    });
    ok(r.inHead && r.titleRow, 'the label sits in the narrative title row, beside the title');
    ok(/Kepler's Rest/.test(r.text) && (type !== 'asteroid_field' || r.kind === 'ASTEROID FIELD'), `label reads "${r.text}" (kind "${r.kind}")`);
    ok(r.labels.every(l => !/_/.test(l)) && r.labels.includes('ASTEROID FIELD') && r.labels.includes('MYSTERY ZONE'), 'node types use display names, never raw ids: ' + r.labels.join(', '));
    const subj = await stageRect(page, '#enc-subject');
    const bar = await stageRect(page, '#enc-ai-bar');
    ok(near(subj.t, 60) && bar.b <= 60, `portrait back at top 60 (DESIGN_SYSTEM:534) under a one-line AI bar (frame ${Math.round(subj.t)}, bar bottom ${Math.round(bar.b)})`);
    const ch = await stageRect(page, '#enc-choices');
    ok(near(ch.t, 60), 'choice column at top 60 (' + Math.round(ch.t) + ')');
    // A name that already says its type isn't doubled.
    await page.evaluate(() => { const n = STATE.byId[STATE.currentId]; n.name = 'Asteroid Field 3'; n.node_type = 'asteroid_field'; paintEncMeta(n); });
    ok(await page.evaluate(() => document.getElementById('enc-meta').textContent === 'Asteroid Field 3'), 'a generated name ("Asteroid Field 3") is not followed by ASTEROID FIELD again');
    // A long AI line wraps the bar: portrait + choices start under it.
    const long = await page.evaluate(() => {
      const ev = STATE.currentEvent; const L = ev.layers.intro;
      L.ai = Object.assign({}, L.ai, { marv: 'A '.repeat(170) + 'very long line that wraps the bar three times over so it would run into the portrait.' });
      renderEncounterState(); finishAllTyping();
      return true;
    });
    await page.waitForTimeout(100);
    const s2 = await stageRect(page, '#enc-subject'), b2 = await stageRect(page, '#enc-ai-bar'), c2 = await stageRect(page, '#enc-choices');
    ok(long && b2.b > 60 && s2.t >= b2.b && c2.t >= b2.b, `a wrapped AI bar (bottom ${Math.round(b2.b)}) pushes the portrait (${Math.round(s2.t)}) and the choices (${Math.round(c2.t)}) under it`);
    await page.close();
  }

  console.log('— ruling 33: encounter sizing stays the engine (demo :root) values');
  {
    const page = await boot();
    await enter(page, 'event_encounter_drifter_001', { nodeType: 'void', species: 'human' });
    await snap(page);
    const r = await page.evaluate(() => {
      const cs = id => getComputedStyle(document.getElementById(id));
      return { col: cs('enc-choices').width, title: cs('enc-narr-title').fontSize, body: cs('enc-narr-body').fontSize, ai: cs('enc-ai-text').fontSize, narrMin: cs('enc-narrative').minHeight };
    });
    ok(r.col === '320px' && r.title === '14px' && r.body === '18px' && r.ai === '14px' && r.narrMin === '130px', `320 column, 14/18 title/body, 14 AI, narrative min 130 (${JSON.stringify(r)})`);
    await page.close();
  }

  console.log('— A4 + ruling 36: flag-gated choices hidden until their flag is set');
  {
    const page = await boot();
    for (const [id, layer, nodeType] of [['event_encounter_pirate_001', null, 'void'], ['event_encounter_boarding_001', null, 'derelict'], ['event_general_003', null, 'void']]) {
      await page.evaluate(() => STATE.flags.delete('negotiation_prepared'));
      await enter(page, id, { nodeType, species: 'human', layer });
      await snap(page);
      const off = await page.evaluate(() => [...document.querySelectorAll('#enc-choices .enc-choice')].map(b => b.textContent));
      ok(!off.some(t => /prepared terms/i.test(t)) && !off.some(t => /Story-gated/.test(t)), `${id}: no "prepared terms" choice before negotiation_prepared (${off.length} rows)`);
      await page.evaluate(() => STATE.flags.add('negotiation_prepared'));
      await enter(page, id, { nodeType, species: 'human', layer });
      await snap(page);
      const on = await page.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /prepared terms/i.test(b.textContent)); return b ? { locked: b.classList.contains('locked'), sub: (b.querySelector('.ch-sub') || {}).textContent || '' } : null; });
      ok(on && !on.locked, `${id}: with the flag set (diplomat aboard) it shows, unlocked (${on && on.sub})`);
    }
    // No diplomat: with the flag it shows locked "Need: Diplomat" — a true statement now.
    await page.evaluate(() => { STATE.crew = ['engineer', 'medic']; STATE.flags.add('negotiation_prepared'); });
    await enter(page, 'event_encounter_pirate_001', { nodeType: 'void', species: 'human' });
    await snap(page);
    const nd = await page.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /prepared terms/i.test(b.textContent)); return b && b.classList.contains('locked') && b.querySelector('.ch-sub').textContent; });
    ok(nd === 'Need: Diplomat', 'flag set, no diplomat: locked "Need: Diplomat" (' + nd + ')');
    // sim.js judges the same visible list.
    const fs = require('fs');
    ok(/ch\.requires_flag && !STATE\.flags\.has\(ch\.requires_flag\)/.test(fs.readFileSync(path.join(__dirname, 'sim.js'), 'utf8')), 'sim.js hides requires_flag choices too');
    await page.close();
  }

  console.log('— B1 caps titles, B2 tone glow, ruling 37 flat outcome title');
  {
    const page = await boot();
    await enter(page, 'event_crisis_017', { nodeType: 'void' });
    await snap(page);
    const t = await page.evaluate(() => { const el = document.getElementById('enc-narr-title'); return { text: el.textContent, tt: getComputedStyle(el).textTransform, shown: el.innerText }; });
    ok(t.tt === 'uppercase' && t.shown === t.shown.toUpperCase() && /Holes/.test(t.text), `flat title "${t.text}" renders "${t.shown}" (text-transform ${t.tt})`);
    // A flat outcome: titled with the event's own title, not OUTCOME.
    const flat = await page.evaluate(() => {
      const ev = Object.values(EVENTS).find(e => !e.layers && e.active !== false && e.title && (e.choices || []).some(c => c.outcome && typeof c.outcome === 'object' && !c.requires_crew && !c.requires_item && !c.requires_flag && !c.gate && !c.launch_minigame && !c.microgame_type && !c.combat_trigger));
      const node = STATE.nodes[2]; STATE.currentId = node.id;
      enterEvent(node, ev); finishAllTyping();
      const ch = ev.choices.find(c => c.outcome && typeof c.outcome === 'object' && !c.requires_crew && !c.requires_item && !c.requires_flag && !c.gate && !c.launch_minigame && !c.microgame_type && !c.combat_trigger);
      handleChoiceClick(ch); finishAllTyping();
      return { id: ev.id, evTitle: ev.title, title: document.getElementById('enc-narr-title').textContent };
    });
    ok(flat.title === flat.evTitle && flat.title !== 'OUTCOME', `${flat.id}: outcome titled "${flat.title}" (the event title)`);
    // Tone glow per demo :792-803.
    const glow = await page.evaluate(() => {
      const n = document.getElementById('enc-narrative'), t = document.getElementById('enc-narr-title');
      n.classList.remove('tone-danger'); n.classList.add('tone-success');
      const s = getComputedStyle(t).textShadow;
      n.classList.remove('tone-success'); n.classList.add('tone-danger');
      const d = getComputedStyle(t).textShadow;
      n.classList.remove('tone-danger');
      return { s, d, plain: getComputedStyle(t).textShadow };
    });
    ok(/127, 184, 168, 0\.45/.test(glow.s), 'success title glows teal rgba(127,184,168,.45): ' + glow.s);
    ok(/204, 51, 51, 0\.5/.test(glow.d), 'danger title glows red rgba(204,51,51,.5): ' + glow.d);
    ok(/200, 168, 90, 0\.3/.test(glow.plain), 'neutral keeps the gold glow');
    await page.close();
  }

  console.log('— B3 outcome view: the speaker listens; B4 plain gold CONTINUE');
  {
    const page = await boot();
    await enter(page, 'event_encounter_drifter_001', { nodeType: 'void', species: 'human' });
    await snap(page);
    const out = await page.evaluate(() => {
      const ev = STATE.currentEvent; const id = Object.keys(ev.outcomes)[0];
      STATE.currentOutcomeId = id; renderEncounterState(); finishAllTyping();
      const subj = document.getElementById('enc-subject'), head = document.getElementById('enc-subject-head');
      return { cls: subj.className, filter: getComputedStyle(head).filter, comm: subj.classList.contains('comm-screen') || subj.classList.contains('comm-corrupted') };
    });
    ok(/pose-listening/.test(out.cls) && (out.comm || /brightness\(1\.1\)/.test(out.filter)), `outcome view: pose-listening on the subject (head filter ${out.filter})`);
    await landed(page);
    const btn = await page.evaluate(() => {
      const b = document.querySelector('#enc-choices .enc-choice.advance'); const cs = getComputedStyle(b), tx = getComputedStyle(b.querySelector('.ch-text'));
      return { text: b.textContent, shown: b.innerText, strip: cs.borderRightColor, color: cs.color, tt: tx.textTransform };
    });
    ok(btn.text === 'Continue' && btn.shown.trim() === 'CONTINUE' && !/→/.test(btn.text), `button reads "${btn.shown.trim()}" (no arrow)`);
    ok(/200, 168, 90/.test(btn.strip) && !/95, 168, 208/.test(btn.color), `plain gold strip ${btn.strip}, text ${btn.color} (no teal)`);
    await shot(page, 'b4_outcome');
    // pirate_paid on the real path: pose-listening, title from the outcome.
    await enter(page, 'event_encounter_pirate_001', { nodeType: 'void', species: 'human' });
    await snap(page);
    await page.evaluate(() => { STATE.goldAmount = 100; });
    await page.evaluate(() => { renderEncounterState(); finishAllTyping(); });
    await clickText(page, 'Pay 20 gold');
    await page.waitForFunction(() => STATE.currentOutcomeId === 'pirate_paid');
    const p = await page.evaluate(() => ({ cls: document.getElementById('enc-subject').className, title: document.getElementById('enc-narr-title').textContent }));
    ok(/pose-listening/.test(p.cls) && !/pose-hostile/.test(p.cls) && p.title === 'THEY PEEL OFF', `pirate_paid: hostile → listening (${p.cls})`);
    await snap(page);
    await shot(page, 'b4_outcome_pirate_paid');
    await page.close();
  }

  console.log('— B5 typing speeds = demo (narrator 18, spoken 22, AI 14 ms/char), no long-body speed-up');
  {
    const page = await boot();
    const ms = await page.evaluate(() => TYPE_MS);
    ok(ms.ai === 14 && ms.narrator === 18 && ms.spoken === 22, 'TYPE_MS ' + JSON.stringify(ms));
    // Narrator rate on a 606-char body (old: 2–3 chars per 12ms tick).
    await page.evaluate(() => { STATE.activeAI = 'none_ai'; });
    await enter(page, 'event_derelict_001', { nodeType: 'derelict' });
    const rate = async (sel) => page.evaluate(async sel => {
      const el = document.querySelector(sel);
      const t0 = await new Promise(res => { const f = () => { const t = el.querySelector('.enc-tw-typed'); if (t && t.textContent.length >= 2) res([performance.now(), t.textContent.length]); else requestAnimationFrame(f); }; f(); });
      await new Promise(r => setTimeout(r, 1000));
      const t = el.querySelector('.enc-tw-typed');
      const n1 = t ? t.textContent.length : el.textContent.length;
      return (n1 - t0[1]) / ((performance.now() - t0[0]) / 1000);
    }, sel);
    const nr = await rate('#enc-narr-body');
    ok(nr > 30 && nr <= 58, `narrator types ${nr.toFixed(1)} chars/s (demo 55 cps; was ~250 on long bodies)`);
    await snap(page);
    // Spoken line: the drifter's line, typed after AI + body (snap those first).
    await enter(page, 'event_encounter_pirate_001', { nodeType: 'void', species: 'human', layer: 'haggle' });
    await page.waitForFunction(() => { const c = document.querySelector('.enc-tw-cursor'); return c && c.parentNode.id === 'enc-narr-body'; }, null, { timeout: 15000 });
    const sr = await rate('#enc-dialog-line');
    ok(sr > 25 && sr <= 47, `spoken line types ${sr.toFixed(1)} chars/s (demo 45 cps; was 38)`);
    // Click-to-snap still lands everything.
    await page.mouse.click(640, 400);
    await landed(page);
    ok(await page.evaluate(() => !document.querySelector('.enc-tw-cursor') && /repair kit/.test(document.getElementById('enc-dialog-line').textContent)), 'a click in the frame snaps the rest in');
    await page.close();
  }

  console.log('— B6 choice sub-label / lock styling = demo values');
  {
    const page = await boot({ crew: ['engineer', 'medic'] });
    await page.evaluate(() => { STATE.goldAmount = 0; });
    await enter(page, 'event_encounter_pirate_001', { nodeType: 'void', species: 'human' });
    await snap(page);
    await landed(page);
    const r = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#enc-choices .enc-choice')];
      const by = t => btns.find(b => b.textContent.includes(t));
      const sub = by('Burn fuel').querySelector('.ch-sub'), risky = sub.querySelector('.risky');
      const locked = by('Negotiate');
      const lsub = locked.querySelector('.ch-sub');
      return {
        subSize: getComputedStyle(sub).fontSize, subColor: getComputedStyle(by('Negotiate').querySelector('.ch-sub span') || sub).color,
        subMargin: getComputedStyle(sub).marginTop, riskyColor: risky && getComputedStyle(risky).color,
        locked: locked.classList.contains('locked'), lockedFilter: getComputedStyle(locked).filter, lockedSub: lsub.textContent,
        lockedSubColor: getComputedStyle(lsub.querySelector('span')).color, padlock: (locked.querySelector('.enc-choice-gate') || {}).style ? locked.querySelector('.enc-choice-gate').style.backgroundImage : '',
        gap: getComputedStyle(document.getElementById('enc-choices')).rowGap,
      };
    });
    ok(r.subSize === '12px' && r.subMargin === '0px', `sub-label 12px, no extra margin (${r.subSize}, ${r.subMargin})`);
    ok(r.riskyColor === 'rgb(204, 51, 51)', 'risky sub-label #cc3333 (' + r.riskyColor + ')');
    ok(r.locked && r.lockedFilter === 'grayscale(0.6) brightness(0.65)', 'locked filter grayscale(.6) brightness(.65) (' + r.lockedFilter + ')');
    ok(r.lockedSub === 'Need: Diplomat' && r.lockedSubColor === 'rgb(136, 152, 168)' && /lock\.png/.test(r.padlock), `locked sub plain grey "${r.lockedSub}" (${r.lockedSubColor}) under the padlock badge`);
    ok(r.gap === '8px', 'choice gap 8px (' + r.gap + ')');
    const h = await page.$('#enc-choices .enc-choice.risky');
    await h.hover();
    await page.waitForFunction(() => { const b = document.querySelector('#enc-choices .enc-choice.risky:hover'); return b && getComputedStyle(b).filter === 'brightness(1.12)'; }, null, { timeout: 3000 }).then(() => ok(true, 'hover lifts brightness(1.12)')).catch(async () => ok(false, 'hover filter ' + await page.evaluate(() => getComputedStyle(document.querySelector('#enc-choices .enc-choice.risky')).filter)));
    await page.close();
  }

  console.log('— B7 pirate authoring (demo-combat :1880-1935) + ruling 43 gate icons');
  {
    const page = await boot({ crew: ['engineer', 'diplomat'] });
    await page.evaluate(() => { STATE.crew = ['engineer', 'diplomat']; STATE.goldAmount = 100; });
    await enter(page, 'event_encounter_pirate_001', { nodeType: 'void', species: 'human' });
    await snap(page);
    await landed(page);
    const intro = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#enc-choices .enc-choice')];
      return {
        pose: document.getElementById('enc-subject').className,
        rows: btns.map(b => ({ t: b.querySelector('.ch-text').textContent, sub: (b.querySelector('.ch-sub') || {}).textContent || '', risky: b.classList.contains('risky'),
          oneLine: !b.querySelector('.ch-sub') || b.querySelector('.ch-sub').scrollWidth <= b.querySelector('.ch-sub').clientWidth + 1,
          gate: b.querySelector('.enc-choice-gate') ? [b.querySelector('.enc-choice-gate').style.backgroundImage, getComputedStyle(b.querySelector('.enc-choice-gate')).backgroundSize] : null })),
      };
    });
    const row = t => intro.rows.find(r => r.t === t) || {};
    ok(/pose-hostile/.test(intro.pose), 'intro: hostile pose');
    ok(row('Open Fire').risky && row('Open Fire').sub === 'Begin ship-to-ship combat', 'OPEN FIRE: risky, "Begin ship-to-ship combat"');
    ok(row('Flee').risky && row('Flee').sub === 'Burn fuel, leave them behind', 'FLEE: risky, "Burn fuel, leave them behind"');
    ok(row('Ram').risky && row('Ram').sub === 'Mostly escape · risk combat', 'RAM: risky, "Mostly escape · risk combat"');
    ok(intro.rows.map(r => r.t).join('|').indexOf('Negotiate|Pay 20 gold for safe passage|Open Fire|Flee|Ram') === 0, 'demo order: NEGOTIATE, PAY, OPEN FIRE, FLEE, RAM (' + intro.rows.map(r => r.t).join(' / ') + ')');
    ok(intro.rows.every(r => r.oneLine), 'every sub-label fits one line');
    const ramGate = row('Ram').gate, negGate = row('Negotiate').gate, payGate = row('Pay 20 gold for safe passage').gate;
    ok(ramGate && /careers\/engineer\.png/.test(ramGate[0]) && ramGate[1] === '24px 24px', 'career gate icons draw 48→24 (integer 1:2): ' + (ramGate && ramGate[1]));
    ok(negGate && negGate[1] === '24px 24px' && payGate && payGate[1] === '32px 32px', 'gold coin stays 32 native (1:1)');
    // negotiate: listening, three dialog lines.
    await page.evaluate(() => { STATE.crew = ['diplomat', 'medic']; }); // the medic's line unlocks
    await clickText(page, 'Negotiate');
    await page.waitForFunction(() => STATE.layerStack[STATE.layerStack.length - 1] === 'negotiate');
    await snap(page);
    const neg = await page.evaluate(() => ({
      pose: document.getElementById('enc-subject').className,
      dialog: [...document.querySelectorAll('#enc-choices .enc-choice .ch-text.dialog')].map(e => e.textContent),
      subs: [...document.querySelectorAll('#enc-choices .enc-choice')].map(b => (b.querySelector('.ch-sub') || {}).textContent || ''),
    }));
    ok(/pose-listening/.test(neg.pose), 'negotiate: listening pose');
    ok(neg.dialog.length === 3 && neg.dialog.every(t => /^".+"$/.test(t)), 'all three negotiation lines are spoken dialog choices: ' + neg.dialog.join(' / '));
    ok(neg.subs.includes('Medic vouches — sympathy play') && neg.subs.includes('Bargain') && neg.subs.includes('Bluff · risky') && neg.subs.includes('Return to the options'), 'demo sub-labels on the negotiation');
    await page.close();
  }

  console.log('— ruling 34: choice tooltips (time + costs for everyone; previews = outcomes)');
  {
    const page = await boot({ ai: 'rex' });
    await page.evaluate(() => { STATE.goldAmount = 100; STATE.resources.fuel = 60; });
    await enter(page, 'event_encounter_pirate_001', { nodeType: 'void', species: 'human' });
    await snap(page);
    await landed(page);
    const tips = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#enc-choices .enc-choice')].map(b => [b.querySelector('.ch-text').textContent, b.dataset.tipDescription || b.getAttribute('title') || ''])));
    ok(/Takes 2 days/.test(tips.Flee) && /Costs: −8 FUEL/.test(tips.Flee), 'Flee tooltip: ' + JSON.stringify(tips.Flee));
    ok(/Takes 2 days/.test(tips.Ram) && /−18 HULL/.test(tips.Ram) && /−3 FUEL/.test(tips.Ram) && /30% they hold/.test(tips.Ram), 'Ram tooltip: ' + JSON.stringify(tips.Ram));
    ok(/combat/i.test(tips['Open Fire']) && /Risky/.test(tips['Open Fire']), 'Open Fire tooltip: ' + JSON.stringify(tips['Open Fire']));
    ok(/Takes 2 days/.test(tips['Pay 20 gold for safe passage']) && /−20 GOLD/.test(tips['Pay 20 gold for safe passage']), 'Pay tooltip (REX, no MARV): ' + JSON.stringify(tips['Pay 20 gold for safe passage']));
    ok(/Takes 2 days/.test(tips['BREAK OFF']) && /−8 FUEL/.test(tips['BREAK OFF']), 'BREAK OFF tooltip = Flee: ' + JSON.stringify(tips['BREAK OFF']));
    const noMarv = await page.evaluate(() => ![...document.querySelectorAll('#enc-choices .ch-sub')].some(s => /MARV/.test(s.textContent)));
    ok(noMarv, 'without MARV no sub-label preview (the perk stays his)');
    // Preview = outcome: Flee really costs 8 fuel and 2 days.
    const before = await page.evaluate(() => ({ fuel: STATE.resources.fuel, day: STATE.daysElapsed }));
    await clickText(page, 'Flee');
    await page.waitForFunction(() => STATE.currentOutcomeId === 'pirate_flee');
    const after = await page.evaluate(() => ({ fuel: STATE.resources.fuel, day: STATE.daysElapsed }));
    ok(before.fuel - after.fuel === 8 + (after.fuel < before.fuel - 8 ? before.fuel - 8 - after.fuel : 0) || before.fuel - after.fuel >= 8, `Flee: fuel ${before.fuel} → ${after.fuel}`);
    ok(after.day - before.day === 2, `Flee: 2 days pass (${before.day} → ${after.day})`);
    await page.close();
    // MARV keeps the sub-label preview.
    const p2 = await boot({ ai: 'marv' });
    await p2.evaluate(() => { STATE.goldAmount = 100; });
    await enter(p2, 'event_encounter_pirate_001', { nodeType: 'void', species: 'human' });
    await snap(p2);
    ok(await p2.evaluate(() => [...document.querySelectorAll('#enc-choices .ch-sub')].some(s => /^MARV · /.test(s.textContent))), 'MARV: the costliest choice still shows his sub-label preview');
    await p2.close();
  }

  console.log('— ruling 39: BREAK OFF does exactly what Flee does');
  {
    const page = await boot();
    await page.evaluate(() => { STATE.resources.fuel = 60; });
    await enter(page, 'event_encounter_pirate_001', { nodeType: 'void', species: 'human', layer: 'negotiate' });
    await snap(page);
    await landed(page);
    const l = await page.evaluate(() => { const b = document.querySelector('#enc-choices .enc-choice.leave'); return b && { text: b.textContent.trim(), locked: b.classList.contains('locked'), border: getComputedStyle(b).borderTopWidth }; });
    ok(l && l.text === 'BREAK OFF' && !l.locked && l.border === '3px', 'every pirate layer has the BREAK OFF leave row (3px red border)');
    const before = await page.evaluate(() => ({ fuel: STATE.resources.fuel, day: STATE.daysElapsed }));
    await clickText(page, 'BREAK OFF');
    await page.waitForFunction(() => STATE.currentOutcomeId === 'pirate_flee');
    const r = await page.evaluate(() => ({ fuel: STATE.resources.fuel, day: STATE.daysElapsed, gone: document.getElementById('screen-encounter').classList.contains('hostile-gone'), title: document.getElementById('enc-narr-title').textContent }));
    ok(before.fuel - r.fuel === 8 && r.day - before.day === 2 && r.gone && r.title === 'STRAIGHT AND FAST', `BREAK OFF → pirate_flee: −8 fuel, 2 days, hostile gone (${r.title})`);
    await page.close();
  }

  console.log('— ruling 40: haggle = 30% fuel + 1 repair kit (only if you carry one)');
  for (const kits of [2, 0]) {
    const page = await boot();
    await page.evaluate(k => { STATE.resources.fuel = 50; STATE.items = STATE.items.filter(i => i !== 'repair_kit'); for (let i = 0; i < k; i++) STATE.items.push('repair_kit'); }, kits);
    await enter(page, 'event_encounter_pirate_001', { nodeType: 'void', species: 'human', layer: 'haggle' });
    await snap(page);
    await landed(page);
    const r = await page.evaluate(() => {
      const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.querySelector('.ch-text').textContent === 'Accept');
      return { line: document.getElementById('enc-dialog-line').textContent, sub: b.querySelector('.ch-sub').textContent, tip: b.dataset.tipDescription || '' };
    });
    ok(/Thirty percent/i.test(r.line) && /repair kit/i.test(r.line), 'the line says so: ' + r.line);
    if (kits) ok(/−30% FUEL/.test(r.sub) && /USES REPAIR KIT/.test(r.sub), `with kits: preview "${r.sub}"`);
    else ok(/−30% FUEL/.test(r.sub) && !/REPAIR KIT/.test(r.sub), `no kit: preview "${r.sub}" (no promised kit)`);
    ok(/−15 FUEL/.test(r.tip), 'tooltip names the real share of 50 fuel: ' + JSON.stringify(r.tip));
    await clickText(page, 'Accept');
    await page.waitForFunction(() => STATE.currentOutcomeId === 'pirate_deal_30');
    const after = await page.evaluate(() => ({ fuel: STATE.resources.fuel, kits: STATE.items.filter(i => i === 'repair_kit').length }));
    ok(after.fuel <= 35 && after.kits === Math.max(0, kits - 1), `Accept: fuel 50 → ${after.fuel}, kits ${kits} → ${after.kits}`);
    await page.close();
  }

  console.log('— B10 emoji-head talking bob; ruling 47b talk loop idle hold');
  {
    const page = await boot();
    // A species with no art: the head falls back to the emoji (probing the
    // missing art can outlast the typing, so wait for it with the text
    // snapped, then paint the layer again — same speaker, no re-probe — and
    // catch its spoken beat).
    await enter(page, 'event_encounter_drifter_001', { nodeType: 'void', species: 'zz_no_art' });
    await snap(page);
    await page.waitForFunction(() => { const h = document.getElementById('enc-subject-head'); return h && !h.classList.contains('has-spritesheet') && h.textContent.trim().length > 0; }, null, { timeout: 30000 });
    await page.evaluate(() => { tpSaveSettings({ textSpeed: 'fast' }); renderEncounterState(); });
    await page.waitForFunction(() => { const c = document.querySelector('.enc-tw-cursor'); return c && c.parentNode.id === 'enc-dialog-line'; }, null, { timeout: 40000 });
    const bob = await page.evaluate(() => { const h = document.getElementById('enc-subject-head'); return { cls: h.classList.contains('talking'), anim: getComputedStyle(h).animationName }; });
    ok(bob.cls && bob.anim === 'enc-head-talk', `emoji head bobs while its line types (${bob.anim})`);
    await snap(page);
    await page.waitForFunction(() => getComputedStyle(document.getElementById('enc-subject-head')).animationName === 'none');
    ok(true, 'the bob stops when the line lands');
    // Spritesheet head: no bob; the loop holds idle 500ms each 2s loop.
    await enter(page, 'event_encounter_drifter_001', { nodeType: 'void', species: 'human' });
    await snap(page);
    await page.waitForFunction(() => document.getElementById('enc-subject-head').classList.contains('has-spritesheet'), null, { timeout: 30000 });
    const tr = await page.evaluate(async () => {
      const h = document.getElementById('enc-subject-head');
      SceneArt.stopTalking();
      const idle = h.style.getPropertyValue('--frame-x') + ',' + h.style.getPropertyValue('--frame-y');
      const out = [];
      SceneArt.talk('A long line, typed for a while.', true);
      const t0 = performance.now();
      while (performance.now() - t0 < 2400) {
        out.push([performance.now() - t0, h.style.getPropertyValue('--frame-x') + ',' + h.style.getPropertyValue('--frame-y'), getComputedStyle(h).animationName]);
        await new Promise(r => setTimeout(r, 25));
      }
      SceneArt.stopTalking();
      return { idle, out };
    });
    const win = (a, b) => tr.out.filter(([t]) => t >= a && t <= b);
    ok(win(30, 440).every(([, f]) => f === tr.idle), 'loop 1: idle held for the first 500ms');
    ok(win(560, 1940).filter(([, f]) => f !== tr.idle).length >= win(560, 1940).length * 0.8, 'then the talk frames cycle (1500ms)');
    ok(win(2060, 2440).every(([, f]) => f === tr.idle), 'loop 2: idle held again for 500ms (every loop, demo-npc)');
    ok(tr.out.every(([, , a]) => a === 'none'), 'a spritesheet head never bobs');
    await page.close();
  }

  console.log('— B8 capitalised loot, B9 ASCII minus, B12 5px strip, B11 banner under a long AI line');
  {
    const page = await boot({ captain: 'engineer', crew: ['pilot', 'medic'], ai: 'ajoy' });
    await page.evaluate(() => {
      // Every combat line long enough to wrap the AI bar three lines.
      const long = 'AJOY has logged the moment the fight became unavoidable. It was eleven minutes ago. She said nothing. She is saying it now, at length, for the record.';
      for (const slot of Object.keys(MOD.flavor.combat_log || {})) MOD.flavor.combat_log[slot] = Object.assign({}, MOD.flavor.combat_log[slot], { ajoy: [long] });
      window.__floats = [];
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('combat-dmg-float')) window.__floats.push(n.textContent); }))).observe(document.getElementById('screen-encounter'), { childList: true });
    });
    await enter(page, 'event_encounter_pirate_001', { nodeType: 'void', species: 'insect' });
    await page.evaluate(() => { finishAllTyping(); STATE.activeAI = 'ajoy'; window.triggerCombat({}); });
    await page.waitForFunction(() => { const t = document.getElementById('combat-turn-indicator'); return t && t.style.display !== 'none' && /YOUR TURN/.test(t.textContent); }, null, { timeout: 10000 });
    await page.waitForTimeout(250);
    const bt = await stageRect(page, '#combat-turn-indicator'), ab = await stageRect(page, '#enc-ai-bar');
    ok(ab.b > 50 && bt.t >= ab.b, `YOUR TURN (top ${Math.round(bt.t)}) sits under the wrapped AI bar (bottom ${Math.round(ab.b)})`);
    const strip = await page.evaluate(() => getComputedStyle(document.querySelector('#enc-choices.combat-actions .enc-choice')).borderRightWidth);
    ok(strip === '5px', 'combat action strip 5px (' + strip + ')');
    // Fire until the ship goes (insect never surrenders), then SALVAGE.
    for (let i = 0; i < 14; i++) {
      if (await page.evaluate(() => /TARGET DESTROYED/.test(document.getElementById('enc-narr-title').textContent))) break;
      if (await page.evaluate(() => [...document.querySelectorAll('#enc-choices .enc-choice')].some(b => /FIRE LASER/.test(b.textContent) && !b.closest('.combat-locked')))) {
        await clickText(page, 'FIRE LASER'); await page.waitForTimeout(80); await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(900);
    }
    await page.evaluate(() => { Math.random = () => 0.1; }); // every loot roll lands
    await page.waitForFunction(() => [...document.querySelectorAll('#enc-choices .enc-choice')].some(b => /SALVAGE/i.test(b.textContent)), null, { timeout: 15000 }).catch(() => {});
    await clickText(page, 'SALVAGE');
    await page.waitForFunction(() => document.getElementById('combat-end-overlay').classList.contains('show'), null, { timeout: 15000 }).catch(() => {});
    const card = await page.evaluate(() => ({ labels: [...document.querySelectorAll('#combat-end-card .lt-label')].map(e => e.textContent), notes: (document.querySelector('#combat-end-card .end-loot-notes') || {}).textContent || '', floats: window.__floats }));
    ok(card.labels.length > 1 && card.labels.every(l => /^[A-Z]/.test(l)), 'end-card labels capitalised: ' + card.labels.join(', '));
    ok(card.labels.includes('Metal') || card.labels.includes('Scrap'), 'materials read "Metal"/"Scrap" (demo)');
    ok(!/−/.test(card.notes) && (!card.notes || /[-+]\d/.test(card.notes) || /Morale|Hull/.test(card.notes)), 'notes use ASCII "-" (Press Start 2P): ' + card.notes);
    ok(card.floats.length > 0 && card.floats.every(f => !/−/.test(f)), 'damage floaters use ASCII "-": ' + card.floats.slice(0, 4).join(' '));
    await shot(page, 'b4_combat_card_victory');
    await page.close();
  }

  console.log('— A3 defeat: the cargo it shows lost is exactly what is lost');
  for (const [items, mats] of [[['medkit', 'repair_kit', 'gas_analyzer', 'fuel_cell'], { metal: 16, scrap: 3 }], [[], { metal: 16 }]]) {
    const page = await boot({ captain: 'engineer', crew: ['pilot', 'medic'] });
    await page.evaluate(([items, mats]) => { STATE.items = items.slice(); STATE.materials = Object.assign({}, mats); }, [items, mats]);
    await enter(page, 'event_encounter_pirate_001', { nodeType: 'void', species: 'human' });
    await page.evaluate(() => { finishAllTyping(); Math.random = () => 0.5; STATE.resources.hull = 30; window.triggerCombat({}); });
    const before = await page.evaluate(() => ({ items: STATE.items.length, mats: Object.assign({}, STATE.materials) }));
    let line = '';
    for (let i = 0; i < 12; i++) {
      line = await page.evaluate(() => document.getElementById('enc-narr-body').textContent);
      if (/Cargo lost|Nothing in the hold/.test(line)) break;
      if (await page.evaluate(() => [...document.querySelectorAll('#enc-choices .enc-choice')].some(b => /EVASIVE/.test(b.textContent)))) await clickText(page, 'EVASIVE');
      await page.waitForTimeout(900);
    }
    await page.waitForFunction(() => document.getElementById('combat-end-overlay').classList.contains('show'), null, { timeout: 10000 });
    const r = await page.evaluate(() => ({ items: STATE.items.length, mats: Object.assign({}, STATE.materials), body: document.getElementById('combat-end-body').textContent, notes: (document.querySelector('#combat-end-card .end-loot-notes') || {}).textContent || '' }));
    const m = /Cargo lost: ([^.]+)/.exec(line);
    const said = {};
    // Items by name ("Repair Kit", "2× Medkit"), materials by count ("6 Metal").
    let saidItems = 0;
    if (m) for (const part of m[1].split(', ')) {
      const mat = /^(\d+) (\S+)$/.exec(part);
      if (mat) said[mat[2]] = +mat[1];
      else saidItems += +((/^(\d+)× /.exec(part) || [0, 1])[1]);
    }
    const lostItems = before.items - r.items;
    const lostMats = Object.fromEntries(Object.keys(before.mats).map(k => [k, before.mats[k] - (r.mats[k] || 0)]));
    ok(!/%/.test(line) && !!m, 'defeat line names the loss, no bare percentage: ' + (m ? m[0] : line));
    ok(saidItems === lostItems, `items: said ${saidItems}, lost ${lostItems}`);
    ok(Object.entries(lostMats).every(([k, v]) => (said[k.charAt(0).toUpperCase() + k.slice(1)] || 0) === v) && Object.values(lostMats).some(v => v > 0), `materials: said ${JSON.stringify(said)}, lost ${JSON.stringify(lostMats)}`);
    ok(r.body.includes(m ? m[0] : '§') && r.notes.includes(m ? m[0] : '§'), 'the card body and notes repeat the same line');
    if (items.length) await shot(page, 'b4_combat_card_defeat');
    await page.close();
  }

  console.log('— lint knows leave_as / outcome pose');
  {
    const { execFileSync } = require('child_process');
    let out = '';
    try { out = execFileSync(process.execPath, [path.join(__dirname, '..', 'lint_modules.js')], { encoding: 'utf8', cwd: path.join(__dirname, '..', '..') }); } catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
    ok(/clean|portable_data\.js is stale/.test(out) && !/leave_as|pose "/.test(out), 'lint passes the pirate leave_as (' + out.trim().split('\n').pop() + ')');
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'lint_modules.js'), 'utf8');
    ok(/leave_as\.outcome/.test(src) && /outcomes\.\$\{ok\}: pose/.test(src), 'lint validates leave_as and outcome poses');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (errors.length) console.log('page errors:', [...new Set(errors)].slice(0, 5));
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
