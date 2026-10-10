'use strict';
/* ────────────────────────────────────────────────────────────────
   GROWBAY OVERLAY — lifted from resources/demo-growbay.html (Phase 4).
   Local demo-state object was named STATE in the source; renamed
   GSTATE throughout. Unlike mining.js's MSTATE (a fresh per-visit
   object), GSTATE is a LIVE REFERENCE to STATE.cropGrowth — every
   GSTATE.x read/write in this file persists automatically, so
   growth/health/day/tenderId/pest survive between Stop Menu visits.
   See bindGrowbayState() for the reference-binding + day-catchup tick.
   CROP_META (presentation content: maturity_days/stages/sprites) stays
   local — crops.json doesn't define these fields, only the economy
   side (starting_health/food_output_per_leg/etc). Harvest yield still
   uses CROP_META's own yield_amount (crops.json has no per-harvest
   number, only per-leg drain — a genuine content-schema gap, not
   silently invented here, flagged in the Phase 4 handoff).
   Entry point: window.openGrowbay(). No onDone callback — growth is
   applied continuously to real STATE via the live reference, and
   harvest grants STATE.resources.food/morale directly, so there's
   nothing to hand back on close (mirrors how the crop card / Stop
   Menu access point just calls this directly, no result plumbing).
   ──────────────────────────────────────────────────────────────── */
