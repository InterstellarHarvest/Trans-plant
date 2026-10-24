// Batch 4 (final re-audit fixes) — growbay + crew screen/dossier + captain HP.
// Re-audit REAUDIT_SHIP_SCREENS.md A2–A6, A8–A10, A15, B3, B9, B10 and
// owner rulings 26 (last-member jettison = solo run), 29/30 (captain real
// HP, captain_lost failure), 41 (a botanist tends by default), 44 (strip
// HP colours stay). Asserts real engine state and computed styles.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const SHOTS = process.env.SHOTS || null;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  // domcontentloaded: the engine's own MOD gate below is the real readiness
  // check (a Firefox 'load' can sit on a slow sprite fetch).
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.captains && MOD.ai_companions && MOD.failures);
  await page.evaluate(() => localStorage.removeItem('transplant_save_v1'));
  return page;
}
async function boot(setup) {
  const page = await open();
  await page.evaluate(o => {
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
    showScreen('screen-cruise');
    renderCruise();
  }, setup || {});
  await page.waitForTimeout(150);
  return page;
}
const shot = async (page, name) => { if (SHOTS) { await page.waitForTimeout(450); await page.screenshot({ path: SHOTS + '/' + name + '.png' }); } };
const logText = page => page.evaluate(() => (STATE.shipLog || []).map(e => (e && e.text) || e).join(' | '));
// Puts the ship at a node of the given type (a station for MEDBAY / safe
// dismissal, deep space for the airlock).
const setHere = (page, type) => page.evaluate(t => { STATE.byId[STATE.currentId].node_type = t; }, type);
const openGB = async page => { await page.evaluate(() => openGrowbay()); await page.waitForFunction(() => document.getElementById('overlay-growbay').classList.contains('active')); };
const openDossier = async (page, role) => {
  await page.evaluate(r => openCrewDetail(r), role);
  await page.waitForFunction(() => document.getElementById('overlay-crew').classList.contains('active'));
};

