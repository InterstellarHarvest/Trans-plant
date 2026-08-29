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
    const entry = (MOD.crew_roster || []).find(c => c.role === role);
    return entry ? entry.name : role;
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

  function renderCruise() {
    // Catch crop growth/health up to today before painting the card —
    // decay must tick even if the player never opens the growbay.
    if (typeof window.tickCropGrowth === 'function') window.tickCropGrowth();
    syncShipSprite();
    // Every hub repaint is a safe between-actions point — autosave.
    if (typeof saveRun === 'function') saveRun();
    $('cruise-ship-name').textContent = (STATE.shipName || 'THE SHIP').toUpperCase();
    $('header-ticker').textContent = STATE.mapName ? ('EN ROUTE TO ' + STATE.destination.toUpperCase()) : '';
    const daysLeft = Math.max(0, STATE.baseDays - STATE.daysElapsed);
    $('day-counter').textContent = 'DAY ' + STATE.daysElapsed + ' · ' + daysLeft + ' LEFT';

    const ai = STATE.activeAI || 'marv';
    const avatar = $('ai-avatar');
    avatar.style.backgroundImage = "url('" + (AI_SPRITE[ai] || AI_SPRITE.marv) + "')";
    $('ai-name').textContent = ai.toUpperCase();

    // Resource bars (fuel/food/water at-a-glance; the full 6-resource
    // HUD lives in the reused .hud component top-right).
    const r = STATE.resources;
    $('res-fill-fuel').style.width  = clampPct(r.fuel)  + '%';
    $('res-fill-food').style.width  = clampPct(r.food)  + '%';
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
    if (STATE.captain) members.push({ role: STATE.captain, label: 'CAPTAIN' });
    for (const role of STATE.crew) members.push({ role, label: crewDisplayName(role).toUpperCase() });
    for (const m of members) {
      const crewId = ROLE_TO_CREWID[m.role];
      const slot = document.createElement('div');
      slot.className = 'crew-slot';
      const iconHtml = crewId
        ? '<div class="crew-icon has-sprite" style="' + crewIconCss(crewId, 'var(--card-icon-size)') + '"></div>'
        : '<div class="crew-icon">\u{1F464}</div>';
      // Real per-crew HP (index.html's crewHP system); the captain is
      // the player and doesn't take HP damage — always full.
      const hp = m.label === 'CAPTAIN' ? 100
        : (typeof window.crewHPOf === 'function' ? crewHPOf(m.role) : 100);
      const hpColor = hp <= 25 ? '#cc5555' : (hp < 60 ? '#d4a830' : '');
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
    asteroid_field:         { label: 'ASTEROID FIELD',         mood: 'Cold rocks. The kind of place that pays in chips, not stories.',      verbs: ['mine', 'forage_food', 'trade', 'wait_for_trader', 'repair', 'rest', 'fab'] },
    debris_field:           { label: 'DEBRIS FIELD',           mood: 'Someone else’s bad day, scattered for kilometers.',              verbs: ['salvage', 'mine', 'forage_food', 'trade', 'wait_for_trader', 'repair', 'rest', 'fab'] },
    nebula:                 { label: 'NEBULA',                 mood: 'Glowing gas in colors that probably mean something.',                 verbs: ['mine', 'scan', 'trade', 'wait_for_trader', 'repair', 'rest', 'fab'] },
    anomaly:                { label: 'ANOMALY',                mood: 'The instruments disagree with each other. None of them with reality.', verbs: ['scan', 'forage_food', 'repair', 'rest', 'fab'] },
    planet_orbit_habitable: { label: 'PLANET ORBIT · HABITABLE', mood: 'Green and blue and trying. A world that knows how to grow things.', verbs: ['forage_food', 'trade', 'wait_for_trader', 'scan', 'repair', 'rest', 'fab'] },
    station_approach:       { label: 'STATION APPROACH',       mood: 'Lights and traffic. Civilization, give or take.',                     verbs: ['trade', 'wait_for_trader', 'repair', 'rest', 'fab'] },
  };
  const FORAGE_LABEL_BY_REGION = { planet_orbit_habitable: 'GATHER', asteroid_field: 'HUNT', debris_field: 'SCAVENGE', anomaly: 'FORAGE' };
  const STOP_VERBS = {
    mine:         { label: 'MINE',      sub: 'Pull raw materials from the rocks.',              effort: 3 },
    salvage:      { label: 'SALVAGE',   sub: 'Pick through the wreckage. Mind the sharp bits.',  effort: 3 },
    forage_food:  { label: (region) => FORAGE_LABEL_BY_REGION[region] || 'FORAGE', sub: 'Find something edible. Or interesting. Sometimes both.', effort: 2 },
    trade:        { label: 'TRADE',     sub: 'Haggle. Or pretend to.',                           effort: 1 },
    wait_for_trader: { label: 'WAIT FOR TRADER', sub: 'Park. Roll the dice. Days will pass.',    effort: 1, hint: true },
    scan:         { label: 'SCAN',      sub: 'Read the signals. Find what is coming.',           effort: 2, hint: true },
    repair:       { label: 'REPAIR',    sub: 'Patch what is broken. Cost in materials and hours.', effort: 3 },
    rest:         { label: 'REST',      sub: 'Crew morale up. Days down.',                       effort: 1, hint: true },
    fab:          { label: 'FABRICATOR', sub: 'Open the print queue. Long jobs need a still ship.', effort: 1, hint: true },
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
  }

  const TRAIL_TO_SCAN_DIFFICULTY = { lunar: 'easy', mars: 'medium', interstellar: 'hard' };
  const REGION_TO_FORAGE_MODE = { asteroid_field: 'HUNT', debris_field: 'SCAVENGE', planet_orbit_habitable: 'GATHER', anomaly: 'GATHER' };

  function handleScanVerb() {
    const difficulty = TRAIL_TO_SCAN_DIFFICULTY[STATE.trail] || 'medium';
    openMinigame('scan', { difficulty }, (tier) => {
      const lines = { perfect: 'Clean lock. Scan logged, nothing hiding in the noise.', good: 'Partial read — noisy, but usable.', poor: 'Signal lost in the static. Nothing useful recovered.' };
      settleMinigame('◆ SCAN — ' + (lines[tier] || 'Scan complete.'));
    });
  }

  // REPAIR — the full engine-room fault-isolation scene (Restoration
  // item 1; engine/js/minigames/engine_repair.js, ported from
  // demo-engine-repair.html). Replaces the old openMinigame('engine')
  // Simon-says here — that game stays in minigames.js for
  // launch_minigame events. Outcome contract preserved from the old
  // tier handler: allFixed (4/4 faults) → the 'perfect' effect (+20
  // hull), a partial repair → the 'poor' effect (+3 hull), and walking
  // out having fixed nothing → no effect and no day spent (mirrors
  // MINE's empty-handed LEAVE).
  function handleRepairVerb() {
    openEngineRepair((result) => {
      result = result || {};
      const n = result.fixedCount | 0;
      if (n === 0) { renderCruise(); return; }
      const gain = result.allFixed ? 20 : 3;
      STATE.resources.hull = clamp(STATE.resources.hull + gain, 0, 100);
      settleMinigame('◆ REPAIR — ' + (result.allFixed ? 'all four systems nominal' : n + '/4 faults cleared') + ', hull patched (+' + gain + ').');
    });
  }

  function handleForageVerb() {
    const regionKey = currentRegionKey();
    const mode = REGION_TO_FORAGE_MODE[regionKey] || 'GATHER';
    openMinigame('forage', { mode, return_to: 'cruise', origin_node: STATE.currentId }, (tier, payload) => {
      payload = payload || {};
      if (typeof payload.food === 'number' && payload.food > 0) {
        STATE.resources.food = clamp(STATE.resources.food + payload.food, 0, 100);
      }
      if (payload.rare_drops) payload.rare_drops.forEach(d => {
        if (typeof window.grantItem === 'function') window.grantItem(d.id); // capacity-enforced
        else STATE.items.push(d.id);
      });
      if (payload.sickness) payload.sickness.forEach(s => {
        const sev = { light: 3, medium: 7, heavy: 15 }[s.severity] || 3;
        if (s.type === 'poisoning') STATE.resources.food = clamp(STATE.resources.food - sev, 0, 100);
        else STATE.resources.morale = clamp(STATE.resources.morale - sev, 0, 100);
      });
      const gained = payload.food ? ('+' + payload.food + ' food.') : 'came back empty-handed.';
      settleMinigame('◆ ' + mode + ' — ' + gained);
    });
  }

  function handleSalvageVerb() {
    openMinigame('salvage', {}, (tier) => {
      const grant = { perfect: { metal: 3, scrap: 2 }, good: { metal: 2 }, poor: { scrap: 1 } }[tier] || {};
      for (const [mat, qty] of Object.entries(grant)) STATE.materials[mat] = (STATE.materials[mat] || 0) + qty;
      const summary = Object.entries(grant).map(([m, q]) => q + ' ' + m).join(', ') || 'nothing usable';
      settleMinigame('◆ SALVAGE — recovered ' + summary + '.');
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
      settleMinigame('◆ MINE — recovered ' + granted.join(', ') + '.');
    });
  }

  // REST — a day of doing deliberately nothing. Chef aboard makes it
  // land better (their whole thing is morale through care).
  function handleRestVerb() {
    const chefBonus = (STATE.crew.includes('chef') || STATE.captain === 'chef') ? 2 : 0;
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
    STATE.summonedEvent = true; // resolves back to THIS node's hub, not onward
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
      if (ev) { closeStopMenu(); STATE.summonedEvent = true; enterEvent(STATE.byId[STATE.currentId], ev); return; }
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

  const VERB_HANDLERS = { mine: handleMineVerb, scan: handleScanVerb, repair: handleRepairVerb, forage_food: handleForageVerb, salvage: handleSalvageVerb, fab: handleFabricatorVerb, rest: handleRestVerb, trade: handleTradeVerb, wait_for_trader: handleWaitTraderVerb };

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
      btn.className = 'stop-choice' + (verb.hint ? ' hint' : '');
      const gate = document.createElement('div');
      gate.className = 'stop-choice-gate';
      btn.appendChild(gate);
      const body = document.createElement('div');
      body.className = 'stop-choice-body';
      body.textContent = labelStr;
      btn.appendChild(body);
      const sub = document.createElement('div');
      sub.className = 'stop-choice-sub';
      const eff = document.createElement('span');
      eff.className = 'effort';
      eff.textContent = effortPips(verb.effort);
      sub.appendChild(eff);
      const s = document.createElement('span');
      s.textContent = '· ' + verb.sub;
      sub.appendChild(s);
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

  function maybePushAmbient() {
    if (STATE.lastAmbientNode === STATE.currentId) return;
    STATE.lastAmbientNode = STATE.currentId;
    // Node-specific commentary (map_commentary.node_entering — currently
    // authored for station/derelict) takes priority over generic ambient
    // when this node type has a pool.
    const node = STATE.byId && STATE.byId[STATE.currentId];
    if (node) {
      const nodeLine = aiPool(['map_commentary', 'node_entering', node.node_type]);
      if (nodeLine && Math.random() < 0.6) { pushLogEntry('◆ ' + nodeLine); return; }
    }
    if (Math.random() < 0.45) {
      const line = aiPool(['cruise_ambient']);
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
        const line = aiPool(['resource_warning', res, level]);
        if (line) pushLogEntry('◆ ' + line);
      }
      STATE.aiWarnLevels[res] = level;
    }
  }

  function checkCropMilestones() {
    if (!STATE.crop || !STATE.cropGrowth) return;
    const growth = STATE.cropGrowth.growth || 0;
    const health = STATE.cropGrowth.health;
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
      const line = aiPool(['crop_lifecycle', 'diseased']);
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
  window.pushCruiseLog = pushLogEntry;
})();
