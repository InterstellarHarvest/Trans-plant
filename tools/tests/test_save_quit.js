// Reload counts as quit (owner rule): for every job, a real page reload and
// the title's Continue land exactly what ✕ QUIT (after BEGIN) lands in game —
// the days, the materials, items and gold (nothing gained), the HP and the
// harm already taken in play — and a second reload doesn't apply it twice.
// Jobs: the Stop-menu minigames (SALVAGE, SCAN, FORAGE, MINE, REPAIR), the
// event minigames (Engine Fault event_crisis_025 among them), combat (mid-
// fight and the defeat beat), WAIT/REST (the interrupt, trader and rest
// flashes) and the fabricator craft.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const KEY = 'transplant_save_v1';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];

async function open(setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('pageerror', e => errors.push(String(e.stack || e.message).slice(0, 300)));
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['pilot', 'engineer'], crop: 'wheat', ship: 'Q' }, o));
    STATE.stowaway = null;
    returnToHub();
  }, setup || {});
  await page.waitForTimeout(300);
  return page;
}
// The player's path back: the page is gone; a key dismisses the poster,
// the buttons light, Continue resumes the save.
async function reloadContinue(page) {
  await page.reload();
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor && document.getElementById('btn-continue'));
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => document.getElementById('title-buttons').classList.contains('visible'))) break;
    if (i % 10 === 0) await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  }
  await page.waitForSelector('#title-buttons.visible', { timeout: 20000 });
  await page.click('#btn-continue');
  await page.waitForFunction(() => !document.getElementById('screen-title').classList.contains('active'));
  await page.waitForTimeout(700);
}
// Puts the ship at a plain stop of the given type and saves there.
const setNode = (page, type) => page.evaluate(t => {
  const n = STATE.nodes.find(x => x.node_type !== 'fork' && x.node_type !== 'station' && x.id !== STATE.nodes[0].id);
  n.node_type = t; STATE.currentId = n.id; STATE.traderAt = {}; STATE.traderAt[n.id] = false; STATE.forcedEvent = null;
  returnToHub(); saveRun();
}, type);
const snap = page => page.evaluate(() => ({
  day: STATE.daysElapsed, fuel: STATE.resources.fuel, hull: STATE.resources.hull, food: STATE.resources.food, water: STATE.resources.water, o2: STATE.resources.o2,
  morale: crewMoraleRaw(), gold: STATE.goldAmount, mats: Object.assign({}, STATE.materials), items: STATE.items.slice().sort(),
  hp: Object.assign({ captain: captainHPOf() }, STATE.crewHP), crew: STATE.crew.slice(), ended: !!STATE.ended,
  scr: (document.querySelector('.screen.active') || {}).id, ev: STATE.currentEvent && STATE.currentEvent.id,
  log: (STATE.shipLog || []).slice(-3).map(e => (e && e.text) || e).join(' | '),
}));
const savedRaw = page => page.evaluate(k => localStorage.getItem(k), KEY);
const marker = page => page.evaluate(k => { try { const s = JSON.parse(localStorage.getItem(k)); const o = {}; for (const x of Object.keys(s)) if (/^pending/.test(x)) o[x] = s[x]; return o; } catch (e) { return {}; } }, KEY);
// Back to the exact save a section started from (a real reload + Continue).
async function restore(page, raw) {
  await page.evaluate(([k, r]) => localStorage.setItem(k, r), [KEY, raw]);
  await reloadContinue(page);
}
const hpSum = s => Object.entries(s.hp).filter(([r]) => r === 'captain' || s.crew.includes(r)).reduce((a, [, v]) => a + v, 0);
const matSum = s => Object.values(s.mats).reduce((a, b) => a + (b || 0), 0);
// What a settlement changed: the comparable shape of B − A.
function delta(a, b) {
  const mats = {};
  for (const k of new Set([...Object.keys(a.mats), ...Object.keys(b.mats)])) { const d = (b.mats[k] || 0) - (a.mats[k] || 0); if (d) mats[k] = d; }
  return { days: b.day - a.day, mats: JSON.stringify(mats), items: JSON.stringify(b.items) === JSON.stringify(a.items) ? '=' : b.items.join(','), gold: b.gold - a.gold,
    hull: Math.round(b.hull - a.hull), fuel: Math.round(b.fuel - a.fuel), hp: hpSum(b) - hpSum(a) };
}
const same = (x, y, keys) => keys.every(k => x[k] === y[k]);
const fmt = d => JSON.stringify(d);
const nothingGained = (a, b) => b.gold <= a.gold && matSum(b) <= matSum(a) && b.items.length <= a.items.length && Object.entries(b.mats).every(([k, v]) => v <= (a.mats[k] || 0));
const stopVerb = async (page, re) => {
  await page.evaluate(() => { document.body.classList.remove('stop-active'); document.getElementById('stop-btn').textContent = 'Stop'; returnToHub(); });
  await page.waitForTimeout(200);
  const r = await page.evaluate(src => {
    const b = [...document.querySelectorAll('#stop-choices .stop-choice')].find(x => new RegExp(src).test(x.textContent) && !x.classList.contains('locked'));
    if (!b) return [...document.querySelectorAll('#stop-choices .stop-choice')].map(x => x.textContent.replace(/\s+/g, ' ').slice(0, 30)).join(' | ');
    b.click(); return true;
  }, re);
  await page.waitForTimeout(400);
  return r;
};
// After a reload settles a job: a second reload is a plain hub load.
async function secondReload(page, label, b) {
  await reloadContinue(page);
  const c = await snap(page);
  ok(c.day === b.day && hpSum(c) === hpSum(b) && JSON.stringify(c.mats) === JSON.stringify(b.mats) && c.gold === b.gold && JSON.stringify(c.items) === JSON.stringify(b.items) && c.fuel === b.fuel && c.hull === b.hull,
    `${label}: a second reload applies nothing again (day ${b.day} → ${c.day}, HP ${hpSum(b)} → ${hpSum(c)})`);
}

