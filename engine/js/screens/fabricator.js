'use strict';
/* ────────────────────────────────────────────────────────────────
   FABRICATOR OVERLAY — lifted from resources/demo-fabricator.html
   (Phase 4). Local demo-state object was named STATE in the source;
   renamed FSTATE throughout. FSTATE.stock/wear/broken are live
   references onto STATE.materials/STATE.fabricator (see the FSTATE
   literal's getters — materials mined/salvaged elsewhere are the
   same pool the fabricator spends). aboard/captainBg are recomputed
   fresh from STATE.crew/STATE.captain every time openFabricator()
   runs and after every craft day — see bindFabricatorState().
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
   Craft timing (owner ruling 27, 2026-10-12): the fabricator pays per
   day, as in the demo (demo-fabricator ~1790-1891). CRAFT spends the
   materials, the effort tax and the wear; then the job ticks one real
   day at a time (passDays(1) — the same daily drain as any other day:
   food / water / O2 / rations morale / deprivation / crop, with
   checkFailure after each) while the fabricator is open. The job is
   saved state (STATE.fabricator.craft, with daysDone), so a reload
   neither dodges nor repeats a day or an output. Closing the modal
   holds the job ("Long jobs need a still ship"); reopening resumes it.
   CANCEL refunds the materials and keeps the unspent days; a job
   cancelled before its first day costs nothing (tax + wear back too).
   The misfire roll is made when the job finishes (odds fixed at CRAFT
   from the wear before it). A job is never stopped by its own wear: one
   that takes the fab to 100% runs on and breaks it when it comes out.
   A job whose days are all spent comes out without another day. The
   deadline lock (hotfix e79a0b2) stands: a craft that would finish
   past STATE.baseDays can't start, and a held job that no longer fits
   waits instead of ticking into time_expired.
   Entry point: window.openFabricator(). No onDone callback needed —
   craftSelected() and claimOutput() already apply their effects to
   real STATE directly.
   ──────────────────────────────────────────────────────────────── */
