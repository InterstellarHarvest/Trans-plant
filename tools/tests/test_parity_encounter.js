// Encounter-screen parity with the canon demo (resources/demo-encounter.html,
// PARITY_AUDIT.md "Parity: demo-encounter + demo-npc"; owner rulings
// 2026-10-11): corrupted comm look, pose filters, the dialog strip (one
// line = one line, bare quotes), the click pulse, text delivery (beats in
// order, choices held, click snaps, ▍ cursor, reserved space), the leave
// row, the right-side 5px accent strip, mixed-case dialog choices, the
// full "Need: X + Y" lock label, bartender names, one species per stop,
// barter + surplus wares.
//
// Test hook: finishAllTyping() snaps the delivery (what a click in the
// frame does); a scripted .click() on a held choice snaps then acts.
// SHOT_DIR=<dir> saves screenshots for an eyeball against the demo.
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
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    tpSaveSettings({ textSpeed: 'normal' });
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForTimeout(150);
  return page;
}
// Enter an event at a stop of the given type; `species` pins the event
// NPC's face (seeded into npcCache the way resolveNpc caches it).
const enter = (page, id, o) => page.evaluate(({ id, o }) => {
  const node = STATE.nodes.find(n => n.node_type === ((o && o.nodeType) || 'station')) || STATE.nodes[1];
  STATE.currentId = node.id;
  const ev = EVENTS[id];
  if (o && o.species && ev.npc) {
    STATE.npcCache[ev.id + '@' + node.id] = { species: o.species, disposition: ev.npc.disposition, job: ev.npc.job || null,
      displayName: ev.npc.job === 'bartender' ? 'TEST BARKEEP' : (ev.npc.disposition || '').toUpperCase(), quirk: '' };
  }
  enterEvent(node, ev, o && o.layer ? { layerStack: [o.layer] } : undefined);
  return true;
}, { id, o });
const snap = page => page.evaluate(() => finishAllTyping());
const landed = page => page.waitForFunction(() => !document.querySelector('#enc-choices.held, #enc-choices .enc-choice.entering, .enc-tw-cursor'), null, { timeout: 20000 });
const choiceEl = (page, t) => page.evaluateHandle(t => [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.textContent.includes(t)) || null, t);
async function shot(page, name) {
  if (!SHOT_DIR) return;
  await page.waitForTimeout(400);
  const g = await page.$('#game');
  await (g || page).screenshot({ path: path.join(SHOT_DIR, name + '.png') }).catch(() => {});
}
const box = async (page, sel) => page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);

