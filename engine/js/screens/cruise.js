'use strict';
/* ────────────────────────────────────────────────────────────────
   CRUISE SCREEN — migrated from resources/demo-cruise.html. This is
   the intended default hub post-setup (GAME_BIBLE §18) — the node-
   graph map becomes an internal data model plus a read-only overlay
   (see renderMapOverlay() in the main script), not the primary UI.

   Scope note: demo-cruise.html's dev-controls panel, 3-layer warp-
   speed starfield, ticker text carousel, forced-event system, and
   wait-timer machinery are NOT ported in this pass — those need
   real encounter/day-tick wiring that lands in Phase 3+. This is a
   simplified but STATE-bound version: real resources/crew/crop/day
   data, a working Stop Menu shell (verbs render gated, routing is
   Phase 4's job), and the MAP overlay wired to the real generated
   route.
   ──────────────────────────────────────────────────────────────── */
(function () {
  const $ = id => document.getElementById(id);

  // ── Starfield (simple single-layer drift, same pattern as title/setup) ──
  const starCtx = $('starfield').getContext('2d');
  const stars = [];
  for (let i = 0; i < 90; i++) {
    stars.push({ x: Math.random() * 960, y: Math.random() * 640, r: Math.random() * 1.3 + 0.3, phase: Math.random() * Math.PI * 2, drift: Math.random() * 0.5 + 0.2 });
  }
  function drawStars() {
    if (PauseBus.paused) { requestAnimationFrame(drawStars); return; }
    starCtx.clearRect(0, 0, 960, 640);
    const now = performance.now() / 1000;
    for (const s of stars) {
      s.x += s.drift;
      if (s.x > 960) { s.x = 0; s.y = Math.random() * 640; }
      starCtx.globalAlpha = 0.4 + Math.sin(now * 1.2 + s.phase) * 0.25;
      starCtx.fillStyle = '#c8d0d8';
      starCtx.beginPath(); starCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2); starCtx.fill();
    }
    starCtx.globalAlpha = 1;
    requestAnimationFrame(drawStars);
  }
  drawStars();

  wireCustomScroll($('ai-log-host'));
  wireCustomScroll($('stop-choices-host'));

  const AI_SPRITE = { aria: 'sprites/interface/AI/aria.png', marv: 'sprites/interface/AI/marv.png', rex: 'sprites/interface/AI/rex.png', chip: 'sprites/interface/AI/chip.png', ajoy: 'sprites/interface/AI/ajoy.png' };
  const ROLE_TO_CREWID = { botanist: 'osei', engineer: 'kazuki', medic: 'vasquez', pilot: 'reeves', chef: 'reyes', xenobiologist: 'tanaka', diplomat: 'hargrove' };
  const NODE_TYPE_TO_REGION = { station: 'station_approach', planet: 'planet_orbit_habitable', asteroid_field: 'asteroid_field', derelict: 'debris_field', nebula: 'nebula', void: 'deep_space', anomaly: 'anomaly', fork: 'deep_space' };

  function crewDisplayName(role) {
    return crewNameOf(role); // index.html — a joined stowaway keeps their own name
  }

  /* Binds the real STATE object to every part of the cruise screen.
     Called on screen entry and after any STATE mutation that affects
     what's shown here (resources, crew, day count, crop). */
  // Bible §"Ship Sprite System": the scene ship is two layered sprites —
  // shared base (ships/default.png, already the silhouette's CSS bg) +
  // a crop overlay at ships/<crop>/<stage 1-4>.png keyed to growth
  // quartiles. Dead crop (health ≤ 0) reverts to base-only until a
  // replant crosses the first threshold again.
  const CROP_SHIP_FOLDER = { wheat: 'wheat', tomato: 'tomato', sweet_potato: 'potato', soybean: 'soybean', zinnia: 'zinnia' };
  function syncShipSprite() {
    const sil = document.getElementById('ship-silhouette');
    if (!sil) return;
    const base = "url('sprites/ships/default.png')";
    const cg = STATE.cropGrowth;
    const folder = CROP_SHIP_FOLDER[STATE.crop];
    if (!folder || !cg || cg.health <= 0 || !(cg.growth > 0)) {
      sil.style.backgroundImage = base;
      return;
    }
    const stage = Math.min(4, 1 + Math.floor((cg.growth / 100) * 4));
    sil.style.backgroundImage = "url('sprites/ships/" + folder + "/" + stage + ".png'), " + base;
  }

  // Crop card plant sprite (demo-cruise.html canon, dropped in the
  // port — the card showed a wheat emoji for every crop). Frame coords
  // are the demo's verbatim table from sprites/growbay/spritesheet_growbay
  // .json: sheet 666×776, frames 109×192, displayed 76px tall.
  const PLANT_SHEET_W = 666, PLANT_SHEET_H = 776, PLANT_FRAME_H = 192;
  const PLANT_STAGE_SPRITES = {
    wheat:    [{ x: 445, y: 389 }, { x: 556, y: 1   }, { x: 223, y: 389 }, { x: 334, y: 389 }],
    tomato:   [{ x: 1,   y: 389 }, { x: 112, y: 389 }, { x: 334, y: 195 }, { x: 445, y: 195 }],
    potato:   [{ x: 223, y: 1   }, { x: 334, y: 1   }, { x: 1,   y: 1   }, { x: 112, y: 1   }],
    soybeans: [{ x: 112, y: 195 }, { x: 223, y: 195 }, { x: 445, y: 1   }, { x: 1,   y: 195 }],
    zinnia:   [{ x: 1,   y: 583 }, { x: 112, y: 583 }, { x: 556, y: 195 }, { x: 556, y: 389 }],
  };
  const CROP_TO_SHEET_KEY = { sweet_potato: 'potato', soybean: 'soybeans' };
  function paintCropIcon(crop, stageIdx) {
    const el = $('crop-icon');
    const frames = PLANT_STAGE_SPRITES[CROP_TO_SHEET_KEY[crop] || crop];
    if (!el || !frames) return;
    const f = frames[Math.max(0, Math.min(3, stageIdx))];
    const k = 76 / PLANT_FRAME_H;
    el.classList.add('has-plant-sprite');
    el.textContent = '';
    el.style.backgroundImage = "url('sprites/growbay/spritesheet_growbay.png')";
    el.style.backgroundSize = (PLANT_SHEET_W * k).toFixed(2) + 'px ' + (PLANT_SHEET_H * k).toFixed(2) + 'px';
    el.style.backgroundPosition = (-f.x * k).toFixed(2) + 'px ' + (-f.y * k).toFixed(2) + 'px';
  }

  function renderCruise() {
    // Catch crop growth/health up to today before painting the card —
    // decay must tick even if the player never opens the growbay.
    if (typeof window.tickCropGrowth === 'function') window.tickCropGrowth();
    syncShipSprite();
    $('cruise-ship-name').textContent = (STATE.shipName || 'THE SHIP').toUpperCase();
    // Bible §ticker: long-range scan hits replace the default line.
    const nextIds = (typeof nextAvailableNodes === 'function' && STATE.byId[STATE.currentId]) ? [...nextAvailableNodes()] : [];
    const hit = nextIds.map(id => STATE.scouted && STATE.scouted[id]).find(sc => sc && sc.ev && EVENTS[sc.ev]);
    $('header-ticker').textContent = hit ? ('SCAN · NEXT: ' + String(EVENTS[hit.ev].title || 'CONTACT').toUpperCase())
      : STATE.mapName ? ('EN ROUTE TO ' + STATE.destination.toUpperCase()) : '';
    const daysLeft = Math.max(0, STATE.baseDays - STATE.daysElapsed);
    $('day-counter').textContent = 'DAY ' + STATE.daysElapsed + ' · ' + daysLeft + ' LEFT';

    const ai = STATE.activeAI || 'marv';
    const avatar = $('ai-avatar');
    avatar.style.backgroundImage = "url('" + (AI_SPRITE[ai] || AI_SPRITE.marv) + "')";
    $('ai-name').textContent = ai.toUpperCase();

    // Resource bars (fuel/food/water at-a-glance; the full 6-resource
    // HUD lives in the reused .hud component top-right).
    const r = STATE.resources;
    $('res-fill-fuel').style.width  = clampPct(r.fuel * 100 / resMax('fuel'))  + '%';
    $('res-fill-food').style.width  = clampPct(r.food * 100 / resMax('food'))  + '%';
    $('res-fill-water').style.width = clampPct(r.water) + '%';

    // Standing-orders readout — live from STATE.orders (Restoration
    // item 5). Clicking any cell opens the Orders modal (wired once
    // below); the cells just mirror the committed settings here.
    if (typeof window.ordersPace === 'function') {
      const o = ensureOrders();
      $('readout-engines').textContent = ordersPace().name;
      $('readout-rations').textContent = ordersRations().name;
      $('readout-water-plant').textContent = o.waterSplit + '%';
      $('readout-water-crew').textContent  = (100 - o.waterSplit) + '%';
    }

    // Crew strip: captain + STATE.crew, each a role string resolved
    // against crew_roster.json for display name/portrait.
    const strip = $('crew-strip');
    strip.innerHTML = '';
    const members = [];
    if (STATE.captain) members.push({ role: STATE.captain, label: 'CAPTAIN', crewId: ROLE_TO_CREWID[STATE.captain] });
    for (const role of STATE.crew) members.push({ role, label: crewDisplayName(role).toUpperCase(), crewId: crewSpriteIdOf(role) });
    for (const m of members) {
      const crewId = m.crewId;
      const slot = document.createElement('div');
      slot.className = 'crew-slot';
      const iconHtml = crewId
        ? '<div class="crew-icon has-sprite" style="' + crewIconCss(crewId, 'var(--card-icon-size)') + '"></div>'
        : '<div class="crew-icon">\u{1F464}</div>';
      // Real per-crew HP (index.html's crewHP system); the captain is
      // the player and doesn't take HP damage — always full.
      const hp = m.label === 'CAPTAIN' ? 100
        : (typeof window.crewHPOf === 'function' ? crewHPOf(m.role) : 100);
      const hpColor = hp <= CREW_CRITICAL_HP ? '#cc5555' : (hp < CREW_WOUNDED_HP ? '#d4a830' : '');
      slot.innerHTML =
        '<div class="crew-slot-top">' + iconHtml +
          '<div class="crew-info"><div class="crew-name">' + m.label + '</div><div class="crew-role">' + m.role + '</div></div>' +
        '</div>' +
        '<div class="crew-bars">' +
          '<div class="crew-bar hp" title="Health ' + hp + '/100"><span class="crew-bar-label">HP</span><div class="crew-bar-track"><div class="crew-bar-fill" style="width:' + clampPct(hp) + '%' + (hpColor ? ';background:' + hpColor : '') + '"></div></div></div>' +
          '<div class="crew-bar mo" title="Morale"><span class="crew-bar-label">MO</span><div class="crew-bar-track"><div class="crew-bar-fill" style="width:' + clampPct(STATE.resources.morale) + '%"></div></div></div>' +
        '</div>';
      // Crew dossier (Restoration item 4) — click opens the detail
      // modal; the captain slot opens their reduced dossier.
      const dossierKey = m.label === 'CAPTAIN' ? 'captain' : m.role;
      slot.addEventListener('click', () => {
        if (typeof window.openCrewDetail === 'function') openCrewDetail(dossierKey);
      });
      strip.appendChild(slot);
    }

    // Crop card — real growth/health from STATE.cropGrowth (persisted
    // by growbay.js's bindGrowbayState(); undefined until the player's
    // first growbay visit, hence the fallbacks below).
    if (STATE.crop) {
      const cg = STATE.cropGrowth;
      const growth = cg ? cg.growth : 0;
      const STAGE_NAMES = ['SPROUTING', 'VEGETATIVE', 'FLOWERING', 'MATURING'];
      const stageIdx = growth <= 25 ? 0 : growth <= 50 ? 1 : growth <= 75 ? 2 : 3;
      $('crop-name').textContent = STATE.crop.replace(/_/g, ' ').toUpperCase();
      paintCropIcon(STATE.crop, stageIdx);
      $('crop-stage').textContent = STAGE_NAMES[stageIdx];
      $('crop-day').textContent = 'DAY ' + (cg ? cg.day : 0);
      $('crop-growth-fill').style.width = clampPct(growth) + '%';
      $('crop-health-fill').style.width = clampPct(cg ? cg.health : 100) + '%';
    }

    // AI universal pools — ambient/warning/crop lines into the log.
    // All three are idempotent per condition (guards inside), so the
    // many renderCruise() call sites stay safe. Defined further down
    // (function declarations hoist).
    maybePushAmbient();
    checkResourceWarnings();
    checkCropMilestones();
    // Every hub repaint is a safe between-actions point — autosave, last,
    // so the lines/flags just pushed above are in it (they used to replay
    // with fresh text after a reload).
    if (typeof saveRun === 'function') saveRun();
  }
  function clampPct(v) { return Math.max(0, Math.min(100, v | 0)); }

  /* Accepts a plain string OR {text, link: {url, label}} per the
     Bible's reserved log-entry schema (§18 "Expandable entries &
     external links"). Link entries get the 🔗 convention and open in
     a new tab — the educational tie-in channel (NASA/ISS/real crop
     science). `expand` (📖 modal) remains reserved/unwired. */
  function pushLogEntry(entryOrText) {
    const log = $('ai-log');
    document.querySelectorAll('#ai-log .ai-entry.latest').forEach(e => e.classList.remove('latest'));
    const entry = document.createElement('div');
    entry.className = 'ai-entry latest';
    const isObj = entryOrText && typeof entryOrText === 'object';
    const text = isObj ? entryOrText.text : entryOrText;
    // Persist to the run's Ship's Log (browsable journal — pause menu →
    // SHIP'S LOG). Day-stamped; carries link/expand payloads through.
    STATE.shipLog = STATE.shipLog || [];
    STATE.shipLog.push({
      day: STATE.daysElapsed,
      text: text,
      link: (isObj && entryOrText.link) || null,
      expand: (isObj && entryOrText.expand) || null,
      // Journal chrome (demo-shipslog canon): 'death' entries get the
      // memorial treatment; 'sci' marks science-link payloads' LED.
      type: (isObj && entryOrText.type) || (isObj && entryOrText.link ? 'sci' : null),
      crewId: (isObj && entryOrText.crewId) || null,
      crewName: (isObj && entryOrText.crewName) || null,
    });
    // Demo-cruise canon: entries typewrite in. Links/expand chrome
    // append once the text lands. Cap speed so long entries don't gate.
    entry.textContent = '';
    (function typeLog(i) {
      if (!entry.isConnected && i > 0) return;           // log re-rendered
      if (window.PauseBus && PauseBus.paused) return setTimeout(() => typeLog(i), 120);
      const step = text.length > 160 ? 3 : 2;
      entry.textContent = text.slice(0, i + step);
      if (i + step < text.length) { setTimeout(() => typeLog(i + step), 16); }
      log.scrollTop = log.scrollHeight;
    })(0);
    if (isObj && entryOrText.link && entryOrText.link.url) {
      entry.classList.add('has-link');
      const a = document.createElement('a');
      a.className = 'ai-entry-link';
      a.href = entryOrText.link.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = '🔗 ' + (entryOrText.link.label || 'Learn more');
      entry.appendChild(document.createTextNode(' '));
      entry.appendChild(a);
    }
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  }

  // ── Header buttons ───────────────────────────────────────────
  $('btn-map').addEventListener('click', () => {
    showOverlay('overlay-map'); // must show before rendering — nodePositions() reads clientWidth/Height
    renderMapOverlay();
  });
  $('ovmap-close').addEventListener('click', () => hideOverlay('overlay-map'));
  $('btn-inv').addEventListener('click', () => openInventory());
  $('crop-card-mini').addEventListener('click', () => { if (STATE.crop) openGrowbay(); });
  // Any readout cell opens the Orders modal (demo-orders.html's
  // cg-readout behavior — the whole strip is one click target).
  $('cruise-readout').addEventListener('click', () => {
    if (typeof window.openOrders === 'function') openOrders();
  });

  // ── Stop Menu shell ──────────────────────────────────────────
  const REGIONS = {
    deep_space:             { label: 'DEEP SPACE',             mood: 'Stars and silence. Nothing here but thinking.',                       verbs: ['scan', 'repair', 'rest', 'wait_for_trader', 'fab'] },
    asteroid_field:         { label: 'ASTEROID FIELD',         mood: 'Cold rocks. The kind of place that pays in chips, not stories.',      verbs: ['mine', 'forage_food', 'trade', 'repair', 'rest', 'fab'] },
    debris_field:           { label: 'DEBRIS FIELD',           mood: 'Someone else’s bad day, scattered for kilometers.',              verbs: ['salvage', 'mine', 'forage_food', 'trade', 'repair', 'rest', 'fab'] },
    nebula:                 { label: 'NEBULA',                 mood: 'Glowing gas in colors that probably mean something.',                 verbs: ['mine', 'condense', 'scan', 'trade', 'repair', 'rest', 'fab'] },
    anomaly:                { label: 'ANOMALY',                mood: 'The instruments disagree with each other. None of them with reality.', verbs: ['scan', 'forage_food', 'repair', 'rest', 'fab'] },
    planet_orbit_habitable: { label: 'PLANET ORBIT · HABITABLE', mood: 'Green and blue and trying. A world that knows how to grow things.', verbs: ['forage_food', 'trade', 'scan', 'repair', 'rest', 'fab'] },
    station_approach:       { label: 'STATION APPROACH',       mood: 'Lights and traffic. Civilization, give or take.',                     verbs: ['trade', 'medbay', 'drydock', 'fab_service', 'repair', 'rest', 'fab'] },
  };
  const FORAGE_LABEL_BY_REGION = { planet_orbit_habitable: 'GATHER', asteroid_field: 'HUNT', debris_field: 'SCAVENGE', anomaly: 'FORAGE' };
  const STOP_VERBS = {
    // icon: demo-cruise.html STOP_VERBS iconUrl (demo canon), sprites/interface/.
    mine:         { label: 'MINE',      sub: 'Pull raw materials from the rocks.',              effort: 3, icon: 'mining' },
    salvage:      { label: 'SALVAGE',   sub: 'Pick through the wreckage. Mind the sharp bits.',  effort: 3, icon: 'salvage' },
    forage_food:  { label: (region) => FORAGE_LABEL_BY_REGION[region] || 'FORAGE', sub: 'Find something edible. Or interesting. Sometimes both.', effort: 2, icon: 'forage' },
    trade:        { label: 'TRADE',     sub: 'Haggle. Or pretend to.',                           effort: 1, icon: 'trade' },
    wait_for_trader: { label: 'WAIT FOR TRADER', sub: 'Park. Roll the dice. Days will pass.',    effort: 1, hint: true, icon: 'wait' },
    scan:         { label: 'SCAN',      sub: 'Read the signals. Find what is coming.',           effort: 2, hint: true, icon: 'scan' },
    repair:       { label: 'REPAIR',    sub: 'Patch the hull: 2 metal + 1 scrap and a day.', effort: 3, locked: repairLockReason, icon: 'repair' },
    rest:         { label: 'REST',      sub: 'Crew morale up. Days down.',                       effort: 1, hint: true, icon: 'rest' },
    fab:          { label: 'FABRICATOR', sub: 'Open the print queue. Long jobs need a still ship.', effort: 1, hint: true, icon: 'fab' },
    medbay:       { label: 'MEDBAY',    sub: () => 'Treat the worst-hurt crew member. ' + medbayFee() + 'g, no days.', effort: 1, hint: true, locked: medbayLockReason, icon: 'medic' },
    condense:     { label: 'CONDENSE',  sub: 'Wring water out of the nebula. A day for +12 water.', effort: 2, locked: condenseLockReason, icon: 'water' },
    drydock:      { label: 'DRYDOCK',   sub: () => 'Station crews patch the hull. +30 hull for ' + drydockFee() + 'g.', effort: 1, hint: true, locked: drydockLockReason, icon: 'repair' },
    fab_service:  { label: 'FAB SERVICE', sub: () => 'Station techs overhaul the fabricator. Wear to zero, ' + fabServiceFee() + 'g.', effort: 1, hint: true, locked: fabServiceLockReason, icon: 'fab' },
  };
  function effortPips(n) { n = Math.max(0, Math.min(5, n | 0)); return '●'.repeat(n) + '○'.repeat(5 - n); }

  // ── Stop Menu verb → minigame wiring (Phase 4) ────────────────
  // Applies a minigame's tier-based effects to real STATE, checks for
  // failure (a minigame's time cost can push daysElapsed past baseDays
  // same as any other action), then logs + re-renders. Mirrors the
  // apply → renderHUD → checkFailure → log/render order resolveChoice()
  // uses for events, so minigame outcomes and event outcomes behave the
  // same way around the failure check.
  function settleMinigame(logLine) {
    passDays(1); // trivial time cost, same tier index.html's applyOutcomeEffects uses — routed through the orders daily-drain helper
    renderHUD();
    if (checkFailure()) return;
    pushLogEntry(logLine);
    renderCruise();
    // The Stop menu stays open across verbs — re-gate it (a REPAIR that
    // spent the last metal must lock, MEDBAY with no one hurt…).
    if (document.body.classList.contains('stop-active') && typeof renderStopMenu === 'function') renderStopMenu();
  }

  // Quitting a minigame mid-game (tier 'abandoned', owner ruling
  // 2026-10-09): nothing gained, even what was already in hand — the
  // day is still spent.
  function settleAbandoned(verb) {
    settleMinigame('◆ ' + verb + ' — abandoned partway. Nothing kept; the day is gone anyway.');
  }

  const TRAIL_TO_SCAN_DIFFICULTY = { lunar: 'easy', mars: 'medium', interstellar: 'hard' };
  const REGION_TO_FORAGE_MODE = { asteroid_field: 'HUNT', debris_field: 'SCAVENGE', planet_orbit_habitable: 'GATHER', anomaly: 'GATHER' };

  function handleScanVerb() {
    const difficulty = TRAIL_TO_SCAN_DIFFICULTY[STATE.trail] || 'medium';
    openMinigame('scan', { difficulty }, (tier) => {
      if (tier === 'abandoned') return settleAbandoned('SCAN');
      // Owner ruling 2026-10-10 — SCAN does something: it locks in and
      // reports what waits ahead (index.html scoutAhead). Perfect: two
      // stops deep, with full outcome intel on arrival. Good: the next
      // stop(s), every fork branch. Poor: static.
      if (tier === 'poor') return settleMinigame('◆ SCAN — Signal lost in the static. Nothing useful recovered.');
      const perfect = tier === 'perfect';
      const report = scoutAhead(perfect ? 2 : 1, perfect);
      const head = perfect ? 'Clean lock. Long-range picture, outcomes modelled.' : 'Partial read — the next stop, at least.';
      settleMinigame('◆ SCAN — ' + head + (report.length ? ' ' + report.join(' · ') : ' Nothing ahead but the destination.'));
    });
  }

  // REPAIR — the full engine-room fault-isolation scene (Restoration
  // item 1; engine/js/minigames/engine_repair.js, ported from
  // demo-engine-repair.html). Replaces the old openMinigame('engine')
  // Simon-says here — that game stays in minigames.js for
  // launch_minigame events. Outcome contract preserved from the old
  // tier handler: allFixed (4/4 faults) → the 'perfect' effect (+20
  // hull). Abandoning partway (1–3 faults fixed) is a QUIT — nothing
  // kept, the day spent (owner ruling 2026-10-09); walking out before
  // touching anything is a free cancel (mirrors MINE's pre-run LEAVE).
  // REPAIR costs materials (owner ruling 2026-10-10): 2 metal + 1 scrap,
  // spent only when the patch is done (a quit keeps them, costs the day).
  const REPAIR_COST = { metal: 2, scrap: 1 };
  function repairLockReason() {
    const m = STATE.materials || {};
    if ((m.metal || 0) < REPAIR_COST.metal || (m.scrap || 0) < REPAIR_COST.scrap) return 'Need 2 metal + 1 scrap';
    return null;
  }
  function handleRepairVerb() {
    if (repairLockReason()) return;
    openEngineRepair((result) => {
      result = result || {};
      const n = result.fixedCount | 0;
      if (n === 0) { renderCruise(); return; }
      if (!result.allFixed) return settleAbandoned('REPAIR');
      for (const [mat, q] of Object.entries(REPAIR_COST)) STATE.materials[mat] = Math.max(0, (STATE.materials[mat] || 0) - q);
      // Engineer aboard: the patch goes further (+10, captain half).
      const before = STATE.resources.hull;
      STATE.resources.hull = clamp(STATE.resources.hull + 20 + Math.round(10 * specialistMult('engineer')), 0, resMax('hull'));
      const gain = Math.round(STATE.resources.hull - before); // the log reports what actually landed
      settleMinigame('◆ REPAIR — ' + (result.allFixed ? 'all four systems nominal' : n + '/4 faults cleared') + ', hull patched (+' + gain + ').');
    });
  }

  function handleForageVerb() {
    const regionKey = currentRegionKey();
    const mode = REGION_TO_FORAGE_MODE[regionKey] || 'GATHER';
    openMinigame('forage', { mode, return_to: 'cruise', origin_node: STATE.currentId }, (tier, payload) => {
      if (tier === 'abandoned') return settleAbandoned(mode);
      payload = payload || {};
      if (typeof payload.food === 'number' && payload.food > 0) {
        STATE.resources.food = clamp(STATE.resources.food + payload.food, 0, resMax('food'));
      }
      // Forage's rare finds are demo ids with no items.json entry — granting
      // them raw put phantom, unsellable cargo in the hold. Map each to a
      // real reward (demo ware ids never enter STATE).
      const RARE_TO_REAL = { cred_chip: { gold: 10 }, data_fragment: { item: 'logbook_fragment' }, salt_crystal: { material: 'minerals', qty: 2 }, med_herb: { item: 'medkit' } };
      if (payload.rare_drops) payload.rare_drops.forEach(d => {
        const r = RARE_TO_REAL[d.id] || {};
        if (r.gold) STATE.goldAmount += r.gold;
        if (r.material) STATE.materials[r.material] = (STATE.materials[r.material] || 0) + (r.qty || 1);
        if (r.item) grantItem(r.item); // capacity-enforced
      });
      if (payload.sickness) payload.sickness.forEach(s => {
        const sev = { light: 3, medium: 7, heavy: 15 }[s.severity] || 3;
        // Poisoning hurts one crew member (the demo's "SICKNESS · -HP one
        // crew" and the briefing's "poisons a crew member"); solo, the
        // spoiled haul costs food instead.
        if (s.type === 'poisoning') { if (STATE.crew.length) damageCrew(null, sev); else STATE.resources.food = clamp(STATE.resources.food - sev, 0, resMax('food')); }
        else STATE.resources.morale = clamp(STATE.resources.morale - sev, 0, 100);
      });
      let gained = payload.food ? ('+' + payload.food + ' food.') : 'came back empty-handed.';
      // A good forage on alien ground can turn up the suspicious fungus
      // (the chef's Secret Project — event_shipboard_016).
      if (tier !== 'poor' && (regionKey === 'anomaly' || regionKey === 'planet_orbit_habitable') &&
          !STATE.items.includes('suspicious_fungus') && Math.random() < 0.15 && grantItem('suspicious_fungus')) {
        gained += ' Also: a fungus nobody can name. The chef has asked to keep it.';
      }
      settleMinigame('◆ ' + mode + ' — ' + gained);
    });
  }

  function handleSalvageVerb() {
    openMinigame('salvage', {}, (tier, payload) => {
      if (tier === 'abandoned') return settleAbandoned('SALVAGE');
      // Grant exactly the haul card's contents: materials stock, upgrade
      // items (capacity-enforced), O₂ tanks as air, gold chips as gold;
      // 'useless_scrap' is what it says. No payload → the old tier table.
      const haul = (payload && payload.salvage) || { perfect: { metal: 3, scrap: 2 }, good: { metal: 2 }, poor: { scrap: 1 } }[tier] || {};
      const MATS = new Set(((MOD.materials && MOD.materials.materials) || []).map(m => m.id));
      const TANK_O2 = { tank_s: 4, tank_m: 8, tank_l: 12 };
      const got = [];
      for (const [key, qty] of Object.entries(haul)) {
        if (!qty) continue;
        if (MATS.has(key)) { STATE.materials[key] = (STATE.materials[key] || 0) + qty; got.push(qty + ' ' + key); }
        else if (key in TANK_O2) { STATE.resources.o2 = clamp(STATE.resources.o2 + TANK_O2[key] * qty, 0, 100); got.push('+' + TANK_O2[key] * qty + ' O₂'); }
        else if (key === 'gold') { STATE.goldAmount += 5 * qty; got.push(5 * qty + 'g'); }
        else if (key !== 'useless_scrap') { for (let i = 0; i < qty; i++) grantItem(key); got.push(key.replace(/_/g, ' ')); }
      }
      // Wrecks hold curiosities the fence pays for (items.json "pure trade
      // good" — they had no source).
      if (tier !== 'poor' && Math.random() < 0.2) {
        const cur = ['pre_collapse_artifact', 'corporate_memorabilia', 'unidentified_bone'][Math.floor(Math.random() * 3)];
        if (grantItem(cur)) got.push(cur.replace(/_/g, ' '));
      }
      renderHUD();
      settleMinigame('◆ SALVAGE — recovered ' + (got.join(', ') || 'nothing usable') + '.');
    });
  }

  function handleMineVerb() {
    openMining((haul) => {
      haul = haul || {};
      const inv = haul.inventory || {};
      const granted = [];
      for (const [mat, qty] of Object.entries(inv)) {
        if (!qty) continue;
        STATE.materials[mat] = (STATE.materials[mat] || 0) + qty;
        granted.push(qty + ' ' + mat);
      }
      if (!granted.length) { renderCruise(); return; } // LEAVE with no run made — no time cost either
      // Bible multi-path rule: asteroid ice melts into water, a nebula
      // run scoops fuel — scaled by how much was mined (cap 15).
      const mined = Object.values(inv).reduce((a, b) => a + (b || 0), 0);
      const side = Math.min(15, Math.round(mined / 2));
      const region = currentRegionKey();
      // The log reports what actually went in (tanks cap).
      const gain = (k, max) => { const b = STATE.resources[k]; STATE.resources[k] = clamp(b + side, 0, max); return Math.round(STATE.resources[k] - b); };
      if (side > 0 && region === 'asteroid_field') {
        const got = gain('water', 100);
        granted.push(got > 0 ? 'ice melted for +' + got + ' water' : 'ice, but the water tanks are full');
      } else if (side > 0 && region === 'nebula') {
        const got = gain('fuel', resMax('fuel'));
        granted.push(got > 0 ? '+' + got + ' fuel scooped from the gas' : 'gas, but the fuel tank is full');
      }
      settleMinigame('◆ MINE — recovered ' + granted.join(', ') + '.');
    });
  }

  // REST — a day of doing deliberately nothing. Chef aboard makes it
  // land better (their whole thing is morale through care).
  function handleRestVerb() {
    const chefBonus = Math.round(2 * passiveMult('chef')); // wounded chef: halved
    STATE.resources.morale = clamp(STATE.resources.morale + 6 + chefBonus, 0, 100);
    settleMinigame('◆ REST — a full day off. Morale +' + (6 + chefBonus) + (chefBonus ? ' (the chef cooked the good stuff).' : '.'));
  }

  // TRADE — summons the trader scenario at this node (reuses the full
  // layered encounter rather than a bare market screen; the trader IS
  // the market). WAIT FOR TRADER — park for days and roll the dice.
  function handleTradeVerb() {
    const ev = EVENTS['event_encounter_trader_001'];
    if (!ev) { pushLogEntry('◆ No traders registered on this route.'); return; }
    closeStopMenu();
    enterEvent(STATE.byId[STATE.currentId], ev);
  }
  function handleWaitTraderVerb() {
    const days = 1 + Math.floor(Math.random() * 2); // 1-2 days parked
    passDays(days);
    renderHUD();
    if (checkFailure()) return;
    if (Math.random() < 0.55) {
      pushLogEntry('◆ WAIT — after ' + days + ' day(s), a merchant sail lights up the scope.');
      const ev = EVENTS['event_encounter_trader_001'];
      if (ev) { closeStopMenu(); enterEvent(STATE.byId[STATE.currentId], ev); return; }
    }
    pushLogEntry('◆ WAIT — ' + days + ' day(s) parked. Nobody came. The dice do not apologize.');
    renderCruise();
  }

  // FABRICATOR stays a Stop Menu verb rather than moving to a separate
  // bottom-row ship-system button (Bible §18's original design) — Cruise
  // only exists while the ship is stopped between legs in this engine
  // (there's no continuous "moving" state to gate against), so the extra
  // UI real estate a bottom-row button would need doesn't buy anything
  // here. Matches what Phase 2 already scaffolded (fab was already in
  // every region's STOP_VERBS list before Phase 4 wired it up).
  function handleFabricatorVerb() { openFabricator(); }

  // MEDBAY (stations only) — the Bible §7 recovery path besides the
  // medic's skill: for a flat fee, the worst-hurt crew member is
  // treated to full HP, which also closes a delayed-severity wound
  // before it comes due. No time cost — the Bible prices it in credits.
  const MEDBAY_BASE = 30;
  const medbayFee = () => stationPrice(MEDBAY_BASE); // CHIP / merchant discounts
  function medbayPatient() {
    let worst = null;
    for (const r of STATE.crew) if (crewHPOf(r) < 100 && (!worst || crewHPOf(r) < crewHPOf(worst))) worst = r;
    return worst;
  }
  function medbayLockReason() {
    if (!medbayPatient()) return 'Nobody is hurt';
    if (STATE.goldAmount < medbayFee()) return 'Costs ' + medbayFee() + 'g';
    return null;
  }
  function handleMedbayVerb() {
    const r = medbayPatient();
    if (!r) { pushLogEntry('◆ MEDBAY — the duty nurse looks your crew over and finds nothing to bill. They seem disappointed.'); return; }
    if (STATE.goldAmount < medbayFee()) { pushLogEntry('◆ MEDBAY — treatment is ' + medbayFee() + 'g, payable in advance. You have ' + STATE.goldAmount + 'g. The nurse has heard every story.'); return; }
    STATE.goldAmount -= medbayFee();
    STATE.crewHP[r] = 100;
    if (STATE.crewPending) delete STATE.crewPending[r];
    pushLogEntry('◆ MEDBAY — ' + crewNameOf(r) + ' is treated, stitched and discharged with a lollipop. −' + medbayFee() + 'g.');
    renderHUD();
    renderCruise();
    renderStopMenu(); // the verb re-gates (nobody hurt / can't afford)
  }

  // FAB SERVICE (stations only) — the station overhaul the fabricator's
  // own wear warning promises ("repair needed at next station"): wear
  // back to 0, a broken fab working again. Flat fee, no time cost.
  const FAB_SERVICE_BASE = 40;
  const fabServiceFee = () => stationPrice(FAB_SERVICE_BASE);
  function fabServiceLockReason() {
    const f = STATE.fabricator || {};
    if (!f.broken && (f.wear || 0) < 10) return 'Fabricator is good as new';
    if (STATE.goldAmount < fabServiceFee()) return 'Costs ' + fabServiceFee() + 'g';
    return null;
  }
  function handleFabServiceVerb() {
    if (fabServiceLockReason()) return;
    STATE.goldAmount -= fabServiceFee();
    STATE.fabricator.wear = 0;
    STATE.fabricator.broken = false;
    pushLogEntry('◆ FAB SERVICE — station techs strip the fabricator, swear at it professionally, and hand it back at zero wear. −' + fabServiceFee() + 'g.');
    renderHUD();
    renderCruise();
    renderStopMenu();
  }

  // CONDENSE (nebulae, Atmospheric Condenser upgrade — Bible multi-path
  // rule's canonical upgrade-gated verb): a day of work, +12 water.
  function condenseLockReason() {
    if (!STATE.items.includes('atmospheric_condenser')) return 'Need: Atmospheric Condenser';
    if (STATE.resources.water >= 97) return 'Water tanks are full'; // a day for under 3 water isn't a trade
    return null;
  }
  function handleCondenseVerb() {
    if (condenseLockReason()) return;
    const before = STATE.resources.water;
    STATE.resources.water = clamp(before + 12, 0, 100);
    settleMinigame('◆ CONDENSE — a day of the condenser hissing at the nebula. +' + Math.round(STATE.resources.water - before) + ' water, faintly violet.');
  }
  // DRYDOCK (stations — Bible multi-path rule "station drydock (gold)").
  const DRYDOCK_BASE = 30;
  // Pro-rated: the full fee buys +30; topping off a few points costs less
  // (it charged 30g for +1 at 104/105).
  const drydockFee = () => {
    const missing = Math.max(0, resMax('hull') - STATE.resources.hull);
    return stationPrice(Math.max(5, Math.ceil(DRYDOCK_BASE * Math.min(30, missing) / 30)));
  };
  function drydockLockReason() {
    if (STATE.resources.hull >= resMax('hull')) return 'Hull is intact';
    if (STATE.goldAmount < drydockFee()) return 'Costs ' + drydockFee() + 'g';
    return null;
  }
  function handleDrydockVerb() {
    if (drydockLockReason()) return;
    STATE.goldAmount -= drydockFee();
    const before = STATE.resources.hull;
    STATE.resources.hull = clamp(STATE.resources.hull + 30, 0, resMax('hull'));
    pushLogEntry('◆ DRYDOCK — station crews weld, rivet and invoice. +' + Math.round(STATE.resources.hull - before) + ' hull, −' + drydockFee() + 'g.');
    renderHUD();
    renderCruise();
    renderStopMenu();
  }

  const VERB_HANDLERS = { condense: handleCondenseVerb, drydock: handleDrydockVerb, fab_service: handleFabServiceVerb, medbay: handleMedbayVerb, mine: handleMineVerb, scan: handleScanVerb, repair: handleRepairVerb, forage_food: handleForageVerb, salvage: handleSalvageVerb, fab: handleFabricatorVerb, rest: handleRestVerb, trade: handleTradeVerb, wait_for_trader: handleWaitTraderVerb };

  function currentRegionKey() {
    const node = STATE.byId && STATE.byId[STATE.currentId];
    return NODE_TYPE_TO_REGION[node && node.node_type] || 'deep_space';
  }

  function renderStopMenu() {
    const regionKey = currentRegionKey();
    const region = REGIONS[regionKey] || REGIONS.deep_space;
    $('stop-region-label').textContent = region.label;
    $('stop-region-mood').textContent = region.mood;

    const list = $('stop-choices');
    list.innerHTML = '';
    region.verbs.forEach(verbId => {
      const verb = STOP_VERBS[verbId];
      if (!verb) return;
      const labelStr = typeof verb.label === 'function' ? verb.label(regionKey) : verb.label;
      const btn = document.createElement('button');
      const lockReason = verb.locked ? verb.locked() : null;
      btn.className = 'stop-choice' + (verb.hint ? ' hint' : '') + (lockReason ? ' locked' : '');
      const gate = document.createElement('div');
      gate.className = 'stop-choice-gate' + (lockReason ? ' locked' : '');
      // Demo canon: the verb's icon; a locked verb shows lock.png and says
      // why in the sub-line.
      gate.style.backgroundImage = "url('sprites/interface/" + (lockReason ? 'lock' : verb.icon || 'wait') + ".png')";
      btn.appendChild(gate);
      const body = document.createElement('div');
      body.className = 'stop-choice-body';
      body.textContent = labelStr;
      btn.appendChild(body);
      const sub = document.createElement('div');
      sub.className = 'stop-choice-sub';
      if (lockReason) {
        const need = document.createElement('span');
        need.className = 'lock-need';
        need.textContent = '\u{1F512} ' + lockReason;
        sub.appendChild(need);
      } else {
        const eff = document.createElement('span');
        eff.className = 'effort';
        eff.textContent = effortPips(verb.effort);
        sub.appendChild(eff);
        const s = document.createElement('span');
        s.textContent = '· ' + (typeof verb.sub === 'function' ? verb.sub() : verb.sub);
        sub.appendChild(s);
      }
      btn.appendChild(sub);
      // MINE and FABRICATOR are wired separately (mining.js / fabricator
      // overlay); TRADE/WAIT FOR TRADER/REST have no engine-side system
      // yet and still log honestly.
      btn.addEventListener('click', () => {
        const handler = VERB_HANDLERS[verbId];
        if (handler) handler();
        else pushLogEntry('◆ ' + labelStr + ' isn’t wired into the engine yet.');
      });
      list.appendChild(btn);
    });
  }

  function openStopMenu() {
    document.body.classList.add('stop-active');
    $('stop-btn').textContent = 'Resume';
    renderStopMenu();
  }
  function closeStopMenu() {
    document.body.classList.remove('stop-active');
    $('stop-btn').textContent = 'Stop';
  }

  /* Pressing Stop/Resume while stopped means "resume course" — advance
     one leg via the real travelTo()/selectEvent() pool-draw (Phase 3),
     same engine path the ?debug=fixed_path map screen already uses.
     Forks resolve to 0 available targets until their own event sets
     chose_alpha/chose_beta — that's an honest content-state, not a bug
     here, so it just logs instead of forcing a route. */
  function attemptResume() {
    const nextIds = [...nextAvailableNodes()];
    if (nextIds.length === 0 && typeof resolveStuckFork === 'function' && resolveStuckFork()) { closeStopMenu(); return; }
    if (nextIds.length !== 1) {
      pushLogEntry(nextIds.length === 0
        ? '◆ No route forward from here yet.'
        : '◆ Multiple routes ahead — check the map.');
      return;
    }
    closeStopMenu();
    travelTo(nextIds[0]);
  }

  $('stop-btn').addEventListener('click', () => {
    if (document.body.classList.contains('stop-active')) attemptResume();
    else openStopMenu();
  });

  /* ── AI universal pools (flavor_pools.json → ai_universal) ─────
     Wires the previously-unconsumed ambient/warning/crop pools into
     the cruise AI log. All draws keyed to STATE.activeAI. Called from
     renderCruise() — cheap, idempotent per condition (each warning
     fires once per downward threshold crossing, ambient once per node). */
  function aiPool(path) {
    let node = MOD.flavor && MOD.flavor.ai_universal;
    for (const k of path) { node = node && node[k]; }
    const pool = node && node[STATE.activeAI];
    return (Array.isArray(pool) && pool.length) ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  // Story-flag callbacks (owner ruling 2026-10-10): the AI brings up a
  // past choice (flavor_pools.flag_payoffs[flag].callback[ai]) — at least
  // two legs after it happened, each choice once.
  function maybePushCallback() {
    const pay = MOD.flavor && MOD.flavor.flag_payoffs;
    if (!pay) return false;
    STATE.flagFirstSeen = STATE.flagFirstSeen || {};
    STATE.calledBack = STATE.calledBack || [];
    const leg = STATE.visited ? STATE.visited.size : 0;
    for (const f of STATE.flags) if (pay[f] && !(f in STATE.flagFirstSeen)) STATE.flagFirstSeen[f] = leg;
    const ready = [...STATE.flags].filter(f => pay[f] && !STATE.calledBack.includes(f) && leg - STATE.flagFirstSeen[f] >= 2
      && pay[f].callback && pay[f].callback[STATE.activeAI]);
    if (!ready.length) return false;
    // Pacing (hunt 5, measured over 36 real runs): 35% per new stop, at
    // least two legs apart, and guaranteed after four quiet legs while a
    // memory is waiting — lunar runs often went without any.
    const since = leg - (STATE.lastCallbackLeg != null ? STATE.lastCallbackLeg : -99);
    if (since < 2) return false;
    if (since < 4 && Math.random() >= 0.35) return false;
    STATE.lastCallbackLeg = leg;
    ready.sort((a, b) => (pay[b].weight || 1) - (pay[a].weight || 1));
    const f = ready[0];
    STATE.calledBack.push(f);
    pushLogEntry('◆ ' + pay[f].callback[STATE.activeAI]);
    return true;
  }

  function maybePushAmbient() {
    if (STATE.lastAmbientNode === STATE.currentId) return;
    STATE.lastAmbientNode = STATE.currentId;
    if (maybePushCallback()) return;
    // Node-specific commentary (map_commentary.node_entering — currently
    // authored for station/derelict) takes priority over generic ambient
    // when this node type has a pool.
    const node = STATE.byId && STATE.byId[STATE.currentId];
    if (node) {
      const nodeLine = aiPool(['map_commentary', 'node_entering', node.node_type]);
      if (nodeLine && Math.random() < 0.6) { pushLogEntry('◆ ' + nodeLine); return; }
    }
    if (Math.random() < 0.45) {
      // One ambient beat in four is the ship computer's own note on the
      // living crop (flavor_pools.ship_computer_crop_comments, per crop).
      const cropPool = MOD.flavor && MOD.flavor.ship_computer_crop_comments && STATE.crop
        && STATE.cropGrowth && STATE.cropGrowth.health > 0 && MOD.flavor.ship_computer_crop_comments[STATE.crop];
      // …and one in five is something drifting past the window
      // (flavor_pools.ambient_travel_objects).
      const drift = MOD.flavor && MOD.flavor.ambient_travel_objects;
      const roll = Math.random();
      const line = (Array.isArray(cropPool) && cropPool.length && roll < 0.25)
        ? cropPool[Math.floor(Math.random() * cropPool.length)]
        : (Array.isArray(drift) && drift.length && roll < 0.45)
          ? 'Passing the window: ' + drift[Math.floor(Math.random() * drift.length)].replace(/^./, c => c.toLowerCase()).replace(/\.$/, '') + '.'
          : aiPool(['cruise_ambient']);
      if (line) pushLogEntry('◆ ' + line);
    }
  }

  // low mirrors activeTriggers()' thresholds (fuel/food/water/o2 <25,
  // hull/morale <30); critical is a deeper second warning at <12.
  const WARN_THRESHOLDS = { fuel: 25, food: 25, water: 25, o2: 25, hull: 30, morale: 30 };
  function checkResourceWarnings() {
    STATE.aiWarnLevels = STATE.aiWarnLevels || {};
    for (const [res, lowAt] of Object.entries(WARN_THRESHOLDS)) {
      const v = STATE.resources[res];
      const level = v < 12 ? 'critical' : (v < lowAt ? 'low' : 'ok');
      const prev = STATE.aiWarnLevels[res] || 'ok';
      // Fire only on a downward crossing (ok→low, ok→critical, low→critical);
      // recovery resets silently so the next dip warns again.
      const rank = { ok: 0, low: 1, critical: 2 };
      if (rank[level] > rank[prev]) {
        // Pool only covers fuel/food/water/o2/hull/morale where authored —
        // missing pools just skip (water/o2 land in the same pass as this wiring).
        // First time fuel runs low: the AI's signature low_fuel line.
        let line = null;
        if (res === 'fuel' && !STATE.flags.has('ai_sampled_low_fuel') && window.aiSampleLine) {
          STATE.flags.add('ai_sampled_low_fuel'); line = aiSampleLine('low_fuel');
        }
        line = line || aiPool(['resource_warning', res, level]);
        if (line) pushLogEntry('◆ ' + line);
      }
      STATE.aiWarnLevels[res] = level;
    }
  }

  // crops.json zinnia_arc — a three-beat background story for zinnia runs
  // (bloom at the start, a name mid-journey, a scare when it sickens).
  // The first two are morale events in fact, not just in the log.
  const ZINNIA_BEATS = [['beat_1', 'journey_start', 2], ['beat_2', 'journey_mid', 3], ['beat_3', 'crop_sick', 0]];
  function checkZinniaArc() {
    if (STATE.crop !== 'zinnia' || !STATE.cropGrowth || STATE.cropGrowth.health <= 0) return;
    const arc = ((MOD.crops && MOD.crops.crops) || []).find(c => c.id === 'crop_zinnia');
    if (!arc || !arc.zinnia_arc) return;
    const trig = activeTriggers();
    for (const [key, trigger, morale] of ZINNIA_BEATS) {
      const beat = arc.zinnia_arc[key];
      if (!beat || STATE.flags.has('zinnia_' + key) || !trig.has(trigger)) continue;
      STATE.flags.add('zinnia_' + key);
      if (morale) STATE.resources.morale = clamp(STATE.resources.morale + morale, 0, 100);
      pushLogEntry('◆ ' + beat.first_line + (morale ? ' (+' + morale + ' morale)' : ''));
      return; // one beat per stop
    }
  }

  function checkCropMilestones() {
    if (!STATE.crop || !STATE.cropGrowth) return;
    checkZinniaArc();
    const growth = STATE.cropGrowth.growth || 0;
    const health = STATE.cropGrowth.health;
    // A fresh growth cycle (launch, or the replant after a harvest —
    // growbay.js re-arms the flag) gets its "planted" line once.
    if (health > 0 && growth < 75 && !STATE.flags.has('ai_noted_crop_planted')) {
      STATE.flags.add('ai_noted_crop_planted');
      const line = aiPool(['crop_lifecycle', 'planted']);
      if (line) pushLogEntry('◆ ' + line);
    }
    if (growth > 75 && !STATE.flags.has('ai_noted_crop_mature')) {
      STATE.flags.add('ai_noted_crop_mature');
      const line = aiPool(['crop_lifecycle', 'mature']);
      if (line) pushLogEntry('◆ ' + line);
      // Maturity is the crop's science moment — attach the real-world
      // tie-in from the science_links pool (Bible §18 link schema).
      const sci = MOD.flavor && MOD.flavor.science_links && MOD.flavor.science_links.crops
        && MOD.flavor.science_links.crops[STATE.crop];
      if (sci && sci.url) {
        pushLogEntry({ text: '◆ ' + (sci.text || 'The ship computer files the crop\'s real history for curious minds.'), link: { url: sci.url, label: sci.label || 'Learn more' } });
      }
    }
    // Sickness announcement fires on crossing below the crop's own
    // sick_threshold, and re-arms once it recovers past healthy_threshold
    // — so a crop that yo-yos warns each relapse, not every render.
    const cropDef = (MOD.crops && MOD.crops.crops || []).find(c => c.id === 'crop_' + STATE.crop);
    const sickAt = (cropDef && cropDef.sick_threshold) || 30;
    const healthyAt = (cropDef && cropDef.healthy_threshold) || 70;
    if (health > 0 && health < sickAt && !STATE.flags.has('ai_noted_crop_sick')) {
      STATE.flags.add('ai_noted_crop_sick');
      // The AI's signature crop_sick line (ai_companions) the first time;
      // the crop_lifecycle pool for relapses.
      const first = !STATE.flags.has('ai_sampled_crop_sick');
      STATE.flags.add('ai_sampled_crop_sick');
      const line = (first && window.aiSampleLine && aiSampleLine('crop_sick')) || aiPool(['crop_lifecycle', 'diseased']);
      if (line) pushLogEntry('◆ ' + line);
    } else if (health >= healthyAt && STATE.flags.has('ai_noted_crop_sick')) {
      STATE.flags.delete('ai_noted_crop_sick');
    }
    if (health <= 0 && !STATE.flags.has('ai_noted_crop_died')) {
      STATE.flags.add('ai_noted_crop_died');
      const line = aiPool(['crop_lifecycle', 'died']);
      if (line) pushLogEntry('◆ ' + line);
    }
    // Pest outbreak announcement — once per outbreak (flag cleared by
    // TREAT / an event's clears_pest, so the next outbreak re-warns).
    if (STATE.cropGrowth.pest && !STATE.flags.has('ai_noted_pest')) {
      STATE.flags.add('ai_noted_pest');
      pushLogEntry('◆ GROWBAY ALERT — pest outbreak detected. TREAT from the growbay before it compounds.');
    }
  }

  window.renderCruise = renderCruise;
  // The open Stop menu re-gates after anything that changes the ship
  // from an overlay (fabricator, inventory USE) — lock reasons and fees.
  window.refreshStopMenu = () => { if (document.body.classList.contains('stop-active')) renderStopMenu(); };
  window.pushCruiseLog = pushLogEntry;
})();
