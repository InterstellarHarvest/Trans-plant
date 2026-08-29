#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');

const BASE_URL = process.env.REVIEW_URL || 'http://localhost:8177/index.html?debug=fixed_path';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const errors = [];
  const failures = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + (e.stack || e.message)));
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('404')) errors.push('[console] ' + m.text());
  });

  const check = (ok, label, detail) => {
    console.log((ok ? '  ✓ ' : '  ✗ ') + label + (detail ? ' — ' + detail : ''));
    if (!ok) failures.push(label + (detail ? ': ' + detail : ''));
  };

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof EVENTS !== 'undefined' && Object.keys(EVENTS).length > 0);

  console.log('1. Slow sprite-probe/typewriter synchronization');
  const talk = await page.evaluate(async () => {
    const NativeImage = window.Image;
    class SlowImage {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.naturalWidth = 392;
        this.naturalHeight = 294;
      }
      set src(value) {
        this._src = value;
        setTimeout(() => { if (this.onload) this.onload(); }, 100);
      }
      get src() { return this._src; }
      get complete() { return true; }
    }
    window.Image = SlowImage;
    SceneArt.clearRunCaches();
    const ev = { id: 'review_slow_talk', scene_type: 'ship_exterior', comm_mode: 'screen' };
    const npc = { disposition: 'pirate', species: 'human', displayName: 'REVIEW PIRATE' };
    const lineEl = document.getElementById('enc-dialog-line');
    typeInto(lineEl, 'x', 1, () => SceneArt.stopTalking());
    SceneArt.render(ev, STATE.byId[STATE.currentId], { line: 'x' }, npc, 'x');
    await new Promise(resolve => setTimeout(resolve, 900));
    const head = document.getElementById('enc-subject-head');
    const frameX = head.style.getPropertyValue('--frame-x');
    window.Image = NativeImage;
    SceneArt.stopTalking();
    return { frameX, text: lineEl.textContent };
  });
  check(talk.text === 'x' && talk.frameX === '295', 'late sprite load stays on idle after typing finishes', JSON.stringify(talk));

  console.log('2. Engine-repair delayed completion isolation');
  const repair = await page.evaluate(async () => {
    openEngineRepair(() => {});
    document.getElementById('er-hs-breaker').click();
    for (const id of ['B1', 'B2', 'B3', 'B4']) document.getElementById('er-br-' + id).click();
    document.getElementById('er-comp-close').click();
    document.getElementById('er-hs-switches').click();
    await new Promise(resolve => setTimeout(resolve, 450));
    const result = {
      panelOpen: document.getElementById('er-comp-panel').classList.contains('open'),
      title: document.getElementById('er-comp-title').textContent,
      breakerFixed: document.getElementById('er-hs-breaker').classList.contains('fixed')
    };
    document.getElementById('er-ec-abandon').click();
    return result;
  });
  check(repair.panelOpen && repair.title === 'IGNITION ARRAY' && repair.breakerFixed,
    'one component completion does not close the next component', JSON.stringify(repair));

  console.log('3. Repeated event-id combat-stage reset');
  const reset = await page.evaluate(async () => {
    const ev = EVENTS.event_encounter_pirate_001;
    const node = STATE.byId[STATE.currentId];
    enterEvent(node, ev);
    await new Promise(resolve => setTimeout(resolve, 500));
    const screen = document.getElementById('screen-encounter');
    const sprite = document.getElementById('enc-backdrop-sprite');
    const subject = document.getElementById('enc-subject');
    const plate = document.getElementById('enc-subject-name');
    screen.classList.add('combat-ended', 'hostile-gone');
    sprite.style.opacity = '0';
    subject.classList.add('combat-crt-off');
    plate.classList.add('combat-crt-off-name');
    returnToHub();
    enterEvent(node, ev);
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      combatEnded: screen.classList.contains('combat-ended'),
      hostileGone: screen.classList.contains('hostile-gone'),
      opacity: sprite.style.opacity,
      crt: subject.classList.contains('combat-crt-off'),
      crtName: plate.classList.contains('combat-crt-off-name')
    };
  });
  check(!reset.combatEnded && !reset.hostileGone && reset.opacity === '' && !reset.crt && !reset.crtName,
    'same event id entered later receives a clean combat stage', JSON.stringify(reset));

  console.log('4. Choice double-click isolation');
  await page.evaluate(() => {
    returnToHub();
    enterEvent(STATE.byId[STATE.currentId], EVENTS.event_general_030);
  });
  await page.waitForTimeout(350);
  await page.dblclick('#enc-choices .enc-choice:not(.locked)', { delay: 25 });
  await page.waitForTimeout(150);
  const doubleClick = await page.evaluate(() => ({
    screen: document.querySelector('.screen.active').id,
    event: STATE.currentEvent && STATE.currentEvent.id,
    outcomeMode: STATE.outcomeMode,
    title: document.getElementById('enc-narr-title').textContent
  }));
  check(doubleClick.screen === 'screen-encounter' && doubleClick.event === 'event_general_030' &&
      doubleClick.outcomeMode && doubleClick.title === 'OUTCOME',
    'double-click resolves one choice without skipping its outcome', JSON.stringify(doubleClick));

  console.log('5. Targeting fallback respects pause');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof EVENTS !== 'undefined' && Object.keys(EVENTS).length > 0);
  await page.evaluate(() => {
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'pilot', crew: ['engineer', 'botanist'], crop: 'tomato', ship: 'Pause Probe' });
    enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001);
    triggerCombat({});
    const fire = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /fire laser/i.test(b.textContent));
    fire.click();
    PauseMenu.open();
  });
  await page.waitForTimeout(1900);
  const pausedTargeting = await page.evaluate(() => ({
    paused: PauseBus.paused,
    targeting: document.getElementById('screen-encounter').classList.contains('combat-targeting'),
    narrative: document.getElementById('enc-narr-title').textContent
  }));
  check(pausedTargeting.paused && pausedTargeting.targeting,
    'auto-fire does not act while the pause menu is open', JSON.stringify(pausedTargeting));
  await page.evaluate(() => PauseMenu.close());
  await page.waitForTimeout(1200);
  const resumedTargeting = await page.evaluate(() => ({
    targeting: document.getElementById('screen-encounter').classList.contains('combat-targeting')
  }));
  check(resumedTargeting.targeting, 'resume grants a fresh targeting window', JSON.stringify(resumedTargeting));

  console.log('6. Jettison confirmation is one-shot');
  const jettison = await page.evaluate(async () => {
    returnToHub();
    STATE.items = ['repair_kit', 'repair_kit'];
    openInventory();
    document.querySelector('#inv-grid .inv-tile').click();
    document.getElementById('inv-jett-btn').click();
    document.getElementById('inv-confirm-yes').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.getElementById('inv-confirm-yes').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 50));
    return { items: STATE.items.slice(), confirmationHidden: document.getElementById('inv-confirm').classList.contains('hidden') };
  });
  check(jettison.items.length === 1 && jettison.items[0] === 'repair_kit' && jettison.confirmationHidden,
    'double confirmation removes exactly one cargo unit', JSON.stringify(jettison));

  console.log('7. Safe dismissal versus lethal last-crew jettison');
  const crewGone = await page.evaluate(async () => {
    const setup = () => applySetupToState({ trail: 'mars', ai: 'marv', captain: 'pilot', crew: ['engineer'], crop: 'tomato', ship: 'Crew Probe' });
    setup();
    const safe = STATE.nodes.find(n => n.node_type === 'station' || n.node_type === 'planet');
    STATE.currentId = safe.id;
    openCrewDetail('engineer');
    document.getElementById('cd-dismiss-btn').click();
    const safeLabel = document.getElementById('cd-confirm-title').textContent;
    document.getElementById('cd-confirm-ok').click();
    await new Promise(resolve => setTimeout(resolve, 1200));
    const safeResult = { ended: STATE.ended, crew: STATE.crew.length, allDead: STATE.flags.has('all_crew_dead') };

    setup();
    const unsafe = STATE.nodes.find(n => !['station', 'planet'].includes(n.node_type));
    STATE.currentId = unsafe.id;
    openCrewDetail('engineer');
    document.getElementById('cd-dismiss-btn').click();
    const unsafeLabel = document.getElementById('cd-confirm-title').textContent;
    document.getElementById('cd-confirm-ok').click();
    await new Promise(resolve => setTimeout(resolve, 2200));
    const unsafeResult = {
      ended: STATE.ended,
      crew: STATE.crew.length,
      allDead: STATE.flags.has('all_crew_dead'),
      screen: document.querySelector('.screen.active').id
    };
    return { safeLabel, safeResult, unsafeLabel, unsafeResult };
  });
  check(crewGone.safeLabel === 'DISMISS CREW' && !crewGone.safeResult.ended &&
      crewGone.safeResult.crew === 0 && !crewGone.safeResult.allDead &&
      crewGone.unsafeLabel === 'JETTISON CREW' && crewGone.unsafeResult.ended &&
      crewGone.unsafeResult.crew === 0 && crewGone.unsafeResult.allDead &&
      crewGone.unsafeResult.screen === 'screen-end',
    'safe dismissal permits solo play; last-person airlock death triggers crew_gone', JSON.stringify(crewGone));

  console.log('8. Debug-save guard and full persistence round trip');
  const debugSave = await page.evaluate(() => {
    localStorage.setItem('transplant_save_v1', 'review-sentinel');
    saveRun();
    return localStorage.getItem('transplant_save_v1');
  });
  check(debugSave === 'review-sentinel', 'debug boot never overwrites the real autosave', JSON.stringify(debugSave));

  const persistenceContext = await browser.newContext({ viewport: { width: 1100, height: 780 } });
  const persistencePage = await persistenceContext.newPage();
  const persistenceErrors = [];
  persistencePage.on('pageerror', e => persistenceErrors.push(e.message));
  await persistencePage.goto(BASE_URL.replace(/\?debug=[^#]*/, ''), { waitUntil: 'networkidle' });
  await persistencePage.waitForFunction(() => typeof EVENTS !== 'undefined' && Object.keys(EVENTS).length > 0);
  const persistence = await persistencePage.evaluate(() => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'pilot', crew: ['engineer', 'botanist'], crop: 'tomato', ship: 'Persistence Probe' });
    STATE.orders = { pace: 'plaid', rations: 'pigout', waterSplit: 73 };
    STATE.daysElapsed = 7;
    STATE.resources.fuel = 20;
    STATE.crewHP = { engineer: 42, botanist: 88 };
    STATE.shipLog = [{ day: 7, text: 'Persistence probe.' }];
    STATE.stowaway = { identity: { name: 'Test Passenger' }, revealed: false };
    STATE.cropGrowth = { growth: 37, health: 61, pest: true, waterPlant: 73, tenderId: 'botanist', day: 7, lastTickDay: 7 };
    STATE.postCombatLegs = 2;
    STATE.aiWarnLevels = { fuel: 'low' };
    STATE.fabricator = { wear: 63, broken: true };
    STATE.consumedActions = { 'review:once': true };
    STATE.crewSkillCharges = { engineer: 0, botanist: 1 };
    STATE.flags = new Set(['review_flag']);
    STATE.visited = new Set([STATE.currentId]);
    STATE.seenEventIds = new Set(['event_general_030']);
    saveRun();
    PauseMenu.open();
    document.querySelector('.pause-item[data-section="save"]').click();
    document.querySelector('.pause-slot[data-slot="1"] .pause-btn').click();
    const savedAtHub = localStorage.getItem('transplant:save:1');
    const slotVersion = JSON.parse(savedAtHub).v;
    PauseMenu.close();
    enterEvent(STATE.byId[STATE.currentId], EVENTS.event_general_030);
    const unchangedDuringEncounter = localStorage.getItem('transplant:save:1') === savedAtHub;
    STATE.orders = { pace: 'light', rations: 'half', waterSplit: 1 };
    STATE.crewHP.engineer = 99;
    STATE.flags.clear();
    STATE.seenEventIds.clear();
    PauseMenu.open();
    document.querySelector('.pause-item[data-section="load"]').click();
    document.querySelector('.pause-slot[data-slot="1"] .pause-btn').click();
    const loaded = document.querySelector('.screen.active').id === 'screen-cruise';
    return {
      loaded,
      unchangedDuringEncounter,
      slotVersion,
      screen: document.querySelector('.screen.active').id,
      orders: STATE.orders,
      crewHP: STATE.crewHP,
      shipLog: STATE.shipLog,
      stowaway: STATE.stowaway,
      cropGrowth: STATE.cropGrowth,
      postCombatLegs: STATE.postCombatLegs,
      aiWarnLevels: STATE.aiWarnLevels,
      fabricator: STATE.fabricator,
      consumedActions: STATE.consumedActions,
      crewSkillCharges: STATE.crewSkillCharges,
      flags: [...STATE.flags],
      seenEventIds: [...STATE.seenEventIds]
    };
  });
  await persistenceContext.close();
  const roundTripOk = persistence.loaded && persistence.unchangedDuringEncounter && persistence.slotVersion === 1 &&
    persistence.screen === 'screen-cruise' && persistence.orders.pace === 'plaid' &&
    persistence.orders.rations === 'pigout' && persistence.orders.waterSplit === 73 &&
    persistence.crewHP.engineer === 42 && persistence.shipLog[0].day === 7 &&
    persistence.stowaway.identity.name === 'Test Passenger' && persistence.cropGrowth.health === 61 &&
    persistence.postCombatLegs === 2 && persistence.aiWarnLevels.fuel === 'low' &&
    persistence.fabricator.broken && persistence.consumedActions['review:once'] &&
    persistence.crewSkillCharges.engineer === 0 && persistence.flags.includes('review_flag') &&
    persistence.seenEventIds.includes('event_general_030');
  check(roundTripOk, 'autosave is safe-point-only and restores all evolving subsystems', JSON.stringify(persistence));
  if (persistenceErrors.length) errors.push(...persistenceErrors.map(e => '[persistence page] ' + e));

  await browser.close();
  console.log('\nERRORS:', errors.length ? errors : 'none');
  console.log('FAILURES:', failures.length ? failures : 'none');
  if (errors.length || failures.length) process.exitCode = 1;
})().catch(err => {
  console.error(err.stack || err);
  process.exitCode = 1;
});
