'use strict';
/* ────────────────────────────────────────────────────────────────
   FABRICATOR OVERLAY — lifted from resources/demo-fabricator.html
   (Phase 4). Local demo-state object was named STATE in the source;
   renamed FSTATE throughout. FSTATE.stock/wear/broken are live
   references onto STATE.materials/STATE.fabricator (see the FSTATE
   literal's getters — materials mined/salvaged elsewhere are the
   same pool the fabricator spends). aboard/captainBg are recomputed
   fresh from STATE.crew/STATE.captain every time openFabricator()
   runs — see bindFabricatorState().
   MATERIALS/RECIPES are now DERIVED from the real materials.json/
   recipes.json (MOD.materials/MOD.recipes) instead of a hardcoded
   mirror — the demo's local copy had drifted (different field names:
   days/wear/desc vs craft_days/wear_cost/description) AND invented 4
   extra recipes beyond the real 5. Per CLAUDE.md's "don't invent
   content" rule those 4 are dropped, not ported. Two of the real 5
   recipes (fuel_cell, o2_canister) require an item
   ('repair_fabricator') that doesn't exist in items.json yet — an
   honest content gap (like the pre-existing hull_patch/items.json
   gap noted in the original pool-readiness audit), not invented
   around here; they'll just stay locked until that item exists.
   Craft timing: the demo's real-time rAF/setTimeout progress-bar
   animation is kept as-is (nice to watch, self-contained, and
   correctly keeps running via background timers if the overlay is
   closed mid-craft — same as the demo). What changed is WHEN the
   time cost hits real STATE.daysElapsed: paid as a lump sum the
   moment a craft starts (matching every other Stop Menu verb via
   cruise.js's settleMinigame()), not ticked incrementally by the
   animation — ticking it incrementally would race against the rest
   of the engine's discrete day-advancement (travelTo/minigames).
   FSTATE.tripDay/arrivalDay stay pure local decorative flavor for
   the animation's pacing display, not wired to real STATE.
   Entry point: window.openFabricator(). No onDone callback needed —
   craftSelected() and claimOutput() already apply their effects to
   real STATE directly.
   ──────────────────────────────────────────────────────────────── */
