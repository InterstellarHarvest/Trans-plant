// Hunt 5 (2026-10-10): wiring and bug fixes from four parallel hunters —
// station purchases charge gold, journey position by legs, crop_pest,
// installs keep upgrades, shield module, star chart USE, spectrometer,
// job outcomes (kit / setback / cap), end screens, launch-first,
// callback pacing, market floor, fabricator misfire curve, pirate
// percentages, live crew names, dossier statuses, zinnia arc, drydock.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const boot = async (o = {}) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => errs.push(e.stack || e.message));
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor);
    await page.evaluate(o => {
      localStorage.removeItem('transplant_save_v1');
      applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'T' }, o));
      STATE.stowaway = null; setCrewMorale(80);
    }, o);
    await page.waitForTimeout(150);
    return page;
  };
  const flatChoice = (page, evId, i) => page.evaluate(([evId, i]) => {
    const ev = EVENTS[evId]; enterEvent(STATE.byId[STATE.currentId], ev);
    return { lock: lockReason(ev.choices[i]) };
  }, [evId, i]);

  console.log('— content wiring');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const ev = EVENTS.event_station_003; STATE.goldAmount = 10;
      const locked = lockReason(ev.choices[0]);
      STATE.goldAmount = 100; const g0 = STATE.goldAmount;
      applyOutcomeEffects(ev.choices[0].outcome);
      return { locked, spent: g0 - STATE.goldAmount, surplusPays: ev.choices[2].outcome.resources.gold, bio: (ev.choices[3].outcome.materials || {}).biocomponent };
    });
    ok(/25g/.test(r.locked || '') && r.spent === 25, `premium resupply: locked without 25g (${r.locked}), charges 25 (${r.spent})`);
    ok(r.surplusPays > 0 && r.bio === 2, 'surplus collector pays; "biocomponents" are granted');
    const m = await page.evaluate(() => { STATE.materials = {}; applyOutcomeEffects(EVENTS.event_asteroid_003.choices[0].outcome); return STATE.materials; });
    ok(m.metal === 3 && m.scrap === 2, `"strip the rig for materials" grants metal+scrap (${JSON.stringify(m)})`);
    const inst = await page.evaluate(() => { STATE.items.push('hull_plating'); applyOutcomeEffects(EVENTS.event_crisis_011.choices[0].outcome); return STATE.items.includes('hull_plating'); });
    ok(inst, 'installing the hull plating keeps the upgrade');
    const w = await page.evaluate(() => {
      const watchers = EVENTS.event_station_009.layers.intro.choices.find(c => /WATCHERS/.test(c.text));
      const job = EVENTS.event_station_009.layers.watchers.choices.find(c => c.outcome === 'cantina_job');
      return { approach: !watchers.hideFlag, job: job.hideFlag === 'courier_job_taken', once8: EVENTS.event_station_008.once, once10: EVENTS.event_station_010.once };
    });
    ok(w.approach && w.job, 'fence stays reachable after the courier job; only the job hides');
    ok(w.once8 === false && w.once10 === false, 'delivery events can recur until delivered');
    await page.close();
  }

  console.log('— journey position by legs, crop_pest');
  {
    const page = await boot({ trail: 'interstellar' });
    const r = await page.evaluate(() => {
      const P = pathLegs();
      STATE.daysElapsed = 10; // calendar barely moved…
      STATE.visited = new Set(STATE.nodes.slice(0, P - 2).map(n => n.id)); // …but two legs left
      const end = activeTriggers().has('journey_end');
      STATE.visited = new Set();
      const start = activeTriggers().has('journey_start');
      STATE.cropGrowth.pest = true; STATE.cropGrowth.health = 80;
      const pest = activeTriggers().has('crop_pest');
      return { end, start, pest, trig: EVENTS.event_crisis_018.trigger.join() };
    });
    ok(r.end && r.start, 'journey_end fires on the final legs whatever the calendar; journey_start at launch');
    ok(r.pest && r.trig === 'crop_pest', 'crop_pest trigger on a real infestation drives the pest event');
    await page.close();
  }

  console.log('— shield module, star chart, spectrometer');
  {
    const page = await boot();
    const shelf = await page.evaluate(() => { STATE.goldAmount = 500; openMarket({}); const t = document.getElementById('market-buy-list').innerText; MarketModal.close(); return /SHIELD MODULE/.test(t); });
    ok(shelf, 'stations shelve the Shield Module');
    await page.evaluate(() => {
      STATE.items.push('shield_module_upgrade'); Math.random = () => 0.5;
      const ev = Object.values(EVENTS).find(e => JSON.stringify(e).includes('"triggerCombat":true'));
      enterEvent(STATE.byId[STATE.currentId], ev); window.triggerCombat({});
    });
    await page.waitForTimeout(450); // after the 200ms choices → actions cross-dissolve
    const btn = await page.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => /BOOST SHIELDS/.test(x.textContent)); return b && !b.classList.contains('locked'); });
    ok(btn, 'BOOST SHIELDS unlocked with the module aboard');
    await page.evaluate(() => [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => /BOOST SHIELDS/.test(x.textContent)).click());
    await page.waitForTimeout(150);
    await page.evaluate(() => [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /EVASIVE/.test(b.textContent)).click());
    await page.waitForTimeout(1500);
    const h = await page.evaluate(() => document.getElementById('combat-num-hull').textContent);
    ok(h === '100%', `the next enemy hit is blocked (${h})`);
    const used = await page.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => /BOOST SHIELDS/.test(x.textContent)); return b && b.classList.contains('locked'); });
    ok(used, 'once per fight');
    await page.close();
    const p2 = await boot();
    const sc = await p2.evaluate(() => {
      STATE.items.push('star_chart_fragment');
      const can = ITEM_USE.star_chart_fragment.can();
      const msg = ITEM_USE.star_chart_fragment.use();
      return { can, msg, scouted: Object.keys(STATE.scouted || {}).length };
    });
    ok(sc.can === null && sc.scouted > 0 && /Star chart/.test(sc.msg), `star chart USE scouts the next stop (${sc.msg.slice(0, 70)})`);
    const sp = await p2.evaluate(() => {
      STATE.items.push('classified_cargo', 'spectrometer');
      renderInvDetail({ id: 'classified_cargo', n: 1 });
      return document.getElementById('inv-detail-desc').textContent;
    });
    ok(/SPECTROMETER/.test(sp), 'spectrometer reads classified cargo in the inventory');
    await p2.close();
  }

  console.log('— hands-on jobs');
  {
    const page = await boot({ crew: ['engineer', 'pilot'] });
    const r = await page.evaluate(() => {
      const find = t => Object.values(EVENTS).flatMap(e => (e.choices || []).map(c => [e, c])).find(([, c]) => c.microgame_type === t && c.outcome && typeof c.outcome === 'object');
      const [ev, ch] = find('drill_target');
      enterEvent(STATE.byId[STATE.currentId], ev);
      STATE.items = ['portable_drill', 'repair_kit'];
      const e1 = choiceEffort(ch);
      // Weld (wrench) with engineer + kit at cap → does the kit change anything?
      const [ev2, ch2] = find('wrench');
      const e2 = choiceEffort(ch2);
      return { cap: e1.chance, kit2: e2.kit, auth: e2.authored };
    });
    ok(r.cap <= 0.90, `clean odds cap at 90% (${r.cap})`);
    const s = await page.evaluate(() => {
      // a +4 hull job that goes wrong: setback −3 lands whole after the halving
      STATE.resources.hull = 50;
      STATE.effortCon = { con: { hull: -3 }, line: 'x', days: 2 };
      applyOutcomeEffects({ resources: { hull: 4 } });
      const h = STATE.resources.hull; STATE.effortCon = null;
      return h;
    });
    ok(s === 50 + Math.floor(Math.round(4 * 1.25) / 2) - 3, `short of effort: halved gain then the whole setback (50 → ${s})`);
    await page.close();
  }

  console.log('— end screens');
  {
    const page = await boot();
    await page.evaluate(() => { STATE.cropGrowth.health = 0; checkFailure(); });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => { window.showEndReport(); window.endBackToCinematic(); return { line: document.getElementById('end-day-line').textContent, save: hasSave(), keep: getComputedStyle(document.getElementById('end-cine-btn2')).display !== 'none' }; });
    ok(!/EARLY/.test(r.line), `failure report doesn't say "days early" (${r.line})`);
    ok(!r.save && !r.keep, 'reading the report accepts the end: save cleared AND Keep flying withdrawn (no stranded run)');
    await page.close();
  }

  console.log('— launch first, callback pacing');
  {
    const page = await boot({ trail: 'interstellar' });
    const r = await page.evaluate(() => {
      const n = STATE.nodes.find(x => x.node_type !== 'station' && x.node_type !== 'fork' && connectionsOf(x).length);
      const picks = new Set();
      for (let i = 0; i < 40; i++) { const ev = selectEvent(n); picks.add(ev && ev.id); }
      STATE.flags.add('departed');
      const after = Object.values(EVENTS).filter(e => /^event_launch_/.test(e.id)).some(e => eventEligible(e, n, activeTriggers()));
      return { picks: [...picks], after };
    });
    ok(r.picks.every(id => /^event_launch_/.test(id)), `before departure the first ordinary stop draws a launch event (${r.picks.join(',')})`);
    ok(!r.after, 'once departed, neither launch event is eligible');
    await page.close();
  }

  console.log('— market floor, misfire curve, pirate percent');
  {
    const page = await boot({ ai: 'chip', captain: 'merchant' });
    const r = await page.evaluate(() => {
      STATE.flags.add('negotiation_prepared'); STATE.goldAmount = 500;
      openMarket({});
      const row = [...document.querySelectorAll('#market-buy-list *')].find(x => /HULL PATCH/.test(x.textContent) && x.children.length < 8 && /\d+\s*g/.test(x.textContent));
      const t = row ? row.textContent : ''; MarketModal.close();
      const buy = parseInt((t.match(/(\d+)\s*g/) || [])[1], 10);
      return { buy, sell: Math.max(1, Math.round(15 * 2 / 3)), t: t.replace(/\s+/g, ' ').slice(0, 60) };
    });
    ok(r.buy > r.sell, `stacked discounts can't undercut the buy-back (buy ${r.buy} > sell ${r.sell})`);
    const f = await page.evaluate(() => { openFabricator(); const at = w => { STATE.fabricator.wear = w; return Math.round(window.fabMisfireChance() * 1000) / 10; }; const v = [at(0), at(20), at(60), at(100)]; closeFabricator(); STATE.fabricator.wear = 0; return v; });
    ok(f[0] === 0 && f[1] === 2 && f[2] === 18 && f[3] === 80, `misfire curve from recipes.json (wear 0/20/60/100 → ${f.join('/')}%)`);
    const p = await page.evaluate(() => { STATE.resources.fuel = 40; applyOutcomeEffects(EVENTS.event_encounter_pirate_001.outcomes.pirate_deal_30); return STATE.resources.fuel; });
    ok(p === 28, `"thirty percent fuel" takes 30% (40 → ${p})`);
    await page.close();
  }

  console.log('— names, statuses, zinnia, drydock');
  {
    const page = await boot({ crew: ['engineer', 'diplomat'], crop: 'zinnia' });
    const r = await page.evaluate(() => {
      STATE.crewIdentity = { diplomat: { id: 'stowaway_inspector', name: 'Wembly', story: '' } };
      return interpolateStowawayTokens(EVENTS.event_general_003.choices[3].text);
    });
    ok(/Wembly/.test(r) && !/Hargrove/.test(r), `{crew.diplomat} names who holds the role (${r})`);
    const z = await page.evaluate(() => { STATE.visited = new Set(); STATE.flags.delete('zinnia_beat_1'); const m = crewMoraleRaw(); renderCruise(); return { d: crewMoraleRaw() - m, f: STATE.flags.has('zinnia_beat_1') }; });
    ok(z.f && z.d >= 2, `zinnia arc: bloom beat fires with a real morale bump (+${z.d})`);
    const st = await page.evaluate(() => {
      STATE.deprived = { food: 3 }; openCrewDetail('engineer');
      const t = document.getElementById('overlay-crew').innerText; return /Malnourished · day 3/i.test(t);
    });
    ok(st, 'dossier shows Malnourished with the real day count');
    const dd = await page.evaluate(() => {
      document.querySelectorAll('.overlay.active').forEach(o => o.classList.remove('active'));
      STATE.goldAmount = 100; STATE.resources.hull = resMax('hull') - 3;
      const node = STATE.nodes.find(n => n.node_type === 'station'); STATE.currentId = node.id; renderCruise();
      document.body.classList.remove('stop-active'); document.getElementById('stop-btn').click();
      const b = [...document.querySelectorAll('#stop-choices .stop-choice')].find(x => /DRYDOCK/.test(x.textContent));
      const g = b.querySelector('.stop-choice-gate').style.backgroundImage;
      b.click();
      return { spent: 100 - STATE.goldAmount, icon: g };
    });
    ok(dd.spent < 30, `drydock pro-rated: topping off 3 hull costs ${dd.spent}g, not 30`);
    ok(/interface\/repair\.png/.test(dd.icon), 'stop verbs carry their demo icons');
    await page.close();
  }

  console.log('— economy (hunt 5 sim findings)');
  {
    const page = await boot({ crew: ['engineer', 'pilot'] });
    const r = await page.evaluate(async () => {
      const verbAt = async (type, name) => {
        const n = STATE.nodes.find(x => x.node_type === type); STATE.currentId = n.id; renderCruise();
        document.body.classList.remove('stop-active'); document.getElementById('stop-btn').click();
        await new Promise(r => setTimeout(r, 80));
        return [...document.querySelectorAll('#stop-choices .stop-choice')].find(x => x.textContent.includes(name));
      };
      const out = {};
      // MINE: one day per run
      window.openMining = cb => cb({ inventory: { metal: 3 }, runs: 3 });
      let d0 = STATE.daysElapsed; (await verbAt('asteroid_field', 'MINE')).click();
      out.mineDays = STATE.daysElapsed - d0;
      // REPAIR not offered at full hull (b4: demo hideWhen); REST locked when morale is high
      STATE.resources.hull = resMax('hull'); STATE.materials = { metal: 9, scrap: 9 }; setCrewMorale(98);
      const rep = await verbAt('station', 'REPAIR'); out.repairHidden = !rep;
      const rest = await verbAt('station', 'REST'); out.restLocked = rest.classList.contains('locked');
      // MEDBAY treats every hurt crew member
      STATE.crewHP.engineer = 50; STATE.crewHP.pilot = 60; STATE.goldAmount = 100;
      (await verbAt('station', 'MEDBAY')).click();
      out.medbay = STATE.crewHP.engineer === 100 && STATE.crewHP.pilot === 100;
      // TRADE: browsing the wares then walking away costs a day
      document.body.classList.remove('stop-active');
      const ev = EVENTS.event_encounter_trader_001; enterEvent(STATE.byId[STATE.currentId], ev);
      const browse = ev.layers[ev.entryLayer].choices.find(c => c.open_market) || Object.values(ev.layers).flatMap(l => l.choices).find(c => c.open_market);
      handleChoiceClick(browse); MarketModal.close();
      await new Promise(r => setTimeout(r, 80));
      d0 = STATE.daysElapsed;
      // The leave row (per-event label since the encounter parity pass: NO THANKS here).
      const walk = document.querySelector('#enc-choices .enc-choice.leave');
      out.walkSub = walk && walk.textContent; walk && walk.click();
      await new Promise(r => setTimeout(r, 400));
      out.tradeDays = STATE.daysElapsed - d0;
      return out;
    });
    ok(r.mineDays === 3, `MINE: three runs cost three days (${r.mineDays})`);
    ok(r.repairHidden && r.restLocked, 'REPAIR is not offered at full hull (demo hideWhen); REST locks when the crew is in good spirits');
    ok(r.medbay, 'MEDBAY treats every hurt crew member for one fee');
    ok(r.tradeDays === 1 && /haggling/.test(r.walkSub || ''), `shopping the trader's wares costs a day (${r.tradeDays})`);
    await page.close();
  }

  console.log('— owner rulings 2026-10-10 (effort tax, land stopped, save at entry, tomato drama)');
  {
    const page = await boot({ crew: ['engineer', 'pilot'], crop: 'tomato' });
    const r = await page.evaluate(async () => {
      const out = {};
      const n = (STATE.nodes.find(x => x.node_type === 'asteroid_field') || Object.assign(STATE.nodes.find(x => x !== STATE.nodes[0] && !['station', 'fork'].includes(x.node_type) && (STATE.byId[STATE.currentId] !== x)), { node_type: 'asteroid_field' })); STATE.currentId = n.id; renderCruise();
      document.body.classList.remove('stop-active'); document.getElementById('stop-btn').click();
      await new Promise(r => setTimeout(r, 80));
      window.openMining = cb => cb({ inventory: { metal: 1 }, runs: 1 });
      setCrewMorale(80);
      const mine = [...document.querySelectorAll('#stop-choices .stop-choice')].find(x => /MINE/.test(x.textContent));
      out.mineLabel = mine.querySelector('.effort').textContent;
      mine.click();
      out.mineTax = 80 - crewMoraleRaw();
      // returning from an event lands stopped: the Stop menu open, Resume travels
      document.body.classList.remove('stop-active');
      enterEvent(STATE.byId[STATE.currentId], EVENTS.event_general_003); returnToHub();
      out.stopped = document.body.classList.contains('stop-active') && document.getElementById('stop-btn').textContent === 'Resume';
      // tomato drama
      const r0 = Math.random; Math.random = () => 0.01;
      const h0 = STATE.cropGrowth.health, m0 = crewMoraleRaw(), l0 = (STATE.shipLog || []).length;
      cropDrama(); Math.random = r0;
      out.drama = (STATE.cropGrowth.health !== h0 || crewMoraleRaw() !== m0) && (STATE.shipLog || []).length > l0;
      return out;
    });
    ok(r.mineTax === 4 && /−4 MO/.test(r.mineLabel), `MINE ●●● costs 4 morale, and says so (${r.mineLabel}, −${r.mineTax})`);
    ok(r.stopped, 'after an event the ship lands stopped: Stop menu open, button reads Resume');
    ok(r.drama, 'tomato drama: a growbay incident with a real swing');
    await page.close();
  }
  {
    // Save at event entry (no ?debug — autosaves are live here)
    const page = await boot();
    const id = await page.evaluate(() => { const ev = EVENTS.event_general_003; enterEvent(STATE.byId[STATE.currentId], ev); return ev.id; });
    await page.reload();
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor);
    await page.evaluate(() => loadRun());
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => STATE.currentEvent && STATE.currentEvent.id);
    ok(back === id, `a reload mid-event comes back into the same event (${back})`);
    await page.evaluate(() => { const ch = STATE.currentEvent.choices.find(c => !c.combat_trigger && !lockReason(c) && c.outcome && !c.microgame_type); handleChoiceClick(ch); });
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor);
    await page.evaluate(() => loadRun());
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => !STATE.currentEvent && document.getElementById('screen-cruise').classList.contains('active')), 'after the outcome lands, a reload resumes at the hub (no second pick)');
    await page.close();
  }

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\nhunt5: ${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
