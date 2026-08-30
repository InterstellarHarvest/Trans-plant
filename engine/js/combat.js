'use strict';
/* ────────────────────────────────────────────────────────────────
   SHIP-TO-SHIP COMBAT — ported from resources/demo-combat.html per
   resources/COMBAT_SYSTEM_HANDOFF.md + GAME_BIBLE.md §13.

   Combat is an in-place mode swap on #screen-encounter: the choice
   column becomes the combat action panel, the narrative panel
   becomes the AI combat log, the AI bar keeps working as-is. It is
   triggered by three choice-level hijack fields checked in
   handleChoiceClick() (index.html) before normal layer navigation:
     triggerCombat: true        → window.triggerCombat(choice)
     triggerRamResolve: true    → window.triggerRamResolve(choice)
     triggerFleeResolve: true   → window.triggerFleeResolve(choice)
   See CLAUDE.md's layered Event Module section for the choice schema.

   Scope cuts vs. the demo (documented, not hidden — see
   ENGINE_INTEGRATION_HANDOFF.md Phase 5 for the full rationale):
   - No canvas FX (laser beams/particles/crosshair) and no subject
     sprite frame — Phase 3 never built one (no NPC portrait art
     exists yet). Hit feedback is a CSS flash/shake on the screen
     itself instead of sprite-targeted classes.
   - No click-to-target: the demo's click coordinates never affected
     hit/damage math anyway (purely cosmetic beam endpoints). FIRE
     LASER auto-resolves through a brief TARGETING state instead of
     waiting for a viewport click.
   - No separate end-of-combat modal card / loot tile grid. Combat
     resolution reuses renderOutcomeView() — the same terminal screen
     every other encounter choice already lands on — with loot
     described as text and routed into real STATE (materials/items/
     gold) via the existing applyOutcomeEffects() pipeline.
   - No "injured" crew mechanic — the engine has zero support for it
     even in the flat schema (applyOutcomeEffects only implements
     crew_effect.type === 'kill'). Only crew death is modeled.
   - Bonus salvage crate pool trimmed to items that exist in
     items.json/materials.json (dropped invented circuit-board/O2-
     tank drops) — same "don't invent content" rule Phase 4 applied
     to Fabricator's recipe list.
   - AI_FALLBACK is NOT deduplicated into shared.js (the plan's
     original suggestion) — that object only ever existed in the two
     now-frozen demo files, never in the engine. A small local
     fallback below covers the one place the engine actually needs it.

   Load-order note: this file loads via <script src> before
   index.html's inline script has declared MOD/STATE. Everything below
   is scoped inside the IIFE and only reads MOD/STATE/STATE-adjacent
   engine globals (applyOutcomeEffects, renderHUD, checkFailure,
   renderEncounterState, renderOutcomeView, clamp) inside function
   bodies invoked later — never at top-level/parse time.
   ──────────────────────────────────────────────────────────────── */
