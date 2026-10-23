// Combat / minigame hunt fixes (2026-10-23): an event's SALVAGE job shows
// the event's reward, never a free-play haul; the backdrop no longer
// quits a running job; ✕ reads CLOSE once the result is decided; the
// breach O2 bar never shows a number that won't land; event scans play
// at the trail's difficulty and take the event's own lines; FORAGE shows
// the food that lands; MINE shows its ice water; full-hold briefings;
// combat endings state their days; the hit line names the enemy's hull;
// LIMP AWAY names the items lost.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const errors = [];
let browser;
const REWARDS = { perfect: ['+6 FOOD', '+2 METAL', '+2 SCRAP'], good: ['+4 FOOD', '+1 METAL', '+2 SCRAP'], poor: ['+1 SCRAP'] };

async function boot(nodeType, setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(String(e.stack || e.message).slice(0, 300)));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor);
  await page.evaluate(([nt, o]) => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['pilot', 'engineer'], crop: 'wheat', ship: 'Q' }, o));
    STATE.stowaway = null; STATE.forcedEvent = null;
    const n = STATE.nodes.find(x => x.node_type !== 'fork' && x.node_type !== 'station' && x.id !== STATE.nodes[0].id);
    n.node_type = nt; STATE.currentId = n.id; returnToHub();
  }, [nodeType, setup || {}]);
  await page.waitForTimeout(300);
  return page;
}
const verb = async (page, re) => {
  await page.evaluate(() => { document.body.classList.remove('stop-active'); document.getElementById('stop-btn').textContent = 'Stop'; returnToHub(); });
  await page.waitForTimeout(200);
  const found = await page.evaluate(re => { const b = [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => new RegExp(re).test(b.textContent)); if (b) b.click(); return !!b; }, re);
  await page.waitForTimeout(500);
  return found;
};
const lastLog = page => page.evaluate(() => (STATE.shipLog || []).map(e => (typeof e === 'string' ? e : e.text)).filter(t => /◆/.test(t || '')).slice(-1)[0] || '');
const resultUp = page => page.evaluate(() => document.getElementById('result').classList.contains('show'));
const fillHold = page => page.evaluate(() => { STATE.materials = {}; let i = 0; while (cargoSlotsUsed() < cargoCapacity() && i++ < 60) STATE.items.push('water_purifier'); });
async function stowOne(page) {
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    const st = await page.locator('#sal-stage').boundingBox();
    for (const it of await page.$$('.sal-item:not(.stowed)')) {
      const b = await it.boundingBox(); if (!b) continue;
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      if (cx < st.x + 5 || cx > st.x + st.width - 5 || cy < st.y + 5 || cy > st.y + st.height - 5) continue;
      await page.mouse.move(cx, cy); await page.mouse.down();
      await page.mouse.move(st.x + 0.515 * st.width, st.y + 0.86 * st.height, { steps: 4 });
      await page.waitForTimeout(60); await page.mouse.up();
      await page.waitForTimeout(200);
      if ((await page.textContent('#sal-count')).trim() !== '0') return true;
    }
    await page.waitForTimeout(150);
  }
  return false;
}
// Combat helpers (test_b5_r66's).
const has = (page, t) => page.evaluate(t => [...document.querySelectorAll('#enc-choices .enc-choice')].some(b => b.textContent.includes(t) && !b.classList.contains('combat-fading-out')), t);
const click = (page, t) => page.evaluate(t => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.textContent.includes(t) && !b.classList.contains('combat-fading-out')); if (b) b.click(); return !!b; }, t);
const buttons = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#enc-choices .enc-choice')].map(b => { const s = b.querySelector('.ch-sub'); return [(b.querySelector('.ch-text') || {}).textContent, { sub: s ? s.textContent : '', over: s ? s.scrollWidth > s.clientWidth + 1 : false, tip: b.dataset.tipDescription || '' }]; })));
async function fight(species, r, pre) {
  const page = await boot('void');
  if (pre) await page.evaluate(pre);
  await page.evaluate(([sp, r]) => { STATE.resources.fuel = 60; Math.random = () => r; enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001); STATE.npcCtx.species = sp; }, [species, r]);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.triggerCombat({}));
  await page.waitForTimeout(800);
  return page;
}
async function shootUntil(page, done) {
  for (let i = 0; i < 20; i++) {
    if (await done()) return true;
    if (!(await has(page, 'FIRE LASER'))) { await page.waitForTimeout(400); continue; }
    await click(page, 'FIRE LASER'); await page.waitForTimeout(80);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
  }
  return done();
}

