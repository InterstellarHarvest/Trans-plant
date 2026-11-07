// Rulings 142–143: mishaps. A leg can bring one; its effects land at once,
// the cruise stops on a popup that must be acknowledged (no ESC, no ✕), the
// Ship's Log keeps it in red, a reload shows the same popup and applies
// nothing twice, and acknowledging plays the stop's arrival. Odds scale with
// the trail and the hull band; a fix lands when its role is aboard.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const MURL = URL.replace(/index\.html.*$/, 'index.html') + '?mishaps=1'; // automated browsers get mishaps only when they ask
const KEY = 'transplant_save_v1';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(MURL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.mishaps && MOD.items && MOD.crew_roster && typeof rollMishap === 'function');

  console.log('— the module and the odds');
  const shape = await page.evaluate(() => {
    const M = MOD.mishaps, bad = [];
    for (const m of M.mishaps) {
      if (!/^mishap_/.test(m.id)) bad.push(m.id + ': id');
      for (const t of ['minor', 'moderate', 'severe']) if (!m[t] || !m[t].text) bad.push(m.id + ': ' + t);
    }
    return { n: M.mishaps.length, bad, kinds: [...new Set(M.mishaps.map(m => m.kind))].sort().join(',') };
  });
  ok(shape.n >= 20 && !shape.bad.length, `${shape.n} mishaps, every tier written (${shape.bad.join('; ') || 'ok'})`);
  ok(/captain/.test(shape.kinds) && /fuel/.test(shape.kinds) && /hull/.test(shape.kinds) && /o2/.test(shape.kinds), 'hull, oxygen, fuel and the captain all have mishaps: ' + shape.kinds);

  const odds = await page.evaluate(() => {
    const out = {};
    for (const t of ['lunar', 'mars', 'interstellar']) {
      applySetupToState({ trail: t, ai: 'marv', captain: 'veteran', crew: ['pilot', 'engineer'], crop: 'wheat', ship: 'Q' });
      STATE.resources.hull = 100; const healthy = mishapLegChance();
      STATE.resources.hull = 40; const cracked = mishapLegChance();
      STATE.resources.hull = 20; const failing = mishapLegChance();
      out[t] = { healthy, cracked, failing };
    }
    return out;
  });
  ok(odds.lunar.healthy < odds.mars.healthy && odds.mars.healthy < odds.interstellar.healthy, `odds rise Lunar → Mars → Interstellar (${['lunar', 'mars', 'interstellar'].map(t => odds[t].healthy.toFixed(3)).join(' / ')})`);
  ok(odds.mars.healthy < odds.mars.cracked && odds.mars.cracked < odds.mars.failing, `a cracked hull raises them (ruling 143): Mars ${odds.mars.healthy.toFixed(3)} → ${odds.mars.cracked.toFixed(3)} → ${odds.mars.failing.toFixed(3)}`);

  console.log('— a leg with a mishap');
  // Force one: odds 1, a known mishap and tier, no fixer aboard.
  const before = await page.evaluate(() => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['pilot', 'medic'], crop: 'wheat', ship: 'Q' });
    STATE.stowaway = null; returnToHub();
    MOD.mishaps.odds.per_leg.mars = 1; MOD.mishaps.odds.max_per_leg = 1; // forced: no 95% cap
    window.__keep = MOD.mishaps.mishaps;
    MOD.mishaps.mishaps = window.__keep.filter(m => m.id === 'mishap_hull_pinhole');
    MOD.mishaps.odds.severity.mars = { minor: 0, moderate: 1, severe: 0 };
    return { o2: STATE.resources.o2, hull: STATE.resources.hull, day: STATE.daysElapsed };
  });
  await page.evaluate(() => { document.body.classList.remove('stop-active'); const nx = [...nextAvailableNodes()][0]; travelTo(nx); });
  await page.waitForTimeout(500);
  const pop = await page.evaluate(() => ({
    open: document.getElementById('overlay-mishap').classList.contains('active'),
    title: (document.querySelector('#overlay-mishap .mishap-title') || {}).textContent,
    fx: [...document.querySelectorAll('#overlay-mishap .mishap-fx')].map(x => x.textContent).join(' '),
    screen: document.querySelector('.screen.active').id, ev: STATE.currentEvent && STATE.currentEvent.id,
    o2: STATE.resources.o2, hull: STATE.resources.hull, pending: !!STATE.pendingMishap,
    log: (STATE.shipLog || []).filter(e => e.type === 'mishap').map(e => e.text),
    red: !!document.querySelector('#ai-log .ai-entry.mishap'),
  }));
  ok(pop.open && /PINHOLE BREACH/.test(pop.title), 'the popup opens on the cruise: ' + pop.title);
  ok(pop.screen === 'screen-cruise' && !pop.ev, 'the stop waits: still on the cruise, no event yet');
  // (the leg's own air draw comes off O2 too: the hull, which nothing else touches, is the clean check)
  const hullCost = Math.round(before.hull - pop.hull), o2Fx = await page.evaluate(() => (STATE.pendingMishap.effects.find(e => e.k === 'O2') || {}).d);
  // Costs scale by the trail's cost_mult (ruling 142; Mars ×1.15).
  const cm = await page.evaluate(() => MOD.mishaps.odds.cost_mult.mars);
  const wantO2 = Math.round(-6 * cm), wantHull = Math.round(3 * cm);
  ok(o2Fx === wantO2 && hullCost === wantHull && pop.pending, `the moderate tier's cost landed at once (O2 ${o2Fx}, hull −${hullCost} on Mars ×${cm})`);
  ok(new RegExp('−' + -wantO2 + ' O2').test(pop.fx) && new RegExp('−' + wantHull + ' HULL').test(pop.fx), 'the popup states the cost: ' + pop.fx);
  ok(pop.log.length === 1 && /PINHOLE BREACH/.test(pop.log[0]) && pop.red, "the Ship's Log keeps it, in red on the cruise log");

  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.getElementById('overlay-mishap').classList.contains('active') && !document.body.classList.contains('pause-open')), 'ESC neither closes it nor opens the pause menu');
  ok(await page.evaluate(() => !document.querySelector('#overlay-mishap .modal-x, #overlay-mishap [data-esc-close]')), 'no ✕: one ACKNOWLEDGED button');

  console.log('— a reload on the popup');
  const saved = await page.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); return { pm: !!s.pendingMishap, pa: !!s.pendingArrival, o2: s.resources.o2 }; }, KEY);
  ok(saved.pm && saved.pa && Math.round(saved.o2) === Math.round(pop.o2), 'saved with the popup and the arrival pending, the cost already in');
  await page.reload();
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.mishaps && document.getElementById('btn-continue'));
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => document.getElementById('title-buttons').classList.contains('visible'))) break;
    if (i % 10 === 0) await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(600);
  await page.click('#btn-continue');
  await page.keyboard.press('x');
  await page.waitForFunction(() => !document.getElementById('screen-title').classList.contains('active'));
  await page.waitForTimeout(800);
  const back = await page.evaluate(() => ({ open: document.getElementById('overlay-mishap').classList.contains('active'), o2: STATE.resources.o2, n: (STATE.shipLog || []).filter(e => e.type === 'mishap').length, title: (document.querySelector('#overlay-mishap .mishap-title') || {}).textContent }));
  ok(back.open && /PINHOLE/.test(back.title), 'Continue lands on the same popup');
  ok(Math.round(back.o2) === Math.round(pop.o2) && back.n === 1, 'nothing applied twice (O2 ' + Math.round(back.o2) + ', one log line)');

  console.log('— acknowledged');
  await page.click('#mishap-ack');
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({ open: document.getElementById('overlay-mishap').classList.contains('active'), modal: document.body.classList.contains('modal-open'), pending: !!STATE.pendingMishap, pa: !!STATE.pendingArrival, screen: document.querySelector('.screen.active').id, ev: STATE.currentEvent && STATE.currentEvent.id }));
  ok(!after.open && !after.modal && !after.pending && !after.pa, 'the popup closes and nothing is left pending');
  ok(after.screen === 'screen-encounter' || after.screen === 'screen-cruise', 'the stop plays on: ' + after.screen + (after.ev ? ' ' + after.ev : ''));

  console.log('— a fix, a lethal leg, the hull band');
  const fix = await page.evaluate(() => {
    window.__keep = MOD.mishaps.mishaps; // a fresh page since the reload
    const m = MOD.mishaps.mishaps.find(x => x.id === 'mishap_fuel_line');
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'Q' });
    STATE.stowaway = null;
    MOD.mishaps.mishaps = [m]; MOD.mishaps.odds.per_leg.mars = 1; MOD.mishaps.odds.max_per_leg = 1; MOD.mishaps.odds.severity.mars = { minor: 0, moderate: 0, severe: 1 };
    const f0 = STATE.resources.fuel; STATE.mishapLastLeg = null;
    const v = rollMishap(STATE.nodes[1]);
    return { fixedBy: v && v.fixedBy, cost: Math.round(f0 - STATE.resources.fuel), want: Math.round(-(m.severe.fixed.resources || {}).fuel * MOD.mishaps.odds.cost_mult.mars), text: v && v.text };
  });
  ok(fix.fixedBy === 'engineer' && fix.cost === fix.want && /Kazuki|engineer/i.test(fix.text), `an engineer aboard turns the severe leak into a small one (−${fix.cost} fuel, not −16): ${String(fix.text).slice(0, 60)}…`);
  const cd = await page.evaluate(() => { const v = rollMishap(STATE.nodes[1]); return !!v; });
  ok(!cd, 'never two legs running (cooldown)');
  const lethal = await page.evaluate(() => {
    MOD.mishaps.mishaps = [window.__keep.find(x => x.id === 'mishap_hull_pinhole')];
    MOD.mishaps.odds.severity.mars = { minor: 0, moderate: 0, severe: 1 };
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['pilot'], crop: 'wheat', ship: 'Q' });
    STATE.stowaway = null; returnToHub();
    STATE.resources.hull = 5; STATE.mishapLastLeg = null;
    document.body.classList.remove('stop-active');
    travelTo([...nextAvailableNodes()][0]);
    return { pop: document.getElementById('overlay-mishap').classList.contains('active'), hull: STATE.resources.hull, ended: !!STATE.ended };
  });
  ok(lethal.pop && lethal.hull === 0 && !lethal.ended, 'a mishap that breaks the hull shows its popup first (hull ' + lethal.hull + ')');
  await page.click('#mishap-ack'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => STATE.ended && document.getElementById('screen-end').classList.contains('active')), '…and acknowledging it ends the run (BREACH)');

  const band = await page.evaluate(() => {
    MOD.mishaps.mishaps = window.__keep;
    applySetupToState({ trail: 'interstellar', ai: 'marv', captain: 'veteran', crew: ['pilot', 'medic'], crop: 'wheat', ship: 'Q' });
    const n = { healthy: 0, failing: 0 }, sev = { healthy: 0, failing: 0 };
    MOD.mishaps.odds.per_leg.interstellar = 1;
    MOD.mishaps.odds.severity.interstellar = { minor: 38, moderate: 42, severe: 20 };
    for (const [k, hull] of [['healthy', 100], ['failing', 20]]) for (let i = 0; i < 400; i++) {
      STATE.resources = { fuel: 100, food: 100, water: 100, o2: 100, hull }; STATE.mishapLastLeg = null; STATE.shipLog = [];
      STATE.captainHP = 100; STATE.crewHP = { pilot: 100, medic: 100 };
      const v = rollMishap(STATE.nodes[1]);
      if (v && v.id.startsWith('mishap_hull')) { n[k]++; if (v.tier === 'severe') sev[k]++; }
    }
    return { n, sev };
  });
  ok(band.n.failing > band.n.healthy * 2, `under 25 hull, hull mishaps dominate (${band.n.healthy} → ${band.n.failing} of 400)`);
  ok(band.sev.failing / Math.max(1, band.n.failing) > 1.5 * band.sev.healthy / Math.max(1, band.n.healthy), `…and the severe ones are likelier (${band.sev.healthy}/${band.n.healthy} → ${band.sev.failing}/${band.n.failing})`);

  const off = await (async () => {
    const p2 = await browser.newPage();
    await p2.goto(URL);
    await p2.waitForFunction(() => typeof MOD !== 'undefined' && MOD.mishaps && typeof rollMishap === 'function');
    const r = await p2.evaluate(() => mishapsEnabled());
    await p2.close();
    return r;
  })();
  ok(off === false, 'an automated browser gets none unless it asks (?mishaps=1): the batteries stay deterministic');

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