(async () => {
  browser = await chromium.launch();

  console.log('— text delivery: AI → narrator → spoken line, choices held, click snaps');
  {
    const page = await boot();
    await enter(page, 'event_encounter_drifter_001', { nodeType: 'void', species: 'human' });
    // Sample which element holds the ▍ cursor, the hold, and the talk frame.
    const trace = await page.evaluate(async () => {
      const out = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 15000) {
        const c = document.querySelector('.enc-tw-cursor');
        const col = document.getElementById('enc-choices');
        const b = col.querySelector('.enc-choice');
        const head = document.getElementById('enc-subject-head');
        out.push({
          at: c ? c.parentNode.id : null,
          held: col.classList.contains('held'),
          entering: !!col.querySelector('.enc-choice.entering'),
          op: b ? getComputedStyle(b).opacity : null,
          pe: b ? getComputedStyle(b).pointerEvents : null,
          fx: head.style.getPropertyValue('--frame-x') + ',' + head.style.getPropertyValue('--frame-y'),
          sheet: head.classList.contains('has-spritesheet'),
        });
        if (!c && !col.classList.contains('held') && !col.querySelector('.enc-choice.entering') && out.length > 3) break;
        await new Promise(r => setTimeout(r, 25));
      }
      return out;
    });
    const order = [];
    for (const s of trace) if (s.at && order[order.length - 1] !== s.at) order.push(s.at);
    ok(order.join(' → ') === 'enc-ai-text → enc-narr-body → enc-dialog-line', 'beats type in order: ' + order.join(' → '));
    const typing = trace.filter(s => s.at);
    ok(typing.length > 3 && typing.every(s => s.held && s.op === '0' && s.pe === 'none'), 'choices held (opacity 0, pointer-events none) while any text types');
    ok(trace.some(s => !s.at && s.entering) || trace.some(s => !s.held && !s.at), 'then the choices cascade in');
    const pre = trace.filter(s => s.at === 'enc-ai-text' || s.at === 'enc-narr-body').filter(s => s.sheet);
    const during = trace.filter(s => s.at === 'enc-dialog-line' && s.sheet);
    if (pre.length && during.length) {
      ok(new Set(pre.map(s => s.fx)).size === 1, 'talk loop idle during the AI line and the narration (' + [...new Set(pre.map(s => s.fx))].join(' | ') + ')');
      ok(new Set(during.map(s => s.fx)).size > 1, 'talk loop runs during the spoken line (' + new Set(during.map(s => s.fx)).size + ' frames seen)');
    } else ok(false, 'drifter/human spritesheet painted for the talk check (pre ' + pre.length + ', during ' + during.length + ')');
    const after = await page.evaluate(() => {
      const b = document.querySelector('#enc-choices .enc-choice');
      return { op: getComputedStyle(b).opacity, pe: getComputedStyle(b).pointerEvents, cursor: !!document.querySelector('.enc-tw-cursor') };
    });
    ok(after.op === '1' && after.pe !== 'none' && !after.cursor, 'landed: choices visible + clickable, cursor gone');

    // Cascade timing: 40ms stagger.
    await enter(page, 'event_encounter_drifter_001', { nodeType: 'void', species: 'human' });
    const delays = await page.evaluate(async () => {
      while (document.querySelector('.enc-tw-cursor') || document.getElementById('enc-choices').classList.contains('held')) await new Promise(r => setTimeout(r, 5));
      return [...document.querySelectorAll('#enc-choices .enc-choice')].map(b => b.style.animationDelay);
    });
    ok(delays[0] === '0ms' && delays[1] === '40ms', 'choices fade in top to bottom, 40ms stagger (' + delays.join(',') + ')');
    const anim = await page.evaluate(() => { const b = document.querySelector('#enc-choices .enc-choice.entering') || document.querySelector('#enc-choices .enc-choice'); const cs = getComputedStyle(b); return cs.animationName + ' ' + cs.animationDuration; });
    ok(/enc-choice-enter 0\.18s/.test(anim) || /none/.test(anim), '180ms fade (' + anim + ')');

    // A real click in the frame while text types: everything snaps in, nothing is chosen.
    await enter(page, 'event_encounter_drifter_001', { nodeType: 'void', species: 'human' });
    await page.waitForTimeout(120);
    const before = await page.evaluate(() => ({ stack: STATE.layerStack.join('/'), typing: !!document.querySelector('.enc-tw-cursor') }));
    const p = await box(page, '#enc-choices .enc-choice'); // a held choice's spot: the click falls through to the frame
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(30);
    const s2 = await page.evaluate(() => ({
      stack: STATE.layerStack.join('/'),
      cursor: !!document.querySelector('.enc-tw-cursor'),
      held: document.getElementById('enc-choices').classList.contains('held') || !!document.querySelector('#enc-choices .enc-choice.entering'),
      ai: document.getElementById('enc-ai-text').textContent,
      body: document.getElementById('enc-narr-body').textContent,
      line: document.getElementById('enc-dialog-line').textContent,
      pending: document.querySelectorAll('.enc-tw-pending').length,
    }));
    ok(before.typing, 'text was still typing when clicked');
    ok(!s2.cursor && !s2.held && !s2.pending, 'one click in the frame snaps all text + choices in');
    ok(s2.stack === before.stack, 'the click chose nothing (still on ' + s2.stack + ')');
    ok(/^".+"$/.test(s2.ai) && s2.body.length > 40 && /^".+"$/.test(s2.line), 'AI line + spoken line in bare quotes, body full');

    // Pulse: a landed choice pulses, then resolves ~180ms later.
    const p2 = await box(page, '#enc-choices .enc-choice');
    await page.mouse.click(p2.x, p2.y);
    const mid = await page.evaluate(() => ({ pulse: !![...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.classList.contains('pulse')), stack: STATE.layerStack.join('/'),
      anim: (() => { const b = document.querySelector('#enc-choices .enc-choice.pulse'); return b ? getComputedStyle(b).animationName : ''; })() }));
    ok(mid.pulse && mid.anim === 'enc-choice-pulse', 'click pulse plays on the clicked choice (' + mid.anim + ')');
    ok(mid.stack === before.stack, 'and the choice waits for it (still ' + mid.stack + ')');
    await page.waitForTimeout(320);
    ok(await page.evaluate(() => STATE.layerStack.join('/')) === 'intro/visit', 'then resolves (→ ' + await page.evaluate(() => STATE.layerStack.join('/')) + ')');

    // Text speed still applies to every beat.
    const ratio = await page.evaluate(async () => {
      const el = document.createElement('div'); document.getElementById('screen-encounter').appendChild(el);
      const time = async sp => { tpSaveSettings({ textSpeed: sp }); const t0 = performance.now(); await new Promise(r => typeInto(el, 'x'.repeat(40), 12, r)); return performance.now() - t0; };
      const slow = await time('slow'), fast = await time('fast');
      tpSaveSettings({ textSpeed: 'normal' }); el.remove();
      return slow / fast;
    });
    ok(ratio > 2.5, 'text-speed setting scales the typewriter (slow/fast ×' + ratio.toFixed(1) + ')');

    // Reserved space: the body box doesn't grow while it types.
    await enter(page, 'event_station_009', { species: 'robot' });
    const hs = await page.evaluate(async () => {
      const el = document.getElementById('enc-narr-body'), seen = new Set();
      for (let i = 0; i < 60; i++) { seen.add(el.offsetHeight); if (!document.querySelector('.enc-tw-cursor')) break; await new Promise(r => setTimeout(r, 30)); }
      return [...seen];
    });
    ok(hs.length === 1, 'narrator box keeps its final height while typing (' + hs.join(',') + 'px)');
    await page.close();
  }

  console.log('— corrupted comm look (void events + boarding_001)');
  for (const id of ['event_void_001', 'event_void_002', 'event_void_003', 'event_encounter_boarding_001']) {
    const page = await boot();
    await enter(page, id, { nodeType: id.includes('void') ? 'void' : 'derelict', species: 'rock' });
    await snap(page);
    await page.waitForFunction(() => document.getElementById('enc-backdrop').classList.contains('has-bg-sprite'), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const bar = document.getElementById('enc-ai-bar'), txt = document.getElementById('enc-ai-text'), d = document.getElementById('enc-dialog');
      const bd = document.getElementById('enc-backdrop');
      return {
        barCls: bar.classList.contains('corrupted'), barBorder: getComputedStyle(bar).borderTopColor, barAnim: getComputedStyle(bar).animationName,
        shadow: getComputedStyle(txt).textShadow, color: getComputedStyle(txt).color,
        dlg: d.classList.contains('hidden') ? null : { cls: d.classList.contains('corrupted'), shadow: getComputedStyle(d).textShadow, anim: getComputedStyle(d).animationName, bg: getComputedStyle(d).backgroundColor },
        art: bd.classList.contains('has-bg-sprite'), bdFilter: getComputedStyle(bd).filter, bdAnim: getComputedStyle(bd).animationName,
        metaGap: Math.min(...['enc-subject', 'enc-choices'].map(id => document.getElementById(id)).filter(el => getComputedStyle(el).display !== 'none' && el.offsetHeight).map(el => el.getBoundingClientRect().top - bar.getBoundingClientRect().bottom)),
      };
    });
    ok(r.metaGap >= 0, id + ': the portrait + choices clear the (wider) corrupted AI bar (gap ' + Math.round(r.metaGap) + 'px; b4: the location label moved to the title row)');
    ok(r.barCls && /160, 90, 200/.test(r.barBorder) && r.barAnim === 'enc-corrupt-flicker', id + ': AI bar purple + flicker (' + r.barBorder + ', ' + r.barAnim + ')');
    ok(/204, 51, 51/.test(r.shadow) && /95, 168, 208/.test(r.shadow) && /224, 200, 240/.test(r.color), id + ': AI text red/blue split shadow');
    ok(r.art && /hue-rotate/.test(r.bdFilter) && r.bdAnim === 'enc-corrupt-backdrop', id + ': backdrop keeps a corrupted treatment over the art (' + r.bdFilter + ')');
    if (id === 'event_encounter_boarding_001') {
      ok(r.dlg && r.dlg.cls && /204, 51, 51/.test(r.dlg.shadow) && r.dlg.anim === 'enc-corrupt-flicker' && /20, 8, 30/.test(r.dlg.bg), id + ': dialog strip corrupted too');
      await shot(page, 'parity_corrupted_boarding');
      // parley layer is in_person: the look clears.
      await page.evaluate(() => { STATE.crew = ['diplomat', 'medic']; });
      await page.evaluate(() => { STATE.layerStack.push('parley'); renderEncounterState(); finishAllTyping(); });
      const off = await page.evaluate(() => ({ bar: document.getElementById('enc-ai-bar').classList.contains('corrupted'), d: document.getElementById('enc-dialog').classList.contains('corrupted') }));
      ok(!off.bar && !off.d, id + ': in-person parley layer drops the corrupted look');
    } else if (id === 'event_void_001') await shot(page, 'parity_corrupted_void');
    await page.close();
  }

  console.log('— pose filters');
  {
    const page = await boot();
    await enter(page, 'event_station_009', { species: 'robot' });
    await snap(page);
    const f = () => page.evaluate(() => ({ cls: [...document.getElementById('enc-subject').classList].filter(c => c.startsWith('pose-')).join(), f: getComputedStyle(document.getElementById('enc-subject-head')).filter }));
    const a = await f();
    ok(a.cls === 'pose-pleased' && a.f === 'brightness(1.2) saturate(1.2)', 'pleased → ' + a.f);
    await page.evaluate(() => { STATE.layerStack.push('watchers'); renderEncounterState(); finishAllTyping(); });
    await page.waitForTimeout(350); // the head's filter eases over 0.25s
    const b = await f();
    ok(b.cls === 'pose-listening' && b.f === 'brightness(1.1)', 'listening → ' + b.f);
    await page.evaluate(() => { const s = document.getElementById('enc-subject'); s.classList.remove('pose-listening'); s.classList.add('pose-hostile'); });
    await page.waitForTimeout(350);
    const hostile = await page.evaluate(() => getComputedStyle(document.getElementById('enc-subject-head')).filter);
    ok(/brightness\(0\.85\) contrast\(1\.2\) hue-rotate\(-10deg\)/.test(hostile), 'hostile → ' + hostile);
    await page.close();
  }

  console.log('— dialog strip: one line is one line, bare quotes; lift-clear still works');
  {
    const page = await boot();
    await enter(page, 'event_station_009', { species: 'robot' });
    await snap(page);
    const r = await page.evaluate(() => {
      const d = document.getElementById('enc-dialog'), l = document.getElementById('enc-dialog-line');
      const real = l.textContent;
      l.textContent = '"Hi."';
      const h = d.offsetHeight;
      const lh = parseFloat(getComputedStyle(d).lineHeight);
      l.textContent = real;
      return { h, lh, real, ws: getComputedStyle(d).whiteSpace, lws: getComputedStyle(l).whiteSpace };
    });
    ok(r.h <= r.lh + 16 + 2 + 1, 'one-line strip is ' + r.h + 'px (line ' + r.lh + 'px + padding + border; was 66px)');
    ok(r.ws === 'normal' && r.lws === 'pre-line', 'strip white-space normal, line pre-line (authored \\n still breaks)');
    ok(/^".+"$/.test(r.real), 'spoken line in bare quotes: ' + r.real.slice(0, 40) + '…');
    await shot(page, 'parity_station_bar');
    // Lift-clear (fitEncDialog): station_008's long line must clear the narrative panel.
    await page.evaluate(() => { STATE.items.push('distress_beacon_tag'); });
    await enter(page, 'event_station_008', { species: 'human' });
    await page.waitForTimeout(100);
    const clear = await page.evaluate(() => { const d = document.getElementById('enc-dialog').getBoundingClientRect(), n = document.getElementById('enc-narrative').getBoundingClientRect(); return { gap: n.top - d.bottom }; });
    ok(clear.gap >= 0, 'long spoken line clears the narrative panel while typing (gap ' + Math.round(clear.gap) + 'px)');
    await snap(page);
    const clear2 = await page.evaluate(() => { const d = document.getElementById('enc-dialog').getBoundingClientRect(), n = document.getElementById('enc-narrative').getBoundingClientRect(); return n.top - d.bottom; });
    ok(clear2 >= 0, 'and once landed (gap ' + Math.round(clear2) + 'px)');
    await page.close();
  }

  console.log('— leave row: red, uniform 3px, per-event label on every layer, locked when forced');
  {
    const page = await boot();
    await enter(page, 'event_station_009', { species: 'robot' });
    await snap(page);
    const leave = () => page.evaluate(() => {
      const b = [...document.querySelectorAll('#enc-choices .enc-choice')].pop();
      const cs = getComputedStyle(b);
      return { leave: b.classList.contains('leave'), locked: b.classList.contains('locked'), text: b.querySelector('.ch-text').textContent,
        bw: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].join(' '), bg: cs.backgroundImage, color: getComputedStyle(b.querySelector('.ch-text')).color };
    });
    const a = await leave();
    ok(a.leave && a.text === 'WALK OUT', 'cantina leave row reads WALK OUT (' + a.text + ')');
    ok(a.bw === '3px 3px 3px 3px', 'uniform 3px border (' + a.bw + ')');
    ok(/linear-gradient\(rgb\(58, 42, 42\)/.test(a.bg) && a.color === 'rgb(232, 160, 160)', 'red gradient, red-tinted text');
    await page.evaluate(() => { STATE.layerStack.push('engineer'); renderEncounterState(); finishAllTyping(); });
    const b = await leave();
    ok(b.leave && b.text === 'WALK OUT', 'still there on a sub-layer (engineer)');
    await page.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].pop(); b.click(); });
    await page.waitForTimeout(100);
    ok(await page.evaluate(() => !STATE.currentEvent || document.getElementById('screen-encounter').classList.contains('active') === false), 'and it leaves the event');
    // Per-layer label: aboard the trader's ship.
    await enter(page, 'event_encounter_trader_001', { nodeType: 'void', species: 'robot' });
    await snap(page);
    const t1 = await leave();
    await page.evaluate(() => { STATE.layerStack.push('pitch', 'misc'); renderEncounterState(); finishAllTyping(); });
    const t2 = await leave();
    ok(t1.text === 'NO THANKS' && t2.text === 'BACK TO YOUR SHIP', 'trader: NO THANKS on the hail, BACK TO YOUR SHIP in their hold');
    await shot(page, 'parity_trader_hold');
    // Hidden layer + no_leave.
    await enter(page, 'event_station_010', { species: 'insect', layer: 'pry' });
    await snap(page);
    ok(!(await page.evaluate(() => !!document.querySelector('#enc-choices .enc-choice.leave'))), 'leaveHidden layer (handoff pry) has no leave row');
    await enter(page, 'event_encounter_pirate_001', { nodeType: 'void', species: 'rock' });
    await snap(page);
    // b4 ruling 39: the pirate's leave row is BREAK OFF (it does what Flee does).
    ok(await page.evaluate(() => { const l = document.querySelector('#enc-choices .enc-choice.leave'); return !!l && l.textContent.trim() === 'BREAK OFF'; }), 'pirate: BREAK OFF leave row (b4 ruling 39)');
    // Forced: locked row + ⏱ title.
    for (const [id, nodeType, label] of [['event_crisis_017', 'void', "CAN'T LEAVE (HULL BREACH)"], ['event_nebula_004', 'nebula', "CAN'T LEAVE (MID-TRANSIT)"]]) {
      await enter(page, id, { nodeType });
      await snap(page);
      const f = await leave();
      const title = await page.evaluate(() => document.getElementById('enc-narr-title').textContent);
      ok(f.leave && f.locked && f.text === label, id + ': locked leave row "' + f.text + '"');
      ok(/^⏱ /.test(title), id + ': ⏱ title (' + title + ')');
      const still = await page.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].pop(); b.click(); return !!STATE.currentEvent && !STATE.outcomeMode; });
      ok(still, id + ': clicking the locked row does nothing');
      if (id === 'event_crisis_017') await shot(page, 'parity_forced_breach');
    }
    await page.close();
  }

  console.log('— choice buttons: right strip 5px, variant hover, dialog mixed case, every unmet need');
  {
    const page = await boot();
    await enter(page, 'event_station_009', { species: 'robot' });
    await snap(page);
    const st = await page.evaluate(() => {
      const bs = [...document.querySelectorAll('#enc-choices .enc-choice')];
      const plain = bs.find(b => /ORDER A DRINK/.test(b.textContent)), hint = bs.find(b => b.classList.contains('hint'));
      const cs = b => { const c = getComputedStyle(b); return { r: c.borderRightWidth, l: c.borderLeftWidth, rc: c.borderRightColor }; };
      return { plain: cs(plain), hint: cs(hint) };
    });
    ok(st.plain.r === '5px' && st.plain.l === '2px' && st.plain.rc === 'rgb(200, 168, 90)', 'strip on the right, 5px gold (left ' + st.plain.l + ')');
    ok(st.hint.rc === 'rgb(140, 200, 144)', 'hint strip teal — hint wins over risky, demo cascade order (' + st.hint.rc + ')');
    const hover = async t => { const h = await choiceEl(page, t); await h.hover(); await page.waitForTimeout(200); return page.evaluate(b => getComputedStyle(b).borderTopColor, h); };
    ok(await hover('APPROACH THE WATCHERS') === 'rgb(140, 200, 144)', 'hint hovers in its strip colour (teal)');
    ok(await hover('ORDER A DRINK') === 'rgb(200, 168, 90)', 'plain hovers gold');
    await page.evaluate(() => { STATE.layerStack.push('watchers'); renderEncounterState(); finishAllTyping(); });
    const rk = await page.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /SEE THE GOODS/.test(b.textContent)); return getComputedStyle(b).borderRightColor; });
    ok(rk === 'rgb(204, 51, 51)', 'risky strip red (' + rk + ')');
    const hr = async t => { const h = await choiceEl(page, t); await h.hover(); await page.waitForTimeout(200); return page.evaluate(b => getComputedStyle(b).borderTopColor, h); };
    ok(await hr('SEE THE GOODS') === 'rgb(204, 51, 51)', 'risky hovers red');
    const dl = await page.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /package/.test(b.textContent)); const t = b.querySelector('.ch-text'); const cs = getComputedStyle(t); return { tt: cs.textTransform, color: cs.color, shown: t.innerText }; });
    ok(dl.tt === 'none' && dl.color === 'rgb(232, 216, 160)' && /What's in the package/.test(dl.shown), 'dialog choice mixed case, cream ("' + dl.shown + '")');
    // Every unmet requirement.
    const need = await page.evaluate(() => {
      STATE.crew = ['engineer', 'medic']; STATE.goldAmount = 3;
      return [lockReason({ gate: { crew: 'diplomat', gold: 20 } }), lockReason({ requires_crew: 'xenobiologist', gate: { item: 'gas_analyzer', gold: 12 } }), lockReason({ gate: { crew: 'engineer', gold: 2 } })];
    });
    ok(need[0] === 'Need: Diplomat + 20g', 'lock label: ' + need[0]);
    ok(need[1] === 'Need: Xenobiologist + Gas Analyzer + 12g', 'lock label: ' + need[1]);
    ok(need[2] === null, 'met requirements → unlocked');
    await page.evaluate(() => { STATE.goldAmount = 0; });
    await enter(page, 'event_encounter_trader_001', { nodeType: 'void', species: 'robot', layer: 'pitch' });
    await snap(page);
    const sub = await page.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /beacon/i.test(b.textContent)); return b.querySelector('.ch-sub').textContent; });
    ok(sub === 'Need: 60g', 'rendered: ' + sub + ' (b4 B6: plain grey under the padlock badge)');
    await page.close();
  }

  console.log('— bartender names (12, never twice in a run) + one species per stop');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const names = [];
      for (let i = 0; i < 12; i++) { STATE.currentId = 'bar' + i; names.push(resolveNpc(EVENTS.event_station_009).displayName); }
      STATE.currentId = 'bar3';
      const again = resolveNpc(EVENTS.event_station_009).displayName;
      const layerBk = resolveLayerNpc({ disposition: 'station_crew', job: 'bartender', species: 'robot' }, 'event_x', 'l').displayName;
      // species: seven NPCs at one stop
      STATE.currentId = 'busy_stop';
      const sp = [];
      for (let i = 0; i < 7; i++) sp.push(resolveNpc({ id: 'evt_' + i, npc: { disposition: 'trader', species: null } }).species);
      const lay = [];
      STATE.currentId = 'stop2';
      lay.push(resolveNpc({ id: 'e1', npc: { disposition: 'drifter', species: null } }).species);
      lay.push(resolveLayerNpc({ disposition: 'station_crew', job: 'engineer' }, 'e1', 'l1').species);
      lay.push(resolveLayerNpc({ disposition: 'station_crew', job: 'medic' }, 'e1', 'l2').species);
      return { names, again, layerBk, pool: BARTENDER_NAMES.length, sp, lay };
    });
    ok(r.pool === 12, '12 bartender names in the pool');
    ok(new Set(r.names).size === 12, '12 stations, 12 different bartenders: ' + r.names.join(', '));
    ok(r.again === r.names[3] && r.layerBk === r.names[3], 'a bar keeps its barkeep (event + layer speaker agree)');
    ok(new Set(r.sp).size === 7, 'seven NPCs at one stop, seven species (' + r.sp.join(',') + ')');
    ok(new Set(r.lay).size === 3, 'event NPC and layer speakers at a stop never share a species (' + r.lay.join(',') + ')');
    await page.close();
  }

  console.log('— barter + surplus wares, end to end');
  {
    const page = await boot();
    const openStall = async species => {
      await page.waitForTimeout(350); // the choice column's 300ms double-click lock
      await enter(page, 'event_station_013', { species });
      await page.evaluate(() => { finishAllTyping(); [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /BROWSE THE WARES/.test(b.textContent)).click(); });
      await page.waitForTimeout(150);
      return page.evaluate(() => [...document.querySelectorAll('#market-buy-list .market-row')].map(r => ({
        name: r.querySelector('.market-row-name').textContent, cost: r.querySelector('.market-row-cost').textContent, btn: r.querySelector('.market-row-btn').textContent })));
    };
    const close = () => page.evaluate(() => { MarketModal.close(); });
    await page.evaluate(() => { STATE.items = ['fab_surplus', 'water_canister', 'suspicious_fungus']; STATE.goldAmount = 20; });
    let rows = await openStall('insect');
    const trades = rows.filter(r => r.btn === 'TRADE');
    ok(trades.length === 4, 'alien vendor: 4 barter rows (' + trades.map(r => r.name + ' ← ' + r.cost).join(' | ') + ')');
    ok(trades.some(r => r.cost === 'fabricator surplus') && trades.some(r => /4g \+ water canister/.test(r.cost)), 'item-for-item and gold+item costs');
    await shot(page, 'parity_market_barter');
    const buy = name => page.evaluate(name => { const r = [...document.querySelectorAll('#market-buy-list .market-row')].find(r => r.querySelector('.market-row-btn').textContent === 'TRADE' && r.querySelector('.market-row-name').textContent === name); r.querySelector('.market-row-btn').click(); return { items: STATE.items.slice(), gold: STATE.goldAmount }; }, name);
    let s = await buy('HULL PATCH');
    ok(s.items.includes('hull_patch') && !s.items.includes('fab_surplus') && s.gold === 20, 'HULL PATCH for the fabricator surplus: patch in, surplus out, gold untouched');
    s = await buy('FUEL CELL');
    ok(s.items.includes('fuel_cell') && !s.items.includes('water_canister') && s.gold === 16, 'FUEL CELL for 4g + water canister: cell in, water out, 4 gold spent');
    s = await buy('MEDKIT');
    ok(s.items.includes('medkit') && !s.items.includes('suspicious_fungus'), 'MEDKIT for the suspicious fungus');
    const o2 = await page.evaluate(() => { const r = [...document.querySelectorAll('#market-buy-list .market-row')].find(r => r.querySelector('.market-row-name').textContent === 'O2 CANISTER' && r.querySelector('.market-row-btn').textContent === 'TRADE'); return r.querySelector('.market-row-btn').disabled; });
    ok(o2, 'no ration brick aboard → the O2 trade is locked');
    await close();
    await page.waitForTimeout(100);
    const back = await page.evaluate(() => ({ held: document.getElementById('enc-choices').classList.contains('held'), cursor: !!document.querySelector('.enc-tw-cursor') }));
    ok(!back.held && !back.cursor, 'closing the stall repaints the layer whole (no re-typing)');
    rows = await openStall('human');
    ok(!rows.some(r => r.btn === 'TRADE'), 'human vendor: gold only, no barter rows');
    await close();
    // Surplus bin on the space trader.
    await page.evaluate(() => { STATE.goldAmount = 5; });
    await enter(page, 'event_encounter_trader_001', { nodeType: 'void', species: 'water', layer: 'misc' });
    await snap(page);
    const lockedSub = await page.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /surplus bin/i.test(b.textContent)); return b.classList.contains('locked') && b.querySelector('.ch-sub').textContent; });
    ok(lockedSub === 'Need: 8g', 'surplus bin locked when short (' + lockedSub + ')');
    await page.waitForTimeout(350); // the choice column's 300ms double-click lock
    await page.evaluate(() => { STATE.goldAmount = 20; STATE.items = []; renderEncounterState(); finishAllTyping(); [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /surplus bin/i.test(b.textContent)).click(); });
    await page.waitForTimeout(150);
    const sv = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#market-buy-list .market-row')].map(r => r.querySelector('.market-row-name').textContent + ' ' + r.querySelector('.market-row-cost').textContent), log: document.getElementById('market-log').textContent }));
    ok(sv.rows.length === 1 && sv.rows[0] === '??? 8g', 'surplus bin: one "???" box for 8g (' + sv.rows.join(',') + ')');
    ok(/it hums/.test(sv.log), 'with its own patter ("' + sv.log.slice(0, 60) + '")');
    const got = await page.evaluate(() => { document.querySelector('#market-buy-list .market-row-btn').click(); return { items: STATE.items.slice(), gold: STATE.goldAmount, def: itemDef('fab_surplus') && itemDef('fab_surplus').name }; });
    ok(got.items.join() === 'fab_surplus' && got.gold === 12, 'buying it puts a real Fabricator Surplus in the hold for 8 gold (' + got.items.join() + ', ' + got.gold + 'g)');
    await shot(page, 'parity_market_surplus');
    await close();
    await page.close();
  }

  console.log('— scripted clicks (test path) still work right after enterEvent');
  {
    const page = await boot();
    await enter(page, 'event_encounter_drifter_001', { nodeType: 'void', species: 'human' });
    const r = await page.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /Dock and say hello/.test(b.textContent)); b.click(); return STATE.layerStack.join('/'); });
    ok(r === 'intro/visit', 'a scripted click on a held choice snaps and acts at once (→ ' + r + ')');
    await page.close();
  }

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\nparity encounter: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