(async () => {
  browser = await chromium.launch();

  // ═══════════════════ GROWBAY ═══════════════════
  console.log('— ruling 41: a botanist tends by default; the player can change it');
  {
    const page = await boot({ crew: ['botanist', 'engineer'] });
    await openGB(page);
    const r = await page.evaluate(() => ({ id: STATE.cropGrowth.tenderId, name: document.getElementById('tender-name').textContent, mods: document.getElementById('mod-list-active').innerText }));
    ok(r.id === 'osei' && r.name === 'DR. OSEI' && /Dr\. Osei tending/.test(r.mods), 'new run with a crew botanist: Dr. Osei tends from the start (' + r.id + ')');
    // The player picks Nobody — it stands.
    await page.click('#tender-slot');
    await page.waitForFunction(() => document.getElementById('tender-slot').classList.contains('open'));
    const rows = await page.$$('#tender-picker .gb-picker-row');
    await rows[rows.length - 1].click();
    await page.evaluate(() => { closeGrowbay(); openGrowbay(); });
    const r2 = await page.evaluate(() => ({ id: STATE.cropGrowth.tenderId, chosen: STATE.cropGrowth.tenderChosen }));
    ok(r2.id === 'none' && r2.chosen === true, 'picking Nobody in the picker stands after reopening (tenderChosen)');
    await page.close();
  }
  {
    const page = await boot({ captain: 'botanist', crew: ['engineer', 'medic'] });
    await openGB(page);
    const r = await page.evaluate(() => ({ id: STATE.cropGrowth.tenderId, name: document.getElementById('tender-name').textContent }));
    ok(r.id === 'captain-botanist' && r.name === 'CAPTAIN', 'botanist captain, no crew botanist: the captain tends by default');
    await page.close();
  }
  {
    const page = await boot({ crew: ['engineer', 'medic'] });
    const id = await page.evaluate(() => { tickCropGrowth(); return STATE.cropGrowth.tenderId; });
    ok(id === 'none', 'no botanist aboard: nobody tends by default');
    // Old save: a botanist aboard, tenderId 'none', never chosen → the botanist takes the bed.
    const r = await page.evaluate(() => {
      STATE.crew = ['botanist', 'engineer']; STATE.crewHP.botanist = 100; delete STATE.crewHP.medic;
      STATE.cropGrowth.tenderId = 'none'; delete STATE.cropGrowth.tenderChosen;
      writeSnapshot(); STATE.cropGrowth = null; loadRun(); tickCropGrowth();
      return STATE.cropGrowth.tenderId;
    });
    ok(r === 'osei', 'old save with no tender and a botanist aboard: migrates to the botanist tending');
    await page.close();
  }

  console.log('— A2: the tender sprite and label come from who really tends');
  {
    const page = await boot({ crew: ['botanist', 'engineer'] });
    // A stowaway holds the botanist role (own name, no sheet).
    await page.evaluate(() => { STATE.crewIdentity = { botanist: { id: 'stow_x', name: 'Pell', story: 'x', origin: 'stowaway' } }; });
    await openGB(page);
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const s = document.getElementById('crew-sprite'); return { name: document.getElementById('tender-name').textContent, empty: s.classList.contains('empty'), bg: s.style.backgroundImage, op: getComputedStyle(s).opacity }; });
    ok(r.name === 'PELL' && r.empty && !/osei/.test(r.bg) && r.op === '0', 'stowaway botanist tends as PELL with no Osei sprite (' + JSON.stringify(r) + ')');
    await page.evaluate(() => { closeGrowbay(); STATE.crewIdentity = {}; openGrowbay(); });
    await page.waitForFunction(() => /osei/.test(document.getElementById('crew-sprite').style.backgroundImage));
    ok(true, 'the real Dr. Osei tending: his growbay sheet');
    await page.evaluate(() => { closeGrowbay(); killCrew('botanist'); openGrowbay(); });
    await page.waitForTimeout(300);
    const d = await page.evaluate(() => { const s = document.getElementById('crew-sprite'); return { id: STATE.cropGrowth.tenderId, name: document.getElementById('tender-name').textContent, empty: s.classList.contains('empty'), bg: s.style.backgroundImage, op: getComputedStyle(s).opacity, mods: document.getElementById('mod-list-active').innerText }; });
    ok(d.empty && d.bg === '' && d.op === '0', 'dead botanist: no sprite in the bay (empty, no sheet)');
    ok(d.name === 'NOBODY' && !/Osei tending/.test(d.mods) && d.id === 'none', 'dead botanist: label NOBODY, no tending modifier, the bed handed back (' + d.id + ')');
    // No animation frames over 2.5s: the sprite stays empty.
    const still = await page.evaluate(() => new Promise(res => { const s = document.getElementById('crew-sprite'); const seen = new Set(); const t = setInterval(() => seen.add(s.style.backgroundPosition + '|' + s.style.backgroundImage), 100); setTimeout(() => { clearInterval(t); res([...seen]); }, 2500); }));
    ok(still.length === 1 && still[0].endsWith('|'), 'no animating sprite for a dead tender (' + still.length + ' frame states)');
    await page.close();
  }
  {
    // Captain-botanist tending at half while the captain is wounded.
    const page = await boot({ captain: 'botanist', crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => { tickCropGrowth(); const a = growbayTenderOf().growth; STATE.captainHP = 30; const b = growbayTenderOf(); return [a, b.growth, b.wounded]; });
    ok(r[0] === 7 && r[1] === 3.5 && r[2], 'a wounded botanist captain tends at half (7% → 3.5%)');
    await page.close();
  }

  console.log('— A3: a dead crop shows DEAD, stands still, lists no decorative modifiers');
  {
    const page = await boot({ crew: ['botanist', 'engineer'] });
    await page.evaluate(() => { tickCropGrowth(); STATE.cropGrowth.health = 0; STATE.cropGrowth.growth = 60; STATE.flags.add('crop_death_accepted'); });
    await openGB(page);
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const sp = document.getElementById('plant-sprite'), cs = getComputedStyle(sp);
      const AIQ = document.getElementById('aria-text').textContent;
      return {
        stage: document.getElementById('stage-display').textContent, label: document.getElementById('plant-stage-label').textContent,
        anim: cs.animationName, filter: cs.filter, rows: [...document.querySelectorAll('#mod-list-active .gb-mod-row')].map(x => x.innerText.replace(/\s+/g, ' ')),
        mon: document.querySelectorAll('#mod-list-monitored .gb-mod-row').length, ready: document.getElementById('ready-day').textContent,
        next: document.getElementById('next-stage-line').textContent, bonus: document.getElementById('tender-bonus').textContent, ai: AIQ,
        labelColor: getComputedStyle(document.getElementById('plant-stage-label')).color,
      };
    });
    ok(r.stage === 'DEAD' && r.label === 'DEAD', 'banner + plant label read DEAD');
    ok(r.anim === 'none' && /grayscale/.test(r.filter), 'the plant does not sway and is greyed (' + r.anim + ', ' + r.filter + ')');
    ok(r.rows.length === 1 && /Crop dead/.test(r.rows[0]) && r.mon === 0, 'one honest row, nothing monitored (' + JSON.stringify(r.rows) + ')');
    ok(r.ready === 'NEVER' && /Nothing grows/.test(r.next) && r.bonus === 'nothing to tend', 'ready NEVER, next-stage line and tender bonus say nothing grows');
    ok(/dead|stopped|Nothing in the bay|Nothing grows|no longer growing|Nothing is growing|fallen|service life|lost/i.test(r.ai) && !/smile|nominal|thriving|healthy/i.test(r.ai), 'AI footer has a fitting line: "' + r.ai + '"');
    const cls = await page.evaluate(() => growbayInspectClass());
    ok(cls === 'dead', 'Inspect AI read for a dead crop: dead pool');
    await shot(page, 'b4_growbay_dead');
    await page.close();
  }

  console.log('— A4: water badges agree with the model and the Orders screen');
  {
    const page = await boot({ crew: ['engineer', 'medic'] });
    await openGB(page);
    const rows = await page.evaluate(() => {
      const out = [];
      for (let p = 15; p <= 85; p += 1) {
        setWaterSplit(p); STATE.cropGrowth.waterPlant = p;
        const st = cropWaterStatusAt(p);
        const need = Math.round(cropWaterNeed());
        // The model's own numbers at this split (growbay computeModifiers).
        const mods = (() => { openGrowbay(); return [...document.querySelectorAll('#mod-list-active .gb-mod-row')].map(x => x.innerText.replace(/\s+/g, ' ')); })();
        const pBadge = document.getElementById('gb-water-plant-status').textContent;
        const cBadge = document.getElementById('gb-water-crew-status').textContent;
        out.push({ p, need, rate: crewWaterDrainRate(), st: st.plant.label, crewSt: st.crew.label, pBadge, cBadge, mods });
      }
      closeGrowbay();
      return out;
    });
    const badPlant = rows.filter(x => {
      const hurts = x.mods.some(m => /Underwatered|Root rot|Ship water dry/.test(m) && /−[\d.]+ health\/day/.test(m));
      return (x.pBadge === 'PARCHED') !== (hurts && x.p < x.need);
    });
    ok(badPlant.length === 0, 'plant PARCHED exactly where underwatering starts doing damage (' + badPlant.map(x => x.p).join(',') + ')');
    const badCrew = rows.filter(x => (x.cBadge === 'NOMINAL') !== (x.rate === 0) || (x.cBadge === 'CRITICAL') !== (x.rate === 6));
    ok(badCrew.length === 0, 'crew NOMINAL only with no drain, CRITICAL only at the HP tier (' + badCrew.map(x => x.p + ':' + x.cBadge + '/' + x.rate).join(',') + ')');
    ok(rows.every(x => x.st === x.pBadge && x.crewSt === x.cBadge), 'badges = the shared waterStatusAt bands');
    // Orders headline: never "both fine" above a drain row.
    const o = await page.evaluate(() => {
      const res = [];
      for (const p of [30, 45, 55, 62, 75]) {
        setWaterSplit(p); openOrders();
        res.push({ p, rate: crewWaterDrainRate(), desc: document.getElementById('od-water-desc').textContent, stat: document.getElementById('od-water-preview').innerText });
        closeOrders('cancel');
      }
      return res;
    });
    const lie = o.filter(x => /both fine/.test(x.desc) && (x.rate > 0 || /MORALE −/.test(x.stat)));
    ok(lie.length === 0, 'Orders headline never says "both fine" above a morale-drain row (' + o.map(x => x.p + ':' + x.desc).join(' / ') + ')');
    ok(o.some(x => x.rate > 0 && /Crew/.test(x.desc)), 'a drained crew is named in the headline');
    await page.close();
  }

  console.log('— A5: the yield preview includes the tender bonus (preview = outcome)');
  {
    const page = await boot({ crew: ['botanist', 'engineer'] });
    await page.evaluate(() => { tickCropGrowth(); STATE.resources.food = 20; Object.assign(STATE.cropGrowth, { growth: 100, health: 90 }); });
    await openGB(page);
    const r = await page.evaluate(() => {
      const y = cropHarvestYield();
      openInspect();
      const ins = document.getElementById('ins-content-swap').innerText;
      closeInspect();
      const tip = (document.getElementById('crop-display-name').dataset.tipRows || '') + JSON.stringify(Tooltip && Tooltip._specOf ? Tooltip._specOf(document.getElementById('crop-display-name')) : '');
      const got = doHarvest();
      return { y, ins, got, tip };
    });
    ok(r.y.total === 46 && r.y.bonus === 6, 'Osei tending wheat: +40 base +6 tending = 46');
    ok(/\+46 Food \(incl\. \+6 tending\)/.test(r.ins), 'Inspect yield row shows +46 Food (incl. +6 tending)');
    ok(r.got && r.got.food === 46, 'the harvest pays exactly the preview (+' + (r.got && r.got.food) + ')');
    // The banner tooltip reads the same yieldText (hover it).
    await page.waitForTimeout(100);
    await page.evaluate(() => { Object.assign(STATE.cropGrowth, { growth: 50 }); closeGrowbay(); openGrowbay(); });
    // Off the element first, so the hover is a fresh mouseenter (the
    // pointer can already sit there after the reopen), then a patient wait.
    // Under load (two suites at once) one hover can miss its mouseenter:
    // re-hover up to three times, each a fresh enter from off the element.
    let tipText = '';
    for (let tries = 0; tries < 3 && !/\+46 Food/.test(tipText); tries++) {
      await page.mouse.move(2, 2);
      await page.waitForTimeout(150);
      await page.hover('#crop-display-name');
      await page.waitForFunction(() => [...document.querySelectorAll('.ui-tip')].some(t => /Yield/.test(t.innerText) && getComputedStyle(t).visibility !== 'hidden'), null, { timeout: 8000 }).catch(() => {});
      tipText = await page.evaluate(() => [...document.querySelectorAll('.ui-tip')].map(t => t.innerText).join(' '));
    }
    ok(/\+46 Food \(incl\. \+6 tending\)/.test(tipText), 'species tooltip Yield row: +46 Food (incl. +6 tending)' + (/\+46 Food/.test(tipText) ? '' : ' — tooltips: ' + tipText.replace(/\s+/g, ' ').slice(0, 200)));
    await page.close();
  }

  console.log('— A6: the Inspect AI read knows every engine threat');
  {
    const page = await boot({ crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => {
      tickCropGrowth();
      const out = {};
      STATE.resources.water = 0; out.dry = growbayInspectClass(); STATE.resources.water = 60;
      const node = STATE.byId[STATE.currentId], keep = node.node_type;
      node.node_type = 'nebula'; setWaterSplit(Math.round(cropWaterNeed())); out.dark = growbayInspectClass();
      node.node_type = keep;
      STATE.cropGrowth.pest = true; out.pest = growbayInspectClass(); STATE.cropGrowth.pest = false;
      setWaterSplit(15); out.low = growbayInspectClass();
      setWaterSplit(85); out.high = growbayInspectClass();
      return out;
    });
    ok(r.dry === 'water_dry', 'ship water dry → its own read (' + r.dry + ')');
    ok(r.dark === 'dark', 'low light (nebula) → its own read (' + r.dark + ')');
    ok(r.pest === 'pest' && r.low === 'water_low' && r.high === 'water_high', 'pest / underwatered / root rot reads still map');
    const lines = await page.evaluate(() => { STATE.resources.water = 0; openGrowbay(); openInspect(); const t = document.querySelector('#ins-content-swap .ins-aria-read').innerText; closeInspect(); closeGrowbay(); return t; });
    ok(!/No active threats|nothing concerning|Nothing to report|Nothing is wrong/i.test(lines) && /water|tank|dry|Drought/i.test(lines), 'the dry-tank read is shown, not "no active threats": ' + lines.slice(0, 90));
    await page.close();
  }

  console.log('— A15: a growbay harvest logs "▶ Harvested … +N food" and the burst shows what landed');
  {
    const page = await boot({ crew: ['botanist', 'engineer'] });
    await page.evaluate(() => { tickCropGrowth(); STATE.resources.food = 30; Object.assign(STATE.cropGrowth, { growth: 100, health: 90 }); });
    await openGB(page);
    await page.click('#harvest-btn');
    await page.waitForFunction(() => document.getElementById('harvest-burst').classList.contains('fire'));
    const r = await page.evaluate(() => ({ burst: document.getElementById('harvest-burst').textContent, food: STATE.resources.food }));
    const log = await logText(page);
    ok(/▶ Harvested WHEAT\. \+46 food\. Cycle reset\./.test(log) && r.burst === '+46 FOOD', 'growbay HARVEST: log "▶ Harvested WHEAT. +46 food" and burst +46 FOOD');
    await page.evaluate(() => { closeGrowbay(); STATE.resources.food = resMax('food') - 3.6; Object.assign(STATE.cropGrowth, { growth: 100, health: 90 }); openGrowbay(); });
    const before = await page.evaluate(() => STATE.items.filter(i => i === 'ration_brick').length);
    await page.click('#harvest-btn');
    await page.waitForFunction(() => document.getElementById('harvest-burst').classList.contains('fire'));
    const r2 = await page.evaluate(() => ({ burst: document.getElementById('harvest-burst').textContent, bricks: STATE.items.filter(i => i === 'ration_brick').length }));
    const log2 = await logText(page);
    const gotBricks = r2.bricks - before;
    ok(/\+4 FOOD/.test(r2.burst) && !/\+46/.test(r2.burst), 'near-full stores: the burst shows the 4 food that fit, not +46 (' + r2.burst + ')');
    ok(new RegExp('Harvested WHEAT\\. \\+4 food' + (gotBricks ? ', ' + gotBricks + ' ration brick' : '')).test(log2), 'the log states the real gain incl. bricks pressed (' + gotBricks + ')');
    // Crop-card path: exactly one ▶ line per harvest.
    await page.evaluate(() => { closeGrowbay(); STATE.resources.food = 10; Object.assign(STATE.cropGrowth, { growth: 100, health: 90 }); renderCruise(); });
    const n0 = (await logText(page)).split('▶ Harvested').length;
    await page.evaluate(() => document.getElementById('crop-harvest-btn').click());
    const n1 = (await logText(page)).split('▶ Harvested').length;
    ok(n1 - n0 === 1, 'crop-card HARVEST logs one "▶ Harvested" line (same source as the growbay)');
    await page.close();
  }

  // ═══════════════════ CREW ═══════════════════
  console.log('— A8: the medic\'s Treatment clears a pending crisis, like MEDBAY');
  {
    const page = await boot({ crew: ['engineer', 'medic'] });
    await page.evaluate(() => { applySeverity('engineer', 'delayed'); });
    await openDossier(page, 'medic');
    await page.click('#cd-active-btn');
    const r = await page.evaluate(() => ({ hp: crewHPOf('engineer'), pend: !!STATE.crewPending.engineer }));
    await page.evaluate(() => openCrewDetail('engineer'));
    const st = await page.evaluate(() => document.getElementById('cd-status-active').innerText);
    ok(r.hp === 100 && !r.pend, 'Treatment: engineer back to 100 and the pending crisis is closed');
    ok(!/Pending crisis/.test(st), 'dossier no longer lists "Pending crisis" (' + st.replace(/\s+/g, ' ') + ')');
    await page.close();
  }

  console.log('— A9: armed skill flags leave with the member, by every road');
  {
    const paths = {
      kill: () => { killCrew('engineer'); killCrew('diplomat'); },
      desert: () => { setCrewMorale(0); crewMoraleWatch(); crewDesertions({ name: 'X' }); },
      release: () => { releaseCrewRole('engineer'); releaseCrewRole('diplomat'); },
      replace: () => {
        STATE.stowaway = { identity: { id: 'st', name: 'Pell', join_role: 'engineer', story: 's' }, revealed: true };
        applyOutcomeEffects({ stowaway_resolve: 'welcome_replace', time_cost: 'none' });
        STATE.stowaway = { identity: { id: 'st2', name: 'Quill', join_role: 'diplomat', story: 's' }, revealed: true };
        applyOutcomeEffects({ stowaway_resolve: 'welcome_replace', time_cost: 'none' });
      },
    };
    for (const [name, fn] of Object.entries(paths)) {
      const page = await boot({ crew: ['engineer', 'diplomat'] });
      const r = await page.evaluate(src => {
        STATE.flags.add('emergency_patch_armed'); STATE.flags.add('negotiation_prepared');
        (new Function('return ' + src))()();
        return { patch: STATE.flags.has('emergency_patch_armed'), neg: STATE.flags.has('negotiation_prepared'), crew: STATE.crew.slice() };
      }, fn.toString());
      ok(!r.patch && !r.neg, name + ': emergency_patch_armed + negotiation_prepared cleared (' + JSON.stringify(r) + ')');
      await page.close();
    }
    // Dossier dismiss (station) and jettison (deep space) — the UI paths.
    for (const [type, label] of [['station', 'dismiss'], ['void', 'jettison']]) {
      const page = await boot({ crew: ['engineer', 'medic'] });
      await setHere(page, type);
      await page.evaluate(() => STATE.flags.add('emergency_patch_armed'));
      await openDossier(page, 'engineer');
      await page.click('#cd-dismiss-btn');
      await page.click('#cd-confirm-ok');
      await page.waitForFunction(() => !STATE.crew.includes('engineer'), null, { timeout: 5000 });
      ok(!(await page.evaluate(() => STATE.flags.has('emergency_patch_armed'))), label + ' from the dossier clears Kazuki\'s armed patch');
      await page.close();
    }
  }

  console.log('— A10: dossier morale uses the HUD rounding; Deserting agrees with the value');
  {
    const page = await boot({ crew: ['engineer', 'medic'] });
    await page.evaluate(() => setCrewMorale(0.3, 'medic'));
    await openDossier(page, 'medic');
    const r = await page.evaluate(() => ({ val: document.getElementById('cd-stat-mo-val').textContent, st: document.getElementById('cd-status-active').innerText }));
    ok(r.val === '1' && /Morale crisis/.test(r.st) && !/Deserting/.test(r.st), 'morale 0.3 reads 1 · Morale crisis, not Deserting (' + r.val + ')');
    await page.evaluate(() => { setCrewMorale(0, 'medic'); openCrewDetail('medic'); });
    const r2 = await page.evaluate(() => ({ val: document.getElementById('cd-stat-mo-val').textContent, st: document.getElementById('cd-status-active').innerText }));
    ok(r2.val === '0' && /Deserting/.test(r2.st), 'morale 0 reads 0 · Deserting');
    await page.close();
  }

  console.log('— B3 / B9 / B10: cream, flavour hint, cycle order + chevrons');
  {
    const page = await boot({ crew: ['botanist', 'engineer'] });
    await openDossier(page, 'botanist');
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => {
      const sub = document.querySelector('#overlay-crew .cd-subtitle');
      return {
        cream: getComputedStyle(document.getElementById('overlay-crew')).getPropertyValue('--cream').trim(),
        sub: getComputedStyle(sub).color, dot: getComputedStyle(sub.querySelector('.dot')).color,
        roleDot: getComputedStyle(document.querySelector('#overlay-crew .cd-role .dot')).color,
        hint: (document.querySelector('#cd-bio .hint') || {}).textContent,
      };
    });
    ok(r.cream === '#e6d4a8' && r.sub === 'rgb(230, 212, 168)', 'dossier --cream is the demo #e6d4a8 (' + r.cream + ', ' + r.sub + ')');
    ok(r.dot === 'rgb(230, 212, 168)' && r.roleDot === 'rgb(90, 122, 106)', 'subtitle "·" in cream (demo); the role-line dot stays green-grey');
    ok(r.hint === 'Argues with MARV about soil chemistry. Loses, politely.', 'hint line = the demo\'s flavour line, voiced for the active AI (' + r.hint + ')');
    const hints = await page.evaluate(() => { const o = {}; for (const k of ['engineer']) { openCrewDetail(k); o[k] = document.querySelector('#cd-bio .hint').textContent; } return o; });
    ok(!/Required|microgame|EXTREME/i.test(hints.engineer), 'engineer hint is flavour, not mechanics: ' + hints.engineer);
    // Order: crew first, captain last.
    const order = await page.evaluate(() => {
      const seq = [];
      openCrewDetail();
      for (let i = 0; i < 4; i++) { seq.push(document.getElementById('cd-role-banner').textContent); document.getElementById('cd-nav-next').click(); }
      return seq;
    });
    ok(order.join(',') === 'BOTANIST,ENGINEER,VETERAN,BOTANIST', 'cycle order: crew in order, captain last — its banner names the background (' + order.join(',') + ')');
    const chev = await page.evaluate(() => [getComputedStyle(document.getElementById('cd-nav-prev')).display, getComputedStyle(document.getElementById('cd-nav-next')).opacity]);
    ok(chev[0] !== 'none' && Number(chev[1]) > 0.2, 'chevrons shown (demo)');
    await shot(page, 'b4_crew_dossier');
    await page.close();
  }

  console.log('— ruling 26: jettisoning the LAST crew member is a solo run');
  {
    const page = await boot({ crew: ['engineer'] });
    await setHere(page, 'void');
    await openDossier(page, 'engineer');
    await page.click('#cd-dismiss-btn');
    await page.click('#cd-confirm-ok');
    await page.waitForFunction(() => document.getElementById('cd-epitaph').classList.contains('visible'), null, { timeout: 5000 });
    const r = await page.evaluate(() => ({ crew: STATE.crew.length, ended: !!STATE.ended, allDead: STATE.flags.has('all_crew_dead'), fail: checkFailure(), ep: document.getElementById('cd-epitaph-line').textContent }));
    ok(r.crew === 0 && !r.ended && !r.fail && !r.allDead && r.ep.length > 5, 'last jettison: epitaph shows, no crew_gone, run goes on (' + JSON.stringify(r).slice(0, 120) + ')');
    await shot(page, 'b4_last_jettison_epitaph');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('cd-name-banner').textContent.toUpperCase() === 'CAPTAIN', null, { timeout: 3000 }); // the role banner names the background now
    const solo = await page.evaluate(() => ({ chevDisabled: document.getElementById('cd-nav-next').disabled, chevShown: getComputedStyle(document.getElementById('cd-nav-next')).display !== 'none', mo: crewMoraleAvg() }));
    ok(solo.chevDisabled && solo.chevShown && solo.mo === null, 'solo captain dossier: chevrons in place but inert; no morale');
    await page.close();
  }
  {
    // crew_gone stays reachable: the captain dies with nobody else aboard.
    const page = await boot({ crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => {
      killCrew('engineer'); killCrew('medic');
      const solo = { ended: checkFailure(), allDead: STATE.flags.has('all_crew_dead') };
      STATE.captainHP = 5; damageCrew('captain', 40); checkFailure();
      return { solo, type: STATE.ended && document.getElementById('end-cine-title') ? document.getElementById('end-cine-title').textContent : null, ended: STATE.ended };
    });
    ok(!r.solo.ended && r.solo.allDead, 'all crew dead, captain alive: the captain flies on solo (no failure)');
    ok(r.ended && /Autopilot/i.test(r.type || ''), 'the captain then dies with nobody aboard → crew_gone "Autopilot" (' + r.type + ')');
    await page.close();
  }

  console.log('— ruling 44: crew strip HP colours stay (amber < 40, red ≤ 25) — the captain too');
  {
    const page = await boot({ crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => {
      STATE.crewHP.engineer = 30; STATE.crewHP.medic = 20; STATE.captainHP = 35; renderCruise();
      const fills = [...document.querySelectorAll('#crew-strip .crew-slot:not(.empty) .crew-bar.hp .crew-bar-fill')];
      return fills.map(f => ({ w: f.style.width, bg: getComputedStyle(f).backgroundColor }));
    });
    ok(r[0].w === '35%' && r[0].bg === 'rgb(212, 168, 48)', 'captain card: real HP 35 → 35% amber (' + JSON.stringify(r[0]) + ')');
    ok(r[1].bg === 'rgb(212, 168, 48)' && r[2].bg === 'rgb(204, 85, 85)', 'engineer 30 amber, medic 20 red');
    await page.close();
  }

  // ═══════════════════ CAPTAIN HP ═══════════════════
  console.log('— rulings 29/30: the captain has real HP');
  {
    const page = await boot({ crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => {
      const out = { start: STATE.captainHP, people: peopleAboard() };
      STATE.captainHP = 62; writeSnapshot(); STATE.captainHP = 1; loadRun(); out.loaded = STATE.captainHP;
      const snap = JSON.parse(localStorage.getItem('transplant_save_v1')); delete snap.captainHP; localStorage.setItem('transplant_save_v1', JSON.stringify(snap)); loadRun(); out.migrated = STATE.captainHP;
      return out;
    });
    ok(r.start === 100 && r.people.join(',') === 'captain,engineer,medic', 'new run: captain at 100 HP, aboard with the crew');
    ok(r.loaded === 62 && r.migrated === 100, 'captain HP saves (62) and an old save migrates to full (100)');
    // Strip + dossier show the real value.
    await page.evaluate(() => { STATE.captainHP = 58; renderCruise(); });
    const strip = await page.evaluate(() => document.querySelector('#crew-strip .crew-slot.captain .crew-bar.hp .crew-bar-fill').style.width);
    await openDossier(page, 'captain');
    const dos = await page.evaluate(() => ({ val: document.getElementById('cd-stat-hp-val').textContent, w: document.getElementById('cd-stat-hp-fill').style.width }));
    ok(strip === '58%' && dos.val === '58' && dos.w === '58%', 'strip bar 58% and dossier HEALTH 58 — the real captain HP');
    await page.close();
  }
  {
    const page = await boot({ crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => {
      const ch = { effort_required: 30, requires_effort_from: ['pilot'] };
      const a = choiceEffort(ch).available;
      applySeverity('captain', 'injury');
      const hp = STATE.captainHP;
      const b = choiceEffort(ch).available;
      const log = (STATE.shipLog || []).map(e => (e && e.text) || e).join(' | ');
      return { a, b, hp, log, inj: activeTriggers().has('crew_injured') };
    });
    ok(r.hp <= 35 && r.hp >= 5, 'injury on the captain: HP under the wound line (' + r.hp + ')');
    ok(r.a - r.b === 5, 'a wounded captain\'s own hands count half on effort jobs (' + r.a + ' → ' + r.b + ')');
    ok(/The captain is wounded/.test(r.log), 'the log says the captain is wounded');
    await openDossier(page, 'captain');
    const st = await page.evaluate(() => ({ st: document.getElementById('cd-status-active').innerText, warn: document.getElementById('cd-passive-warn').classList.contains('hidden') }));
    ok(/Wounded/.test(st.st) && /Hands count half \(effort \+5\)/.test(st.st) && st.warn, 'captain dossier: Wounded with the captain\'s real effect; background not shown as halved');
    await shot(page, 'b4_captain_wounded');
    await page.close();
  }
  {
    // Delayed wound on the captain → the crisis is theirs; text reads "The captain".
    const page = await boot({ crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => {
      applySeverity('captain', 'delayed');
      const pend = !!STATE.crewPending.captain;
      const ev = dueDelayedCrisis();
      // event_crisis_021 opens a sentence with the name and uses it mid-sentence too.
      const body = interpolateStowawayTokens(EVENTS.event_crisis_021.body);
      return { pend, patient: STATE.crisisPatient, ev: ev && ev.id, body: body.slice(0, 260) };
    });
    ok(r.pend && r.patient === 'captain' && /^event_crisis_0(21|22|58)$/.test(r.ev), 'a delayed wound on the captain comes due as their own crisis (' + r.ev + ')');
    ok(/^The captain has insisted/.test(r.body) && /looks at the captain,/.test(r.body) && !/\{patient/.test(r.body), '{patient.name} → "The captain" opening a sentence, "the captain" inside one');
    // The crisis kill choice on the captain: softer landings, else captain_lost.
    const r2 = await page.evaluate(() => {
      const rnd = Math.random; Math.random = () => 0.1; // < crew medic 0.5
      applyOutcomeEffects({ crew_effect: { type: 'kill', target: 'patient' }, severity: 'lethal', time_cost: 'none' });
      Math.random = rnd;
      return { hp: STATE.captainHP, saved: STATE.lethalSaved };
    });
    ok(r2.hp > 0 && /refused to let it end there — you are badly hurt/.test(r2.saved || ''), 'lethal on the captain, crew medic aboard: saved (50% roll) — "' + r2.saved + '"');
    await page.close();
  }
  {
    const page = await boot({ captain: 'medic', crew: ['engineer', 'pilot'] });
    const r = await page.evaluate(() => {
      const out = { selfSave: crewMedicSave() };
      STATE.items.push('medkit');
      const kits0 = STATE.items.filter(i => i === 'medkit').length;
      const rnd = Math.random; Math.random = () => 0.1; // < medkit 0.15
      applySeverity('captain', 'lethal');
      out.medkit = { hp: STATE.captainHP, kits: kits0 - STATE.items.filter(i => i === 'medkit').length, saved: STATE.lethalSaved };
      while (STATE.items.includes('medkit')) STATE.items.splice(STATE.items.indexOf('medkit'), 1); // no second landing
      Math.random = () => 0.9;
      applySeverity('captain', 'lethal');
      Math.random = rnd;
      out.dead = STATE.captainHP;
      out.fail = checkFailure();
      return out;
    });
    ok(r.selfSave === 0, 'a medic captain cannot save themselves (crew medic save 0)');
    ok(r.medkit.hp === 20 && r.medkit.kits === 1 && /medkit made the difference — you are/.test(r.medkit.saved), 'a carried medkit (15%) turns the captain\'s death into an injury and is spent');
    ok(r.dead === 0 && r.fail, 'no landing left: the captain dies and the run ends');
    await page.waitForFunction(() => document.getElementById('screen-end').classList.contains('active'));
    const t = await page.evaluate(() => document.getElementById('end-cine-title').textContent);
    ok(/Command Vacant/i.test(t), 'crew still aboard → the new captain_lost failure ending (' + t + ')');
    await shot(page, 'b4_captain_lost');
    await page.close();
  }
  {
    const page = await boot({ crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => {
      const out = {};
      // Deprivation hits everyone aboard, the captain too.
      STATE.resources.food = 0; STATE.deprived = {}; passDays(2);
      out.dep = STATE.captainHP;
      // Random pools include the captain.
      const rnd = Math.random; Math.random = () => 0; out.pick = damageCrew(null, 1); Math.random = rnd;
      // The thirst tier stays crew-only (the Orders CREW row).
      STATE.resources.food = 60; STATE.deprived = {}; setWaterSplit(85);
      const c0 = STATE.captainHP, e0 = crewHPOf('engineer'); passDays(1);
      out.thirst = { cap: STATE.captainHP - c0, eng: crewHPOf('engineer') - e0, rate: crewWaterDrainRate() };
      return out;
    });
    ok(r.dep < 100, 'a day at 0 food costs the captain HP too (' + r.dep + ')');
    ok(r.pick === 'captain', 'a random "someone aboard" hit can land on the captain');
    ok(r.thirst.rate === 6 && r.thirst.cap < 0 && r.thirst.eng < 0, 'the crew-water HP tier hits everyone who drinks from the crew share, the captain too (2026-10-23 hunt) (captain ' + r.thirst.cap + ', engineer ' + r.thirst.eng + ')');
    await page.close();
  }
  {
    // Healing: regen, Treatment, MEDBAY, medkit, heal outcomes.
    const page = await boot({ crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => {
      const out = {};
      STATE.captainHP = 50; const next = [...nextAvailableNodes()][0]; travelTo(next); out.regen = STATE.captainHP;
      STATE.captainHP = 30; applyOutcomeEffects({ crew_effect: { type: 'heal', target: 'all_injured' }, time_cost: 'none' }); out.heal = STATE.captainHP;
      STATE.captainHP = 30; STATE.crewPending.captain = true; out.worst = worstHurtCrew();
      return out;
    });
    ok(r.regen > 50, 'per-leg regen heals the captain (' + r.regen + ')');
    ok(r.heal === 70, 'a heal-all-injured outcome reaches the captain (+40)');
    ok(r.worst === 'captain', 'the medkit\'s "worst hurt" can be the captain');
    await page.evaluate(() => { if (STATE.ended) return; showScreen('screen-cruise'); hideOverlay && document.querySelectorAll('.overlay.active').forEach(o => hideOverlay(o.id)); });
    await openDossier(page, 'medic');
    await page.click('#cd-active-btn');
    const t = await page.evaluate(() => ({ hp: STATE.captainHP, pend: !!STATE.crewPending.captain }));
    ok(t.hp === 100 && !t.pend, 'the medic\'s Treatment heals the captain and closes their pending crisis');
    await page.close();
  }
  {
    const page = await boot({ crew: ['engineer', 'medic'] });
    await setHere(page, 'station');
    const r = await page.evaluate(() => {
      STATE.captainHP = 40; STATE.crewPending.captain = true; STATE.goldAmount = 100;
      openStopMenu && openStopMenu();
      const btn = document.querySelector('[data-verb-id="medbay"]');
      if (btn) btn.click();
      return { hp: STATE.captainHP, pend: !!STATE.crewPending.captain, found: !!btn };
    });
    const log = await logText(page);
    ok(r.found && r.hp === 100 && !r.pend && /MEDBAY — The captain is treated/.test(log), 'MEDBAY treats the captain and closes the pending crisis (' + JSON.stringify(r) + ')');
    await page.close();
  }
  {
    // A xenobiologist captain standing in, hurt too badly to help.
    const page = await boot({ captain: 'xenobiologist', crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => {
      const ch = { text: 'x', requires_crew: 'xenobiologist' };
      const a = lockReason(ch);
      STATE.captainHP = 20;
      return [a, lockReason(ch)];
    });
    ok(r[0] == null && r[1] === 'You are hurt too badly to help', 'a captain standing in for a role is refused at critical HP (' + r[1] + ')');
    await page.close();
  }
  {
    // Combat casualties: everyone aboard is in the pool.
    const page = await open();
    const ok1 = await page.evaluate(async () => {
      const src = await (await fetch('engine/js/combat.js')).text();
      return /peopleAboard\(\)\.length/.test(src) && /aboardNow\[Math\.floor/.test(src);
    });
    ok(ok1, 'combat defeat casualties draw from everyone aboard (captain included)');
    const f = await page.evaluate(() => ({ mod: MOD.failures.find(x => x.failure_type === 'captain_lost'), reg: !!(MOD.tag_registry || {}).failure_type }));
    ok(f.mod && f.mod.active !== false && f.mod.title && f.mod.body && f.mod.epitaph, 'failures.json carries the captain_lost module (title, body, epitaph)');
    await page.close();
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (errors.length ? '; page errors: ' + errors.length : ''));
  if (errors.length) console.log('errors: ' + errors.slice(0, 5).join(' | '));
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
