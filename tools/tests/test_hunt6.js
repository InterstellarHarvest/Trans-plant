// Hunt 6 (2026-10-11): broken promises — what the player is shown must be
// what happens. DRYDOCK, Orders, effort tooltip, black market, fabricator
// gate + wear, crop previews, Emergency Patch in combat, loot lines,
// event retiers, end report, pause menu.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function boot(setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForTimeout(200);
  return page;
}
const click = (page, t) => page.evaluate(t => {
  if (typeof finishAllTyping === 'function') finishAllTyping();
  const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => x.textContent.includes(t));
  if (!b) return 'missing';
  if (b.classList.contains('locked')) return 'locked:' + b.textContent;
  b.click(); return 'ok';
}, t);
const choiceText = (page, t) => page.evaluate(t => {
  if (typeof finishAllTyping === 'function') finishAllTyping();
  const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => x.textContent.includes(t));
  return b ? { txt: b.textContent, locked: b.classList.contains('locked'), title: b.getAttribute('title') || ((b.dataset.tipTitle ? b.dataset.tipTitle + '\n\n' : '') + (b.dataset.tipDescription || '')) } /* title= → .ui-tip data (parity-shell) */ : null;
}, t);

(async () => {
  browser = await chromium.launch();

  console.log('— DRYDOCK: label and log tell the truth');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const st = STATE.nodes.find(n => n.node_type === 'station'); STATE.currentId = st.id; renderCruise();
      STATE.resources.hull = 90; STATE.goldAmount = 200;
      document.body.classList.remove('stop-active'); document.getElementById('stop-btn').click();
      await new Promise(r => setTimeout(r, 80));
      const b = [...document.querySelectorAll('#stop-choices .stop-choice')].find(x => /DRYDOCK/.test(x.textContent));
      const label = b ? b.textContent : '';
      const g0 = STATE.goldAmount; b && b.click();
      const log = (STATE.shipLog || []).map(e => JSON.stringify(e)).join('\n');
      return { label, paid: g0 - STATE.goldAmount, hull: STATE.resources.hull, log };
    });
    ok(/\+10 hull/.test(r.label), `button promises what fits (+10 at 90/100): ${r.label.replace(/\s+/g, ' ').slice(0, 80)}`);
    ok(r.hull === 100 && new RegExp('−' + r.paid + 'g').test(r.log), `log charges what was paid (−${r.paid}g)`);
    await page.close();
  }

  console.log('— Orders: PLAID quip and the food delta');
  {
    const page = await boot();
    const r = await page.evaluate(() => ({ mult: ORDERS_PACE && ORDERS_PACE[ORDERS_PACE.length - 1] && ORDERS_PACE[ORDERS_PACE.length - 1].fuelMult }));
    const src = await page.evaluate(async () => (await fetch('engine/js/screens/orders.js')).text());
    ok(r.mult === 3 && /up 200%/.test(src) && !/up 140%/.test(src), 'PLAID ×3.0 quoted as +200%');
    await page.close();
  }

  console.log('— effort tooltip: a day more on authored jobs');
  {
    const page = await boot({ crew: ['chef'] });
    await page.evaluate(() => enterEvent(STATE.byId[STATE.currentId], EVENTS.event_crisis_001));
    await page.waitForTimeout(300);
    const c = await choiceText(page, 'Attempt manual repair');
    ok(c && /a day more/.test(c.title + c.txt) && !/two more days/.test(c.title), `crisis_001 manual repair tooltip says a day more (${c ? c.title.slice(0, 90) : 'missing'})`);
    await page.close();
  }

  console.log('— black market: no second copy of an owned upgrade');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      STATE.items.push('drive_coil');
      const ev = Object.values(EVENTS).find(e => JSON.stringify(e).includes('"market_sinister":true'));
      enterEvent(STATE.byId[STATE.currentId], ev);
      await new Promise(r => setTimeout(r, 300));
      if (typeof finishAllTyping === 'function') finishAllTyping();
      // walk to the SEE THE GOODS choice through the watchers layer
      const pick = t => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => x.textContent.includes(t)); if (b) b.click(); return !!b; };
      pick('APPROACH THE WATCHERS'); await new Promise(r => setTimeout(r, 300));
      pick('SEE THE GOODS'); await new Promise(r => setTimeout(r, 400));
      return document.getElementById('overlay-market') ? document.getElementById('overlay-market').innerText : '';
    });
    ok(r && !/DRIVE COIL/.test(r) && /O2 RECYCLER|FIELD REPAIR/i.test(r), 'black market hides the Drive Coil you carry');
    await page.close();
  }

  console.log('— fabricator: requires_fab lock, fab_wear, fractional engineer wear');
  {
    const page = await boot({ crew: ['chef'] });
    await page.evaluate(() => { STATE.fabricator = { wear: 100, broken: true }; enterEvent(STATE.byId[STATE.currentId], EVENTS.event_crisis_001); });
    await page.waitForTimeout(300);
    const c = await choiceText(page, 'Fabricate a hull patch');
    ok(c && c.locked && /Fabricator is broken/.test(c.txt), 'broken fabricator locks "Fabricate a hull patch"');
    await page.close();
    const p2 = await boot({ crew: ['chef'] });
    await p2.evaluate(() => { STATE.fabricator = { wear: 10, broken: false }; enterEvent(STATE.byId[STATE.currentId], EVENTS.event_crisis_001); });
    await p2.waitForTimeout(300);
    const facts = await p2.evaluate(() => { const ch = EVENTS.event_crisis_001.choices.find(c => /Fabricate a hull patch/.test(c.text)); return outcomeFacts(choiceOutcome(ch)).map(f => f.text); });
    ok(facts.includes('+5% FAB WEAR'), 'outcome facts name the fabricator wear (' + facts.join(', ') + ')');
    await p2.evaluate(() => { Math.random = () => 0.01; });
    await click(p2, 'Fabricate a hull patch'); await p2.waitForTimeout(300);
    ok(await p2.evaluate(() => STATE.fabricator.wear) === 15, 'fab_wear +5 lands (10 → 15)');
    await p2.close();
    const p3 = await boot({ crew: ['engineer', 'pilot'] });
    const w = await p3.evaluate(() => { STATE.fabricator = { wear: 0, broken: false }; openFabricator(); const t = document.querySelector('.wear-add'); const v = t ? t.textContent : ''; closeFabricator(); return v; });
    ok(/\d\.\d%|\+[0-9.]+%/.test(w) && !/^\+[123]%$/.test(w) || w === '+0.8%' || w === '+1.6%' || w === '+2.4%', `Kazuki's −20% shows on the wear chip (${w})`);
    await p3.close();
  }

  console.log('— crop preview includes the botanist bonus');
  {
    const page = await boot({ crew: ['botanist', 'pilot'] });
    await page.evaluate(() => enterEvent(STATE.byId[STATE.currentId], EVENTS.event_planet_001));
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const ch = EVENTS.event_planet_001.choices.find(c => /botanist assess/.test(c.text));
      const facts = outcomeFacts(choiceOutcome(ch)).map(f => f.text);
      STATE.cropGrowth.health = 50; STATE.halfEffect = false; STATE.effortCon = null;
      applyOutcomeEffects(Object.assign({}, ch.outcome, { time_cost: null }));
      return { facts, delta: STATE.cropGrowth.health - 50 };
    });
    ok(r.facts.includes('+8 CROP') && r.delta === 8, `soil assessment previews +8 CROP and lands +${r.delta} (6 × botanist 1.25)`);
    await page.close();
  }

  console.log('— event retiers and promised effects');
  {
    const page = await boot({ crew: ['chef'] });
    const d = await page.evaluate(() => { const d0 = STATE.daysElapsed; enterEvent(STATE.byId[STATE.currentId], EVENTS.event_crisis_009); return d0; });
    await page.waitForTimeout(300);
    await click(page, 'Declare a rest day');
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => STATE.daysElapsed) - d === 1, 'crisis_009 rest day costs 1 day');
    await page.close();
    const p2 = await boot();
    const h0 = await p2.evaluate(() => { STATE.resources.hull = 80; enterEvent(STATE.byId[STATE.currentId], EVENTS.event_general_003); return 80; });
    await p2.waitForTimeout(300);
    await click(p2, 'Emergency FTL'); await p2.waitForTimeout(300);
    ok(await p2.evaluate(() => STATE.resources.hull) === h0 - 5, 'Emergency FTL: the parting shot costs 5 hull');
    await p2.close();
  }

  console.log('— Emergency Patch absorbs one combat hit, not the whole fight');
  {
    const page = await boot({ crew: ['engineer', 'pilot'], ai: 'marv' });
    const r = await page.evaluate(async () => {
      STATE.resources.hull = 60; STATE.flags.add('emergency_patch_armed');
      const ev = Object.values(EVENTS).find(e => JSON.stringify(e).includes('"triggerCombat":true'));
      enterEvent(STATE.byId[STATE.currentId], ev); window.triggerCombat({});
      await new Promise(r => setTimeout(r, 300));
      Math.random = () => 0.6; // enemy hits land, no crits/dodges
      const evade = () => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => /EVASIVE/.test(x.textContent)); if (b) b.click(); return !!b; };
      evade(); await new Promise(r => setTimeout(r, 1500));
      const afterFirst = document.getElementById('combat-num-hull').textContent;
      const armedAfter = STATE.flags.has('emergency_patch_armed');
      evade(); await new Promise(r => setTimeout(r, 1500));
      const afterSecond = document.getElementById('combat-num-hull').textContent;
      return { afterFirst, armedAfter, afterSecond };
    });
    ok(!r.armedAfter && r.afterFirst === '60%' && r.afterSecond !== '60%', `first hit patched, second lands (${r.afterFirst} → ${r.afterSecond})`);
    await page.close();
  }

  console.log('— end report counts what the score counts');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      STATE.soilSurveys = 2;
      triggerArrival(STATE.nodes.find(n => connectionsOf(n).length === 0));
      window.showEndReport();
      return document.getElementById('end-report-score').innerText;
    });
    ok(/MO/.test(r) && /SOIL SURVEYS \+4/.test(r), 'end report shows MO and soil surveys');
    await page.close();
  }

  console.log('— pause menu: live status, TEXT SPEED is real');
  {
    const page = await boot({ crew: ['engineer'] });
    const r = await page.evaluate(async () => {
      STATE.flags.add('crew_lost');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      const txt = document.body.innerText;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { txt };
    });
    ok(/losses logged/.test(r.txt) && !/JOURNAL DRIVE/.test(r.txt) && !/·STUB/.test(r.txt), 'welcome panel reads the run (losses logged)');
    const t = await page.evaluate(async () => {
      const el = document.createElement('div'); document.body.appendChild(el);
      const time = async sp => { tpSaveSettings({ textSpeed: sp }); const t0 = performance.now(); await new Promise(res => typeInto(el, 'x'.repeat(60), 12, res)); return performance.now() - t0; };
      const fast = await time('fast'), slow = await time('slow');
      tpSaveSettings({ textSpeed: 'normal' });
      return { fast, slow };
    });
    ok(t.slow > t.fast * 2.5, `TEXT SPEED changes typing (fast ${Math.round(t.fast)}ms, slow ${Math.round(t.slow)}ms)`);
    await page.close();
  }

  console.log('— owner rulings 2026-10-11');
  {
    // Station events take the CHIP / Merchant discount (0.85 × 0.9 → 12g costs 9g)
    const page = await boot({ ai: 'chip', captain: 'merchant' });
    await page.evaluate(() => { const st = STATE.nodes.find(n => n.node_type === 'station'); STATE.currentId = st.id; STATE.goldAmount = 100; enterEvent(st, EVENTS.event_station_007); });
    await page.waitForTimeout(300);
    await click(page, 'Just buy supplies'); await page.waitForTimeout(300);
    const c = await choiceText(page, 'Buy a medkit');
    await click(page, 'Buy a medkit'); await page.waitForTimeout(300);
    const g = await page.evaluate(() => STATE.goldAmount);
    ok(c && /9 gold/.test(c.txt) && g === 91, `station event medkit priced and charged 9g with CHIP + Merchant (${c && c.txt.replace(/\s+/g, ' ').slice(0, 40)}, gold ${g})`);
    await page.close();
  }
  {
    // Engineer's fabricator repair: factory fresh
    const page = await boot({ crew: ['engineer', 'pilot'] });
    await page.evaluate(() => { STATE.fabricator = { wear: 75, broken: false }; enterEvent(STATE.byId[STATE.currentId], EVENTS.event_crisis_020); });
    await page.waitForTimeout(300);
    await click(page, "Engineer's deep service"); await page.waitForTimeout(300);
    ok(await page.evaluate(() => STATE.fabricator.wear) === 0, "engineer's deep service resets wear to 0");
    await page.close();
  }
  {
    // STAND DOWN: a toll, no loot
    const page = await boot({ crew: ['engineer', 'pilot'] });
    const r = await page.evaluate(async () => {
      STATE.resources.fuel = 80; STATE.goldAmount = 50; STATE.resources.morale = 5;
      const ev = Object.values(EVENTS).find(e => JSON.stringify(e).includes('"triggerCombat":true'));
      enterEvent(STATE.byId[STATE.currentId], ev);
      STATE.npcCtx = Object.assign({}, STATE.npcCtx, { species: 'human' });
      window.triggerCombat({});
      await new Promise(r => setTimeout(r, 400));
      const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => /STAND DOWN/.test(x.textContent));
      const sub = b ? b.textContent : '';
      b && b.click();
      await new Promise(r => setTimeout(r, 600));
      return { sub, fuel: STATE.resources.fuel, gold: STATE.goldAmount, items: STATE.items.slice(), body: document.getElementById('enc-narr-body').textContent };
    });
    ok(/toll/.test(r.sub) && r.fuel === 60 && r.gold === 40 && !/Recovered/.test(r.body), `STAND DOWN pays a toll, no loot (fuel ${r.fuel}, gold ${r.gold})`);
    await page.close();
  }
  {
    // Branch labels are real; fork events describe the branches
    const page = await boot({ trail: 'interstellar' });
    const r = await page.evaluate(async () => {
      const branchNodes = STATE.nodes.filter(n => n.branch);
      const fork = STATE.nodes.find(n => n.node_type === 'fork');
      STATE.currentId = fork.id;
      enterEvent(fork, EVENTS.event_general_001);
      await new Promise(r => setTimeout(r, 300));
      if (typeof finishAllTyping === 'function') finishAllTyping();
      const body = document.getElementById('enc-narr-body').textContent + [...document.querySelectorAll('#enc-choices .enc-choice')].map(b => b.textContent).join(' ');
      const alpha = STATE.byId[fork.connects_to.alpha[0]];
      const combatEv = Object.values(EVENTS).find(e => JSON.stringify(e).includes('"triggerCombat":true'));
      return { n: branchNodes.length, body, label: alpha.branch_hidden ? 'unmarked' : alpha.branch_flavor.replace(/_/g, ' ').toUpperCase(),
        hostileMult: branchEventMult(combatEv, 'hostile'), safeMult: branchEventMult(combatEv, 'safe') };
    });
    ok(r.n > 0 && !/\{branch\./.test(r.body) && r.body.includes(r.label), `fork event names the real branch (${r.label})`);
    ok(r.hostileMult >= 3 && r.safeMult < 1, `HOSTILE branches draw combat ×${r.hostileMult}, SAFE ×${r.safeMult}`);
    // node weighting: over many maps, derelict_heavy branches hold more derelicts than safe ones
    const w = await page.evaluate(() => {
      const share = {}; const cnt = {};
      for (let i = 0; i < 60; i++) {
        applySetupToState({ trail: 'interstellar', ai: 'marv', captain: 'veteran', crew: ['engineer'], crop: 'wheat', ship: 'D' });
        for (const n of STATE.nodes.filter(n => n.branch)) { cnt[n.branch] = (cnt[n.branch] || 0) + 1; share[n.branch] = (share[n.branch] || 0) + (n.node_type === 'derelict' ? 1 : 0); }
      }
      return { dh: share.derelict_heavy / cnt.derelict_heavy, safe: share.safe / cnt.safe };
    });
    ok(w.dh > w.safe * 2, `DERELICT HEAVY branches are derelict-heavy (${Math.round(w.dh * 100)}% vs SAFE ${Math.round(w.safe * 100)}%)`);
    await page.close();
  }
  {
    // A new NPC face per stop
    const page = await boot();
    const r = await page.evaluate(() => {
      const ev = Object.values(EVENTS).find(e => e.npc && !e.npc.species);
      const a = STATE.nodes[1].id, b = STATE.nodes[2].id;
      STATE.currentId = a; const x1 = resolveNpc(ev), x2 = resolveNpc(ev);
      STATE.currentId = b; const y = resolveNpc(ev);
      return { same: x1 === x2, distinct: x1 !== y };
    });
    ok(r.same && r.distinct, 'one NPC per event per stop (kept on revisit, rolled fresh at a new stop)');
    await page.close();
  }

  ok(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(`\nhunt6: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
