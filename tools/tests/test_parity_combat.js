// Combat ↔ demo-combat.html parity (2026-10-11, PARITY_AUDIT "Parity:
// demo-combat" + owner rulings). Everything is asserted in the real
// engine through computed styles / animation names / STATE, not class
// names alone: captain CRT-off, ship hit flash + rattle beating .bobbing,
// FINISH THEM destruction, no actions during the wreck / FTL holds,
// hostile-gone after FLEE / RAM, defeat ends the red alert, no Phase-5
// screen pulse, bridge stage for every fight, HP banner + 7 buttons on
// screen, morale-miss line, demo defeat-injury odds, demo pacing, end
// card loot = granted, CLEAR view, gate icons, cross-dissolve, skins,
// the pirate bluff.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function boot(setup, opts) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'engineer', crew: ['botanist', 'chef'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
    // Sampler: computed styles over time (window.__samp()).
    window.__samples = [];
    window.__sampOn = false;
    const cs = id => { const el = document.getElementById(id); return el ? getComputedStyle(el) : null; };
    setInterval(() => {
      if (!window.__sampOn) return;
      const sp = cs('enc-backdrop-sprite'), sj = cs('enc-subject'), hd = cs('enc-subject-head'), nm = cs('enc-subject-name');
      const btns = [...document.querySelectorAll('#enc-choices .enc-choice')];
      window.__samples.push({
        t: performance.now(),
        spAnim: sp.animationName, spFilter: sp.filter, spOpacity: +sp.opacity, spDisplay: sp.display,
        sjAnim: sj.animationName, sjOpacity: +sj.opacity, hdAnim: hd.animationName, hdFilter: hd.filter,
        nmAnim: nm.animationName, nmOpacity: +nm.opacity,
        liveBtns: btns.filter(b => !b.classList.contains('combat-fading-out') && +getComputedStyle(b).opacity > 0.05).map(b => b.textContent.trim().slice(0, 18)),
        ended: document.getElementById('screen-encounter').classList.contains('combat-ended'),
        card: document.getElementById('combat-end-overlay').classList.contains('show'),
        title: document.getElementById('enc-narr-title').textContent,
      });
    }, 15);
  }, setup || {});
  await page.waitForTimeout(150);
  return page;
}
const evt = (page, id, pre) => page.evaluate(([id, pre]) => {
  if (pre) (new Function(pre))();
  enterEvent(STATE.byId[STATE.currentId], EVENTS[id]);
}, [id, pre || null]);
async function startCombat(page, id, pre, post) {
  await evt(page, id || 'event_encounter_pirate_001', pre);
  await page.waitForTimeout(250);
  await page.evaluate(post => { if (post) (new Function(post))(); window.triggerCombat({}); }, post || null);
  await page.waitForTimeout(450); // 200ms cross-dissolve, then the panel
}
const click = (page, t) => page.evaluate(t => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.textContent.includes(t) && !b.classList.contains('combat-fading-out')); if (!b) return false; b.click(); return true; }, t);
const has = (page, t) => page.evaluate(t => [...document.querySelectorAll('#enc-choices .enc-choice')].some(b => b.textContent.includes(t)), t);
const samp = (page, on) => page.evaluate(on => { if (on) window.__samples = []; window.__sampOn = on; return window.__samples; }, on);
// One shot at the ship: FIRE LASER → Enter → wait the demo beat out.
async function shoot(page, wait) {
  await click(page, 'FIRE LASER'); await page.waitForTimeout(80);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(wait || 1500);
}
// Fire until the enemy dies (insect: never surrenders).
async function killShip(page) {
  for (let i = 0; i < 10; i++) {
    const st = await page.evaluate(() => document.getElementById('enc-narr-title').textContent);
    if (/TARGET DESTROYED/.test(st)) return true;
    if (!(await has(page, 'FIRE LASER'))) { await page.waitForTimeout(400); continue; }
    await click(page, 'FIRE LASER'); await page.waitForTimeout(80);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(330);
    if (/TARGET DESTROYED/.test(await page.evaluate(() => document.getElementById('enc-narr-title').textContent))) return true;
    await page.waitForTimeout(1150);
  }
  return false;
}
const gameRect = page => page.evaluate(() => { const r = document.getElementById('screen-encounter').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, s: r.width / 960 }; });