(async () => {
  browser = await chromium.launch();

  console.log('— an event\'s SALVAGE job shows the event\'s reward, never a haul');
  for (const setting of ['', 'derelict']) {
    const page = await boot('derelict');
    await page.evaluate(s => { window.__res = []; openMinigame('salvage', Object.assign(s ? { setting: s } : {}, { tierRewards: { perfect: ['+6 FOOD', '+2 METAL', '+2 SCRAP'], good: ['+4 FOOD', '+1 METAL', '+2 SCRAP'], poor: ['+1 SCRAP'] } }), (t, p) => window.__res.push([t, p])); }, setting);
    await page.waitForTimeout(300);
    const brief = await page.evaluate(() => document.getElementById('ga').innerText);
    ok(!/fuel cell|ration|refuel|crates? open|medkit/i.test(brief) && /depends on how well it goes/.test(brief), `${setting || 'space'}: briefing promises no pickups`);
    ok(/WHAT THE JOB PAYS/.test(brief) && REWARDS.perfect.every(r => brief.includes(r)) && brief.includes(REWARDS.poor[0]), `${setting || 'space'}: briefing lists each result's reward`);
    ok(await page.evaluate(() => { const b = document.getElementById('rstart').getBoundingClientRect(), m = document.getElementById('mbody').getBoundingClientRect(); return b.bottom <= m.bottom && b.top >= m.top; }), 'BEGIN fits the modal');
    await page.click('#rstart');
    const stowed = await stowOne(page);
    await page.waitForSelector('#sal-close', { state: 'visible', timeout: 40000 });
    await page.waitForTimeout(400);
    const end = await page.evaluate(() => ({ text: document.getElementById('sal-end').innerText, view: !!document.getElementById('sal-view-inv'), proc: !!document.getElementById('sal-process-all'), inv: !!document.getElementById('sal-inv'), reward: (document.getElementById('sal-job-reward') || {}).innerText || '' }));
    ok(stowed && !end.view && !end.proc && !end.inv, `${setting || 'space'}: end card has no inventory / PROCESS ALL / VIEW INVENTORY`);
    ok(end.reward.includes('+1 SCRAP') && /JOB RESULT/.test(end.text), `${setting || 'space'}: end card shows the earned tier's reward (${end.reward.replace(/\n/g, ' · ')})`);
    await page.click('#sal-close'); await page.waitForTimeout(500);
    const card = await page.evaluate(() => ({ haul: (document.getElementById('rhaul') || {}).innerText || '', quip: document.querySelector('#rquip .rtext').textContent, x: document.getElementById('mclose').textContent }));
    ok(/REWARD · \+1 SCRAP/.test(card.haul) && !/crate|fuel|food/i.test(card.quip), `${setting || 'space'}: result card shows REWARD, a job quip ("${card.quip}")`);
    ok(card.x === '✕ CLOSE', `${setting || 'space'}: ✕ on the result card reads CLOSE (${card.x})`);
    await page.click('#rbquit'); await page.waitForTimeout(300);
    const res = await page.evaluate(() => window.__res);
    ok(res.length === 1 && res[0][0] === 'poor' && res[0][1] === null, `${setting || 'space'}: the tier alone is handed back (${JSON.stringify(res)})`);
    await page.close();
  }

  console.log('— free-play SALVAGE unchanged; a full hold says what can\'t be kept');
  {
    const page = await boot('derelict');
    await page.evaluate(() => openMinigame('salvage', { setting: 'derelict' }, () => {}));
    await page.waitForTimeout(300);
    const brief = await page.evaluate(() => document.querySelector('.ready-mechanic').innerText);
    ok(/Fuel cells/.test(brief) && !/CARGO HOLD FULL/.test(brief), 'derelict briefing keeps its pickups; no warning with room aboard');
    await page.click('#mclose'); await page.waitForTimeout(300);
    await fillHold(page);
    await page.evaluate(() => openMinigame('salvage', {}, () => {}));
    await page.waitForTimeout(300);
    const full = await page.evaluate(() => document.querySelector('.ready-mechanic').innerText);
    ok(/CARGO HOLD FULL: no new materials, parts or crate finds until you free space/.test(full), 'full hold: the briefing says nothing new can be kept');
    await page.click('#mclose'); await page.waitForTimeout(300);
    await page.close();
  }

  console.log('— backdrop: free cancel on the briefing, ignored once the job runs');
  {
    const page = await boot('derelict');
    await page.evaluate(() => { window.__res = []; openMinigame('salvage', {}, (t) => window.__res.push(t)); });
    await page.waitForTimeout(300);
    await page.mouse.click(110, 400); await page.waitForTimeout(300);
    ok(await page.evaluate(() => !document.getElementById('overlay-minigames').classList.contains('active') && window.__res.length === 0), 'briefing: a backdrop click is a free cancel');
    await page.evaluate(() => { window.__res = []; openMinigame('salvage', {}, (t) => window.__res.push(t)); });
    await page.waitForTimeout(300); await page.click('#rstart'); await page.waitForTimeout(800);
    ok((await page.textContent('#mclose')) === '✕ QUIT', '✕ reads QUIT while the job runs');
    await page.mouse.click(110, 400); await page.waitForTimeout(400);
    ok(await page.evaluate(() => document.getElementById('overlay-minigames').classList.contains('active') && window.__res.length === 0), 'mid-job: a backdrop click does nothing');
    await page.click('#mclose'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => window.__res[0] === 'abandoned'), '✕ QUIT still quits');
    await page.close();
  }

  console.log('— HULL BREACH: the O2 bar shows only what lands');
  {
    const page = await boot('void', { trail: 'interstellar' });
    await page.evaluate(() => { STATE.resources.o2 = 80; openMinigame('breach', { tierO2: { perfect: -2, good: -3, poor: -8 } }, () => {}); });
    await page.waitForTimeout(300); await page.click('#rstart');
    let min = 999;
    for (let i = 0; i < 300 && !(await resultUp(page)); i++) { const v = await page.evaluate(() => +document.getElementById('bcr-o2val').textContent); min = Math.min(min, v); await page.waitForTimeout(100); }
    const fin = await page.evaluate(() => +document.getElementById('bcr-o2val').textContent);
    ok(min >= 72 && fin === 72, `idle (poor, −8): never below 72, ends on 72 (min ${min}, final ${fin})`);
    await page.click('#rbquit'); await page.waitForTimeout(300);
    await page.evaluate(() => openMinigame('breach', {}, () => {}));
    await page.waitForTimeout(300); await page.click('#rstart'); await page.waitForTimeout(800);
    ok(await page.evaluate(() => !document.getElementById('bcr-o2val') && /LEAKING/.test(document.querySelector('.breach-o2-pct').textContent)), 'without the event\'s figures: a leak gauge, no number');
    await page.click('#mclose'); await page.waitForTimeout(300);
    await page.close();
  }

  console.log('— event SCAN: the trail\'s difficulty, the event\'s own lines');
  {
    const page = await boot('void', { trail: 'interstellar' });
    await page.evaluate(() => openMinigame('scan', { briefing: 'The beacon repeats one word.', quips: { poor: 'The word is gone.' } }, () => {}));
    await page.waitForTimeout(300);
    ok((await page.textContent('.rsi-text')) === 'The beacon repeats one word.', 'opts.briefing replaces the generic signal line');
    await page.click('#rstart'); await page.waitForTimeout(300);
    ok((await page.evaluate(() => document.querySelector('.scan-wrap').dataset.difficulty)) === 'hard', 'no authored difficulty: the trail\'s (interstellar → hard)');
    await page.waitForFunction(() => document.getElementById('result').classList.contains('show'), null, { timeout: 25000 });
    ok((await page.textContent('#rquip .rtext')) === 'The word is gone.', 'opts.quips replaces the result line');
    await page.click('#rbquit'); await page.waitForTimeout(300);
    await page.evaluate(() => openMinigame('scan', { difficulty: 'easy' }, () => {}));
    await page.waitForTimeout(300); await page.click('#rstart'); await page.waitForTimeout(300);
    ok((await page.evaluate(() => document.querySelector('.scan-wrap').dataset.difficulty)) === 'easy', 'an authored difficulty still wins');
    await page.click('#mclose'); await page.waitForTimeout(300);
    await page.close();
  }

  console.log('— FORAGE: the card shows the food that lands');
  {
    const page = await boot('planet');
    await page.evaluate(() => { STATE.resources.food = 97; });
    ok(await verb(page, 'GATHER|HUNT|SCAVENGE|FORAGE'), 'FORAGE opens from the Stop menu');
    await page.click('#rstart');
    const t0 = Date.now();
    while (Date.now() - t0 < 40000 && !(await resultUp(page))) {
      const tg = await page.evaluate(() => { const S = document.getElementById('for-stage'); if (!S) return null; const R = S.getBoundingClientRect(); const t = [...document.querySelectorAll('.for-target')].filter(t => t.offsetParent && /fauna|flora/.test(t.className) && !/\bgone\b|caught|leaving|decoy/.test(t.className)).map(t => t.getBoundingClientRect()).find(r => r.width > 4 && r.left > R.left + 4 && r.right < R.right - 4 && r.top > R.top + 4 && r.bottom < R.bottom - 4); return t ? { x: t.left + t.width / 2, y: t.top + t.height / 2 } : null; });
      if (tg) await page.mouse.click(tg.x, tg.y);
      await page.waitForTimeout(60);
    }
    await page.waitForFunction(() => document.getElementById('result').classList.contains('show'), null, { timeout: 30000 });
    await page.waitForTimeout(1000);
    const card = await page.evaluate(() => document.getElementById('rhaul').innerText);
    const shown = +(/FOOD GAINED (\d+)/.exec(card) || [])[1];
    await page.click('#rbquit'); await page.waitForTimeout(400);
    const log = await lastLog(page);
    const landed = +(/\+(\d+) food/.exec(log) || [0, 0])[1];
    ok(shown === landed && shown <= 3, `FOOD GAINED ${shown} = what landed (${log.slice(0, 60)})`);
    ok(/STORES FULL · \d+ FOUND, \d+ LEFT BEHIND/.test(card) || !/FOUND/.test(card), 'a capped haul says the stores are full: ' + card.replace(/\n/g, ' | ').slice(0, 90));
    await page.close();
  }

  console.log('— MINE: ice water on the card; a full hold on the armed view');
  {
    const page = await boot('asteroid_field');
    await fillHold(page);
    ok(await verb(page, 'MINE'), 'MINE opens');
    await page.waitForTimeout(400);
    const armed = await page.evaluate(() => [document.getElementById('mining-ai-text').textContent, document.getElementById('mining-narr-body').textContent]);
    ok(/CARGO HOLD FULL · NOTHING CAN BE KEPT/.test(armed[0]) && /Nothing you mine can be kept until cargo space is freed/.test(armed[1]), 'full hold: armed view says nothing can be kept');
    await page.evaluate(() => { const b = [...document.querySelectorAll('#mining-choices .enc-choice')].find(b => /LEAVE/.test(b.textContent)); b && b.click(); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { STATE.items = []; STATE.materials = {}; STATE.resources.water = 60; });
    await verb(page, 'MINE');
    ok(await page.evaluate(() => /READY/.test(document.getElementById('mining-ai-text').textContent)), 'room aboard: the usual standby line');
    await page.evaluate(() => { const c = document.querySelector('#mining-choices .crew-chip'); if (c) c.click(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#mining-choices .enc-choice')].find(b => /BEGIN/.test(b.textContent)); b && b.click(); });
    await page.waitForTimeout(800);
    const tm = Date.now();
    while (Date.now() - tm < 40000 && !(await page.evaluate(() => document.getElementById('haul-overlay').classList.contains('visible')))) {
      const tg = await page.evaluate(() => { const S = document.getElementById('mining-stage').getBoundingClientRect(); const r = [...document.querySelectorAll('#mining-stage .mine-asteroid')].map(e => e.getBoundingClientRect()).find(r => r.width > 10 && r.left > S.left + 5 && r.right < S.right - 5 && r.top > S.top + 5 && r.bottom < S.bottom - 5); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; });
      if (tg) await page.mouse.click(tg.x, tg.y);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(800);
    const side = await page.evaluate(() => [...document.querySelectorAll('#haul-overlay .haul-side')].map(e => e.textContent).join(' | '));
    await page.evaluate(() => { const b = [...document.querySelectorAll('#haul-overlay .haul-btn')].find(b => /RETURN/.test(b.textContent)); b && b.click(); });
    await page.waitForTimeout(500);
    const log = await lastLog(page);
    const onCard = +(/\+(\d+) water/.exec(side) || [])[1], landed = +(/\+(\d+) water/.exec(log) || [])[1];
    ok(onCard > 0 && onCard === landed, `card "${side}" = log's +${landed} water`);
    await page.close();
  }

  console.log('— combat endings say their days; the hit line names their hull');
  {
    const page = await fight('insect', 0.5);
    const b = await buttons(page);
    ok(/· 4 days$/.test(b['ATTEMPT ESCAPE'].sub) && !b['ATTEMPT ESCAPE'].over && /4 days/.test(b['ATTEMPT ESCAPE'].tip), `ATTEMPT ESCAPE: "${b['ATTEMPT ESCAPE'].sub}"`);
    await click(page, 'FIRE LASER'); await page.waitForTimeout(80); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    const line = await page.evaluate(() => document.getElementById('enc-narr-body').textContent);
    ok(/Enemy hull -\d+\. Theirs: \d+\/\d+\./.test(line) && !/Enemy: /.test(line), 'our hit reads as the enemy\'s hull: ' + line.slice(-36));
    await shootUntil(page, () => has(page, 'SALVAGE WRECKAGE'));
    const v = await buttons(page);
    ok(/· 8 days$/.test((v['SALVAGE WRECKAGE'] || {}).sub) && /· 2 days$/.test((v['LEAVE IT'] || {}).sub) && !v['SALVAGE WRECKAGE'].over && !v['LEAVE IT'].over, `SALVAGE "${(v['SALVAGE WRECKAGE'] || {}).sub}" / LEAVE "${(v['LEAVE IT'] || {}).sub}"`);
    const d0 = await page.evaluate(() => STATE.daysElapsed);
    await click(page, 'LEAVE IT');
    await page.waitForFunction(() => document.getElementById('combat-end-overlay').classList.contains('show'), null, { timeout: 10000 });
    const r = await page.evaluate(() => ({ notes: (document.querySelector('#combat-end-card .end-loot-notes') || {}).textContent || '', day: STATE.daysElapsed }));
    ok(r.day - d0 === 2 && /· 2 days$/.test(r.notes), `LEAVE IT: +${r.day - d0} days, notes "${r.notes}"`);
    await page.close();
  }
  {
    const page = await fight('human', 0.5);
    await shootUntil(page, () => has(page, 'ACCEPT SURRENDER'));
    const s = await buttons(page);
    ok(/· 4 days$/.test((s['ACCEPT SURRENDER'] || {}).sub) && /· 8 days$/.test((s['FINISH THEM'] || {}).sub) && !s['FINISH THEM'].over && !s['ACCEPT SURRENDER'].over, `ACCEPT "${(s['ACCEPT SURRENDER'] || {}).sub}" / FINISH "${(s['FINISH THEM'] || {}).sub}"`);
    const d0 = await page.evaluate(() => STATE.daysElapsed);
    await click(page, 'ACCEPT SURRENDER');
    await page.waitForFunction(() => document.getElementById('combat-end-overlay').classList.contains('show'), null, { timeout: 10000 });
    const r = await page.evaluate(() => ({ notes: (document.querySelector('#combat-end-card .end-loot-notes') || {}).textContent || '', day: STATE.daysElapsed }));
    ok(r.day - d0 === 4 && /4 days$/.test(r.notes), `ACCEPT SURRENDER: +${r.day - d0} days, notes "${r.notes}"`);
    await page.close();
  }
  {
    const page = await fight('insect', 0.5, () => { STATE.items = ['medkit', 'repair_kit', 'repair_kit', 'water_purifier']; STATE.materials = { metal: 4, scrap: 3 }; STATE.resources.hull = 20; });
    const d0 = await page.evaluate(() => STATE.daysElapsed);
    for (let i = 0; i < 14; i++) {
      if (await page.evaluate(() => document.getElementById('combat-end-overlay').classList.contains('show'))) break;
      if (await has(page, 'EVASIVE')) await click(page, 'EVASIVE');
      await page.waitForTimeout(900);
    }
    await page.waitForFunction(() => document.getElementById('combat-end-overlay').classList.contains('show'), null, { timeout: 10000 });
    const r = await page.evaluate(() => ({ body: document.getElementById('combat-end-body').textContent, notes: (document.querySelector('#combat-end-card .end-loot-notes') || {}).textContent || '', day: STATE.daysElapsed }));
    ok(/Cargo lost: (\d+× )?(Medkit|Repair Kit|Water Purifier|[A-Z][a-z]+( [A-Z][a-z]+)*)/.test(r.body) && !/\d+ items?\b/.test(r.body), 'LIMP AWAY names the items: ' + r.body.slice(0, 70));
    ok(r.day - d0 === 8 && /8 days$/.test(r.notes), `LIMP AWAY: +${r.day - d0} days, notes "${r.notes.slice(-40)}"`);
    await page.close();
  }

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' / ') : ''));
  await browser.close();
  console.log(`hunt_mg: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
