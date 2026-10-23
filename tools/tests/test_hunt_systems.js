// Hunt fixes — ship-system screens (2026-10-23 bug hunt, systems area):
//   Orders: PLAID drive heat + strain chance (ruling 83); pace morale as a
//           number with the pilot's offset apart.
//   Growbay: TREAT states its cost from openTreat's roll; "READY NOW", never
//           "READY ON NOW"; AI lines that name their AI carry no chip.
//   Cargo hold: USE shows what lands (cap-aware) and logs it; selling or
//           jettisoning the last capacity upgrade says what goes with it;
//           ruling 32 on the hold's AI lines.
//   Crew dossier: "Needs 25 to stay" visible (ruling 62); a skill's result
//           shows without the AI chip.
//   Fabricator: "Craftable now" uses the CRAFT button's own test.
//   Market: lane traders sell from their own hold (no con-man plating);
//           stations keep the catalogue; barter names are not clipped.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function boot(setup) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && typeof enterEvent === 'function' && window.openFabricator);
    await page.evaluate(o => {
      localStorage.removeItem('transplant_save_v1');
      applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'D' }, o));
      STATE.stowaway = null;
      returnToHub();
    }, setup || {});
    await page.waitForTimeout(300);
    return page;
  }
  const tip = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); const t = e && Tooltip.resolve(e); return t ? (t.description || '') : ''; }, sel);

  console.log('— Orders: drive heat and pace morale');
  {
    const page = await boot({ crew: ['pilot', 'medic'] });
    const r = await page.evaluate(() => {
      const read = () => document.getElementById('od-engines-preview').innerText.replace(/\s+/g, ' ');
      const pill = i => document.querySelector('#od-engines-pills .od-pill[data-idx="' + i + '"]').click();
      const out = {};
      STATE.plaidLegs = 0; openOrders(); out.std0 = read();
      pill(3); out.plaid0 = read();
      out.tip = Tooltip.resolve(document.querySelector('.od-drive-heat')).description;
      closeOrders('cancel'); STATE.plaidLegs = 2; openOrders(); out.std2 = read();
      pill(3); out.plaid2 = read(); pill(0); out.light2 = read();
      closeOrders('cancel'); STATE.plaidLegs = 4; openOrders(); pill(3); out.plaid4 = read(); out.warn4 = document.querySelector('.od-drive-heat').classList.contains('warn');
      closeOrders('cancel'); STATE.engineStrain = true; openOrders(); out.strained = read();
      closeOrders('cancel'); STATE.engineStrain = false; STATE.plaidLegs = 0;
      out.chance = [1, 2, 3].map(engineStrainChance);
      return out;
    });
    ok(!/DRIVE HEAT/.test(r.std0), 'a cold drive at RIDICULOUS shows no heat line (' + r.std0 + ')');
    ok(/DRIVE HEAT · 0 → 1 · STRAIN 5\.5% THIS LEG/.test(r.plaid0) && r.chance[0] === 0.055, 'PLAID from cold: heat 0 → 1, 5.5% strain (' + r.plaid0 + ')');
    ok(/DRIVE HEAT · 2 → 1 · COOLING/.test(r.std2), 'a warm drive at RIDICULOUS cools a step (' + r.std2 + ')');
    ok(/2 → 3 · STRAIN 22% THIS LEG/.test(r.plaid2) && Math.abs(r.chance[2] - 0.22) < 1e-9, 'PLAID at heat 2: 22% this leg (engineStrainChance(3))');
    ok(/2 → 0 · COOLING/.test(r.light2), 'LIGHT SPEED cools it fully (' + r.light2 + ')');
    ok(/4 → 5 · STRAIN 88% THIS LEG/.test(r.plaid4) && r.warn4, 'heat 4 → 88%, flagged as a warning');
    ok(/DRIVE HEAT · STRAINED/.test(r.strained), 'a pending strain reads STRAINED (' + r.strained + ')');
    ok(/5\.5%, 11%, 22%, 44%, 88%/.test(r.tip) && /slower leg cools it a step/.test(r.tip) && /LIGHT SPEED cools it fully/.test(r.tip), 'the heat tooltip states the curve and the cooling');
    ok(/MORALE · ALL −0\.25\/DAY · PILOT \+0\.2\/DAY −0\.25/.test(r.plaid0), 'PLAID morale: everyone −0.25/day, the pilot +0.2/day on top, delta −0.25 (' + r.plaid0 + ')');
    ok(/MORALE · ALL \+0\.1\/DAY · PILOT −0\.3\/DAY/.test(r.light2), 'LIGHT morale: everyone +0.1/day, the pilot −0.3/day');
    ok(/MORALE · STEADY/.test(r.std0) && !/PILOT/.test(r.std0), 'RIDICULOUS: STEADY, no pilot figure');
    await page.close();
  }

  console.log('— Growbay: TREAT cost, READY wording, ruling 32');
  {
    const cases = [
      ['nobody', { crew: ['engineer', 'medic'] }, null, /Takes 1 day \(a botanist would spare it\)/],
      ['botanist', { crew: ['botanist', 'medic'] }, null, /No day spent: Dr\. Osei handles it/],
      ['wounded botanist', { crew: ['botanist', 'medic'] }, 'botanist', /Takes 1 day, or none 50% of the time: Dr\. Osei is wounded/],
      ['botanist captain', { captain: 'botanist', crew: ['engineer', 'medic'] }, null, /Takes 1 day, or none 50% of the time: your botanist training/],
    ];
    for (const [label, setup, wound, re] of cases) {
      const page = await boot(setup);
      const r = await page.evaluate(w => {
        if (w) setHP(w, 30);
        tickCropGrowth(); STATE.cropGrowth.pest = true; STATE.cropGrowth.growth = 30;
        openGrowbay();
        const t = Tooltip.resolve(document.getElementById('treat-btn')).description;
        const out = { tip: t, short: cropTreatCostShort(), ready: document.getElementById('ready-line').textContent.replace(/\s+/g, ' ').trim() };
        // openTreat spends a day exactly when the stated chance fails
        const d0 = STATE.daysElapsed; const R = Math.random; Math.random = () => 0.6; openTreat(); Math.random = R;
        out.days = STATE.daysElapsed - d0;
        closeGrowbay();
        return out;
      }, wound);
      ok(re.test(r.tip), label + ': TREAT tooltip "' + r.tip + '"');
      const expectDays = label === 'botanist' ? 0 : 1; // roll 0.6 ≥ 0.5 / ≥ 0: the day is spent unless the chance is 1
      ok(r.days === expectDays, label + ': a 0.6 roll spends ' + r.days + ' day(s), as the tooltip says');
      ok(/^READY ON DAY \d+$/.test(r.ready), label + ': growing crop reads "' + r.ready + '"');
    }
    const page = await boot({});
    const r = await page.evaluate(() => {
      tickCropGrowth(); STATE.cropGrowth.growth = 100; openGrowbay();
      const out = { ready: document.getElementById('ready-line').textContent.replace(/\s+/g, ' ').trim(), day: document.getElementById('ready-day').textContent };
      closeGrowbay();
      // A line naming its own AI drops the chip (ruling 32)
      STATE.cropGrowth.pest = false; openGrowbay(); openTreat();
      out.nothing = document.getElementById('aria-text').textContent;
      out.chip = getComputedStyle(document.querySelector('.gb-aria-name')).display;
      closeGrowbay();
      return out;
    });
    ok(r.ready === 'READY NOW' && r.day === 'NOW', 'grown crop: "' + r.ready + '" (was READY ON NOW)');
    ok(/MARV|ship computer/i.test(r.nothing) === (r.chip === 'none'), 'growbay footer chip hides exactly when the line names the AI ("' + r.nothing + '", chip ' + r.chip + ')');
    await page.close();
  }

  console.log('— Cargo hold: USE lands what it says; capacity upgrades');
  {
    const page = await boot({});
    const r = await page.evaluate(() => {
      const out = {};
      const pick = id => { _invSelected = id; _invSelectedRes = null; renderInventory(); const b = document.getElementById('inv-use-btn'); return { label: b.textContent, tip: b.dataset.tipDescription || '' }; };
      const lastLog = re => { const l = [...document.querySelectorAll('#ai-log > *')].reverse().find(e => !re || re.test(e.innerText)); return l ? l.innerText : ''; };
      STATE.items.push('fuel_cell', 'crop_treatment', 'hull_patch', 'expanded_fuel_tank', 'hull_plating');
      tickCropGrowth();
      STATE.resources.fuel = 112; STATE.resources.hull = 90; STATE.cropGrowth.health = 95; STATE.cropGrowth.pest = true;
      openInventory();
      out.fuelTank = pick('fuel_cell');                  // 112 / 120: 8 lands
      STATE.items.splice(STATE.items.indexOf('expanded_fuel_tank'), 1); STATE.resources.fuel = 95; renderHUD();
      out.fuel = pick('fuel_cell');                      // 95 / 100: 5 lands
      document.getElementById('inv-use-btn').click();
      out.fuelLog = lastLog(/Fuel cell/); out.fuelNow = STATE.resources.fuel;
      out.crop = pick('crop_treatment');
      document.getElementById('inv-use-btn').click();
      out.cropLog = lastLog(/Crop treatment/); out.cropNow = STATE.cropGrowth.health; out.pest = STATE.cropGrowth.pest;
      out.patch = pick('hull_patch');                    // 90 / 115 (plating): all 15 land
      // Jettison the plating at 112 hull: 12 goes with it
      STATE.resources.hull = 112; _invTab = 'upgrades'; pick('hull_plating');
      document.getElementById('inv-jett-btn').click();
      out.jettText = document.getElementById('inv-confirm-text').textContent;
      document.getElementById('inv-confirm-yes').click();
      out.jettLog = lastLog(/Jettisoned/); out.hullNow = STATE.resources.hull;
      return out;
    });
    ok(r.fuelTank.label === 'USE · +8 FUEL', 'fuel cell at 112/120: "' + r.fuelTank.label + '"');
    ok(r.fuel.label === 'USE · +5 FUEL' && /holds 15; the FUEL gauge has room for 5 \(95 \/ 100\)/.test(r.fuel.tip), 'fuel cell at 95/100: "' + r.fuel.label + '" — ' + r.fuel.tip);
    ok(/\+5 fuel\./.test(r.fuelLog) && r.fuelNow === 100, 'and logs the +5 that landed (' + r.fuelLog + ')');
    ok(r.crop.label === 'USE · +5 CROP · PESTS' && /\+5 crop health \(health caps at 100\), and it clears the pests/.test(r.crop.tip), 'crop treatment at 95 + pests: "' + r.crop.label + '" — ' + r.crop.tip);
    ok(/\+5 crop health; pests cleared\./.test(r.cropLog) && r.cropNow === 100 && !r.pest, 'logs +5 crop health, not +30 (' + r.cropLog + ')');
    ok(r.patch.label === 'USE · +15 HULL', 'hull patch with room: the full +15');
    ok(/The extra 12 hull \(hull 112 → 100\) goes with it\./.test(r.jettText), 'jettison confirm names the lost headroom: ' + r.jettText);
    ok(/The extra 12 hull \(hull 112 → 100\) went with it\./.test(r.jettLog) && r.hullNow === 100, 'and the log says so (' + r.jettLog + ')');

    const s = await page.evaluate(() => {
      const out = {};
      const lastLog = () => { const l = [...document.querySelectorAll('#ai-log > *')].pop(); return l ? l.innerText : ''; };
      closeInventory();
      STATE.items.push('expanded_fuel_tank'); STATE.resources.fuel = 118;
      STATE.byId[STATE.currentId].node_type = 'station';
      openInventory(); _invTab = 'upgrades'; _invSelected = 'expanded_fuel_tank'; renderInventory();
      document.getElementById('inv-sell-btn').click();
      out.open = !document.getElementById('inv-confirm').classList.contains('hidden');
      out.text = document.getElementById('inv-confirm-text').textContent;
      out.warnHidden = document.getElementById('inv-route-warn').classList.contains('hidden');
      out.held = STATE.items.includes('expanded_fuel_tank');
      document.getElementById('inv-confirm-yes').click();
      out.log = lastLog(); out.fuel = STATE.resources.fuel; out.sold = !STATE.items.includes('expanded_fuel_tank');
      // A plain sale (no capacity lost) still sells in one click
      STATE.items.push('medkit'); _invTab = 'gear'; _invSelected = 'medkit'; renderInventory();
      document.getElementById('inv-sell-btn').click();
      out.plain = !STATE.items.includes('medkit') && document.getElementById('inv-confirm').classList.contains('hidden');
      return out;
    });
    ok(s.open && s.held && /The extra 18 fuel \(fuel 118 → 100\) goes with it\./.test(s.text) && s.warnHidden, 'SELL of the fuel tank at 118 asks first: ' + s.text);
    ok(s.sold && s.fuel === 100 && /went with it/.test(s.log), 'the sale logs the 18 fuel lost (' + s.log + ')');
    ok(s.plain, 'a sale that loses nothing needs no confirm');

    const ai = await page.evaluate(() => {
      const out = [];
      for (const key of ['fuel', 'food', 'water']) for (let i = 0; i < 15; i++) {
        _invSelectedRes = key; _invSelected = null; _invAi.key = null; renderInventory();
        const el = document.getElementById('inv-detail-ai');
        const chip = el.querySelector('.detail-ai-name');
        const line = el.textContent.replace(chip ? chip.textContent : '', '');
        out.push({ chip: !!chip, names: namesTheAI(line), line });
      }
      return out;
    });
    const bad = ai.filter(x => x.chip === x.names);
    ok(!bad.length && ai.some(x => x.names), 'hold AI lines: chip only when the line does not name the AI (' + ai.length + ' reads, ' + bad.length + ' wrong' + (bad[0] ? ': ' + bad[0].line : '') + ')');
    await page.close();
  }

  console.log('— Crew dossier: desertion line, skill result');
  {
    const page = await boot({ crew: ['botanist', 'chef'] });
    const r = await page.evaluate(() => {
      const out = {};
      setCrewMorale(0, 'chef'); STATE.moraleWarned = STATE.moraleWarned || {}; STATE.moraleWarned.chef = true;
      renderCruise(); openCrewDetail('chef');
      const row = [...document.querySelectorAll('#cd-status-active .cd-status-row')].find(x => /Deserting/.test(x.textContent));
      const eff = row && row.querySelector('.s-eff');
      out.text = eff ? eff.textContent : '';
      out.clipped = eff ? eff.scrollWidth > eff.clientWidth + 1 || eff.scrollHeight > eff.clientHeight + 1 : true;
      out.visible = eff ? eff.getBoundingClientRect().right <= row.getBoundingClientRect().right + 1 : false;
      hideOverlay('overlay-crew');
      tickCropGrowth(); STATE.cropGrowth.health = 50;
      openCrewDetail('botanist');
      out.quipChip = getComputedStyle(document.getElementById('cd-ai-name')).display;
      document.getElementById('cd-active-btn').click();
      out.result = document.getElementById('cd-ai-text').textContent;
      out.resultChip = getComputedStyle(document.getElementById('cd-ai-name')).display;
      out.resultIcon = getComputedStyle(document.getElementById('cd-ai-icon')).display;
      document.getElementById('cd-nav-next').click();
      out.backChip = getComputedStyle(document.getElementById('cd-ai-name')).display;
      hideOverlay('overlay-crew');
      return out;
    });
    ok(/Needs 25 to stay/.test(r.text) && !r.clipped && r.visible, 'Deserting row shows "' + r.text + '" unclipped');
    ok(/^GREENHOUSE PROTOCOL — Dr\. Osei stabilizes/.test(r.result) && r.resultChip === 'none' && r.resultIcon === 'none', 'skill result shows without the MARV chip or avatar (' + r.resultChip + '/' + r.resultIcon + ')');
    ok(r.quipChip !== 'none' && r.backChip !== 'none', 'an ordinary AI quip keeps its chip');
    await page.close();
  }

  console.log('— Fabricator: Craftable now = canCraft');
  {
    const page = await boot({ crew: ['engineer', 'pilot'] });
    const r = await page.evaluate(() => {
      for (const m of Object.keys(STATE.materials)) STATE.materials[m] = 40;
      const names = () => [...document.querySelectorAll('.fb-recipe-row .fb-recipe-name')].map(e => e.textContent);
      const filter = f => { document.querySelector('#fb-dd-filter .fb-dd-menu button[data-filter="' + f + '"]').click(); };
      openFabricator(); filter('craftable'); const day0 = names(); filter('all'); closeFabricator();
      const base = STATE.baseDays; STATE.baseDays = STATE.daysElapsed;
      openFabricator(); filter('craftable'); const late = names();
      const empty = (document.querySelector('#fb-recipe-scroll') || {}).textContent || '';
      filter('all'); closeFabricator(); STATE.baseDays = base;
      return { day0, late, empty };
    });
    ok(r.day0.length > 0, 'day 0 with materials: ' + r.day0.length + ' recipes craftable now');
    ok(r.late.length > 0, 'ruling 94: past the deadline recipes still list as craftable (a craft is warned, never locked): ' + JSON.stringify(r.late));
    await page.close();
  }

  console.log('— Market: lane traders sell from their own hold');
  {
    const shop = async id => {
      const page = await boot({ crew: ['diplomat', 'medic'] });
      const key = await page.evaluate(id => {
        const ev = EVENTS[id];
        STATE.goldAmount = 500;
        const node = STATE.byId[STATE.currentId];
        if (/station/.test(id)) node.node_type = 'station';
        STATE.flags.add('negotiation_prepared');
        enterEvent(node, ev);
        return Object.keys(ev.layers || {}).find(k => (ev.layers[k].choices || []).some(c => c.open_market && !c.market_vendor));
      }, id);
      await page.waitForTimeout(600);
      const out = await page.evaluate(k => {
        if (k) { STATE.layerStack = [k]; renderEncounterState({ instant: true }); }
        if (typeof finishAllTyping === 'function') try { finishAllTyping(); } catch (e) {}
        const b = [...document.querySelectorAll('#screen-encounter button, #screen-encounter .enc-choice')].find(x => x.offsetParent && /BROWSE THE WARES/i.test(x.innerText));
        if (b) b.click();
        return !!b;
      }, key);
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => ({
        wares: [...document.querySelectorAll('#overlay-market .market-side-buy .market-row .market-row-name')].map(e => e.textContent),
        clipped: [...document.querySelectorAll('#overlay-market .market-row-name')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent),
        negotiation: STATE.flags.has('negotiation_prepared'),
      }));
      r.opened = out;
      await page.close();
      return r;
    };
    const t4 = await shop('event_encounter_trader_004');
    ok(t4.opened && t4.wares.length > 0 && !t4.wares.includes('HULL PLATING'), 'the closing-down sale (trader_004) has no genuine hull plating: ' + t4.wares.join(', '));
    ok(t4.wares.includes('HULL PATCH') && t4.wares.includes('FUEL CELL') && t4.wares.length <= 10, 'a lane trader: consumables and a few items (' + t4.wares.length + ')');
    ok(t4.negotiation, 'a lane trader leaves the diplomat\'s station Negotiation armed');
    for (const id of ['event_encounter_trader_001', 'event_encounter_trader_002', 'event_encounter_trader_003']) {
      const t = await shop(id);
      ok(t.opened && t.wares.length > 0 && t.wares.length <= 14 && !t.wares.includes('EXPANDED FUEL TANK') && !t.wares.includes('SHIELD MODULE'), id + ': its own hold, not the station catalogue (' + t.wares.length + ' wares)');
      if (id === 'event_encounter_trader_002') ok(!t.clipped.length, 'barter rows fit their names (clipped: ' + JSON.stringify(t.clipped) + ')');
    }
    const st = await shop('event_station_013');
    ok(st.opened && st.wares.includes('HULL PLATING') && st.wares.includes('EXPANDED FUEL TANK') && st.wares.length >= 20, 'a station Market Row keeps the full catalogue (' + st.wares.length + ')');
    ok(!st.negotiation, 'a station spends the Negotiation');
    ok(!st.clipped.length, 'station barter rows fit their names (clipped: ' + JSON.stringify(st.clipped) + ')');
  }

  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors.slice(0, 3)));
  console.log(`hunt_systems: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