(async () => {
  browser = await chromium.launch();

  console.log('— 9. HP banner above the COMBAT LOG; all 7 actions on screen');
  {
    const page = await boot({ captain: 'engineer', crew: ['botanist', 'chef'] });
    await page.evaluate(() => STATE.items.push('shield_module_upgrade'));
    // A long previous layer leaves fitEncounterColumns' inline sizes behind.
    await startCombat(page);
    const r = await page.evaluate(() => {
      const g = document.getElementById('screen-encounter').getBoundingClientRect(), s = g.width / 960;
      const loc = el => { const b = el.getBoundingClientRect(); return { l: (b.left - g.left) / s, t: (b.top - g.top) / s, r: (b.right - g.left) / s, b: (b.bottom - g.top) / s }; };
      const col = document.getElementById('enc-choices');
      const btns = [...col.querySelectorAll('.enc-choice')];
      return {
        labels: btns.map(b => b.querySelector('.ch-text').textContent),
        btns: btns.map(loc), col: loc(col), scroll: col.scrollHeight - col.clientHeight,
        bar: loc(document.getElementById('combat-hpbars')), narr: loc(document.getElementById('enc-narrative')),
        subj: loc(document.getElementById('enc-subject')), plate: loc(document.getElementById('enc-subject-name')), ai: loc(document.getElementById('enc-ai-bar')),
        cells: [...document.querySelectorAll('#combat-hpbars .row .lbl')].map(x => x.textContent),
        winH: innerHeight, gb: g.bottom,
      };
    });
    ok(r.labels.length === 7, `7 actions with botanist + chef + engineer captain + shield module (${r.labels.join(' / ')})`);
    ok(r.btns.every(b => b.t >= 0 && b.b <= 640 && b.b <= r.col.b + 0.5), `every action inside the column and the 960×640 frame (last bottom ${Math.round(r.btns[r.btns.length - 1].b)}, column ${Math.round(r.col.b)})`);
    ok(r.scroll <= 1, `action column does not scroll (overflow ${r.scroll}px)`);
    ok(r.gb <= r.winH + 1, 'game frame within the viewport');
    ok(r.bar.l <= 15 && r.bar.r >= 945 && r.cells.join() === 'HULL,ENEMY,MOR', `full-width three-cell banner (${Math.round(r.bar.l)}→${Math.round(r.bar.r)}: ${r.cells.join(' · ')})`);
    ok(r.bar.b <= r.narr.t && r.narr.t - r.bar.b <= 12, `banner sits just above the COMBAT LOG (gap ${Math.round(r.narr.t - r.bar.b)}px)`);
    ok(r.btns[r.btns.length - 1].b <= r.bar.t, 'ATTEMPT ESCAPE clears the banner');
    // b4 ruling 35: the frame is back at top 60 (lower only under an AI bar that wraps past 60).
    ok(Math.round(r.subj.t) === Math.max(60, Math.round(r.ai.b) > 60 ? Math.round(r.ai.b) + 4 : 60) && r.plate.b <= r.bar.t, `captain not pushed down (frame top ${Math.round(r.subj.t)}, AI bar bottom ${Math.round(r.ai.b)}, plate bottom ${Math.round(r.plate.b)} above banner ${Math.round(r.bar.t)})`);
    // gate icons (demo D:5198-5211)
    const gates = await page.evaluate(() => [...document.querySelectorAll('#enc-choices .enc-choice')].map(b => {
      const g = b.querySelector('.enc-choice-gate'); return [b.querySelector('.ch-text').textContent, g ? g.style.backgroundImage : ''];
    }));
    const gi = Object.fromEntries(gates);
    ok(/careers\/botanist\.png/.test(gi['OFFER HARVEST']) && /careers\/chef\.png/.test(gi['OFFER COOKIES']), 'tribute actions carry the botanist / chef gate icons');
    ok(/lock\.png/.test(gi['HULL PATCH']), 'HULL PATCH above 50% hull shows the padlock');
    ok(/shield_module_upgrade\.png/.test(gi['BOOST SHIELDS']), 'BOOST SHIELDS shows the Shield Module icon');
    ok(!gi['FIRE LASER'] && !gi['ATTEMPT ESCAPE'], 'ungated actions have no gate badge');
    await page.close();
  }

  console.log('— cross-dissolve (choices → actions, 200ms)');
  {
    const page = await boot();
    await evt(page, 'event_encounter_pirate_001');
    await page.waitForTimeout(400);
    const r = await page.evaluate(async () => {
      const col = document.getElementById('enc-choices');
      window.triggerCombat({});
      await new Promise(r => setTimeout(r, 60));
      const mid = { anim: getComputedStyle(col).animationName, txt: col.textContent };
      // An old choice clicked mid-fade does nothing.
      const pay = [...col.querySelectorAll('.enc-choice')].find(b => /Pay 20 gold/.test(b.textContent));
      const gold = STATE.goldAmount;
      if (pay) pay.click();
      await new Promise(r => setTimeout(r, 300));
      return { mid, gold, goldAfter: STATE.goldAmount, outcome: STATE.currentOutcomeId, after: col.textContent, anim2: getComputedStyle(col).animationName };
    });
    ok(r.mid.anim === 'combat-fade-out' && /Open Fire/i.test(r.mid.txt), `old choices fade out first (${r.mid.anim})`);
    ok(r.gold === r.goldAfter && !r.outcome, 'an old choice clicked mid-fade resolves nothing');
    ok(/FIRE LASER/.test(r.after) && r.anim2 === 'combat-fade-in', `then the actions fade in (${r.anim2})`);
    await page.close();
  }

  console.log('— 1/2. kill: ship flash + shake + rattle beat .bobbing; captain CRT-off to opacity 0; 4. wreck hold');
  {
    const page = await boot({ captain: 'engineer', crew: ['botanist', 'chef'] });
    await page.evaluate(() => { Math.random = () => 0.5; });
    await startCombat(page, null, null, 'STATE.npcCtx.species = "insect";');
    const pre = await page.evaluate(() => ({ bob: getComputedStyle(document.getElementById('enc-backdrop-sprite')).animationName, flash: document.getElementById('enc-subject').classList.contains('flash') }));
    ok(pre.bob === 'enc-ship-bob' && pre.flash, `ship bobbing and the subject carries its entrance .flash (${pre.bob})`);
    // targeting → lock ring
    await click(page, 'FIRE LASER'); await page.waitForTimeout(120);
    const ring = await page.evaluate(() => getComputedStyle(document.getElementById('enc-subject')).animationName);
    ok(ring === 'combat-lock-ring-kf', `pulsing lock ring while targeting (${ring})`);
    await samp(page, true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    let S = await samp(page, false);
    const hitS = S.filter(x => x.spAnim === 'combat-shake-kf');
    ok(hitS.length > 0, `hit: ship animation is the shake (${[...new Set(S.map(x => x.spAnim))].join(',')})`);
    ok(S.some(x => /sepia/.test(x.spFilter)), 'hit: ship flashes red (sepia filter)');
    ok(S.some(x => x.hdAnim === 'combat-shake-kf') && S.some(x => /sepia/.test(x.hdFilter)), 'hit: captain head flinches (shake + red flash)');
    ok(S.some(x => x.sjAnim === 'enc-layer-flash' || x.sjAnim === 'none') && !S.some(x => x.sjAnim === 'enc-subject-hit'), 'no fx-hit stand-in on the frame');
    await page.waitForTimeout(500);
    const back = await page.evaluate(() => ({ sp: getComputedStyle(document.getElementById('enc-backdrop-sprite')).animationName, cls: document.getElementById('enc-backdrop-sprite').className }));
    ok(back.sp === 'enc-ship-bob' || back.sp.includes('low-hp'), `ship goes back to bobbing after the shake (${back.sp})`);
    // finish it
    await page.waitForTimeout(600);
    await samp(page, true);
    const killed = await killShip(page);
    ok(killed, 'insect ship destroyed by fire');
    await page.waitForTimeout(1600);
    const mid = await page.evaluate(() => ({ sj: +getComputedStyle(document.getElementById('enc-subject')).opacity, nm: +getComputedStyle(document.getElementById('enc-subject-name')).opacity, inline: document.getElementById('enc-subject').style.opacity, sp: +getComputedStyle(document.getElementById('enc-backdrop-sprite')).opacity }));
    await page.waitForTimeout(700);
    S = await samp(page, false);
    const killIdx = S.findIndex(x => /TARGET DESTROYED/.test(x.title));
    const after = S.slice(killIdx);
    ok(after.some(x => x.spAnim === 'combat-pre-explode-kf'), 'kill: pre-explosion rattle plays on the ship');
    ok(after.some(x => x.sjAnim === 'combat-crt-off-kf'), 'kill: CRT-off plays on the captain');
    ok(after.some(x => x.nmAnim === 'combat-name-fade-kf'), 'kill: the name plate shrink-fades');
    ok(mid.sj === 0 && mid.nm === 0 && mid.inline === '0' && mid.sp === 0, `captain + plate + ship at opacity 0 after the kill (subject ${mid.sj}, plate ${mid.nm}, ship ${mid.sp}, pin "${mid.inline}")`);
    const killT = after[0] ? after[0].t : 0;
    const hold = after.filter(x => x.t - killT > 750 && !x.liveBtns.some(l => /SALVAGE|LEAVE/.test(l)));
    ok(hold.length > 20 && hold.every(x => x.liveBtns.length === 0), `wreck hold: no action buttons until the victory choice (${hold.length} samples, ${[...new Set(hold.flatMap(x => x.liveBtns))].join(',') || 'none'})`);
    ok(after.some(x => x.liveBtns.some(l => /SALVAGE/.test(l))), 'then SALVAGE WRECKAGE / LEAVE IT');
    ok(after.every(x => x.ended), 'red alert off from the kill on (combat-ended)');

    console.log('— end card: loot tiles = what was granted');
    const before = await page.evaluate(() => ({ items: STATE.items.slice(), mats: Object.assign({}, STATE.materials), gold: STATE.goldAmount }));
    await page.evaluate(() => { Math.random = () => 0.2; }); // every drop + the bonus crate
    await click(page, 'SALVAGE WRECKAGE');
    await page.waitForTimeout(820);
    const notYet = await page.evaluate(() => document.getElementById('combat-end-overlay').classList.contains('show'));
    // Poll (up to 1.5s) rather than sample once: a loaded machine stretches the 900ms beat.
    await page.waitForFunction(() => document.getElementById('combat-end-overlay').classList.contains('show'), null, { timeout: 1500 }).catch(() => {});
    const card = await page.evaluate(b => {
      const tiles = [...document.querySelectorAll('#combat-end-loot .end-loot-tile')].map(t => ({ id: t.dataset.id, n: +t.dataset.count, bonus: t.classList.contains('bonus'), img: (t.querySelector('img') || {}).src || '' }));
      const got = {};
      const items = STATE.items.slice(); for (const i of b.items) { const k = items.indexOf(i); if (k >= 0) items.splice(k, 1); }
      for (const i of items) got[i] = (got[i] || 0) + 1;
      for (const [m, q] of Object.entries(STATE.materials)) if (q - (b.mats[m] || 0) > 0) got[m] = q - (b.mats[m] || 0);
      if (STATE.goldAmount - b.gold > 0) got.gold = STATE.goldAmount - b.gold;
      const ov = document.getElementById('combat-end-overlay');
      return { show: ov.classList.contains('show'), cls: document.getElementById('combat-end-card').className, title: document.getElementById('combat-end-title').textContent,
        body: document.getElementById('combat-end-body').textContent, notes: (document.querySelector('#combat-end-loot .end-loot-notes') || {}).textContent || '',
        tiles, got, z: getComputedStyle(ov).zIndex, recovered: !!document.querySelector('#combat-end-loot .end-loot-title') };
    }, before);
    ok(!notYet && card.show, 'victory → end card after the demo beat (900ms)');
    ok(card.title === 'VICTORY · SALVAGED' && /victory/.test(card.cls) && card.recovered, `card: ${card.title} (${card.cls})`);
    const tileMap = Object.fromEntries(card.tiles.map(t => [t.id, t.n]));
    ok(JSON.stringify(Object.entries(tileMap).sort()) === JSON.stringify(Object.entries(card.got).sort()), `loot tiles = granted (${JSON.stringify(tileMap)} vs ${JSON.stringify(card.got)})`);
    ok(card.tiles.some(t => t.bonus), 'bonus crate tile carries BONUS');
    ok(card.tiles.every(t => /sprites\/cargo\//.test(t.img)), 'every tile has its cargo sprite');
    ok(/Hull -\d+/.test(card.notes), `notes line names the fight's cost ("${card.notes}")`); // ASCII "-" (b4 B9)
    // Continue → next leg, card gone
    await page.evaluate(() => document.getElementById('combat-end-continue').click());
    await page.waitForTimeout(400);
    const gone = await page.evaluate(() => ({ show: document.getElementById('combat-end-overlay').classList.contains('show'), scr: document.querySelector('.screen.active').id }));
    ok(!gone.show && gone.scr !== 'screen-encounter', `card Continue moves on (${gone.scr})`);
    await page.close();
  }

  console.log('— 3. FINISH THEM destroys the ship');
  {
    const page = await boot({ captain: 'engineer', crew: ['pilot', 'medic'] });
    await page.evaluate(() => { Math.random = () => 0.5; });
    await startCombat(page, null, null, 'STATE.npcCtx.species = "human";');
    for (let i = 0; i < 10 && !(await has(page, 'FINISH THEM')); i++) await shoot(page);
    ok(await has(page, 'FINISH THEM'), 'they surrender');
    await samp(page, true);
    await click(page, 'FINISH THEM');
    await page.waitForTimeout(80);
    const now = await page.evaluate(() => ({ ended: document.getElementById('screen-encounter').classList.contains('combat-ended'), strip: getComputedStyle(document.querySelector('.combat-alert-strip.top')).display }));
    await page.waitForTimeout(1300);
    const mid = await page.evaluate(() => ({ sj: +getComputedStyle(document.getElementById('enc-subject')).opacity, sp: +getComputedStyle(document.getElementById('enc-backdrop-sprite')).opacity }));
    await page.waitForTimeout(500);
    const S = await samp(page, false);
    ok(now.ended && now.strip === 'none', 'red alert off the moment they are finished');
    ok(S.some(x => x.spAnim === 'combat-pre-explode-kf'), 'pre-explosion rattle');
    ok(S.some(x => x.sjAnim === 'combat-crt-off-kf'), 'captain CRT-off');
    ok(mid.sj === 0 && mid.sp === 0, `ship + captain gone (ship ${mid.sp}, captain ${mid.sj})`);
    const live = S.filter(x => x.t - S[0].t > 600 && !x.card);
    ok(live.length > 10 && live.every(x => x.liveBtns.length === 0), 'no actions while it burns');
    const c = await page.evaluate(() => ({ show: document.getElementById('combat-end-overlay').classList.contains('show'), title: document.getElementById('combat-end-title').textContent, flag: STATE.flags.has('executed_surrendered_pirate') }));
    const firstCard = S.find(x => x.card);
    ok(c.show && c.title === 'SURRENDER REFUSED' && c.flag, `end card ${c.title} at ~${firstCard ? Math.round(firstCard.t - S[0].t) : '?'}ms (demo 1500)`);
    ok(firstCard && firstCard.t - S[0].t >= 1400, 'finish → card on the demo beat (1500ms)');
    await page.close();
  }

  console.log('— 4. FTL escape hold; end card notes; CLEAR view');
  {
    const page = await boot({ captain: 'engineer', crew: ['botanist', 'chef'] });
    await page.evaluate(() => { Math.random = () => 0.5; STATE.resources.fuel = 60; });
    await startCombat(page);
    await samp(page, true);
    await click(page, 'ATTEMPT ESCAPE');
    await page.waitForTimeout(400);
    const pane = await page.evaluate(() => { const p = document.querySelector('.combat-ftl-progress'); const c = getComputedStyle(p); return { bs: c.borderTopStyle, color: c.color, fs: c.fontSize, txt: p.textContent }; });
    ok(pane.bs === 'dashed' && pane.color === 'rgb(53, 198, 191)' && pane.fs === '9px', `FTL pane skin: dashed cyan 9px (${pane.bs} ${pane.color} ${pane.fs})`);
    ok(/TURN 1 \/ 3/.test(pane.txt), 'FTL pane counts turns');
    for (let i = 0; i < 40; i++) { if (await page.evaluate(() => document.getElementById('combat-end-overlay').classList.contains('show'))) break; await page.waitForTimeout(300); }
    const S = await samp(page, false);
    const endIdx = S.findIndex(x => x.ended);
    const hold = S.slice(endIdx).filter(x => !x.card && x.t - S[endIdx].t > 750);
    ok(endIdx > 0 && hold.length > 50 && hold.every(x => x.liveBtns.length === 0), `FTL hold: no actions come back (${hold.length} samples; ${[...new Set(hold.flatMap(x => x.liveBtns))].join(',') || 'none'})`);
    const c = await page.evaluate(() => ({ title: document.getElementById('combat-end-title').textContent, cls: document.getElementById('combat-end-card').className, notes: (document.querySelector('#combat-end-loot .end-loot-notes') || {}).textContent || '', loot: !!document.querySelector('#combat-end-loot .end-loot-title'), fuel: STATE.resources.fuel }));
    ok(c.title === 'FTL ESCAPED' && /escape/.test(c.cls) && !c.loot, `escape card (${c.title}, ${c.cls})`);
    ok(/-15 fuel/.test(c.notes) && c.fuel === 45, `notes say −15 fuel and fuel is ${c.fuel} ("${c.notes}")`);
    await page.evaluate(() => document.getElementById('combat-end-continue').click());
    await page.waitForTimeout(300);
    const clear = await page.evaluate(() => ({
      title: document.getElementById('enc-narr-title').textContent, body: document.getElementById('enc-narr-body').textContent,
      gone: document.getElementById('screen-encounter').classList.contains('hostile-gone'),
      sp: getComputedStyle(document.getElementById('enc-backdrop-sprite')).display, sj: getComputedStyle(document.getElementById('enc-subject')).display,
      scene: document.getElementById('enc-backdrop').dataset.scene, btns: [...document.querySelectorAll('#enc-choices .enc-choice')].map(b => b.textContent.trim()),
      ai: document.getElementById('enc-ai-text').textContent, show: document.getElementById('combat-end-overlay').classList.contains('show'),
    }));
    ok(clear.title === 'CLEAR' && /falls behind/.test(clear.body) && /Threat vector resolved/.test(clear.ai), 'Continue → the CLEAR view (demo text)');
    ok(clear.gone && clear.sp === 'none' && clear.sj === 'none' && clear.scene === 'our_ship/bridge', `bridge stays, ship + captain gone (${clear.scene})`);
    ok(!clear.show && clear.btns.length === 1 && /Continue/.test(clear.btns[0]), 'one Continue on');
    await click(page, 'Continue');
    await page.waitForTimeout(400);
    ok(await page.evaluate(() => document.querySelector('.screen.active').id !== 'screen-encounter'), 'CLEAR Continue leaves the encounter');
    await page.close();
  }

  console.log('— 5. FLEE / RAM through: hostile gone, cut to open space');
  for (const [label, rnd, pick] of [['FLEE', 0.5, 'Flee'], ['RAM success', 0.9, 'Ram']]) {
    const page = await boot({ captain: 'veteran', crew: ['engineer', 'pilot'] });
    await evt(page, 'event_encounter_pirate_001');
    await page.waitForTimeout(500);
    await page.evaluate(r => { Math.random = () => r; }, rnd);
    await click(page, pick);
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => ({
      gone: document.getElementById('screen-encounter').classList.contains('hostile-gone'),
      sp: getComputedStyle(document.getElementById('enc-backdrop-sprite')).display, sj: getComputedStyle(document.getElementById('enc-subject')).display,
      nm: getComputedStyle(document.getElementById('enc-subject-name')).display, scene: document.getElementById('enc-backdrop').dataset.scene,
      mode: document.getElementById('screen-encounter').classList.contains('combat-mode'), out: STATE.currentOutcomeId,
    }));
    ok(r.gone && r.sp === 'none' && r.sj === 'none' && r.nm === 'none' && !r.mode, `${label}: ship, captain and plate gone (${r.out})`);
    ok(/^space\//.test(r.scene), `${label}: view cuts to open space (${r.scene})`);
    // the next event gets its stage back
    await evt(page, 'event_encounter_pirate_001');
    await page.waitForTimeout(400);
    ok(await page.evaluate(() => !document.getElementById('screen-encounter').classList.contains('hostile-gone') && getComputedStyle(document.getElementById('enc-subject')).display !== 'none'), `${label}: next event shows its NPC again`);
    await page.close();
  }

  console.log('— 6/7. defeat ends the red alert; no Phase-5 screen pulse');
  {
    const page = await boot({ captain: 'engineer', crew: ['pilot', 'medic'] });
    await page.evaluate(() => { Math.random = () => 0.5; STATE.resources.hull = 30; });
    await startCombat(page);
    await samp(page, true);
    await shoot(page, 1500); // a hit on them, then their hit on us
    const S1 = await samp(page, false);
    const scrAnims = await page.evaluate(() => {
      const sheets = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules].map(r => r.cssText); } catch (e) { return []; } });
      return { pulse: sheets.some(t => /combat-hit-pulse|combat-hull-hit/.test(t)), cls: document.getElementById('screen-encounter').className };
    });
    ok(!scrAnims.pulse, 'no combat-hit-pulse / combat-hull-hit rules left');
    const scrSamples = await page.evaluate(async () => {
      const out = []; const scr = document.getElementById('screen-encounter');
      for (let i = 0; i < 8; i++) { out.push([getComputedStyle(scr).animationName, getComputedStyle(scr).boxShadow, getComputedStyle(scr).filter]); await new Promise(r => setTimeout(r, 40)); }
      return out;
    });
    ok(scrSamples.every(([a, b, f]) => a === 'none' && b === 'none' && f === 'none'), 'the screen itself never pulses or gets an inset shadow');
    // drive to defeat
    for (let i = 0; i < 6; i++) {
      if (await page.evaluate(() => /LIMP-AWAY|LIMP AWAY/.test(document.getElementById('enc-narr-title').textContent))) break;
      if (await has(page, 'EVASIVE')) await click(page, 'EVASIVE');
      await page.waitForTimeout(1000);
    }
    const d = await page.evaluate(() => ({ title: document.getElementById('enc-narr-title').textContent, ended: document.getElementById('screen-encounter').classList.contains('combat-ended'), strip: getComputedStyle(document.querySelector('.combat-alert-strip.left')).display, card: document.getElementById('combat-end-overlay').classList.contains('show') }));
    ok(/LIMP/.test(d.title) && d.ended && d.strip === 'none', `defeat sets combat-ended, strips stop (${d.title}, strip ${d.strip})`);
    await page.waitForTimeout(1000);
    const c = await page.evaluate(() => ({ title: document.getElementById('combat-end-title').textContent, cls: document.getElementById('combat-end-card').className, body: document.getElementById('combat-end-body').textContent }));
    ok(c.title === 'LIMP AWAY' && /defeat/.test(c.cls) && /Hull at 1/.test(c.body), `defeat card (${c.body})`);
    await page.close();
  }

  console.log('— 8. every fight is fought from the bridge, with a captain');
  for (const id of ['event_general_003', 'event_encounter_boarding_001']) {
    const page = await boot({ captain: 'engineer', crew: ['pilot', 'diplomat'] });
    await evt(page, id);
    await page.waitForTimeout(600);
    const pre = await page.evaluate(() => ({ scene: document.getElementById('enc-backdrop').dataset.scene, npc: STATE.npcCtx && STATE.npcCtx.disposition }));
    await click(page, id === 'event_general_003' ? 'Fight' : 'Open fire');
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const sp = document.getElementById('enc-backdrop-sprite'), base = document.getElementById('enc-backdrop-base'), sj = document.getElementById('enc-subject');
      return {
        mode: document.getElementById('screen-encounter').classList.contains('combat-mode'),
        scene: document.getElementById('enc-backdrop').dataset.scene, main: document.getElementById('enc-backdrop').style.backgroundImage,
        sprite: sp.style.backgroundImage, spDisp: getComputedStyle(sp).display, base: getComputedStyle(base).display + ' ' + base.style.backgroundImage,
        sjDisp: getComputedStyle(sj).display, noSubj: document.getElementById('screen-encounter').classList.contains('no-subject'),
        npc: STATE.npcCtx && STATE.npcCtx.disposition, species: STATE.npcCtx && STATE.npcCtx.species,
        plate: document.getElementById('enc-subject-name').textContent, head: getComputedStyle(document.getElementById('enc-subject-head')).backgroundImage + document.getElementById('enc-subject-head').textContent,
      };
    });
    ok(r.mode, `${id}: combat starts (was ${pre.scene}, npc ${pre.npc || 'none'})`);
    ok(r.scene === 'our_ship/bridge' && /our_ship\/bridge/.test(r.main), `${id}: bridge backdrop (${r.scene})`);
    ok(r.spDisp !== 'none' && new RegExp('ship_exterior/pirate/' + r.species).test(r.sprite), `${id}: their ship in the window (${(r.sprite.match(/ship_exterior[^'")]+/) || [''])[0]})`);
    ok(/^block/.test(r.base) && /space\//.test(r.base), `${id}: space behind the glass`);
    ok(r.npc === 'pirate' && !r.noSubj && r.sjDisp !== 'none' && r.plate && r.head && r.head !== 'none', `${id}: a pirate captain on the feed (${r.plate})`);
    await page.close();
  }

  console.log('— 10. morale miss: the AI reports the miss');
  {
    const page = await boot();
    await page.evaluate(() => { setCrewMorale(30); });
    await startCombat(page);
    await page.evaluate(() => { Math.random = () => 0.01; });
    await click(page, 'FIRE LASER'); await page.waitForTimeout(80);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(450);
    const t = await page.evaluate(() => document.getElementById('enc-ai-text').textContent);
    ok(/Shot missed\. The crew's hands are unsteady\./.test(t), `AI bar: "${t}"`);
    await page.close();
  }

  console.log('— pacing (demo timings)');
  {
    // tribute reply 900ms
    const page = await boot({ crew: ['chef', 'medic'] });
    await startCombat(page);
    await page.evaluate(() => { Math.random = () => 0.01; });
    await samp(page, true);
    await click(page, 'OFFER COOKIES');
    await page.waitForTimeout(1300);
    let S = await samp(page, false);
    const card = S.find(x => x.card);
    ok(card && card.t - S[0].t >= 850 && card.t - S[0].t < 1150, `tribute reply ~900ms (${card ? Math.round(card.t - S[0].t) : '?'}ms)`);
    await page.close();
  }
  {
    // ram fail: their first shot lands 1100 + 320ms after the fight opens
    const page = await boot({ captain: 'veteran', crew: ['engineer', 'pilot'] });
    await evt(page, 'event_encounter_pirate_001');
    await page.waitForTimeout(500);
    await page.evaluate(() => { Math.random = () => 0.1; });
    await samp(page, true);
    await click(page, 'Ram');
    await page.waitForTimeout(1900);
    const S = await samp(page, false);
    const shot = S.find(x => /COMBAT LOG/.test(x.title));
    ok(S.some(x => /RAM FAILED/.test(x.title)), 'ram fails into combat');
    ok(shot && shot.t - S[0].t >= 1350 && shot.t - S[0].t < 1700, `ram-fail first shot ~1420ms (${shot ? Math.round(shot.t - S[0].t) : '?'}ms)`);
    await page.close();
  }
  {
    // mutiny: first shot at 1800 (+320)
    const page = await boot();
    await page.evaluate(() => { Math.random = () => 0.5; setCrewMorale(5); });
    await startCombat(page);
    const t0 = await page.evaluate(() => performance.now());
    const hit = await page.evaluate(async () => {
      const start = performance.now();
      const h0 = document.getElementById('combat-num-hull').textContent;
      while (performance.now() - start < 3000) { if (document.getElementById('combat-num-hull').textContent !== h0) return performance.now(); await new Promise(r => setTimeout(r, 15)); }
      return 0;
    });
    // startCombat waited 450ms after triggerCombat
    ok(hit && hit - t0 + 450 >= 1950 && hit - t0 + 450 < 2400, `mutiny: first shot lands ~2120ms after the fight opens (${hit ? Math.round(hit - t0 + 450) : '?'}ms)`);
    await page.close();
  }

  console.log('— defeat injuries: demo odds over seeded runs (fake clock)');
  // P(2 injured): the second-injury roll lands whether or not someone also
  // died (three aboard leave two to hurt) — only a captain's death (a third
  // of deaths) drops the run, as the run ends there. It was inj × 0.30 ×
  // (1 − death), which left out the crew-death runs that also hurt two.
  for (const [label, setup, pInj, pTwo] of [
    ['no medic', { captain: 'veteran', crew: ['engineer', 'pilot'] }, 0.75 + 0.25 * 0.12 * 0.5, 0.75 * 0.30 * (1 - 0.12 / 3)],
    ['crew medic', { captain: 'veteran', crew: ['medic', 'pilot'] }, 0.375 + 0.625 * 0.03 * 0.5, 0.375 * 0.30 * (1 - 0.03 / 3)],
    ['medic captain', { captain: 'medic', crew: ['engineer', 'pilot'] }, 0.5625 + 0.4375 * 0.03 * 0.5, 0.5625 * 0.30 * (1 - 0.03 / 3)],
  ]) {
    const page = await boot(setup);
    await page.clock.install();
    const N = 400;
    let one = 0, two = 0, died = 0, mismatches = [];
    for (let i = 0; i < N; i++) {
      await page.evaluate(([setup, seed]) => {
        if (window.abortCombat) window.abortCombat();
        // Fresh crew each run without re-running setup (a full setup per
        // run piles up the hub's timers under the fake clock).
        STATE.crew = setup.crew.slice(); initCrewHP(); STATE.crewIdentity = {};
        STATE.items = []; STATE.npcCache = {}; STATE.ended = false; STATE.daysElapsed = 0; STATE.captainHP = 100; // a captain killed or hurt last run is back (they are in the casualty pool)
        for (const k of Object.keys(STATE.resources)) STATE.resources[k] = 100;
        let s = seed;
        Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
        STATE.resources.hull = 1; setCrewMorale(50);
        enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001);
        STATE.npcCtx.species = 'human';
        window.triggerCombat({}, { ramFailed: true, ramHull: 0 });
      }, [setup, 1000 + i * 7919]);
      // Until this fight has resolved (its outcome passes the days, or the
      // captain's death ends the run): an enemy miss adds a turn, so a
      // fixed 2.4s read a stale card from the previous run (its names no
      // longer wounded, its injuries counted twice). 100ms steps (runFor
      // plays in ~real time).
      for (let k = 0; k < 120; k++) {
        await page.clock.fastForward(100);
        if (await page.evaluate(() => STATE.ended || STATE.daysElapsed > 0)) break;
      }
      const r = await page.evaluate(() => {
        const body = document.getElementById('combat-end-body').textContent;
        // Names can carry periods ("Dr. Vasquez"): cut the clause after the
        // last fixed sentence, then split the names.
        // A save's line ends "…badly hurt, but alive." (it names who lived).
        const tail = body.split(/(?:Cargo lost: [^.]*|Nothing in the hold worth taking)\. |didn't make it\. |but alive\. /).pop(); // b4 A3: the cargo line names the loss
        const hurtM = tail.match(/^(.*) (?:is|are) hurt\.$/);
        const hurt = hurtM ? hurtM[1].split(' and ').map(x => x.trim()) : [];
        const lost = /didn't make it/.test(body);
        // The captain is a casualty too since real captain HP (owner ruling 29).
        const names = Object.fromEntries(peopleAboard().map(r => [r === 'captain' ? 'the captain' : crewNameOf(r), r]));
        names['The captain'] = 'captain';
        const bad = hurt.filter(n => !names[n] || hpOf(names[n]) >= CREW_WOUNDED_HP);
        return { body, hurt: hurt.length, lost, bad, title: document.getElementById('combat-end-title').textContent, ended: !!STATE.ended && STATE.captainHP <= 0 };
      });
      // The captain is a possible casualty (owner ruling 29): their death
      // ends the run on the spot — the failure ending, no combat card.
      if (r.ended) { died++; continue; }
      if (r.title !== 'LIMP AWAY') { mismatches.push('no defeat: ' + r.title); continue; }
      if (r.hurt >= 1) one++;
      if (r.hurt === 2) two++;
      if (r.lost) died++;
      if (r.bad.length) mismatches.push(r.body);
    }
    const f1 = one / N, f2 = two / N;
    ok(Math.abs(f1 - pInj) < 0.075, `${label}: P(≥1 injured) ${f1.toFixed(3)} ≈ ${pInj.toFixed(3)} (N=${N})`);
    ok(Math.abs(f2 - pTwo) < 0.06, `${label}: P(2 injured) ${f2.toFixed(3)} ≈ ${pTwo.toFixed(3)}`);
    ok(!mismatches.length, `${label}: every "is hurt" name is really wounded (${mismatches.slice(0, 2).join(' | ')})`);
    if (label === 'no medic') ok(died > 0 && died / N < 0.2, `${label}: deaths stay rare (${died}/${N})`);
    await page.close();
  }

  console.log('— the pirate bluff');
  {
    const page = await boot({ captain: 'veteran', crew: ['diplomat', 'engineer'] });
    await evt(page, 'event_encounter_pirate_001');
    await page.waitForTimeout(500);
    await click(page, 'Negotiate');
    await page.waitForTimeout(600);
    const choice = await page.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /Authority is right behind us/.test(b.textContent)); return b ? { txt: b.textContent, risky: b.classList.contains('risky') } : null; });
    ok(choice && /"The Authority is right behind us\."/.test(choice.txt) && /Bluff · risky/.test(choice.txt) && choice.risky, `negotiate layer offers the bluff (${choice && choice.txt.trim()})`);
    await click(page, 'Authority is right behind us');
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({ mode: document.getElementById('screen-encounter').classList.contains('combat-mode'), title: document.getElementById('enc-narr-title').textContent, body: document.getElementById('enc-narr-body').textContent, out: STATE.currentOutcomeId, acts: document.getElementById('enc-choices').textContent }));
    ok(r.mode && r.title === 'CALLED' && /They laugh\. Hard\. Weapons re-engage\./.test(r.body) && /The Authority hasn.t been in this sector for a year\./.test(r.body), `CALLED opens the fight ("${r.body}")`);
    ok(!r.out && /FIRE LASER/.test(r.acts), 'no outcome resolved — the fight is on');
    await page.close();
  }

  console.log('— locked panel skin');
  {
    const page = await boot();
    await page.evaluate(() => { Math.random = () => 0.5; });
    await startCombat(page);
    await click(page, 'EVASIVE');
    await page.waitForTimeout(450); // 0.2s fade into the lock; their shot lands at 600+320
    const c = await page.evaluate(() => { const s = getComputedStyle(document.getElementById('enc-choices')); return { o: s.opacity, f: s.filter, pe: s.pointerEvents }; });
    ok(c.o === '0.4' && /grayscale\(0\.4\)/.test(c.f) && c.pe === 'none', `enemy turn: panel at 0.4 + grayscale (${c.o} ${c.f})`);
    await page.close();
  }

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + [...new Set(errors)].slice(0, 3).join(' | ') : ''));
  console.log(`parity_combat: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
