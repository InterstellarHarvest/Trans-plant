// Batch 3 — owner rulings 16–18 (2026-10-11): the dot HUD, the cruise
// header, the cruise bottom-right grid.
//  16  No dot HUD on the cruise hub. Encounter / map / mining (and the
//      engine room) show the encounter demo's five — fuel, food, O2,
//      hull, morale (crew average) — dots + numbers, no letter codes
//      (demo-encounter .enc-resources: 13px VT323, 6px gap, 8px dots).
//  17  Day + days-left stay visible while stopped (no TIME PAUSED swap)
//      and don't tick; gold sits in the header left of the inventory
//      box, the day text's font size and vertical centre.
//  18  Bottom right: 2 columns × 3 rows — FOOD/H2O/O2 | FUEL/HULL/STOP,
//      labels left of wide 16px bars, Stop/Resume in the ship column's
//      row 3 and still working; low bars carry the crit pulse.
// Geometry and computed styles only (no class-name assertions).
// SHOTS=<dir> saves engine screenshots for the demo side-by-side.
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
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor);
  await page.evaluate(() => localStorage.removeItem('transplant_save_v1'));
  return page;
}
async function boot(setup, vp) {
  const page = await open(vp);
  await page.evaluate(o => {
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'botanist'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
    returnToHub();
    // cruising, not parked at the stop (returnToHub lands stopped at a station)
    document.body.classList.remove('stop-active'); document.getElementById('stop-btn').textContent = 'Stop'; renderCruise();
  }, setup || {});
  await page.waitForFunction(() => document.getElementById('screen-cruise').classList.contains('active'));
  return page;
}
const shot = async (page, name) => { if (SHOTS) { await page.waitForTimeout(600); await page.screenshot({ path: SHOTS + '/' + name + '.png' }); } };
// In-page: the five dots of one HUD container, in DOM order, with the
// facts the rulings care about (game-frame logical px).
const readHud = (page, id) => page.evaluate(id => {
  const host = document.getElementById(id);
  if (!host) return null;
  const g = document.getElementById('game').getBoundingClientRect(), k = g.width / 960;
  const hs = getComputedStyle(host);
  const rows = [...host.children].map(r => {
    const dot = r.firstElementChild, ds = getComputedStyle(dot), rs = getComputedStyle(r);
    const tipKey = r.dataset.tip;
    const tip = (window.Tooltip && tipKey) ? Tooltip.resolve(r) : null;
    return { text: r.textContent.trim(), dotBg: ds.backgroundColor, dotW: ds.width, dotH: ds.height, dotRad: ds.borderRadius, dotAnim: ds.animationName, color: rs.color, gap: rs.columnGap, tipTitle: tip && tip.title, tipDesc: tip && tip.description, tipRows: tip && tip.rows ? tip.rows.map(x => x.label + ' ' + x.value).join('; ') : '', x: (r.getBoundingClientRect().left - g.left) / k };
  });
  const box = host.getBoundingClientRect();
  return { display: hs.display, vis: hs.visibility, font: hs.fontFamily, size: hs.fontSize, gap: hs.columnGap, pad: hs.padding, bg: hs.backgroundColor, border: hs.borderTopColor, rad: hs.borderTopLeftRadius, left: (box.left - g.left) / k, right: (box.right - g.left) / k, top: (box.top - g.top) / k, w: box.width / k, rows };
}, id);
// demo-encounter tokens (--res-fuel/food/o2/hull/mor).
const DEMO_DOTS = ['rgb(232, 136, 48)', 'rgb(140, 200, 144)', 'rgb(184, 230, 238)', 'rgb(180, 176, 145)', 'rgb(94, 158, 199)'];
const DEMO_TITLES = ['FUEL', 'FOOD', 'OXYGEN', 'HULL', 'MORALE'];

