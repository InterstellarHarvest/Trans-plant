// Batch 4 (final re-audit fixes) — cruise hub / map / orders / pause /
// Ship's Log / title / setup + the demo tooltip copy. Work list:
// resources/REAUDIT_CRUISE_SHELL.md (A1–A4, B1–B9 + nits), item B4 of
// REAUDIT_MINIGAMES_ENDINGS.md (tooltip copy, ruling 9) and owner
// rulings 32 (AI prefix), 46a (forced stop opens the event), 47a (map
// ??? pill). Every check reads real engine state, computed styles or
// geometry; waits are waitForFunction, never single timed samples.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const SHOTS = process.env.SHOTS || null;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function open(vp) {
  const page = await browser.newPage({ viewport: vp || { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(90000); // a loaded machine (parallel batteries) can take >30s to serve a cold page to Firefox
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor && MOD.ai_companions);
  await page.evaluate(() => localStorage.removeItem('transplant_save_v1'));
  return page;
}
async function boot(setup, vp) {
  const page = await open(vp);
  await page.evaluate(o => {
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'botanist'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
    showScreen('screen-cruise');
    document.body.classList.remove('stop-active'); document.getElementById('stop-btn').textContent = 'Stop';
    renderCruise();
  }, setup || {});
  await page.waitForFunction(() => document.getElementById('screen-cruise').classList.contains('active'));
  return page;
}
const shot = async (page, name) => { if (SHOTS) { await page.waitForTimeout(600); await page.screenshot({ path: SHOTS + '/' + name + '.png' }); } };
const WT = { timeout: 20000, polling: 50 };
const waitFor = (page, fn, arg) => page.waitForFunction(fn, arg, WT).then(h => h.jsonValue());
// A stop of the given type (random maps can lack one: borrow a plain stop).
const parkAt = (page, type, extra) => page.evaluate(({ type, extra }) => {
  let n = STATE.nodes.find(x => x.node_type === type && x.id !== STATE.currentId) || STATE.nodes.find(x => x.node_type === type);
  if (!n) { n = STATE.nodes.find(x => x.id !== STATE.currentId && !['station', 'fork'].includes(x.node_type) && x !== STATE.nodes[0] && x !== STATE.nodes[STATE.nodes.length - 1]); if (n) n.node_type = type; }
  if (!n) return null;
  STATE.currentId = n.id;
  if (extra && 'trader' in extra) { STATE.traderAt = STATE.traderAt || {}; STATE.traderAt[n.id] = extra.trader; }
  document.body.classList.remove('stop-active');
  document.getElementById('stop-btn').textContent = 'Stop';
  renderCruise();
  return n.id;
}, { type, extra });
const openStop = page => page.evaluate(() => { openStopMenu(); });
const verbRows = page => page.evaluate(() => [...document.querySelectorAll('#stop-choices .stop-choice')].map(b => ({ label: b.querySelector('.stop-choice-body').textContent, locked: b.classList.contains('locked'), tip: Tooltip.resolve(b) })));
const rectOf = (page, id) => page.evaluate(id => { const b = document.getElementById(id).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; }, id);
const overlaps = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

(async () => {
  browser = await chromium.launch();

  console.log('— A1/B1 scene alert + action banner: demo 24px, never over the station');
  {
    // Not at a station: the demo's 24px top, centred.
    const page = await boot();
    await parkAt(page, 'asteroid_field', { trader: false });
    const g = await page.evaluate(() => {
      cruiseSceneAlert('ASTEROID FIELD AHEAD — GOOD MINING', 60000);
      const a = getComputedStyle(document.getElementById('scene-alert')), b = getComputedStyle(document.getElementById('action-banner'));
      return { at: a.top, bt: b.top, atStation: document.getElementById('cruise-scene').classList.contains('at-station') };
    });
    ok(!g.atStation && g.at === '24px' && g.bt === '24px', `alert + multi-day banner at the demo's 24px (alert ${g.at}, banner ${g.bt})`);
    await page.close();
    // At a station, long alert text, two viewports (the cabinet scales; the
    // smallest supported is the 960×640 native size, and 800×533 below it).
    for (const vp of [{ width: 1280, height: 800 }, { width: 960, height: 640 }, { width: 800, height: 533 }]) {
      const p = await boot(null, vp);
      await p.evaluate(() => { const n = STATE.nodes.find(x => x.node_type === 'station'); STATE.currentId = n.id; renderCruise(); });
      const painted = await p.waitForFunction(() => document.getElementById('cruise-station').getBoundingClientRect().width > 10, null, WT).then(() => true).catch(() => false);
      ok(painted, `${vp.width}×${vp.height}: the station is in view`);
      await p.evaluate(() => cruiseSceneAlert('UNIDENTIFIED SIGNAL · PORT BOW — SOMETHING LARGE IS MOVING BEHIND THE STATION, AND IT IS NOT ON ANY MANIFEST', 60000));
      await p.waitForFunction(() => getComputedStyle(document.getElementById('scene-alert')).opacity === '1', null, WT);
      const al = await rectOf(p, 'scene-alert'), st = await rectOf(p, 'cruise-station'), sc = await rectOf(p, 'cruise-scene');
      ok(!overlaps(al, st), `${vp.width}×${vp.height}: alert (${Math.round(al.l)}–${Math.round(al.r)}, ${Math.round(al.t)}–${Math.round(al.b)}) clear of the station (${Math.round(st.l)}–${Math.round(st.r)}, ${Math.round(st.t)}–${Math.round(st.b)})`);
      ok(al.l >= sc.l && al.r <= sc.r && al.t >= sc.t, `${vp.width}×${vp.height}: alert inside the scene`);
      // The multi-day banner takes the same strip.
      await p.evaluate(() => { document.getElementById('action-banner-label').textContent = 'WAITING FOR TRADER'; document.getElementById('action-banner-counter').textContent = 'DAY 3 / 7'; document.getElementById('action-banner').classList.add('show'); });
      const bn = await rectOf(p, 'action-banner');
      ok(!overlaps(bn, st) && bn.l >= sc.l, `${vp.width}×${vp.height}: action banner clear of the station`);
      if (vp.width === 1280) await shot(p, 'b4_alert_station_1280');
      await p.close();
    }
    const css = require('fs').readFileSync(require('path').join(__dirname, '../../resources/screen-cruise.css'), 'utf8');
    ok(!/under the cruise HUD pill|just below the pill/.test(css), 'stale "HUD pill" comments gone');
  }

  console.log('— A2/A3 pause: entry count, log panel = demo');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const panelText = () => document.querySelector('.pause-content').textContent;
      STATE.shipLog = [{ day: 0, text: '◆ Seeds are IN!', voice: 'marv' }];
      PauseMenu.open();
      const one = panelText();
      PauseMenu.close();
      STATE.shipLog.push({ day: 1, text: 'Second.', voice: null });
      PauseMenu.open();
      const two = panelText();
      document.querySelector('.pause-item[data-section="log"]').click();
      const log = document.querySelector('.pause-content');
      const out = { one, two, logText: log.textContent, preview: !!log.querySelector('.pause-log-preview, .pause-log-line'), blurb: !!log.querySelector('.pause-log-blurb'), btn: [...log.querySelectorAll('button')].map(b => b.textContent) };
      PauseMenu.close();
      return out;
    });
    ok(/SHIP'S LOG\s+· 1 entry\b/.test(r.one) && !/1 entries/.test(r.one), 'welcome: "1 entry" (singular)');
    ok(/· 2 entries/.test(r.two), 'welcome: "2 entries"');
    ok(r.blurb && !r.preview && r.btn.length === 1 && /OPEN SHIP'S LOG/.test(r.btn[0]), 'log panel: blurb + OPEN button, no raw preview (demo)');
    ok(!/◆/.test(r.logText) && !/D0 ·/.test(r.logText), 'no ◆ marker / "D0 ·" preview leaks');
    ok(!(await page.evaluate(() => [...document.styleSheets].some(ss => { try { return [...ss.cssRules].some(x => /pause-log-preview|pause-log-line/.test(x.selectorText || '')); } catch (_) { return false; } }))), 'preview CSS removed (nothing orphaned)');
    await page.close();
  }

  console.log('— A4 log outcome text starts with a capital (template fill)');
  {
    const page = await boot({ ai: 'aria' });
    const r = await page.evaluate(() => {
      const f = ShipLog.fill;
      const a = f('{line} {effects}. It will not last.', { line: '', effects: 'nothing aboard changed' });
      const b = f('{line} {effects}. As calculated.', { line: 'The light went out…', effects: 'nothing aboard changed' });
      const c = f('{title}: chose “{choice}”.', { title: 'odd signal', choice: 'Go' });
      // A real record: an outcome that changes nothing, with no narrative.
      const n0 = STATE.shipLog.length;
      const rec = ShipLog.begin();
      ShipLog.resolved(rec, { title: 'Quiet Drift' }, { text: 'Watch the viewport' }, { narrative: '' });
      const added = STATE.shipLog.slice(n0).map(e => e.text);
      return { a, b, c, added };
    });
    ok(r.a === 'Nothing aboard changed. It will not last.', 'empty {line}: "' + r.a + '"');
    ok(/… Nothing aboard changed\./.test(r.b), 'after a cut line: "' + r.b + '"');
    ok(/^Odd signal/.test(r.c), 'a token opening the template is raised too: "' + r.c + '"');
    const out = r.added[r.added.length - 1] || '';
    ok(r.added.length >= 1 && /^[A-Z]/.test(out) && !/(^|[.!?] )nothing aboard/.test(out), 'real no-change outcome entry: "' + out + '"');
    await page.close();
  }

  console.log('— B2/B3/B4 + nits: ship glow, Stop pulse, square AI avatar, crop stage, day marker, CRT');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const cs = id => getComputedStyle(document.getElementById(id));
      cruiseSceneAlert('TEST', 60000);
      const av = document.querySelector('#cruise-aidialog .ai-avatar');
      const mk = document.querySelector('#ai-log .ai-day-marker');
      return {
        glow: cs('ship-silhouette').filter,
        pulse: getComputedStyle(document.getElementById('screen-cruise')).getPropertyValue('--stop-pulse-color').trim(),
        anim: cs('stop-btn').animationName,
        avRad: av && getComputedStyle(av).borderRadius,
        avW: av && av.getBoundingClientRect().width / (document.getElementById('game').getBoundingClientRect().width / 960),
        cropShadow: cs('crop-stage').textShadow,
        mkLH: mk && getComputedStyle(mk).lineHeight,
        crt: getComputedStyle(document.getElementById('crt-overlay')).backgroundImage,
      };
    });
    ok(/rgba\(127, 127, 92, 0\.25\)/.test(r.glow), 'ship glow alpha .25 (' + r.glow + ')');
    ok(r.pulse.toUpperCase() === '#44AE3E' && r.anim === 'stop-pulse', 'Stop pulse #44AE3E (' + r.pulse + ', ' + r.anim + ')');
    const pulseCol = await waitFor(page, () => /rgb\(68, 174, 62\)/.test(getComputedStyle(document.getElementById('stop-btn')).boxShadow) && getComputedStyle(document.getElementById('stop-btn')).boxShadow).catch(() => false);
    ok(!!pulseCol, 'the pulse glows in rgb(68,174,62)');
    ok(r.avRad === '0px' && Math.round(r.avW) === 32, 'AI avatar square, 32px (radius ' + r.avRad + ')');
    ok(/rgba\(200, 168, 90, 0\.25\) 0px 0px 4px/.test(r.cropShadow), '.crop-stage text-shadow (' + r.cropShadow + ')');
    ok(r.mkLH === '9.45px', 'day marker line-height 9.45px (' + r.mkLH + ')');
    ok(/rgba\(0, 0, 0, 0\.05\)/.test(r.crt), 'cruise CRT scanlines 5%');
    const crt = await page.evaluate(() => {
      const bg = () => getComputedStyle(document.getElementById('crt-overlay')).backgroundImage;
      showScreen('screen-title'); const title = bg();
      showScreen('screen-setup'); const setup = bg();
      showScreen('screen-encounter'); const enc = bg();
      showScreen('screen-cruise');
      return { title, setup, enc };
    });
    ok(/rgba\(0, 0, 0, 0\)/.test(crt.title), 'title: no whole-frame CRT lines (ruling 113: the painting is never textured)');
    ok(/rgba\(0, 0, 0, 0\.05\)/.test(crt.setup), 'setup CRT scanlines 5%');
    ok(/rgba\(0, 0, 0, 0\.06\)/.test(crt.enc), 'encounter keeps its demo 6%');
    await page.close();
  }

  console.log('— B5 hidden verbs (demo hideWhen) + locked Need rows');
  {
    const page = await boot();
    await page.evaluate(() => { const n = STATE.nodes.find(x => x.node_type === 'station'); STATE.currentId = n.id; document.body.classList.remove('stop-active'); renderCruise(); });
    await page.evaluate(() => { STATE.resources.hull = resMax('hull'); STATE.fabricator = { wear: 0, broken: false }; STATE.crew.forEach(r => setHP(r, 100)); });
    await openStop(page);
    let v = await verbRows(page);
    const labels = v.map(x => x.label);
    ok(!labels.includes('REPAIR') && !labels.includes('DRYDOCK'), 'intact hull: REPAIR and DRYDOCK not offered (' + labels.join(', ') + ')');
    ok(!labels.includes('FAB SERVICE'), 'fabricator good as new: FAB SERVICE not offered');
    const hurt = await page.evaluate(() => { try { return !!document.querySelector('#stop-choices [data-verb-id="medbay"]'); } catch (e) { return e.message; } });
    ok(hurt === false, 'nobody hurt: MEDBAY not offered');
    ok(labels.includes('REST') && labels.includes('FABRICATOR'), 'REST and FABRICATOR stay in reach');
    // A dented hull with no metal: REPAIR is back, locked, Need rows.
    await page.evaluate(() => { STATE.resources.hull = 50; STATE.materials = Object.assign({}, STATE.materials, { metal: 0, scrap: 0 }); STATE.goldAmount = 0; openStopMenu(); });
    v = await verbRows(page);
    const rep = v.find(x => x.label === 'REPAIR'), dry = v.find(x => x.label === 'DRYDOCK');
    ok(rep && rep.locked && rep.tip && rep.tip.tone === 'danger' && rep.tip.title === 'LOCKED — REPAIR' && rep.tip.rows.map(x => x.label + ' ' + x.value).join('; ') === 'Need 2 metal; Need 1 scrap', 'REPAIR locked: danger tip, Need rows (' + (rep && rep.tip && rep.tip.rows.map(x => x.label + ' ' + x.value).join('; ')) + ')');
    ok(dry && dry.locked && dry.tip.rows.length === 1 && /^Need \d+ gold$/.test(dry.tip.rows[0].label + ' ' + dry.tip.rows[0].value), 'DRYDOCK locked on gold: "' + (dry && dry.tip.rows.map(x => x.label + ' ' + x.value).join()) + '"');
    await page.evaluate(() => { STATE.materials.metal = 5; STATE.materials.scrap = 5; openStopMenu(); });
    v = await verbRows(page);
    ok(v.find(x => x.label === 'REPAIR' && !x.locked), 'with materials: REPAIR offered, unlocked');
    // A lock that is not a need just says why (no Need rows).
    const t = await page.evaluate(() => cruiseLockTip('REST', 'The crew is in good spirits'));
    ok(t.rows.length === 0 && t.description === 'The crew is in good spirits.' && t.tone === 'danger', 'non-need lock: reason only');
    await shot(page, 'b4_station_stopmenu');
    await page.close();
  }

  console.log('— B6 orders: one ▶ line per change, demo wording');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const n0 = STATE.shipLog.length;
      openOrders();
      closeOrders('apply'); // nothing changed
      const none = STATE.shipLog.length - n0;
      const pace = ORDERS_PACE.findIndex(p => p.id === 'ludicrous'), rat = ORDERS_RATIONS.findIndex(x => x.id === 'pigout');
      openOrders();
      // drive the modal the way the player does: the pace / rations pills
      const pills = [...document.querySelectorAll('#overlay-orders [data-idx], #overlay-orders .pill')];
      return { none, pace, rat, pills: pills.length };
    });
    ok(r.none === 0, 'APPLY with no change logs nothing');
    // Set the preview through the real controls when present, else the model.
    await page.evaluate(() => {
      const click = (grp, name) => { const b = [...document.querySelectorAll('#overlay-orders button, #overlay-orders [role=button], #overlay-orders .od-pill, #overlay-orders .pill')].find(x => x.closest('[id$=' + grp + '-pills]') && new RegExp(name, 'i').test(x.textContent)); if (b) b.click(); return !!b; };
      window.__clicked = [click('engines', 'LUDICROUS'), click('rations', 'PIG')];
    });
    const n0 = await page.evaluate(() => STATE.shipLog.length);
    const lines = await page.evaluate(n0 => { closeOrders('apply'); return { lines: STATE.shipLog.slice(n0).map(e => e.text).filter(t => /^▶ (ENGINES|RATIONS|WATER)/.test(t)), clicked: window.__clicked, o: Object.assign({}, STATE.orders) }; }, n0);
    if (lines.clicked.every(Boolean)) {
      ok(lines.lines.join(' | ') === '▶ ENGINES set to LUDICROUS SPEED. | ▶ RATIONS set to PIG OUT.', 'two changes → two lines: ' + lines.lines.join(' | '));
    } else ok(false, 'could not drive the orders pills (' + lines.clicked + ')');
    // The water split through the real track (a real pointer press).
    const tr = await page.evaluate(() => { window.__n0 = STATE.shipLog.length; openOrders(); window.__was = STATE.orders.waterSplit; const r = document.getElementById('od-water-track').getBoundingClientRect(); return { x: r.left + r.width * 0.7, y: r.top + r.height / 2 }; });
    await page.waitForFunction(() => getComputedStyle(document.getElementById('overlay-orders')).opacity === '1', null, WT);
    await page.mouse.move(tr.x, tr.y); await page.mouse.down(); await page.mouse.up();
    const w = await page.evaluate(() => { closeOrders('apply'); return { was: window.__was, now: STATE.orders.waterSplit, lines: STATE.shipLog.slice(window.__n0).map(e => e.text).filter(t => /^▶ (ENGINES|RATIONS|WATER)/.test(t)) }; }); // (an arrival scene alert may land meanwhile)
    ok(w.now !== w.was && w.lines.length === 1 && w.lines[0] === '▶ WATER split → ' + w.now + '% plant / ' + (100 - w.now) + '% crew.', 'water change: ' + w.lines.join(' | '));
    const col = await page.evaluate(() => [...document.querySelectorAll('#ai-log .ai-entry')].slice(-6).map(e => e.textContent));
    ok(col.some(t => t === '▶ ENGINES set to LUDICROUS SPEED.'), 'the hub log shows them as ▶ lines');
    await page.close();
  }

  console.log('— B7 log payload entries + link pauses the game');
  {
    const page = await boot();
    await page.evaluate(() => { window.__opened = []; window.open = (u, t, f) => { window.__opened.push([u, t, f]); return null; }; });
    const r = await page.evaluate(() => {
      pushCruiseLog({ text: '◆ The route is named for a painter known for diners.', link: { url: 'https://example.org/rockwell', label: 'Learn more' } }, { ai: true, instant: true });
      const e = [...document.querySelectorAll('#ai-log .ai-entry')].pop();
      const icon = e.lastElementChild;
      return { cls: e.className, last: icon && icon.className, icon: icon && icon.textContent, anchors: e.querySelectorAll('a').length, cursor: getComputedStyle(e).cursor, hand: getComputedStyle(document.documentElement).getPropertyValue('--cursor-hand').trim().slice(0, 20) };
    });
    ok(/has-payload/.test(r.cls) && r.last === 'ai-entry-payload' && r.icon === '\u{1F517}' && r.anchors === 0, 'link entry: whole entry is the control, 🔗 at the end (no separate "Learn more")');
    ok(r.cursor !== 'auto' && r.cursor !== 'text' && r.cursor !== 'default', 'hand cursor on the entry');
    const box = await page.evaluate(() => { const e = [...document.querySelectorAll('#ai-log .ai-entry')].pop(); e.scrollIntoView(); const b = e.getBoundingClientRect(); return { x: b.left + 20, y: b.top + 6 }; });
    await page.mouse.move(box.x, box.y);
    const hov = await waitFor(page, () => { const e = [...document.querySelectorAll('#ai-log .ai-entry')].pop(); const s = getComputedStyle(e); return s.textDecorationLine === 'underline' && { line: s.textDecorationLine, col: s.textDecorationColor, op: s.opacity }; }).catch(() => null);
    ok(hov && /rgba\(200, 168, 90, 0\.5\)/.test(hov.col) && hov.op === '1', 'hover: full opacity + gold underline (' + JSON.stringify(hov) + ')');
    await page.mouse.click(box.x, box.y);
    const c = await waitFor(page, () => window.__opened.length && { opened: window.__opened[0], paused: PauseBus.paused, menu: PauseMenu.isOpen() });
    ok(c.opened[0] === 'https://example.org/rockwell' && c.opened[1] === '_blank', 'click opens the link in a new tab');
    ok(c.paused && c.menu, 'opening a link pauses the game (Bridge Terminal up, PauseBus paused)');
    await page.evaluate(() => PauseMenu.close());
    // Expand payload: the whole entry opens its page in the journal.
    const x = await page.evaluate(() => {
      pushCruiseLog({ text: '◆ A long thought about ferns.', expand: { title: 'FERNS', text: 'Long text.', kind: 'lore' } }, { ai: true, instant: true });
      const e = [...document.querySelectorAll('#ai-log .ai-entry')].pop();
      const out = { icon: e.lastElementChild && e.lastElementChild.textContent, cls: e.className };
      e.firstChild.parentElement.click();
      return out;
    });
    const opened = await waitFor(page, () => document.getElementById('overlay-shipslog').classList.contains('active') && document.getElementById('slog-expand-title').textContent).catch(() => null);
    ok(x.icon === '\u{1F4D6}' && /has-payload/.test(x.cls) && opened === 'FERNS', 'expand entry: 📖 at the end, the entry opens its page (' + opened + ')');
    // Rebuilt column (a load) carries the same chrome.
    const rb = await page.evaluate(() => { rebuildCruiseLog(8); const es = [...document.querySelectorAll('#ai-log .ai-entry.has-payload')]; return es.map(e => e.lastElementChild && e.lastElementChild.textContent); });
    ok(rb.includes('\u{1F517}') && rb.includes('\u{1F4D6}'), 'rebuildCruiseLog keeps 🔗 / 📖 at the end');
    await shot(page, 'b4_log_payloads');
    await page.close();
  }

  console.log('— B8 setup Back/Next: 32px, chevron rule, demo disabled look');
  {
    // The demo's own button height in this browser (Chromium 32, Firefox 33 — VT323 metrics).
    const dp = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    dp.setDefaultTimeout(90000);
    await dp.goto(URL.replace(/index\.html.*$/, 'resources/demo-setup.html'));
    const demoH = await dp.waitForFunction(() => { const b = [...document.querySelectorAll('.panel-btn')].find(x => /Next/.test(x.textContent)); return b && document.fonts.status === 'loaded' && b.offsetHeight; }, null, WT).then(h => h.jsonValue());
    await dp.close();
    const page = await open();
    await page.evaluate(() => { startNewGame(); });
    await page.waitForFunction(() => document.getElementById('screen-setup').classList.contains('active') && document.getElementById('btn-next'));
    const r = await waitFor(page, () => {
      const b = document.getElementById('btn-back'), n = document.getElementById('btn-next');
      if (!b.getBoundingClientRect().height) return false;
      const k = document.getElementById('game').getBoundingClientRect().width / 960;
      const cs = getComputedStyle(n), ch = n.querySelector('.chevron');
      if (document.fonts.status !== 'loaded') return false;
      return { bh: b.getBoundingClientRect().height / k, nh: n.getBoundingClientRect().height / k, dis: n.classList.contains('disabled'), op: cs.opacity, filter: cs.filter, color: cs.color, border: cs.borderTopColor + ' ' + cs.borderBottomColor, chFs: ch && getComputedStyle(ch).fontSize, chLh: ch && getComputedStyle(ch).lineHeight };
    });
    ok(Math.round(r.bh) === demoH && Math.round(r.nh) === demoH && demoH <= 33, `Back ${r.bh.toFixed(1)}px / Next ${r.nh.toFixed(1)}px = demo ${demoH}px (32 in Chromium)`);
    ok(r.chFs === '14px' && r.chLh === '14px', 'chevron 14px, line-height 1');
    ok(r.dis && r.op === '0.4' && r.filter === 'none' && r.color === 'rgb(90, 90, 90)' && r.border === 'rgb(58, 58, 58) rgb(26, 26, 26)', 'disabled Next: opacity .4, grey bevel, grey text, no filter (' + [r.op, r.filter, r.color, r.border].join(' / ') + ')');
    const shake = await page.evaluate(() => { const n = document.getElementById('btn-next'); n.click(); return n.classList.contains('shake'); });
    ok(shake, 'a click on the disabled Next still shakes it (the hint at what is missing)');
    await shot(page, 'b4_setup_footer');
    await page.close();
  }

  console.log('— 47a map ??? pill (uncharted): cream text, red border');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      // A real uncharted branch: a fork's child marked branch_hidden, the fork reached.
      const fork = STATE.nodes.find(f => connectionsOf(f).length > 1);
      if (!fork) return { skip: true };
      const child = STATE.byId[connectionsOf(fork)[0]];
      child.branch_hidden = true;
      STATE.visited.add(fork.id);
      const d = branchFlavorDisplay(child);
      document.getElementById('btn-map').click();
      const pill = [...document.querySelectorAll('.map-branch-flavor.uncharted')][0];
      const cs = pill && getComputedStyle(pill);
      return { d, n: !!pill, color: cs && cs.color, border: cs && cs.borderTopColor, text: pill && pill.textContent };
    });
    if (r.skip) ok(true, 'no fork on this map (skipped)');
    else {
      ok(r.d.state === 'uncharted' && r.n && /(^|· )\?\?\?$/.test(r.text), 'uncharted branch reads ??? on the map (after its lane name)');
      ok(r.color === 'rgb(211, 196, 140)' && r.border === 'rgba(204, 51, 51, 0.4)', '??? pill cream #d3c48c, red border (' + r.color + ' / ' + r.border + ')');
    }
    await shot(page, 'b4_map');
    await page.close();
  }

  console.log('— tooltip copy (ruling 9, demo-tooltip): Per day, Lowest, crop healthy, quote, Need');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const row = (t, l) => { const x = (t.rows || []).find(y => y.label === l); return x ? x.value : null; };
      const T = k => Tooltip.get(k)();
      const d = dailyDraw(), leg = legTravelCost();
      const tf = T('resource_food'), tw = T('resource_water'), to = T('resource_o2'), tu = T('resource_fuel'), th = T('resource_hull');
      setCrewMorale(70); setCrewMorale(18, 'botanist');
      const mo = T('resource_morale');
      // healthy crop
      STATE.cropGrowth.health = 95; STATE.cropGrowth.growth = 20;
      const ch = T('crop_health');
      STATE.cropGrowth.health = 30;
      const cs = T('crop_health');
      return {
        food: row(tf, 'Per day'), foodWant: String(Math.round(d.food * 100) / 100),
        water: row(tw, 'Per day'), waterWant: String(Math.round(d.water * 100) / 100),
        o2: row(to, 'Per day'), o2Want: String(Math.round(d.o2 * 100) / 100),
        fuel: row(tu, 'Per day'), fuelWant: String(Math.round(leg.fuel / leg.exactDays * 100) / 100) + ' in flight',
        hull: row(th, 'Per day'), cur: row(tf, 'Current'),
        moAvg: row(mo, 'Average'), moLow: row(mo, 'Lowest'), botName: crewNameOf('botanist'),
        ch, cs, maturity: cropMetaOf(STATE.crop).maturity_days,
        factor: cropGrowthFactorAt(STATE.cropGrowth.waterPlant),
      };
    });
    ok(r.food === r.foodWant && r.water === r.waterWant && r.o2 === r.o2Want && r.cur, `Per day rows = the engine's real draw (food ${r.food}, water ${r.water}, O2 ${r.o2})`);
    ok(r.fuel === r.fuelWant, 'fuel: per day in flight = next leg fuel / days (' + r.fuel + ')');
    ok(r.hull === null, 'hull has no daily draw → no Per day row');
    ok(r.moAvg === Math.round((70 + 18) / 2) + ' / 100' && r.moLow === r.botName + ' 18', `morale: Average ${r.moAvg}, Lowest ${r.moLow}`);
    // real per-day growth at health 95
    ok(r.ch.tone === 'good' && r.ch.title === 'CROP — HEALTHY' && /^\+\d+\.\d\d\/day$/.test(r.ch.rows.find(x => x.label === 'Growth').value) && r.ch.rows.find(x => x.label === 'Health').value === '95 / 100', 'healthy crop: good tone, Health + Growth/day (' + r.ch.rows.map(x => x.label + ' ' + x.value).join('; ') + ')');
    ok(r.cs.tone !== 'good' && !r.cs.title, 'an ailing crop is not called healthy');
    // Per day decreases when the draw does (no decorative number): O2 recycler halves O2.
    const o2r = await page.evaluate(() => { const a = Tooltip.get('resource_o2')().rows.find(x => x.label === 'Per day').value; STATE.items.push('o2_recycler'); const b = Tooltip.get('resource_o2')().rows.find(x => x.label === 'Per day').value; const r0 = STATE.resources.o2; passDays(1); return { a, b, spent: Math.round((r0 - STATE.resources.o2) * 100) / 100 }; });
    // (the row shows two decimals: 0.55 halves to 0.275, shown 0.28)
    ok(Math.abs(Number(o2r.b) - Number(o2r.a) / 2) <= 0.0051 && Math.abs(o2r.spent - Number(o2r.a) / 2) < 0.011, `O2 recycler: Per day ${o2r.a} → ${o2r.b}; a day really spends ${o2r.spent}`);
    // AI quip while stopped: the speech bubble over the ship (ruling 91), voiced.
    await page.evaluate(() => { openStopMenu(); });
    const q = await page.evaluate(() => { pushCruiseLog('Test quip about the ferns.', { ai: true }); const b = document.getElementById('ai-bubble');
      return { show: b.classList.contains('show'), name: b.querySelector('.ai-bubble-name').textContent, text: b.querySelector('.ai-bubble-lines').textContent }; });
    ok(q.show && q.name === 'MARV' && /Test quip about the ferns\./.test(q.text), 'stopped: an AI quip shows in the bubble under MARV (ruling 91)');
    await page.close();
  }

  console.log('— ruling 32: no "NAME:" when the line names the AI or "the ship computer"');
  {
    const page = await boot({ ai: 'aria' });
    const r = await page.evaluate(() => {
      const L = (t, v) => cruiseDisplayLine(t, v);
      const out = {
        self: L('ARIA has been teaching the fabricator knock-knock jokes!', 'aria'),
        other: L('MARV would have hated this.', 'aria'),
        comp: L('◆ The ship computer has asked her to stop.', 'aria'),
        compLow: L('Someone asked the ship computer for a hug.', 'aria'),
        plain: L('The crop has been planted!', 'aria'),
        chips: L('The rocks here pay in chips.', 'aria'),
        sys: L('◆ ENGINES set to PLAID.', null),
      };
      pushCruiseLog('ARIA notes the ferns are thriving.', { ai: true, instant: true });
      out.col = [...document.querySelectorAll('#ai-log .ai-entry')].pop().textContent;
      pushCruiseLog('The ferns are thriving.', { ai: true, instant: true });
      out.col2 = [...document.querySelectorAll('#ai-log .ai-entry')].pop().textContent;
      rebuildCruiseLog(8);
      out.rb = [...document.querySelectorAll('#ai-log .ai-entry')].slice(-2).map(e => e.textContent);
      return out;
    });
    ok(r.self === 'ARIA has been teaching the fabricator knock-knock jokes!', 'names the active AI: no prefix');
    ok(r.other === 'MARV would have hated this.', 'names another of the five: no prefix');
    ok(r.comp === 'The ship computer has asked her to stop.' && r.compLow === 'Someone asked the ship computer for a hug.', '"the ship computer": no prefix');
    ok(r.plain === 'ARIA: The crop has been planted!' && r.chips === 'ARIA: The rocks here pay in chips.', 'otherwise the voice prefix stays ("chips" is not CHIP)');
    ok(r.sys === '▶ ENGINES set to PLAID.', 'system lines keep ▶');
    ok(r.col === 'ARIA notes the ferns are thriving.' && r.col2 === 'ARIA: The ferns are thriving.', 'live log column applies it');
    ok(r.rb.join(' | ') === 'ARIA notes the ferns are thriving. | ARIA: The ferns are thriving.', 'rebuilt column (load) applies it too');
    // ticker while stopped
    await page.evaluate(() => openStopMenu());
    const t = await page.evaluate(() => { document.getElementById('ai-bubble').click(); pushCruiseLog('The ship computer has a question.', { ai: true }); const b = document.getElementById('ai-bubble'); return { name: b.querySelector('.ai-bubble-name').style.display, text: b.querySelector('.ai-bubble-lines').textContent }; });
    ok(t.name === 'none' && t.text === 'The ship computer has a question.', 'the bubble: no name chip either (' + t.text + ')');
    await page.close();
  }

  console.log('— ruling 46a: forced stop opens the event after the flash (no one-verb menu)');
  {
    const page = await boot();
    await parkAt(page, 'asteroid_field', { trader: false });
    await openStop(page);
    await page.evaluate(() => {
      window.__labels = new Set();
      new MutationObserver(() => document.querySelectorAll('#stop-choices .stop-choice-body').forEach(b => window.__labels.add(b.textContent))).observe(document.getElementById('stop-choices'), { childList: true, subtree: true });
      window.__rnd = Math.random; Math.random = () => 0.01;
      [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /^REST/.test(b.textContent)).click();
      [...document.querySelectorAll('.day-step')][3].click();
    });
    const fl = await waitFor(page, () => document.getElementById('wait-flash').classList.contains('show') && { flash: document.querySelector('#wait-flash .wait-flash-label').textContent, forced: !!STATE.forcedEvent, red: document.body.classList.contains('event-active') }).catch(() => null);
    ok(fl && fl.flash === 'PIRATE INBOUND' && fl.forced && fl.red, 'alert flash with the red forced state');
    const rb = await page.evaluate(() => { const at = STATE.currentId; const f = !!STATE.forcedEvent; document.getElementById('stop-btn').click(); return { f, moved: STATE.currentId !== at, shaking: document.getElementById('screen-cruise').classList.contains('shaking'), ev: !!STATE.currentEvent }; });
    ok(!rb.f || (!rb.moved && rb.shaking && !rb.ev), 'Resume during the flash: blocked, the screen shakes');
    const warn = await waitFor(page, () => { const t = [...document.querySelectorAll('#header-ticker .ticker-text:not(.exit)')].pop(); return (t && t.textContent === 'CANNOT RESUME — HANDLE EVENT FIRST') || !!STATE.currentEvent; }).catch(() => false);
    ok(!!warn, 'CANNOT RESUME on the ticker');
    const ev = await waitFor(page, () => STATE.currentEvent && { id: STATE.currentEvent.id, forced: STATE.forcedEvent, scr: document.querySelector('.screen.active').id, red: document.body.classList.contains('event-active') });
    ok(/^(event_encounter_pirate_00\d|event_general_003)$/.test(ev.id) && !ev.forced && ev.scr === 'screen-encounter' && !ev.red, 'the event opens on its own after the flash (a pirate of the family: ' + ev.id + ')');
    const labels = await page.evaluate(() => [...window.__labels]);
    ok(!labels.some(l => /HAIL BACK|ANSWER THE CALL|INVESTIGATE/.test(l)), 'no resolve verb was ever offered (' + labels.join(', ') + ')');
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../engine/js/screens/cruise.js'), 'utf8');
    ok(!/HAIL BACK|ANSWER THE CALL|verb: 'INVESTIGATE'/.test(src), 'dead verb code deleted (no HAIL BACK / ANSWER THE CALL / INVESTIGATE defs)');
    await page.evaluate(() => { Math.random = window.__rnd; });
    await page.close();
  }

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
