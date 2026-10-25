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

   Parity with the demo (2026-10-11 pass): canvas FX, click-to-aim
   targeting, the demo's FX classes on the ship / captain, the demo's
   pacing, the full-width HP banner, the combat end card (loot tiles,
   notes, CLEAR view after an escape) and the demo's defeat-injury
   rule are all ported. Engine-side differences that remain, each an
   owner ruling: FIRE AT CENTER + Enter while targeting; STAND DOWN
   pays a toll; the pilot captain's coin-flip FTL and FTL miss rate;
   captain half-strength bonuses; REX's shield; BOOST SHIELDS is real
   (Shield Module). Loot is restricted to items that exist in
   items.json/materials.json (no invented circuit-board/O2-tank drops).
   Any fight — wherever the event started (a corridor, a derelict, a
   flat event with no NPC) — is fought from the bridge with their ship
   in the window and a pirate captain on the feed (ensureCombatStage).
   A choice may carry combat_intro: "<outcome id>" — that outcome's
   title/body/line open the fight (the pirate bluff's CALLED beat); it
   has no effects of its own (lint enforces both).

   Load-order note: this file loads via <script src> before
   index.html's inline script has declared MOD/STATE. Everything below
   is scoped inside the IIFE and only reads MOD/STATE/STATE-adjacent
   engine globals (applyOutcomeEffects, renderHUD, checkFailure,
   renderEncounterState, renderOutcomeView, clamp) inside function
   bodies invoked later — never at top-level/parse time.
   ──────────────────────────────────────────────────────────────── */
(function () {

  const AI_FALLBACK = {
    aria: 'Everything is going wonderfully!',
    marv: "I've calculated the odds. Please don't ask.",
    rex:  'Weapons on standby. Just in case.',
    chip: 'Before proceeding, have you considered our premium support tier?',
    ajoy: 'Evasive maneuvers cut the next hit. I\'d have used them by now. Just saying.'
  };

  /* Gameplay timers for this fight only: a load or abort bumps
     COMBAT.fight so a stale shot / victory / defeat can't resolve into
     the next run, and the chain waits while the pause menu is open. */
  function later(fn, ms) {
    const fight = COMBAT.fight;
    const run = () => {
      if (fight !== COMBAT.fight) return;
      if (PauseBus.paused) return setTimeout(run, 150);
      fn();
    };
    return setTimeout(run, ms);
  }
  // A reload mid-fight settles as ATTEMPT ESCAPE played out (owner ruling
  // 53; index.html loadRun → settleCombatBreakOff): the save carries what
  // that needs — the hull and morale as they stand, and the enemy's real
  // volley (damage, the drive's miss odds, the charge turns, what absorbs
  // a hit). ev: the event fought in (a station's arrival event still
  // leads on to the approach). extra.defeat: the defeat beat's own save.
  // won: a result already decided (a kill, a surrender offered or taken,
  // their retreat, our completed jump) — a reload lands it, never the
  // break-off (index.html loadRun → settleCombatWon).
  function saveFightPoint(extra) {
    if (STATE.ended) return;
    const charging = COMBAT.ftlCharge > 0;
    const won = COMBAT._won || (COMBAT.state === 'SURRENDER_DECISION' ? { outcome: 'victory_surrendered', moraleAdd: 5 } : null);
    const pc = {
      won, species: COMBAT.species,
      hull: COMBAT.player.hull, hullMax: COMBAT.player.hullMax,
      morale: COMBAT.player.morale == null ? null : COMBAT.player.morale - COMBAT.player.moraleStart,
      moraleNow: COMBAT.player.morale,
      ev: STATE.currentEvent ? STATE.currentEvent.id : null,
      volley: {
        min: COMBAT_CONFIG.enemy_damage.min, max: COMBAT_CONFIG.enemy_damage.max, mod: COMBAT.enemy.dmgMod,
        // The diplomat's opening-turn cut, when the first volley is still the fight's first shot.
        opening: COMBAT.turn === 1 ? openingCut() : 0,
        miss: ftlMissRate(),
        // Volleys still to come: a charge under way keeps its rolled turns.
        left: charging ? Math.max(1, COMBAT.ftlTurnsRolled - COMBAT.ftlCharge + 1) : null,
        pilot: pilotFtlChance(),
        shields: (COMBAT.rexShield ? 1 : 0) + (COMBAT.shieldArmed ? 1 : 0),
      },
    };
    writeSnapshot(undefined, { pendingCombat: Object.assign(pc, extra || {}) });
  }
  // The fight's result is decided (its beat still playing): saved now.
  function decided(result) { COMBAT._won = result; saveFightPoint(); }
  // The pirate's own voice (flavor_pools npc_disposition_lines.pirate,
  // species-coloured by index.html interpolateNpcTokens): their answer
  // when you open fire instead of paying, and their line when they give up.
  function pirateSays(slot) {
    const npc = STATE.npcCtx;
    if (!npc || npc.disposition !== 'pirate') return '';
    const line = interpolateNpcTokens('{npc.line.' + slot + '}', npc);
    return line && !/\{npc\./.test(line) ? '“' + line + '” ' : '';
  }
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
      // (veteran/merchant are captain backgrounds only — see captain_bonuses)
    },
    captain_bonuses: {
      pilot:         { evade_full_dodge: 0.12 }, // + the 2-turn FTL on a coin flip (pilotFtlChance)
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

  // Morale lines in a fight (demo-combat canon). Below the ship's own
  // MORALE_LOW the crew is shaky (EVADE only softens the hit).
  const MORALE_MUTINY = 10; // at or below: the crew refuses to fire
  const MORALE_PANIC  = 15; // below: EVADE softens even less
  const MORALE_STEADY = 70; // at or above: no missed shots, fewer defeat deaths
  const MORALE_KEEN   = 75; // at or above: a small crit edge
  const MORALE_HIGH   = 90; // at or above: the full crit edge, fewer defeat deaths still
  // The HUD bars (demo-combat): red at or below CRIT, amber at or below WARN.
  const BAR_CRIT_PCT = 25, BAR_WARN_PCT = 50;

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
    enemy: { hull: 50, hullMax: 50, alive: true, surrendered: false, surrenderOffered: false, dmgMod: 1.0 },
    ftlCharge: -1,
    hullPatchUsed: false,
    tributeUsed: false,
    openingTurn: true,
    evadingNextHit: false,
    identifiedByXeno: false,
    _firing: false,
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
      if (b && typeof b[key] === 'number') total += b[key] * COMBAT.crew[role];
    }
    // A captain of the same background as a crew member doesn't stack
    // with them: the better of the two counts (index.html specialistMult).
    if (COMBAT.captainBg) {
      const cb = COMBAT_CONFIG.captain_bonuses[COMBAT.captainBg];
      const same = COMBAT_CONFIG.crew_bonuses[COMBAT.captainBg];
      const crewSame = (COMBAT.crew[COMBAT.captainBg] && same && typeof same[key] === 'number') ? same[key] * COMBAT.crew[COMBAT.captainBg] : 0;
      if (cb && typeof cb[key] === 'number') total += Math.max(0, cb[key] - crewSame);
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
  /* Pilot passive (ftl_turns_override): a healthy crew pilot always
     spools the drive in 2 turns. At half strength (a pilot captain's
     skill_modifier, or a wounded crew pilot) the short spool is a coin
     flip, rolled when the charge starts (owner ruling 2026-10-11): a
     whole turn can't be halved, so it lands half the time instead. */
  function pilotFtlChance() {
    const cap = COMBAT.captainBg === 'pilot' ? captainSkill() : 0;
    return Math.max(COMBAT.crew.pilot || 0, cap);
  }
  // The diplomat's cut to the enemy's opening shot (0: none aboard).
  function openingCut() {
    if (COMBAT.crew.diplomat) return COMBAT_CONFIG.crew_bonuses.diplomat.opening_dmg_reduction * COMBAT.crew.diplomat;
    return COMBAT.captainBg === 'diplomat' ? COMBAT_CONFIG.captain_bonuses.diplomat.opening_dmg_reduction : 0;
  }
  // Odds an enemy shot goes wide while the drive spools.
  function ftlMissRate() {
    if (COMBAT.crew.pilot) return 0.35 + (0.75 - 0.35) * COMBAT.crew.pilot; // wounded pilot: halved edge
    if (COMBAT.captainBg === 'pilot') return 0.35 + (0.75 - 0.35) * 0.5; // captain: half the edge
    return 0.35;
  }
  function ftlTurns() {
    if (COMBAT.ftlCharge > 0 && COMBAT.ftlTurnsRolled) return COMBAT.ftlTurnsRolled;
    return pilotFtlChance() >= 1 ? COMBAT_CONFIG.crew_bonuses.pilot.ftl_turns_override : COMBAT_CONFIG.ftl_charge_turns;
  }
  function ftlTurnsLabel() {
    const c = pilotFtlChance();
    return (c > 0 && c < 1) ? COMBAT_CONFIG.crew_bonuses.pilot.ftl_turns_override + '–' + COMBAT_CONFIG.ftl_charge_turns : String(ftlTurns());
  }
  function critChance() {
    let total = COMBAT_CONFIG.crit_chance_base;
    if (COMBAT.captainBg === 'veteran') total += COMBAT_CONFIG.captain_bonuses.veteran.crit_bonus;
    if (COMBAT.identifiedByXeno) {
      if (COMBAT.crew.xenobiologist) total += COMBAT_CONFIG.crew_bonuses.xenobiologist.crit_bonus_on_identify * COMBAT.crew.xenobiologist;
      else if (COMBAT.captainBg === 'xenobiologist') total += COMBAT_CONFIG.captain_bonuses.xenobiologist.crit_bonus_on_identify;
    }
    // Per-crew morale (owner ruling 15): the crew average, seeded at the
    // fight's start. No crew aboard (null): no morale edge either way.
    const m = COMBAT.player.morale;
    if (m != null && m >= MORALE_HIGH) total += 0.05;
    else if (m != null && m >= MORALE_KEEN) total += 0.03;
    return total;
  }
  function playerMissChance() {
    const m = COMBAT.player.morale;
    if (m == null || m >= MORALE_STEADY) return 0; // the captain alone: no shaky crew
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
    const chip = document.getElementById('enc-ai-name');
    aiChip(chip, COMBAT.ai.toUpperCase(), text);
    document.getElementById('enc-ai-text').textContent = text;
    document.getElementById('enc-ai-bar').classList.remove('hidden');
    placeTurnIndicator();
    window.placeBelowAiBar();
  }
  /* The YOUR TURN banner sits at top 50 (demo) — below the AI bar when a
     long line wraps the bar past that (AJOY's 123-char intro does).
     Measured in stage px (offsetTop/Height). */
  function placeTurnIndicator() {
    const el = document.getElementById('combat-turn-indicator');
    const bar = document.getElementById('enc-ai-bar');
    if (!el || !bar) return;
    const below = (bar.classList.contains('hidden') || !bar.offsetHeight) ? 0 : bar.offsetTop + bar.offsetHeight + 4;
    el.style.top = below > 50 ? below + 'px' : '';
  }
  function setTurnIndicator(label, cls) {
    const el = document.getElementById('combat-turn-indicator');
    if (!el) return;
    el.textContent = label;
    el.style.display = '';
    el.classList.remove('your-turn', 'enemy-turn');
    el.classList.add(cls);
    placeTurnIndicator();
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

  function renderCombatHud() {
    if (COMBAT.active && COMBAT.state !== 'END') saveFightPoint(); // the morale, charge and shields as they stand
    const hPct = clamp(Math.round((COMBAT.player.hull / COMBAT.player.hullMax) * 100), 0, 100);
    const fPct = clamp(Math.round((COMBAT.enemy.hull  / COMBAT.enemy.hullMax)  * 100), 0, 100);
    const noMo = COMBAT.player.morale == null; // no crew aboard: no morale ("—")
    const mPct = noMo ? 0 : clamp(COMBAT.player.morale, 0, 100);
    const fillH = document.getElementById('combat-fill-hull');
    if (!fillH) return;
    fillH.style.width = hPct + '%';
    fillH.classList.remove('warn', 'crit');
    if (hPct <= BAR_CRIT_PCT) fillH.classList.add('crit'); else if (hPct <= BAR_WARN_PCT) fillH.classList.add('warn');
    document.getElementById('combat-num-hull').textContent = hPct + '%';
    document.getElementById('combat-fill-foe').style.width = fPct + '%';
    document.getElementById('combat-num-foe').textContent = fPct + '%';
    const fillM = document.getElementById('combat-fill-mor');
    fillM.style.width = mPct + '%';
    fillM.classList.remove('warn', 'crit');
    if (!noMo) { if (mPct <= BAR_CRIT_PCT) fillM.classList.add('crit'); else if (mPct <= BAR_WARN_PCT) fillM.classList.add('warn'); }
    document.getElementById('combat-num-mor').textContent = noMo ? '—' : (mPct > 0 ? Math.max(1, Math.round(mPct)) : 0); // fractional (daily ration drift): shown whole like the main HUD (crewMoraleAvg)
  }

  // Demo makeActionBtn: a crew/item-gated action shows the requirement's
  // icon (padlock when locked) — the encounter's own gate badge
  // (index.html gateIconPath + .enc-choice-gate / .has-gate grid).
  function makeActionBtn(opts) {
    const btn = document.createElement('button');
    btn.className = 'enc-choice' + (opts.locked ? ' locked' : '') + (opts.cls ? ' ' + opts.cls : '');
    if (opts.gate) {
      const g = document.createElement('div');
      g.className = 'enc-choice-gate' + (opts.locked ? ' locked' : '');
      const icon = opts.locked ? 'sprites/interface/lock.png' : gateIconPath(opts.gate);
      if (icon) g.style.backgroundImage = "url('" + icon + "')";
      btn.appendChild(g);
      btn.classList.add('has-gate');
    }
    const text = document.createElement('div');
    text.className = 'ch-text';
    text.textContent = opts.verb;
    btn.appendChild(text);
    if (opts.sub) {
      const sub = document.createElement('div');
      sub.className = 'ch-sub';
      const span = document.createElement('span');
      if (opts.locked) span.className = 'lock';
      span.textContent = opts.sub;
      sub.appendChild(span);
      btn.appendChild(sub);
    }
    if (!opts.locked && opts.onClick) btn.addEventListener('click', opts.onClick);
    // An ending's tooltip: what it costs in full, its days included.
    if (opts.tip) Tooltip.attach(btn, { description: opts.tip, tone: opts.tipTone });
    return btn;
  }

  function renderCombatActions() {
    const wrap = document.getElementById('enc-choices');
    if (!COMBAT.active) { wrap.innerHTML = ''; return; }
    if (COMBAT.state !== 'END') saveFightPoint(); // a charge begun or aborted, a shield armed
    // Entry cross-dissolve still running: it paints the panel when the
    // old choices have faded (triggerCombat).
    if (COMBAT._dissolving) return;

    // Combat is over (destroyed, FTL'd out, they jumped, we lost): the
    // buttons fade out and STAY out through the wreck / escape hold —
    // never a repaint of the PLAYER_TURN column (demo D:5236-5250).
    if (COMBAT.state === 'END') {
      const existing = Array.from(wrap.children).filter(el => !el.classList.contains('combat-fading-out'));
      existing.forEach((el, i) => {
        el.style.animationDelay = (i * 40) + 'ms';
        el.classList.add('combat-fading-out');
      });
      if (existing.length) {
        later(() => {
          // Only clear what faded — the victory choice / end card may
          // have painted the column since.
          if ([...wrap.children].every(el => el.classList.contains('combat-fading-out'))) wrap.innerHTML = '';
        }, 700);
      }
      return;
    }
    wrap.innerHTML = '';

    if (COMBAT.state === 'MUTINY') {
      const yields = !!COMBAT_CONFIG.surrenders[COMBAT.species];
      wrap.appendChild(makeActionBtn({ verb: 'STAND DOWN',
        sub: yields ? 'Yield a toll: −25% fuel, −20% gold · ' + daysText('yielded') : 'They won\'t take a yield: limp away · ' + daysText('defeated'),
        tip: yields ? 'They let you go for a toll: a quarter of the fuel and a fifth of the gold, no loot. Takes ' + daysText('yielded') + '.'
          : 'They won\'t accept a yield: the ship limps away at hull 1 and loses cargo, as a lost fight does. Takes ' + daysText('defeated') + '.',
        cls: 'combat-danger', onClick: resolveMutinyStandDown }));
      return;
    }
    if (COMBAT.state === 'SURRENDER_DECISION') {
      const crewMo = COMBAT.player.morale != null; // no crew aboard: no morale to promise
      wrap.appendChild(makeActionBtn({ verb: 'ACCEPT SURRENDER', sub: '40% loot' + (crewMo ? ' · morale +5' : '') + ' · ' + daysText('victory_surrendered'),
        tip: 'Strip their ship and let them go: about 40% of the loot' + (crewMo ? ', crew morale +5' : '') + '. Takes ' + daysText('victory_surrendered') + '.',
        cls: 'combat-tribute', onClick: acceptSurrender }));
      wrap.appendChild(makeActionBtn({ verb: 'FINISH THEM', sub: 'Full loot' + (crewMo ? ' · morale -10' : '') + ' · ' + daysText('victory_executed'),
        tip: 'Destroy the surrendered ship: the full loot' + (crewMo ? ', crew morale −10' : '') + ', and the deed is remembered (later events know). Takes ' + daysText('victory_executed') + '.',
        tipTone: 'danger', cls: 'combat-danger', onClick: finishSurrendered }));
      return;
    }
    if (COMBAT.state === 'FTL_CHARGING') {
      const turns = ftlTurns();
      const pct = Math.round((COMBAT.ftlCharge / turns) * 100);
      const pane = document.createElement('div');
      pane.className = 'combat-ftl-progress';
      pane.innerHTML = `FTL CHARGE: ${pct}%<br><span class="ftl-turn">TURN ${COMBAT.ftlCharge} / ${turns}</span>` +
        `<div class="ftl-bar"><div class="ftl-bar-fill" style="width:${pct}%"></div></div>`;
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
    // ENEMY_TURN / RESOLVING: the panel keeps the PLAYER_TURN buttons,
    // locked (showEnemyTurn dims it) — fall through.

    // Odds shown are the real ones (a wounded crew member halves them; a
    // captain of that background offers at half strength).
    const tribPct = k => Math.round(tributeTerms(k).odds * 100);
    if (COMBAT.openingTurn && tributeTerms('botanist')) {
      wrap.appendChild(makeActionBtn({ verb: 'OFFER HARVEST', sub: 'Botanist · ' + tribPct('botanist') + '% · -' + tributeTerms('botanist').cfg.tribute_food_cost + ' food · opening only', tip: tributeTip('botanist'), cls: 'combat-tribute', gate: { crew: 'botanist' }, onClick: () => offerTribute('botanist') }));
    }
    if (COMBAT.openingTurn && tributeTerms('chef')) {
      wrap.appendChild(makeActionBtn({ verb: 'OFFER COOKIES', sub: 'Chef · ' + tribPct('chef') + '% · -' + tributeTerms('chef').cfg.tribute_food_cost + ' food · they remember you', tip: tributeTip('chef'), cls: 'combat-tribute', gate: { crew: 'chef' }, onClick: () => offerTribute('chef') }));
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
      sub: (COMBAT.player.morale != null && COMBAT.player.morale < MORALE_LOW ? 'Soften next hit (shaky crew)' : 'Halve next hit') + (bonus('evade_full_dodge') > 0 ? ' · ' + Math.round(bonus('evade_full_dodge') * 100) + '% full dodge' : ''),
      cls: 'combat-evade', onClick: doEvade
    }));

    const hasEng = COMBAT.crew.engineer || COMBAT.captainBg === 'engineer';
    if (hasEng) {
      const hpRatio = COMBAT.player.hull / COMBAT.player.hullMax;
      const patchPct = COMBAT.crew.engineer ? Math.round(25 * COMBAT.crew.engineer) : 12;
      const avail = hpRatio <= 0.50 && !COMBAT.hullPatchUsed;
      wrap.appendChild(makeActionBtn({
        verb: 'HULL PATCH',
        sub: COMBAT.hullPatchUsed ? 'Already used this combat'
             : (hpRatio > 0.50 ? `Available below 50% hull · +${patchPct}%` : `Engineer · +${patchPct}% hull · free action`),
        locked: !avail, cls: 'combat-special', gate: { crew: 'engineer' }, onClick: doHullPatch
      }));
    }

    // BOOST SHIELDS (COMBAT_SYSTEM_HANDOFF.md §v2): the station-bought
    // Shield Module arms a full block of the next incoming hit. Free
    // action, once per fight, item not consumed. Item-gated like the
    // encounter's item gates (module icon, padlock without it).
    const hasShield = STATE.items.includes('shield_module_upgrade');
    wrap.appendChild(makeActionBtn({
      verb: 'BOOST SHIELDS',
      sub: !hasShield ? 'Requires Shield Module (stations)'
           : COMBAT.shieldArmed ? 'Shields up · next hit blocked'
           : COMBAT.shieldUsed ? 'Already used this combat' : 'Block the next hit · free action · once per fight',
      locked: !hasShield || COMBAT.shieldUsed, cls: 'combat-special', gate: { item: 'shield_module_upgrade' }, onClick: doBoostShields
    }));

    wrap.appendChild(makeActionBtn({
      verb: 'ATTEMPT ESCAPE', sub: `${ftlTurnsLabel()}-turn FTL charge · -15 fuel · ${daysText('escape')}`,
      tip: `The drive spools for ${ftlTurnsLabel()} turns while they keep firing; if it jumps, −15 fuel and the escape takes ${daysText('escape')}.`,
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

  const FX = { beams: [], particles: [], sparks: [], mouseX: 480, mouseY: 320, mouseInside: false, running: false };
  function fxScreen() { return document.getElementById('screen-encounter'); }
  // #game is CSS-scaled to fit small viewports (fitGameToViewport); every
  // rect-derived coordinate must be divided back into the screen's own
  // layout pixels, which the fx canvases (960×640 at their natural size,
  // from the screen's top-left) and the aim logic live in. The scale is
  // the screen's rect over its own layout width: #game's frame may sit
  // inside its 960px (a 958px interior) or outside it.
  function screenScale(rect, el) {
    const w = (el || fxScreen()).offsetWidth;
    return (rect && rect.width && w) ? rect.width / w : 1;
  }
  function enemyShipCenter() {
    const sp = document.getElementById('enc-backdrop-sprite');
    const sr = fxScreen().getBoundingClientRect();
    const r = sp.getBoundingClientRect();
    if (!r.width) return { x: 480, y: 295 }; // sprite hidden/unresolved — window center
    const s = screenScale(sr, fxScreen());
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
    // ASCII "-": Press Start 2P draws U+2212 as an underscore.
    el.textContent = variant === 'crit' ? `-${amount}!` : `-${amount}`;
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
        gravity: rand(0.05, 0.10), size: irand(3, 11), color: pickRandom(colors),
        life: 0, ttl: rand(700, 1500),
      });
    }
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2, speed = rand(50, 140);
      FX.particles.push({
        x: c.x, y: c.y,
        vx: Math.cos(angle) * speed * 0.012, vy: Math.sin(angle) * speed * 0.012 - rand(1.0, 2.0),
        gravity: rand(0.07, 0.12), size: irand(10, 18),
        color: pickRandom(['#aa6634', '#7a4020', '#9098a8', '#5a4030']),
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
          color: pickRandom(colors),
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
    later(() => { if (typeof onDone === 'function') onDone(); }, 3000);
  }
  function preExplosionShake() {
    const sp = document.getElementById('enc-backdrop-sprite');
    sp.classList.remove('combat-pre-explode');
    void sp.offsetWidth;
    sp.classList.add('combat-pre-explode');
  }
  // Their feed dies with their ship (demo D:6421-6450): static flicker,
  // CRT collapse, name plate shrink-fade, then an inline opacity pin so
  // nothing that later strips a class can bring the face back before the
  // next event resets the stage. The frame's entrance .flash is dropped
  // first — it is an animation too, and must not hold the frame.
  function triggerCaptainCrtOff() {
    const subject = document.getElementById('enc-subject');
    if (!subject) return;
    subject.classList.remove('flash', 'combat-locking');
    const stat = document.createElement('div');
    stat.className = 'combat-crt-static';
    subject.appendChild(stat);
    setTimeout(() => stat.remove(), 320);
    subject.classList.remove('combat-crt-off');
    void subject.offsetWidth;
    subject.classList.add('combat-crt-off');
    const namePlate = document.getElementById('enc-subject-name');
    if (namePlate) {
      namePlate.classList.remove('combat-crt-off-name');
      void namePlate.offsetWidth;
      namePlate.classList.add('combat-crt-off-name');
    }
    later(() => {
      if (subject.classList.contains('combat-crt-off')) subject.style.opacity = '0';
      if (namePlate && namePlate.classList.contains('combat-crt-off-name')) namePlate.style.opacity = '0';
    }, 800);
  }
  // Destruction beat shared by a kill shot and FINISH THEM (demo
  // D:5985-5996, 6036-6059): rattle 380ms, then particles + the ship
  // fading out + the captain's CRT-off.
  function destroyEnemyShip() {
    preExplosionShake();
    later(() => {
      spawnDestructionParticles();
      const sp = document.getElementById('enc-backdrop-sprite');
      sp.classList.remove('combat-pre-explode', 'combat-low-hp', 'combat-shake', 'combat-hit');
      sp.style.transition = 'opacity 0.30s ease';
      sp.style.opacity = '0';
      triggerCaptainCrtOff();
    }, 380);
  }
  let _fxLastTs = 0;
  function combatFxLoop(ts) {
    const fxCanvas = document.getElementById('combat-fx-canvas');
    const cursorCanvas = document.getElementById('combat-cursor-canvas');
    if (!fxCanvas || !cursorCanvas || !COMBAT.active && !FX.beams.length && !FX.particles.length && !FX.sparks.length) { FX.running = false; return; }
    if (PauseBus.paused) { _fxLastTs = ts; requestAnimationFrame(combatFxLoop); return; }
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
      const s = screenScale(r, screen);
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
    if (PauseBus.paused) return;
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
    setAiCombat('Targeting canceled.');
    renderCombatActions();
  }

  function resolveFire(tx, ty) {
    if (!COMBAT.active || COMBAT.state !== 'TARGETING' || COMBAT._firing) return;
    COMBAT._firing = true;
    // The shot commits the turn — no second Enter/click can fire again
    // while it resolves (enemyTurn hands the turn back).
    COMBAT.state = 'ENEMY_TURN';
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

    later(() => {
      if (Math.random() < playerMissChance()) {
        spawnMissPopup('MISS!');
        setNarrCombat('COMBAT LOG', 'Shot went wide — shaky hands at the trigger.', 'Composure fraying. Crew morale showing.');
        // The AI reports the miss (demo D:5450) — not a player_fires brag.
        setAiCombat('Shot missed. The crew\'s hands are unsteady.');
        bumpMorale(-1);
        COMBAT._firing = false;
        later(enemyTurn, 700);
        return;
      }
      let dmg = irand(COMBAT_CONFIG.player_damage.min, COMBAT_CONFIG.player_damage.max);
      let dmgMul = 1 + bonus('fire_dmg_bonus_flat');
      if (COMBAT.identifiedByXeno) {
        const fb = COMBAT.crew.xenobiologist ? COMBAT_CONFIG.crew_bonuses.xenobiologist.fire_dmg_bonus * COMBAT.crew.xenobiologist
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
        `${isCrit ? 'CRITICAL HIT — e' : 'E'}nemy hull -${dmg}. Theirs: ${Math.max(0, COMBAT.enemy.hull)}/${COMBAT.enemy.hullMax}.`); // their hull, never read as ours
      if (!COMBAT.enemy.alive) { onEnemyDestroyed(); return; }
      if (!COMBAT.enemy.surrendered && !COMBAT.enemy.surrenderOffered &&
          (COMBAT.enemy.hull / COMBAT.enemy.hullMax) <= COMBAT_CONFIG.surrender_threshold &&
          COMBAT_CONFIG.surrenders[COMBAT.species]) {
        setNarrCombat('COMBAT LOG', combatLine('enemy_low_hp'),
          `Enemy hull: ${Math.max(0, COMBAT.enemy.hull)}/${COMBAT.enemy.hullMax}. They may surrender.`);
      }
      COMBAT._firing = false;
      later(enemyTurn, 700);
    }, 280);
  }

  function doEvade() {
    if (!COMBAT.active || COMBAT.state !== 'PLAYER_TURN') return;
    COMBAT.state = 'ENEMY_TURN'; // committed — a second activation is a no-op
    COMBAT.openingTurn = false;
    COMBAT.evadingNextHit = true;
    setNarrCombat('COMBAT LOG', combatLine('player_evades'), 'Evasive pattern engaged. The next hit is softened' + (bonus('evade_full_dodge') > 0 ? ', with a ' + Math.round(bonus('evade_full_dodge') * 100) + '% chance to dodge it entirely.' : '.'));
    setAiCombat(combatLine('player_evades'));
    showEnemyTurn();
    later(enemyTurn, 600);
  }

  function doHullPatch() {
    if (!COMBAT.active || COMBAT.state !== 'PLAYER_TURN' || COMBAT.hullPatchUsed) return;
    if ((COMBAT.player.hull / COMBAT.player.hullMax) > 0.50) return;
    const pct = COMBAT.crew.engineer ? COMBAT_CONFIG.crew_bonuses.engineer.hull_patch_pct * COMBAT.crew.engineer : COMBAT_CONFIG.captain_bonuses.engineer.hull_patch_pct;
    const heal = Math.round(COMBAT.player.hullMax * pct);
    COMBAT.player.hull = clamp(COMBAT.player.hull + heal, 0, COMBAT.player.hullMax);
    COMBAT.hullPatchUsed = true;
    COMBAT.openingTurn = false;
    setNarrCombat('COMBAT LOG', combatLine('hull_patch'), `Hull restored +${heal}. Hull: ${COMBAT.player.hull}/${COMBAT.player.hullMax}. Free action — fire when ready.`);
    setAiCombat(combatLine('hull_patch'));
    renderCombatHud();
    renderCombatActions();
  }

  function doBoostShields() {
    if (!COMBAT.active || COMBAT.state !== 'PLAYER_TURN' || COMBAT.shieldUsed) return;
    if (!STATE.items.includes('shield_module_upgrade')) return;
    COMBAT.shieldUsed = true;
    COMBAT.shieldArmed = true;
    COMBAT.openingTurn = false;
    setNarrCombat('COMBAT LOG', 'Shield module spun up. The emitters hum at a pitch the crew will hear in their sleep.', 'Shields up: the next incoming hit is blocked completely. Free action — fire when ready.');
    setAiCombat('Shields at full. One hit. Make it count.');
    renderCombatActions();
  }

  function beginFtlCharge() {
    if (!COMBAT.active || COMBAT.state !== 'PLAYER_TURN') return;
    COMBAT.openingTurn = false;
    COMBAT.state = 'FTL_CHARGING';
    const c = pilotFtlChance();
    COMBAT.ftlTurnsRolled = (c >= 1 || (c > 0 && Math.random() < c)) ? COMBAT_CONFIG.crew_bonuses.pilot.ftl_turns_override : COMBAT_CONFIG.ftl_charge_turns;
    COMBAT.ftlCharge = 1;
    fxScreen().classList.add('combat-ftl-charging');
    setNarrCombat('COMBAT LOG', combatLine('ftl_charging'), `FTL spool turn 1 of ${ftlTurns()}. Enemy fire continues.`);
    setAiCombat(combatLine('ftl_charging'));
    showEnemyTurn();
    renderCombatActions();
    later(enemyTurn, 700);
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

  // Tribute terms for a botanist/chef offer: the crew member's (halved
  // while wounded), else a captain of that background's half-strength
  // table — whichever is better; null when nobody aboard can offer it.
  function tributeTerms(kind) {
    const crewCfg = COMBAT_CONFIG.crew_bonuses[kind];
    const capCfg = COMBAT.captainBg === kind ? COMBAT_CONFIG.captain_bonuses[kind] : null;
    const crew = COMBAT.crew[kind] ? { cfg: crewCfg, odds: crewCfg.tribute_success * COMBAT.crew[kind] } : null;
    const cap = capCfg ? { cfg: capCfg, odds: capCfg.tribute_success } : null;
    if (crew && cap) return cap.odds > crew.odds ? cap : crew;
    return crew || cap;
  }

  // A tribute offer's tooltip: the odds, the food (spent either way) and,
  // if they take it, the days the ending costs.
  function tributeTip(kind) {
    const t = tributeTerms(kind);
    return Math.round(t.odds * 100) + '% they take it: −' + t.cfg.tribute_food_cost + ' food either way. Taken, the fight ends' + (kind === 'chef' ? ' and they remember you' : '') + ': ' + daysText('tribute') + '. Refused, the fight goes on.';
  }
  function offerTribute(kind) {
    if (!COMBAT.active || COMBAT.state !== 'PLAYER_TURN' || COMBAT.tributeUsed || !COMBAT.openingTurn || !tributeTerms(kind)) return;
    COMBAT.tributeUsed = true; COMBAT.openingTurn = false;
    COMBAT.state = 'ENEMY_TURN'; // no firing while they consider the offer
    setAiCombat(combatLine('tribute_offered'));
    setNarrCombat('COMBAT LOG', combatLine('tribute_offered'), 'Awaiting response.');
    showEnemyTurn();
    renderCombatActions();
    const terms = tributeTerms(kind), cfg = terms.cfg;
    const label = kind === 'botanist' ? 'harvest' : 'cookies';
    later(() => {
      const success = Math.random() < terms.odds;
      if (success) {
        const crewMo = COMBAT.player.morale != null;
        if (crewMo) COMBAT.player.morale = clamp(COMBAT.player.morale + cfg.morale_on_success, 0, 100);
        setNarrCombat('TRIBUTE ACCEPTED', combatLine('tribute_success'), `-${cfg.tribute_food_cost} food` + (crewMo ? ` · morale +${cfg.morale_on_success}` : ''));
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
        const foodBefore = STATE.resources.food;
        STATE.resources.food = clamp(STATE.resources.food - cfg.tribute_food_cost, 0, resMax('food'));
        COMBAT.foodSpent = (COMBAT.foodSpent || 0) + (foodBefore - STATE.resources.food); // end-card notes
        renderHUD();
        later(enemyTurn, 700);
      }
    }, 900);
  }

  function resolveMutinyStandDown() {
    if (!COMBAT.active || COMBAT.state !== 'MUTINY') return;
    if (COMBAT_CONFIG.surrenders[COMBAT.species]) {
      // Owner ruling 2026-10-11: yielding is survivable, never profitable —
      // they let you go for a toll (−25% fuel, −20% gold), no loot.
      COMBAT.state = 'END';
      setAiCombat(combatLine('player_defeated'));
      endCombatToOutcome({ outcome: 'yielded' });
    } else {
      COMBAT.player.hull = 1;
      onPlayerDefeat();
    }
  }

  /* ── Enemy turn ─────────────────────────────────────────────── */
  function enemyTurn() {
    if (!COMBAT.active || COMBAT.state === 'END') return;

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
        setNarrCombat('SURRENDER OFFERED', combatLine('enemy_surrenders'), pirateSays('defeated') + 'Their fire ceases. They wait.');
        showYourTurn();
        renderCombatActions();
        return;
      }
    }

    setAiCombat(combatLine('enemy_fires'));
    let dmg = irand(COMBAT_CONFIG.enemy_damage.min, COMBAT_CONFIG.enemy_damage.max) * COMBAT.enemy.dmgMod;

    if (COMBAT.turn === 1) dmg *= (1 - openingCut());

    let dodgedFull = false;
    if (COMBAT.evadingNextHit) {
      const fullDodge = bonus('evade_full_dodge');
      if (fullDodge > 0 && Math.random() < fullDodge) { dmg = 0; dodgedFull = true; }
      else {
        let evadeFactor = 0.5;
        if (COMBAT.player.morale != null && COMBAT.player.morale < MORALE_PANIC) evadeFactor = 0.75;
        else if (COMBAT.player.morale != null && COMBAT.player.morale < MORALE_LOW) evadeFactor = 0.65;
        dmg *= evadeFactor;
      }
      COMBAT.evadingNextHit = false;
    }

    let ftlMiss = false;
    if (COMBAT.state === 'FTL_CHARGING') {
      if (Math.random() < ftlMissRate()) { dmg = 0; ftlMiss = true; }
    }

    // Their beam: enemy ship center → random point on the bridge
    // window's bottom edge, heading "toward us" (demo canon).
    const ecFire = enemyShipCenter();
    spawnBeam({
      side: 'enemy', sx: ecFire.x, sy: ecFire.y,
      ex: WIN.left + 80 + Math.random() * (WIN.right - WIN.left - 160),
      ey: WIN.bottom,
    });

    later(() => {
      // The fight may have resolved while the beam was in flight (stand
      // down, surrender, a kill) — a stale shot must not land.
      if (!COMBAT.active || COMBAT.state === 'END') return;
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
      } else if (COMBAT.shieldArmed && !COMBAT.rexShield) {
        COMBAT.shieldArmed = false;
        spawnMissPopup('BLOCKED');
        setNarrCombat('COMBAT LOG', pfx + combatLine('enemy_fires'), 'The shield module takes the shot and gives it back as light. Hull untouched.');
        setAiCombat('Shield held. It will not hold again this fight.');
        COMBAT._narrPrefix = null;
        renderCombatActions();
      } else if (COMBAT.rexShield) {
        // REX's passive (ai_companions combat_bonus — "an extra life"):
        // the first hit of every fight lands on point-defense instead.
        COMBAT.rexShield = false;
        spawnMissPopup('BLOCKED');
        setNarrCombat('COMBAT LOG', pfx + combatLine('enemy_fires'), 'REX’s point-defense eats the shot. Hull untouched. Once.');
        setAiCombat('Point-defense engaged. That was the free one. Do not get comfortable.');
        COMBAT._narrPrefix = null;
      } else if (STATE.flags.has('emergency_patch_armed')) {
        // Emergency Patch (engineer active skill): one hull damage event
        // absorbed — in a fight, that's one landed hit.
        STATE.flags.delete('emergency_patch_armed');
        spawnMissPopup('PATCHED');
        setNarrCombat('COMBAT LOG', pfx + combatLine('enemy_fires'), 'The emergency patch takes the hit and does not survive it. Hull untouched.');
        COMBAT._narrPrefix = null;
        renderCombatActions();
      } else {
        const dealt = Math.max(1, Math.round(dmg));
        applyPlayerDamage(dealt);
        setNarrCombat('COMBAT LOG', pfx + combatLine('enemy_fires'), `Our hull -${dealt}. Ours: ${Math.max(0, COMBAT.player.hull)}/${COMBAT.player.hullMax}.`);
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
        if (COMBAT.state === 'PLAYER_TURN' && COMBAT.player.morale != null && COMBAT.player.morale <= MORALE_MUTINY) {
          COMBAT.state = 'MUTINY';
          setNarrCombat('CREW MUTINY', 'The crew refuses to fire. Morale is gone.', "They're looking at you. Stand down or wait for the next shot.");
          setAiCombat('Crew has stopped responding to combat orders.');
        }
      }
      renderCombatActions();
      renderCombatHud();
      if (COMBAT.state === 'PLAYER_TURN') showYourTurn();
      else if (COMBAT.state === 'MUTINY') showMutinyTurn();
      if (COMBAT.state === 'FTL_CHARGING' && COMBAT.active) COMBAT._ftlTickTimer = later(enemyTurn, 1500);
      if (COMBAT.state === 'MUTINY' && COMBAT.active) later(enemyTurn, 1800);
    }, 320);
  }

  // Enemy FTLs out instead of surrendering — same pinpoint-bloom flash
  // as our escape (their drive lights up before they're gone). Charge
  // telegraph first (cyan hull glow + converging particles, 1000ms,
  // demo D:5745-5764), then the shared vanish/flash/empty-bridge beat.
  function enemyRetreats() {
    if (COMBAT._ftlTickTimer) { clearTimeout(COMBAT._ftlTickTimer); COMBAT._ftlTickTimer = null; }
    COMBAT.state = 'END';
    decided({ outcome: 'enemy_retreat' });
    hideTurnIndicator();
    fxScreen().classList.remove('combat-ftl-charging');
    fxScreen().classList.add('combat-ended');
    setAiCombat('Enemy drive spool detected. They are leaving.');
    setNarrCombat('ENEMY RETREAT', "Their drive lights up. They're jumping out — saving their hide instead of waiting to be looted.", 'No loot. No morale change.');
    renderCombatActions(); // actions fade out and stay out through the hold
    const sp = document.getElementById('enc-backdrop-sprite');
    sp.classList.add('combat-enemy-charge');
    spawnEnemyChargeParticles();
    later(() => {
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
      decided({ outcome: 'escape', fuelCost: 15 });
      fxScreen().classList.add('combat-ended');
      hideTurnIndicator();
      if (COMBAT._ftlTickTimer) { clearTimeout(COMBAT._ftlTickTimer); COMBAT._ftlTickTimer = null; }
      // Beat so the enemy's final shot can be read (demo 800ms), then
      // vanish + flash + ~3s hold. The action column fades out now and
      // stays out through the hold (renderCombatActions END branch).
      later(() => {
        triggerFtlJumpEffect(() => endCombatToOutcome({ outcome: 'escape', fuelCost: 15 }));
      }, 800);
    }
  }

  /* ── Damage / morale ────────────────────────────────────────── */
  function applyEnemyDamage(amount) {
    COMBAT.enemy.hull = clamp(COMBAT.enemy.hull - amount, 0, COMBAT.enemy.hullMax);
    // Their ship AND their captain take the hit (demo applyEnemyDamage):
    // red flash 150ms + shake on the viewport sprite, the same flinch on
    // the captain's head (scene_art subjectFX). Both self-clear, so the
    // ship's idle bob resumes once the shake has played.
    SceneArt.subjectFX('hit');
    const sp = document.getElementById('enc-backdrop-sprite');
    sp.classList.add('combat-hit');
    setTimeout(() => sp.classList.remove('combat-hit'), 150);
    sp.classList.remove('combat-shake'); void sp.offsetWidth; sp.classList.add('combat-shake');
    clearTimeout(sp._shakeT);
    sp._shakeT = setTimeout(() => sp.classList.remove('combat-shake'), 420);
    // Low-HP red glow — telegraphs the surrender/critical zone (≤35%,
    // demo D:5826-5828).
    const ratio = COMBAT.enemy.hull / COMBAT.enemy.hullMax;
    sp.classList.toggle('combat-low-hp', ratio > 0 && ratio <= 0.35);
    if (COMBAT.enemy.hull <= 0) COMBAT.enemy.alive = false;
    renderCombatHud();
  }
  function applyPlayerDamage(amount) {
    COMBAT.player.hull = clamp(COMBAT.player.hull - amount, 0, COMBAT.player.hullMax);
    saveFightPoint();
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
      const s = screenScale(sr, screen);
      spawnDamageFloater(amount, ((hr.left - sr.left) + hr.width / 2) / s, ((hr.top - sr.top) - 12) / s, 'player-hit');
    }
    renderCombatHud();
  }
  function bumpMorale(delta) {
    if (!COMBAT.active || COMBAT.player.morale == null) return;
    COMBAT.player.morale = clamp(COMBAT.player.morale + delta, 0, 100);
    renderCombatHud();
  }

  /* ── Outcomes ───────────────────────────────────────────────── */
  function onEnemyDestroyed() {
    COMBAT.state = 'END';
    COMBAT._firing = false;
    // Until SALVAGE or LEAVE is picked, a reload takes the lesser haul.
    decided({ outcome: 'victory_destroyed', salvaged: false });
    hideTurnIndicator();
    fxScreen().classList.remove('combat-targeting', 'combat-ftl-charging');
    fxScreen().classList.add('combat-ended');
    renderCombatActions(); // fade out; nothing comes back until the victory choice
    // Demo-canon destruction sequence: pre-explosion rattle (380ms) →
    // particle scatter + ship sprite fade + CRT-off on the captain's
    // feed → hold on the empty space → victory choice.
    setAiCombat(combatLine('enemy_destroyed'));
    setNarrCombat('TARGET DESTROYED', combatLine('enemy_destroyed'), 'Wreckage drifting.');
    destroyEnemyShip();
    later(() => showVictoryChoice(), 2200);
  }
  function showVictoryChoice() {
    setActionsLocked(false);
    const wrap = document.getElementById('enc-choices');
    wrap.innerHTML = '';
    wrap.appendChild(makeActionBtn({
      verb: 'SALVAGE WRECKAGE', sub: 'Full loot · bonus crate roll · ' + daysText('salvaged'), cls: 'combat-special',
      tip: 'Crack the wreck open: the full loot and a bonus crate roll. Takes ' + daysText('salvaged') + '.',
      onClick: () => resolveVictoryChoice({ outcome: 'victory_destroyed', salvaged: true })
    }));
    wrap.appendChild(makeActionBtn({
      verb: 'LEAVE IT', sub: 'Partial loot · back sooner · ' + daysText('departed'),
      tip: 'Take what floats free and go: partial loot, back on course sooner. Takes ' + daysText('departed') + '.',
      onClick: () => resolveVictoryChoice({ outcome: 'victory_destroyed', salvaged: false })
    }));
  }
  function resolveVictoryChoice(result) {
    if (COMBAT._resolved || COMBAT._victoryPicked) return;
    COMBAT._victoryPicked = true;
    decided(result);
    document.getElementById('enc-choices').innerHTML = '';
    setNarrCombat('TARGET DESTROYED',
      result.salvaged ? 'Wreckage cracked open. Loot pool drawn.' : 'You leave the wreck behind.',
      result.salvaged ? 'Bonus crate roll incoming…' : 'Drifting through your wake.');
    later(() => endCombatToOutcome(result), 900);
  }
  function acceptSurrender() {
    if (!COMBAT.active || COMBAT.state !== 'SURRENDER_DECISION') return;
    COMBAT.state = 'END';
    const crewMo = COMBAT.player.morale != null;
    if (crewMo) COMBAT.player.morale = clamp(COMBAT.player.morale + 5, 0, 100);
    decided({ outcome: 'victory_surrendered' });
    hideTurnIndicator();
    fxScreen().classList.add('combat-ended');
    setAiCombat(combatLine('surrender_accepted'));
    setNarrCombat('SURRENDER ACCEPTED', combatLine('surrender_accepted'), '40% of the loot' + (crewMo ? ' · morale +5' : ''));
    endCombatToOutcome({ outcome: 'victory_surrendered' });
  }
  // FINISH THEM — the surrendered ship is destroyed on screen like any
  // kill (demo D:6036-6059): red alert off at once, actions fade out,
  // rattle → particles → ship fade → CRT-off, end card at 1500ms.
  function finishSurrendered() {
    if (!COMBAT.active || COMBAT.state !== 'SURRENDER_DECISION') return;
    COMBAT.state = 'END';
    const crewMo = COMBAT.player.morale != null;
    if (crewMo) COMBAT.player.morale = clamp(COMBAT.player.morale - 10, 0, 100);
    COMBAT.enemy.hull = 0; COMBAT.enemy.alive = false;
    decided({ outcome: 'victory_executed' });
    hideTurnIndicator();
    fxScreen().classList.add('combat-ended');
    renderCombatActions();
    setAiCombat(combatLine('surrender_refused'));
    setNarrCombat('SURRENDER REFUSED', combatLine('surrender_refused'), crewMo ? 'Full loot recovered. Morale -10. The crew witnessed it.' : 'Full loot recovered. Nobody aboard to witness it but you.');
    renderCombatHud();
    destroyEnemyShip();
    later(() => endCombatToOutcome({ outcome: 'victory_executed' }), 1500);
  }
  /* Defeat casualties — demo rule (owner ruling 2026-10-11; demo
     D:6069-6099). Death is rare, injury the norm:
       death   12% − medic bonus − high-morale bonus, floor 3%
       injury  75%, × 0.5 with a crew medic (× 0.75 at half strength: a
               medic captain or a wounded medic — the passive rule)
       second  30% for a second injured crew member once one is hurt
       death with nobody injured → 50% one injury anyway
     Counts are clamped to the crew actually aboard. What an injury DOES
     is the engine's severity model: applySeverity(role, 'injury'). */
  function rollDefeatCasualties() {
    let deathChance = 0.12 - bonus('defeat_death_reduction');
    if (COMBAT.player.morale != null && COMBAT.player.morale >= MORALE_STEADY) deathChance -= 0.04;
    if (COMBAT.player.morale != null && COMBAT.player.morale >= MORALE_HIGH) deathChance -= 0.02;
    deathChance = Math.max(0.03, deathChance);
    // Everyone aboard can be a casualty — the captain too (owner ruling 29,
    // index.html peopleAboard).
    const aboard = peopleAboard().length;
    const died = aboard > 0 && Math.random() < deathChance;
    const medic = passiveMult('medic');
    const injuryChance = 0.75 * (1 - 0.5 * medic);
    let injured = Math.random() < injuryChance ? 1 : 0;
    if (injured > 0 && Math.random() < 0.30) injured = 2;
    if (died && injured === 0 && Math.random() < 0.50) injured = 1;
    injured = Math.min(injured, aboard - (died ? 1 : 0));
    return { died, injured, deathChance, injuryChance };
  }
  function onPlayerDefeat() {
    COMBAT.state = 'END';
    COMBAT._firing = false;
    hideTurnIndicator();
    fxScreen().classList.remove('combat-targeting', 'combat-ftl-charging');
    fxScreen().classList.add('combat-ended'); // red alert stops the moment it's decided
    renderCombatActions();
    COMBAT.player.hull = 1;
    // The shown loss IS the loss — the roll (30–50%) takes that
    // share of the items and of every material stack, decided here and
    // applied as-is in endCombatToOutcome ("Cargo lost: 2 items, 5 Metal").
    const cargoLoss = planCargoLoss(irand(30, 50));
    const cas = rollDefeatCasualties();
    // From here a reload is this defeat, not a break-off at hull 0 (that
    // ended the run): the same cargo, the same casualty roll, the fight's
    // morale (index.html loadRun → settleCombatDefeat).
    saveFightPoint({ defeat: { cargoLoss, crewDied: cas.died, crewInjured: cas.injured,
      morale: COMBAT.player.morale == null ? null : COMBAT.player.morale - COMBAT.player.moraleStart } });
    setAiCombat(combatLine('player_defeated'));
    setNarrCombat('LIMP-AWAY STATE', combatLine('player_defeated'),
      `Hull set to 1. ${cargoLossText(cargoLoss)}.${cas.died || cas.injured ? ' Casualty reports coming in.' : ' All crew accounted for.'}`);
    renderCombatHud();
    later(() => endCombatToOutcome({ outcome: 'defeated', cargoLoss, crewDied: cas.died, crewInjured: cas.injured }), 800);
  }
  /* Which cargo a defeat costs: pct% of the removable items (rounded —
     an upgrade the hold needs to fit its load never goes; removeRandomItem
     knows) and pct% of each material stack. Picked on a trial run that is
     undone, so the text can name exactly what applyCargoLoss takes. */
  function planCargoLoss(pct) {
    const items = [];
    const saved = STATE.items.slice();
    const removable = STATE.items.filter(id => canRemoveItem(id)).length;
    const n = Math.round(removable * pct / 100);
    for (let i = 0; i < n; i++) {
      const id = window.removeRandomItem();
      if (!id) break;
      items.push(id);
    }
    STATE.items.length = 0;
    STATE.items.push(...saved);
    const materials = {};
    for (const [m, q] of Object.entries(STATE.materials || {})) {
      const lose = Math.round((q || 0) * pct / 100);
      if (lose > 0) materials[m] = lose;
    }
    return { pct, items, materials };
  }
  // "Cargo lost: Repair Kit, 2× Medkit, 3 Metal": each item by name.
  function cargoLossText(loss) {
    const parts = [];
    const counts = {};
    for (const id of loss.items) counts[id] = (counts[id] || 0) + 1;
    for (const [id, n] of Object.entries(counts)) parts.push((n > 1 ? n + '× ' : '') + itemNameOf(id));
    for (const [m, q] of Object.entries(loss.materials)) parts.push(q + ' ' + materialNameOf(m));
    return parts.length ? 'Cargo lost: ' + parts.join(', ') : 'Nothing in the hold worth taking';
  }
  function applyCargoLoss(loss) {
    let items = 0;
    for (const id of loss.items) {
      const i = STATE.items.indexOf(id);
      if (i >= 0) { STATE.items.splice(i, 1); items++; }
    }
    for (const [m, q] of Object.entries(loss.materials)) {
      STATE.materials[m] = Math.max(0, (STATE.materials[m] || 0) - q);
    }
    return items;
  }

  /* A defeat's casualties, as rolled in onPlayerDefeat: shared by the
     fight's own end and a reload during the defeat beat. The death roll
     picks someone aboard (the captain too, owner ruling 29) — returned as
     the outcome's crew_effect, so a medic's save still applies. */
  function defeatDeath(result) {
    const aboardNow = peopleAboard();
    if (!result.crewDied || !aboardNow.length) return null;
    result._deathRole = aboardNow[Math.floor(Math.random() * aboardNow.length)];
    return { type: 'kill', target: 'specific_role', role: result._deathRole };
  }
  // Injuries (demo rule) land on people other than the one the death roll
  // picked, through the engine's own severity model. Returns the crew line.
  function defeatInjuries(result, crewBefore, namesBefore, lethalSaved) {
    const pool = peopleAboard().filter(r => r !== result._deathRole);
    const hurt = [];
    for (let i = 0; i < (result.crewInjured || 0) && pool.length; i++) {
      const role = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      applySeverity(role, 'injury');
      hurt.push(role);
    }
    const lost = crewBefore.filter(r => !STATE.crew.includes(r));
    const nameOf = (r, i) => r === 'captain' ? (i ? 'the captain' : 'The captain') : (namesBefore[r] || crewNameOf(r));
    const parts = [];
    if (lost.length) parts.push(lost.map(nameOf).join(' and ') + " didn't make it.");
    else if (result.crewDied && lethalSaved) parts.push('It should have cost a life. ' + lethalSaved);
    if (hurt.length) parts.push(hurt.map(nameOf).join(' and ') + (hurt.length > 1 ? ' are hurt.' : ' is hurt.'));
    return parts.length ? parts.join(' ') : 'All crew accounted for.';
  }
  // Each crew entry carries its passive in effect: 1 healthy, 0.5 wounded
  // (Bible §4.25 "passive halved"), 0 absent — truthy checks still mean
  // "aboard"; numeric bonuses scale by it.
  function bindCombatCrew() {
    const roles = ['pilot', 'engineer', 'medic', 'botanist', 'chef', 'diplomat', 'xenobiologist'];
    COMBAT.crew = {};
    roles.forEach(r => { COMBAT.crew[r] = STATE.crew.includes(r) ? woundedMult(r) : 0; });
    COMBAT.captainBg = STATE.captain || '';
  }
  /* A reload mid-fight (owner ruling 53, index.html loadRun): ATTEMPT
     ESCAPE played out — never better than playing on. The drive spools
     its 2–3 turns (a pilot's short spool as the real charge rolls it, a
     charge under way keeps what is left) and the enemy fires each turn
     with the fight's real volley: the drive's miss odds, the shields
     still up, an armed emergency patch. Then −15 fuel and the escape's
     time, the fight's morale so far plus the hits'. Volleys that would
     take the hull to 0 are the defeat (LIMP AWAY), not hull_zero. A save
     from before the volley was kept just breaks off. Returns the log line. */
  function settleCombatBreakOff(pc) {
    const v = pc.volley;
    const start = Number.isFinite(pc.moraleNow) && Number.isFinite(pc.morale) ? pc.moraleNow - pc.morale : null;
    let hull = Math.min(STATE.resources.hull, pc.hull), mo = start == null ? null : pc.moraleNow;
    const hits = [];
    if (v) {
      const turns = v.left || ((v.pilot >= 1 || (v.pilot > 0 && Math.random() < v.pilot)) ? COMBAT_CONFIG.crew_bonuses.pilot.ftl_turns_override : COMBAT_CONFIG.ftl_charge_turns);
      let shields = v.shields || 0;
      for (let i = 0; i < turns && hull > 0; i++) {
        if (Math.random() < v.miss) { hits.push('miss'); continue; }
        const dmg = irand(v.min, v.max) * v.mod * (i === 0 ? 1 - (v.opening || 0) : 1);
        if (shields > 0) { shields--; hits.push('blocked'); continue; }
        if (STATE.flags.has('emergency_patch_armed')) { STATE.flags.delete('emergency_patch_armed'); hits.push('patched'); continue; }
        const dealt = Math.max(1, Math.round(dmg));
        hull = Math.max(0, hull - dealt);
        hits.push('−' + dealt);
        if (mo != null) mo = clamp(mo - (dealt > (pc.hullMax || 100) * 0.15 ? 2 : 1), 0, 100);
      }
    }
    const morale = mo == null ? null : mo - start;
    const under = hits.length ? 'The drive spooled under fire (' + hits.join(', ') + '). ' : '';
    if (hull <= 0) {
      // The defeat as onPlayerDefeat rolls it.
      bindCombatCrew();
      COMBAT.player.morale = mo;
      const cas = rollDefeatCasualties();
      const line = window.settleCombatDefeat({ cargoLoss: planCargoLoss(irand(30, 50)), crewDied: cas.died, crewInjured: cas.injured, morale });
      return 'LIMP AWAY — the fight broke off when the logs did, and the escape didn\'t make it. ' + under + line;
    }
    const outcome = { resources: { fuel: -15, hull: hull - STATE.resources.hull }, time_cost: END_TIME.escape, combat_net: true };
    if (morale) outcome.resources.morale = morale;
    applyOutcomeEffects(outcome);
    STATE.postCombatLegs = 2;
    return 'The fight broke off when the logs did. The ship ran for it: ' + under + '−15 fuel, hull ' + Math.round(hull) + '.';
  }
  /* A reload after the fight's result was decided (its beat still
     playing): that result lands as the fight would have landed it — the
     loot, the hull and morale as they stood, its time — never the
     break-off. A surrender still on offer is taken (+5 morale, as
     ACCEPT). Returns the line for the log. */
  function settleCombatWon(pc) {
    const w = pc.won;
    bindCombatCrew(); // the salvage bonus reads the crew aboard
    const { outcome, lootItems, title, body } = endOutcome(w, pc.species || 'human');
    outcome.resources.hull = (outcome.resources.hull || 0) + (Math.min(STATE.resources.hull, pc.hull) - STATE.resources.hull);
    outcome.combat_net = true;
    if (Number.isFinite(pc.morale)) {
      const add = Number.isFinite(pc.moraleNow) ? clamp(pc.moraleNow + (w.moraleAdd || 0), 0, 100) - pc.moraleNow : 0;
      if (pc.morale + add) outcome.resources.morale = (outcome.resources.morale || 0) + pc.morale + add;
    }
    const before = STATE.goldAmount;
    if (lootItems) {
      const goldItem = lootItems.find(it => it.id === 'gold');
      if (goldItem) outcome.resources.gold = (outcome.resources.gold || 0) + goldItem.count;
    }
    openConcernReceipt();
    applyOutcomeEffects(outcome);
    const leftBehind = landLoot(lootItems);
    closeConcernReceipt();
    STATE.postCombatLegs = 2;
    const got = (lootItems || []).filter(it => it.count > 0 && it.id !== 'gold').map(it => `${it.count}× ${it.label}`);
    const gold = Math.round(STATE.goldAmount - before);
    if (gold > 0) got.unshift(gold + ' gold');
    const loot = lootItems ? (got.length ? ' Recovered: ' + got.join(', ') + '.' : ' No loot recovered.') : '';
    const left = leftBehind.length ? ' Hold full: ' + leftBehind.map(it => `${it.count}× ${it.label}`).join(', ') + ' left behind.' : '';
    return title + ' — the fight was decided before the logs cut out. ' + body + loot + left;
  }
  /* A reload during the defeat beat (index.html loadRun): the LIMP AWAY
     that was coming lands as the fight would have landed it — hull 1,
     the named cargo, the casualty roll, the fight's morale, high time.
     The fight's own end card is gone, so it returns the line for the log. */
  function settleCombatDefeat(d) {
    const result = { outcome: 'defeated', cargoLoss: d.cargoLoss || { pct: 0, items: [], materials: {} }, crewDied: !!d.crewDied, crewInjured: d.crewInjured || 0 };
    const outcome = { resources: { hull: 1 - STATE.resources.hull }, combat_net: true, time_cost: END_TIME.defeated };
    if (Number.isFinite(d.morale) && d.morale) outcome.resources.morale = d.morale;
    const kill = defeatDeath(result);
    if (kill) outcome.crew_effect = kill;
    const crewBefore = STATE.crew.slice();
    const namesBefore = Object.fromEntries(crewBefore.map(r => [r, crewNameOf(r)]));
    applyOutcomeEffects(outcome);
    const lethalSaved = STATE.lethalSaved;
    STATE.lethalSaved = null;
    const crewLine = defeatInjuries(result, crewBefore, namesBefore, lethalSaved);
    applyCargoLoss(result.cargoLoss);
    STATE.postCombatLegs = 2;
    return `Hull at 1. ${cargoLossText(result.cargoLoss)}. ${crewLine}`;
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
      // Capitalised labels, as the demo's card ("×4 Metal").
      items.push({ id: 'gold', label: 'Gold', count: irand(8, 16) });
      maybe(0.75, () => items.push({ id: 'fuel_cell', label: 'Fuel Cell', count: irand(1, 2), isItem: true }));
      maybe(0.65, () => items.push({ id: 'metal', label: 'Metal', count: irand(2, 5) }));
      maybe(0.45, () => items.push({ id: 'scrap', label: 'Scrap', count: irand(1, 3) }));
      if (Math.random() < (opts.bonusChance || 0.45)) {
        const crate = pick([
          { id: 'drive_coil',  label: 'Drive Coil',  isItem: true },
          { id: 'exotic',      label: 'Exotic' },
          { id: 'repair_kit',  label: 'Repair Kit',  isItem: true },
          { id: 'biocomponent',label: 'Biocomponent' }
        ]);
        items.push(Object.assign({ count: 1, bonus: true }, crate)); // the card's BONUS tile
      }
    } else if (outcome === 'destroyed_leave') {
      items.push({ id: 'gold', label: 'Gold', count: irand(4, 9) });
      maybe(0.5, () => items.push({ id: 'fuel_cell', label: 'Fuel Cell', count: 1, isItem: true }));
      maybe(0.4, () => items.push({ id: 'metal', label: 'Metal', count: irand(1, 2) }));
    } else if (outcome === 'surrender') {
      items.push({ id: 'gold', label: 'Gold', count: irand(3, 7) });
      maybe(0.45, () => items.push({ id: 'fuel_cell', label: 'Fuel Cell', count: 1, isItem: true }));
    }
    return items;
  }
  /* ── End card (demo D:1355-1473, 6156-6323) ─────────────────────
     Every ending lands on one card: title, body, a tile grid of exactly
     what came aboard, a notes line of what the fight cost. Continue →
     on to the next leg; after an escape (ours or theirs) Continue first
     shows the demo's CLEAR view — the empty bridge — then moves on. */
  const END_CLASS = {
    victory_destroyed: 'victory', victory_surrendered: 'tribute', victory_executed: 'defeat',
    tribute: 'tribute', escape: 'escape', enemy_retreat: 'escape', defeated: 'defeat', yielded: 'defeat',
  };
  function lootSprite(it) {
    if (it.material || it.id === 'gold') return 'sprites/cargo/materials/' + it.id + '.png';
    return itemSpritePath(it.id);
  }
  function renderLootTiles(items) {
    if (!items.length) return '<div class="end-loot-empty">No loot recovered.</div>';
    return '<div class="end-loot-grid">' + items.map(it => {
      const src = lootSprite(it);
      return `<div class="end-loot-tile${it.bonus ? ' bonus' : ''}" data-id="${escapeHTML(it.id)}" data-count="${it.count}">` +
        (src ? `<img src="${escapeHTML(src)}" alt="" onerror="this.style.visibility='hidden'">` : '') +
        `<span class="lt-count">×${it.count}</span><span class="lt-label">${escapeHTML(it.label)}</span></div>`;
    }).join('') + '</div>';
  }
  function hideEndCard() {
    const ov = document.getElementById('combat-end-overlay');
    if (ov) ov.classList.remove('show');
  }
  function showEndCard(card) {
    const ov = document.getElementById('combat-end-overlay');
    if (!ov) return;
    const cls = END_CLASS[card.outcome] || '';
    document.getElementById('combat-end-card').className = 'combat-end-card ' + cls;
    const t = document.getElementById('combat-end-title');
    t.className = 'end-title ' + cls;
    t.textContent = card.title;
    document.getElementById('combat-end-body').textContent = card.body;
    let html = '';
    if (card.loot) html += '<div class="end-loot-title">RECOVERED</div>' + renderLootTiles(card.loot);
    if (card.notes) html += `<div class="end-loot-notes">${escapeHTML(card.notes)}</div>`;
    const lootEl = document.getElementById('combat-end-loot');
    lootEl.innerHTML = html;
    lootEl.style.display = html ? 'flex' : 'none';
    const btn = document.getElementById('combat-end-continue');
    const fresh = btn.cloneNode(true); // one listener per card
    btn.replaceWith(fresh);
    fresh.addEventListener('click', () => {
      hideEndCard();
      if (card.outcome === 'escape' || card.outcome === 'enemy_retreat') renderPostEscapeState();
      else runChoiceAction(advanceAfterEvent);
    });
    ov.classList.add('show');
  }
  // CLEAR (demo renderPostEscapeState): the bridge stays, starfield and
  // all; the pirate ship, captain and plate are gone; one Continue on.
  function renderPostEscapeState() {
    fxScreen().classList.add('hostile-gone');
    document.getElementById('enc-narr-title').textContent = 'CLEAR';
    finishAllTyping();
    document.getElementById('enc-narr-body').textContent = 'The pirate falls behind. The bridge is quiet again — your stars, undisturbed.';
    document.getElementById('enc-narrative').classList.remove('tone-success', 'tone-danger');
    document.getElementById('enc-dialog').classList.add('hidden');
    setAiCombat('No further contacts. Threat vector resolved.');
    const col = document.getElementById('enc-choices');
    col.innerHTML = '';
    col.appendChild(makeAdvanceButton('Continue'));
  }
  // What the fight cost, in the demo's notes register ("-15 fuel ·
  // Morale +5"): the real net changes, rounded as the HUD shows them.
  // The notes are Press Start 2P, which draws U+2212 as an underscore:
  // ASCII "-", as the demo writes them.
  function costNotes(d) {
    const sgn = (n, label, pre) => n ? (pre ? `${label} ${n > 0 ? '+' : '-'}${Math.abs(n)}` : `${n > 0 ? '+' : '-'}${Math.abs(n)} ${label}`) : null;
    // Each role concern on its own (one per role: "Engineer -3").
    const byRole = {};
    for (const c of d.concerns || []) byRole[c.role] = (byRole[c.role] || 0) + c.v;
    const concerns = Object.entries(byRole).map(([r, v]) => sgn(Math.round(v), r.charAt(0).toUpperCase() + r.slice(1), true));
    return [sgn(d.hull, 'Hull', true), sgn(d.morale, 'Morale', true), ...concerns, sgn(d.fuel, 'fuel'), sgn(d.food, 'food'),
      sgn(d.gold, 'gold'), d.cargoLost || null,
      d.leftBehind || null, d.days ? d.days + (d.days === 1 ? ' day' : ' days') : null].filter(Boolean).join(' · ');
  }

  /* How long each ending takes, as a time_cost tier (index.html
     TIME_COST_DAYS: low 2, medium 4, high 8). endOutcome applies these and
     the ending buttons / end card read their days from the same table —
     a fight's ending says what it costs in days before and after. */
  const END_TIME = {
    salvaged: 'high', departed: 'low', // the kill: SALVAGE WRECKAGE / LEAVE IT
    victory_surrendered: 'medium', victory_executed: 'high', tribute: 'low',
    escape: 'medium', yielded: 'low', enemy_retreat: 'low', defeated: 'high',
  };
  function endTimeKey(result) {
    return result.outcome === 'victory_destroyed' ? (result.salvaged ? 'salvaged' : 'departed') : result.outcome;
  }
  // The days applyOutcomeEffects passes for that tier (its own formula:
  // the choice's effort scale, plus a short-of-effort setback's days).
  function endDays(key) {
    const base = outcomeBaseDays({ time_cost: END_TIME[key] });
    return Math.max(1, Math.round(base * (STATE.effortScale || 1))) + (STATE.effortCon ? (STATE.effortCon.days || 2) : 0);
  }
  function daysText(key) { const n = endDays(key); return n + (n === 1 ? ' day' : ' days'); }

  /* What each ending is: the outcome to apply, the loot rolled, the card's
     title/body/tone, a backdrop it takes you to. Shared by the fight's own
     end and a reload that lands a decided result (settleCombatWon). */
  function endOutcome(result, species) {
    // The ending's days (END_TIME): leaving the wreck is the quick way out.
    const outcome = { resources: {}, time_cost: END_TIME[endTimeKey(result)] };
    let lootItems = null;
    let title, body, tone;
    let scene = null; // outcome backdrop override (scene_bg), when the result takes you somewhere

    switch (result.outcome) {
      case 'victory_destroyed':
        title = result.salvaged ? 'VICTORY · SALVAGED' : 'VICTORY · DEPARTED'; tone = 'success';
        lootItems = rollCombatLoot(result.salvaged ? 'destroyed_salvage' : 'destroyed_leave',
          result.salvaged ? { bonusChance: 0.45 + bonus('salvage_bonus_rolls') * 0.10 } : {});
        body = result.salvaged ? 'Wreckage cracked open. Drives still warm.' : 'You leave the wreck behind. The galaxy is full of wrecks.';
        break;
      case 'victory_surrendered':
        title = 'SURRENDER ACCEPTED'; tone = 'success';
        lootItems = rollCombatLoot('surrender');
        body = 'Pirates stripped, ship intact. They live to disappoint someone else.';
        // Stripping them means going aboard: their own interior, by species.
        scene = 'ship_interior/pirate/' + species;
        break;
      case 'victory_executed':
        title = 'SURRENDER REFUSED'; tone = 'danger';
        lootItems = rollCombatLoot('executed', { bonusChance: 0.45 });
        body = 'You finished a surrendered combatant. The crew noticed. The galaxy noticed.';
        outcome.sets_flag = 'executed_surrendered_pirate';
        break;
      case 'tribute':
        title = 'TRIBUTE RESOLVED'; tone = 'success';
        body = `They took the ${result.friendly ? 'cookies' : 'harvest'} and went somewhere else.${result.friendly ? ' Meet that crew again before the next station and they will remember the cookies.' : ''}`;
        outcome.resources.food = -(result.foodCost || 0); // morale is in the net reconciliation below
        if (result.friendly) outcome.sets_flag = `friendly_with_pirate_${species}`;
        break;
      case 'escape':
        title = 'FTL ESCAPED'; tone = 'success';
        body = "Drive achieved jump. The pirate is now a different sector’s problem.";
        outcome.resources.fuel = -(result.fuelCost || 15);
        break;
      case 'yielded': {
        title = 'STOOD DOWN'; tone = 'danger';
        const fuelToll = Math.round(STATE.resources.fuel * 0.25), goldToll = Math.round(STATE.goldAmount * 0.2);
        outcome.resources.fuel = -fuelToll;
        outcome.resources.gold = -goldToll;
        body = 'The crew is done, and the pirates can tell. They take a toll for the courtesy of letting you leave: ' + fuelToll + ' fuel siphoned and ' + goldToll + ' gold transferred. Nobody aboard looks at anybody else.';
        break;
      }
      case 'enemy_retreat':
        title = 'ENEMY FLED'; tone = 'success';
        body = 'They jumped before you could finish them. Faster ship, smaller pride.';
        break;
      case 'defeated': {
        title = 'LIMP AWAY'; tone = 'danger';
        // Crew line is written after the effects land (below): the kill
        // can be saved by a medic, injuries go to whoever is left.
        body = `Hull at 1. ${cargoLossText(result.cargoLoss)}.`;
        const kill = defeatDeath(result);
        if (kill) outcome.crew_effect = kill;
        break;
      }
    }

    return { outcome, lootItems, title, body, tone, scene };
  }
  // Loot isn't part of the standard outcome schema (applyOutcomeEffects
  // only knows resources/item_grant/crew_effect/sets_flag): what fits
  // lands, each tile's count becomes what landed; returns what was left.
  function landLoot(lootItems) {
    const leftBehind = [];
    if (lootItems) {
      for (const it of lootItems) {
        if (it.id === 'gold') continue;
        if (it.isItem) {
          // Capacity-enforced: grantItem logs anything left with the wreck.
          let landed = 0;
          for (let i = 0; i < it.count; i++) {
            if (window.grantItem(it.id) !== false) landed++;
          }
          if (landed < it.count) { leftBehind.push({ label: it.label, count: it.count - landed }); it.count = landed; }
        }
        else {
          // Materials are cargo (owner ruling 2026-10-11): what fits lands; the
          // card's notes name the rest (leftBehind), the tile shows what landed.
          it.material = true;
          const landed = window.grantMaterial(it.id, it.count, { quiet: true });
          if (landed < it.count) { leftBehind.push({ label: it.label, count: it.count - landed }); it.count = landed; }
        }
      }
      applyAlienFind(Object.fromEntries(lootItems.filter(it => it.material && it.count > 0).map(it => [it.id, it.count])), lootItems.filter(it => it.isItem && it.count > 0).map(it => it.id));
    }
    return leftBehind;
  }
  /* ── Exit: reconcile COMBAT.* back into real STATE, paint the
     encounter's own outcome view underneath (save point, Continue,
     AJOY's hindsight), then raise the end card over it. ─────────── */
  function endCombatToOutcome(result) {
    // One resolution per fight — late timers (an in-flight enemy shot,
    // a double-clicked choice) must not apply a second outcome.
    if (COMBAT._resolved) return;
    COMBAT._resolved = true;
    if (COMBAT._ftlTickTimer) { clearTimeout(COMBAT._ftlTickTimer); COMBAT._ftlTickTimer = null; }
    COMBAT.state = 'END';
    COMBAT.active = false;
    COMBAT._firing = false;

    const scr = document.getElementById('screen-encounter');
    scr.classList.remove('combat-mode', 'combat-targeting', 'combat-vignette', 'combat-ftl-charging');
    scr.classList.add('combat-ended'); // every END entrypoint kills the red alert
    document.getElementById('enc-choices').classList.remove('combat-actions', 'combat-locked', 'combat-fade-in', 'combat-fade-out');
    document.getElementById('enc-subject').classList.remove('combat-locking');
    // Defensive sweep of transient FTL/retreat FX: the flash overlay
    // self-removes at 900ms and the charge class at 1000ms, but any
    // path that ends combat mid-effect must not leave them orphaned.
    document.querySelectorAll('#screen-encounter .combat-ftl-flash').forEach(el => el.remove());
    const spEnd = document.getElementById('enc-backdrop-sprite');
    if (spEnd) spEnd.classList.remove('combat-enemy-charge', 'combat-low-hp');
    // combat-ended + the destroyed ship's inline opacity/CRT classes +
    // the escaped/retreated ship's combat-ftl-vanish persist through the
    // outcome on purpose — the wreck/vanished ship stays gone while the
    // player reads the result. SceneArt resets them on the NEXT event.
    hideTurnIndicator();

    const end = endOutcome(result, COMBAT.species);
    const { outcome, lootItems, title, tone, scene } = end;
    let body = end.body;

    // Hull/morale are the NET change across the whole fight (tracked
    // live on COMBAT.player.* every turn), not a flat per-case
    // constant — reconcile against STATE's pre-fight snapshot here.
    outcome.resources.hull   = (outcome.resources.hull   || 0) + (COMBAT.player.hull   - STATE.resources.hull);
    outcome.combat_net = true; // hull lands as fought: no second engineer bonus, no whole-fight patch
    // Morale: the fight's net change on the crew average, applied to every
    // crew member (per-crew morale, owner ruling 15). No crew: none.
    if (COMBAT.player.morale != null) outcome.resources.morale = (outcome.resources.morale || 0) + (COMBAT.player.morale - COMBAT.player.moraleStart);
    if (lootItems) {
      const goldItem = lootItems.find(it => it.id === 'gold');
      if (goldItem) outcome.resources.gold = (outcome.resources.gold || 0) + goldItem.count;
    }

    const crewBefore = STATE.crew.slice();
    const namesBefore = Object.fromEntries(crewBefore.map(r => [r, crewNameOf(r)]));
    const before = { hull: STATE.resources.hull, fuel: STATE.resources.fuel, food: STATE.resources.food, gold: STATE.goldAmount, day: STATE.daysElapsed };
    // Ship's Log: the fight's record (won/lost/fled/paid + real effects,
    // loot and cargo loss included) is closed below, before checkFailure.
    const slog = ShipLog.begin();
    // What the fight's morale change really does to each member (floored
    // at 0, capped at 100) — the card shows that, not the raw net.
    const moraleIn = outcome.resources.morale;
    const moraleApplied = Number.isFinite(moraleIn) && moraleIn && STATE.crew.length
      ? STATE.crew.reduce((s, r) => s + clamp(crewMoraleOf(r) + moraleIn, 0, 100) - crewMoraleOf(r), 0) / STATE.crew.length : 0;
    // Role concerns the fight sets off (ruling 57: the engineer's hull,
    // the diplomat's fight, the wounded, an alien find in the loot) — the
    // card names each one.
    openConcernReceipt();
    applyOutcomeEffects(outcome);
    // The save's own line (the medic's or the medkit's, naming who lived);
    // combat writes it into its own crew line.
    const lethalSaved = STATE.lethalSaved;
    STATE.lethalSaved = null;
    if (result.outcome === 'defeated') body += ' ' + defeatInjuries(result, crewBefore, namesBefore, lethalSaved);

    // Materials/items loot isn't part of the standard outcome schema
    // (applyOutcomeEffects only knows resources/item_grant/crew_effect/
    // sets_flag) — applied directly here rather than extending that
    // shared contract for a combat-only need.
    const leftBehind = landLoot(lootItems);
    const concerns = closeConcernReceipt();
    // Cargo loss on defeat — exactly what onPlayerDefeat named.
    let cargoLost = '';
    if (result.outcome === 'defeated' && result.cargoLoss && typeof result.cargoLoss === 'object') {
      applyCargoLoss(result.cargoLoss);
      const t = cargoLossText(result.cargoLoss);
      if (/^Cargo lost/.test(t)) cargoLost = t;
    }

    if (slog) ShipLog.fightEnd(slog, result.outcome, title);
    renderHUD();
    if (checkFailure()) return;

    // Open the post_combat aftermath window: events tagged with the
    // post_combat trigger become eligible for the next 2 event draws
    // (decremented in selectEvent()).
    STATE.postCombatLegs = 2;

    // What actually came aboard (a full hold leaves items with the wreck).
    // Gold is what the purse really gained (the loot roll, net of a toll).
    const landed = (lootItems || []).filter(it => it.count > 0 && it.id !== 'gold');
    const goldDelta = Math.round(STATE.goldAmount - before.gold);
    const tiles = lootItems ? (goldDelta > 0 ? [{ id: 'gold', label: 'Gold', count: goldDelta }] : []).concat(landed) : null;
    const leftLine = leftBehind.length ? 'Hold full: ' + leftBehind.map(it => `${it.count}× ${it.label}`).join(', ') + ' left behind' : '';
    const deltas = {
      hull: Math.round(STATE.resources.hull - before.hull),
      morale: Math.round(moraleApplied),
      fuel: Math.round(STATE.resources.fuel - before.fuel),
      food: -Math.round((result.outcome === 'tribute' ? Math.min(result.foodCost || 0, before.food) : 0) + (COMBAT.foodSpent || 0)),
      gold: lootItems ? 0 : goldDelta,
      cargoLost, leftBehind: leftLine,
      concerns,
      days: Math.round(STATE.daysElapsed - before.day), // the days the ending really took
    };

    // The outcome view underneath: its text names what came aboard (the
    // log / save / a reader under the card see the same result).
    const lootText = tiles ? (tiles.length ? ' Recovered: ' + tiles.map(it => `${it.count}× ${it.label}`).join(', ') + '.' : ' No loot recovered.') : '';
    const viewBody = body + lootText + (leftLine ? ' ' + leftLine + '.' : '');
    renderOutcomeView(Object.assign({ title, body: viewBody, tone, narrative: viewBody }, scene ? { scene_bg: scene } : {}));
    // Continuing from the column (keyboard / harness) also takes the card down.
    const adv = document.querySelector('#enc-choices .enc-choice.advance');
    if (adv) adv.addEventListener('click', hideEndCard);
    showEndCard({ outcome: result.outcome, title, body, loot: tiles, notes: costNotes(deltas) });
  }

  /* ── Entry points — called from handleChoiceClick() in index.html
     for choices carrying triggerCombat/triggerRamResolve/
     triggerFleeResolve. See CLAUDE.md's layered Event Module section
     for the choice schema these three fields belong to. ─────────── */
  // FLEE / a RAM that gets through (demo resolveFleeAction /
  // resolveRamAction): they're behind us now — the ship, captain, plate
  // and dialog go (.hostile-gone) and the view cuts from the bridge to
  // open space (this node's: deep space, a nebula, the asteroid field).
  function resolveToOutcome(choice, opts) {
    const ev = STATE.currentEvent;
    const outcome = ev.outcomes[choice.outcome];
    const slog = ShipLog.begin(); // Ship's Log: choice + outcome + real effects
    applyOutcomeEffects(outcome);
    if (slog) ShipLog.resolved(slog, ev, choice, outcome, { line: outcome && (outcome.body || outcome.narrative) });
    renderHUD();
    if (checkFailure()) return;
    STATE.currentOutcomeId = choice.outcome;
    if (opts && opts.hostileGone) fxScreen().classList.add('hostile-gone');
    renderEncounterState();
    if (opts && opts.hostileGone) {
      const space = SceneArt.sceneSpecFor({ id: ev.id, scene_type: 'deep_void' }, STATE.currentNode, STATE.npcCtx).bg;
      SceneArt.renderOutcome(Object.assign({}, outcome, { scene_bg: space, line: null }), STATE.npcCtx);
    }
  }

  function triggerFleeResolve(choice) {
    resolveToOutcome(choice, { hostileGone: true });
  }

  // Read by the encounter's choice tooltip (index.html choiceCostLines).
  const RAM_FAIL_CHANCE = 0.30;
  function triggerRamResolve(choice) {
    if (Math.random() < RAM_FAIL_CHANCE) {
      ShipLog.fightStart(choice); // the fight's log entry names the ram
      window.triggerCombat(choice, { ramFailed: true, ramHull: choice.hull || 18 });
    } else {
      resolveToOutcome(choice, { hostileGone: true });
    }
  }

  // Load-time teardown (index.html teardownLiveUI): stop a live fight
  // and strip its chrome without resolving an outcome into the run being
  // replaced (it used to bleed into the next ordinary event).
  function abortCombat() {
    if (COMBAT._ftlTickTimer) { clearTimeout(COMBAT._ftlTickTimer); COMBAT._ftlTickTimer = null; }
    COMBAT.active = false; COMBAT.state = 'END'; COMBAT._firing = false; COMBAT._dissolving = false;
    COMBAT._resolved = true; COMBAT.fight = (COMBAT.fight || 0) + 1; // pending timers stand down
    const scr = document.getElementById('screen-encounter');
    scr.classList.remove('combat-mode', 'combat-targeting', 'combat-vignette', 'combat-ftl-charging', 'combat-ended', 'hostile-gone');
    document.getElementById('enc-choices').classList.remove('combat-actions', 'combat-locked', 'combat-fade-in', 'combat-fade-out');
    document.getElementById('enc-subject').classList.remove('combat-locking');
    scr.querySelectorAll('.combat-ftl-flash').forEach(el => el.remove());
    const sp = document.getElementById('enc-backdrop-sprite');
    if (sp) sp.classList.remove('combat-enemy-charge', 'combat-low-hp');
    hideEndCard();
  }

  /* Any fight is fought from the bridge (demo canon: combat is always the
     bridge view, their ship in the window, their captain on the feed) —
     wherever the event that started it was set. A flat event with no NPC
     (event_general_003's "Vessel Approaching") gets a pirate captain
     rolled here, through the same resolveNpc as authored NPCs (sticky
     per stop, so a reload meets the same one); a fight launched from a
     corridor or a derelict cuts to the bridge. `line` (the bluff's
     CALLED reply) sets the captain talking. */
  function ensureCombatStage(line) {
    const ev = STATE.currentEvent, node = STATE.currentNode;
    if (!ev) return;
    if (!STATE.npcCtx) {
      STATE.npcCtx = resolveNpc({ id: ev.id, npc: { disposition: 'pirate', species: null } });
    }
    const spec = SceneArt.sceneSpecFor({ id: ev.id, scene_type: 'ship_exterior' }, node, STATE.npcCtx);
    const scr = fxScreen();
    scr.classList.remove('comm-corrupted');
    scr.classList.add('comm-screen'); // their captain hails us over the screen
    SceneArt.render(ev, node, Object.assign({ comm_mode: 'screen', pose: 'hostile' }, spec), STATE.npcCtx, line || null);
  }

  function triggerCombat(choice, opts) {
    if (COMBAT.active) return;
    opts = opts || {};
    choice = choice || {};
    hideEndCard();
    // The bridge, their ship, their captain — before anything reads the
    // NPC (species decides hull, surrender and the cookie memory below).
    const ev = STATE.currentEvent;
    const intro = choice.combat_intro && ev && ev.outcomes ? ev.outcomes[choice.combat_intro] : null;
    const introLine = intro && intro.line ? interpolateNpcTokens(intro.line, STATE.npcCtx) : null;
    ensureCombatStage(introLine);
    // The chef's cookies (OFFER COOKIES success sets a friendly tag for
    // one journey leg — COMBAT_SYSTEM_HANDOFF §5): the same crew, met
    // again before the next station, wave you through instead.
    const sp = (STATE.npcCtx && STATE.npcCtx.species) || 'human';
    if (!opts.ramFailed && STATE.flags.has('friendly_with_pirate_' + sp)) {
      const o = { time_cost: 'trivial', resources: { morale: 2 },
        narrative: 'Their weapons stay cold. Comms crackle: someone is still talking about the cookies. They wave you through and ask, quietly, whether there are more.' };
      const slog = ShipLog.begin(); // Ship's Log: waved through
      applyOutcomeEffects(o);
      if (slog) ShipLog.resolved(slog, STATE.currentEvent, choice, Object.assign({ tone: 'success' }, o));
      renderHUD();
      if (checkFailure()) return; // the day it costs can end the run like any other
      renderOutcomeView({ title: 'OLD FRIENDS', body: o.narrative, tone: 'success' });
      return;
    }
    const ramFailed = !!opts.ramFailed;
    const ramHull = opts.ramHull || 0;

    COMBAT.ai = STATE.activeAI;
    COMBAT.species = (STATE.npcCtx && STATE.npcCtx.species) || 'human';
    COMBAT.trail = STATE.trail;
    bindCombatCrew();

    COMBAT.player.hullMax = Math.round(COMBAT_CONFIG.player_hp_max * resMax('hull') / 100); // hull plating
    COMBAT.player.hull = clamp(STATE.resources.hull, 1, COMBAT.player.hullMax);
    if (ramFailed) COMBAT.player.hull = clamp(COMBAT.player.hull - ramHull, 1, COMBAT.player.hullMax);
    // The crew average (unrounded) — null with no crew aboard (owner ruling 15).
    COMBAT.player.morale = crewMoraleRaw();
    COMBAT.player.moraleStart = COMBAT.player.morale;

    const speciesMul = speciesHpMod(COMBAT.species);
    const trailMul = COMBAT_CONFIG.trail_scaling[COMBAT.trail] || COMBAT_CONFIG.trail_scaling.mars;
    COMBAT.enemy.dmgMod = trailMul.dmg;
    COMBAT.enemy.hullMax = Math.floor(COMBAT_CONFIG.base_hp * speciesMul * trailMul.hp);
    COMBAT.enemy.hull = COMBAT.enemy.hullMax;
    COMBAT.enemy.alive = true;
    COMBAT.enemy.surrendered = false;
    COMBAT.enemy.surrenderOffered = false;
    COMBAT._won = null;

    COMBAT.turn = 1;
    COMBAT.ftlCharge = -1;
    COMBAT.ftlTurnsRolled = 0;
    COMBAT.hullPatchUsed = false;
    COMBAT.shieldUsed = false;
    COMBAT.shieldArmed = false;
    COMBAT.tributeUsed = false;
    COMBAT.openingTurn = !ramFailed;
    COMBAT.evadingNextHit = false;
    COMBAT.identifiedByXeno = flagBonus('identify_enemy');
    COMBAT._firing = false;
    COMBAT._narrPrefix = null;
    COMBAT._resolved = false;
    COMBAT.fight = (COMBAT.fight || 0) + 1;
    COMBAT.rexShield = COMBAT.ai === 'rex' || STATE.activeAI === 'rex'; // REX passive: one free hit per fight
    COMBAT.active = true;
    COMBAT.state = 'PLAYER_TURN';
    saveFightPoint();

    const screen = document.getElementById('screen-encounter');
    screen.classList.add('combat-mode');
    screen.classList.remove('combat-ended', 'hostile-gone');
    COMBAT.foodSpent = 0;
    COMBAT._victoryPicked = false;
    startCombatFx();
    const dialogEl = document.getElementById('enc-dialog');
    if (dialogEl) dialogEl.classList.add('hidden');
    // The encounter's column/narrative fit (fitEncounterColumns) leaves
    // inline max-heights sized for the previous layer; combat has its
    // own fixed homes for the log, the HP banner and the actions.
    const wrap = document.getElementById('enc-choices');
    wrap.style.maxHeight = ''; wrap.style.bottom = ''; wrap.classList.remove('tight');
    document.getElementById('enc-narrative').style.maxHeight = '';
    // Choices → actions cross-dissolve (demo D:5111-5119): the old
    // choices fade out over 200ms — inert from this moment (clones carry
    // no listeners, so nothing resolves mid-fade) — then the action
    // panel paints and fades in.
    wrap.querySelectorAll('.enc-choice').forEach(b => b.replaceWith(b.cloneNode(true)));
    wrap.classList.remove('combat-fade-in');
    wrap.classList.add('combat-fade-out');
    COMBAT._dissolving = true;
    later(() => {
      COMBAT._dissolving = false;
      wrap.classList.remove('combat-fade-out');
      wrap.classList.add('combat-actions', 'combat-fade-in');
      renderCombatActions();
      setTimeout(() => wrap.classList.remove('combat-fade-in'), 220);
    }, 200);

    if (ramFailed) {
      setNarrCombat('RAM FAILED — COMBAT', `Your bow glanced off their armor. The pirates wheel back, weapons hot. Hull -${ramHull}.`);
    } else if (intro) {
      // A combat_intro outcome opens the fight (the bluff's CALLED beat).
      const quote = introLine ? '“' + introLine + '”' : undefined;
      const introBody = interpolateNpcTokens(intro.body || '', STATE.npcCtx);
      setNarrCombat(intro.title || 'COMBAT LOG', introBody, quote);
    } else {
      setNarrCombat('COMBAT LOG', combatLine('intro'), pirateSays('refuse').trim() || undefined);
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

    if (COMBAT.player.morale != null && COMBAT.player.morale <= MORALE_MUTINY && !ramFailed) {
      COMBAT.state = 'MUTINY';
      setNarrCombat('CREW MUTINY', 'The crew refuses to fire. Morale is gone before the fight even starts.', 'Stand down or wait for them to start shooting.');
      setAiCombat('Crew is not responding to combat orders.');
      renderCombatActions();
      showMutinyTurn();
      later(enemyTurn, 1800);
      return;
    }
    if (ramFailed) {
      showEnemyTurn();
      later(() => { if (COMBAT.active && COMBAT.state === 'PLAYER_TURN') enemyTurn(); }, 1100);
    } else {
      showYourTurn();
    }
  }

  Object.assign(window, {
    // engine API
    settleCombatBreakOff, settleCombatDefeat, settleCombatWon, hideCombatEndCard: hideEndCard,
    triggerFleeResolve, RAM_FAIL_CHANCE, triggerRamResolve, abortCombat,
    triggerCombat,
  });
})();