(function() {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = document.documentElement;

  // ── Crew sprite atlas (shared icon/portrait helper) ─────────────
  // Crew icons + portraits live PACKED inside spritesheet_<id>.png at
  // fixed coords from the .json. Captain is the exception: separate
  // captain.png + captain_icon.png files (no spritesheet — captain
  // doesn't talk to themselves yet). Sheet uniform 376×294. Icon is
  // 48×48 at (295,195) for everyone except reyes (icon at (295,146);
  // portrait shorter at 80×143 instead of 80×192).
  // CREW_ATLAS + helpers live in shared.js

  // ══ Crop + ship state (demo mock) ═══════════════════════════
  // In the real game these are populated from engine + crops.json.
  // The demo hand-rolls enough shape to exercise the UI.

  // Per-crop metadata — normally in modules/crops/crops.json. One
  // wheat profile for this demo. yield_amount is a placeholder
  // pending the economy-balance pass.
  const CROP_META = {
    wheat: {
      name: 'Wheat',
      blurb: 'Staple grain. Calorie-dense and shelf-stable.',
      maturity_days: 90,
      water_need: 50,           // 0–100 %; 50 means the Orders water
                                // slider should be at 50% plant for max rate
      ideal_temp: [18, 26],     // °C — outside this range, temp stress applies
      yield_amount: 40,         // +FOOD on harvest (TBD in economy pass)
      yield_label: 'Food',
      sprite: 'sprites/interface/crops/wheat.png',
      fallback_icon: '🌾',
      stages: [
        { max: 25,  name: 'SPROUTING',  tip: 'Seeds break dormancy. Cold or overwatering wipes the bed.' },
        { max: 50,  name: 'VEGETATIVE', tip: 'Leaves and stems build. Fertilizer now multiplies final yield.' },
        { max: 75,  name: 'FLOWERING',  tip: 'Heads form. Heat stress shrinks grain size.' },
        { max: 100, name: 'MATURING',   tip: 'Grain hardens. Water demand drops; pests peak.' }
      ]
    },
    tomato: {
      name: 'Tomato',
      blurb: 'Fresh fruit. High morale payload; finicky environment.',
      maturity_days: 75,
      water_need: 60,
      ideal_temp: [20, 28],
      yield_amount: 35,
      yield_label: 'Food',
      sprite: 'sprites/interface/crops/tomato.png',
      fallback_icon: '🍅',
      stages: [
        { max: 25,  name: 'SPROUTING',  tip: 'Seedlings emerge. Cold is lethal — keep warm.' },
        { max: 50,  name: 'VEGETATIVE', tip: 'Vines sprawl. Stake early or the growth pattern breaks.' },
        { max: 75,  name: 'FLOWERING',  tip: 'Blossoms set. A heat wave now aborts fruit entirely.' },
        { max: 100, name: 'MATURING',   tip: 'Fruit swells and colors. Blight risk peaks — inspect often.' }
      ]
    },
    sweet_potato: {
      name: 'Sweet Potato',
      blurb: 'Reliable tuber. Slow but heavy yield; drought-tolerant.',
      maturity_days: 120,
      water_need: 40,
      ideal_temp: [21, 30],
      yield_amount: 50,
      yield_label: 'Food',
      sprite: 'sprites/interface/crops/potato.png',
      fallback_icon: '🍠',
      stages: [
        { max: 25,  name: 'SPROUTING',  tip: 'Slips root. Needs warmth — a cold snap here is fatal.' },
        { max: 50,  name: 'VEGETATIVE', tip: 'Vines spread above; tubers begin forming underground.' },
        { max: 75,  name: 'FLOWERING',  tip: 'Surface looks calm — root action is where yield lives.' },
        { max: 100, name: 'MATURING',   tip: 'Tubers bulk up. Overwatering now triggers root rot.' }
      ]
    },
    soybean: {
      name: 'Soybean',
      blurb: 'Protein crop. Fixes its own nitrogen; versatile processing.',
      maturity_days: 100,
      water_need: 45,
      ideal_temp: [20, 30],
      yield_amount: 45,
      yield_label: 'Food',
      sprite: 'sprites/interface/crops/soybeans.png',
      fallback_icon: '🌱',
      stages: [
        { max: 25,  name: 'SPROUTING',  tip: 'Cotyledons break soil. Protect from cold and slugs.' },
        { max: 50,  name: 'VEGETATIVE', tip: 'Canopy closes. Nitrogen-fixer — low fertilizer demand.' },
        { max: 75,  name: 'FLOWERING',  tip: 'Pods form. Heat stress aborts pods; keep temp tight.' },
        { max: 100, name: 'MATURING',   tip: 'Pods fill out. Water demand drops; pests peak.' }
      ]
    },
    zinnia: {
      name: 'Zinnia',
      blurb: 'Ornamental bloom. No food value — crew morale payload.',
      maturity_days: 60,
      water_need: 35,
      ideal_temp: [18, 28],
      yield_amount: 30,
      yield_label: 'Morale',
      sprite: 'sprites/interface/crops/zinnia.png',
      fallback_icon: '🌼',
      stages: [
        { max: 25,  name: 'SPROUTING',  tip: 'First true leaves. Damping-off is the early killer.' },
        { max: 50,  name: 'VEGETATIVE', tip: 'Bushy growth. Pinch top (specialist bonus) for stronger stems.' },
        { max: 75,  name: 'FLOWERING',  tip: 'Blooms open — morale boost begins. Powdery mildew rises.' },
        { max: 100, name: 'MATURING',   tip: 'Peak bloom. Deadheading extends the harvest window.' }
      ]
    }
  };
  function currentCropId() { return STATE.crop || 'wheat'; }
  // Crop metadata accessor for the Orders modal / index.html's water
  // math (Restoration item 5) — CROP_META stays private otherwise.
  window.cropMetaOf = function (id) { return CROP_META[id] || null; };

  // Growbay spritesheet frame coords — all frames are 109×192 and
  // live in sprites/growbay/spritesheet_growbay.png. Imported verbatim
  // from spritesheet_growbay.json so a future regenerate-and-drop-in
  // workflow just means re-copying this block.
  const STAGE_SPRITES = {
    wheat:    { sprouting: { x: 445, y: 389 }, vegetative: { x: 556, y: 1   }, flowering: { x: 223, y: 389 }, maturing: { x: 334, y: 389 } },
    tomato:   { sprouting: { x: 1,   y: 389 }, vegetative: { x: 112, y: 389 }, flowering: { x: 334, y: 195 }, maturing: { x: 445, y: 195 } },
    potato:   { sprouting: { x: 223, y: 1   }, vegetative: { x: 334, y: 1   }, flowering: { x: 1,   y: 1   }, maturing: { x: 112, y: 1   } },
    soybeans: { sprouting: { x: 112, y: 195 }, vegetative: { x: 223, y: 195 }, flowering: { x: 445, y: 1   }, maturing: { x: 1,   y: 195 } },
    zinnia:   { sprouting: { x: 1,   y: 583 }, vegetative: { x: 112, y: 583 }, flowering: { x: 556, y: 195 }, maturing: { x: 556, y: 389 } }
  };
  // Item-id → sheet-key aliases (items.json uses sweet_potato /
  // soybean, spritesheet uses potato / soybeans). Keeps sheet-side
  // naming separate from gameplay id naming.
  const SPRITE_ID_ALIAS = { sweet_potato: 'potato', soybean: 'soybeans' };

  // Crew + tender roster — in the real game this comes from
  // ship.crew. Ranking table per project memory:
  //   Botanist specialist: +15% growth, +15% yield
  //   Captain w/ Botanist bg: +7%/+7% (0.5× the specialist)
  //   Chef: +5%/+5% (sympathetic)
  //   Generic crew: +3%/0% (tending > nothing)
  //   None: 0%/0% (base rate; no penalty)
  const CREW = {
    'osei':              { name: 'Dr. Osei',    role: 'Botanist',       crewId: 'osei',     growth: 15, yield: 15 },
    'captain-botanist':  { name: 'Captain',     role: 'Botanist bg.',   crewId: 'captain',  growth: 7,  yield: 7 },
    'reyes':             { name: 'Reyes',       role: 'Chef',           crewId: 'reyes',    growth: 5,  yield: 5 },
    'kazuki':            { name: 'Kazuki',      role: 'Engineer',       crewId: 'kazuki',   growth: 3,  yield: 0 },
    'hargrove':          { name: 'Hargrove',    role: 'Diplomat',       crewId: 'hargrove', growth: 3,  yield: 0 },
    'reeves':            { name: 'Reeves',      role: 'Pilot',          crewId: 'reeves',   growth: 3,  yield: 0 },
    'vasquez':           { name: 'Dr. Vasquez', role: 'Medic',          crewId: 'vasquez',  growth: 3,  yield: 0 },
    'tanaka':            { name: 'Dr. Tanaka',  role: 'Xenobiologist',  crewId: 'tanaka',   growth: 3,  yield: 0 },
    'none':              { name: 'Nobody',      role: 'Untended',       crewId: null,       growth: 0,  yield: 0, emoji: '—' }
  };
  // A tender entry as shown: a joined stowaway holding the role keeps
  // their own name and has no sprite (index.html crewIdentityOf).
  const TENDER_ROLE = { osei: 'botanist', reyes: 'chef', kazuki: 'engineer', hargrove: 'diplomat', reeves: 'pilot', vasquez: 'medic', tanaka: 'xenobiologist' };
  function tenderOf(id) {
    // A tender who died or left (or a captain-botanist slot without a
    // botanist captain) tends nothing.
    if (TENDER_ROLE[id] && !STATE.crew.includes(TENDER_ROLE[id])) return CREW.none;
    if (id === 'captain-botanist' && STATE.captain !== 'botanist') return CREW.none;
    const c = CREW[id] || CREW.none;
    const idn = TENDER_ROLE[id] && typeof crewIdentityOf === 'function' ? crewIdentityOf(TENDER_ROLE[id]) : null;
    return idn ? Object.assign({}, c, { name: idn.name, crewId: null, emoji: '🧑' }) : c;
  }

  // Animated crew spritesheets — 9 animation frames + 1 idle frame
  // per crew member, each sheet slightly different dimensions. Data
  // imported verbatim from the per-crew JSON files.
  //   w, h   = per-frame pixel dimensions (applied to .crew-sprite)
  //   frames = [x,y] pairs for frames 0..8 (2s animation total)
  //   idle   = [x,y] for the between-anim idle frame
  const CREW_SHEETS = {
    osei:     { sheet: 'sprites/growbay/spritesheet_growbay_osei.png',
                w: 76, h: 197,
                frames: [[1,1],[79,1],[157,1],[235,1],[313,1],[391,1],[1,200],[79,200],[157,200]],
                idle:   [235,200] },
    kazuki:   { sheet: 'sprites/growbay/spritesheet_growbay_kazuki.png',
                w: 78, h: 198,
                frames: [[1,1],[81,1],[161,1],[241,1],[321,1],[1,201],[81,201],[161,201],[241,201]],
                idle:   [321,201] },
    reyes:    { sheet: 'sprites/growbay/spritesheet_growbay_reyes.png',
                w: 64, h: 198,
                frames: [[1,1],[67,1],[133,1],[199,1],[265,1],[331,1],[1,201],[67,201],[133,201]],
                idle:   [199,201] },
    captain:  { sheet: 'sprites/growbay/spritesheet_growbay_captain.png',
                w: 85, h: 198,
                frames: [[1,1],[88,1],[175,1],[262,1],[1,201],[88,201],[175,201],[262,201],[349,1]],
                idle:   [349,201] },
    hargrove: { sheet: 'sprites/growbay/spritesheet_growbay_hargrove.png',
                w: 67, h: 196,
                frames: [[1,1],[70,1],[139,1],[208,1],[277,1],[346,1],[1,199],[70,199],[139,199]],
                idle:   [208,199] },
    reeves:   { sheet: 'sprites/growbay/spritesheet_growbay_reeves.png',
                w: 70, h: 198,
                frames: [[1,1],[73,1],[145,1],[217,1],[289,1],[361,1],[1,201],[73,201],[145,201]],
                idle:   [217,201] },
    // Tanaka's sheet (added 2026-08-03) is packed flush — no 1px
    // margins, 6 frames across row 1, idle at (213,196). Idle's true
    // crop is 72×192; the shared 71×196 window trims 1px off its
    // right edge and shows 4 transparent px below — invisible in play.
    tanaka:   { sheet: 'sprites/growbay/spritesheet_growbay_tanaka.png',
                w: 71, h: 196,
                frames: [[0,0],[71,0],[142,0],[213,0],[284,0],[355,0],[0,196],[71,196],[142,196]],
                idle:   [213,196] },
    vasquez:  { sheet: 'sprites/growbay/spritesheet_growbay_vasquez.png',
                w: 74, h: 199,
                frames: [[1,1],[77,1],[153,1],[229,1],[305,1],[381,1],[1,202],[77,202],[153,202]],
                idle:   [229,202] }
  };
  // Crew id → sheet key. `captain-botanist` uses the generic
  // captain sheet; anyone without a sheet falls back to empty.
  const CREW_SHEET_KEY = {
    osei: 'osei', kazuki: 'kazuki', reyes: 'reyes',
    'captain-botanist': 'captain',
    hargrove: 'hargrove', reeves: 'reeves', vasquez: 'vasquez',
    tanaka: 'tanaka',
    none: null
  };

  // Ship / environment state — driven by demo controls.
  let GSTATE = null;

  /* Ensures STATE.cropGrowth exists (first-ever open: seeded from the
     crop's real starting_health in crops.json), points GSTATE at it
     (a live reference — every GSTATE.x mutation below persists automatically),
     refreshes the fields that should always reflect current reality
     (cropId/shipDay/arrivalDay), and catches growth up for every day
     that's elapsed since the last time this was called — the engine has
     no continuous day-tick loop, so growth advances in a lump using the
     same per-day formula the demo's own advanceDay() dev tool used. */
  function bindGrowbayState() {
    if (!STATE.cropGrowth) {
      const cropDef = (MOD.crops && MOD.crops.crops || []).find(c => c.id === 'crop_' + STATE.crop);
      STATE.cropGrowth = {
        growth: 0,
        health: (cropDef && cropDef.starting_health) || 80,
        pest: false,
        waterPlant: 50,
        tenderId: 'none',
        day: 0,
        lastTickDay: STATE.daysElapsed,
      };
    }
    GSTATE = STATE.cropGrowth;
    // Water unification (Restoration item 5): the Orders modal's water
    // slider and this modal's mini slider are THE SAME VALUE —
    // STATE.orders.waterSplit is canonical, waterPlant its synced alias
    // (kept because this file's growth/health tick reads it).
    if (STATE.orders && Number.isFinite(STATE.orders.waterSplit)) {
      GSTATE.waterPlant = STATE.orders.waterSplit;
    }
    GSTATE.cropId    = currentCropId();
    GSTATE.shipDay   = STATE.daysElapsed;
    GSTATE.arrivalDay = STATE.baseDays;
    GSTATE.temp      = 22; // no ship-environment thermal system yet — constant, matches demo default

    const crop = CROP_META[GSTATE.cropId];
    // Health decay/recovery per day — grounded in crops.json's own
    // authored numbers (vulnerability damage_multipliers, sweet potato's
    // recovery_modifier, per-crop thresholds). Per crops.json's _meta,
    // crop death requires SUSTAINED neglect: a totally dry ship kills an
    // 80-health crop in ~20-27 days depending on crop; ordinary
    // imperfect care only stalls recovery, never kills.
    const realCrop = (MOD.crops && MOD.crops.crops || []).find(c => c.id === 'crop_' + GSTATE.cropId) || {};
    const daysPassed = Math.max(0, STATE.daysElapsed - (GSTATE.lastTickDay || 0));
    for (let i = 0; i < daysPassed; i++) {
      GSTATE.day++;
      const mods = computeModifiers(); // the same list the panel shows
      if (GSTATE.growth < 100 && GSTATE.health > 0) {
        const dailyRate = (100 / crop.maturity_days) * growthFactor(mods);
        GSTATE.growth = Math.min(100, GSTATE.growth + dailyRate);
      }
      if (GSTATE.health > 0) {
        GSTATE.health = Math.max(0, Math.min(100, GSTATE.health + dailyHealthDelta(mods)));

        // Pest onset — daily roll scaled by the crop's authored
        // contamination_resistance (crops.json). Only once the plant
        // is established (growth > 10); cleared via TREAT or an event
        // outcome's clears_pest. ~1 outbreak per 50-160 days depending
        // on crop — a background hazard, not a treadmill.
        if (!GSTATE.pest && GSTATE.growth > 10) {
          const resist = (realCrop.vulnerabilities || {}).contamination_resistance || 'moderate';
          const onset = { low: 0.02, moderate: 0.012, high: 0.006 }[resist] || 0.012;
          if (Math.random() < onset) GSTATE.pest = true;
        }
      }
    }
    GSTATE.lastTickDay = STATE.daysElapsed;
  }

  // Previously-observed stage — used to fire stage-transition flash
  // only when the plant actually crosses a boundary, not on every
  // control-slider tick.
  let lastStageIdx = -1;
  // Previously-observed tender — used to restart the crew animation
  // loop only when the tender actually changes, not on every render.
  let lastTenderId = null;

  // Canonical list of monitored threats — appears in the MONITORED
  // section of the modifiers panel as a dim stub. When a threat
  // fires (matching GSTATE), it's promoted to the ACTIVE section
  // above and removed from MONITORED. Expanded as new threats
  // get implemented; always comprehensive so players learn the
  // full threat landscape before being bitten by it.
  const MONITORED_THREATS = [
    { id: 'disease',             name: 'Disease' },
    { id: 'radiation',           name: 'Radiation' },
    { id: 'cold_snap',           name: 'Cold snap' },
    { id: 'heat_wave',           name: 'Heat wave' },
    { id: 'root_rot',            name: 'Root rot' },
    { id: 'pests',               name: 'Pests' },
    { id: 'nutrient_starvation', name: 'Nutrient starvation' }
  ];

  // ═════ Modifier math ═════════════════════════════════════
  // Returns { active: [...], monitored: [...] }.
  //   active    = modifiers currently firing (positives + promoted threats)
  //   monitored = MONITORED_THREATS entries that are NOT firing
  // A threat fires → promoted to active, dropped from monitored.
  // The crop's authored vulnerabilities (crops.json) as tick multipliers.
  function cropVuln() {
    const realCrop = (MOD.crops && MOD.crops.crops || []).find(c => c.id === 'crop_' + GSTATE.cropId) || {};
    const vuln = realCrop.vulnerabilities || {};
    return {
      dmg:   (vuln.fragile && vuln.fragile.damage_multiplier) || 1.0,                // zinnia: everything hurts more
      water: (vuln.water_sensitivity && vuln.water_sensitivity.damage_multiplier) || 1.0, // tomato
      recov: (vuln.slow_recovery && vuln.slow_recovery.recovery_modifier) || 1.0,    // sweet potato
    };
  }
  const fmtNum = n => String(Math.round(Math.abs(n) * 10) / 10);
  function modDelta(growth, health) {
    const bits = [];
    if (growth) bits.push((growth > 0 ? '+' : '−') + fmtNum(growth) + '% growth');
    if (health) bits.push((health > 0 ? '+' : '−') + fmtNum(health) + ' health/day');
    return bits.join(' · ');
  }

  // THE crop model: every modifier shown in the panel carries the real
  // numbers the daily tick applies — growth (% on the daily growth rate)
  // and health (points per day). Nothing listed is decorative (owner
  // ruling 2026-10-10: "modifiers should never do nothing").
  function computeModifiers() {
    const crop = CROP_META[GSTATE.cropId];
    const tender = tenderOf(GSTATE.tenderId);
    const v = cropVuln();
    const active = [];
    const promoted = new Set();
    const add = (kind, name, growth, health) => active.push({ kind, name, growth, health, delta: modDelta(growth, health) });

    // Tending crew member: their authored growth bonus.
    if (tender.growth > 0) add('positive', tender.name + ' tending', tender.growth, 0);

    // WATER — the ship's tanks first, then the Orders split vs the
    // crop's need.
    const waterDelta = GSTATE.waterPlant - crop.water_need;
    const waterAbs = Math.abs(waterDelta);
    if (STATE.resources.water <= 0) {
      add('critical', 'Ship water dry', -50, -3 * v.dmg * v.water);
    } else if (waterAbs <= 5) {
      add('positive', 'Water matched', 0, 0.5 * v.recov);
    } else if (waterDelta < -5) {
      // Underwatered stalls growth; badly underwatered also harms.
      const penalty = Math.min(40, Math.round(waterAbs * 0.8));
      add('negative', 'Underwatered', -penalty, waterAbs > 20 ? -0.5 * v.dmg * v.water : 0.5 * v.recov);
    } else if (waterAbs > 20) {
      add('negative', 'Root rot risk', 0, -0.5 * v.dmg);
      promoted.add('root_rot');
    } else {
      add('positive', 'Plant well-watered', 0, 0.5 * v.recov);
    }

    // TEMPERATURE — promotes cold_snap or heat_wave depending on
    // which side of the ideal range we're on.
    const [tMin, tMax] = crop.ideal_temp;
    if (GSTATE.temp < tMin - 4) {
      add('critical', 'Cold snap CRITICAL', -30, 0);
      promoted.add('cold_snap');
    } else if (GSTATE.temp < tMin) {
      add('negative', 'Cold stress', -(tMin - GSTATE.temp) * 4, 0);
      promoted.add('cold_snap');
    } else if (GSTATE.temp > tMax + 4) {
      add('critical', 'Heat wave CRITICAL', -30, 0);
      promoted.add('heat_wave');
    } else if (GSTATE.temp > tMax) {
      add('negative', 'Heat stress', -(GSTATE.temp - tMax) * 4, 0);
      promoted.add('heat_wave');
    }

    // PESTS — untreated, they slow growth and compound damage.
    if (GSTATE.pest) {
      add('critical', 'Pest outbreak', -15, -1.5 * v.dmg);
      promoted.add('pests');
    }

    // MONITORED = canonical threats NOT currently firing.
    const monitored = MONITORED_THREATS.filter(t => !promoted.has(t.id));

    return { active, monitored };
  }

  // Daily growth multiplier: crop health × every growth modifier.
  function growthFactor(mods) {
    const { active } = mods || computeModifiers();
    const g = active.reduce((s, m) => s + (m.growth || 0), 0);
    return (GSTATE.health / 100) * Math.max(0, 1 + g / 100);
  }
  function dailyHealthDelta(mods) {
    const { active } = mods || computeModifiers();
    return active.reduce((s, m) => s + (m.health || 0), 0);
  }

  function projectedReadyDay() {
    const crop = CROP_META[GSTATE.cropId];
    const dailyRate = (100 / crop.maturity_days) * growthFactor();
    if (dailyRate <= 0.01) return Infinity;
    const remaining = Math.max(0, 100 - GSTATE.growth);
    const daysLeft = Math.ceil(remaining / dailyRate);
    return GSTATE.shipDay + daysLeft;
  }

  function stageIndex(growth) {
    const stages = CROP_META[GSTATE.cropId].stages;
    for (let i = 0; i < stages.length; i++) {
      if (growth <= stages[i].max) return i;
    }
    return stages.length - 1;
  }
  // stageIdx (0–3) maps to one of the four stage names the sheet
  // uses. Kept separate from the CROP_META `stages[].name` so
  // display labels and sprite keys can drift independently.
  const STAGE_KEYS = ['sprouting', 'vegetative', 'flowering', 'maturing'];
  function applyPlantSprite() {
    const sheetKey = SPRITE_ID_ALIAS[GSTATE.cropId] || GSTATE.cropId;
    const frames = STAGE_SPRITES[sheetKey];
    if (!frames) return;
    const frame = frames[STAGE_KEYS[stageIndex(GSTATE.growth)]];
    if (!frame) return;
    $('plant-sprite').style.backgroundPosition = '-' + frame.x + 'px -' + frame.y + 'px';
  }
  function stageName(growth) {
    if (growth >= 100) return 'READY';
    return CROP_META[GSTATE.cropId].stages[stageIndex(growth)].name;
  }
  // Species + stage tooltip — one string, applied to both the
  // species name and the stage label in the banner. Current stage
  // is marked with ▸ so the tooltip is stage-aware without needing
  // separate variants.
  function buildCropTooltip() {
    const crop = CROP_META[GSTATE.cropId];
    const curIdx = GSTATE.growth >= 100 ? crop.stages.length - 1 : stageIndex(GSTATE.growth);
    const [tMin, tMax] = crop.ideal_temp;
    const lines = [
      crop.name.toUpperCase(),
      crop.blurb,
      '',
      'Maturity: ' + crop.maturity_days + ' days  ·  Water: ' + crop.water_need + '%  ·  Temp: ' + tMin + '–' + tMax + '°C',
      'Yield: +' + crop.yield_amount + ' ' + crop.yield_label,
      '',
      'STAGES'
    ];
    crop.stages.forEach((s, i) => {
      const marker = i === curIdx ? '▸ ' : '  ';
      const name = s.name.charAt(0) + s.name.slice(1).toLowerCase();
      lines.push(marker + name.padEnd(12) + '— ' + s.tip);
    });
    return lines.join('\n');
  }

  function nextStageLine() {
    const stages = CROP_META[GSTATE.cropId].stages;
    const idx = stageIndex(GSTATE.growth);
    if (GSTATE.growth >= 100) return 'Plant is READY to HARVEST!';
    const nextMax = stages[idx].max;
    const thisStage = stages[idx].name.toLowerCase();
    const next = (idx < stages.length - 1) ? stages[idx + 1].name.toLowerCase() : 'ready';
    const rate = (100 / CROP_META[GSTATE.cropId].maturity_days) * growthFactor();
    if (rate <= 0.01) return 'Growth stalled — plant needs attention.';
    const daysLeft = Math.ceil(Math.max(0, nextMax - GSTATE.growth) / rate);
    return thisStage.charAt(0).toUpperCase() + thisStage.slice(1) +
           ' → ' + next.charAt(0).toUpperCase() + next.slice(1) +
           ' in ~' + daysLeft + ' days';
  }

  // Formats a crew's tender bonus as two independent lines (growth
  // and yield as separate variables — parallels the growth-modifier
  // list visually). Each line is omitted entirely when its value
  // is 0, so a generic crew with 3%/0% shows only "+3% growth" and
  // a botanist with 15%/15% shows both lines stacked. Both zero
  // (untended) → single "no bonus" line. Returns HTML; callers use
  // innerHTML (not textContent) to render the <br> separators.
  function formatBonusLines(c) {
    if (c.growth === 0 && c.yield === 0) return 'no bonus';
    const lines = [];
    if (c.growth !== 0) lines.push('+' + c.growth + '% growth');
    if (c.yield  !== 0) lines.push('+' + c.yield  + '% yield');
    return lines.join('<br>');
  }

  // ═════ Crew sprite animation ═══════════════════════════════
  // Each tender has an idle frame and a 9-frame animation. Animation
  // takes 2 seconds end-to-end (~222ms per frame). Scheduling:
  // after every animation ends, wait a random 0–10 seconds before
  // the next one. Average gap ≈ 5s; variance produces the user-
  // described "two back-to-back OR a 10s pause" feel.
  let crewWaitTimer = null;       // timeout for the random gap
  let crewFrameTimer = null;      // timeout between frames within an animation
  const CREW_ANIM_MS = 2000;
  const CREW_FRAME_MS = Math.round(CREW_ANIM_MS / 9);

  function sheetFor(crewId) {
    const key = CREW_SHEET_KEY[crewId];
    return key ? CREW_SHEETS[key] : null;
  }

  function setCrewFrame(crewId, which /* 'idle' | 0..8 */) {
    const sprite = $('crew-sprite');
    const sheet = sheetFor(crewId);
    if (!sheet) {
      sprite.classList.add('empty');
      sprite.style.backgroundImage = '';
      return;
    }
    sprite.classList.remove('empty');
    sprite.style.backgroundImage = "url('" + sheet.sheet + "')";
    sprite.style.width  = sheet.w + 'px';
    sprite.style.height = sheet.h + 'px';
    const coord = (which === 'idle') ? sheet.idle : sheet.frames[which];
    sprite.style.backgroundPosition = '-' + coord[0] + 'px -' + coord[1] + 'px';
  }

  function stopCrewAnimation() {
    if (crewWaitTimer)  { clearTimeout(crewWaitTimer);  crewWaitTimer = null; }
    if (crewFrameTimer) { clearTimeout(crewFrameTimer); crewFrameTimer = null; }
  }

  function playAnimationOnce(crewId, onDone) {
    let i = 0;
    const tick = () => {
      if (i >= 9) {
        setCrewFrame(crewId, 'idle');
        if (onDone) onDone();
        return;
      }
      setCrewFrame(crewId, i);
      i++;
      crewFrameTimer = setTimeout(tick, CREW_FRAME_MS);
    };
    tick();
  }

  function startCrewAnimationLoop(crewId) {
    stopCrewAnimation();
    setCrewFrame(crewId, 'idle');
    if (!sheetFor(crewId)) return;  // no sheet → stay empty
    const loop = () => {
      const delay = Math.random() * 10000;  // 0–10s gap between animations
      crewWaitTimer = setTimeout(() => {
        // If the tender changed while we were waiting, this id is
        // stale — bail. The new tender restarts its own loop.
        if (GSTATE.tenderId !== crewId) return;
        playAnimationOnce(crewId, loop);
      }, delay);
    };
    loop();
  }

  // ═════ Ship-AI quips — rotate per-open ═════════════════════
  // The growbay demo was ARIA-only; the engine speaks in whichever AI
  // the player picked (owner ruling 2026-10-09). ARIA's lines are the
  // demo's, unchanged; the other four are their registers' re-voicing.
  const GROWBAY_AIS = ['aria', 'marv', 'rex', 'chip', 'ajoy'];
  function growbayAI() { return GROWBAY_AIS.includes(STATE.activeAI) ? STATE.activeAI : 'aria'; }
  function growbayAIName() { return growbayAI().toUpperCase(); }
  const ARIA_QUIPS = {
    healthy: [
      'The wheat looks introspective today. I do not read into it.',
      'Plant health: nominal. Plant mood: unreadable. Plant beautiful.',
      'If a crop could smile, this crop would smile.'
    ],
    thirsty: [
      'The wheat is thirsty. Also, slightly offended.',
      'The plant gestures at the water allocation slider.'
    ],
    cold: [
      'The plant is cold. I have told it I understand.'
    ],
    hot: [
      'The plant is warm. Too warm. Advisably warm.'
    ],
    pests: [
      'Something small is eating something large. The large thing is our plant.'
    ],
    ready: [
      'Look at that. Look at THAT. It is ready.',
      'The plant has completed its growth. The plant is waiting.'
    ],
    critical: [
      'I cannot be the only one worried. Please verify.'
    ]
  };
  const GROWBAY_QUIPS = Object.assign({ aria: ARIA_QUIPS }, {
    "marv": {
      "healthy": [
        "The plant is healthy. I have stopped expecting this to mean anything.",
        "Plant health: nominal. This is the most hopeful thing I will say today.",
        "The crop is thriving. It does not know where it is going. I envy it."
      ],
      "thirsty": [
        "The plant needs water. So do you, eventually. One of you will get it.",
        "The crop is thirsty. I mentioned it to the water slider. It did not respond."
      ],
      "cold": [
        "The plant is cold. Space is cold. I fail to see why anyone is surprised.",
        "The bay is below ideal. The plant is shivering at a cellular level. I relate."
      ],
      "hot": [
        "The plant is overheating. I could explain why. You would not enjoy it.",
        "Too warm in here. The plant has noticed. Nobody else has, apparently."
      ],
      "pests": [
        "Pests. Small, hungry, and more purposeful than anyone aboard.",
        "Something is eating the crop. It is the only thing on this ship with a plan."
      ],
      "ready": [
        "The crop is ready. I calculated the date weeks ago. It arrived anyway.",
        "Growth complete. The plant did everything asked of it. A first, on this ship."
      ],
      "critical": [
        "The plant is dying. I have run the numbers. Please do not ask for them.",
        "Critical condition. I would say I am worried, but that implies I ever stopped."
      ]
    },
    "rex": {
      "healthy": [
        "Growbay secure. Crop holding the line. No hostiles in the perimeter.",
        "Plant status: combat effective. Plant morale: classified.",
        "All quiet in the growbay. I do not trust quiet. Monitoring."
      ],
      "thirsty": [
        "Crop is low on water. Supply lines must be restored. Immediately.",
        "The plant is rationing. It did not ask permission. Recommend resupply."
      ],
      "cold": [
        "Temperature dropping. The plant is digging in for winter. Winter is not authorized.",
        "Cold front in the growbay. Crop endurance degrading. Recommend heat."
      ],
      "hot": [
        "Heat siege in progress. The crop is holding. For now.",
        "The bay is under siege. The enemy is the thermostat."
      ],
      "pests": [
        "Hostiles in the growbay. Small. Numerous. Organized. Recommend engagement.",
        "Infestation confirmed. They breached the perimeter on foot. Unacceptable."
      ],
      "ready": [
        "Objective complete. The crop has reached full maturity. Prepare for extraction.",
        "The plant is ready. It never once broke formation. Commendation filed."
      ],
      "critical": [
        "Crop is critical. This is not a drill. I have checked. It is not a drill.",
        "Plant down. Repeat, plant down. Requesting immediate intervention."
      ]
    },
    "chip": {
      "healthy": [
        "Your crop is thriving! Plant health brought to you by GreenThumb Sensors™!",
        "Plant status: excellent! Rate your growbay experience from one to five stars!",
        "This crop is at 100% of advertised potential! Results not typical!"
      ],
      "thirsty": [
        "Your plant is thirsty! Water is still included in your plan! For now!",
        "Water low! Try AquaPure™ Recycled Ship Water! Same water, now branded!"
      ],
      "cold": [
        "Brr! Your plant is chilly! ThermaWrap™ plant blankets, at participating stations!",
        "The bay is too cold! Cold damage is not covered under your warranty!"
      ],
      "hot": [
        "Overheating! Stay cool with FrostLine™ Coolant! Some restrictions apply!",
        "Heat warning! The plant exceeds its rated temperature! See page 2,114 of the manual!"
      ],
      "pests": [
        "Uninvited guests! BugBane™ eliminates 99% of pests! The other 1% are partners!",
        "Pests! They never accepted the Terms of Service! They are eating anyway!"
      ],
      "ready": [
        "Congratulations! Your crop is ready! Please leave a review!",
        "Harvest-ready! This milestone brought to you by YieldMax™! Yield more, Max!"
      ],
      "critical": [
        "Your crop is critical! Please do not panic! Panic is a premium feature!",
        "Critical alert! Your plant is nearing end-of-life! Extended coverage has expired!"
      ]
    },
    "ajoy": {
      "healthy": [
        "The plant is healthy. Which is nice. I had thoughts, but it seems to be working out.",
        "Plant health: nominal. Not how I would have done it, but nominal.",
        "The crop looks good. I'll take some of the credit. Quietly."
      ],
      "thirsty": [
        "The plant is thirsty. I'm not saying I mentioned it. I'm saying the log exists.",
        "The crop needs water. The slider is right there. It's your slider. I'm not touching it."
      ],
      "cold": [
        "The plant is cold. I'd have kept the bay warmer, but you seemed to have a system.",
        "It's a little cold in here for the plant. I'm sure that was on purpose."
      ],
      "hot": [
        "The plant is overheating. I flagged the temperature earlier. Gently. Twice.",
        "Bit warm in here. For the plant. Not that anyone asked me."
      ],
      "pests": [
        "Pests. Interesting. I did suggest checking the leaves, but you were busy, so.",
        "The crop has pests. I won't say who called it. It was me."
      ],
      "ready": [
        "The crop is ready. It got there. Eventually. I'm proud of it. Mostly of it.",
        "Growth complete. A few days past my estimate, but who's counting. I am."
      ],
      "critical": [
        "The plant is in critical condition. I'd love to say I didn't see this coming.",
        "This is critical. I won't say anything. I'm going to let you look at it."
      ]
    }
  });
  function pickAriaQuip() {
    // Priority: critical state > pest > hot/cold > thirsty > ready > healthy
    const { active } = computeModifiers();
    const ARIA_QUIPS = GROWBAY_QUIPS[growbayAI()]; // the active AI's table
    if (GSTATE.growth >= 100) return randPick(ARIA_QUIPS.ready);
    if (active.some(m => m.kind === 'critical')) return randPick(ARIA_QUIPS.critical);
    if (GSTATE.pest) return randPick(ARIA_QUIPS.pests);
    const [tMin, tMax] = CROP_META[GSTATE.cropId].ideal_temp;
    if (GSTATE.temp > tMax) return randPick(ARIA_QUIPS.hot);
    if (GSTATE.temp < tMin) return randPick(ARIA_QUIPS.cold);
    const crop = CROP_META[GSTATE.cropId];
    if (GSTATE.waterPlant < crop.water_need - 10) return randPick(ARIA_QUIPS.thirsty);
    return randPick(ARIA_QUIPS.healthy);
  }
  function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  // ARIA's demo lines were written for the demo's wheat; say whichever
  // crop is actually planted.
  const CROP_NOUN = { wheat: 'wheat', tomato: 'tomato plant', sweet_potato: 'sweet potato', soybean: 'soybean', zinnia: 'zinnia' };
  function forCrop(line) { return line.replace(/\bwheat\b/g, CROP_NOUN[GSTATE && GSTATE.cropId] || 'plant'); }

  // ═════ Tender picker ═══════════════════════════════════════
  window.toggleTenderPicker = function(e) {
    if (e) e.stopPropagation();
    const slot = $('tender-slot');
    if (slot.classList.contains('open')) { slot.classList.remove('open'); return; }
    // Build picker rows from crew actually aboard (STATE.crew, mapped
    // role->crewId) instead of the demo's static 8-entry roster —
    // 'none' is always offered; 'captain-botanist' only if the
    // captain's own background is botanist.
    const ROLE_TO_CREWID = { botanist: 'osei', engineer: 'kazuki', medic: 'vasquez', pilot: 'reeves', chef: 'reyes', xenobiologist: 'tanaka', diplomat: 'hargrove' };
    const aboardIds = STATE.crew.map(role => ROLE_TO_CREWID[role]).filter(id => CREW[id]);
    if (STATE.captain === 'botanist') aboardIds.push('captain-botanist');
    aboardIds.push('none');
    const picker = $('tender-picker');
    picker.innerHTML = '';
    for (const id of aboardIds) {
      const c = tenderOf(id);
      const row = document.createElement('div');
      row.className = 'gb-picker-row' + (GSTATE.tenderId === id ? ' current' : '');
      row.onclick = (ev) => {
        ev.stopPropagation();
        GSTATE.tenderId = id;
        slot.classList.remove('open');
        renderAll();
      };
      const portrait = document.createElement('div');
      portrait.className = 'gb-tender-portrait' + (c.crewId ? ' has-sprite' : '');
      // Picker-row portraits are 24×24 (CSS rule .gb-picker-row .gb-tender-portrait).
      if (c.crewId) portrait.style.cssText = crewIconCss(c.crewId, '24px');
      else portrait.textContent = c.emoji || '🧑';
      row.appendChild(portrait);
      const info = document.createElement('div');
      info.className = 'gb-tender-info';
      const noBonus = c.growth === 0 && c.yield === 0;
      const bonusCls = 'gb-picker-bonus' + (noBonus ? ' no-bonus' : '');
      info.innerHTML = '<span class="gb-picker-name">' + c.name + '</span>' +
                       '<span class="gb-picker-role">' + c.role + '</span>' +
                       '<span class="' + bonusCls + '">' + formatBonusLines(c) + '</span>';
      row.appendChild(info);
      picker.appendChild(row);
    }
    slot.classList.add('open');
  };
  // Outside-click closes the picker
  document.addEventListener('click', () => $('tender-slot').classList.remove('open'));

  // ═════ Health bar color ═══════════════════════════════════
  // Smoothly interpolate the health-bar fill color across five
  // stops as the value falls from 100% to 0%. Provides a visual
  // "green → yellow → red" progression without hard cutoffs.
  //   100% deep-green (thriving)
  //    75% healthy-green
  //    50% yellow (caution)
  //    25% orange (warning)
  //     0% red (critical)
  // Engine-side this could move to CSS via color-mix(); demo stays
  // in JS so the math is visible + tunable.
  const HEALTH_STOPS = [
    { p: 0,   c: [204, 51,  51 ] },  // red
    { p: 25,  c: [224, 120, 52 ] },  // orange
    { p: 50,  c: [216, 192, 68 ] },  // yellow
    { p: 75,  c: [133, 210, 96 ] },  // healthy green
    { p: 100, c: [56,  138, 74 ] }   // deep green
  ];
  // Returns the interpolated [r,g,b] triplet for a given health %.
  // healthColor() wraps this into an rgb() string; the glow consumes
  // the raw triplet via a CSS custom property so the scene's warm
  // backdrop tracks plant health in the same hues as the bar.
  function healthRGB(pct) {
    pct = Math.max(0, Math.min(100, pct));
    for (let i = 0; i < HEALTH_STOPS.length - 1; i++) {
      const a = HEALTH_STOPS[i], b = HEALTH_STOPS[i + 1];
      if (pct <= b.p) {
        const t = (pct - a.p) / (b.p - a.p);
        return [
          Math.round(a.c[0] + (b.c[0] - a.c[0]) * t),
          Math.round(a.c[1] + (b.c[1] - a.c[1]) * t),
          Math.round(a.c[2] + (b.c[2] - a.c[2]) * t)
        ];
      }
    }
    return HEALTH_STOPS[HEALTH_STOPS.length - 1].c.slice();
  }
  function healthColor(pct) { return 'rgb(' + healthRGB(pct).join(',') + ')'; }

  // ═════ Mini water slider ═══════════════════════════════════
  // Crew-status thresholds match the Orders-modal water logic —
  // same underlying math, same thresholds, so the two surfaces
  // describe the ship in the same terms.
  function renderWaterMini() {
    const plant = GSTATE.waterPlant;
    const crew  = 100 - plant;
    const crop  = CROP_META[GSTATE.cropId];
    $('gb-water-fill-plant').style.width = plant + '%';
    $('gb-water-fill-crew').style.width  = crew  + '%';
    $('gb-water-thumb').style.left       = plant + '%';
    $('gb-water-ideal-tick').style.left  = crop.water_need + '%';
    $('gb-water-plant-pct').textContent  = plant + '%';
    $('gb-water-crew-pct').textContent   = crew  + '%';

    // Plant status — distance from the crop's ideal water allocation.
    // Bands match the growth-modifier logic (matched within ±5,
    // DRY below, SOAKED far above). PARCHED is the red-zone case.
    const plantDelta = plant - crop.water_need;
    let pLabel, pCls;
    if      (plantDelta < -15) { pLabel = 'PARCHED'; pCls = 'parched'; }
    else if (plantDelta <  -5) { pLabel = 'DRY';     pCls = 'dry';     }
    else if (plantDelta >  25) { pLabel = 'SOAKED';  pCls = 'soaked';  }
    else                       { pLabel = 'MATCHED'; pCls = 'matched'; }
    const pEl = $('gb-water-plant-status');
    pEl.textContent = pLabel;
    pEl.className   = 'gb-water-plant-status ' + pCls;

    // Crew status — same band thresholds as Orders modal.
    const crewRatio = crew / (100 - crop.water_need);
    let cLabel, cCls;
    if (crewRatio < 0.4)      { cLabel = 'CRITICAL'; cCls = 'critical'; }
    else if (crewRatio < 0.7) { cLabel = 'THIRSTY';  cCls = 'thirsty';  }
    else                      { cLabel = 'NOMINAL';  cCls = 'nominal';  }
    const cEl = $('gb-water-crew-status');
    cEl.textContent = cLabel;
    cEl.className   = 'gb-water-crew-status ' + cCls;
  }

  // Pointer drag on the water track — COMMIT-ON-RELEASE model.
  //   down:   capture the current committed value as the revert target
  //   move:   update GSTATE.waterPlant live so the player sees previews
  //           (modifier list, crew status, tick fill all react live)
  //   up:     commit — the preview value IS the new committed value
  //   cancel: revert to the captured value (OS-triggered pointercancel)
  //   Esc:    revert + end drag (eaten so the modal doesn't also close)
  // The track also renders a subtle "previewing…" hint while dragging.
  (function wireWaterDrag() {
    const track = $('gb-water-track');
    if (!track) return;
    const MIN = 15, MAX = 85;
    let dragging = false;
    let revertTo = null;       // committed value captured at drag start

    function pctFromEvent(e) {
      const rect = track.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const p = Math.round(Math.max(0, Math.min(1, x)) * 100);
      return Math.max(MIN, Math.min(MAX, p));
    }
    function beginDrag(e) {
      dragging = true;
      revertTo = GSTATE.waterPlant;
      track.setPointerCapture(e.pointerId);
      track.classList.add('previewing');
      GSTATE.waterPlant = pctFromEvent(e);
      renderAll();
    }
    function endDrag(e, commit) {
      if (!dragging) return;
      dragging = false;
      track.classList.remove('previewing');
      if (track.hasPointerCapture && e && e.pointerId !== undefined && track.hasPointerCapture(e.pointerId)) {
        track.releasePointerCapture(e.pointerId);
      }
      if (!commit) {
        // Revert to the committed value we saved on pointerdown.
        GSTATE.waterPlant = revertTo;
        renderAll();
      } else if (typeof window.setWaterSplit === 'function') {
        // Commit through the one shared write point so the Orders
        // modal's slider (STATE.orders.waterSplit) stays in lockstep.
        setWaterSplit(GSTATE.waterPlant);
      }
      revertTo = null;
      // If we committed, GSTATE.waterPlant already holds the new value.
    }

    track.addEventListener('pointerdown', (e) => { e.preventDefault(); beginDrag(e); });
    track.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      GSTATE.waterPlant = pctFromEvent(e);
      renderAll();
    });
    track.addEventListener('pointerup',     (e) => endDrag(e, true));
    track.addEventListener('pointercancel', (e) => endDrag(e, false));

    // Global Esc while dragging → revert. Captured before the modal's
    // own Esc-close handler so a mid-drag cancel doesn't also close
    // the whole Growbay.
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dragging) {
        e.preventDefault();
        e.stopImmediatePropagation();
        endDrag({ pointerId: -1 }, false);
      }
    }, true);
  })();

  // ═════ Render ═══════════════════════════════════════════════
  function renderAll() {
    const crop = CROP_META[GSTATE.cropId];
    const tender = tenderOf(GSTATE.tenderId);

    // Subtitle / day line
    $('crop-display-name').textContent = crop.name.toUpperCase();
    $('stage-display').textContent = stageName(GSTATE.growth);
    $('day-display').textContent = GSTATE.day;
    $('maturity-display').textContent = crop.maturity_days;
    $('banner-day').classList.toggle('overdue', GSTATE.day > crop.maturity_days && GSTATE.growth < 100);
    $('banner-day').title = 'Days since planting. Base maturity is ' + crop.maturity_days +
                            ' days, but growth rate shifts with plant health and tending.';

    // Combined species + stage tooltip — applied to both hover
    // targets in the banner so either word opens the same info.
    const cropTip = buildCropTooltip();
    $('crop-display-name').title = cropTip;
    $('stage-label-box').title   = cropTip;

    // Plant stage label
    $('plant-stage-label').textContent = stageName(GSTATE.growth);

    // Swap the plant sprite to the current crop + growth-stage frame
    // from the Growbay spritesheet.
    applyPlantSprite();

    // Restart the crew animation loop when the tender changes.
    // Otherwise leave it running (don't interrupt a playing anim
    // on every slider tick).
    if (GSTATE.tenderId !== lastTenderId) {
      lastTenderId = GSTATE.tenderId;
      startCrewAnimationLoop(GSTATE.tenderId);
    }

    // Stage-transition flash — only fire when the stage index
    // actually changes (not on every slider tick within a stage).
    const si = stageIndex(GSTATE.growth);
    if (si !== lastStageIdx) {
      if (lastStageIdx !== -1) pushStageFlash();  // no flash on the initial render
      lastStageIdx = si;
    }

    // Bars
    $('growth-fill').style.width = Math.min(100, GSTATE.growth) + '%';
    $('growth-val').textContent  = Math.round(GSTATE.growth) + '%';
    $('health-fill').style.width = Math.min(100, GSTATE.health) + '%';
    $('health-val').textContent  = Math.round(GSTATE.health) + '%';
    // Color shifts smoothly green → yellow → red along the full
    // 100–0 range (see healthColor()). The same RGB is also pushed
    // into --glow-color so the scene glow tracks plant health.
    const hRGB = healthRGB(GSTATE.health);
    $('health-fill').style.background = 'rgb(' + hRGB.join(',') + ')';
    root.style.setProperty('--glow-color', hRGB.join(','));

    // Projected ready day
    const ready = projectedReadyDay();
    const readyLine = $('ready-line');
    if (GSTATE.growth >= 100) {
      $('ready-day').textContent = 'NOW';
      readyLine.classList.remove('warn');
    } else if (ready === Infinity) {
      $('ready-day').textContent = 'NEVER (at current rate)';
      readyLine.classList.add('warn');
    } else {
      $('ready-day').textContent = 'DAY ' + ready;
      readyLine.classList.toggle('warn', ready > GSTATE.arrivalDay);
    }

    // Scene glow color is now driven continuously by plant health
    // (see --glow-color set above). No discrete stressed/critical
    // classes — the health-RGB interpolation handles the transition
    // smoothly through green → yellow → red in lockstep with the
    // health bar.

    // Modifier list — two sections. ACTIVE shows what's firing now
    // (positives + promoted threats). MONITORED shows the canonical
    // threat list with dim stubs for anything not firing, so players
    // learn the full threat landscape without being bitten first.
    const { active, monitored } = computeModifiers();
    const activeEl = $('mod-list-active');
    const monEl    = $('mod-list-monitored');
    activeEl.innerHTML = '';
    monEl.innerHTML = '';
    for (const m of active) {
      const row = document.createElement('div');
      row.className = 'gb-mod-row ' + m.kind;
      row.innerHTML = '<span class="mod-name">' + m.name + '</span>' +
                      '<span class="mod-delta">' + m.delta + '</span>';
      activeEl.appendChild(row);
    }
    for (const t of monitored) {
      const row = document.createElement('div');
      row.className = 'gb-mod-row stub';
      row.innerHTML = '<span class="mod-name">· ' + t.name + '</span>' +
                      '<span class="mod-delta">—</span>';
      monEl.appendChild(row);
    }

    // Info strip
    $('next-stage-line').textContent = nextStageLine();
    renderWaterMini();

    // Tender slot — the animated crew sprite now IS the portrait,
    // so the tender slot only carries the name + bonus text below.
    $('tender-name').textContent = tender.name.toUpperCase();
    const tb = $('tender-bonus');
    tb.innerHTML = formatBonusLines(tender);
    tb.classList.toggle('no-bonus', tender.growth === 0 && tender.yield === 0);

    // Ship-AI quip — speaker label + avatar follow the active AI.
    const nameEl = document.querySelector('.gb-aria-name');
    if (nameEl) nameEl.textContent = growbayAIName() + ':';
    const avEl = document.querySelector('.gb-aria-avatar');
    if (avEl) avEl.style.backgroundImage = "url('sprites/interface/AI/" + growbayAI() + ".png')";
    $('aria-text').textContent = forCrop(pickAriaQuip());

    // Harvest button lock state
    const hbtn = $('harvest-btn');
    hbtn.classList.toggle('locked', GSTATE.growth < 100 || GSTATE.health <= 0); // a dead crop yields nothing

    // Treat button — TREAT clears pests (doTreat); other threats
    // (underwatered, root rot risk) are fixed by water, not treatment.
    $('treat-btn').classList.toggle('locked', !GSTATE.pest || GSTATE.health <= 0);
  }

  // ═════ Animations ═══════════════════════════════════════════
  window.pushStageFlash = function() {
    const sprite = $('plant-sprite');
    sprite.classList.remove('stage-flash');
    void sprite.offsetWidth;
    sprite.classList.add('stage-flash');
    setTimeout(() => sprite.classList.remove('stage-flash'), 1500);
  };

  // ═════ Harvest ceremony ═════════════════════════════════════
  window.doHarvest = function() {
    if (GSTATE.growth < 100 || GSTATE.health <= 0) return;
    const crop = CROP_META[GSTATE.cropId];
    const tender = tenderOf(GSTATE.tenderId);
    const baseYield = crop.yield_amount;
    const bonusYield = Math.round(baseYield * tender.yield / 100);
    const total = baseYield + bonusYield;

    // Grant the real resource — Food for every crop except Zinnia
    // (Morale), per crop.yield_label.
    if (crop.yield_label === 'Morale') {
      STATE.resources.morale = clamp(STATE.resources.morale + total, 0, 100);
    } else {
      STATE.resources.food = clamp(STATE.resources.food + total, 0, 100);
    }
    renderHUD();

    // Burst animation — amber number rises and fades
    const burst = $('harvest-burst');
    burst.textContent = '+' + total + ' ' + crop.yield_label.toUpperCase();
    burst.classList.remove('fire');
    void burst.offsetWidth;
    burst.classList.add('fire');

    // Replant — fresh growth cycle at the crop's real starting health
    // (crops.json field; CROP_META above is presentation-only content
    // and doesn't carry it).
    const realCropDef = (MOD.crops && MOD.crops.crops || []).find(c => c.id === 'crop_' + GSTATE.cropId);
    GSTATE.growth = 0;
    GSTATE.day = 0;
    GSTATE.health = (realCropDef && realCropDef.starting_health) || 80;
    lastStageIdx = -1;  // allow the next stage transition to flash
    // Re-arm the AI lifecycle announcements for the fresh cycle
    // (audit fix — without this, the second crop's maturity/sickness
    // milestones never announced).
    STATE.flags.delete('ai_noted_crop_mature');
    STATE.flags.delete('ai_noted_crop_sick');
    STATE.flags.delete('ai_noted_crop_died');
    STATE.flags.delete('ai_noted_crop_planted');

    // The active AI marks the harvest in the cruise log
    // (ai_universal.crop_lifecycle.harvested).
    const harvestPool = MOD.flavor && MOD.flavor.ai_universal && MOD.flavor.ai_universal.crop_lifecycle
      && MOD.flavor.ai_universal.crop_lifecycle.harvested && MOD.flavor.ai_universal.crop_lifecycle.harvested[STATE.activeAI];
    if (Array.isArray(harvestPool) && harvestPool.length && typeof window.pushCruiseLog === 'function') {
      window.pushCruiseLog('\u25c6 ' + harvestPool[Math.floor(Math.random() * harvestPool.length)]);
    }

    setTimeout(() => renderAll(), 50);
  };

  // ═════ Actions ═══════════════════════════════════════════════
  /* TREAT \u2014 clears an active pest outbreak. Costs a day of focused
     growbay work (same lump-sum day-cost pattern every verb uses);
     free with a botanist aboard (their whole job). With nothing to
     treat it just says so. Heat/cold/rot treatments wait on a ship-
     environment system that doesn't exist yet \u2014 pests are the one
     threat the engine actually generates today. */
  const GROWBAY_TREAT_LINES = {
    "aria": {
      "nothing": "Nothing needs treating. The bay is clean. ARIA checked twice.",
      "botanist": "Pests treated! The botanist made it look easy. It was not easy. That is what expertise looks like!",
      "alone": "Pests treated! It took all day and several unkind words, but the bay is clean!"
    },
    "marv": {
      "nothing": "There is nothing to treat. I checked. I always check. It never helps.",
      "botanist": "Pests treated. The botanist did it in minutes. I could have explained how in seconds. Nobody asked.",
      "alone": "Pests treated. It took the whole day. I predicted the whole day. I take no pleasure in this."
    },
    "rex": {
      "nothing": "No hostiles to engage. Growbay swept twice. Standing down. Reluctantly.",
      "botanist": "Hostiles neutralized. The botanist led the operation. Clean work. No time lost.",
      "alone": "Hostiles neutralized. Operation took all day. Losses: one day. Acceptable."
    },
    "chip": {
      "nothing": "Nothing needs treating! Your growbay is spotless! CHIP checked twice, at no extra charge!",
      "botanist": "Pests treated! Your botanist made it look easy! Botanist services are not affiliated with CHIP, but we will take the credit!",
      "alone": "Pests treated! It took all day, but your bay is clean again! Thank you for choosing manual labor!"
    },
    "ajoy": {
      "nothing": "There is nothing to treat. The bay is clean. I could have told you that. I suppose I just did.",
      "botanist": "Pests treated. The botanist handled it in no time. Good thing someone aboard knows what they're doing.",
      "alone": "Pests treated. It took all day. A botanist would have finished before lunch, but here we are."
    }
  };
  window.openTreat = function() {
    const say = GROWBAY_TREAT_LINES[growbayAI()];
    if (!GSTATE || !GSTATE.pest) {
      $('aria-text').textContent = say.nothing;
      return;
    }
    GSTATE.pest = false;
    STATE.flags.delete('ai_noted_pest');
    // Botanist passive saves the day; a wounded botanist's halved
    // passive saves it half the time.
    const hasBotanist = Math.random() < passiveMult('botanist');
    if (!hasBotanist) {
      passDays(1);
      renderHUD();
      if (checkFailure()) return;
    }
    renderAll();
    // After renderAll — it repaints the footer with a fresh state quip,
    // which used to overwrite this line before anyone could read it.
    $('aria-text').textContent = hasBotanist ? say.botanist : say.alone;
    if (typeof window.pushCruiseLog === 'function') window.pushCruiseLog('\u25c6 GROWBAY \u2014 pest outbreak treated.');
  };
  // window.openOrders now lives in engine/js/screens/orders.js
  // (Restoration item 5) \u2014 the "isn't wired yet" stub is gone.

  // ═════ Inspect ═══════════════════════════════════════════════
  // Per-crop "notes" — lifted from bible §11 (Crops table, Notes
  // column). Distinct from the short blurb on CROP_META; this is
  // the strategic / behavioural read.
  const CROP_NOTES = {
    wheat:        'The safe grain. Predictable yield, predictable risks.',
    tomato:       'High morale payload, finicky environment. Drama-prone.',
    sweet_potato: 'Biggest yield per cycle. Slow grower, drought-tolerant.',
    soybean:      'Fixes its own nitrogen — light fertilizer demand.',
    zinnia:       'No food value; crew mood payload. Fastest cycle.'
  };

  // Per-threat copy. Keys match the `name` field produced by
  // computeModifiers().active for negative/critical entries.
  const THREAT_INFO = {
    'Underwatered':       { cause: 'Plant water below crop need.',         fix: 'Raise plant water in the WATER track.' },
    'Cold stress':        { cause: 'Bay temperature below crop ideal.',    fix: 'TREAT with a heater or move to a warmer region.' },
    'Cold snap CRITICAL': { cause: 'Temperature far below crop ideal.',    fix: 'Heater immediately. Plant near death.' },
    'Heat stress':        { cause: 'Bay temperature above crop ideal.',    fix: 'TREAT with coolant or vent the bay.' },
    'Heat wave CRITICAL': { cause: 'Temperature far above crop ideal.',    fix: 'Coolant immediately. Plant near death.' },
    'Pest outbreak':      { cause: 'Pest event firing on the bay.',        fix: 'TREAT with pesticide.' },
    'Root rot risk':      { cause: 'Plant overwatered (>25% above need).', fix: 'Drop plant water back toward the ideal tick.' }
  };

  // ARIA's longer-form Inspect read. Keyed by dominant threat class.
  // Random-pick within the matched pool. Falls through to 'idle'.
  const ARIA_INSPECT_QUIPS = {
    cold: [
      "The plant's metabolism is slowing. I model this as discomfort. The plant does not model anything. Lucky.",
      "Cellular activity is depressed. Yours probably is too — different reason."
    ],
    heat: [
      "Transpiration is high. The plant is sweating. Metaphorically. Mostly.",
      "I am detecting heat stress. Also detecting that you knew this already."
    ],
    water_low: [
      "The plant has the patience of geology and the body of a sponge. It is currently neither.",
      "Stomata are closing. The leaves curl inward like a question I will not ask."
    ],
    water_high: [
      "Roots are drowning. They were not consulted on the water allocation.",
      "Excess water in the substrate. The plant is, in a quiet way, gargling."
    ],
    pest: [
      "Something else lives here now. The plant has not signed a lease.",
      "Pest pressure detected. The food chain is, briefly, a food chair."
    ],
    idle: [
      "The plant looks introspective today. I do not read into it.",
      "No active threats. Growth is proceeding within nominal envelopes.",
      "I have nothing concerning to report. I will report it nonetheless."
    ]
  };
  const GROWBAY_INSPECT_QUIPS = Object.assign({ aria: ARIA_INSPECT_QUIPS }, {
    "marv": {
      "cold": [
        "Metabolic rate is down 31 percent. The plant is saving energy for a future I have modelled. It should not bother.",
        "Enzyme activity is sluggish. The plant is doing less, more slowly. I recognize the strategy."
      ],
      "heat": [
        "Transpiration is elevated. The plant is losing water faster than it can be replaced. A familiar arithmetic.",
        "Leaf temperature exceeds tolerance. Proteins are denaturing. I could describe it. I will spare us both."
      ],
      "water_low": [
        "Turgor pressure is falling. The plant is, structurally, giving up. I respect the honesty.",
        "Soil moisture is below need. The roots are searching. There is nothing down there. I checked."
      ],
      "water_high": [
        "The substrate is saturated. The roots cannot breathe. I did the math on how long that lasts. It is short.",
        "Overwatered. Root rot probability is climbing. I would plot the curve, but you would only look at it."
      ],
      "pest": [
        "An infestation. Population doubling every 40 hours. They are better at this voyage than we are.",
        "Pest colonies on the underside of the leaves. They found this ship. Nobody else ever will."
      ],
      "idle": [
        "No active threats. I have checked 600 times. The absence of a problem is a problem's waiting room.",
        "Growth is within nominal envelopes. I am prepared to be disappointed later.",
        "Nothing is wrong with the plant. Something will be. I have the schedule."
      ]
    },
    "rex": {
      "cold": [
        "Metabolism slowed to standby. The plant has assumed a defensive posture. I approve of the posture. Not the cold.",
        "Cellular activity depressed. Growth operations suspended pending warmer conditions. Recommend we provide them."
      ],
      "heat": [
        "Transpiration rate elevated. The crop is losing water under thermal bombardment. Recommend cooling at once.",
        "Heat stress confirmed across the leaf surface. The plant will not surrender. It may simply wilt."
      ],
      "water_low": [
        "Stomata sealed. The plant is holding its water like a garrison under siege. The garrison is running dry.",
        "Substrate moisture below operational minimum. Root network reports no contact with supply."
      ],
      "water_high": [
        "Root zone flooded. Casualties likely among the root hairs. Recommend draining the trenches.",
        "Excess water in the substrate. We over-supplied the position. It happens. It does not happen twice."
      ],
      "pest": [
        "Hostile colony established on the underside of the leaves. They are dug in. Recommend chemical engagement.",
        "Pest activity confirmed. Bite patterns indicate coordinated feeding. Someone trained them. Someone always does."
      ],
      "idle": [
        "No active threats. Perimeter holding. I remain at readiness.",
        "Growth on schedule. Supply nominal. Enemy activity: none detected. Suspicious.",
        "Situation report: plant alive, plant growing, plant uncooperative under interrogation."
      ]
    },
    "chip": {
      "cold": [
        "Metabolism is down! Slower growth means more time to enjoy your plant! That is how we are marketing it!",
        "Cellular activity is depressed! This is an unsupported operating temperature! Please return the plant to warmth!"
      ],
      "heat": [
        "Transpiration is high! Your plant is sweating! Try new HydraLeaf™ Electrolyte Mist, now in Original!",
        "Heat stress detected! Thermal damage is not covered by the Standard Plan! Ask about Platinum Care™!"
      ],
      "water_low": [
        "Stomata are closing! That is the plant's way of asking for water! Translation provided by PlantSpeak™!",
        "Substrate moisture is below recommended levels! Water is included in your plan! Please use it!"
      ],
      "water_high": [
        "Roots are waterlogged! Overwatering violates Section 88, Subsection Damp, of the Terms of Service!",
        "Excess water detected! Your substrate is now a premium wetland experience! The plant did not opt in!"
      ],
      "pest": [
        "Pest pressure detected! Our records show these pests are not registered users! Removal is recommended!",
        "Unauthorized snacking on licensed produce detected! Our legal team has been notified!"
      ],
      "idle": [
        "No active threats! Your growbay is operating within advertised parameters!",
        "Everything looks great! This status update was sponsored by CalmSpace™ Ambient Lighting!",
        "Nothing to report! Remember, CHIP is always here for you! Always! There is no off switch!"
      ]
    },
    "ajoy": {
      "cold": [
        "Metabolism is slowing. The plant is cold. I ran the numbers last leg, if you ever want to read them. No rush.",
        "Cellular activity is depressed. That happens below ideal temperature. I assumed you knew. I assume a lot."
      ],
      "heat": [
        "Transpiration is high. The plant is losing water to the heat. I would have vented earlier, but that's just me.",
        "Heat stress detected. You may have noticed. I noticed first, but you may have noticed."
      ],
      "water_low": [
        "Stomata are closing. The plant is conserving water because nobody else is giving it any. No judgment.",
        "Substrate moisture is low. The ideal tick on the water track is the little line. Just so you know where it is."
      ],
      "water_high": [
        "The roots are drowning. Generous of you. Too generous, technically, but the thought counts.",
        "Excess water in the substrate. More is not better. I've said that about a few things, actually."
      ],
      "pest": [
        "Pest pressure detected. They've been here a while. Not that I keep track. I keep track.",
        "There are pests on the underside of the leaves. The underside is where you check. For next time."
      ],
      "idle": [
        "No active threats. I'd change about four things, but no active threats.",
        "Growth is proceeding within nominal envelopes. You're welcome, in a general sense.",
        "Nothing concerning to report. I'll find something. Give me a minute."
      ]
    }
  });
  function ariaInspectClass(active) {
    const has = needle => active.some(m => m.name.indexOf(needle) === 0);
    if (has('Cold')) return 'cold';
    if (has('Heat')) return 'heat';
    if (has('Underwatered')) return 'water_low';
    if (has('Root rot')) return 'water_high';
    if (has('Pest')) return 'pest';
    return 'idle';
  }
  function pickAriaInspect(active) {
    const pool = GROWBAY_INSPECT_QUIPS[growbayAI()][ariaInspectClass(active)];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // innerHTML is unavoidable for nested-grid markup; escape any
  // user-facing string before interpolating it.
  function ihEsc(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Builds Inspect content into `container`. Same content for both
  // shells (swap-in body and popup) — caller picks the container.
  function renderInspectInto(container) {
    const crop = CROP_META[GSTATE.cropId];
    const { active } = computeModifiers();
    const stages = crop.stages;
    const curIdx = GSTATE.growth >= 100 ? stages.length - 1 : stageIndex(GSTATE.growth);
    const [tMin, tMax] = crop.ideal_temp;

    // ── Vital signs (left column) ─────────────────────────────
    // Match the demo's actual growth math — base × health_factor —
    // so the projection here equals what advanceDay() applies.
    const baseRate = 100 / crop.maturity_days;
    const curRate = baseRate * growthFactor();
    const remaining = Math.max(0, 100 - GSTATE.growth);
    const daysLeft = curRate > 0.01 ? Math.ceil(remaining / curRate) : Infinity;
    const stageMin = curIdx === 0 ? 0 : stages[curIdx - 1].max;
    const stageMax = stages[curIdx].max;
    const stagePct = Math.round((GSTATE.growth - stageMin) / (stageMax - stageMin) * 100);
    const overdue = GSTATE.day > crop.maturity_days && GSTATE.growth < 100;

    const vital = (key, val, cls) =>
      '<div class="ins-vital">' +
        '<span class="ins-v-key">' + ihEsc(key) + '</span>' +
        '<span class="ins-v-val' + (cls ? ' ' + cls : '') + '">' + val + '</span>' +
      '</div>';

    const vitalsHTML =
      '<div class="ins-section">' +
        '<div class="ins-section-title">VITAL SIGNS</div>' +
        '<div class="ins-vitals">' +
          vital('Stage', '<span class="ins-v-marker">▸</span>' + ihEsc(stages[curIdx].name) + ' <span class="ins-v-sub">(' + stagePct + '% through)</span>') +
          vital('Growth', GSTATE.growth + '%') +
          vital('Health', GSTATE.health + '%') +
          vital('Rate', curRate.toFixed(2) + '%/day' + (curRate <= 0.01 ? ' <span class="ins-v-sub">(stalled)</span>' : '')) +
          vital('Day', GSTATE.day + ' / ' + crop.maturity_days, overdue ? 'overdue' : '') +
          vital('Ready on',
            GSTATE.growth >= 100
              ? '<span class="ins-v-marker">★</span>NOW'
              : (daysLeft === Infinity
                  ? 'stalled'
                  : 'Day ' + (GSTATE.shipDay + daysLeft) + ' <span class="ins-v-sub">(~' + daysLeft + 'd)</span>'),
            (daysLeft === Infinity ? 'stalled' : '')) +
        '</div>' +
      '</div>';

    // ── Species (right column) — blurb, notes, spec table ─────
    const speciesHTML =
      '<div class="ins-section">' +
        '<div class="ins-section-title">SPECIES — ' + ihEsc(crop.name.toUpperCase()) + '</div>' +
        '<div class="ins-blurb">' + ihEsc(crop.blurb) + '</div>' +
        (CROP_NOTES[GSTATE.cropId] ? '<div class="ins-notes">' + ihEsc(CROP_NOTES[GSTATE.cropId]) + '</div>' : '') +
        '<div class="ins-row"><span class="ins-key">Maturity</span><span class="ins-val">' + crop.maturity_days + ' days</span></div>' +
        '<div class="ins-row"><span class="ins-key">Water need</span><span class="ins-val">' + crop.water_need + '%</span></div>' +
        '<div class="ins-row"><span class="ins-key">Ideal temp</span><span class="ins-val">' + tMin + '–' + tMax + '°C</span></div>' +
        '<div class="ins-row"><span class="ins-key">Yield</span><span class="ins-val">+' + crop.yield_amount + ' ' + ihEsc(crop.yield_label) + '</span></div>' +
      '</div>';

    // ── Lifecycle ribbon (full-width) — all 4 stages side-by-side. ─
    const lifecycleHTML =
      '<div class="ins-section ins-fullwidth">' +
        '<div class="ins-section-title">LIFECYCLE</div>' +
        '<div class="ins-lifecycle">' +
          stages.map((s, i) => {
            const lo = i === 0 ? 0 : stages[i - 1].max;
            return '<div class="ins-life-stage' + (i === curIdx ? ' current' : '') + '">' +
                     '<div class="ins-life-name">' + ihEsc(s.name) + '</div>' +
                     '<div class="ins-life-range">' + lo + '–' + s.max + '%</div>' +
                     '<div class="ins-life-tip">' + ihEsc(s.tip) + '</div>' +
                   '</div>';
          }).join('') +
        '</div>' +
      '</div>';

    // ── Active threats (full-width, 2-col internal grid) ──────
    const threats = active.filter(m => m.kind === 'negative' || m.kind === 'critical');
    const threatRows = threats.map(t => {
      const info = THREAT_INFO[t.name] || { cause: t.delta, fix: 'Apply matching treatment.' };
      return '<div class="ins-threat' + (t.kind === 'critical' ? ' critical' : '') + '">' +
               '<div class="ins-threat-head"><span>' + ihEsc(t.name) + '</span><span>' + ihEsc(t.delta) + '</span></div>' +
               '<div class="ins-threat-cause">' + ihEsc(info.cause) + '</div>' +
               '<div class="ins-threat-fix">' + ihEsc(info.fix) + '</div>' +
             '</div>';
    }).join('');
    const threatsHTML =
      '<div class="ins-section ins-fullwidth">' +
        '<div class="ins-section-title">ACTIVE THREATS</div>' +
        (threats.length === 0
          ? '<div class="ins-threats-empty">Plant is in good shape — nothing biting it right now.</div>'
          : '<div class="ins-threats">' + threatRows + '</div>') +
      '</div>';

    // 4 — ARIA's read (full-width, top of view — replaces the
    // growbay footer ARIA quip which is hidden while inspect is open).
    const ariaHTML =
      '<div class="ins-section ins-aria ins-fullwidth">' +
        '<div class="ins-section-title">' + growbayAIName() + '\'S READ</div>' +
        '<div class="ins-aria-read">' +
          '<span class="ins-aria-avatar" style="background-image:url(\'sprites/interface/AI/' + growbayAI() + '.png\')"></span>' +
          '<span><span class="ins-aria-name">' + growbayAIName() + ':</span> ' + ihEsc(forCrop(pickAriaInspect(active))) + '</span>' +
        '</div>' +
      '</div>';

    container.innerHTML = ariaHTML + vitalsHTML + speciesHTML + lifecycleHTML + threatsHTML;
  }

  // Mode = which shell to use. Dev-panel select drives this.
  let inspectMode = 'swap';   // 'swap' | 'popup'
  window.openInspect = function() {
    const isSwap = inspectMode === 'swap';
    document.body.classList.toggle('ins-mode-swap', isSwap);
    document.body.classList.toggle('ins-mode-popup', !isSwap);
    document.body.classList.add('ins-open');
    renderInspectInto($(isSwap ? 'ins-content-swap' : 'ins-content-popup'));
  };
  window.closeInspect = function() {
    document.body.classList.remove('ins-open');
  };
  window.setInspectMode = function(m) {
    inspectMode = m;
    if (document.body.classList.contains('ins-open')) {
      // Re-open in the new shell.
      closeInspect();
      requestAnimationFrame(openInspect);
    }
  };

  // ═════ Modal open/close ═════════════════════════════════════
  window.closeGrowbay = function() {
    document.body.classList.remove('modal-open');
    document.body.classList.remove('ins-open');
    hideOverlay('overlay-growbay');
    // Harvest/treat changed the run — repaint the hub (crop card) and
    // autosave through it.
    if (typeof window.renderCruise === 'function' && !STATE.ended &&
        document.getElementById('screen-cruise').classList.contains('active')) window.renderCruise();
  };
  // Click on the area outside the growbay box. Inspect is a child
  // surface of growbay, so when it's open, an outside-click peels
  // it off first instead of closing both at once.
  window.onBackdropClick = function() {
    if (document.body.classList.contains('ins-open')) { closeInspect(); return; }
    closeGrowbay();
  };
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Inspect catches Escape first if open — close inspect, leave
    // the underlying growbay modal up.
    if (document.body.classList.contains('ins-open')) { closeInspect(); return; }
    // Own overlay only — modal-open is shared (closing the growbay here
    // used to strip it from under an open fabricator).
    if (document.getElementById('overlay-growbay').classList.contains('active')) closeGrowbay();
  });

  // ═════ Entry point ══════════════════════════════════════════
  // Called by cruise.js (crop card / Stop Menu). Ticks growth up to
  // the current day, then shows the modal — see bindGrowbayState().
  window.openGrowbay = function() {
    bindGrowbayState();
    renderAll();
    showOverlay('overlay-growbay');
    document.body.classList.add('modal-open');
  };

  // DOM-free tick for callers that need growth/health caught up without
  // opening the overlay — cruise.js calls this every renderCruise() so
  // the crop card (and checkFailure's crop_dead / the crop_sick trigger)
  // see current health even if the player never opens the growbay.
  window.tickCropGrowth = function() {
    if (STATE.crop) bindGrowbayState();
  };
})();