(function() {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = document.documentElement;

  // ══ Data ═══════════════════════════════════════════════════
  // Mirrors modules/materials/materials.json — 5 raw materials keyed
  // by id. Sprites pulled from the cargo pool (sprites/cargo/materials/)
  // — all 5 exist. Emoji icons kept as fallback if the PNG fails.
  // MATERIALS/RECIPES are now DERIVED from the real modules/materials/
  // materials.json + modules/recipes/recipes.json (loaded as MOD.materials
  // /MOD.recipes) instead of a hardcoded mirror. The demo also had 4 extra
  // invented recipes (radiation_shield/advanced_sensor/xeno_sample_kit/
  // reactor_core) beyond the real 5 in recipes.json — per CLAUDE.md's "don't
  // invent content" rule those are dropped, not ported; only real recipes
  // are craftable. Icon/sprite are the one piece of real content these
  // JSON files don't carry (presentation-only), so a small local lookup
  // supplies them — same pattern mining.js/growbay.js use for their own
  // presentation tables (CREW_ASSIST/CROP_META).
  // Built lazily by loadFabricatorData() (called from openFabricator())
  // rather than at module-load time — this script's own <script src> tag
  // runs before the main inline script has even declared `MOD`, let alone
  // populated it via loadAllModules(), so reading MOD.materials/MOD.recipes
  // up here at parse time would throw immediately (mining.js/growbay.js
  // avoid this because they only ever touch MOD/STATE inside functions
  // that run later, after boot() has finished).
  const MATERIAL_ICONS = { metal: '🔩', scrap: '♻️', exotic: '✨', biocomponent: '🌱', minerals: '💎' };
  const RECIPE_PRESENTATION = {
    recipe_hull_patch:     { icon: '🛠️', sprite: null },
    recipe_repair_kit:     { icon: '🧰', sprite: 'sprites/cargo/items/repair_kit.png' },
    recipe_crop_treatment: { icon: '💧', sprite: null },
    recipe_o2_canister:    { icon: '🫧', sprite: null },
    recipe_fuel_cell:      { icon: '🔋', sprite: 'sprites/cargo/items/fuel_cell.png' },
  };
  function prettyItemName(itemId) {
    const real = (MOD.items || []).find(it => it.id === itemId || it.id === 'item_' + itemId);
    if (real) return real.name;
    return itemId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  let MATERIALS = {};
  let RECIPES = [];
  function loadFabricatorData() {
    if (RECIPES.length) return; // MOD's module data doesn't change after boot — build once
    MATERIALS = {};
    for (const m of (MOD.materials && MOD.materials.materials) || []) {
      MATERIALS[m.id] = {
        name: m.name,
        icon: MATERIAL_ICONS[m.id] || '📦',
        sprite: 'sprites/cargo/materials/' + m.id + '.png',
        source: (m.sources || []).join(' · '),
      };
    }
    RECIPES = ((MOD.recipes && MOD.recipes.recipes) || []).filter(r => r.active !== false).map(raw => {
      const pres = RECIPE_PRESENTATION[raw.id] || {};
      const unlock = raw.unlocked_by_default ? 'default' : ('item:' + raw.requires_item);
      return {
        id: raw.id.replace(/^recipe_/, ''),
        name: raw.name,
        inputs: raw.inputs.map(i => [i.material_id, i.count]),
        output: { item: raw.output.item_id, name: prettyItemName(raw.output.item_id), count: raw.output.count, icon: pres.icon || '📦', sprite: pres.sprite || null },
        days: raw.craft_days,
        wear: raw.wear_cost,
        desc: raw.description,
        unlock,
        unlock_note: raw.unlocked_by_default ? undefined : ('Requires ' + prettyItemName(raw.requires_item)),
      };
    });
  }

  // Crew roster — only the essentials for the fab demo. Per-role fab
  // contribution values. emoji is the fallback if no other display path
  // is wired. crewId points at the canonical crew_sprites/ entry —
  // unused by the fab demo today (no portrait/icon rendering here),
  // but kept for when this view eventually shows worker faces.
  const CREW = {
    osei:        { name:'Dr. Osei',    role:'Botanist',      fab:0,  crewId:'osei',     emoji:'🌱' },
    kazuki:      { name:'Kazuki',      role:'Engineer',      fab:25, crewId:'kazuki',   emoji:'🔧' },
    vasquez:     { name:'Dr. Vasquez', role:'Medic',         fab:0,  crewId:'vasquez',  emoji:'🩺' },
    reeves:      { name:'Reeves',      role:'Pilot',         fab:0,  crewId:'reeves',   emoji:'🛸' },
    reyes:       { name:'Reyes',       role:'Chef',          fab:0,  crewId:'reyes',    emoji:'🍳' },
    hargrove:    { name:'Hargrove',    role:'Diplomat',      fab:0,  crewId:'hargrove', emoji:'🤝' },
    tanaka:      { name:'Dr. Tanaka',  role:'Xenobiologist', fab:5,  crewId:'tanaka',   emoji:'🔬' },
    captain_eng: { name:'Captain',     role:'Engineer bg.',  fab:15, crewId:'captain',  emoji:'🧑‍✈️' },
    captain_aca: { name:'Captain',     role:'Academic bg.',  fab:10, crewId:'captain',  emoji:'🧑‍🚀' }
  };
  // Baseline — the captain (player) always contributes this much,
  // independent of their chosen background. Engineer / Academic bg
  // adds its own bonus on top.
  const BASE_EFFORT = 10;

  // ═════ State ═══════════════════════════════════════════════
  // Driven entirely by dev controls. No persistence.
  // FSTATE.stock is a LIVE REFERENCE to the real STATE.materials pool —
  // the same materials MINE/SALVAGE grant are what the fabricator spends,
  // so this can't be an independent local copy. wear/broken persist on
  // STATE.fabricator (survives closing/reopening the overlay, consistent
  // with mining.js's STATE.miningSectors / growbay.js's STATE.cropGrowth
  // pattern). aboard/captainBg are recomputed fresh on every open from
  // STATE.crew/STATE.captain — see bindFabricatorState(). Everything else
  // here (selection/sort/filter/craft/pendingOutput/tripDay/msPerDay) is
  // local UI/session state exactly as the demo had it: tripDay/arrivalDay
  // are a purely decorative pacing clock for the craft animation, NOT
  // wired to real STATE.daysElapsed (that would race against the rest of
  // the engine's discrete day-advancement — see craftSelected() instead,
  // which pays the real time cost as a lump sum when a craft starts, the
  // same way every other Stop Menu verb does).
  const FSTATE = {
    aboard: {},
    captainBg: 'none',
    get wear() { return STATE.fabricator.wear; },
    set wear(v) { STATE.fabricator.wear = v; },
    get broken() { return STATE.fabricator.broken; },
    set broken(v) { STATE.fabricator.broken = v; },
    get stock() { return STATE.materials; },
    selectedId: 'hull_patch',
    sort: 'time',             // 'name' | 'time' | 'complexity'
    filter: 'all',            // 'all' | 'unlocked' | 'craftable'
    craft: null,
    pendingOutput: null,
    tripDay:     0,
    arrivalDay:  0,
    msPerDay: 2000
  };
  /* Refreshes the fields that must always reflect current reality —
     called every time the overlay opens (see window.openFabricator()). */
  function bindFabricatorState() {
    STATE.fabricator = STATE.fabricator || { wear: 0, broken: false };
    const ROLE_TO_CREWID = { botanist: 'osei', engineer: 'kazuki', medic: 'vasquez', pilot: 'reeves', chef: 'reyes', xenobiologist: 'tanaka', diplomat: 'hargrove' };
    FSTATE.aboard = {};
    for (const role of STATE.crew) {
      const id = ROLE_TO_CREWID[role];
      if (id && CREW[id]) FSTATE.aboard[id] = true;
    }
    FSTATE.captainBg = (STATE.captain === 'engineer' || STATE.captain === 'academic') ? STATE.captain : 'none';
    FSTATE.tripDay = STATE.daysElapsed;
    FSTATE.arrivalDay = STATE.baseDays;
  }

  // ═════ Unlock evaluation ═══════════════════════════════════
  // Returns one of:
  //   'available'    — fully unlocked (default OR satisfied)
  //   'locked-crew'  — needs a role aboard
  //   'locked-purchase' — needs a bought blueprint
  function recipeLockState(recipe) {
    if (recipe.unlock === 'default') return 'available';
    // Real recipes.json only gates on requires_item (e.g. fuel_cell/
    // o2_canister both need 'repair_fabricator', which nothing in the
    // engine grants yet — an honest content gap, not a bug: those two
    // recipes stay locked until that item exists somewhere droppable.
    if (recipe.unlock.startsWith('item:')) {
      const itemId = recipe.unlock.slice(5);
      return STATE.items.includes(itemId) ? 'available' : 'locked-purchase';
    }
    return 'available';
  }

  // Aggregate total fab contribution — sum of crew + captain bg +
  // captain baseline. Drives the total pill and the days reduction.
  function totalFabContribution() {
    let total = BASE_EFFORT;    // captain always adds baseline
    for (const [id, on] of Object.entries(FSTATE.aboard)) {
      if (on) total += CREW[id].fab;
    }
    if (FSTATE.captainBg === 'engineer') total += CREW.captain_eng.fab;
    else if (FSTATE.captainBg === 'academic') total += CREW.captain_aca.fab;
    return total;
  }

  // Effective craft days — bible §8 formula:
  //   actual = max(1, ceil(base_days * BASE_EFFORT / available))
  function actualDays(baseDays) {
    const avail = Math.max(1, totalFabContribution());
    return Math.max(1, Math.ceil(baseDays * BASE_EFFORT / avail));
  }

  // Material satisfaction — is every input satisfied by current stock?
  function hasMaterials(recipe) {
    return recipe.inputs.every(([mat, qty]) => (FSTATE.stock[mat] || 0) >= qty);
  }

  // Fab-is-functional check. Broken = wear 100% OR hard toggle.
  function fabFunctional() {
    return !FSTATE.broken && FSTATE.wear < 100;
  }

  // Can this recipe actually be crafted right now?
  function canCraft(recipe) {
    if (recipeLockState(recipe) !== 'available') return false;
    if (!hasMaterials(recipe)) return false;
    if (!fabFunctional()) return false;
    if (FSTATE.craft) return false;       // one craft at a time
    return true;
  }

  // ═════ Crew contribution strip ═════════════════════════════
  // Tooltip surfaced on the TIME row. Lists crew ADDING fab speed;
  // the solo-captain ×1.0 baseline is implicit (it's the floor when
  // nobody is helping, not a "contribution"). TOTAL reads as the
  // overall speed multiplier.
  function crewAssistTooltip() {
    const pct = n => '+' + Math.round(n / BASE_EFFORT * 100) + '%';
    const lines = ['FAB SPEED BREAKDOWN'];
    let anyContributor = false;
    for (const [id, on] of Object.entries(FSTATE.aboard)) {
      if (!on) continue;
      const c = CREW[id];
      if (c.fab > 0) { lines.push('  ' + c.name + ' (' + c.role + ')  ' + pct(c.fab)); anyContributor = true; }
    }
    if (FSTATE.captainBg === 'engineer') {
      const c = CREW.captain_eng;
      lines.push('  ' + c.name + ' (' + c.role + ')  ' + pct(c.fab));
      anyContributor = true;
    } else if (FSTATE.captainBg === 'academic') {
      const c = CREW.captain_aca;
      lines.push('  ' + c.name + ' (' + c.role + ')  ' + pct(c.fab));
      anyContributor = true;
    }
    if (!anyContributor) lines.push('  (no crew assisting — solo)');
    lines.push('');
    const total = totalFabContribution();
    const mult  = (total / BASE_EFFORT).toFixed(1);
    if (total > BASE_EFFORT) {
      lines.push('TOTAL: ×' + mult + ' SPEED (craft in ' +
                 Math.round(BASE_EFFORT / total * 100) + '% of base time)');
    } else {
      lines.push('TOTAL: ×1.0 SPEED (base time)');
    }
    return lines.join('\n');
  }

  // ═════ Recipe list ═════════════════════════════════════════
  function sortRecipes(list) {
    const out = list.slice();
    if (FSTATE.sort === 'name') out.sort((a,b) => a.name.localeCompare(b.name));
    else if (FSTATE.sort === 'time') out.sort((a,b) => a.days - b.days);
    else if (FSTATE.sort === 'complexity') {
      const comp = r => r.inputs.reduce((s, [,q]) => s + q, 0) + r.days;
      out.sort((a,b) => comp(a) - comp(b));
    }
    return out;
  }
  function filterRecipes(list) {
    if (FSTATE.filter === 'all') return list;
    if (FSTATE.filter === 'unlocked') {
      return list.filter(r => recipeLockState(r) === 'available');
    }
    if (FSTATE.filter === 'craftable') {
      return list.filter(r => recipeLockState(r) === 'available' && hasMaterials(r) && fabFunctional());
    }
    return list;
  }

  function renderRecipeList() {
    const scroll = $('fb-recipe-scroll');
    scroll.innerHTML = '';
    const shown = filterRecipes(sortRecipes(RECIPES));
    if (shown.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding: 16px; text-align: center; font-family: VT323, monospace; font-size: 14px; color: #7a8898; font-style: italic;';
      empty.textContent = 'No recipes match filter.';
      scroll.appendChild(empty);
      return;
    }
    for (const r of shown) {
      const lock = recipeLockState(r);
      const row = document.createElement('div');
      row.className = 'fb-recipe-row';
      if (lock === 'locked-crew')     row.classList.add('locked-crew');
      if (lock === 'locked-purchase') row.classList.add('locked-purchase');
      if (r.id === FSTATE.selectedId && lock === 'available') row.classList.add('selected');

      const name = document.createElement('span');
      name.className = 'fb-recipe-name';
      let nameHtml = r.name;
      if (lock === 'locked-crew')     nameHtml = '<span class="lock-glyph">🔒</span> ' + r.name;
      if (lock === 'locked-purchase') nameHtml = '<span class="lock-glyph">🔒</span><span class="dollar">$</span> ' + r.name;
      name.innerHTML = nameHtml;

      const days = document.createElement('span');
      days.className = 'fb-recipe-days';
      if (lock === 'locked-crew' || lock === 'locked-purchase') {
        days.textContent = r.unlock_note;
      } else {
        days.textContent = r.days + 'd';
      }

      row.appendChild(name);
      row.appendChild(days);

      row.addEventListener('click', () => {
        if (lock === 'locked-crew' || lock === 'locked-purchase') {
          // Pulse the accent bar so the player understands the row is
          // intentionally inert (vs. appearing unresponsive).
          row.classList.remove('pulse');
          void row.offsetWidth;
          row.classList.add('pulse');
          return;
        }
        FSTATE.selectedId = r.id;
        renderRecipeList();
        renderDetail();
      });

      scroll.appendChild(row);
    }
  }

  // ═════ Detail panel ════════════════════════════════════════
  function renderDetail() {
    const r = RECIPES.find(x => x.id === FSTATE.selectedId) || RECIPES[0];

    $('fb-detail-name').textContent = r.name.toUpperCase();
    $('fb-detail-desc').textContent = r.desc;

    // Item sprite in the detail header (emoji fallback).
    const spriteEl = $('fb-detail-sprite');
    spriteEl.classList.remove('has-sprite');
    if (r.output.sprite) {
      const img = new Image();
      img.onload = () => {
        spriteEl.classList.add('has-sprite');
        spriteEl.style.setProperty('--detail-sprite', "url('" + r.output.sprite + "')");
        spriteEl.textContent = '';
      };
      img.onerror = () => {
        spriteEl.style.setProperty('--detail-sprite', 'none');
        spriteEl.textContent = r.output.icon || '📦';
      };
      img.src = r.output.sprite;
      spriteEl.textContent = r.output.icon || '📦';   // immediate fallback
    } else {
      spriteEl.style.setProperty('--detail-sprite', 'none');
      spriteEl.textContent = r.output.icon || '📦';
    }

    // Inputs — missing materials render their count in red. Whole row
    // carries .missing so the count turns red via CSS.
    const inputsEl = $('fb-inputs');
    inputsEl.innerHTML = '';
    for (const [mat, qty] of r.inputs) {
      const have = FSTATE.stock[mat] || 0;
      const miss = have < qty;
      const row = document.createElement('div');
      row.className = 'fb-input-row' + (miss ? ' missing' : '');
      const m = MATERIALS[mat];
      // Hover tooltip: material name + where to get it + current stock.
      row.title = m.name + '\n' + (m.source || '') +
                  '\nIn cargo: ' + have;
      row.innerHTML =
        '<span class="fb-input-icon">' + m.icon + '</span>' +
        '<span class="fb-input-count">' + have + '/' + qty + '</span>' +
        '<span class="fb-input-name">' + m.name + '</span>';
      inputsEl.appendChild(row);
    }

    // Meta — TIME (base → actual if different) + WEAR (add)
    const meta = $('fb-meta');
    const act = actualDays(r.days);
    const sameDays = (act === r.days);
    // Crew engineering bonus — percent speed boost above solo baseline
    // (e.g. ×5.0 speed = +400% bonus). Only renders when crew actually
    // save time on THIS recipe. Short recipes (e.g. 1d base) hit the
    // 1-day floor, so even big speed bonuses can produce zero time
    // saved — in that case the line hides instead of claiming a bonus
    // the player won't actually see.
    const total = totalFabContribution();
    const bonusPct = Math.round((total - BASE_EFFORT) / BASE_EFFORT * 100);
    const timeSavedPct = r.days > 0 ? Math.round((r.days - act) / r.days * 100) : 0;
    const showBonus = bonusPct > 0 && timeSavedPct > 0;
    const bonusSpan = showBonus
      ? '<span class="bonus" title="Reduces fab time by ' + timeSavedPct + '% on this recipe.">' +
          '+' + bonusPct + '% Crew Engineering Bonus' +
        '</span>'
      : '';

    // TIME cell: if crew actually shave time off this recipe, show only
    // the reduced time (highlighted) — the base is visible in the recipe
    // list already, no need to repeat. Otherwise show the base as usual.
    const timeDisplay = sameDays
      ? '<span class="base">' + r.days + 'd base</span>'
      : '<span class="actual">' + act + 'd</span>';

    // Deadline overrun warning — craft would finish after arrival.
    const finishDay = FSTATE.tripDay + act;
    const overrunBy = finishDay - FSTATE.arrivalDay;
    const overrunWarn = overrunBy > 0
      ? '<div class="fb-warn overrun">⚠ Finishes day ' + finishDay +
        ' · <strong>' + overrunBy + 'd past arrival</strong></div>'
      : '';

    // Wear threshold warning — will push wear past service or break.
    const postWear = Math.min(100, FSTATE.wear + r.wear);
    let wearWarn = '';
    if (postWear >= 100) {
      wearWarn = '<div class="fb-warn wear-crit">⚠ Will break the fab (100% wear) · repair needed at next station</div>';
    } else if (postWear >= 80 && FSTATE.wear < 80) {
      wearWarn = '<div class="fb-warn wear-warn">⚠ Will push wear to ' + postWear + '% · service soon</div>';
    }

    meta.innerHTML =
      '<div class="row">' +
        '<span class="label">TIME</span>' +
        timeDisplay +
        bonusSpan +
      '</div>' +
      overrunWarn +
      '<div class="row">' +
        '<span class="label">WEAR</span>' +
        '<span class="wear-add">+' + r.wear + '%</span>' +
      '</div>' +
      wearWarn;

    // CRAFT button — enabled only if canCraft() true.
    const btn = $('fb-craft-btn');
    const lock = recipeLockState(r);
    if (lock === 'locked-crew') {
      btn.classList.add('locked');
      btn.textContent = 'LOCKED · CREW';
    } else if (lock === 'locked-purchase') {
      btn.classList.add('locked');
      btn.textContent = 'LOCKED · BLUEPRINT';
    } else if (!fabFunctional()) {
      btn.classList.add('locked');
      btn.textContent = 'FAB BROKEN';
    } else if (!hasMaterials(r)) {
      btn.classList.add('locked');
      btn.textContent = 'MISSING MATERIALS';
    } else if (FSTATE.craft) {
      btn.classList.add('locked');
      btn.textContent = 'IN PROGRESS…';
    } else {
      btn.classList.remove('locked');
      btn.textContent = 'CRAFT';
    }
  }

  // ═════ Fabricator spritesheet ═══════════════════════════════
  // Frames cut out of sprites/fabricator/spritesheet_fabricator.png
  // (516×390 sheet, each frame 256×128). idle = at-rest, broken =
  // worn-out, running1–4 = the 4-frame activity loop (chase-pattern
  // side lights CW + dials ticking).
  const FAB_FRAMES = {
    broken:    { x: 1,   y: 1   },
    idle:      { x: 1,   y: 131 },
    running1:  { x: 1,   y: 261 },
    running2:  { x: 259, y: 1   },
    running3:  { x: 259, y: 131 },
    running4:  { x: 259, y: 261 }
  };
  const FAB_RUN_LOOP = ['running1','running2','running3','running4'];
  const FAB_RUN_MS   = 140;   // per-frame interval of the running loop

  // Frame is 256×128. --fab-slot-size is the slot HEIGHT; width = 2×.
  // Scale factor = slot_height / 128.
  function setFabFrame(name) {
    const f = FAB_FRAMES[name]; if (!f) return;
    const h = parseFloat(getComputedStyle(document.documentElement)
                         .getPropertyValue('--fab-slot-size')) || 128;
    const scale = h / 128;
    $('fb-slot').style.backgroundPosition =
      -(f.x * scale) + 'px ' + -(f.y * scale) + 'px';
  }

  let runAnimTimer = null;
  let runAnimIdx = 0;
  function startRunAnim() {
    if (runAnimTimer) return;   // already running
    runAnimIdx = 0;
    setFabFrame(FAB_RUN_LOOP[0]);
    runAnimTimer = setInterval(() => {
      runAnimIdx = (runAnimIdx + 1) % FAB_RUN_LOOP.length;
      setFabFrame(FAB_RUN_LOOP[runAnimIdx]);
    }, FAB_RUN_MS);
  }
  function stopRunAnim() {
    if (runAnimTimer) {
      clearInterval(runAnimTimer);
      runAnimTimer = null;
    }
  }

  // ═════ Wear + status ═══════════════════════════════════════
  // Wear overlay (segmented, depleting) + status line + frame choice.
  function renderWear() {
    // Depleting gauge: 0% wear → 10 segments lit; 100% wear → 0 lit.
    // ceil(health / 10) so 1% of health still shows one segment.
    const overlay = $('fb-wear-overlay');
    const broken = !fabFunctional();
    overlay.classList.toggle('hidden', broken);
    if (!broken) {
      const lit = Math.ceil(Math.max(0, 100 - FSTATE.wear) / 10);
      const segs = overlay.querySelectorAll('.fb-wear-seg');
      segs.forEach((seg, i) => seg.classList.toggle('lit', i < lit));
    }

    // Unit slot class + sprite frame.
    const slotEl = $('fb-slot');
    slotEl.classList.remove('state-idle', 'state-busy', 'state-done', 'state-broken');

    if (!fabFunctional()) {
      slotEl.classList.add('state-broken');
      stopRunAnim();
      setFabFrame('broken');
    } else if (FSTATE.craft) {
      slotEl.classList.add('state-busy');
      startRunAnim();
    } else {
      slotEl.classList.add('state-idle');
      stopRunAnim();
      setFabFrame('idle');
    }
  }

  // ═════ Header — day counter ════════════════════════════════
  function renderHeader() {
    // Day counter mirrors cruise: `DAY 47 · 153 LEFT`.
    $('fb-trip-day').textContent  = FSTATE.tripDay;
    const left = Math.max(0, FSTATE.arrivalDay - FSTATE.tripDay);
    $('fb-days-left').textContent = left + ' LEFT';
  }

  // ═════ Craft flow ═══════════════════════════════════════════
  // CRAFT button → deduct mats, tick wear, compute failure roll, either
  // spark+broken or start the progress timer. A single craft is in
  // flight at a time; further CRAFT clicks are locked while in progress.
  window.craftSelected = function() {
    const r = RECIPES.find(x => x.id === FSTATE.selectedId);
    if (!r || !canCraft(r)) return;

    // Auto-claim any unclaimed output from the last craft so the
    // output bay is clear before this one finishes. If the hold is too
    // full to claim it (capacity enforcement), refuse the new craft —
    // otherwise the new output would clobber the unclaimed one.
    autoClaimIfPending();
    if (FSTATE.pendingOutput) return;

    // Deduct materials — real STATE.materials via the FSTATE.stock live ref.
    for (const [mat, qty] of r.inputs) {
      FSTATE.stock[mat] = Math.max(0, (FSTATE.stock[mat] || 0) - qty);
    }
    // Apply wear.
    FSTATE.wear = Math.min(100, FSTATE.wear + r.wear);

    // Fail roll — 0.5% base + up to +5% scaling past wear=50. Over 80%
    // wear this gets nasty.
    const failChance = 0.005 + Math.max(0, (FSTATE.wear - 50) / 100) * 0.005;
    if (Math.random() < failChance) {
      breakFab();
      console.log('Craft failed: fab broken mid-cycle.');
      renderAll();
      return;
    }

    // Time cost paid up front, same as every other Stop Menu verb (see
    // cruise.js's settleMinigame()) — the craft animation below is real-
    // time flavor for watching the fabricator work, not a second, racing
    // day-advancement system.
    const totalDays = actualDays(r.days);
    passDays(totalDays); // routed through the orders daily-drain helper (Restoration item 5)
    renderHUD();
    if (checkFailure()) return;

    // Success path — kick off the craft. Timestamp-driven so the
    // progress bar can animate smoothly per-frame rather than
    // stepping at day boundaries.
    FSTATE.craft = {
      recipeId:  r.id,
      daysTotal: totalDays,
      startMs:   performance.now(),
      timer:     null,
      rafId:     null
    };
    // Progress strip visible + labelled.
    $('fb-progress').classList.add('active');
    $('fb-progress-item').textContent = r.output.name.toUpperCase();
    updateProgressUI();

    // Timeout for the NEXT day boundary (advances trip calendar) +
    // rAF loop for smooth fill animation.
    scheduleNextTick();
    startProgressLoop();
    renderAll();

    // AI commentary on craft start (fabricator_events pool, previously
    // unconsumed) — lands in the cruise AI log behind the overlay.
    if (typeof window.pushCruiseLog === 'function') {
      const pool = MOD.flavor && MOD.flavor.ai_universal && MOD.flavor.ai_universal.fabricator_events
        && MOD.flavor.ai_universal.fabricator_events.craft_started;
      const lines = pool && pool[STATE.activeAI];
      if (Array.isArray(lines) && lines.length) window.pushCruiseLog('◆ ' + lines[Math.floor(Math.random() * lines.length)]);
    }
  };

  // Start the craft timers: a setTimeout per in-game day (fires
  // advanceCraftDay → bumps trip calendar, maybe completes), plus a
  // rAF loop that continuously redraws the progress fill so the bar
  // animates smoothly rather than stepping at day boundaries.
  function scheduleNextTick() {
    if (!FSTATE.craft) return;
    const daysDone = currentDaysDone();
    const elapsed  = performance.now() - FSTATE.craft.startMs;
    const nextDayAt = (daysDone + 1) * FSTATE.msPerDay;
    const delay    = Math.max(0, nextDayAt - elapsed);
    clearTimeout(FSTATE.craft.timer);
    FSTATE.craft.timer = setTimeout(() => {
      advanceCraftDay();
      scheduleNextTick();
    }, delay);
  }

  function startProgressLoop() {
    if (!FSTATE.craft) return;
    const tick = () => {
      if (!FSTATE.craft) return;
      if (PauseBus.paused) { FSTATE.craft.rafId = requestAnimationFrame(tick); return; }
      updateProgressUI();
      FSTATE.craft.rafId = requestAnimationFrame(tick);
    };
    FSTATE.craft.rafId = requestAnimationFrame(tick);
  }
  function stopProgressLoop() {
    if (FSTATE.craft && FSTATE.craft.rafId) {
      cancelAnimationFrame(FSTATE.craft.rafId);
      FSTATE.craft.rafId = null;
    }
  }

  function currentDaysDone() {
    if (!FSTATE.craft) return 0;
    const elapsed = performance.now() - FSTATE.craft.startMs;
    return Math.min(FSTATE.craft.daysTotal,
                    Math.floor(elapsed / FSTATE.msPerDay));
  }

  function advanceCraftDay() {
    if (!FSTATE.craft) return;
    // Bump the shared trip calendar + pulse the day number.
    FSTATE.tripDay++;
    const dEl = $('fb-trip-day');
    dEl.textContent = FSTATE.tripDay;
    dEl.classList.remove('ticking');
    void dEl.offsetWidth;
    dEl.classList.add('ticking');

    if (currentDaysDone() >= FSTATE.craft.daysTotal) {
      completeCraft();
    }
  }

  function updateProgressUI() {
    if (!FSTATE.craft) return;
    const elapsed = performance.now() - FSTATE.craft.startMs;
    const totalMs = FSTATE.craft.daysTotal * FSTATE.msPerDay;
    const pct = Math.min(100, (elapsed / totalMs) * 100);
    $('fb-progress-fill').style.width = pct + '%';
    const dDone = Math.min(FSTATE.craft.daysTotal, Math.floor(elapsed / FSTATE.msPerDay));
    $('fb-progress-days').textContent = dDone + 'd / ' + FSTATE.craft.daysTotal + 'd';
  }

  // Cancel an in-flight craft. Refunds materials in full; incurred
  // wear stays (the fab already spun up); days that ticked stay spent
  // (time is gone). No output produced.
  window.cancelCraft = function() {
    if (!FSTATE.craft) return;
    const r = RECIPES.find(x => x.id === FSTATE.craft.recipeId);
    if (r) {
      for (const [mat, qty] of r.inputs) {
        FSTATE.stock[mat] = (FSTATE.stock[mat] || 0) + qty;
      }
    }
    clearTimeout(FSTATE.craft.timer);
    stopProgressLoop();
    FSTATE.craft = null;
    // Portrait back to idle; kill anim.
    const slot = $('fb-slot');
    slot.classList.remove('state-busy', 'state-done');
    slot.classList.add('state-idle');
    stopRunAnim();
    setFabFrame('idle');
    setProgressIdle();
    renderAll();
  };

  // Drop the progress strip back to its muted idle look.
  function setProgressIdle() {
    $('fb-progress').classList.remove('active');
    $('fb-progress-item').textContent = 'IDLE';
    $('fb-progress-days').textContent = '—';
    $('fb-progress-fill').style.width = '0%';
  }

  function completeCraft() {
    const r = RECIPES.find(x => x.id === FSTATE.craft.recipeId);
    const out = r.output;
    // Brief done-flash on the fab slot — stop the run anim, hold on
    // the idle frame under the green done-flash brightness kick.
    const slot = $('fb-slot');
    slot.classList.remove('state-busy', 'state-idle');
    slot.classList.add('state-done');
    stopRunAnim();
    setFabFrame('idle');
    // Floating badge — still fires briefly as a celebration flourish.
    const badge = $('fb-badge');
    badge.textContent = '+' + out.count + ' ' + out.name.toUpperCase();
    badge.classList.remove('fire');
    void badge.offsetWidth;
    badge.classList.add('fire');

    clearTimeout(FSTATE.craft.timer);
    stopProgressLoop();
    // Snap the counter + bar to the final completed state. The rAF
    // loop's last tick can land one frame short of a boundary (e.g.
    // `1d / 2d` at 100% fill) because floor() rounds elapsed-ms down.
    // Force the full read before tearing the strip down.
    $('fb-progress-days').textContent = FSTATE.craft.daysTotal + 'd / ' + FSTATE.craft.daysTotal + 'd';
    $('fb-progress-fill').style.width = '100%';
    FSTATE.craft = null;
    setProgressIdle();

    // Park the finished item in the output slot — sits there pulsing +
    // floating until the player clicks to claim (moves to cargo).
    showOutputItem(r);

    // Return to idle after the done-flash window.
    setTimeout(() => {
      slot.classList.remove('state-done');
      renderAll();
    }, 650);
  }

  // ═════ Output-item slot ═════════════════════════════════════
  // Called on craft complete. Renders either the sprite or emoji
  // fallback inside the pulsing output slot. Player clicks to claim.
  function showOutputItem(recipe) {
    FSTATE.pendingOutput = recipe;
    const slot = $('fb-output-slot');
    const emo  = $('fb-output-emoji');
    if (recipe.output.sprite) {
      slot.style.setProperty('--output-sprite', "url('" + recipe.output.sprite + "')");
      emo.textContent = '';
    } else {
      slot.style.setProperty('--output-sprite', 'none');
      emo.textContent = recipe.output.icon || '📦';
    }
    slot.title = 'Claim ' + recipe.output.count + '× ' +
                 recipe.output.name + ' → cargo';
    slot.classList.add('ready');
  }
  window.claimOutput = function(animated = true) {
    if (!FSTATE.pendingOutput) return;
    const r = FSTATE.pendingOutput;
    // Capacity check (audit fix): a full hold leaves the print in the
    // output bay — pendingOutput stays set, so the player can jettison
    // something (INV) and claim again. Nothing is silently lost.
    if (typeof window.cargoSlotsUsed === 'function') {
      for (let i = 0; i < r.output.count; i++) STATE.items.push(r.output.item);
      if (cargoSlotsUsed() > cargoCapacity()) {
        STATE.items.length -= r.output.count;
        if (typeof window.pushCruiseLog === 'function') {
          window.pushCruiseLog('◆ FABRICATOR — output ready but the hold is full. Make room, then claim it.');
        }
        return;
      }
    } else {
      for (let i = 0; i < r.output.count; i++) STATE.items.push(r.output.item);
    }
    FSTATE.pendingOutput = null;
    // AI commentary on completed craft (fabricator_events pool).
    if (typeof window.pushCruiseLog === 'function') {
      const pool = MOD.flavor && MOD.flavor.ai_universal && MOD.flavor.ai_universal.fabricator_events
        && MOD.flavor.ai_universal.fabricator_events.craft_complete;
      const lines = pool && pool[STATE.activeAI];
      if (Array.isArray(lines) && lines.length) window.pushCruiseLog('◆ ' + lines[Math.floor(Math.random() * lines.length)]);
    }
    const slot = $('fb-output-slot');

    const finish = () => {
      slot.classList.remove('claimed');
      // If a new craft completed mid-animation, showOutputItem has already
      // taken over the slot — leave its .ready + sprite alone.
      if (!FSTATE.pendingOutput) {
        slot.classList.remove('ready');
        $('fb-output-emoji').textContent = '';
        slot.style.removeProperty('--output-sprite');
      }
    };

    if (animated && slot.classList.contains('ready')) {
      slot.classList.add('claimed');
      slot.addEventListener('animationend', finish, { once: true });
    } else {
      finish();
    }
  };
  // Any new craft auto-claims a pending output so the bay is clear.
  // Skip the pickup animation here — the new item is about to appear.
  function autoClaimIfPending() {
    if (FSTATE.pendingOutput) claimOutput(false);
  }

  function breakFab() {
    FSTATE.broken = true;
    // AI commentary on the breakage (fabricator_events.craft_failed).
    if (typeof window.pushCruiseLog === 'function') {
      const pool = MOD.flavor && MOD.flavor.ai_universal && MOD.flavor.ai_universal.fabricator_events
        && MOD.flavor.ai_universal.fabricator_events.craft_failed;
      const lines = pool && pool[STATE.activeAI];
      if (Array.isArray(lines) && lines.length) window.pushCruiseLog('◆ ' + lines[Math.floor(Math.random() * lines.length)]);
    }
    // Spark burst.
    const field = $('fb-spark-field');
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span');
      s.className = 'fb-spark';
      s.style.setProperty('--sx', ((Math.random() - 0.5) * 120) + 'px');
      s.style.setProperty('--sy', (-20 - Math.random() * 80) + 'px');
      s.style.animationDelay = (Math.random() * 120) + 'ms';
      field.appendChild(s);
      setTimeout(() => s.remove(), 900);
    }
    if (FSTATE.craft) {
      clearTimeout(FSTATE.craft.timer);
      stopProgressLoop();
      FSTATE.craft = null;
      setProgressIdle();
    }
  }

  // ═════ Render pipeline ═══════════════════════════════════
  function renderAll() {
    renderRecipeList();
    renderDetail();
    renderWear();
    renderHeader();
  }

  // ═════ Sort / filter dropdown wiring ══════════════════════
  // Custom dropdown (no native <select> per design-system rule).
  // Click the trigger → opens a flyout. Click an option → sets the
  // value + closes. Outside-click closes. Only one dropdown open
  // at a time.
  window.toggleDropdown = function(id, e) {
    if (e) e.stopPropagation();
    const dd = $(id);
    const wasOpen = dd.classList.contains('open');
    // Close all first (single-open invariant).
    document.querySelectorAll('.fb-dd').forEach(d => d.classList.remove('open'));
    if (!wasOpen) dd.classList.add('open');
  };
  document.addEventListener('click', () => {
    document.querySelectorAll('.fb-dd').forEach(d => d.classList.remove('open'));
  });

  // Label text shown in the trigger for each value.
  const SORT_LABEL   = { name:'Name', time:'Time', complexity:'Complexity' };
  const FILTER_LABEL = { all:'All',   unlocked:'Unlocked', craftable:'Craftable now' };

  document.querySelectorAll('#fb-dd-sort .fb-dd-menu button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      FSTATE.sort = btn.dataset.sort;
      document.querySelectorAll('#fb-dd-sort .fb-dd-menu button')
        .forEach(b => b.classList.toggle('active', b === btn));
      $('fb-dd-sort-value').textContent = SORT_LABEL[FSTATE.sort] || FSTATE.sort;
      $('fb-dd-sort').classList.remove('open');
      renderRecipeList();
    });
  });
  document.querySelectorAll('#fb-dd-filter .fb-dd-menu button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      FSTATE.filter = btn.dataset.filter;
      document.querySelectorAll('#fb-dd-filter .fb-dd-menu button')
        .forEach(b => b.classList.toggle('active', b === btn));
      $('fb-dd-filter-value').textContent = FILTER_LABEL[FSTATE.filter] || FSTATE.filter;
      $('fb-dd-filter').classList.remove('open');
      renderRecipeList();
    });
  });

  // ═════ Modal open/close ═════════════════════════════════
  window.closeModal = function() {
    document.body.classList.remove('modal-open');
    hideOverlay('overlay-fabricator');
  };
  // Arrow keys cycle through selectable recipes (skipping locked rows);
  // Enter crafts the current selection if craftable; Escape closes the
  // modal. Only active while the modal is open AND no dropdown is.
  window.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('modal-open')) return;
    if (document.querySelector('.fb-dd.open')) return;  // let dropdowns own keys
    if (e.key === 'Escape') { closeModal(); return; }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const selectable = filterRecipes(sortRecipes(RECIPES))
        .filter(r => recipeLockState(r) === 'available');
      if (selectable.length === 0) return;
      const curIdx = selectable.findIndex(r => r.id === FSTATE.selectedId);
      const dir    = e.key === 'ArrowDown' ? 1 : -1;
      const next   = (curIdx + dir + selectable.length) % selectable.length;
      FSTATE.selectedId = selectable[next].id;
      renderRecipeList();
      renderDetail();
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter') {
      const r = RECIPES.find(x => x.id === FSTATE.selectedId);
      if (r && canCraft(r)) { craftSelected(); e.preventDefault(); }
      return;
    }
  });

  // ═════ Entry point ════════════════════════════════════════
  // Called by cruise.js (bottom-row FABRICATOR button — see Phase 4
  // handoff notes on why this stayed a Stop Menu verb instead of moving
  // to a separate bottom-row button per the original plan). No onDone
  // callback: crafting applies its time cost immediately in
  // craftSelected() and claimOutput() grants STATE.items directly, so
  // there's nothing to hand back on close.
  window.openFabricator = function() {
    loadFabricatorData();
    bindFabricatorState();
    if (!RECIPES.find(r => r.id === FSTATE.selectedId)) FSTATE.selectedId = RECIPES[0] && RECIPES[0].id;
    renderAll();
    showOverlay('overlay-fabricator');
    document.body.classList.add('modal-open');
  };
})();