(async () => {
  browser = await chromium.launch();

  console.log('— ruling 16: no dot HUD on the cruise hub');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const scr = document.getElementById('screen-cruise');
      // anything on the hub that looks like the dot HUD: a row of ≥4 small round dots
      const dots = [...scr.querySelectorAll('*')].filter(e => { const s = getComputedStyle(e); return s.borderRadius === '50%' && parseFloat(s.width) <= 9 && e.offsetParent; });
      const huds = [...scr.querySelectorAll('*')].filter(e => e.offsetParent && [...e.children].filter(c => c.firstElementChild && getComputedStyle(c.firstElementChild).borderRadius === '50%' && parseFloat(getComputedStyle(c.firstElementChild).width) === 8).length >= 4);
      return { hudEl: !!document.getElementById('hud-cruise'), huds: huds.length, text: scr.textContent };
    });
    ok(!r.hudEl && r.huds === 0, 'cruise: no dot HUD row on the hub (' + r.huds + ')');
    ok(!/\b(FU|FD|H2|HL|MO) \d/.test(r.text), 'cruise: no letter-coded resource readout left');
    await page.close();
  }

  console.log('— ruling 16: the five dots on encounter / map / mining / engine room');
  {
    const page = await boot();
    await page.evaluate(() => { Object.assign(STATE.resources, { fuel: 62, food: 48, o2: 71, hull: 55 }); enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001); renderHUD(); });
    await page.waitForFunction(() => document.getElementById('screen-encounter').classList.contains('active'));
    const avg = await page.evaluate(() => crewMoraleAvg());
    const enc = await readHud(page, 'hud-enc');
    ok(enc && enc.rows.length === 5, 'encounter: exactly 5 entries (' + (enc && enc.rows.length) + ')');
    ok(enc.rows.map(x => x.dotBg).join() === DEMO_DOTS.join(), 'order + dot colours = demo fuel/food/O2/hull/morale');
    ok(enc.rows.every(x => /^(\d+|—)$/.test(x.text)), 'numbers only, no letter codes: ' + enc.rows.map(x => x.text).join(' '));
    ok(enc.rows.slice(0, 4).map(x => x.text).join() === '62,48,71,55', 'the numbers are the real fuel/food/O2/hull');
    ok(enc.rows[4].text === String(Math.max(1, Math.round(avg))), 'morale dot = the crew average (' + enc.rows[4].text + ' vs ' + avg + ')');
    ok(enc.rows.map(x => x.tipTitle).join() === DEMO_TITLES.join(), 'each dot\'s tooltip names it: ' + enc.rows.map(x => x.tipTitle).join('/'));
    ok(/crew average/i.test(enc.rows[4].tipDesc) && /^Average \d+ \/ 100; Lowest \S.* \d+$/.test(enc.rows[4].tipRows), 'morale tooltip: Average + Lowest NAME n (' + enc.rows[4].tipRows + ')');
    ok(/VT323/.test(enc.font) && enc.size === '13px' && enc.gap === '6px' && enc.pad === '6px 10px', 'demo box: VT323 13px, 6px gap, 6px 10px padding (' + [enc.size, enc.gap, enc.pad].join(' ') + ')');
    ok(enc.bg === 'rgba(8, 12, 18, 0.7)' && enc.border === 'rgba(95, 168, 208, 0.2)' && enc.rad === '3px', 'demo box colours: ' + enc.bg + ' / ' + enc.border);
    ok(enc.rows.every(x => x.dotW === '8px' && x.dotH === '8px' && x.dotRad === '50%' && x.gap === '4px'), 'dots 8px round, 4px from the number');
    ok(enc.rows.every(x => x.color === 'rgb(232, 224, 208)' || /^rgb\(2[0-9]{2}, 2/.test(x.color)), 'numbers in cream (' + enc.rows[0].color + ')');
    ok(Math.abs(enc.top - 14) <= 1.5 && Math.abs(960 - enc.right - 14) <= 1.5, 'top-right, 14px in (demo) [top ' + enc.top.toFixed(1) + ', right ' + (960 - enc.right).toFixed(1) + ']');
    for (let i = 1; i < 5; i++) if (!(enc.rows[i].x > enc.rows[i - 1].x)) { ok(false, 'dots run left→right'); break; }
    const ai = await page.evaluate(() => { const g = document.getElementById('game').getBoundingClientRect(), k = g.width / 960; return (document.querySelector('#screen-encounter .enc-ai-bar').getBoundingClientRect().right - g.left) / k; });
    ok(ai <= enc.left - 4, 'the AI bar stops short of the HUD (' + ai.toFixed(0) + ' ≤ ' + enc.left.toFixed(0) + ')');
    // the widest the five can get (120 fuel / 115 hull caps) still clears the AI bar
    const wide = await page.evaluate(() => { STATE.items.push('expanded_fuel_tank', 'hull_plating'); Object.assign(STATE.resources, { fuel: 120, food: 100, o2: 100, hull: 115 }); renderHUD(); const g = document.getElementById('game').getBoundingClientRect(), k = g.width / 960; return { hud: (document.getElementById('hud-enc').getBoundingClientRect().left - g.left) / k, ai: (document.querySelector('#screen-encounter .enc-ai-bar').getBoundingClientRect().right - g.left) / k }; });
    ok(wide.ai <= wide.hud - 4, 'max-width HUD still clear of the AI bar (' + wide.ai.toFixed(0) + ' / ' + wide.hud.toFixed(0) + ')');
    await page.evaluate(() => { STATE.items = STATE.items.filter(i => i !== 'expanded_fuel_tank' && i !== 'hull_plating'); Object.assign(STATE.resources, { fuel: 62, food: 48, o2: 71, hull: 55 }); renderHUD(); });
    await shot(page, 'hud_encounter');

    // crit styling: a low resource's number turns red and its dot pulses
    const crit = await page.evaluate(() => {
      Object.assign(STATE.resources, { fuel: 10, hull: 20 }); renderHUD();
      const rows = [...document.getElementById('hud-enc').children];
      const f = s => ({ color: getComputedStyle(s).color, anim: getComputedStyle(s.firstElementChild).animationName, glow: getComputedStyle(s.firstElementChild).boxShadow });
      return { fuel: f(rows[0]), food: f(rows[1]), hull: f(rows[3]) };
    });
    ok(crit.fuel.color === 'rgb(255, 136, 120)' && crit.fuel.anim === 'hud-warn', 'crit: fuel 10 → red number, pulsing dot');
    ok(crit.hull.color === 'rgb(255, 136, 120)' && crit.hull.anim === 'hud-warn', 'crit: hull 20 (<30) → red');
    ok(crit.food.color !== 'rgb(255, 136, 120)' && crit.food.anim === 'none', 'food 48 stays calm');
    await shot(page, 'hud_encounter_crit');

    // map
    await page.evaluate(() => { Object.assign(STATE.resources, { fuel: 62, hull: 55 }); showScreen('screen-map'); renderMap(); renderHUD(); });
    const map = await readHud(page, 'hud-map');
    ok(map && map.rows.length === 5 && map.rows.map(x => x.dotBg).join() === DEMO_DOTS.join() && map.rows.every(x => /^(\d+|—)$/.test(x.text)), 'map: the same five, numbers only (' + (map && map.rows.map(x => x.text).join(' ')) + ')');
    ok(map.vis === 'visible' && map.size === '13px', 'map HUD visible, 13px');
    await shot(page, 'hud_map');

    // mining
    await page.evaluate(() => { openMining(() => {}); renderHUD(); });
    await page.waitForFunction(() => document.getElementById('overlay-mining').classList.contains('active'));
    const min = await readHud(page, 'hud-mining');
    ok(min && min.rows.length === 5 && min.rows.map(x => x.dotBg).join() === DEMO_DOTS.join() && min.rows.every(x => /^(\d+|—)$/.test(x.text)), 'mining: the same five, numbers only (' + (min && min.rows.map(x => x.text).join(' ')) + ')');
    await shot(page, 'hud_mining');
    await page.evaluate(() => { if (typeof abortMining === 'function') abortMining(); hideOverlay('overlay-mining'); });

    // engine room (its own demo box, the same five rows)
    await page.evaluate(() => { showScreen('screen-cruise'); openEngineRepair(() => {}); });
    await page.waitForFunction(() => document.getElementById('overlay-engrepair').classList.contains('active'));
    const er = await readHud(page, 'er-resources');
    ok(er && er.rows.length === 5 && er.rows.map(x => x.dotBg).join() === DEMO_DOTS.join() && er.rows.every(x => /^(\d+|—)$/.test(x.text)) && er.rows[0].text === '62', 'engine room: the same five, live numbers (' + (er && er.rows.map(x => x.text).join(' ')) + ')');
    ok(er.rows.map(x => x.tipTitle).join() === DEMO_TITLES.join(), 'engine room dots carry the tooltips too');
    await page.evaluate(() => { if (typeof abortEngineRepair === 'function') abortEngineRepair(); });
    await page.close();
  }

  console.log('— ruling 16: morale = crew average, "—" with nobody aboard');
  {
    const page = await boot();
    const mo = async v => page.evaluate(v => {
      if (typeof window.__realAvg === 'undefined') window.__realAvg = window.crewMoraleAvg;
      window.crewMoraleAvg = () => v; renderHUD();
      const row = document.getElementById('hud-enc').children[4];
      const r = { text: row.textContent.trim(), color: getComputedStyle(row).color, anim: getComputedStyle(row.firstElementChild).animationName, tip: Tooltip.resolve(row) };
      return { text: r.text, color: r.color, anim: r.anim, desc: r.tip.description, rows: (r.tip.rows || []).map(x => x.label + ' ' + x.value).join() };
    }, v);
    await page.evaluate(() => { enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001); });
    let m = await mo(63.4);
    ok(m.text === '63' && /^Average 63 \/ 100,Lowest /.test(m.rows), 'average 63.4 → "63" (' + m.rows + ')');
    m = await mo(22);
    ok(m.text === '22' && m.color === 'rgb(255, 136, 120)' && m.anim === 'hud-warn', 'average 22 (<30) → crit');
    m = await mo(null);
    ok(m.text === '—', 'no crew aboard → "—"');
    ok(m.color !== 'rgb(255, 136, 120)' && m.anim === 'none', '"—" carries no crit styling');
    ok(/No crew aboard/.test(m.desc) && m.rows === '', 'tooltip says why: ' + m.desc);
    await shot(page, 'hud_no_crew');
    await page.evaluate(() => { window.crewMoraleAvg = window.__realAvg; });
    await page.close();
  }

  console.log('— ruling 17: header — day counter stays, gold left of the inventory box');
  for (const vp of [{ width: 1280, height: 800 }, { width: 800, height: 560 }]) {
    const page = await boot(null, vp);
    const geo = () => page.evaluate(() => {
      const g = document.getElementById('game').getBoundingClientRect(), k = g.width / 960;
      const R = id => { const b = (typeof id === 'string' ? document.getElementById(id) : id).getBoundingClientRect(); return { l: (b.left - g.left) / k, r: (b.right - g.left) / k, t: (b.top - g.top) / k, b: (b.bottom - g.top) / k, cy: ((b.top + b.bottom) / 2 - g.top) / k }; };
      const day = document.getElementById('day-counter'), gold = document.getElementById('cruise-gold'), inv = document.getElementById('btn-inv'), tick = document.getElementById('header-ticker');
      const ds = getComputedStyle(day), gs = getComputedStyle(gold);
      // the text itself (a Range), so a ::before dot can't skew the centre
      const textBox = el => { const rg = document.createRange(); rg.selectNodeContents(el); const b = rg.getBoundingClientRect(); return ((b.top + b.bottom) / 2 - g.top) / k; };
      return { day: R(day), gold: R(gold), inv: R(inv), tick: R(tick), dayText: day.textContent, goldText: gold.textContent, dayVis: ds.visibility === 'visible' && ds.opacity === '1' && ds.display !== 'none', goldVis: gs.visibility === 'visible' && gs.opacity === '1' && gs.display !== 'none',
        dayFont: ds.fontFamily + ' ' + ds.fontSize, goldFont: gs.fontFamily + ' ' + gs.fontSize, dayCy: textBox(day), goldCy: textBox(gold), goldColor: gs.color,
        header: document.getElementById('cruise-header').textContent, stopped: document.body.classList.contains('stop-active'), purse: STATE.goldAmount + 'g', days: STATE.daysElapsed };
    });
    const tag = vp.width + '×' + vp.height;
    let h = await geo();
    ok(h.goldVis && h.goldText === h.purse, tag + ' gold in the header: ' + h.goldText);
    ok(h.gold.r <= h.inv.l && h.inv.l - h.gold.r < 24, tag + ' gold sits just left of the inventory box (' + h.gold.r.toFixed(1) + ' → ' + h.inv.l.toFixed(1) + ')');
    ok(h.tick.r <= h.gold.l + 0.5, tag + ' gold clear of the ticker');
    ok(h.goldFont === h.dayFont, tag + ' same font + size as the day text (' + h.goldFont + ')');
    ok(Math.abs(h.goldCy - h.dayCy) <= 1, tag + ' same vertical centre (gold ' + h.goldCy.toFixed(2) + ' / day ' + h.dayCy.toFixed(2) + ')');
    ok(h.goldColor === 'rgb(200, 168, 90)', tag + ' gold in gold (' + h.goldColor + ')');
    const goldElsewhere = await page.evaluate(() => [...document.querySelectorAll('#screen-cruise *')].filter(e => e.id !== 'cruise-gold' && e.offsetParent && e.children.length === 0 && new RegExp('^\\s*' + STATE.goldAmount + 'g\\s*$').test(e.textContent)).length);
    ok(goldElsewhere === 0, tag + ' gold shown once on the hub');
    // stop: day + days-left stay, don't tick
    await page.evaluate(() => document.getElementById('stop-btn').click());
    await page.waitForFunction(() => document.body.classList.contains('stop-active'));
    await page.waitForTimeout(1600); // a negative check: the clock must not move while stopped
    const s = await geo();
    ok(s.stopped && s.dayVis && /^DAY \d+ · \d+ LEFT$/.test(s.dayText), tag + ' stopped: ' + s.dayText + ' still shown');
    ok(s.dayText === h.dayText && s.days === h.days, tag + ' stopped: the day does not tick');
    ok(!/TIME PAUSED/.test(s.header), tag + ' stopped: no TIME PAUSED anywhere in the header');
    const tk = await page.evaluate(() => [...document.querySelectorAll('#header-ticker .ticker-text:not(.exit)')].pop().textContent);
    ok(/^STOPPED/.test(tk), tag + ' the ticker carries the signal (' + tk + ')');
    // paused (pause menu) too
    await page.evaluate(() => PauseBus.pause());
    await page.waitForTimeout(400);
    const p = await geo();
    ok(p.dayVis && p.dayText === h.dayText, tag + ' pause menu: the day counter stays');
    await page.evaluate(() => PauseBus.resume());
    // gold follows the purse (renderHUD keeps it current — market, rewards…)
    const g2 = await page.evaluate(() => { STATE.goldAmount += 37; renderHUD(); return document.getElementById('cruise-gold').textContent === STATE.goldAmount + 'g'; });
    ok(g2, tag + ' gold updates with the purse');
    const gt = await page.evaluate(() => { const t = Tooltip.resolve(document.getElementById('cruise-gold')); return t && t.title; });
    ok(gt === 'GOLD', tag + ' gold tooltip (GOLD)');
    if (vp.width === 1280) await shot(page, 'cruise_header_stopped');
    await page.close();
  }

  console.log('— ruling 18: bottom right 2 × 3 — FOOD/H2O/O2 | FUEL/HULL/STOP');
  const grid = page => page.evaluate(() => {
    const g = document.getElementById('game').getBoundingClientRect(), k = g.width / 960;
    const R = el => { const b = el.getBoundingClientRect(); return { l: (b.left - g.left) / k, r: (b.right - g.left) / k, t: (b.top - g.top) / k, b: (b.bottom - g.top) / k, w: b.width / k, h: b.height / k, cy: ((b.top + b.bottom) / 2 - g.top) / k }; };
    const host = document.getElementById('bottom-resources');
    const cells = [...host.children].filter(c => c.offsetParent).map(c => {
      const label = c.querySelector('span'), bar = label && label.nextElementSibling;
      return { label: label ? label.textContent : c.textContent.trim(), box: R(c), lab: label && R(label), bar: bar && R(bar), barH: bar && getComputedStyle(bar).height, labSize: label && getComputedStyle(label).fontSize, labColor: label && getComputedStyle(label).color, fillAnim: bar && getComputedStyle(bar.firstElementChild).animationName, fillW: bar && bar.firstElementChild.getBoundingClientRect().width / bar.getBoundingClientRect().width, button: c.tagName === 'BUTTON' };
    });
    const strip = R(document.getElementById('crew-strip')), crop = R(document.getElementById('crop-card-mini')), bottom = R(document.getElementById('cruise-bottom')), hostR = R(host);
    return { cells, strip, crop, bottom, host: hostR };
  });
  const layouts = [
    ['2 crew', { crew: ['engineer', 'medic'] }],
    ['1 crew', { crew: ['engineer'] }],
    ['captain only', { crew: [] }],
  ];
  for (const vp of [{ width: 1280, height: 800 }, { width: 800, height: 560 }]) {
    for (const [name, setup] of layouts) {
      const page = await boot(setup, vp);
      await page.evaluate(() => { Object.assign(STATE.resources, { fuel: 80, food: 60, water: 40, o2: 70, hull: 90 }); renderCruise(); });
      await page.waitForTimeout(350);
      const r = await grid(page);
      const tag = vp.width + '×' + vp.height + ' ' + name + ':';
      const c = r.cells, by = l => c.find(x => x.label === l) || c.find(x => new RegExp('^' + l + '$', 'i').test(x.label));
      const left = ['FOOD', 'H2O', 'O2'].map(by), right = [by('FUEL'), by('HULL'), c.find(x => x.button)];
      const okCells = c.length === 6 && left.every(Boolean) && right.every(Boolean);
      ok(okCells, tag + ' six cells: ' + c.map(x => x.label).join(', '));
      if (!okCells) { await page.close(); continue; }
      const sameX = col => col.every(x => Math.abs(x.box.l - col[0].box.l) < 1);
      const down = col => col[0].box.cy < col[1].box.cy && col[1].box.cy < col[2].box.cy;
      ok(sameX(left) && sameX(right) && right[0].box.l > left[0].box.r, tag + ' two columns: crew needs left, ship right');
      ok(down(left) && down(right) && [0, 1, 2].every(i => Math.abs(left[i].box.cy - right[i].box.cy) < 1.5), tag + ' three aligned rows, top→bottom FOOD/H2O/O2 and FUEL/HULL/Stop');
      ok([...left, right[0], right[1]].every(x => x.lab.r <= x.bar.l && Math.abs(x.lab.cy - x.bar.cy) < 2), tag + ' labels left of their bars, centred on them');
      ok([...left, right[0], right[1]].every(x => x.barH === '16px' && x.labSize === '8px'), tag + ' demo bar style: 16px bars, 8px labels');
      const minBar = Math.min(...[...left, right[0], right[1]].map(x => x.bar.w));
      ok(minBar >= 60, tag + ' wide bars (narrowest ' + minBar.toFixed(0) + 'px; the old 3-bar stack ran ~46px)');
      ok(r.host.l >= r.crop.r + 4 && r.crop.l >= r.strip.r && r.host.r <= r.bottom.r && r.host.b <= r.bottom.b + 0.5 && r.host.t >= r.bottom.t, tag + ' fits the band, clear of the crew + crop cards');
      ok(right[2].box.w >= right[0].box.w - 1 && right[2].box.h >= 18, tag + ' Stop fills its cell (' + right[2].box.w.toFixed(0) + '×' + right[2].box.h.toFixed(0) + ')');
      const fills = await page.evaluate(() => ['food', 'water', 'o2', 'fuel', 'hull'].map(k => Math.round(parseFloat(document.getElementById('res-fill-' + k).style.width))));
      ok(Math.abs(fills[0] - 60) <= 2 && Math.abs(fills[1] - 40) <= 2 && Math.abs(fills[2] - 70) <= 2 && Math.abs(fills[3] - 80) <= 2 && Math.abs(fills[4] - 90) <= 2, tag + ' fills = food 60 / water 40 / O2 70 / fuel 80 / hull 90 (' + fills.join('/') + ')');
      const hues = await page.evaluate(() => ({ water: getComputedStyle(document.getElementById('res-fill-water')).backgroundColor, o2: getComputedStyle(document.getElementById('res-fill-o2')).backgroundColor, pause: !!document.querySelector('#screen-cruise .header-actions button:not(#btn-inv):not(#btn-map)') }));
      ok(hues.water !== hues.o2, tag + ' H2O and O2 bars are different colours (' + hues.water + ' / ' + hues.o2 + ')');
      ok(!hues.pause, tag + ' no II pause button in the header (STOP stops time; Esc opens the menu)');
      if (vp.width === 1280 && name === '2 crew') await shot(page, 'cruise_bottom');
      await page.close();
    }
  }

  console.log('— ruling 18: Stop / Resume keeps its behaviour; low bars carry the crit pulse');
  {
    const page = await boot();
    const label = () => page.evaluate(() => { const b = [...document.querySelectorAll('#bottom-resources button')][0]; return { text: b.textContent, stopped: document.body.classList.contains('stop-active'), menu: getComputedStyle(document.getElementById('stop-menu')).display }; });
    await page.evaluate(() => [...document.querySelectorAll('#bottom-resources button')][0].click());
    let s = await label();
    ok(s.text === 'Resume' && s.stopped, 'the grid\'s button stops the ship → Resume');
    const at = await page.evaluate(() => STATE.currentId);
    const res = await page.evaluate(() => { const ids = [...nextAvailableNodes()]; if (ids.length !== 1) return { skip: true }; [...document.querySelectorAll('#bottom-resources button')][0].click(); return { moved: STATE.currentId !== undefined }; });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ id: STATE.currentId, ev: STATE.currentEvent && STATE.currentEvent.id, scr: document.querySelector('.screen.active').id }));
    ok(res.skip || after.id !== at, 'Resume travels on (' + at + ' → ' + after.id + ')');
    // Forced-event: Resume blocked + shake (behaviour kept). The forced
    // state now lives only through the alert flash before the event opens
    // (owner ruling 46a), so it is armed by hand here, without a repaint
    // (renderCruise would open the event at once).
    const p2 = await boot();
    const fb = await p2.evaluate(() => {
      STATE.forcedEvent = { kind: 'pirate', ev: 'event_encounter_pirate_001', node: STATE.currentId };
      document.body.classList.add('event-active');
      openStopMenu(); // a forced event only ever arrives mid-wait, stopped
      const b = [...document.querySelectorAll('#bottom-resources button')][0];
      const at = STATE.currentId; b.click();
      return { moved: STATE.currentId !== at, shaking: document.getElementById('screen-cruise').classList.contains('shaking'), text: b.textContent };
    });
    ok(!fb.moved && fb.shaking && fb.text === 'Resume', 'a forced event still blocks Resume (shake), button reads Resume');
    const red = await p2.waitForFunction(() => getComputedStyle([...document.querySelectorAll('#bottom-resources button')][0]).borderTopColor === 'rgb(204, 51, 51)', null, { timeout: 4000 }).then(() => true).catch(() => false);
    ok(red, 'forced state: the button pulses red');
    await p2.evaluate(() => { STATE.forcedEvent = null; });
    await p2.close();
    // crit on the bars (fuel/food/water/O2 <25, hull <30)
    const cr = await page.evaluate(() => {
      showScreen('screen-cruise'); document.body.classList.remove('stop-active');
      Object.assign(STATE.resources, { fuel: 80, food: 20, water: 60, o2: 10, hull: 29 }); renderCruise();
      return [...document.querySelectorAll('#bottom-resources .res')].map(r => { const l = r.firstElementChild, f = r.querySelector('.res-fill'); return l.textContent + ':' + (getComputedStyle(l).color === 'rgb(255, 136, 120)' ? 'red' : 'calm') + ':' + getComputedStyle(f).animationName; });
    });
    ok(cr.join() === 'FOOD:red:hud-warn,H2O:calm:none,O2:red:hud-warn,FUEL:calm:none,HULL:red:hud-warn', 'crit bars: ' + cr.join(' '));
    // a change that only re-renders the HUD (market, effort tax) still moves the bars
    const live = await page.evaluate(() => { STATE.resources.hull = 50; renderHUD(); return Math.round(parseFloat(document.getElementById('res-fill-hull').style.width) * resMax('hull') / 100); });
    ok(Math.abs(live - 50) <= 2, 'renderHUD() repaints the bars too (hull ' + live + '%)');
    // bar tooltips for the two new bars
    const tips = await page.evaluate(() => ['o2', 'hull'].map(k => Tooltip.resolve(document.querySelector('#bottom-resources .res.' + k)).description));
    ok(/^Oxygen: \d+ \/ 100$/.test(tips[0]) && /^Hull: \d+ \/ \d+$/.test(tips[1]), 'O2 / HULL bar hovers: ' + tips.join(' · '));
    await shot(page, 'cruise_bottom_crit');
    await page.close();
  }

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\nparity_hud: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
