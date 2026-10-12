// Demo parity — cruise hub + crew dossier (2026-10-11, owner-approved).
// Canon: resources/demo-cruise.html, demo-crew.html, starfield-demo.html,
// GAME_BIBLE §18. Every check reads real STATE or computed styles:
// captain sprite + role labels, crop READY/HARVEST (a real harvest), the
// LED, DAY n/m + overdue, the log's scroll guard / day markers / 35ms
// typewriter / ▶ vs voice lines, the ticker per state, the day counter
// staying up while stopped (ruling 17, was TIME PAUSED), bob
// halt, stop pulse, scene alerts, the warp starfield vs pace and Stop,
// the trader presence roll + TRADE/WAIT swap, multi-day WAIT/REST (days
// passed, cancel = wasted days, results, interrupts that open real
// events, the forced state blocking Resume), the LOG button, verb time
// labels, readout icons, resource-bar sizes, the alien planet region,
// the epitaph splitter ("Dr."), airlock epitaphs, the dossier moving on
// to the next crew member, the crew modal's Cost line and fade.
// SHOTS=<dir> saves screenshots for an eye comparison with the demo.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const SHOTS = process.env.SHOTS || null;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor);
  await page.evaluate(() => localStorage.removeItem('transplant_save_v1'));
  return page;
}
async function boot(setup) {
  const page = await open();
  await page.evaluate(o => {
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'botanist'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
    renderCruise();
  }, setup || {});
  await page.waitForTimeout(200);
  return page;
}
const shot = async (page, name) => { if (SHOTS) await page.waitForTimeout(600); if (SHOTS) await page.screenshot({ path: SHOTS + '/' + name + '.png' }); };
// Park the ship at the first node of a type (a fresh hub there, cruising).
const parkAt = (page, type, extra) => page.evaluate(({ type, extra }) => {
  const n = STATE.nodes.find(x => x.node_type === type && x.id !== STATE.currentId) || STATE.nodes.find(x => x.node_type === type);
  if (!n) return null;
  STATE.currentId = n.id;
  if (extra && 'trader' in extra) { STATE.traderAt = STATE.traderAt || {}; STATE.traderAt[n.id] = extra.trader; }
  document.body.classList.remove('stop-active');
  document.getElementById('stop-btn').textContent = 'Stop';
  renderCruise();
  return n.id;
}, { type, extra });
const openStop = page => page.evaluate(() => { if (!document.body.classList.contains('stop-active')) document.getElementById('stop-btn').click(); });
const verbs = page => page.evaluate(() => [...document.querySelectorAll('#stop-choices .stop-choice')].map(b => ({ label: b.querySelector('.stop-choice-body').textContent, cls: b.className, text: b.textContent })));
const clickVerb = (page, re) => page.evaluate(src => { const b = [...document.querySelectorAll('#stop-choices .stop-choice')].find(x => new RegExp(src).test(x.querySelector('.stop-choice-body').textContent)); if (b) b.click(); return !!b; }, re.source);
const ticker = page => page.evaluate(() => { const els = [...document.querySelectorAll('#header-ticker .ticker-text:not(.exit)')]; const el = els[els.length - 1]; if (!el) return null; const cs = getComputedStyle(el); return { text: el.textContent, cls: el.className, color: cs.color, anim: cs.animationName, transition: cs.transitionDuration + ' ' + cs.transitionProperty }; });