(function () {

  const AI_FALLBACK = {
    aria: 'Everything is going wonderfully.',
    marv: "I've calculated the odds. Please don't ask.",
    rex:  'Weapons on standby. Just in case.',
    chip: 'Before proceeding, have you considered our premium support tier?',
    ajoy: 'There is a path here you have not yet considered.'
  };

  function combatLine(slot) {
    const pools = MOD.flavor && MOD.flavor.combat_log && MOD.flavor.combat_log[slot];
    const pool = pools && pools[COMBAT.ai];
    if (pool && pool.length) return pick(pool);
    return AI_FALLBACK[COMBAT.ai] || '...';
  }

  const COMBAT_CONFIG = {
    base_hp: 50,
    player_hp_max: 100,
    player_damage: { min: 10, max: 15 },
    enemy_damage:  { min: 12, max: 18 },
    surrender_threshold: 0.30,
    ftl_charge_turns: 3,
    crit_chance_base: 0.08,
    crit_damage_mul:  1.6,
    enemy_retreat_chance: 0.30,
    pirate_species_hp: {
      human: 1.00, insect: 0.90, rock: 1.30, water: 0.95,
      reptile: 1.05, robot: 1.10, unknown: 1.00
    },
    trail_scaling: {
      lunar:        { hp: 0.85, dmg: 0.85 },
      mars:         { hp: 1.00, dmg: 1.00 },
      interstellar: { hp: 1.25, dmg: 1.15 }
    },
    surrenders: {
      human: true, reptile: true, water: true, robot: true, unknown: true,
      insect: false, rock: false
    },
    crew_bonuses: {
      pilot:         { evade_full_dodge: 0.25, ftl_turns_override: 2 },
      engineer:      { hull_patch_pct: 0.25 },
      medic:         { defeat_death_reduction: 0.20 },
      botanist:      { tribute_success: 0.40, tribute_food_cost: 5, morale_on_success: 3 },
      chef:          { tribute_success: 0.25, tribute_food_cost: 3, morale_on_success: 5 },
      diplomat:      { surrender_chance_bonus: 0.15, opening_dmg_reduction: 0.25 },
      xenobiologist: { identify_enemy: true, fire_dmg_bonus: 0.10, crit_bonus_on_identify: 0.04 },
      veteran:       { fire_dmg_bonus_flat: 0.15, surrender_chance_bonus: 0.10, crit_bonus: 0.05 },
      merchant:      { salvage_bonus_rolls: 1 }
    },
    captain_bonuses: {
      pilot:         { evade_full_dodge: 0.12, ftl_turns_override: 2 },
      engineer:      { hull_patch_pct: 0.12 },
      medic:         { defeat_death_reduction: 0.10 },
      botanist:      { tribute_success: 0.20, tribute_food_cost: 5, morale_on_success: 3 },
      chef:          { tribute_success: 0.12, tribute_food_cost: 3, morale_on_success: 3 },
      diplomat:      { surrender_chance_bonus: 0.08, opening_dmg_reduction: 0.12 },
      xenobiologist: { identify_enemy: true, fire_dmg_bonus: 0.05, crit_bonus_on_identify: 0.02 },
      veteran:       { fire_dmg_bonus_flat: 0.07, surrender_chance_bonus: 0.05, crit_bonus: 0.02 },
      merchant:      { salvage_bonus_rolls: 0.5 }
    }
  };

  // Combat state — separate from STATE so it doesn't leak into the
  // encounter schema. Reconciled back into real STATE (hull/morale
  // delta, gold, materials, items, crew) in endCombatToOutcome().
  const COMBAT = {
    active: false,
    // IDLE / PLAYER_TURN / TARGETING / ENEMY_TURN(implicit) / FTL_CHARGING /
    // SURRENDER_DECISION / MUTINY / END
    state: 'IDLE',
    turn: 1,
    ai: 'marv',
    species: 'human',
    trail: 'mars',
    crew: {},
    captainBg: '',
    player: { hull: 100, hullMax: 100, morale: 50 },
    enemy: { hull: 50, hullMax: 50, alive: true, surrendered: false, surrenderOffered: false, hpMod: 1.0, dmgMod: 1.0 },
    ftlCharge: -1,
    hullPatchUsed: false,
    tributeUsed: false,
    openingTurn: true,
    evadingNextHit: false,
    identifiedByXeno: false,
    _firing: false,
    _lastOutcome: null,
    _narrPrefix: null,
    _ftlTickTimer: null
  };

  const irand = (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1));
  const pick  = arr => arr[Math.floor(Math.random() * arr.length)];

  function speciesHpMod(species) {
    if (species === 'unknown') return COMBAT_CONFIG.pirate_species_hp.unknown * (1 + (Math.random() - 0.5) * 0.4);
    return COMBAT_CONFIG.pirate_species_hp[species] || 1.0;
  }
  function bonus(key) {
    let total = 0;
    for (const role of Object.keys(COMBAT.crew)) {
      if (!COMBAT.crew[role]) continue;
      const b = COMBAT_CONFIG.crew_bonuses[role];
      if (b && typeof b[key] === 'number') total += b[key];
    }
    if (COMBAT.captainBg) {
      const cb = COMBAT_CONFIG.captain_bonuses[COMBAT.captainBg];
      if (cb && typeof cb[key] === 'number') total += cb[key];
    }
    return total;
  }
  function flagBonus(key) {
    for (const role of Object.keys(COMBAT.crew)) {
      if (COMBAT.crew[role] && COMBAT_CONFIG.crew_bonuses[role] && COMBAT_CONFIG.crew_bonuses[role][key]) return true;
    }
    if (COMBAT.captainBg) {
      const cb = COMBAT_CONFIG.captain_bonuses[COMBAT.captainBg];
      if (cb && cb[key]) return true;
    }
    return false;
  }
  function ftlTurns() {
    return (COMBAT.crew.pilot || COMBAT.captainBg === 'pilot') ? 2 : COMBAT_CONFIG.ftl_charge_turns;
  }
  function critChance() {
    let total = COMBAT_CONFIG.crit_chance_base;
    if (COMBAT.crew.veteran) total += COMBAT_CONFIG.crew_bonuses.veteran.crit_bonus;
    if (COMBAT.captainBg === 'veteran') total += COMBAT_CONFIG.captain_bonuses.veteran.crit_bonus;
    if (COMBAT.identifiedByXeno) {
      if (COMBAT.crew.xenobiologist) total += COMBAT_CONFIG.crew_bonuses.xenobiologist.crit_bonus_on_identify;
      else if (COMBAT.captainBg === 'xenobiologist') total += COMBAT_CONFIG.captain_bonuses.xenobiologist.crit_bonus_on_identify;
    }
    if (COMBAT.player.morale >= 90) total += 0.05;
    else if (COMBAT.player.morale >= 75) total += 0.03;
    return total;
  }
  function playerMissChance() {
    const m = COMBAT.player.morale;
    if (m >= 70) return 0;
    if (m >= 40) return 0.05;
    if (m >= 20) return 0.15;
    return 0.25;
  }

  /* ── Rendering ──────────────────────────────────────────────── */
  function setNarrCombat(title, body, secondary) {
    document.getElementById('enc-narr-title').textContent = title;
    document.getElementById('enc-narr-body').innerHTML = body + (secondary ? `<br><span style="opacity:0.75;font-size:0.92em;">${secondary}</span>` : '');
  }
  function setAiCombat(text) {
    document.getElementById('enc-ai-name').textContent = COMBAT.ai.toUpperCase();
    document.getElementById('enc-ai-text').textContent = text;
    document.getElementById('enc-ai-bar').classList.remove('hidden');
  }
  function setTurnIndicator(label, cls) {
    const el = document.getElementById('combat-turn-indicator');
    if (!el) return;
    el.textContent = label;
    el.style.display = '';
    el.classList.remove('your-turn', 'enemy-turn');
    el.classList.add(cls);
  }
  function hideTurnIndicator() {
    const el = document.getElementById('combat-turn-indicator');
    if (el) el.style.display = 'none';
  }
  function setActionsLocked(locked) {
    const wrap = document.getElementById('enc-choices');
    if (wrap) wrap.classList.toggle('combat-locked', !!locked);
  }
  function showYourTurn()  { setTurnIndicator('YOUR TURN', 'your-turn'); setActionsLocked(false); }
  function showEnemyTurn() { setTurnIndicator("ENEMY'S TURN", 'enemy-turn'); setActionsLocked(COMBAT.state !== 'FTL_CHARGING'); }
  function showMutinyTurn() { setTurnIndicator('CREW MUTINY', 'enemy-turn'); setActionsLocked(false); }

  function flashScreen(cls) {
    const el = document.getElementById('screen-encounter');
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 420);
  }

  function renderCombatHud() {
    const hPct = clamp(Math.round((COMBAT.player.hull / COMBAT.player.hullMax) * 100), 0, 100);
    const fPct = clamp(Math.round((COMBAT.enemy.hull  / COMBAT.enemy.hullMax)  * 100), 0, 100);
    const mPct = clamp(COMBAT.player.morale, 0, 100);
    const fillH = document.getElementById('combat-fill-hull');
    if (!fillH) return;
    fillH.style.width = hPct + '%';
    fillH.classList.remove('warn', 'crit');
    if (hPct <= 25) fillH.classList.add('crit'); else if (hPct <= 50) fillH.classList.add('warn');
    document.getElementById('combat-num-hull').textContent = hPct + '%';
    document.getElementById('combat-fill-foe').style.width = fPct + '%';
    document.getElementById('combat-num-foe').textContent = fPct + '%';
    const fillM = document.getElementById('combat-fill-mor');
    fillM.style.width = mPct + '%';
    fillM.classList.remove('warn', 'crit');
    if (mPct <= 25) fillM.classList.add('crit'); else if (mPct <= 50) fillM.classList.add('warn');
    document.getElementById('combat-num-mor').textContent = mPct;
  }

  function makeActionBtn(opts) {
    const btn = document.createElement('button');
    btn.className = 'enc-choice' + (opts.locked ? ' locked' : '') + (opts.cls ? ' ' + opts.cls : '');
    btn.innerHTML = `
      <div class="ch-text">${opts.verb}</div>
      ${opts.sub ? `<div class="ch-sub"><span${opts.locked ? ' class="lock"' : ''}>${opts.sub}</span></div>` : ''}
    `;
    if (!opts.locked && opts.onClick) btn.addEventListener('click', opts.onClick);
    return btn;
  }

  function renderCombatActions() {
    const wrap = document.getElementById('enc-choices');
    if (!COMBAT.active) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = '';

    if (COMBAT.state === 'MUTINY') {
      wrap.appendChild(makeActionBtn({ verb: 'STAND DOWN', sub: 'Surrender or limp away — crew is done', cls: 'combat-danger', onClick: resolveMutinyStandDown }));
      return;
    }
    if (COMBAT.state === 'SURRENDER_DECISION') {
      wrap.appendChild(makeActionBtn({ verb: 'ACCEPT SURRENDER', sub: '40% loot · morale +5', cls: 'combat-tribute', onClick: acceptSurrender }));
      wrap.appendChild(makeActionBtn({ verb: 'FINISH THEM', sub: 'Full loot · morale -10 · sets flag', cls: 'combat-danger', onClick: finishSurrendered }));
      return;
    }
    if (COMBAT.state === 'FTL_CHARGING') {
      const turns = ftlTurns();
      const pct = Math.round((COMBAT.ftlCharge / turns) * 100);
      const pane = document.createElement('div');
      pane.className = 'combat-ftl-progress';
      pane.innerHTML = `FTL CHARGE: ${pct}%<div class="ftl-bar"><div class="ftl-bar-fill" style="width:${pct}%"></div></div>TURN ${COMBAT.ftlCharge} / ${turns}`;
      wrap.appendChild(pane);
      wrap.appendChild(makeActionBtn({ verb: 'FIRE LASER', sub: 'Locked — FTL spinup in progress', locked: true }));
      wrap.appendChild(makeActionBtn({ verb: 'EVASIVE MANEUVERS', sub: 'Locked', locked: true }));
      wrap.appendChild(makeActionBtn({ verb: 'ABORT JUMP', sub: 'Cancel FTL · resume combat', cls: 'combat-danger', onClick: abortFtl }));
      return;
    }
    if (COMBAT.state === 'TARGETING') {
      wrap.appendChild(makeActionBtn({ verb: 'FIRE AT CENTER', sub: 'Or click the ship to aim · Enter', cls: 'combat-fire', onClick: fireAtCenter }));
      wrap.appendChild(makeActionBtn({ verb: 'CANCEL', sub: 'Hold fire', cls: 'combat-danger', onClick: cancelTargeting }));
      return;
    }

    if (COMBAT.openingTurn && COMBAT.crew.botanist) {
      wrap.appendChild(makeActionBtn({ verb: 'OFFER HARVEST', sub: 'Botanist · 40% · -5 food · opening only', cls: 'combat-tribute', onClick: () => offerTribute('botanist') }));
    }
    if (COMBAT.openingTurn && COMBAT.crew.chef) {
      wrap.appendChild(makeActionBtn({ verb: 'OFFER COOKIES', sub: 'Chef · 25% · -3 food · friendly tag', cls: 'combat-tribute', onClick: () => offerTribute('chef') }));
    }

    const fireBonusTags = [];
    if (COMBAT.identifiedByXeno) fireBonusTags.push('xeno bonus');
    if (bonus('fire_dmg_bonus_flat') > 0) fireBonusTags.push('veteran +' + Math.round(bonus('fire_dmg_bonus_flat') * 100) + '%');
    wrap.appendChild(makeActionBtn({
      verb: 'FIRE LASER',
      sub: '10–15 dmg' + (fireBonusTags.length ? ' · ' + fireBonusTags.join(' · ') : ''),
      cls: 'combat-fire', onClick: enterTargeting
    }));
    wrap.appendChild(makeActionBtn({
      verb: 'EVASIVE MANEUVERS',
      sub: 'Halve next hit' + ((COMBAT.crew.pilot || COMBAT.captainBg === 'pilot') ? ' · pilot full-dodge chance' : ''),
      cls: 'combat-evade', onClick: doEvade
    }));

    const hasEng = COMBAT.crew.engineer || COMBAT.captainBg === 'engineer';
    if (hasEng) {
      const hpRatio = COMBAT.player.hull / COMBAT.player.hullMax;
      const patchPct = COMBAT.crew.engineer ? 25 : 12;
      const avail = hpRatio <= 0.50 && !COMBAT.hullPatchUsed;
      wrap.appendChild(makeActionBtn({
        verb: 'HULL PATCH',
        sub: COMBAT.hullPatchUsed ? 'Already used this combat'
             : (hpRatio > 0.50 ? `Available below 50% hull · +${patchPct}%` : `Engineer · +${patchPct}% hull · free action`),
        locked: !avail, cls: 'combat-special', onClick: doHullPatch
      }));
    }

    // Stub for v2 per COMBAT_SYSTEM_HANDOFF.md §3 — always locked, no
    // shield_module_upgrade item exists yet.
    wrap.appendChild(makeActionBtn({ verb: 'BOOST SHIELDS', sub: 'Requires Shield Module Upgrade [v2]', locked: true }));

    wrap.appendChild(makeActionBtn({
      verb: 'ATTEMPT ESCAPE', sub: `${ftlTurns()}-turn FTL charge · -15 fuel`,
      cls: 'combat-special', onClick: beginFtlCharge
    }));
  }

  /* ══ Combat FX (demo-combat.html port, 2026-08-03) ═══════════════
     Beams (cyan=us, red=them) drawn INSIDE the bridge viewport window
     (160,93 → 800,498), particle destruction, targeting crosshair,
     damage floaters, miss popups, CRT-off on the captain's feed.
     Real targeting: FIRE LASER enters TARGETING; the player clicks
     the enemy ship to aim. Engine-side addition over the demo: an
     explicit FIRE AT CENTER action (+ Enter key) so keyboard players
     and the fuzz harness can never wedge in TARGETING — no timers,
     combat stays strictly turn-based per the Bible. */
  const WIN = { left: 160, top: 93, right: 800, bottom: 498 };
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];

  const FX = { beams: [], particles: [], sparks: [], mouseX: 480, mouseY: 320, mouseInside: false, running: false };
  function fxScreen() { return document.getElementById('screen-encounter'); }
  // #game is CSS-scaled to fit small viewports (fitGameToViewport); every
  // rect-derived coordinate must be divided back into the 960×640 space
  // the fx canvas and aim logic live in.
  function screenScale(rect) { return (rect && rect.width) ? rect.width / 960 : 1; }
  function enemyShipCenter() {
    const sp = document.getElementById('enc-backdrop-sprite');
    const sr = fxScreen().getBoundingClientRect();
    const r = sp.getBoundingClientRect();
    if (!r.width) return { x: 480, y: 295 }; // sprite hidden/unresolved — window center
    const s = screenScale(sr);
    return { x: (r.left + r.width / 2 - sr.left) / s, y: (r.top + r.height / 2 - sr.top) / s };
  }
  function spawnBeam(opts) { FX.beams.push({ side: opts.side, sx: opts.sx, sy: opts.sy, ex: opts.ex, ey: opts.ey, life: 0, ttl: 280 }); }
  function spawnMissPopup(text) {
    const el = document.createElement('div');
    el.className = 'combat-miss-popup';
    el.textContent = text || 'MISS!';
    fxScreen().appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }
  function spawnDamageFloater(amount, x, y, variant) {
    const el = document.createElement('div');
    el.className = 'combat-dmg-float ' + (variant || 'normal');
    el.textContent = variant === 'crit' ? `−${amount}!` : `−${amount}`;
    el.style.left = Math.round(x) + 'px';
    el.style.top = Math.round(y) + 'px';
    fxScreen().appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
  function spawnDestructionParticles() {
    const c = enemyShipCenter();
    const colors = ['#e88830', '#f0c060', '#cc3333', '#d8a8a8', '#aa6634', '#9098a8', '#ffe0a0', '#a04020'];
    for (let i = 0; i < 160; i++) {
      const angle = Math.random() * Math.PI * 2, speed = rand(80, 320);
      FX.particles.push({
        x: c.x + (Math.random() - 0.5) * 18, y: c.y + (Math.random() - 0.5) * 12,
        vx: Math.cos(angle) * speed * 0.014, vy: Math.sin(angle) * speed * 0.014 - rand(0.8, 2.2),
        gravity: rand(0.05, 0.10), size: irand(3, 11), color: pickOne(colors),
        life: 0, ttl: rand(700, 1500),
      });
    }
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2, speed = rand(50, 140);
      FX.particles.push({
        x: c.x, y: c.y,
        vx: Math.cos(angle) * speed * 0.012, vy: Math.sin(angle) * speed * 0.012 - rand(1.0, 2.0),
        gravity: rand(0.07, 0.12), size: irand(10, 18),
        color: pickOne(['#aa6634', '#7a4020', '#9098a8', '#5a4030']),
        life: 0, ttl: rand(900, 1700),
      });
    }
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2;
      FX.sparks.push({ x: c.x, y: c.y, vx: Math.cos(a) * rand(2.2, 5.0), vy: Math.sin(a) * rand(2.2, 5.0), life: 0, ttl: rand(320, 480) });
    }
    document.body.classList.remove('combat-screen-shake');
    void document.body.offsetWidth;
    document.body.classList.add('combat-screen-shake');
    setTimeout(() => document.body.classList.remove('combat-screen-shake'), 410);
  }
  // Cyan particles converging INTO the enemy ship — energy gathering
  // for their FTL spool, telegraphs the retreat before the flash
  // (demo D:6385-6411). gravity 0 = pure radial inrush. Wave 2 starts
  // with life at -160ms: combatFxLoop skips particles whose life is
  // still negative, so the negative life IS the stagger.
  function spawnEnemyChargeParticles() {
    const c = enemyShipCenter();
    const colors = ['#35c6bf', '#8af0ea', '#5fa8d0', '#a0d8e8', '#c0f0ec'];
    for (let wave = 0; wave < 2; wave++) {
      for (let i = 0; i < 22; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = rand(90, 200);
        const x0 = c.x + Math.cos(angle) * radius;
        const y0 = c.y + Math.sin(angle) * radius;
        // Velocity points back TOWARD the ship center.
        const speed = rand(2.5, 5.5);
        const dx = c.x - x0, dy = c.y - y0;
        const norm = Math.sqrt(dx * dx + dy * dy);
        FX.particles.push({
          x: x0, y: y0,
          vx: (dx / norm) * speed,
          vy: (dy / norm) * speed,
          gravity: 0,
          size: irand(2, 5),
          color: pickOne(colors),
          life: -wave * 160,
          ttl: rand(420, 680)
        });
      }
    }
  }
  // FTL jump visual (demo D:5792-5817) — shrink-fade the enemy ship +
  // captain + name plate behind a white pinpoint-bloom flash confined
  // to the bridge cutout, then hold on the empty bridge (~3s) before
  // onDone resolves to the outcome view. Called by BOTH enemyRetreats
  // (their drive) and the player-escape path in advanceFtlIfNeeded
  // (ours). The flash div is created per-jump and removed when its
  // 900ms animation ends — no persistent element.
  function triggerFtlJumpEffect(onDone) {
    const screen = fxScreen();
    const sprite = document.getElementById('enc-backdrop-sprite');
    const subject = document.getElementById('enc-subject');
    const namePlate = document.getElementById('enc-subject-name');
    if (sprite) sprite.classList.add('combat-ftl-vanish');
    if (subject) subject.classList.add('combat-ftl-vanish');
    if (namePlate) namePlate.classList.add('combat-ftl-vanish');
    const flash = document.createElement('div');
    flash.className = 'combat-ftl-flash';
    screen.appendChild(flash);
    setTimeout(() => { if (flash.parentNode) flash.parentNode.removeChild(flash); }, 900);
    // The silence after the flash is the moment the jump actually
    // lands — total elapsed before the outcome view: ~3s (demo canon).
    setTimeout(() => { if (typeof onDone === 'function') onDone(); }, 3000);
  }
  function preExplosionShake() {
    const sp = document.getElementById('enc-backdrop-sprite');
    sp.classList.remove('combat-pre-explode');
    void sp.offsetWidth;
    sp.classList.add('combat-pre-explode');
  }
  function triggerCaptainCrtOff() {
    const subject = document.getElementById('enc-subject');
    const stat = document.createElement('div');
    stat.className = 'combat-crt-static';
    subject.appendChild(stat);
    setTimeout(() => stat.remove(), 320);
    subject.classList.remove('combat-crt-off');
    void subject.offsetWidth;
    subject.classList.add('combat-crt-off');
    const namePlate = document.getElementById('enc-subject-name');
    namePlate.classList.add('combat-crt-off-name');
  }
  let _fxLastTs = 0;
  function combatFxLoop(ts) {
    const fxCanvas = document.getElementById('combat-fx-canvas');
    const cursorCanvas = document.getElementById('combat-cursor-canvas');
    if (!fxCanvas || !cursorCanvas || !COMBAT.active && !FX.beams.length && !FX.particles.length && !FX.sparks.length) { FX.running = false; return; }
    if (window.PauseBus && PauseBus.paused) { _fxLastTs = ts; requestAnimationFrame(combatFxLoop); return; }
    const fxCtx = fxCanvas.getContext('2d');
    const cursorCtx = cursorCanvas.getContext('2d');
    const dt = Math.min(48, ts - (_fxLastTs || ts));
    _fxLastTs = ts;
    fxCtx.clearRect(0, 0, 960, 640);

    for (let i = FX.beams.length - 1; i >= 0; i--) {
      const b = FX.beams[i];
      b.life += dt;
      const t = clamp(b.life / b.ttl, 0, 1);
      fxCtx.save();
      fxCtx.globalCompositeOperation = 'lighter';
      fxCtx.strokeStyle = (b.side === 'player') ? `rgba(53,198,191,${1 - t * 0.7})` : `rgba(204,80,80,${1 - t * 0.7})`;
      fxCtx.lineWidth = 3;
      fxCtx.shadowColor = b.side === 'player' ? '#35c6bf' : '#cc3333';
      fxCtx.shadowBlur = 14;
      const head = clamp(t * 1.6, 0, 1);
      fxCtx.beginPath();
      fxCtx.moveTo(b.sx, b.sy);
      fxCtx.lineTo(b.sx + (b.ex - b.sx) * head, b.sy + (b.ey - b.sy) * head);
      fxCtx.stroke();
      if (head >= 1) {
        const glowY = (b.side === 'enemy') ? b.ey - 5 : b.ey;
        const grad = fxCtx.createRadialGradient(b.ex, glowY, 0, b.ex, glowY, 26);
        grad.addColorStop(0, b.side === 'player' ? 'rgba(120,240,232,0.8)' : 'rgba(255,160,160,0.85)');
        grad.addColorStop(1, 'transparent');
        fxCtx.fillStyle = grad;
        fxCtx.beginPath(); fxCtx.arc(b.ex, glowY, 26, 0, Math.PI * 2); fxCtx.fill();
      }
      fxCtx.restore();
      if (b.life >= b.ttl) FX.beams.splice(i, 1);
    }
    for (let i = FX.particles.length - 1; i >= 0; i--) {
      const p = FX.particles[i];
      p.life += dt;
      if (p.life < 0) continue;
      p.vy += p.gravity;
      p.x += p.vx * (dt / 16);
      p.y += p.vy * (dt / 16);
      const t = clamp(p.life / p.ttl, 0, 1);
      fxCtx.save();
      fxCtx.globalAlpha = 1 - t;
      fxCtx.fillStyle = p.color;
      fxCtx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      fxCtx.restore();
      if (p.life >= p.ttl) FX.particles.splice(i, 1);
    }
    for (let i = FX.sparks.length - 1; i >= 0; i--) {
      const s = FX.sparks[i];
      s.life += dt;
      s.x += s.vx; s.y += s.vy;
      const t = clamp(s.life / s.ttl, 0, 1);
      fxCtx.save();
      fxCtx.globalCompositeOperation = 'lighter';
      fxCtx.fillStyle = `rgba(255,220,150,${(1 - t) * 0.9})`;
      fxCtx.beginPath(); fxCtx.arc(s.x, s.y, 3 + (1 - t) * 4, 0, Math.PI * 2); fxCtx.fill();
      fxCtx.restore();
      if (s.life >= s.ttl) FX.sparks.splice(i, 1);
    }

    cursorCtx.clearRect(0, 0, 960, 640);
    if (COMBAT.state === 'TARGETING' && FX.mouseInside) drawCombatCrosshair(cursorCtx, FX.mouseX, FX.mouseY);

    requestAnimationFrame(combatFxLoop);
  }
  function startCombatFx() {
    FX.beams.length = 0; FX.particles.length = 0; FX.sparks.length = 0;
    if (!FX.running) { FX.running = true; _fxLastTs = 0; requestAnimationFrame(combatFxLoop); }
  }
  function drawCombatCrosshair(ctx, x, y) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.strokeStyle = 'rgba(53,198,191,0.95)';
    ctx.fillStyle = 'rgba(53,198,191,0.95)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#35c6bf';
    ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-9, 0); ctx.lineTo(-3, 0); ctx.moveTo(3, 0); ctx.lineTo(9, 0);
    ctx.moveTo(0, -9); ctx.lineTo(0, -3); ctx.moveTo(0, 3); ctx.lineTo(0, 9);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, Math.PI * 2); ctx.fill();
    const r = 22;
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([qx, qy]) => {
      ctx.beginPath();
      ctx.moveTo(qx * r, qy * r); ctx.lineTo(qx * (r - 5), qy * r);
      ctx.moveTo(qx * r, qy * r); ctx.lineTo(qx * r, qy * (r - 5));
      ctx.stroke();
    });
    ctx.restore();
  }
  // Mouse targeting — registered once; guards keep them inert outside combat.
  (function wireTargetingInput() {
    const screen = document.getElementById('screen-encounter');
    if (!screen) return;
    const coords = evt => {
      const r = screen.getBoundingClientRect();
      const s = screenScale(r);
      return { x: clamp((evt.clientX - r.left) / s, 0, 960), y: clamp((evt.clientY - r.top) / s, 0, 640) };
    };
    document.addEventListener('keydown', evt => {
      if (evt.key !== 'Enter' || !COMBAT.active || COMBAT.state !== 'TARGETING') return;
      evt.preventDefault();
      fireAtCenter();
    });
    screen.addEventListener('mousemove', evt => {
      if (!COMBAT.active) return;
      const c = coords(evt);
      FX.mouseX = c.x; FX.mouseY = c.y; FX.mouseInside = true;
    });
    screen.addEventListener('mouseleave', () => { FX.mouseInside = false; });
    screen.addEventListener('click', evt => {
      if (!COMBAT.active || COMBAT.state !== 'TARGETING') return;
      if (evt.target.closest('.enc-choice')) return; // action panel clicks aren't aim clicks
      const c = coords(evt);
      const ec = enemyShipCenter();
      const dx = c.x - ec.x, dy = c.y - ec.y;
      if (Math.sqrt(dx * dx + dy * dy) > 220) { setAiCombat('Click closer to the enemy.'); return; }
      resolveFire(c.x, c.y);
    });
  })();

  /* ── Player actions ─────────────────────────────────────────── */
  // FIRE AT CENTER — the explicit aim-less shot (Bible: combat is strictly
  // turn-based, no timers). Replaces the engine's old 1.6s auto-fire
  // fallback; keyboard players press Enter, the fuzz harness clicks it.
  function fireAtCenter() {
    if (!COMBAT.active || COMBAT.state !== 'TARGETING') return;
    if (window.PauseBus && PauseBus.paused) return;
    const ec = enemyShipCenter();
    resolveFire(ec.x + rand(-20, 20), ec.y + rand(-14, 14));
  }

  function enterTargeting() {
    if (!COMBAT.active || COMBAT.state !== 'PLAYER_TURN') return;
    COMBAT.state = 'TARGETING';
    fxScreen().classList.add('combat-targeting');
    document.getElementById('enc-subject').classList.add('combat-locking');
    setAiCombat('Weapons hot. Pick your shot.');
    renderCombatActions();
  }

  function cancelTargeting() {
    if (!COMBAT.active || COMBAT.state !== 'TARGETING') return;
    COMBAT.state = 'PLAYER_TURN';
    fxScreen().classList.remove('combat-targeting');
    document.getElementById('enc-subject').classList.remove('combat-locking');
    setAiCombat('Targeting cancelled.');
    renderCombatActions();
  }

  function resolveFire(tx, ty) {
    if (!COMBAT.active || COMBAT.state !== 'TARGETING' || COMBAT._firing) return;
    COMBAT._firing = true;
    COMBAT.openingTurn = false;
    fxScreen().classList.remove('combat-targeting');
    document.getElementById('enc-subject').classList.remove('combat-locking');
    showEnemyTurn();
    setAiCombat(combatLine('player_fires'));
    // Beam from the bottom edge of the bridge window to the aim point.
    const ec = enemyShipCenter();
    const ex = clamp(Number.isFinite(tx) ? tx : ec.x, WIN.left + 4, WIN.right - 4);
    const ey = clamp(Number.isFinite(ty) ? ty : ec.y, WIN.top + 4, WIN.bottom - 4);
    spawnBeam({ side: 'player', sx: (WIN.left + WIN.right) / 2, sy: WIN.bottom, ex, ey });

    setTimeout(() => {
      if (Math.random() < playerMissChance()) {
        spawnMissPopup('MISS!');
        setNarrCombat('COMBAT LOG', 'Shot went wide — shaky hands at the trigger.', 'Composure fraying. Crew morale showing.');
        setAiCombat(combatLine('player_fires'));
        bumpMorale(-1);
        COMBAT._firing = false;
        setTimeout(enemyTurn, 500);
        return;
      }
      let dmg = irand(COMBAT_CONFIG.player_damage.min, COMBAT_CONFIG.player_damage.max);
      let dmgMul = 1 + bonus('fire_dmg_bonus_flat');
      if (COMBAT.identifiedByXeno) {
        const fb = COMBAT.crew.xenobiologist ? COMBAT_CONFIG.crew_bonuses.xenobiologist.fire_dmg_bonus
                 : COMBAT.captainBg === 'xenobiologist' ? COMBAT_CONFIG.captain_bonuses.xenobiologist.fire_dmg_bonus : 0;
        dmgMul += fb;
      }
      dmg = Math.round(dmg * dmgMul);
      const isCrit = Math.random() < critChance();
      if (isCrit) dmg = Math.round(dmg * COMBAT_CONFIG.crit_damage_mul);
      applyEnemyDamage(dmg);
      bumpMorale(isCrit ? 2 : 1);
      const fc = enemyShipCenter();
      spawnDamageFloater(dmg, fc.x, fc.y - 28, isCrit ? 'crit' : 'normal');
      setNarrCombat('COMBAT LOG', combatLine('player_fires'),
        `${isCrit ? 'CRITICAL HIT — ' : ''}-${dmg} hull. Enemy: ${Math.max(0, COMBAT.enemy.hull)}/${COMBAT.enemy.hullMax}.`);
      if (!COMBAT.enemy.alive) { onEnemyDestroyed(); return; }
      if (!COMBAT.enemy.surrendered && !COMBAT.enemy.surrenderOffered &&
          (COMBAT.enemy.hull / COMBAT.enemy.hullMax) <= COMBAT_CONFIG.surrender_threshold &&
          COMBAT_CONFIG.surrenders[COMBAT.species]) {
        setNarrCombat('COMBAT LOG', combatLine('enemy_low_hp'),
          `Enemy hull: ${Math.max(0, COMBAT.enemy.hull)}/${COMBAT.enemy.hullMax}. They may surrender.`);
      }
      COMBAT._firing = false;
      setTimeout(enemyTurn, 600);
    }, 280);
  }

  function doEvade() {
    if (!COMBAT.active || COMBAT.state !== 'PLAYER_TURN') return;
    COMBAT.openingTurn = false;
    COMBAT.evadingNextHit = true;
    setNarrCombat('COMBAT LOG', combatLine('player_evades'), 'Evasive pattern engaged. Incoming damage halved (or fully dodged with Pilot).');
    setAiCombat(combatLine('player_evades'));
    showEnemyTurn();
    setTimeout(enemyTurn, 500);
  }

  function doHullPatch() {
    if (!COMBAT.active || COMBAT.state !== 'PLAYER_TURN' || COMBAT.hullPatchUsed) return;
    if ((COMBAT.player.hull / COMBAT.player.hullMax) > 0.50) return;
    const pct = COMBAT.crew.engineer ? COMBAT_CONFIG.crew_bonuses.engineer.hull_patch_pct : COMBAT_CONFIG.captain_bonuses.engineer.hull_patch_pct;
    const heal = Math.round(COMBAT.player.hullMax * pct);
    COMBAT.player.hull = clamp(COMBAT.player.hull + heal, 0, COMBAT.player.hullMax);
    COMBAT.hullPatchUsed = true;
    COMBAT.openingTurn = false;
    setNarrCombat('COMBAT LOG', combatLine('hull_patch'), `Hull restored +${heal}. Hull: ${COMBAT.player.hull}/${COMBAT.player.hullMax}. Free action — fire when ready.`);
    setAiCombat(combatLine('hull_patch'));
    renderCombatHud();
    renderCombatActions();
  }

  function beginFtlCharge() {
    if (!COMBAT.active || COMBAT.state !== 'PLAYER_TURN') return;
    COMBAT.openingTurn = false;
    COMBAT.state = 'FTL_CHARGING';
    COMBAT.ftlCharge = 1;
    fxScreen().classList.add('combat-ftl-charging');
    setNarrCombat('COMBAT LOG', combatLine('ftl_charging'), `FTL spool turn 1 of ${ftlTurns()}. Enemy fire continues.`);
    setAiCombat(combatLine('ftl_charging'));
    showEnemyTurn();
    renderCombatActions();
    setTimeout(enemyTurn, 600);
  }
  function abortFtl() {
    if (COMBAT._ftlTickTimer) { clearTimeout(COMBAT._ftlTickTimer); COMBAT._ftlTickTimer = null; }
    COMBAT.state = 'PLAYER_TURN';
    COMBAT.ftlCharge = -1;
    fxScreen().classList.remove('combat-ftl-charging');
    setAiCombat('FTL aborted. Resuming combat.');
    setNarrCombat('COMBAT LOG', 'FTL spool aborted.', 'Drive cools. Ready for orders.');
    showYourTurn();
    renderCombatActions();
  }

  function offerTribute(kind) {
    if (!COMBAT.active || COMBAT.tributeUsed || !COMBAT.openingTurn) return;
    COMBAT.tributeUsed = true; COMBAT.openingTurn = false;
    setAiCombat(combatLine('tribute_offered'));
    setNarrCombat('COMBAT LOG', combatLine('tribute_offered'), 'Awaiting response.');
    showEnemyTurn();
    renderCombatActions();
    const cfg = kind === 'botanist' ? COMBAT_CONFIG.crew_bonuses.botanist : COMBAT_CONFIG.crew_bonuses.chef;
    const label = kind === 'botanist' ? 'harvest' : 'cookies';
    setTimeout(() => {
      const success = Math.random() < cfg.tribute_success;
      if (success) {
        COMBAT.player.morale = clamp(COMBAT.player.morale + cfg.morale_on_success, 0, 100);
        setNarrCombat('TRIBUTE ACCEPTED', combatLine('tribute_success'), `-${cfg.tribute_food_cost} food · morale +${cfg.morale_on_success}`);
        endCombatToOutcome({ outcome: 'tribute', foodCost: cfg.tribute_food_cost, moraleDelta: cfg.morale_on_success, friendly: kind === 'chef' });
      } else {
        const rejectLead = `${label[0].toUpperCase() + label.slice(1)} thrown back. -${cfg.tribute_food_cost} food.`;
        COMBAT._narrPrefix = rejectLead;
        setAiCombat(combatLine('tribute_fail'));
        setNarrCombat('COMBAT LOG', combatLine('tribute_fail'), rejectLead);
        renderCombatActions();
        // Food cost applies whether the tribute succeeds or fails
        // (COMBAT_SYSTEM_HANDOFF.md §5) — combat continues on failure,
        // so this deducts immediately rather than through the deferred
        // end-of-combat outcome reconciliation.
        STATE.resources.food = clamp(STATE.resources.food - cfg.tribute_food_cost, 0, 100);
        renderHUD();
        setTimeout(enemyTurn, 600);
      }
    }, 700);
  }

  function resolveMutinyStandDown() {
    if (!COMBAT.active) return;
    if (COMBAT_CONFIG.surrenders[COMBAT.species]) {
      COMBAT.enemy.surrenderOffered = true;
      acceptSurrender();
    } else {
      COMBAT.player.hull = 1;
      onPlayerDefeat();
    }
  }

  /* ── Enemy turn ─────────────────────────────────────────────── */
  function enemyTurn() {
    if (!COMBAT.active) return;

    if (!COMBAT.enemy.surrenderOffered && COMBAT.enemy.alive &&
        (COMBAT.enemy.hull / COMBAT.enemy.hullMax) <= COMBAT_CONFIG.surrender_threshold &&
        COMBAT_CONFIG.surrenders[COMBAT.species]) {
      const surrenderChance = 0.65 + bonus('surrender_chance_bonus');
      if (Math.random() < surrenderChance) {
        if (Math.random() < COMBAT_CONFIG.enemy_retreat_chance) { enemyRetreats(); return; }
        COMBAT.enemy.surrenderOffered = true;
        COMBAT.state = 'SURRENDER_DECISION';
        fxScreen().classList.remove('combat-ftl-charging');
        setAiCombat(combatLine('enemy_surrenders'));
        setNarrCombat('SURRENDER OFFERED', combatLine('enemy_surrenders'), 'Their fire ceases. They wait.');
        showYourTurn();
        renderCombatActions();
        return;
      }
    }

    setAiCombat(combatLine('enemy_fires'));
    let dmg = irand(COMBAT_CONFIG.enemy_damage.min, COMBAT_CONFIG.enemy_damage.max) * COMBAT.enemy.dmgMod;

    if (COMBAT.turn === 1 && (COMBAT.crew.diplomat || COMBAT.captainBg === 'diplomat')) {
      const r = COMBAT.crew.diplomat ? COMBAT_CONFIG.crew_bonuses.diplomat.opening_dmg_reduction : COMBAT_CONFIG.captain_bonuses.diplomat.opening_dmg_reduction;
      dmg *= (1 - r);
    }

    let dodgedFull = false;
    if (COMBAT.evadingNextHit) {
      const fullDodge = bonus('evade_full_dodge');
      if (fullDodge > 0 && Math.random() < fullDodge) { dmg = 0; dodgedFull = true; }
      else {
        let evadeFactor = 0.5;
        if (COMBAT.player.morale < 15) evadeFactor = 0.75;
        else if (COMBAT.player.morale < 30) evadeFactor = 0.65;
        dmg *= evadeFactor;
      }
      COMBAT.evadingNextHit = false;
    }

    let ftlMiss = false;
    if (COMBAT.state === 'FTL_CHARGING') {
      let missRate = 0.35;
      if (COMBAT.crew.pilot) missRate = 0.75;
      else if (COMBAT.captainBg === 'pilot') missRate = 0.50;
      if (Math.random() < missRate) { dmg = 0; ftlMiss = true; }
    }

    // Their beam: enemy ship center → random point on the bridge
    // window's bottom edge, heading "toward us" (demo canon).
    const ecFire = enemyShipCenter();
    spawnBeam({
      side: 'enemy', sx: ecFire.x, sy: ecFire.y,
      ex: WIN.left + 80 + Math.random() * (WIN.right - WIN.left - 160),
      ey: WIN.bottom,
    });

    setTimeout(() => {
      const pfx = COMBAT._narrPrefix ? COMBAT._narrPrefix + ' ' : '';
      if (dodgedFull) {
        spawnMissPopup('MISS!');
        setNarrCombat('COMBAT LOG', pfx + combatLine('player_dodge_full'), 'Shot missed entirely. Pilot earns their bunk.');
        setAiCombat(combatLine('player_dodge_full'));
        bumpMorale(2);
        COMBAT._narrPrefix = null;
      } else if (ftlMiss) {
        spawnMissPopup('MISS!');
        setNarrCombat('COMBAT LOG', pfx + combatLine('enemy_fires'), 'Shot went wide — drive spool perturbing their lock.');
        setAiCombat('Their shot missed. The drive is making us hard to track.');
        COMBAT._narrPrefix = null;
      } else if (dmg <= 0) {
        setNarrCombat('COMBAT LOG', pfx + combatLine('enemy_fires'), 'No effective damage.');
        COMBAT._narrPrefix = null;
      } else {
        const dealt = Math.max(1, Math.round(dmg));
        applyPlayerDamage(dealt);
        setNarrCombat('COMBAT LOG', pfx + combatLine('enemy_fires'), `Hull -${dealt}. Hull: ${Math.max(0, COMBAT.player.hull)}/${COMBAT.player.hullMax}.`);
        COMBAT._narrPrefix = null;
        const heavyHit = dealt > COMBAT.player.hullMax * 0.15;
        bumpMorale(heavyHit ? -2 : -1);
      }
      if (COMBAT.player.hull <= 0) { onPlayerDefeat(); return; }
      advanceFtlIfNeeded();
      if (!COMBAT.active) return;
      COMBAT.turn += 1;
      if (COMBAT.state !== 'END') {
        COMBAT.state = (COMBAT.ftlCharge > 0) ? 'FTL_CHARGING' : 'PLAYER_TURN';
        if (COMBAT.state === 'PLAYER_TURN') fxScreen().classList.remove('combat-ftl-charging');
        if (COMBAT.state === 'PLAYER_TURN' && COMBAT.player.morale <= 10) {
          COMBAT.state = 'MUTINY';
          setNarrCombat('CREW MUTINY', 'The crew refuses to fire. Morale is gone.', "They're looking at you. Stand down or wait for the next shot.");
          setAiCombat('Crew has stopped responding to combat orders.');
        }
      }
      renderCombatActions();
      renderCombatHud();
      if (COMBAT.state === 'PLAYER_TURN') showYourTurn();
      else if (COMBAT.state === 'MUTINY') showMutinyTurn();
      if (COMBAT.state === 'FTL_CHARGING' && COMBAT.active) COMBAT._ftlTickTimer = setTimeout(enemyTurn, 1300);
      if (COMBAT.state === 'MUTINY' && COMBAT.active) setTimeout(enemyTurn, 1500);
    }, 280);
  }

  // Enemy FTLs out instead of surrendering — same pinpoint-bloom flash
  // as our escape (their drive lights up before they're gone). Charge
  // telegraph first (cyan hull glow + converging particles, 1000ms,
  // demo D:5745-5764), then the shared vanish/flash/empty-bridge beat.
  function enemyRetreats() {
    if (COMBAT._ftlTickTimer) { clearTimeout(COMBAT._ftlTickTimer); COMBAT._ftlTickTimer = null; }
    COMBAT.state = 'END';
    hideTurnIndicator();
    fxScreen().classList.remove('combat-ftl-charging');
    fxScreen().classList.add('combat-ended');
    setAiCombat('Enemy drive spool detected. They are leaving.');
    setNarrCombat('ENEMY RETREAT', "Their drive lights up. They're jumping out — saving their hide instead of waiting to be looted.", 'No loot. No morale change.');
    const sp = document.getElementById('enc-backdrop-sprite');
    sp.classList.add('combat-enemy-charge');
    spawnEnemyChargeParticles();
    setTimeout(() => {
      sp.classList.remove('combat-enemy-charge');
      triggerFtlJumpEffect(() => endCombatToOutcome({ outcome: 'enemy_retreat' }));
    }, 1000);
  }

  function advanceFtlIfNeeded() {
    if (COMBAT.ftlCharge < 0 || !COMBAT.active) return;
    const turns = ftlTurns();
    COMBAT.ftlCharge += 1;
    if (COMBAT.ftlCharge > turns) {
      setAiCombat(combatLine('ftl_complete'));
      setNarrCombat('FTL JUMP COMPLETE', combatLine('ftl_complete'), '-15 fuel. Combat disengaged.');
      fxScreen().classList.remove('combat-ftl-charging');
      // Mark combat ended NOW so enemyTurn's tail doesn't queue another
      // invisible-ship shot while the FTL flash plays (demo canon).
      COMBAT.state = 'END';
      fxScreen().classList.add('combat-ended');
      hideTurnIndicator();
      if (COMBAT._ftlTickTimer) { clearTimeout(COMBAT._ftlTickTimer); COMBAT._ftlTickTimer = null; }
      // Beat so the enemy's final shot can be read (engine's existing
      // 700ms, demo used 800), then vanish + flash + ~3s hold.
      setTimeout(() => {
        triggerFtlJumpEffect(() => endCombatToOutcome({ outcome: 'escape', fuelCost: 15 }));
      }, 700);
    }
  }

  /* ── Damage / morale ────────────────────────────────────────── */
  function applyEnemyDamage(amount) {
    COMBAT.enemy.hull = clamp(COMBAT.enemy.hull - amount, 0, COMBAT.enemy.hullMax);
    flashScreen('combat-hit-pulse');
    // Their portrait AND their ship take the hit — portrait shake via
    // scene_art, hit-flash on the viewport sprite (demo canon).
    if (window.SceneArt) SceneArt.subjectFX('hit');
    const sp = document.getElementById('enc-backdrop-sprite');
    sp.classList.remove('combat-hit'); void sp.offsetWidth; sp.classList.add('combat-hit');
    // Low-HP red glow — telegraphs the surrender/critical zone (≤35%,
    // demo D:5826-5828).
    const ratio = COMBAT.enemy.hull / COMBAT.enemy.hullMax;
    sp.classList.toggle('combat-low-hp', ratio > 0 && ratio <= 0.35);
    if (COMBAT.enemy.hull <= 0) COMBAT.enemy.alive = false;
    renderCombatHud();
  }
  function applyPlayerDamage(amount) {
    COMBAT.player.hull = clamp(COMBAT.player.hull - amount, 0, COMBAT.player.hullMax);
    flashScreen('combat-hull-hit');
    // Full-screen shake + red hull vignette + damage floater over the
    // HULL bar (demo canon).
    const screen = fxScreen();
    screen.classList.remove('combat-vignette'); void screen.offsetWidth; screen.classList.add('combat-vignette');
    document.body.classList.remove('combat-screen-shake'); void document.body.offsetWidth; document.body.classList.add('combat-screen-shake');
    setTimeout(() => document.body.classList.remove('combat-screen-shake'), 410);
    setTimeout(() => screen.classList.remove('combat-vignette'), 610);
    const hullRow = document.querySelector('.combat-hpbars .row:first-child');
    if (hullRow) {
      const sr = screen.getBoundingClientRect();
      const hr = hullRow.getBoundingClientRect();
      const s = screenScale(sr);
      spawnDamageFloater(amount, ((hr.left - sr.left) + hr.width / 2) / s, ((hr.top - sr.top) - 12) / s, 'player-hit');
    }
    renderCombatHud();
  }
  function bumpMorale(delta) {
    if (!COMBAT.active) return;
    COMBAT.player.morale = clamp(COMBAT.player.morale + delta, 0, 100);
    renderCombatHud();
  }

  /* ── Outcomes ───────────────────────────────────────────────── */
  function onEnemyDestroyed() {
    COMBAT.state = 'END';
    COMBAT._firing = false;
    hideTurnIndicator();
    fxScreen().classList.remove('combat-targeting', 'combat-ftl-charging');
    fxScreen().classList.add('combat-ended');
    renderCombatActions();
    // Demo-canon destruction sequence: pre-explosion rattle (380ms) →
    // particle scatter + ship sprite fade + CRT-off on the captain's
    // feed → hold on the empty space → victory choice.
    preExplosionShake();
    setAiCombat(combatLine('enemy_destroyed'));
    setNarrCombat('TARGET DESTROYED', combatLine('enemy_destroyed'), 'Wreckage drifting.');
    setTimeout(() => {
      spawnDestructionParticles();
      const sp = document.getElementById('enc-backdrop-sprite');
      sp.classList.remove('combat-pre-explode');
      sp.style.transition = 'opacity 0.30s ease';
      sp.style.opacity = '0';
      triggerCaptainCrtOff();
    }, 380);
    setTimeout(() => showVictoryChoice(), 2200);
  }
  function showVictoryChoice() {
    setActionsLocked(false);
    const wrap = document.getElementById('enc-choices');
    wrap.innerHTML = '';
    wrap.appendChild(makeActionBtn({
      verb: 'SALVAGE WRECKAGE', sub: 'Full loot · bonus crate roll', cls: 'combat-special',
      onClick: () => resolveVictoryChoice({ outcome: 'victory_destroyed', salvaged: true })
    }));
    wrap.appendChild(makeActionBtn({
      verb: 'LEAVE IT', sub: '60% loot · skip minigame',
      onClick: () => resolveVictoryChoice({ outcome: 'victory_destroyed', salvaged: false })
    }));
  }
  function resolveVictoryChoice(result) {
    document.getElementById('enc-choices').innerHTML = '';
    setNarrCombat('TARGET DESTROYED',
      result.salvaged ? 'Wreckage cracked open. Loot pool drawn.' : 'You leave the wreck behind.',
      result.salvaged ? 'Bonus crate roll incoming…' : 'Drifting through your wake.');
    setTimeout(() => endCombatToOutcome(result), 700);
  }
  function acceptSurrender() {
    COMBAT.player.morale = clamp(COMBAT.player.morale + 5, 0, 100);
    setAiCombat(combatLine('surrender_accepted'));
    setNarrCombat('SURRENDER ACCEPTED', combatLine('surrender_accepted'), '+40% loot · morale +5');
    endCombatToOutcome({ outcome: 'victory_surrendered' });
  }
  function finishSurrendered() {
    COMBAT.state = 'END';
    COMBAT.player.morale = clamp(COMBAT.player.morale - 10, 0, 100);
    COMBAT.enemy.hull = 0; COMBAT.enemy.alive = false;
    hideTurnIndicator();
    setAiCombat(combatLine('surrender_refused'));
    setNarrCombat('SURRENDER REFUSED', combatLine('surrender_refused'), 'Full loot recovered. Morale -10. The crew witnessed it.');
    renderCombatHud();
    setTimeout(() => endCombatToOutcome({ outcome: 'victory_executed' }), 900);
  }
  function onPlayerDefeat() {
    COMBAT.state = 'END';
    COMBAT._firing = false;
    hideTurnIndicator();
    COMBAT.player.hull = 1;
    const cargoLoss = irand(30, 50);
    let deathChance = 0.12 - bonus('defeat_death_reduction');
    if (COMBAT.player.morale >= 70) deathChance -= 0.04;
    if (COMBAT.player.morale >= 90) deathChance -= 0.02;
    deathChance = Math.max(0.03, deathChance);
    const died = Math.random() < deathChance;
    setAiCombat(combatLine('player_defeated'));
    setNarrCombat('LIMP-AWAY STATE', combatLine('player_defeated'),
      `Hull set to 1. Cargo loss: ${cargoLoss}%.${died ? ' One crew lost — pulling epitaph.' : ' All crew accounted for.'}`);
    renderCombatHud();
    setTimeout(() => endCombatToOutcome({ outcome: 'defeated', cargoLoss, crewDied: died }), 700);
  }

  /* ── Loot ───────────────────────────────────────────────────── */
  // Ids restricted to what actually exists in materials.json/items.json
  // (short-id convention per CLAUDE.md's Module Loading Notes) — the
  // demo's circuit-board/O2-tank bonus crate entries are dropped, no
  // matching item exists (same rule Phase 4 applied to Fabricator).
  function rollCombatLoot(outcome, opts) {
    opts = opts || {};
    const items = [];
    const maybe = (chance, fn) => { if (Math.random() < chance) fn(); };
    if (outcome === 'destroyed_salvage' || outcome === 'executed') {
      items.push({ id: 'gold', label: 'gold', count: irand(8, 16) });
      maybe(0.75, () => items.push({ id: 'fuel_cell', label: 'Fuel Cell', count: irand(1, 2), isItem: true }));
      maybe(0.65, () => items.push({ id: 'metal', label: 'metal', count: irand(2, 5) }));
      maybe(0.45, () => items.push({ id: 'scrap', label: 'scrap', count: irand(1, 3) }));
      if (Math.random() < (opts.bonusChance || 0.45)) {
        const crate = pick([
          { id: 'drive_coil',  label: 'Drive Coil',  isItem: true },
          { id: 'exotic',      label: 'exotic' },
          { id: 'repair_kit',  label: 'Repair Kit',  isItem: true },
          { id: 'biocomponent',label: 'biocomponent' }
        ]);
        items.push(Object.assign({ count: 1 }, crate));
      }
    } else if (outcome === 'destroyed_leave') {
      items.push({ id: 'gold', label: 'gold', count: irand(4, 9) });
      maybe(0.5, () => items.push({ id: 'fuel_cell', label: 'Fuel Cell', count: 1, isItem: true }));
      maybe(0.4, () => items.push({ id: 'metal', label: 'metal', count: irand(1, 2) }));
    } else if (outcome === 'surrender') {
      items.push({ id: 'gold', label: 'gold', count: irand(3, 7) });
      maybe(0.45, () => items.push({ id: 'fuel_cell', label: 'Fuel Cell', count: 1, isItem: true }));
    }
    return items;
  }
  function describeLoot(items) {
    if (!items || !items.length) return 'No loot recovered.';
    return 'Recovered: ' + items.map(it => `${it.count}× ${it.label}`).join(', ') + '.';
  }

  /* ── Exit: reconcile COMBAT.* back into real STATE, then hand off
     to the same terminal outcome screen every other encounter choice
     uses (renderOutcomeView) so combat's resolution matches the rest
     of the game's UX instead of a bespoke modal. ──────────────── */
  function endCombatToOutcome(result) {
    if (COMBAT._ftlTickTimer) { clearTimeout(COMBAT._ftlTickTimer); COMBAT._ftlTickTimer = null; }
    COMBAT.state = 'END';
    COMBAT.active = false;
    COMBAT._firing = false;

    document.getElementById('screen-encounter').classList.remove('combat-mode', 'combat-targeting', 'combat-vignette', 'combat-ftl-charging');
    document.getElementById('enc-choices').classList.remove('combat-actions', 'combat-locked');
    document.getElementById('enc-subject').classList.remove('combat-locking');
    // Defensive sweep of transient FTL/retreat FX: the flash overlay
    // self-removes at 900ms and the charge class at 1000ms, but any
    // path that ends combat mid-effect must not leave them orphaned.
    document.querySelectorAll('#screen-encounter .combat-ftl-flash').forEach(el => el.remove());
    const spEnd = document.getElementById('enc-backdrop-sprite');
    if (spEnd) spEnd.classList.remove('combat-enemy-charge', 'combat-low-hp');
    // combat-ended (dims alert chrome) + the destroyed ship's inline
    // opacity/CRT classes + the escaped/retreated ship's combat-ftl-
    // vanish classes persist through the OUTCOME view on purpose — the
    // wreck/vanished ship stays gone while the player reads the result.
    // SceneArt fully resets them when the NEXT event renders.
    hideTurnIndicator();

    const outcome = { resources: {} };
    let lootItems = null;
    let title, body, tone;

    switch (result.outcome) {
      case 'victory_destroyed':
        title = result.salvaged ? 'VICTORY · SALVAGED' : 'VICTORY · DEPARTED'; tone = 'success';
        lootItems = rollCombatLoot(result.salvaged ? 'destroyed_salvage' : 'destroyed_leave',
          result.salvaged ? { bonusChance: 0.45 + bonus('salvage_bonus_rolls') * 0.10 } : {});
        body = (result.salvaged ? 'Wreckage cracked open. Drives still warm. ' : 'You leave the wreck behind. The galaxy is full of wrecks. ') + describeLoot(lootItems);
        outcome.time_cost = 'high';
        break;
      case 'victory_surrendered':
        title = 'SURRENDER ACCEPTED'; tone = 'success';
        lootItems = rollCombatLoot('surrender');
        body = 'Pirates stripped, ship intact. They live to disappoint someone else. ' + describeLoot(lootItems);
        outcome.resources.morale = 5;
        outcome.time_cost = 'medium';
        break;
      case 'victory_executed':
        title = 'SURRENDER REFUSED'; tone = 'danger';
        lootItems = rollCombatLoot('executed', { bonusChance: 0.45 });
        body = 'You finished a surrendered combatant. The crew noticed. The galaxy noticed. ' + describeLoot(lootItems);
        outcome.resources.morale = -10;
        outcome.sets_flag = 'executed_surrendered_pirate';
        outcome.time_cost = 'high';
        break;
      case 'tribute':
        title = 'TRIBUTE RESOLVED'; tone = 'success';
        body = `They took the ${result.friendly ? 'cookies' : 'harvest'} and went somewhere else.${result.friendly ? ' Friendly tag set for one journey leg.' : ''}`;
        outcome.resources.morale = result.moraleDelta || 0;
        if (result.friendly) outcome.sets_flag = `friendly_with_pirate_${COMBAT.species}`;
        outcome.time_cost = 'low';
        break;
      case 'escape':
        title = 'FTL ESCAPED'; tone = 'success';
        body = "Drive achieved jump. The pirate is now a different sector’s problem.";
        outcome.resources.fuel = -(result.fuelCost || 15);
        outcome.time_cost = 'medium';
        break;
      case 'enemy_retreat':
        title = 'ENEMY FLED'; tone = 'success';
        body = 'They jumped before you could finish them. Faster ship, smaller pride.';
        outcome.time_cost = 'low';
        break;
      case 'defeated': {
        // Injury roll on top of the death roll — a lost fight usually
        // hurts somebody even when it kills nobody (60% chance, HP
        // damage softened by a medic inside damageCrew itself).
        let injuredRole = null;
        if (!result.crewDied && typeof window.damageCrew === 'function' && Math.random() < 0.6) {
          injuredRole = window.damageCrew(null, 30);
        }
        title = 'LIMP AWAY'; tone = 'danger';
        body = `Hull at 1. Cargo loss ${result.cargoLoss}%.` +
          (result.crewDied ? ' One crew lost.' : (injuredRole ? ` ${injuredRole} is hurt.` : ' All crew accounted for.'));
        if (result.crewDied) outcome.crew_effect = { type: 'kill', target: 'random' };
        outcome.time_cost = 'high';
        break;
      }
    }

    // Hull/morale are the NET change across the whole fight (tracked
    // live on COMBAT.player.* every turn), not a flat per-case
    // constant — reconcile against STATE's pre-fight snapshot here.
    outcome.resources.hull   = (outcome.resources.hull   || 0) + (COMBAT.player.hull   - STATE.resources.hull);
    outcome.resources.morale = (outcome.resources.morale || 0) + (COMBAT.player.morale - STATE.resources.morale);
    if (lootItems) {
      const goldItem = lootItems.find(it => it.id === 'gold');
      if (goldItem) outcome.resources.gold = (outcome.resources.gold || 0) + goldItem.count;
    }

    applyOutcomeEffects(outcome);

    // Materials/items loot isn't part of the standard outcome schema
    // (applyOutcomeEffects only knows resources/item_grant/crew_effect/
    // sets_flag) — applied directly here rather than extending that
    // shared contract for a Phase-5-only need.
    if (lootItems) {
      for (const it of lootItems) {
        if (it.id === 'gold') continue;
        if (it.isItem) {
          // Capacity-enforced (audit fix — this used to bypass the
          // cargo limit); grantItem logs anything left with the wreck.
          for (let i = 0; i < it.count; i++) {
            if (typeof window.grantItem === 'function') window.grantItem(it.id);
            else STATE.items.push(it.id);
          }
        }
        else { STATE.materials[it.id] = (STATE.materials[it.id] || 0) + it.count; }
      }
    }
    // Cargo loss on defeat — drop a random slice of carried items.
    if (result.outcome === 'defeated' && result.cargoLoss && STATE.items.length) {
      const dropCount = Math.min(STATE.items.length, Math.round(STATE.items.length * (result.cargoLoss / 100)));
      for (let i = 0; i < dropCount; i++) {
        STATE.items.splice(Math.floor(Math.random() * STATE.items.length), 1);
      }
    }

    renderHUD();
    if (checkFailure()) return;

    // Open the post_combat aftermath window: events tagged with the
    // post_combat trigger become eligible for the next 2 event draws
    // (decremented in selectEvent()).
    STATE.postCombatLegs = 2;

    STATE.outcomeMode = true;
    renderOutcomeView({ title, body, tone, narrative: body });
  }

  /* ── Entry points — called from handleChoiceClick() in index.html
     for choices carrying triggerCombat/triggerRamResolve/
     triggerFleeResolve. See CLAUDE.md's layered Event Module section
     for the choice schema these three fields belong to. ─────────── */
  function resolveToOutcome(choice) {
    const ev = STATE.currentEvent;
    const outcome = ev.outcomes[choice.outcome];
    applyOutcomeEffects(outcome);
    renderHUD();
    if (checkFailure()) return;
    STATE.currentOutcomeId = choice.outcome;
    renderEncounterState();
  }

  window.triggerFleeResolve = function (choice) {
    resolveToOutcome(choice);
  };

  window.triggerRamResolve = function (choice) {
    const RAM_FAIL_CHANCE = 0.30;
    if (Math.random() < RAM_FAIL_CHANCE) {
      window.triggerCombat(choice, { ramFailed: true, ramHull: choice.hull || 18 });
    } else {
      resolveToOutcome(choice);
    }
  };

  window.triggerCombat = function (choice, opts) {
    if (COMBAT.active) return;
    opts = opts || {};
    const ramFailed = !!opts.ramFailed;
    const ramHull = opts.ramHull || 0;

    COMBAT.ai = STATE.activeAI;
    COMBAT.species = (STATE.npcCtx && STATE.npcCtx.species) || 'human';
    COMBAT.trail = STATE.trail;
    const roles = ['pilot', 'engineer', 'medic', 'botanist', 'chef', 'diplomat', 'xenobiologist', 'veteran', 'merchant'];
    COMBAT.crew = {};
    roles.forEach(r => { COMBAT.crew[r] = STATE.crew.includes(r); });
    COMBAT.captainBg = STATE.captain || '';

    COMBAT.player.hullMax = COMBAT_CONFIG.player_hp_max;
    COMBAT.player.hull = clamp(STATE.resources.hull, 1, COMBAT.player.hullMax);
    if (ramFailed) COMBAT.player.hull = clamp(COMBAT.player.hull - ramHull, 1, COMBAT.player.hullMax);
    COMBAT.player.morale = clamp(STATE.resources.morale, 0, 100);

    const speciesMul = speciesHpMod(COMBAT.species);
    const trailMul = COMBAT_CONFIG.trail_scaling[COMBAT.trail] || COMBAT_CONFIG.trail_scaling.mars;
    COMBAT.enemy.hpMod = speciesMul;
    COMBAT.enemy.dmgMod = trailMul.dmg;
    COMBAT.enemy.hullMax = Math.floor(COMBAT_CONFIG.base_hp * speciesMul * trailMul.hp);
    COMBAT.enemy.hull = COMBAT.enemy.hullMax;
    COMBAT.enemy.alive = true;
    COMBAT.enemy.surrendered = false;
    COMBAT.enemy.surrenderOffered = false;

    COMBAT.turn = 1;
    COMBAT.ftlCharge = -1;
    COMBAT.hullPatchUsed = false;
    COMBAT.tributeUsed = false;
    COMBAT.openingTurn = !ramFailed;
    COMBAT.evadingNextHit = false;
    COMBAT.identifiedByXeno = flagBonus('identify_enemy');
    COMBAT._firing = false;
    COMBAT._lastOutcome = null;
    COMBAT._narrPrefix = null;
    COMBAT.active = true;
    COMBAT.state = 'PLAYER_TURN';

    const screen = document.getElementById('screen-encounter');
    screen.classList.add('combat-mode');
    startCombatFx();
    document.getElementById('enc-choices').classList.add('combat-actions');
    const dialogEl = document.getElementById('enc-dialog');
    if (dialogEl) dialogEl.classList.add('hidden');

    if (ramFailed) {
      setNarrCombat('RAM FAILED — COMBAT', `Your bow glanced off their armor. The pirates wheel back, weapons hot. Hull -${ramHull}.`);
    } else {
      setNarrCombat('COMBAT LOG', combatLine('intro'));
    }
    setAiCombat(combatLine('intro'));

    // Xeno-identified enemy: the name plate becomes an intel readout
    // (demo D:5141-5144). No teardown needed — scene_art's applySubject
    // repaints the plain displayName when the next event's subject
    // renders (subjKey always changes across events), and on escape/
    // retreat the plate is hidden by combat-ftl-vanish anyway.
    if (COMBAT.identifiedByXeno) {
      const plate = document.getElementById('enc-subject-name');
      if (plate) plate.textContent = `PIRATE · ${COMBAT.species.toUpperCase()}  [${COMBAT.enemy.hullMax}HP · ${COMBAT_CONFIG.surrenders[COMBAT.species] ? 'WILL SURRENDER' : 'FIGHTS TO DEATH'}]`;
    }

    renderCombatHud();
    renderCombatActions();

    if (COMBAT.player.morale <= 10 && !ramFailed) {
      COMBAT.state = 'MUTINY';
      setNarrCombat('CREW MUTINY', 'The crew refuses to fire. Morale is gone before the fight even starts.', 'Stand down or wait for them to start shooting.');
      setAiCombat('Crew is not responding to combat orders.');
      renderCombatActions();
      showMutinyTurn();
      setTimeout(enemyTurn, 1200);
      return;
    }
    if (ramFailed) {
      showEnemyTurn();
      setTimeout(() => { if (COMBAT.active && COMBAT.state === 'PLAYER_TURN') enemyTurn(); }, 800);
    } else {
      showYourTurn();
    }
  };

})();