(function() {
  'use strict';
  const $ = id => document.getElementById(id);

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
  // Where-to-get-it prose for the input hover (demo-fabricator MATERIALS
  // .source, parity pass 2026-10-11) — the hover used to print the raw
  // materials.json source ids ("mining · salvage"). Written against what
  // the engine actually grants (mining.js crate pools, cruise SALVAGE,
  // combat wreck loot, event `materials` outcomes, forage finds); no
  // station sells materials, so none of these lines says "buy".
  const MATERIAL_SOURCES = {
    metal:        'Mine asteroids · SALVAGE wrecks · pirate wreckage · derelict and asteroid finds.',
    scrap:        'Mine asteroids · pirate wreckage · derelict and wreck finds.',
    minerals:     'Mine asteroids — the main yield · asteroid finds · salt crystals on a forage.',
    exotic:       'Rare: rich asteroid veins · SALVAGE wrecks · anomaly and asteroid finds.',
    biocomponent: 'Rare in asteroid rock · planet, derelict and station finds · pirate wreckage.',
  };
  const RECIPE_PRESENTATION = {
    recipe_hull_patch:     { icon: '🛠️', sprite: 'sprites/cargo/items/hull_patch.png' },
    recipe_repair_kit:     { icon: '🧰', sprite: 'sprites/cargo/items/repair_kit.png' },
    recipe_crop_treatment: { icon: '💧', sprite: 'sprites/cargo/items/crop_treatment.png' },
    recipe_ration_brick:   { icon: '🧱', sprite: 'sprites/cargo/items/ration_brick.png' },
    recipe_o2_canister:    { icon: '🫧', sprite: 'sprites/cargo/items/o2_canister.png' },
    recipe_fuel_cell:      { icon: '🔋', sprite: 'sprites/cargo/items/fuel_cell.png' },
  };
  function prettyItemName(itemId) {
    const real = (typeof itemDef === 'function' && itemDef(itemId)) || (MOD.items || []).find(it => it.id === itemId || it.id === 'item_' + itemId);
    if (real) return real.name;
    return itemId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  // items.json gameplay_effect is player-facing text only (authoring
  // notes live in design_note, parity batch 2) — shown as written.
  function outputEffectText(itemId) {
    const def = (typeof itemDef === 'function' && itemDef(itemId)) || null;
    return (def && def.gameplay_effect) || '';
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
        source: MATERIAL_SOURCES[m.id] || '',
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

  // Who speeds the fabricator, and by how much (the effort the Bible §8
  // formula divides by). One source of truth: crew_roster.json
  // passive_skill.fabricator_contribution per role (engineer 25,
  // xenobiologist 5 — absent = 0) and captains.json
  // passive_effect.fabricator_contribution (engineer 12, academic 10),
  // both read on open (bindFabricatorState). name/role label the
  // speed tooltip's breakdown.
  const CREW = {
    osei:        { name:'Dr. Osei',    role:'Botanist',      fab:0 },
    kazuki:      { name:'Kazuki',      role:'Engineer',      fab:0 },
    vasquez:     { name:'Dr. Vasquez', role:'Medic',         fab:0 },
    reeves:      { name:'Reeves',      role:'Pilot',         fab:0 },
    reyes:       { name:'Reyes',       role:'Chef',          fab:0 },
    hargrove:    { name:'Hargrove',    role:'Diplomat',      fab:0 },
    tanaka:      { name:'Dr. Tanaka',  role:'Xenobiologist', fab:0 },
    captain_eng: { name:'Captain',     role:'Engineer bg.',  fab:12 },
    captain_aca: { name:'Captain',     role:'Academic bg.',  fab:10 }
  };
  // Baseline — the captain (player) always contributes this much,
  // independent of their chosen background. Engineer / Academic bg
  // adds its own bonus on top.
  const BASE_EFFORT = 10;

  // ═════ State ═══════════════════════════════════════════════
  // FSTATE.stock is a LIVE REFERENCE to the real STATE.materials pool —
  // the same materials MINE/SALVAGE grant are what the fabricator spends.
  // wear/broken AND the job in progress (craft) live on STATE.fabricator,
  // which is saved: a reload mid-craft resumes the same job at the same
  // day (ruling 27). aboard/captainBg are recomputed fresh on every open
  // from STATE.crew/STATE.captain — see bindFabricatorState(). The rest
  // (selection/sort/filter/pendingOutput) is local UI state as in the
  // demo; tripDay/arrivalDay mirror STATE.daysElapsed/baseDays.
  const FSTATE = {
    aboard: {},
    captainBg: 'none',
    get wear() { return STATE.fabricator.wear; },
    set wear(v) { STATE.fabricator.wear = v; },
    get broken() { return STATE.fabricator.broken; },
    set broken(v) { STATE.fabricator.broken = v; },
    get stock() { return STATE.materials; },
    // The job on the bed: { recipeId, daysTotal, daysDone, startDay,
    // misfireP, wearBefore, wearAdded, tax } — JSON only (it is saved).
    get craft() { return (STATE.fabricator && STATE.fabricator.craft) || null; },
    set craft(v) { STATE.fabricator.craft = v || null; },
    selectedId: 'hull_patch',
    sort: 'time',             // 'name' | 'time' | 'complexity'
    filter: 'all',            // 'all' | 'unlocked' | 'craftable'
    pendingOutput: null,
    tripDay:     0,
    arrivalDay:  0,
    msPerDay: 2000            // one fabricator day, real time (demo)
  };
  /* Refreshes the fields that must always reflect current reality —
     called every time the overlay opens (see window.openFabricator())
     and after every craft day: a day can kill or wound the engineer,
     and the next craft's time, wear and preview read the crew as it is. */
  const ROLE_OF = { botanist: 'osei', engineer: 'kazuki', medic: 'vasquez', pilot: 'reeves', chef: 'reyes', xenobiologist: 'tanaka', diplomat: 'hargrove' };
  function bindFabricatorState() {
    STATE.fabricator = STATE.fabricator || { wear: 0, broken: false };
    FSTATE.aboard = {};
    for (const role of STATE.crew) {
      const id = ROLE_OF[role];
      // Value = contribution share: a wounded specialist works at half
      // (crew_roster "halved if injured"), as everywhere else.
      if (id && CREW[id]) FSTATE.aboard[id] = (typeof specialistMult === 'function') ? (specialistMult(role) || 1) : 1;
    }
    // An engineer captain adds their half-strength hands only when no crew
    // engineer is aboard — the two don't stack (specialistMult already
    // floors a wounded crew engineer at the captain's half).
    FSTATE.captainBg = (STATE.captain === 'academic' || (STATE.captain === 'engineer' && !STATE.crew.includes('engineer'))) ? STATE.captain : 'none';
    for (const [role, id] of Object.entries(ROLE_OF)) {
      const def = (MOD.crew_roster || []).find(c => c.role === role || c.id === 'crew_' + role);
      const v = def && def.passive_skill && def.passive_skill.fabricator_contribution;
      CREW[id].fab = Number.isFinite(v) ? v : 0;
    }
    if (typeof captainPassive === 'function') {
      CREW.captain_eng.fab = captainPassive('fabricator_contribution', 'engineer') ?? CREW.captain_eng.fab;
      CREW.captain_aca.fab = captainPassive('fabricator_contribution', 'academic') ?? CREW.captain_aca.fab;
    }
    // The header is the real trip day: a craft's days pass for real, one
    // at a time (ruling 27), so there is nothing to replay on reopen.
    FSTATE.tripDay = STATE.daysElapsed;
    FSTATE.arrivalDay = STATE.baseDays;
  }

  // ═════ Unlock evaluation ═══════════════════════════════════
  // Returns one of:
  //   'available'    — fully unlocked (default OR satisfied)
  //   'locked-purchase' — needs a part aboard (recipes.json requires_item;
  //                       the engine's only lock — no crew-gated recipe exists)
  function recipeLockState(recipe) {
    if (recipe.unlock === 'default') return 'available';
    // fuel_cell / o2_canister need the Field Repair Fabricator (loot, or
    // the black market's back inventory).
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
      if (on) total += CREW[id].fab * on;
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

  // Wear a craft adds: engineer passive −20% (crew_roster
  // fabricator_wear_modifier; a captain engineer's own −10% from
  // captains.json), the field repair fabricator −10% (items.json).
  // Never below 0.5.
  // noKit: the same craft without the part's discount.
  function recipeWear(r, noKit) {
    const cut = typeof roleAmount === 'function' ? roleAmount('engineer', 'fabricator_wear_modifier', 'fabricator_wear_modifier', 0.8, true) : 0;
    const kit = !noKit && STATE.items.includes('repair_fabricator') ? 0.9 : 1;
    // Kept to a tenth: whole-number rounding ate the engineer's cut on
    // every 1–3% recipe (2 × 0.8 = 1.6 → 2).
    return Math.max(0.5, Math.round(r.wear * (1 - cut) * kit * 10) / 10);
  }

  // Material satisfaction — is every input satisfied by current stock?
  function hasMaterials(recipe) {
    return recipe.inputs.every(([mat, qty]) => (FSTATE.stock[mat] || 0) >= qty);
  }

  // recipes.json _meta misfire_curve: fabricator health → misfire odds
  // (100→0%, 80→2%, 60→8%, 40→18%, 20→35%, 10→55%, 0→80%), interpolated.
  const MISFIRE_CURVE = [[100, 0], [80, 0.02], [60, 0.08], [40, 0.18], [20, 0.35], [10, 0.55], [0, 0.80]];
  function misfireChance(wear) {
    const h = Math.max(0, Math.min(100, 100 - (wear || 0)));
    for (let i = 1; i < MISFIRE_CURVE.length; i++) {
      const [h0, p0] = MISFIRE_CURVE[i - 1], [h1, p1] = MISFIRE_CURVE[i];
      if (h >= h1) return p1 + (p0 - p1) * (h - h1) / (h0 - h1);
    }
    return 0.80;
  }
  window.fabMisfireChance = () => misfireChance(FSTATE.wear);

  // Fab-is-functional check. Broken = wear 100% OR hard toggle.
  function fabFunctional() {
    return !FSTATE.broken && FSTATE.wear < 100;
  }
  // A started print is never stopped by its own wear (demo: the wear lands
  // at CRAFT and the job runs on). A job that took the fab to 100% runs to
  // the end and the fab breaks when it comes out (completeCraft); only a
  // hard break holds it.
  function jobRuns() {
    const c = FSTATE.craft;
    return !!c && !FSTATE.broken && (c.wearBefore || 0) < 100;
  }

  // Can this recipe actually be crafted right now?
  // Days past the voyage deadline (STATE.baseDays) a craft would finish —
  // any overrun is the time_expired failure, so such a craft is locked.
  function overrunDays(recipe) {
    return (FSTATE.tripDay + actualDays(recipe.days)) - FSTATE.arrivalDay;
  }
  function canCraft(recipe) {
    if (recipeLockState(recipe) !== 'available') return false;
    if (!hasMaterials(recipe)) return false;
    if (!fabFunctional()) return false;
    if (FSTATE.craft) return false;       // one craft at a time
    if (overrunDays(recipe) > 0) return false; // would end the voyage (time_expired)
    return true;
  }

  // ═════ Crew contribution strip ═════════════════════════════
  // Tooltip surfaced on the TIME row. Lists crew ADDING fab speed;
  // the solo-captain ×1.0 baseline is implicit (it's the floor when
  // nobody is helping, not a "contribution"). TOTAL reads as the
  // overall speed multiplier.
  const escAttr = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  function crewAssistTooltip() {
    const pct = n => '+' + Math.round(n / BASE_EFFORT * 100) + '%';
    const lines = ['FAB SPEED BREAKDOWN'];
    let anyContributor = false;
    for (const [id, on] of Object.entries(FSTATE.aboard)) {
      if (!on) continue;
      const c = CREW[id];
      // Live names (a stowaway who joined keeps their own) + the wounded half.
      const role = Object.keys(ROLE_OF).find(r => ROLE_OF[r] === id);
      const nm = (role && typeof crewNameOf === 'function') ? crewNameOf(role) : c.name;
      if (c.fab > 0) { lines.push('  ' + nm + ' (' + c.role + ')  ' + pct(c.fab * on) + (on < 1 ? ' · wounded' : '')); anyContributor = true; }
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
      if (lock === 'locked-purchase') row.classList.add('locked-purchase');
      if (r.id === FSTATE.selectedId && lock === 'available') row.classList.add('selected');

      const name = document.createElement('span');
      name.className = 'fb-recipe-name';
      let nameHtml = r.name;
      // No $ (re-audit B8): every engine item lock is a loot-only part
      // (requires_item) — there is no blueprint to buy, so no buy glyph.
      if (lock === 'locked-purchase') nameHtml = '<span class="lock-glyph">🔒</span> ' + r.name;
      name.innerHTML = nameHtml;

      const days = document.createElement('span');
      days.className = 'fb-recipe-days';
      if (lock === 'locked-purchase') {
        days.textContent = r.unlock_note;
      } else {
        days.textContent = r.days + 'd';
      }

      row.appendChild(name);
      row.appendChild(days);

      row.addEventListener('click', () => {
        if (lock === 'locked-purchase') {
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
    // What the print does (items.json gameplay_effect, parity pass).
    const eff = outputEffectText(r.output.item);
    $('fb-detail-effect').textContent = eff ? '▸ ' + eff : '';

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
      // Hover tooltip (.ui-tip): material name + where to get it + stock.
      row.dataset.tipTitle = m.name.toUpperCase();
      row.dataset.tipDescription = m.source || '';
      row.dataset.tipRows = JSON.stringify([{ label: 'In cargo', value: String(have) }, { label: 'Needed', value: String(qty) }]);
      if (miss) row.dataset.tipTone = 'warn'; else delete row.dataset.tipTone;
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
      ? '<span class="bonus" data-tip-title="CREW ENGINEERING BONUS" data-tip-tone="good" data-tip-description="Reduces fab time by ' + timeSavedPct + '% on this recipe.">' +
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
        ' · <strong>' + overrunBy + 'd past the deadline</strong></div>'
      : '';

    // Wear threshold warning — will push wear past service or break.
    const postWear = Math.min(100, FSTATE.wear + recipeWear(r));
    let wearWarn = '';
    if (postWear >= 100) {
      wearWarn = '<div class="fb-warn wear-crit">⚠ Will break the fab (100% wear) · FAB SERVICE fixes it</div>';
    } else if (postWear >= 80 && FSTATE.wear < 80) {
      wearWarn = '<div class="fb-warn wear-warn">⚠ Will push wear to ' + Math.round(postWear) + '% · service soon</div>';
    }

    // WEAR and MISFIRE share one row (parity pass): with the misfire row,
    // a two-line description and a warning, the CRAFT button used to be
    // pushed out of the panel and clipped. The craft's effort tax rides
    // the same row (re-audit B7): a craft is a 1-pip FABRICATOR action,
    // every crew member pays it at CRAFT (none aboard: no tax, no cell).
    const assist = crewAssistTooltip().split('\n');
    const tax = typeof window.effortTax === 'function' ? window.effortTax(1) : 0;
    const taxCell = tax
      ? '<span class="label label-2" data-tip-title="EFFORT TAX" data-tip-description="Effort 1/5. Every crew member loses ' + tax + ' morale when the craft starts. Cancel before its first day and it comes back.">MORALE</span>' +
        '<span class="wear-add tax">−' + tax + ' each</span>'
      : '';
    meta.innerHTML =
      '<div class="row" data-tip-title="' + escAttr(assist[0]) + '" data-tip-description="' + escAttr(assist.slice(1).join('\n').trim()) + '">' +
        '<span class="label">TIME</span>' +
        timeDisplay +
        bonusSpan +
      '</div>' +
      overrunWarn +
      '<div class="row">' +
        '<span class="label">WEAR</span>' +
        '<span class="wear-add">+' + recipeWear(r) + '%</span>' +
        '<span class="label label-2" data-tip-title="MISFIRE" data-tip-description="Rolled when the print finishes. A misfire spends the days and materials. Wear raises the odds; FAB SERVICE at a station resets them.">MISFIRE</span>' +
        '<span class="wear-add">' + Math.round(misfireChance(FSTATE.wear) * 100) + '%</span>' +
        taxCell +
      '</div>' +
      wearWarn;

    // CRAFT button — enabled only if canCraft() true. Every label fits
    // one line (re-audit A7); the reason in full goes to the tooltip.
    const btn = $('fb-craft-btn');
    const lock = recipeLockState(r);
    let label = 'CRAFT', why = '';
    btn.classList.toggle('busy', !!FSTATE.craft); // Wait cursor while a craft passes days
    if (lock === 'locked-purchase') {
      const need = r.unlock.slice(5);
      const d = typeof itemDef === 'function' ? itemDef(need) : null;
      label = 'LOCKED · ' + (d && (d.item_behavior || []).includes('upgrade') ? 'NEEDS UPGRADE' : 'NEEDS PART');
      why = 'Needs a ' + prettyItemName(need) + ' aboard.';
    } else if (!fabFunctional() && !jobRuns()) {
      label = 'FAB BROKEN'; why = 'FAB SERVICE at a station fixes it.';
    } else if (!hasMaterials(r)) {
      label = 'MISSING MATERIALS';
    } else if (FSTATE.craft) {
      label = 'IN PROGRESS…'; why = 'One print at a time.';
    } else if (overrunDays(r) > 0) {
      label = 'PAST DEADLINE'; why = 'It would finish ' + overrunDays(r) + 'd after the voyage deadline.';
    }
    btn.classList.toggle('locked', label !== 'CRAFT');
    btn.textContent = label;
    if (why) { btn.dataset.tipTitle = label; btn.dataset.tipDescription = why; }
    else { delete btn.dataset.tipTitle; delete btn.dataset.tipDescription; }
    fitDetail();
  }

  // Demo sizes by default (art 220, CRAFT 41…, re-audit B1). Only when
  // this recipe's panel would push CRAFT out (a two-line description +
  // the effect line + warnings) does it tighten: first the panel's own
  // spacing (.fit-tight), then the art (.fit-small, 192).
  function fitDetail() {
    const right = document.querySelector('#overlay-fabricator .fb-right');
    const det = $('fb-detail');
    if (!right || !det) return;
    const was = right.className;
    right.classList.remove('fit-tight', 'fit-small');
    const over = () => det.scrollHeight > det.clientHeight + 1;
    if (over()) right.classList.add('fit-tight');
    if (over()) right.classList.add('fit-small');
    if (right.className !== was) setFabFrame(currentFrame);
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
  let currentFrame = 'idle';
  function setFabFrame(name) {
    const f = FAB_FRAMES[name]; if (!f) return;
    currentFrame = name;
    const h = parseFloat(getComputedStyle($('fb-slot')) // scoped token (overlay, not :root)
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
    const broken = !fabFunctional() && !jobRuns();
    overlay.classList.toggle('hidden', broken);
    if (!broken) {
      const lit = Math.ceil(Math.max(0, 100 - FSTATE.wear) / 10);
      const segs = overlay.querySelectorAll('.fb-wear-seg');
      segs.forEach((seg, i) => seg.classList.toggle('lit', i < lit));
    }

    // Unit slot class + sprite frame.
    const slotEl = $('fb-slot');
    slotEl.classList.remove('state-idle', 'state-busy', 'state-done', 'state-broken');

    if (broken) {
      slotEl.classList.add('state-broken');
      stopRunAnim();
      setFabFrame('broken');
    } else if (FSTATE.craft && !heldReason()) {
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
  // CRAFT → spend the materials, the effort tax and the wear, put the job
  // on the bed (saved) and start the day clock. One craft at a time.
  const fabLog = m => { if (typeof window.pushCruiseLog === 'function') window.pushCruiseLog('◆ ' + m); };
  const dWord = n => n + (n === 1 ? ' day' : ' days');
  window.craftSelected = function() {
    const r = RECIPES.find(x => x.id === FSTATE.selectedId);
    if (!r || !canCraft(r)) return;

    // Auto-claim any unclaimed output from the last craft so the
    // output bay is clear before this one finishes. If the hold is too
    // full to claim it (capacity enforcement), refuse the new craft —
    // otherwise the new output would clobber the unclaimed one.
    clearFabNotice();
    autoClaimIfPending();
    if (FSTATE.pendingOutput) return; // claim refused — fabNotice says why

    // Deduct materials — real STATE.materials via the FSTATE.stock live ref.
    for (const [mat, qty] of r.inputs) {
      FSTATE.stock[mat] = Math.max(0, (FSTATE.stock[mat] || 0) - qty);
    }
    // Effort tax (Bible): a craft is a FABRICATOR action — its pip costs
    // morale. The receipt says what each member paid (a job cancelled
    // before its first day gets exactly that back).
    const tax = {};
    if (typeof window.payEffortTax === 'function') window.payEffortTax(1, tax);
    // Wear lands at CRAFT (the fab spins up); the misfire odds are read
    // from the wear before it and rolled when the print comes out.
    const wearBefore = FSTATE.wear;
    FSTATE.wear = Math.min(100, Math.round((FSTATE.wear + recipeWear(r)) * 10) / 10);
    // The field repair fabricator's −10% is the part's: a job whose part
    // leaves the ship before the print comes out pays it back then.
    const partWear = Math.round((recipeWear(r, true) - recipeWear(r)) * 10) / 10;
    FSTATE.craft = {
      recipeId:  r.id,
      daysTotal: actualDays(r.days),
      daysDone:  0,
      startDay:  STATE.daysElapsed,
      misfireP:  misfireChance(wearBefore),
      wearBefore,
      wearAdded: Math.round((FSTATE.wear - wearBefore) * 10) / 10,
      partWear,
      tax,
    };
    // Saved now: the materials and tax are spent, the job is on the bed —
    // a reload resumes it (it can't re-roll or dodge anything).
    if (typeof saveRun === 'function') saveRun();
    renderHUD();
    startCraftClock(true);
    renderAll();
    updateProgressUI(); // the strip (and CANCEL's tooltip) at day 0

    // AI commentary on craft start (fabricator_events pool, previously
    // unconsumed) — lands in the cruise AI log behind the overlay.
    if (typeof window.pushCruiseLog === 'function') {
      const pool = MOD.flavor && MOD.flavor.ai_universal && MOD.flavor.ai_universal.fabricator_events
        && MOD.flavor.ai_universal.fabricator_events.craft_started;
      const lines = pool && pool[STATE.activeAI];
      if (Array.isArray(lines) && lines.length) window.pushCruiseLog('◆ ' + lines[Math.floor(Math.random() * lines.length)]);
    }
  };

  /* The day clock (demo scheduleNextTick/advanceCraftDay, but the days
     are real): runs only while the fabricator is open, the game isn't
     paused, the run isn't over and the fab works. Every msPerDay of
     running time is one day — passDays(1), then checkFailure, then the
     job's daysDone, saved. A held job keeps its partial day. */
  let clockTimer = 0, clockLast = 0, clockAcc = 0, rafId = 0;
  function overlayOpen() { const o = $('overlay-fabricator'); return !!(o && o.classList.contains('active')); }
  // Why the job can't advance right now (null: it can). Shown on the strip.
  function heldReason() {
    const c = FSTATE.craft;
    if (!c) return null;
    if (c.daysDone >= c.daysTotal) return null; // all its days spent: it only has to come out
    if (!jobRuns()) return 'FAB BROKEN';
    if (STATE.daysElapsed + 1 > STATE.baseDays) return 'PAST DEADLINE';
    return null;
  }
  function clockRunning() {
    return !!FSTATE.craft && overlayOpen() && !STATE.ended && !(window.PauseBus && PauseBus.paused) && !heldReason();
  }
  function startCraftClock(fresh) {
    stopCraftClock();
    if (!FSTATE.craft) return;
    if (fresh) clockAcc = 0;
    clockLast = performance.now();
    const step = () => {
      clockTimer = 0;
      const c = FSTATE.craft;
      if (!c) return;
      const now = performance.now();
      if (clockRunning()) clockAcc += now - clockLast;
      clockLast = now;
      if (clockAcc >= FSTATE.msPerDay) { clockAcc = 0; craftDay(); if (!FSTATE.craft) return; }
      if (!overlayOpen() || STATE.ended) return; // held until the fabricator reopens
      clockTimer = setTimeout(step, 50);
    };
    clockTimer = setTimeout(step, 50);
    startProgressLoop();
  }
  function stopCraftClock() {
    clearTimeout(clockTimer); clockTimer = 0;
    stopProgressLoop();
  }
  window.fabSetDayMs = ms => { FSTATE.msPerDay = Math.max(20, ms | 0); }; // tests: a faster day
  window.fabCraftState = () => FSTATE.craft && Object.assign({ held: heldReason(), running: clockRunning() }, FSTATE.craft);

  // One day of the job, for real.
  function craftDay() {
    const c = FSTATE.craft;
    if (!c || heldReason()) return;
    // Every day already spent: the print comes out, no further day.
    if (c.daysDone >= c.daysTotal) { completeCraft(); return; }
    c.daysDone++;
    passDays(1); // the orders daily-drain helper — same as any other day
    renderHUD();
    bindFabricatorState(); // the crew as the day left it (a dead engineer stops speeding the next print)
    const dEl = $('fb-trip-day');
    dEl.textContent = FSTATE.tripDay;
    dEl.classList.remove('ticking');
    void dEl.offsetWidth;
    dEl.classList.add('ticking');
    renderHeader();
    // The last day's print comes out before the failure check: a day that
    // ends the run (deprivation, mutiny, crop death…) still finished the
    // job, and a resumable failure (Keep flying) saves the print owed in
    // the bay, not a spent job that would charge another day. An
    // unfinished job stays on the bed (saved state) and resumes.
    if (c.daysDone >= c.daysTotal) completeCraft();
    if (checkFailure()) { stopCraftClock(); return; }
    if (!FSTATE.craft) return;
    renderDetail(); // TIME / deadline lock / wear preview off the live crew
    updateProgressUI();
    if (typeof saveRun === 'function') saveRun();
  }

  function startProgressLoop() {
    stopProgressLoop();
    const tick = () => {
      rafId = 0;
      if (!FSTATE.craft || !overlayOpen()) return;
      updateProgressUI();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }
  function stopProgressLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // The strip shows the real days passed (daysDone) and the part-day the
  // clock has run; a held job says why.
  function updateProgressUI() {
    const c = FSTATE.craft;
    if (!c) return;
    const r = RECIPES.find(x => x.id === c.recipeId);
    const prog = $('fb-progress');
    prog.classList.add('active');
    $('fb-progress-item').textContent = r ? r.output.name.toUpperCase() : '';
    const held = heldReason();
    prog.classList.toggle('held', !!held);
    const part = held ? 0 : Math.min(0.999, clockAcc / FSTATE.msPerDay);
    $('fb-progress-fill').style.width = Math.min(100, (c.daysDone + part) / c.daysTotal * 100) + '%';
    $('fb-progress-days').textContent = c.daysDone + 'd / ' + c.daysTotal + 'd' + (held ? ' · ' + held : '');
    const cancel = $('fb-progress-cancel');
    cancel.dataset.tipDescription = c.daysDone
      ? 'Refunds the materials. The ' + dWord(c.daysDone) + ' already spent stay spent, and so do the wear and the morale.'
      : 'Nothing has been spent yet: the materials, the morale and the wear all come back.';
  }

  // Cancel the job on the bed (ruling 27): the materials come back and
  // the days not yet spent stay yours. Before its first day it costs
  // nothing at all (tax and wear back too); after, the days, wear and
  // tax already paid stay paid. No output.
  window.cancelCraft = function() {
    const c = FSTATE.craft;
    if (!c) return;
    const r = RECIPES.find(x => x.id === c.recipeId);
    const back = {};
    if (r) for (const [mat, qty] of r.inputs) back[mat] = (back[mat] || 0) + qty;
    // The materials take hold space again: refuse rather than lose any.
    if (typeof window.materialLandings === 'function') {
      const land = window.materialLandings(back);
      if (Object.entries(back).some(([m, q]) => (land[m] || 0) < q)) {
        fabNotice('HOLD FULL', 'No room for the materials to come back. Make room in the hold, then cancel.', 'warn');
        return;
      }
    }
    // Back aboard like any material grant: NEW badge, newest in the Recent order.
    if (typeof window.grantMaterials === 'function') window.grantMaterials(back, { quiet: true });
    else for (const [mat, qty] of Object.entries(back)) FSTATE.stock[mat] = (FSTATE.stock[mat] || 0) + qty;
    const free = !c.daysDone;
    if (free) {
      if (typeof window.refundEffortTax === 'function') {
        const rc = {};
        for (const [role, paid] of Object.entries(c.tax || {})) if (STATE.crew.includes(role)) rc[role] = paid;
        window.refundEffortTax(rc);
      }
      FSTATE.wear = Math.max(0, Math.round((FSTATE.wear - (c.wearAdded || 0)) * 10) / 10);
    }
    stopCraftClock();
    FSTATE.craft = null; STATE.fabricator.owedOutput = null;
    fabLog('FABRICATOR — ' + (r ? r.name : 'print') + ' cancelled' + (free ? ' before it started. Nothing spent.' : ' after ' + dWord(c.daysDone) + '. The materials are back in the hold; the days are gone.'));
    // Portrait back to idle; kill anim.
    const slot = $('fb-slot');
    slot.classList.remove('state-busy', 'state-done');
    slot.classList.add('state-idle');
    stopRunAnim();
    setFabFrame('idle');
    setProgressIdle();
    renderHUD();
    renderAll();
    if (typeof saveRun === 'function') saveRun();
  };

  // Drop the progress strip back to its muted idle look.
  function setProgressIdle() {
    const prog = $('fb-progress');
    prog.classList.remove('active', 'held');
    $('fb-progress-item').textContent = 'IDLE';
    $('fb-progress-days').textContent = '—';
    $('fb-progress-fill').style.width = '0%';
  }

  // The last day is done: the print comes out — or, on the misfire roll
  // (odds fixed at CRAFT), slag or a piece of surplus.
  function completeCraft() {
    const c = FSTATE.craft;
    const r = RECIPES.find(x => x.id === c.recipeId);
    stopCraftClock();
    FSTATE.craft = null;
    $('fb-progress-days').textContent = c.daysTotal + 'd / ' + c.daysTotal + 'd';
    $('fb-progress-fill').style.width = '100%';
    FSTATE.tripDay = STATE.daysElapsed;
    $('fb-trip-day').textContent = FSTATE.tripDay;
    setProgressIdle();
    const slot = $('fb-slot');
    stopRunAnim();
    setFabFrame('idle');
    // The part's wear discount left with the part (see craftSelected).
    if (c.partWear && !STATE.items.includes('repair_fabricator')) {
      FSTATE.wear = Math.min(100, Math.round((FSTATE.wear + c.partWear) * 10) / 10);
      fabLog('FABRICATOR — no Field Repair Fabricator aboard to ease the print: +' + c.partWear + '% wear.');
    }
    // A print that took the fab to 100% ran to the end; now the fab breaks.
    const wornOut = () => {
      if (FSTATE.broken || FSTATE.wear < 100) return;
      breakFab();
      fabNotice('FAB BROKEN', 'The print wore the fabricator out. FAB SERVICE at a station fixes it.', 'danger');
    };
    if (!r) { wornOut(); renderAll(); if (typeof saveRun === 'function') saveRun(); return; }
    const out = r.output;

    if (Math.random() < (c.misfireP || 0)) {
      // A misfire spends the time and materials: ~85% waste, ~15%
      // fab_surplus (the Surplus Collector buys it); below 20% health it
      // can also break the fabricator outright.
      const lines = MOD.flavor && MOD.flavor.fabricator_misfire_descriptions;
      const line = Array.isArray(lines) && lines.length ? lines[Math.floor(Math.random() * lines.length)] + ' ' : '';
      const dw = dWord(c.daysTotal);
      if (Math.random() < 0.15 && typeof grantItem === 'function' && grantItem('fab_surplus')) {
        fabLog('MISFIRE — ' + line + 'No ' + out.name + '; a piece of Fabricator Surplus instead. (' + dw + ', materials spent.)');
        fabNotice('MISFIRE', 'No ' + out.name + ' — a piece of Fabricator Surplus instead. ' + dw + ', materials spent.', 'warn');
      } else {
        fabLog('MISFIRE — ' + line + 'The ' + out.name + ' comes out as slag. ' + dw + ' and the materials, gone.');
        fabNotice('MISFIRE', 'The ' + out.name + ' came out as slag. ' + dw + ' and the materials, gone.', 'danger');
      }
      if (typeof window.pushAiSample === 'function') window.pushAiSample('fabricator_misfire');
      if (100 - (c.wearBefore || 0) < 20 && Math.random() < 0.5) { breakFab(); fabNotice('MISFIRE — FAB BROKEN', 'The misfire took the fabricator with it. FAB SERVICE at a station fixes it.', 'danger'); }
      wornOut();
      renderHUD();
      renderAll();
      if (typeof saveRun === 'function') saveRun();
      return;
    }

    // Owed from this moment (saved): the finished print waits in the bay
    // until it's claimed — a reload brings it back there.
    STATE.fabricator.owedOutput = r.id;
    // Brief done-flash on the fab slot, held on the idle frame.
    slot.classList.remove('state-busy', 'state-idle');
    slot.classList.add('state-done');
    // Floating badge — still fires briefly as a celebration flourish.
    const badge = $('fb-badge');
    badge.textContent = '+' + out.count + ' ' + out.name.toUpperCase();
    badge.classList.remove('fire');
    void badge.offsetWidth;
    badge.classList.add('fire');
    // Park the finished item in the output slot — sits there pulsing +
    // floating until the player clicks to claim (moves to cargo).
    showOutputItem(r);
    wornOut();
    if (typeof saveRun === 'function') saveRun();
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
    slot.dataset.tipTitle = 'CLAIM';
    slot.dataset.tipDescription = recipe.output.count + '× ' + recipe.output.name + ' → cargo';
    slot.classList.add('ready');
  }
  window.claimOutput = function(animated = true) {
    if (!FSTATE.pendingOutput) return;
    const r = FSTATE.pendingOutput;
    // Capacity check (audit fix): a full hold leaves the print in the
    // output bay — pendingOutput stays set, so the player can jettison
    // something (INV) and claim again. Nothing is silently lost. A trial
    // fit first, then the print comes aboard through grantItem like any
    // other pickup (NEW badge, Recent order, values — b4 audit).
    const fits = (() => {
      if (typeof window.cargoSlotsUsed !== 'function') return true;
      for (let i = 0; i < r.output.count; i++) STATE.items.push(r.output.item);
      const ok = cargoSlotsUsed() <= cargoCapacity();
      STATE.items.length -= r.output.count;
      return ok;
    })();
    if (!fits) {
      if (typeof window.pushCruiseLog === 'function') {
        window.pushCruiseLog('◆ FABRICATOR — output ready but the hold is full. Make room, then claim it.');
      }
      // In-modal too (parity pass): the log line sat behind the modal.
      fabNotice('HOLD FULL', 'The ' + r.output.name + ' stays in the output bay. Make room in the hold, then claim it.', 'warn');
      return;
    }
    for (let i = 0; i < r.output.count; i++) {
      if (typeof grantItem === 'function') grantItem(r.output.item); else STATE.items.push(r.output.item);
    }
    FSTATE.pendingOutput = null;
    STATE.fabricator.owedOutput = null;
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
        delete slot.dataset.tipTitle; delete slot.dataset.tipDescription;
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
      stopCraftClock();
      FSTATE.craft = null; STATE.fabricator.owedOutput = null; // broken — nothing owed
      setProgressIdle();
    }
  }

  // In-modal notice strip over the fab unit (parity pass 2026-10-11): a
  // misfire or a refused claim used to report only to the cruise log,
  // hidden behind the modal. Stays up until the next craft / close.
  let noticeTimer = 0;
  function fabNotice(title, text, tone) {
    const n = $('fb-notice');
    if (!n) return;
    n.className = 'fb-notice show tone-' + (tone || 'warn');
    n.innerHTML = '<span class="fb-notice-title"></span><span class="fb-notice-text"></span>';
    n.firstChild.textContent = title;
    n.lastChild.textContent = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(clearFabNotice, 6000);
  }
  function clearFabNotice() {
    clearTimeout(noticeTimer);
    const n = $('fb-notice'); if (n) n.classList.remove('show');
  }
  window.fabNoticeText = () => { const n = $('fb-notice'); return n && n.classList.contains('show') ? n.textContent : ''; };

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
  window.closeFabricator = function() {
    clearFabNotice();
    document.body.classList.remove('modal-open');
    hideOverlay('overlay-fabricator');
    // A job on the bed holds while the fabricator is closed (ruling 27:
    // it needs a still ship and someone watching it). Say so once.
    if (FSTATE.craft && !STATE.ended) {
      stopCraftClock();
      const c = FSTATE.craft, r = RECIPES.find(x => x.id === c.recipeId);
      fabLog('FABRICATOR — ' + (r ? r.name : 'the print') + ' held at day ' + c.daysDone + ' of ' + c.daysTotal + '. Open the fabricator to finish it.');
      if (typeof saveRun === 'function') saveRun();
    }
    // A craft spent days and materials — repaint the hub (day counter,
    // HUD) and autosave through it, and re-gate an open Stop menu.
    if (typeof window.renderCruise === 'function' && !STATE.ended &&
        document.getElementById('screen-cruise').classList.contains('active')) {
      window.renderCruise();
      if (typeof window.refreshStopMenu === 'function') window.refreshStopMenu();
    }
  };
  // Arrow keys cycle through selectable recipes (skipping locked rows);
  // Enter crafts the current selection if craftable; Escape closes the
  // modal. Only active while the modal is open AND no dropdown is.
  window.addEventListener('keydown', (e) => {
    // Gate on the fabricator's OWN overlay — body.modal-open is shared
    // with the growbay/orders, so Enter there used to craft here, hidden.
    if (!document.getElementById('overlay-fabricator').classList.contains('active')) return;
    if (document.querySelector('.fb-dd.open')) return;  // let dropdowns own keys
    if (e.key === 'Escape') { closeFabricator(); return; }

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
  // callback: each craft day is passed (and saved) as it happens and
  // claimOutput() grants the print through grantItem, so there's nothing
  // to hand back on close.
  // Load-time teardown (index.html teardownLiveUI): stop the replaced
  // run's clock; the loaded run's job (STATE.fabricator.craft) or
  // finished print (owedOutput) comes back on open.
  window.abortFabricator = function () {
    stopCraftClock(); clockAcc = 0;
    FSTATE.pendingOutput = null;
    const prog = document.getElementById('fb-progress'); if (prog) prog.classList.remove('active', 'held');
    const slot = document.getElementById('fb-output-slot'); if (slot) slot.classList.remove('ready');
  };

  window.openFabricator = function() {
    loadFabricatorData();
    bindFabricatorState();
    if (FSTATE.craft && !RECIPES.find(r => r.id === FSTATE.craft.recipeId)) FSTATE.craft = null; // a recipe gone from the data
    // A finished print from before a reload/load waits in the output bay.
    const owed = STATE.fabricator.owedOutput;
    if (owed && !FSTATE.craft && !FSTATE.pendingOutput) {
      const r = RECIPES.find(r => r.id === owed);
      if (r) showOutputItem(r); else STATE.fabricator.owedOutput = null;
    }
    if (!RECIPES.find(r => r.id === FSTATE.selectedId)) FSTATE.selectedId = RECIPES[0] && RECIPES[0].id;
    if (!FSTATE.craft) setProgressIdle();
    renderAll();
    showOverlay('overlay-fabricator');
    document.body.classList.add('modal-open');
    // A job whose days are all spent (an older save) comes out now, no
    // further day; a held job picks up where it stopped (its part-day included).
    if (FSTATE.craft && FSTATE.craft.daysDone >= FSTATE.craft.daysTotal) completeCraft();
    else if (FSTATE.craft) { updateProgressUI(); startCraftClock(false); }
  };
})();