(async () => {
  browser = await chromium.launch();

  console.log('— captain card + role labels');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const slots = [...document.querySelectorAll('#crew-strip .crew-slot')];
      const icon = slots[0].querySelector('.crew-icon');
      return { n: slots.length, bg: getComputedStyle(icon).backgroundImage, id: icon.getAttribute('data-crew-id'), names: slots.map(s => s.querySelector('.crew-name').textContent), roles: slots.map(s => s.querySelector('.crew-role').textContent), emoji: slots[0].textContent.includes('\u{1F464}') };
    });
    ok(r.id === 'captain' && /captain_icon\.png/.test(r.bg), 'captain card shows the captain sprite (' + r.bg.slice(-40) + ')');
    ok(!r.emoji, 'no 👤 placeholder on the captain card');
    ok(r.names[0] === 'CAPTAIN' && r.names[1] === 'KAZUKI', 'names: ' + r.names.join(', '));
    ok(r.roles.join(',') === 'Veteran,Engineer,Botanist', 'roles capitalised: ' + r.roles.join(', '));
    const bot = await boot({ captain: 'botanist', crew: ['botanist', 'engineer'] });
    const b = await bot.evaluate(() => getComputedStyle(document.querySelector('#crew-strip .crew-slot .crew-icon')).backgroundImage);
    ok(/captain_icon\.png/.test(b) && !/osei/.test(b), 'a botanist captain is not drawn as Dr. Osei');
    await bot.close();
    await shot(page, '01_cruise_normal');
    await page.close();
  }

  console.log('— ticker states, day counter stays (ruling 17), bob halt, stop pulse');
  {
    const page = await boot();
    await page.waitForTimeout(700);
    let t = await ticker(page);
    const nextName = await page.evaluate(() => { const ids = [...nextAvailableNodes()]; return ids.length === 1 ? STATE.byId[ids[0]].name.toUpperCase() : null; });
    ok(t && t.text === 'COMING UP ON ' + nextName, 'normal: "' + (t && t.text) + '"');
    ok(t && t.color === 'rgb(53, 198, 191)' && !/event/.test(t.cls), 'normal line is teal, no pulse (' + (t && t.color) + ')');
    ok(t && /0\.55s/.test(t.transition) && /transform/.test(t.transition), 'slide replace: transform 0.55s (' + (t && t.transition) + ')');
    const st0 = await page.evaluate(() => ({ dc: getComputedStyle(document.getElementById('day-counter')).opacity, pl: !!document.getElementById('paused-label'), bob: getComputedStyle(document.getElementById('ship-silhouette')).animationPlayState, btn: getComputedStyle(document.getElementById('stop-btn')).animationName }));
    ok(st0.dc === '1' && !st0.pl, 'cruising: day counter shown, no TIME PAUSED label (ruling 17)');
    ok(st0.bob === 'running', 'cruising: ship bobs');
    await openStop(page);
    await page.waitForTimeout(150);
    const exiting = await page.evaluate(() => document.querySelectorAll('#header-ticker .ticker-text.exit').length);
    ok(exiting === 1, 'the old line slides out (.exit) as STOPPED slides in');
    await page.waitForTimeout(500);
    t = await ticker(page);
    ok(t && /^STOPPED/.test(t.text) && /event-info/.test(t.cls) && t.color === 'rgb(255, 172, 0)' && t.anim === 'ticker-event-pulse', 'Stop: amber pulsing ' + (t && t.text));
    const st1 = await page.evaluate(() => ({ dc: getComputedStyle(document.getElementById('day-counter')).opacity, dcText: document.getElementById('day-counter').textContent, header: document.getElementById('cruise-header').textContent, bob: getComputedStyle(document.getElementById('ship-silhouette')).animationPlayState, btn: getComputedStyle(document.getElementById('stop-btn')).animationName, label: document.getElementById('stop-btn').textContent }));
    ok(st1.dc === '1' && /^DAY \d+ · \d+ LEFT$/.test(st1.dcText), 'stopped: the day counter stays up (' + st1.dcText + ', ruling 17)');
    ok(!/TIME PAUSED/.test(st1.header), 'stopped: no TIME PAUSED in the header (STOPPED in the ticker is the signal)');
    ok(st1.bob === 'paused', 'stopped: ship-bob halted');
    ok(st1.btn === 'stop-pulse' && st1.label === 'Resume', 'stopped: Resume button pulses (stop-pulse)');
    // AI quip while stopped → the ticker, voiced, amber; still logged.
    await page.evaluate(() => pushCruiseLog('◆ Test quip about the ferns.', { ai: true }));
    await page.waitForTimeout(650);
    t = await ticker(page);
    ok(t && t.text === 'MARV: Test quip about the ferns.' && /event-info/.test(t.cls), 'stopped: AI quip goes up as "MARV: …" (' + (t && t.text) + ')');
    ok(await page.evaluate(() => /MARV: Test quip about the ferns\./.test(document.getElementById('ai-log').textContent)), '…and still lands in the log');
    // Leaving the stopped state restores that state's own line.
    await page.evaluate(() => { document.body.classList.remove('stop-active'); renderCruise(); });
    await page.waitForTimeout(650);
    t = await ticker(page);
    ok(t && /^COMING UP ON/.test(t.text) && !/event/.test(t.cls), 'back to normal: prior line restored (' + (t && t.text) + ')');
    // Paused (pause menu) while cruising: the day counter still shows.
    await page.evaluate(() => PauseBus.pause());
    await page.waitForFunction(() => document.getElementById('screen-cruise').classList.contains('time-paused'), null, { timeout: 3000 }).catch(() => {});
    ok(await page.evaluate(() => getComputedStyle(document.getElementById('day-counter')).opacity === '1' && /^DAY \d+/.test(document.getElementById('day-counter').textContent)), 'pause menu: day counter still shown');
    await page.evaluate(() => PauseBus.resume());
    // Scene alert from real state: trader in range at a fresh stop.
    await parkAt(page, 'asteroid_field', { trader: true });
    await page.waitForFunction(() => document.getElementById('scene-alert').classList.contains('show') && document.getElementById('scene-alert').textContent === 'TRADER SHIP ON APPROACH', null, { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(600); // fade-in
    const al = await page.evaluate(() => ({ text: document.getElementById('scene-alert').textContent, show: document.getElementById('scene-alert').classList.contains('show'), op: getComputedStyle(document.getElementById('scene-alert')).opacity, color: getComputedStyle(document.getElementById('scene-alert')).color, btn: document.getElementById('stop-btn').classList.contains('alert'), anim: getComputedStyle(document.getElementById('stop-btn')).animationName, log: STATE.shipLog.slice(-3).map(e => e.text).join(' | ') }));
    ok(al.show && al.text === 'TRADER SHIP ON APPROACH' && al.color === 'rgb(255, 172, 0)', 'scene alert: TRADER SHIP ON APPROACH (amber) at a stop with a trader' + (al.show ? '' : ' [' + al.text + ' / ' + al.show + ']'));
    ok(al.btn && al.anim === 'stop-pulse', 'Stop button pulses with the alert (.alert)');
    ok(/TRADER SHIP ON APPROACH/.test(al.log), 'the alert is logged');
    await shot(page, '02_scene_alert');
    await page.close();
  }

  console.log('— warp starfield: pace, streaks, Stop');
  {
    const page = await boot();
    const speed = async pace => { await page.evaluate(p => { STATE.orders.pace = p; }, pace); await page.waitForTimeout(1600); return page.evaluate(() => cruiseStarState()); };
    let s = await speed('light');
    ok(Math.abs(s.mul - 1) < 0.05 && s.running, 'LIGHT SPEED: ×1 (' + s.mul.toFixed(2) + ')');
    s = await speed('ridiculous');
    ok(Math.abs(s.mul - 4) < 0.1, 'RIDICULOUS: ×4 (' + s.mul.toFixed(2) + ')');
    s = await speed('ludicrous');
    ok(Math.abs(s.mul - 14) < 0.3 && s.streakAt === 5, 'LUDICROUS: ×14, streaks past 5px/frame');
    s = await speed('plaid');
    ok(Math.abs(s.mul - 42) < 0.5 && s.streakAt === 2, 'PLAID: ×42, streaks past 2px/frame');
    // Streaks really draw: near-layer stars are horizontal runs.
    const streak = await page.evaluate(() => {
      const c = document.getElementById('starfield'), g = c.getContext('2d');
      const d = g.getImageData(0, 0, 960, 640).data;
      let best = 0;
      for (let y = 0; y < 640; y += 1) { let run = 0; for (let x = 0; x < 960; x++) { const a = d[(y * 960 + x) * 4 + 3]; if (a > 100) { run++; if (run > best) best = run; } else run = 0; } }
      return best;
    });
    ok(streak >= 20, 'PLAID frame has streaks (longest run ' + streak + 'px)');
    await openStop(page);
    await page.waitForTimeout(300);
    const mid = await page.evaluate(() => cruiseStarState().mul);
    ok(mid > 0 && mid < 42, 'Stop decelerates (×' + mid.toFixed(1) + ' after 0.3s, not a cut)');
    await page.waitForTimeout(1800);
    s = await page.evaluate(() => cruiseStarState());
    ok(s.mul === 0 && !s.running, 'stopped: stars at rest and the loop idles (no rAF)');
    await page.evaluate(() => { document.body.classList.remove('stop-active'); renderCruise(); });
    await page.waitForTimeout(250);
    s = await page.evaluate(() => cruiseStarState());
    ok(s.running && s.mul > 0, 'Resume (cruising again): spools back up (×' + s.mul.toFixed(1) + ')');
    await page.evaluate(() => showScreen('screen-map'));
    await page.waitForTimeout(200);
    ok(!(await page.evaluate(() => cruiseStarState().running)), 'hidden screen: the loop idles');
    await page.evaluate(() => { showScreen('screen-cruise'); PauseBus.pause(); });
    await page.waitForTimeout(200);
    ok(!(await page.evaluate(() => cruiseStarState().running)), 'PauseBus paused: the loop idles');
    await page.evaluate(() => PauseBus.resume());
    await page.waitForTimeout(200);
    ok(await page.evaluate(() => cruiseStarState().running), 'PauseBus resumed: the loop runs again');
    // Every Resume flies the leg at pace: the hub comes back decelerating.
    await page.evaluate(() => { STATE.orders.pace = 'ludicrous'; document.body.classList.add('stop-active'); window.openMining = () => {}; });
    const back = await page.evaluate(() => { const ids = [...nextAvailableNodes()]; if (ids.length !== 1) return null; document.getElementById('stop-btn').click(); return cruiseStarState().mul; });
    ok(back === null || back === 14, 'Resume arms the warp for the leg (×' + back + ')');
    await page.close();
  }

  console.log('— crop card: READY / HARVEST / LED / DAY n/m / overdue');
  {
    const page = await boot();
    const card = () => page.evaluate(() => ({
      stage: document.getElementById('crop-stage').textContent, day: document.getElementById('crop-day').textContent,
      overdue: document.getElementById('crop-day').classList.contains('overdue'), dayColor: getComputedStyle(document.getElementById('crop-day')).color,
      mature: document.getElementById('crop-card-mini').classList.contains('mature'),
      btn: getComputedStyle(document.getElementById('crop-harvest-btn')).display, btnAnim: getComputedStyle(document.getElementById('crop-harvest-btn')).animationName,
      growing: getComputedStyle(document.getElementById('crop-growing')).display,
      led: document.getElementById('crop-alert-led').classList.contains('on'), ledTitle: ((e => e.getAttribute('title') || [e.dataset.tipTitle, e.dataset.tipDescription].filter(Boolean).join('\n\n'))(document.getElementById('crop-alert-led'))),
      ledBg: getComputedStyle(document.getElementById('crop-alert-led')).backgroundColor,
    }));
    const setCrop = async o => { await page.evaluate(o => { tickCropGrowth(); Object.assign(STATE.cropGrowth, { pest: false, health: 80 }, o); setWaterSplit(cropWaterNeed()); renderCruise(); }, o); await page.waitForTimeout(450); }; // colour transitions settle
    await setCrop({ growth: 40, day: 30 });
    let c = await card();
    ok(c.stage === 'VEGETATIVE' && c.day === 'DAY 30 / 90' && !c.overdue, 'growing: VEGETATIVE, "' + c.day + '"');
    ok(!c.led && c.ledBg === 'rgb(42, 48, 64)', 'healthy, watered, no pests: LED dark');
    await setCrop({ growth: 60, day: 95 });
    c = await card();
    ok(c.overdue && c.dayColor === 'rgb(204, 51, 51)', 'past 90 days and not grown: DAY 95 / 90 goes red (overdue)');
    await setCrop({ growth: 50, day: 20, pest: true });
    c = await card();
    ok(c.led && /Pests/.test(c.ledTitle) && c.ledBg === 'rgb(255, 172, 0)', 'pests: LED on (' + c.ledTitle + ')');
    await setCrop({ growth: 50, day: 20, health: 20 });
    c = await card();
    ok(c.led && /Sick/.test(c.ledTitle), 'sick: LED on (' + c.ledTitle + ')');
    await page.evaluate(() => { tickCropGrowth(); Object.assign(STATE.cropGrowth, { pest: false, health: 80, growth: 50 }); setWaterSplit(15); renderCruise(); });
    await page.waitForTimeout(450);
    c = await card();
    ok(c.led && /Thirsty/.test(c.ledTitle), 'thirsty (plant share 15%): LED on (' + c.ledTitle + ')');
    await setCrop({ growth: 100, day: 88 });
    c = await card();
    ok(c.stage === 'READY' && c.mature && c.btn === 'block' && c.growing === 'none', 'mature: READY, .mature, HARVEST shown in place of the growing block');
    ok(c.btnAnim === 'harvest-pulse' && c.led && /Ready to harvest/.test(c.ledTitle), 'HARVEST pulses; LED on for maturity');
    await shot(page, '03_crop_ready');
    const h = await page.evaluate(() => {
      STATE.resources.food = 40;
      const f0 = STATE.resources.food;
      let grow = false; const og = window.openGrowbay; window.openGrowbay = () => { grow = true; };
      document.getElementById('crop-harvest-btn').click();
      window.openGrowbay = og;
      return { food: STATE.resources.food - f0, growth: STATE.cropGrowth.growth, day: STATE.cropGrowth.day, grow, stage: document.getElementById('crop-stage').textContent, mature: document.getElementById('crop-card-mini').classList.contains('mature'), log: STATE.shipLog.slice(-4).map(e => e.text).join(' | ') };
    });
    ok(h.food >= 40 && h.growth === 0 && h.day === 0, 'HARVEST runs the growbay harvest: +' + h.food + ' food, replanted');
    ok(!h.grow && !h.mature && h.stage === 'SPROUTING', 'the click stays on the button (no growbay), card back to SPROUTING');
    ok(/Harvested WHEAT/.test(h.log), 'harvest is logged');
    // Ship pods: the crop overlay per stage (demo applyShipSprite).
    const pods = await page.evaluate(() => [[1, 0], [12, 13], [30, 40], [50, 60], [80, 90]].map(([day, growth]) => {
      Object.assign(STATE.cropGrowth, { day, growth, health: 80 }); renderCruise();
      const bg = document.getElementById('ship-silhouette').style.backgroundImage;
      return (bg.match(/ships\/wheat\/(\d)\.png/) || [, 'base'])[1];
    }));
    ok(pods.join(',') === 'base,1,2,3,4', 'ship pods: empty right after planting, then wheat stages 1–4 by growth (' + pods.join(',') + ')');
    const ok404 = await page.evaluate(async () => { const r = []; for (const c of ['wheat', 'tomato', 'potato', 'soybean', 'zinnia']) for (let i = 1; i <= 4; i++) r.push(await new Promise(res => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(c + i); im.src = 'sprites/ships/' + c + '/' + i + '.png'; })); return r.filter(x => x !== true); });
    ok(!ok404.length, 'every crop has all four pod sprites (' + (ok404.join(',') || 'none missing') + ')');
    await page.close();
  }

  console.log('— AI log: scroll guard, day markers, ▶ vs voice, typewriter');
  {
    const page = await boot();
    await page.waitForTimeout(300);
    const r = await page.evaluate(async () => {
      const log = document.getElementById('ai-log');
      for (let i = 0; i < 30; i++) pushCruiseLog('◆ filler line ' + i, { instant: true });
      log.scrollTop = log.scrollHeight;
      await new Promise(r => setTimeout(r, 50));
      log.scrollTop = 0; // reader scrolls up to read history
      await new Promise(r => setTimeout(r, 50));
      pushCruiseLog('◆ while reading history');
      await new Promise(r => setTimeout(r, 400));
      const kept = log.scrollTop;
      log.scrollTop = log.scrollHeight - log.clientHeight - 20; // within 50px of the bottom
      await new Promise(r => setTimeout(r, 50));
      pushCruiseLog('◆ while following the tail', { instant: true });
      await new Promise(r => setTimeout(r, 50));
      const follow = log.scrollHeight - log.scrollTop - log.clientHeight;
      return { kept, follow };
    });
    ok(r.kept === 0, 'scrolled up: a new entry does not yank the reader (scrollTop ' + r.kept + ')');
    ok(r.follow < 2, 'within 50px of the bottom: the log follows (gap ' + r.follow + ')');
    const m = await page.evaluate(() => {
      STATE.daysElapsed += 3;
      pushCruiseLog('◆ a ship event', { instant: true });
      pushCruiseLog('◆ an AI remark', { instant: true, ai: true });
      const marks = [...document.querySelectorAll('#ai-log .ai-day-marker')].map(x => x.textContent);
      const ents = [...document.querySelectorAll('#ai-log .ai-entry')].slice(-2).map(x => x.textContent);
      const old = document.querySelectorAll('#ai-log .ai-entry')[0];
      return { marks, ents, day: STATE.daysElapsed, oldOp: getComputedStyle(old).opacity, mk: getComputedStyle(document.querySelector('#ai-log .ai-day-marker')).fontFamily };
    });
    ok(m.marks.includes('── DAY ' + m.day + ' ──') && m.marks.length >= 2, 'day markers: ' + m.marks.slice(-2).join(' '));
    ok(/Press Start 2P/.test(m.mk), 'markers in Press Start 2P');
    ok(m.ents[0] === '▶ a ship event' && m.ents[1] === 'MARV: an AI remark', 'ship events ▶, AI lines voiced: ' + m.ents.join(' / '));
    await page.waitForTimeout(400);
    ok(m.oldOp === '0.55' || (await page.evaluate(() => getComputedStyle(document.querySelectorAll('#ai-log .ai-entry')[0]).opacity)) === '0.55', 'older entries at 0.55 opacity');
    const tw = await page.evaluate(async () => {
      const text = '◆ ' + 'x'.repeat(60);
      const e = pushCruiseLog(text);
      const cur = !!e.querySelector('.tw-cursor');
      const curAnim = cur ? getComputedStyle(e.querySelector('.tw-cursor')).animationName : '';
      await new Promise(r => setTimeout(r, 700));
      const mid = e.textContent.length;
      await new Promise(r => setTimeout(r, 2200));
      return { cur, curAnim, mid, end: e.textContent, curGone: !e.querySelector('.tw-cursor') };
    });
    ok(tw.cur && tw.curAnim === 'blink-cursor', 'typewriter: blinking cursor while typing');
    ok(tw.mid >= 14 && tw.mid <= 26, 'typewriter at ~35ms/char (' + tw.mid + ' chars after 700ms)');
    ok(tw.end === '▶ ' + 'x'.repeat(60) && tw.curGone, 'line completes, cursor removed');
    // A load rebuilds the hub log with markers and prefixes.
    const rb = await page.evaluate(() => { rebuildCruiseLog(5); return { m: document.querySelectorAll('#ai-log .ai-day-marker').length, e: [...document.querySelectorAll('#ai-log .ai-entry')].map(x => x.textContent[0]) }; });
    ok(rb.m >= 1 && rb.e.every(c => c === '▶' || c === 'M'), 'rebuilt log keeps markers and prefixes');
    await page.close();
  }

  console.log('— trader presence roll, TRADE ⇄ WAIT FOR TRADER, verb time labels, LOG');
  {
    const page = await boot();
    const tun = await page.evaluate(() => CRUISE_WAIT_TUNING);
    ok(tun.TRADER_PRESENT_CHANCE.planet_orbit_habitable > tun.TRADER_PRESENT_CHANCE.deep_space, 'presence odds lean civilized (planet ' + tun.TRADER_PRESENT_CHANCE.planet_orbit_habitable + ' > deep ' + tun.TRADER_PRESENT_CHANCE.deep_space + ')');
    // Roll: forced miss / hit through Math.random.
    const roll = async (type, r) => page.evaluate(({ type, r }) => {
      const n = STATE.nodes.find(x => x.node_type === type);
      delete (STATE.traderAt || {})[n.id];
      const rnd = Math.random; Math.random = () => r;
      STATE.currentId = n.id; document.body.classList.remove('stop-active'); renderCruise();
      Math.random = rnd;
      document.getElementById('stop-btn').click();
      return { present: STATE.traderAt[n.id], verbs: [...document.querySelectorAll('#stop-choices .stop-choice-body')].map(b => b.textContent), ticker: document.getElementById('header-ticker').textContent };
    }, { type, r });
    let v = await roll('asteroid_field', 0.99);
    ok(v.present === false && v.verbs.includes('WAIT FOR TRADER') && !v.verbs.includes('TRADE'), 'no trader: WAIT FOR TRADER, no TRADE (' + v.verbs.join(',') + ')');
    v = await roll('asteroid_field', 0.01);
    ok(v.present === true && v.verbs.includes('TRADE') && !v.verbs.includes('WAIT FOR TRADER'), 'trader in range: TRADE, no WAIT');
    ok(/TRADER IN RANGE/.test(v.ticker), 'ticker: STOPPED — TRADER IN RANGE');
    await page.evaluate(() => { saveRun(); STATE.traderAt = {}; loadRun(); });
    ok(await page.evaluate(() => STATE.traderAt[STATE.currentId] === true), 'the roll is saved (a reload cannot re-roll it)');
    await parkAt(page, 'station');
    await openStop(page);
    const sv = await verbs(page);
    ok(sv.some(x => x.label === 'TRADE') && !sv.some(x => x.label === 'WAIT FOR TRADER'), 'station: TRADE always, never WAIT');
    const stEv = await page.evaluate(() => { const b = [...document.querySelectorAll('#stop-choices .stop-choice')].find(x => x.querySelector('.stop-choice-body').textContent === 'TRADE'); b.click(); return STATE.currentEvent && STATE.currentEvent.id; });
    ok(stEv === 'event_station_013', 'station TRADE opens Market Row (' + stEv + ')');
    await page.evaluate(() => advanceAfterEvent());
    await parkAt(page, 'asteroid_field', { trader: false });
    await page.evaluate(() => { STATE.resources.hull = 50; STATE.materials = { metal: 4, scrap: 2 }; });
    await openStop(page);
    const av = await verbs(page);
    const lab = name => (av.find(x => x.label === name) || {}).text || '';
    ok(/1d\/run/.test(lab('MINE')) && /1-7d/.test(lab('WAIT FOR TRADER')) && /1-7d/.test(lab('REST')) && /1d/.test(lab('REPAIR')), 'verb time labels: MINE 1d/run, WAIT/REST 1-7d, REPAIR 1d');
    const fab = await page.evaluate(() => { const b = [...document.querySelectorAll('#stop-choices .stop-choice')].find(x => /FABRICATOR/.test(x.textContent)); return b ? !!b.querySelector('.verb-time') : null; });
    ok(fab === false, 'no time label on a verb that costs no days (FABRICATOR)');
    const lg = await page.evaluate(() => { const b = document.getElementById('stop-log-btn'); const bg = getComputedStyle(b, '::before').backgroundImage; b.click(); const on = document.getElementById('overlay-shipslog').classList.contains('active'); hideOverlay('overlay-shipslog'); return { bg, on, text: b.textContent }; });
    ok(lg.on && /log\.png/.test(lg.bg) && lg.text === 'LOG', 'Stop menu LOG button (log.png) opens the Ship\'s Log');
    await page.waitForTimeout(700);
    await shot(page, '04_stop_menu');
    // Readout icons + resource bar sizes.
    const ro = await page.evaluate(() => ({
      icons: [...document.querySelectorAll('#cruise-readout .icon')].map(i => (getComputedStyle(i).backgroundImage.match(/interface\/(\w+)\.png/) || [])[1]),
      barH: getComputedStyle(document.querySelector('#bottom-resources .res-bar')).height,
      gap: getComputedStyle(document.getElementById('bottom-resources')).rowGap,
      label: getComputedStyle(document.querySelector('#bottom-resources .res-label')).fontSize,
    }));
    ok(ro.icons.join(',') === 'engines,rations,water,plant,crew', 'readout icons: ' + ro.icons.join(','));
    ok(ro.barH === '16px' && ro.gap === '8px' && ro.label === '8px', 'resource bars 16px / row gap 8px (three rows, ruling 18) / labels 8px (' + [ro.barH, ro.gap, ro.label].join(' ') + ')');
    await page.close();
  }

  console.log('— multi-day WAIT / REST');
  // Hardened (batch 3): every step waits on the real wait state
  // (cruiseWaitState / the flash / the banner) instead of fixed sleeps —
  // a loaded Firefox run used to sample between ticks. Reads that must
  // land on a given day happen atomically inside the waitForFunction.
  const WT = { timeout: 20000, polling: 50 };
  const waitFor = (page, fn, arg) => page.waitForFunction(fn, arg, WT).then(h => h.jsonValue());
  const idle = page => waitFor(page, () => !cruiseWaitActive() && !document.getElementById('action-banner').classList.contains('show') && !document.getElementById('wait-flash').classList.contains('show'));
  {
    const page = await boot();
    // WAIT FOR TRADER, 2 days, nobody comes (rolls all miss).
    await parkAt(page, 'asteroid_field', { trader: false });
    await openStop(page);
    // Open the picker; a Stop-menu re-render landing in between (a late
    // arrival line under load) collapses it, so retry until it holds.
    let pk = null;
    for (let i = 0; i < 5 && !pk; i++) {
      await clickVerb(page, /^WAIT FOR TRADER$/);
      pk = await page.waitForFunction(() => { const h = document.querySelector('#stop-choices .day-picker .stop-choice-body'); return h && { steps: [...document.querySelectorAll('#stop-choices .day-step')].map(s => s.textContent).join(''), head: h.textContent }; }, null, { timeout: 2000, polling: 50 }).then(h => h.jsonValue()).catch(() => null);
    }
    if (!pk) { console.log('    (diag) verbs: ' + JSON.stringify(await verbs(page))); pk = {}; }
    ok(pk.steps === '1234567' && pk.head === 'WAIT HOW MANY DAYS?', 'WAIT opens the 1–7 day picker');
    await shot(page, '05_day_picker');
    // (re-open the picker in the same frame if a re-render collapsed it)
    const d0 = await page.evaluate(() => { window.__rnd = Math.random; Math.random = () => 0.99; const d = STATE.daysElapsed; if (!document.querySelector('.day-step')) [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /WAIT FOR TRADER/.test(b.textContent)).click(); [...document.querySelectorAll('.day-step')][1].click(); return d; });
    const b1 = await waitFor(page, () => {
      const w = cruiseWaitState();
      const menu = [...document.querySelectorAll('#stop-choices .stop-choice-body')].map(b => b.textContent);
      if (!w || w.day !== 1 || w.resolving || menu.join() !== 'STOP WAITING') return false;
      return { label: document.getElementById('action-banner-label').textContent, counter: document.getElementById('action-banner-counter').textContent, show: document.getElementById('action-banner').classList.contains('show'), menu, dc: getComputedStyle(document.getElementById('day-counter')).opacity };
    });
    ok(b1.show && b1.label === 'WAITING FOR TRADER' && b1.counter === 'DAY 1 / 2', 'action banner: WAITING FOR TRADER · DAY 1 / 2');
    ok(b1.menu.join() === 'STOP WAITING', 'mid-wait the menu holds only STOP WAITING');
    ok(b1.dc === '1', 'mid-wait the days are passing: the day counter shows');
    await shot(page, '06_waiting');
    const w = await waitFor(page, d0 => {
      const f = document.getElementById('wait-flash');
      if (!f.classList.contains('show')) return false;
      return { days: STATE.daysElapsed - d0, flash: f.querySelector('.wait-flash-label').textContent, cls: f.className };
    }, d0);
    ok(w.days === 2, 'two days really passed (' + w.days + ')');
    ok(/show/.test(w.cls) && /timeout/.test(w.cls) && w.flash === 'NO ONE CAME', 'result flash: NO ONE CAME (timeout)');
    await shot(page, '07_no_one_came');
    await idle(page);
    ok(await page.evaluate(() => !cruiseWaitActive() && [...document.querySelectorAll('#stop-choices .stop-choice-body')].some(b => b.textContent === 'WAIT FOR TRADER')), 'back to the Stop menu, still no trader');

    // WAIT: the trader comes on day 1 and the real trader event opens.
    await page.evaluate(() => { Math.random = () => 0.01; [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /WAIT FOR TRADER/.test(b.textContent)).click(); [...document.querySelectorAll('.day-step')][2].click(); });
    const ta = await waitFor(page, () => {
      const f = document.getElementById('wait-flash');
      if (!f.classList.contains('show')) return false;
      return { flash: f.querySelector('.wait-flash-label').textContent, cls: f.className, here: STATE.traderAt[STATE.currentId] };
    });
    ok(ta.flash === 'TRADER APPROACHING' && /success/.test(ta.cls) && ta.here === true, 'trader arrives: TRADER APPROACHING (gold), trader now in range');
    await shot(page, '08_trader_approaching');
    const trEv = await waitFor(page, () => !cruiseWaitActive() && (STATE.currentEvent ? STATE.currentEvent.id : false));
    ok(trEv === 'event_encounter_trader_001', 'the trader encounter opens');
    await page.evaluate(() => { Math.random = window.__rnd; advanceAfterEvent(); });

    // REST: 2 days, morale paid on completion.
    await parkAt(page, 'asteroid_field', { trader: false });
    await openStop(page);
    const r0 = await page.evaluate(() => { setCrewMorale(50); Math.random = () => 0.99; [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /^REST/.test(b.textContent)).click(); [...document.querySelectorAll('.day-step')][1].click(); return { m: crewMoraleRaw(), d: STATE.daysElapsed, per: CRUISE_WAIT_TUNING.REST_MORALE_PER_DAY }; });
    const mid = await waitFor(page, () => { const w = cruiseWaitState(); return (w && w.day === 1 && !w.resolving) ? crewMoraleRaw() : false; });
    const rr = await waitFor(page, r0 => {
      const f = document.getElementById('wait-flash');
      if (!f.classList.contains('show')) return false;
      return { dm: Math.round(crewMoraleRaw() - r0.m), dd: STATE.daysElapsed - r0.d, flash: f.querySelector('.wait-flash-label').textContent };
    }, r0);
    ok(mid <= r0.m + 0.5, 'REST pays nothing mid-rest (morale ' + r0.m + ' → ' + mid + ')');
    ok(rr.dd === 2 && rr.dm >= 2 * r0.per - 2 && rr.flash === 'REFRESHED', 'REST 2 days: +' + rr.dm + ' morale (≈2×' + r0.per + ' less rations drift), REFRESHED');
    await idle(page);

    // WAKE UP after one day: the day is spent, nothing gained, WASTED 1 DAY!
    const c0 = await page.evaluate(() => { setCrewMorale(50); [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /^REST/.test(b.textContent)).click(); [...document.querySelectorAll('.day-step')][4].click(); return { m: crewMoraleRaw(), d: STATE.daysElapsed }; });
    // Click WAKE UP in the same frame that sees day 1 land (atomic).
    const cx = await waitFor(page, c0 => {
      const w = cruiseWaitState();
      const b = [...document.querySelectorAll('#stop-choices .stop-choice')].find(x => /WAKE UP/.test(x.textContent));
      if (!w || w.day !== 1 || w.resolving || !b) return false;
      b.click();
      return { had: true, dd: STATE.daysElapsed - c0.d, dm: Math.round((crewMoraleRaw() - c0.m) * 10) / 10, banner: document.getElementById('action-banner-label').textContent, cancelled: document.getElementById('action-banner').classList.contains('cancelled'), active: cruiseWaitActive(), log: STATE.shipLog.slice(-1)[0].text };
    }, c0);
    ok(cx.had && !cx.active && cx.dd === 1, 'WAKE UP after a day: the day stays spent (' + cx.dd + ')');
    ok(cx.dm <= 0, 'quitting the rest gains nothing (morale Δ ' + cx.dm + ')');
    ok(cx.banner === 'WASTED 1 DAY!' && cx.cancelled, 'banner: WASTED 1 DAY! (amber, cancelled)');
    await shot(page, '09_wasted');
    await idle(page);

    // Held while paused: no day passes under the pause menu.
    await page.evaluate(() => { [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /WAIT FOR TRADER/.test(b.textContent)).click(); [...document.querySelectorAll('.day-step')][1].click(); PauseBus.pause(); });
    const p0 = await page.evaluate(() => STATE.daysElapsed);
    await page.waitForTimeout(2200); // a negative check: nothing may happen for longer than a tick
    const p1 = await page.evaluate(() => ({ d: STATE.daysElapsed, w: cruiseWaitState() }));
    ok(p1.d === p0 && p1.w && p1.w.day === 0, 'paused: the wait holds (no day passed)');
    await page.evaluate(() => PauseBus.resume());
    ok(await waitFor(page, p0 => STATE.daysElapsed > p0, p0), 'resumed: the wait carries on');
    await idle(page); // let that wait land
    // Resume mid-wait calls it off and travels.
    await page.evaluate(() => { [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /WAIT FOR TRADER/.test(b.textContent)).click(); [...document.querySelectorAll('.day-step')][4].click(); });
    const rs = await waitFor(page, () => {
      const w = cruiseWaitState();
      if (!w || w.day < 1 || w.resolving) return false;
      const at = STATE.currentId; const ids = [...nextAvailableNodes()]; if (ids.length !== 1) return { skip: true };
      document.getElementById('stop-btn').click();
      return { moved: STATE.currentId !== at, active: cruiseWaitActive(), log: STATE.shipLog.map(e => e.text).filter(t => /called off/.test(t)).length };
    });
    ok(rs.skip || (rs.moved && !rs.active && rs.log >= 1), 'Resume mid-wait: wait called off, ship travels');
    await page.evaluate(() => { Math.random = window.__rnd; });
    await page.close();
  }

  console.log('— during-wait events: forced state, real encounters');
  {
    const page = await boot();
    await parkAt(page, 'asteroid_field', { trader: false });
    await openStop(page);
    const s0 = await page.evaluate(() => { setCrewMorale(40); window.__rnd = Math.random; Math.random = () => 0.01; [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /^REST/.test(b.textContent)).click(); [...document.querySelectorAll('.day-step')][3].click(); return { m: crewMoraleRaw(), d: STATE.daysElapsed }; });
    const fl = await waitFor(page, () => {
      const f = document.getElementById('wait-flash');
      if (!f.classList.contains('show')) return false;
      return { flash: f.querySelector('.wait-flash-label').textContent, cls: f.className, forced: STATE.forcedEvent };
    }).catch(() => ({ flash: null, cls: '', forced: null }));
    ok(fl.flash === 'PIRATE INBOUND' && /event-danger/.test(fl.cls), 'a pirate interrupts the rest: PIRATE INBOUND (red)');
    ok(fl.forced && fl.forced.ev === 'event_encounter_pirate_001', 'the forced event is a real engine event (' + (fl.forced && fl.forced.ev) + ')');
    if (!fl.forced) console.log('    (diag) ' + JSON.stringify(await page.evaluate(() => ({ wait: cruiseWaitState(), node: STATE.byId[STATE.currentId].node_type, held: [PauseBus.paused, [...document.querySelectorAll('.overlay.active')].map(o => o.id)], pick: cruiseWaitEventPick() }))));
    await shot(page, '10_pirate_inbound');
    const fs = await waitFor(page, s0 => {
      if (!document.body.classList.contains('event-active') || cruiseWaitActive()) return false;
      const t = [...document.querySelectorAll('#header-ticker .ticker-text:not(.exit)')].pop();
      if (!t || t.textContent !== 'PIRATE SIGNATURE — WEAPONS HOT' || t.classList.contains('enter')) return false;
      return { ticker: t.textContent, tcls: t.className, tcolor: getComputedStyle(t).color, body: document.body.classList.contains('event-active'), btnColor: getComputedStyle(document.getElementById('stop-btn')).borderTopColor, menu: [...document.querySelectorAll('#stop-choices .stop-choice')].map(b => b.querySelector('.stop-choice-body').textContent + '|' + b.className), label: document.getElementById('stop-region-label').textContent, dd: STATE.daysElapsed - s0.d, dm: Math.round(crewMoraleRaw() - s0.m) };
    }, s0);
    ok(fs.ticker === 'PIRATE SIGNATURE — WEAPONS HOT' && /event/.test(fs.tcls) && fs.tcolor === 'rgb(204, 51, 51)', 'forced: red pulsing event ticker');
    // (the button's border eases over 0.18s — wait for it to land)
    const btnRed = await waitFor(page, () => getComputedStyle(document.getElementById('stop-btn')).borderTopColor === 'rgb(204, 51, 51)').catch(() => false);
    ok(fs.body && btnRed, 'forced: Stop button pulses red');
    ok(fs.label === 'PIRATE SIGNATURE' && fs.menu.length === 1 && /^HAIL BACK\|.*risky/.test(fs.menu[0]), 'forced: the menu holds one red resolve verb (' + fs.menu.join() + ')');
    ok(fs.dd === 1 && fs.dm >= 4, 'interrupted on day 1: the rest pays pro rata (+' + fs.dm + ' morale)');
    await shot(page, '11_forced_event');
    // Resume is blocked: shake + CANNOT RESUME, the ship stays.
    const rb = await page.evaluate(() => { const at = STATE.currentId; document.getElementById('stop-btn').click(); return { moved: STATE.currentId !== at, shaking: document.getElementById('screen-cruise').classList.contains('shaking'), ev: STATE.currentEvent && STATE.currentEvent.id }; });
    ok(!rb.moved && !rb.ev && rb.shaking, 'Resume blocked: screen shakes, ship stays');
    const tickNow = () => { const t = [...document.querySelectorAll('#header-ticker .ticker-text:not(.exit)')].pop(); return t ? t.textContent : null; };
    const warn = await waitFor(page, `(${tickNow})() === 'CANNOT RESUME — HANDLE EVENT FIRST'`).catch(() => false);
    ok(warn, 'ticker: CANNOT RESUME — HANDLE EVENT FIRST');
    const back = await waitFor(page, `(${tickNow})() === 'PIRATE SIGNATURE — WEAPONS HOT'`).catch(() => false);
    ok(back, 'then the event line is restored');
    // Saved: a reload comes back to it.
    await page.evaluate(() => { saveRun(); STATE.forcedEvent = null; loadRun(); });
    const sl = await waitFor(page, () => !!STATE.forcedEvent && document.body.classList.contains('event-active') && document.body.classList.contains('stop-active')).catch(() => false);
    ok(sl, 'save/load: the forced event is still waiting');
    const ev = await page.evaluate(() => { Math.random = window.__rnd; document.querySelector('#stop-choices .stop-choice').click(); return { ev: STATE.currentEvent && STATE.currentEvent.id, forced: STATE.forcedEvent, cls: document.body.classList.contains('event-active') }; });
    ok(ev.ev === 'event_encounter_pirate_001' && !ev.forced && !ev.cls, 'HAIL BACK opens the pirate encounter; the forced state clears');
    // The other kinds: only events eligible at this stop, once-only respected.
    const kinds = await page.evaluate(() => {
      advanceAfterEvent();
      // A map without one of these types borrows a node for the sample.
      const sample = t => {
        let n = STATE.nodes.find(x => x.node_type === t), was = null;
        if (!n) { n = STATE.nodes.find(x => x.node_type === 'asteroid_field' || x.node_type === 'derelict'); was = n.node_type; n.node_type = t; }
        STATE.currentId = n.id;
        const s = new Set(); for (let i = 0; i < 300; i++) { const p = cruiseWaitEventPick(); if (p) s.add(p.kind + ':' + p.ev); }
        if (was) n.node_type = was;
        return [...s].sort();
      };
      const ast = sample('asteroid_field');
      const ano = sample('anomaly');
      STATE.seenEventIds.add('event_encounter_drifter_001'); const seen = sample('asteroid_field');
      const st = sample('station');
      return { ast, ano, seen, st };
    });
    ok(kinds.ast.includes('distress:event_encounter_drifter_001') && kinds.ast.includes('pirate:event_encounter_pirate_001') && !kinds.ast.some(k => /^anomaly/.test(k)), 'asteroid field: pirate or distress call (' + kinds.ast.join(', ') + ')');
    ok(kinds.ano.some(k => /^anomaly:event_anomaly_/.test(k)), 'anomaly: anomalous drift fires anomaly events');
    ok(!kinds.seen.some(k => /drifter/.test(k)), 'the once-only distress call is not repeated');
    ok(kinds.st.length === 0, 'nothing is eligible to interrupt at a station');

    await page.close();
  }

  console.log('— alien planet region');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      // Find an art seed that makes some planet on this map alien (the
      // planet's biome is scene_art's sticky per-node pick).
      const planets = STATE.nodes.filter(n => n.node_type === 'planet');
      if (!planets.length) return { none: true };
      let alien = null, other = null;
      for (let s = 1; s < 400 && !(alien && other); s++) {
        STATE.artSeed = s; SceneArt.clearRunCaches();
        for (const p of planets) { const b = SceneArt.biomeFor(null, p); if (b === 'alien' && !alien) alien = { seed: s, id: p.id }; if (b !== 'alien' && !other) other = { seed: s, id: p.id }; }
      }
      const out = {};
      for (const [k, x] of [['alien', alien], ['other', other]]) {
        if (!x) continue;
        STATE.artSeed = x.seed; SceneArt.clearRunCaches();
        STATE.currentId = x.id; STATE.traderAt = {}; STATE.traderAt[x.id] = false;
        document.body.classList.remove('stop-active'); renderCruise(); document.getElementById('stop-btn').click();
        const f = [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /GATHER|FORAGE/.test(b.querySelector('.stop-choice-body').textContent));
        out[k] = { seed: x.seed, id: x.id, region: document.getElementById('stop-region-label').textContent, verb: f && f.querySelector('.stop-choice-body').textContent, cls: f && f.className, strip: f && getComputedStyle(f).borderLeftColor, biome: SceneArt.biomeFor(null, STATE.byId[x.id]) };
      }
      return out;
    });
    if (r.none) ok(true, 'no planet on this map (skipped)');
    else {
      ok(r.alien && r.alien.region === 'PLANET ORBIT · ALIEN' && r.alien.verb === 'FORAGE', 'alien biome planet: PLANET ORBIT · ALIEN, FORAGE');
      ok(r.alien && /risky/.test(r.alien.cls) && r.alien.strip === 'rgb(204, 51, 51)', 'FORAGE in the red risky strip (' + (r.alien && r.alien.strip) + ')');
      ok(r.other && r.other.region === 'PLANET ORBIT · HABITABLE' && r.other.verb === 'GATHER' && !/risky/.test(r.other.cls), 'other biomes stay HABITABLE / GATHER (' + (r.other && r.other.biome) + ')');
      await shot(page, '12_alien_planet');
      // The risk is real: a poison roll on the haul.
      const pz = await page.evaluate(a => {
        STATE.artSeed = a.seed; SceneArt.clearRunCaches(); STATE.currentId = a.id;
        document.body.classList.remove('stop-active'); renderCruise(); document.getElementById('stop-btn').click();
        const rnd = Math.random; Math.random = () => 0.1; // < 0.25 poison roll
        const hp0 = peopleAboard().map(hpOf).reduce((a, b) => a + b, 0); // anyone aboard, the captain too (owner ruling 29)
        window.openMinigame = (id, o, cb) => cb('good', { food: 10 });
        [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /FORAGE/.test(b.textContent)).click();
        Math.random = rnd;
        return { hurt: hp0 - peopleAboard().map(hpOf).reduce((a, b) => a + b, 0), log: STATE.shipLog.slice(-1)[0].text };
      }, r.alien);
      ok(pz.hurt > 0 && /disagreed/.test(pz.log), 'alien FORAGE: someone aboard is poisoned (−' + pz.hurt + ' HP after the medic)');
    }
    await page.close();
  }

  console.log('— crew dossier: epitaph "Dr.", airlock epitaphs, next member, Cost line, fade');
  {
    const page = await boot({ crew: ['botanist', 'medic'] });
    const sp = await page.evaluate(() => crewEpitaphSentences("Dr. Osei opened the airlock to 'get some fresh air.' Dr. Osei is survived by a very confused houseplant."));
    ok(sp.length === 2 && sp[1].startsWith('Dr. Osei is survived'), 'splitter keeps "Dr. Osei" and the quote whole: ' + JSON.stringify(sp));
    const all = await page.evaluate(() => MOD.flavor.crew_epitaphs.map(l => crewEpitaphSentences(l.replaceAll('[Name]', 'Dr. Osei'))));
    ok(all.every(ss => ss.every(s => !/\bDr\.$/.test(s))), 'no crew epitaph line ever ends on "Dr."');
    const air = await page.evaluate(() => MOD.flavor.airlock_epitaphs);
    ok(Array.isArray(air) && air.length === 7 && air.includes('The vacuum accepts the donation without comment.'), 'flavor_pools.airlock_epitaphs: the demo\'s 7 lines');
    // Jettison the botanist out in the asteroids (no safe dropoff).
    await parkAt(page, 'asteroid_field');
    await page.evaluate(() => { MOD.flavor.airlock_epitaphs = ['Last seen drifting. Dr. Vasquez waved. Still drifting, one assumes.']; openCrewDetail('botanist'); });
    await page.waitForTimeout(500);
    const title = await page.evaluate(() => ({ cost: ((e => e.getAttribute('title') || [e.dataset.tipTitle, e.dataset.tipDescription].filter(Boolean).join('\n\n'))(document.getElementById('cd-active-card'))), trans: getComputedStyle(document.getElementById('cd-modal')).transitionDuration, op: getComputedStyle(document.getElementById('cd-modal')).opacity }));
    ok(/\nCost: none\n/.test(title.cost), 'active card title carries the Cost line');
    ok(/0\.25s/.test(title.trans) && parseFloat(title.op) > 0.98, 'dossier fades/scales in over 0.25s (' + title.trans + ', opacity ' + title.op + ')');
    const closed = await page.evaluate(() => { hideOverlay('overlay-crew'); const m = getComputedStyle(document.getElementById('cd-modal')); const r = { op: m.opacity, pe: m.pointerEvents }; showOverlay('overlay-crew'); return r; });
    ok(closed.pe === 'none', 'closed dossier is inert (class-based fade target: opacity 0, no pointer events)');
    await page.waitForTimeout(350);
    await page.evaluate(() => { document.getElementById('cd-dismiss-btn').click(); document.getElementById('cd-confirm-ok').click(); });
    await page.waitForTimeout(2300);
    const ep = await page.evaluate(() => ({ name: document.getElementById('cd-epitaph-name').textContent, html: document.getElementById('cd-epitaph-line').innerHTML, log: STATE.shipLog.slice(-1)[0].text, crew: STATE.crew.slice() }));
    ok(ep.name === 'DR. OSEI' && !ep.crew.includes('botanist'), 'jettisoned: DR. OSEI gone from the crew');
    ok(ep.html === 'Last seen drifting.<br>Dr. Vasquez waved.<br>Still drifting, one assumes.', 'epitaph lines: ' + ep.html);
    ok(/^◆ Dr\. Osei, jettisoned\. Last seen drifting/.test(ep.log), 'log names who went out the airlock: ' + ep.log);
    await shot(page, '13_epitaph');
    await page.evaluate(() => document.getElementById('cd-epitaph').click());
    await page.waitForTimeout(600);
    const nx = await page.evaluate(() => document.getElementById('cd-name').textContent);
    ok(nx === 'DR. VASQUEZ', 'after the jettison the dossier moves on to the next member (' + nx + '), not the captain');
    // Safe dismiss at a station: the next one again (wraps past the end).
    await page.evaluate(() => { hideOverlay('overlay-crew'); const st = STATE.nodes.find(n => n.node_type === 'station'); STATE.currentId = st.id; renderCruise(); openCrewDetail('medic'); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { document.getElementById('cd-dismiss-btn').click(); document.getElementById('cd-confirm-ok').click(); });
    await page.waitForTimeout(1400);
    const wrap = await page.evaluate(() => document.getElementById('cd-name').textContent);
    ok(wrap === 'CAPTAIN', 'dismissing the last in line wraps to the start (' + wrap + ')');
    await page.close();
  }

  console.log('— no STRENGTH remnants');
  {
    const page = await boot();
    const r = await page.evaluate(() => { openCrewDetail('engineer'); return /STRENGTH|Exhausted/i.test(document.getElementById('cd-modal').textContent); });
    ok(!r, 'the dossier shows no STRENGTH / Exhausted (owner: dropped)');
    await page.close();
  }

  ok(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(`\nparity_cruise: ${pass} passed, ${fail} failed`);
  await browser.close();
})();