(async () => {
  browser = await chromium.launch();

  // ═══ Stop-menu minigames: SALVAGE, SCAN ═══
  for (const [type, re, label] of [['derelict', 'SALVAGE', 'SALVAGE'], ['nebula', 'SCAN', 'SCAN']]) {
    console.log(`— ${label}: reload after BEGIN = ✕ QUIT`);
    const page = await open();
    await page.evaluate(() => { STATE.materials = { metal: 3, scrap: 2 }; });
    await setNode(page, type);
    const raw = await savedRaw(page);
    const a = await snap(page);
    ok(await stopVerb(page, re) === true, `${label} offered`);
    await page.click('#rstart'); await page.waitForTimeout(1200);
    await page.click('#mclose'); await page.waitForTimeout(400);
    const q = await snap(page);
    await restore(page, raw);
    const a2 = await snap(page);
    await stopVerb(page, re);
    await page.click('#rstart'); await page.waitForTimeout(1200);
    ok(!!(await marker(page)).pendingAbandon, `${label}: BEGIN saves the quit marker`);
    await reloadContinue(page);
    const r = await snap(page);
    const dq = delta(a, q), dr = delta(a2, r);
    ok(same(dq, dr, ['days', 'mats', 'items', 'gold', 'hp', 'hull', 'fuel']) && dq.days >= 1, `${label}: reload ${fmt(dr)} = quit ${fmt(dq)}`);
    ok(nothingGained(a2, r) && /abandoned partway/.test(r.log), `${label}: nothing gained, logged as abandoned`);
    await secondReload(page, label, r);
    await page.close();
  }

  // ═══ FORAGE: the poisoning taken so far stays ═══
  console.log('— FORAGE: reload after a poisoning = ✕ QUIT, the poisoning kept');
  {
    const page = await open();
    await setNode(page, 'planet');
    const raw = await savedRaw(page);
    // Click every target until a decoy lands; the marker carries the harm.
    const playToPoison = async () => {
      ok(await stopVerb(page, 'GATHER|FORAGE|HUNT|SCAVENGE') === true, 'the forage verb is offered');
      await page.click('#rstart'); await page.waitForTimeout(300);
      for (let k = 0; k < 300; k++) {
        const m = await marker(page);
        if (m.pendingAbandon && m.pendingAbandon.harm && m.pendingAbandon.harm.poison.length) return m.pendingAbandon.harm.poison.length;
        await page.evaluate(() => { for (const s of document.querySelectorAll('[id^=fa]')) s.click(); });
        await page.waitForTimeout(80);
      }
      return 0;
    };
    const a = await snap(page);
    const nq = await playToPoison();
    await page.click('#mclose'); await page.waitForTimeout(400);
    const q = await snap(page);
    await restore(page, raw);
    const a2 = await snap(page);
    const nr = await playToPoison();
    await reloadContinue(page);
    const r = await snap(page);
    const dq = delta(a, q), dr = delta(a2, r);
    ok(nq > 0 && dq.hp === -20 * nq, `✕ QUIT keeps the poisoning (${nq} × −20 HP: ${dq.hp})`);
    ok(nr > 0 && dr.hp === -20 * nr, `reload keeps it too (${nr} × −20 HP: ${dr.hp})`);
    ok(same(dq, dr, ['days', 'mats', 'items', 'gold', 'hull', 'fuel']) && dq.hp / nq === dr.hp / nr, `reload ${fmt(dr)} = quit ${fmt(dq)}`);
    ok(nothingGained(a2, r) && r.food <= a2.food && /poisoning stays/.test(r.log), 'nothing gained (no food), the poisoning logged');
    await secondReload(page, 'FORAGE', r);
    await page.close();
  }

  // ═══ MINE: no ✕ mid-run — a reload is the quit rule (a day a run, nothing kept) ═══
  console.log('— MINE: reload mid-run = nothing kept, the run\'s day spent');
  {
    const page = await open();
    await setNode(page, 'asteroid_field');
    const a = await snap(page);
    ok(await stopVerb(page, '^\\s*MINE|MINE') === true, 'MINE offered');
    await page.evaluate(() => {
      const chip = document.querySelector('#mining-choices .crew-chip'); if (chip) chip.click();
      [...document.querySelectorAll('#mining-choices .enc-choice')].find(b => /BEGIN/.test(b.textContent)).click();
    });
    await page.waitForTimeout(800);
    // Break a few rocks first: the haul in hand is not kept.
    for (let i = 0; i < 6; i++) { await page.evaluate(() => { const r = document.querySelector('.mine-asteroid'); if (r) r.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await page.waitForTimeout(150); }
    ok((await marker(page)).pendingAbandon && (await marker(page)).pendingAbandon.verb === 'MINE', 'BEGIN MINING saves the quit marker');
    await reloadContinue(page);
    const r = await snap(page);
    const dr = delta(a, r);
    ok(dr.days === 1 && dr.mats === '{}' && nothingGained(a, r) && /MINE — abandoned partway/.test(r.log), `reload mid-run: one day, nothing kept ${fmt(dr)}`);
    await secondReload(page, 'MINE', r);
    await page.close();
  }

  // ═══ REPAIR ═══
  console.log('— REPAIR: reload after a fault is cleared = ABANDON REPAIRS');
  {
    const page = await open();
    await setNode(page, 'void');
    await page.evaluate(() => { STATE.resources.hull = 50; STATE.materials = { metal: 4, scrap: 2 }; returnToHub(); saveRun(); });
    const raw = await savedRaw(page);
    const fixOne = async () => {
      ok(await stopVerb(page, 'REPAIR') === true, 'REPAIR offered');
      await page.waitForFunction(() => document.getElementById('overlay-engrepair').classList.contains('active'));
      await page.evaluate(async () => {
        document.getElementById('er-hs-breaker').click();
        await new Promise(r => setTimeout(r, 100));
        for (const id of ['B1', 'B2', 'B3', 'B4']) document.getElementById('er-br-' + id).click();
      });
      await page.waitForFunction(() => document.getElementById('er-hs-breaker').classList.contains('fixed'));
    };
    const a = await snap(page);
    await fixOne();
    await page.evaluate(() => document.getElementById('er-ec-abandon').click());
    await page.waitForTimeout(400);
    const q = await snap(page);
    await restore(page, raw);
    const a2 = await snap(page);
    await fixOne();
    // Nothing during the job may overwrite the marker (a save there lacked it).
    const blocked = await page.evaluate(() => ({ save: saveRun(), why: saveBlockedReason() }));
    ok(blocked.save === false && blocked.why === 'FINISH THE JOB FIRST', `no save mid-REPAIR (saveRun ${blocked.save}, pause SAVE: ${blocked.why})`);
    ok(!!(await marker(page)).pendingAbandon, 'the quit marker stands');
    await reloadContinue(page);
    const r = await snap(page);
    const dq = delta(a, q), dr = delta(a2, r);
    ok(same(dq, dr, ['days', 'mats', 'items', 'gold', 'hp', 'hull', 'fuel']) && dq.days === 1 && dq.hull === 0, `reload ${fmt(dr)} = abandon ${fmt(dq)}`);
    await secondReload(page, 'REPAIR', r);
    await page.close();
  }

  // ═══ Event minigames ═══
  const EVENT_JOBS = [
    { id: 'event_crisis_025', text: 'Run the restart sequence yourself' },
    { id: 'event_crisis_017' },
    { id: 'event_crisis_015', medical: true },
  ];
  {
    const p0 = await open();
    const brace = await p0.evaluate(() => { const e = Object.values(EVENTS).find(x => (x.choices || []).some(c => c.launch_minigame === 'brace')); return e && e.id; });
    await p0.close();
    if (brace) EVENT_JOBS.push({ id: brace });
  }
  for (const job of EVENT_JOBS) {
    console.log(`— ${job.id}: reload after BEGIN = ✕ QUIT`);
    const page = await open({ crew: ['pilot', 'engineer'] });
    await setNode(page, 'void');
    await page.evaluate(() => { setHP('pilot', 70); setCrewMorale(60); STATE.resources.hull = 60; STATE.resources.fuel = 60; saveRun(); });
    const raw = await savedRaw(page);
    const play = async () => {
      const t = await page.evaluate(async j => {
        const ev = EVENTS[j.id];
        STATE.seenEventIds.delete(j.id);
        enterEvent(STATE.byId[STATE.currentId], ev);
        await new Promise(r => setTimeout(r, 300));
        if (typeof finishAllTyping === 'function') finishAllTyping();
        const ch = ev.choices.find(c => c.launch_minigame && (!j.text || c.text === j.text));
        const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => x.textContent.includes(ch.text.slice(0, 24)));
        b.click();
        return ch.launch_minigame;
      }, job);
      await page.waitForSelector('#rstart'); await page.click('#rstart');
      await page.waitForTimeout(job.medical ? 8000 : 900);
      return t;
    };
    const a = await snap(page);
    const game = await play();
    const mq = await marker(page);
    await page.click('#mclose'); await page.waitForTimeout(400);
    const title = await page.evaluate(() => document.getElementById('enc-narr-title').textContent);
    await page.evaluate(() => { const b = document.querySelector('#enc-choices .enc-choice.advance'); b && b.click(); });
    await page.waitForTimeout(500);
    const q = await snap(page);
    await restore(page, raw);
    const a2 = await snap(page);
    await play();
    const mr = await marker(page);
    ok(mr.pendingEventQuit && mr.pendingEventQuit.ev === job.id, `${game}: BEGIN saves the quit marker`);
    await reloadContinue(page);
    const r = await snap(page);
    const dq = delta(a, q), dr = delta(a2, r);
    ok(title === 'ABANDONED' && !r.ev && r.scr === 'screen-cruise', `${game}: ✕ is ABANDONED, the reload lands at the hub`);
    if (job.medical) {
      // The patient's HP lost on the table stays lost (−N as of the quit).
      const lossQ = mq.pendingEventQuit.harm ? mq.pendingEventQuit.harm.startingHp - mq.pendingEventQuit.harm.hp : 0;
      const lossR = mr.pendingEventQuit.harm ? mr.pendingEventQuit.harm.startingHp - mr.pendingEventQuit.harm.hp : 0;
      ok(lossR > 0 && q.hp.pilot <= a.hp.pilot - lossQ && r.hp.pilot === a2.hp.pilot - lossR, `the patient's drain stays: quit ${a.hp.pilot}→${q.hp.pilot}, reload ${a2.hp.pilot}→${r.hp.pilot} (marker −${lossR})`);
      ok(Math.abs(dq.hp - dr.hp) <= 3 && same(dq, dr, ['days', 'mats', 'items', 'gold', 'hull', 'fuel']), `reload ${fmt(dr)} = quit ${fmt(dq)} (HP within the drain between marker and ✕)`);
    } else {
      ok(same(dq, dr, ['days', 'mats', 'items', 'gold', 'hp', 'hull', 'fuel']) && Math.abs((q.morale - a.morale) - (r.morale - a2.morale)) < 0.01, `reload ${fmt(dr)} = quit ${fmt(dq)}`);
    }
    ok(nothingGained(a2, r) && dr.days >= 1, `${game}: nothing gained, the time spent (${dr.days}d)`);
    await secondReload(page, job.id, r);
    await page.close();
  }

  // ═══ Combat ═══
  const startFight = (page, hull) => page.evaluate(async h => {
    STATE.resources.hull = h; STATE.resources.fuel = 60;
    enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001);
    await new Promise(r => setTimeout(r, 300));
    window.triggerCombat({});
    await new Promise(r => setTimeout(r, 1200));
  }, hull);
  const fire = page => page.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')].find(x => /FIRE|CENTER/i.test(x.textContent)); if (b) b.click(); return !!b; });

  // A reload with the settle's dice fixed at 0.5: no pilot (3 charge
  // turns), every volley lands (0.5 ≥ the 35% drive miss), 15 damage each.
  async function reloadContinueFixed(page) {
    await page.reload();
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor && document.getElementById('btn-continue'));
    for (let i = 0; i < 60; i++) {
      if (await page.evaluate(() => document.getElementById('title-buttons').classList.contains('visible'))) break;
      if (i % 10 === 0) await page.keyboard.press('Space');
      await page.waitForTimeout(250);
    }
    await page.waitForSelector('#title-buttons.visible', { timeout: 20000 });
    await page.evaluate(() => { const R = Math.random; Math.random = () => 0.5; try { document.getElementById('btn-continue').click(); } finally { Math.random = R; } });
    await page.waitForTimeout(700);
  }
  const midFight = async (page, hull) => {
    await startFight(page, hull);
    await fire(page); await page.waitForTimeout(400); await fire(page); await page.waitForTimeout(2400); // one exchange
    return (await marker(page)).pendingCombat;
  };

  console.log('— combat mid-fight (ruling 53): a reload is ATTEMPT ESCAPE played out — the charge turns under fire, −15 fuel, the time, the morale');
  {
    const page = await open({ crew: ['engineer', 'medic'] });
    await setNode(page, 'void');
    const a = await snap(page);
    const hmax = await page.evaluate(() => resMax('hull'));
    const m = await midFight(page, hmax);
    const live = await page.evaluate(() => document.getElementById('screen-encounter').classList.contains('combat-mode'));
    ok(live && m && !m.defeat && m.volley && m.volley.miss === 0.35 && !m.volley.left && m.volley.pilot === 0 && Number.isFinite(m.morale), `mid-fight save carries the volley and the morale so far (hull ${m && m.hull}, morale ${m && m.morale && m.morale.toFixed(1)})`);
    await reloadContinueFixed(page);
    const r = await snap(page);
    const heavy = 15 > (m.hullMax || 100) * 0.15 ? 2 : 1;
    ok(r.hull === m.hull - 45 && !r.ended, `three volleys of 15 land: hull ${m.hull} → ${r.hull}`);
    ok(r.fuel === 45 && r.day - a.day === 4 && nothingGained(a, r), `−15 fuel (60 → ${r.fuel}), +${r.day - a.day}d, no loot`);
    ok(Math.abs((r.morale - a.morale) - (m.morale - 3 * heavy)) < 0.6, `the fight's morale and the hits' (${(r.morale - a.morale).toFixed(1)} = ${m.morale.toFixed(1)} − ${3 * heavy})`);
    ok(/drive spooled under fire \(−15, −15, −15\)/.test(r.log), 'the log names the volleys');
    await secondReload(page, 'combat', r);
    await page.close();
  }

  console.log('— combat mid-fight (ruling 53): volleys that would sink the ship are the defeat, not hull_zero');
  {
    const page = await open({ crew: ['engineer', 'medic'] });
    await setNode(page, 'void');
    await page.evaluate(() => { STATE.materials = { metal: 6, scrap: 4 }; saveRun(); });
    const a = await snap(page);
    const m = await midFight(page, 40);
    await reloadContinueFixed(page);
    const r = await snap(page);
    ok(m && m.hull <= 45 && !r.ended && r.hull === 1, `hull ${m && m.hull} under three volleys: LIMP AWAY at hull ${r.hull}, the run goes on`);
    ok(r.fuel === 60 && r.day - a.day === 8 && matSum(r) < matSum(a) && /LIMP AWAY/.test(r.log), `the defeat's time (+${r.day - a.day}d), no escape fuel, cargo lost (${matSum(a)} → ${matSum(r)})`);
    await secondReload(page, 'combat defeat', r);
    await page.close();
  }

  console.log('— combat defeat beat: a reload is the LIMP AWAY that was coming, never hull_zero');
  {
    const page = await open({ crew: ['pilot', 'engineer'] });
    await setNode(page, 'void');
    await page.evaluate(() => { STATE.materials = { metal: 6, scrap: 4 }; STATE.items = ['repair_kit', 'soil_sampler', 'gas_analyzer']; saveRun(); });
    const raw = await savedRaw(page);
    // Fight at hull 3: the first enemy hit ends it.
    const toDefeat = async () => {
      await startFight(page, 3);
      for (let k = 0; k < 40; k++) {
        const m = await marker(page);
        if (m.pendingCombat && m.pendingCombat.defeat) return m.pendingCombat;
        await fire(page); await page.waitForTimeout(250);
      }
      return null;
    };
    const lostRight = (a, b, d) => Object.entries(d.cargoLoss.materials).every(([k, v]) => (b.mats[k] || 0) === (a.mats[k] || 0) - v) && b.items.length === a.items.length - d.cargoLoss.items.length;
    const a = await snap(page);
    const pq = await toDefeat();
    await page.waitForFunction(() => /LIMP AWAY/.test(document.body.innerText), null, { timeout: 8000 });
    await page.evaluate(() => { const b = document.querySelector('#enc-choices .enc-choice.advance'); b && b.click(); });
    await page.waitForTimeout(500);
    const q = await snap(page);
    await restore(page, raw);
    const a2 = await snap(page);
    const pr = await toDefeat();
    await page.keyboard.press('Escape'); // pause: the defeat waits behind the menu
    await page.waitForTimeout(1200);
    const still = await marker(page);
    await reloadContinue(page);
    const r = await snap(page);
    ok(pq && pr && pr.hull === 1 && still.pendingCombat && still.pendingCombat.defeat, `the defeat beat is saved at hull 1 with the planned loss (${JSON.stringify(pr && pr.defeat.cargoLoss)})`);
    ok(!r.ended && r.hull === 1 && q.hull === 1, `reload: no hull_zero, hull ${r.hull} (in game ${q.hull})`);
    ok(r.day - a2.day === q.day - a.day && r.fuel === 60 && q.fuel === 60, `the same high time (+${r.day - a2.day}d, in game +${q.day - a.day}d), no escape fuel`);
    ok(lostRight(a, q, pq.defeat) && lostRight(a2, r, pr.defeat), 'the cargo named in the beat is lost, in game and on the reload');
    const hurt = (x, y) => Object.keys(x.hp).filter(k => (k === 'captain' || x.crew.includes(k)) && (!(k === 'captain' || y.crew.includes(k)) || y.hp[k] < x.hp[k])).length;
    ok(hurt(a2, r) >= pr.defeat.crewInjured && hurt(a2, r) <= pr.defeat.crewInjured + (pr.defeat.crewDied ? 1 : 0), `the casualty roll lands (${pr.defeat.crewInjured} injured${pr.defeat.crewDied ? ', a death' : ''}: ${hurt(a2, r)} hurt)`);
    ok(/LIMP AWAY/.test(r.log) && nothingGained(a2, r), 'logged as LIMP AWAY, nothing gained');
    await secondReload(page, 'defeat', r);
    await page.close();
  }

  // ═══ WAIT / REST ═══
  const startWait = (page, verbRe, days, rnd) => page.evaluate(async ([src, d, x]) => {
    document.body.classList.remove('stop-active'); returnToHub();
    await new Promise(r => setTimeout(r, 200));
    [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => new RegExp(src).test(b.textContent)).click();
    await new Promise(r => setTimeout(r, 200));
    const R = Math.random; Math.random = () => x;
    setTimeout(() => { Math.random = R; }, 1900); // the first day's rolls only
    [...document.querySelectorAll('#stop-choices .day-step')][d - 1].click();
  }, [verbRe, days, rnd]);
  const flashUp = page => page.waitForFunction(() => document.getElementById('wait-flash').classList.contains('show'), null, { timeout: 10000 });

  console.log('— REST interrupted: a reload in the alert flash still opens the event, the rest so far kept');
  {
    const page = await open();
    await setNode(page, 'void');
    await page.evaluate(() => { setCrewMorale(40); saveRun(); });
    const raw = await savedRaw(page);
    const a = await snap(page);
    await startWait(page, 'REST', 5, 0.001);
    await page.waitForFunction(() => STATE.currentEvent && STATE.currentEvent.id, null, { timeout: 15000 });
    const q = await snap(page);
    await restore(page, raw);
    const a2 = await snap(page);
    await startWait(page, 'REST', 5, 0.001);
    await page.waitForFunction(() => !!STATE.forcedEvent, null, { timeout: 10000 });
    await flashUp(page);
    await reloadContinue(page);
    await page.waitForTimeout(500);
    const r = await snap(page);
    ok(q.ev && r.ev === q.ev && r.scr === 'screen-encounter', `the event opens after the reload (${r.ev}; in game ${q.ev})`);
    ok(r.day - a2.day === q.day - a.day && Math.abs((r.morale - a2.morale) - (q.morale - a.morale)) < 0.01 && r.morale > a2.morale, `the same days (+${r.day - a2.day}) and the rest's morale (+${(r.morale - a2.morale).toFixed(1)})`);
    await reloadContinue(page);
    const r2 = await snap(page);
    ok(r2.day === r.day && r2.morale === r.morale && r2.ev === r.ev, 'a second reload: the same event, nothing applied again');
    await page.close();
  }

  console.log('— WAIT FOR TRADER: a reload in the TRADER APPROACHING flash keeps the trader');
  {
    const page = await open();
    await setNode(page, 'void');
    const a = await snap(page);
    await startWait(page, 'WAIT FOR TRADER', 4, 0.001);
    await page.waitForFunction(() => STATE.traderAt[STATE.currentId] === true, null, { timeout: 10000 });
    await flashUp(page);
    const q = await page.evaluate(() => STATE.daysElapsed);
    await reloadContinue(page);
    const r = await page.evaluate(() => ({ day: STATE.daysElapsed, here: STATE.traderAt[STATE.currentId] }));
    const trade = await stopVerb(page, '^\\s*TRADE');
    ok(r.here === true && r.day === q && r.day > a.day && trade === true, `the trader stays at this stop (TRADE offered), day ${a.day} → ${r.day}`);
    await page.close();
  }

  console.log('— REST to the end: a reload in the flash keeps the morale');
  {
    const page = await open();
    await setNode(page, 'void');
    await page.evaluate(() => { setCrewMorale(40); saveRun(); });
    const raw = await savedRaw(page);
    const a = await snap(page);
    await startWait(page, 'REST', 1, 0.99);
    await flashUp(page);
    await page.waitForFunction(() => !document.getElementById('wait-flash').classList.contains('show'), null, { timeout: 10000 });
    await page.waitForTimeout(400);
    const q = await snap(page);
    await restore(page, raw);
    const a2 = await snap(page);
    await startWait(page, 'REST', 1, 0.99);
    await flashUp(page);
    await reloadContinue(page);
    const r = await snap(page);
    ok(r.day - a2.day === q.day - a.day && Math.abs((r.morale - a2.morale) - (q.morale - a.morale)) < 0.01 && r.morale > a2.morale, `reload: +${r.day - a2.day}d, morale +${(r.morale - a2.morale).toFixed(1)} (in game +${q.day - a.day}d, +${(q.morale - a.morale).toFixed(1)})`);
    await page.close();
  }

  // ═══ Fabricator ═══
  console.log('— fabricator craft: a reload holds the job as ✕ CLOSE does (no day, material or output twice)');
  {
    const page = await open({ crew: ['medic'] }); // a 3-day job (more hands make it one day)
    await setNode(page, 'void');
    await page.evaluate(() => { STATE.materials = { metal: 20, scrap: 20, minerals: 20, exotic: 5, biocomponent: 5 }; STATE.fabricator = { wear: 0, broken: false }; saveRun(); });
    const raw = await savedRaw(page);
    const craft = async () => {
      await page.evaluate(() => { returnToHub(); openFabricator(); fabSetDayMs(1500); const b = [...document.querySelectorAll('.fb-recipe-row')].find(x => /Repair Kit/i.test(x.textContent)); b.click(); window.craftSelected(); });
      await page.waitForFunction(() => window.fabCraftState() && window.fabCraftState().daysDone >= 1, null, { timeout: 10000 });
      await page.evaluate(() => PauseBus.pause()); // hold the clock where it is
      await page.waitForTimeout(200);
    };
    const fab = () => page.evaluate(() => ({ craft: STATE.fabricator.craft && { r: STATE.fabricator.craft.recipeId, done: STATE.fabricator.craft.daysDone }, items: STATE.items.length }));
    const a = await snap(page);
    await craft();
    await page.evaluate(() => { PauseBus.resume(); window.closeFabricator(); });
    await page.waitForTimeout(300);
    const q = await snap(page), fq = await fab();
    await restore(page, raw);
    const a2 = await snap(page);
    await craft();
    await reloadContinue(page);
    const r = await snap(page), fr = await fab();
    const dq = delta(a, q), dr = delta(a2, r);
    ok(fq.craft && fr.craft && fr.craft.r === fq.craft.r && fr.craft.done === fq.craft.done, `the job is held at the same day (${fr.craft && fr.craft.done}/${fq.craft && fq.craft.done} done)`);
    ok(same(dq, dr, ['days', 'mats', 'items', 'gold', 'hp']), `reload ${fmt(dr)} = close ${fmt(dq)}`);
    await reloadContinue(page);
    const r2 = await snap(page), fr2 = await fab();
    ok(r2.day === r.day && JSON.stringify(r2.mats) === JSON.stringify(r.mats) && fr2.craft && fr2.craft.done === fr.craft.done && fr2.items === fr.items, 'a second reload: the same day, materials and job');
    await page.close();
  }

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\nsave_quit: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
