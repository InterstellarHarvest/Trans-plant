'use strict';
/* ────────────────────────────────────────────────────────────────
   MINING MINIGAME — lifted from resources/demo-mining.html (Phase 4).
   The demo's own state object is MSTATE here, so the bare identifier
   STATE resolves to the engine's global game state. The voyage's mining
   record persists on STATE.miningLifetime (saved); each visit's result
   reaches the cruise log and the Ship's Log through the haul's summary.
   Entry point: window.openMining(onDone). onDone(haul) fires on RETURN
   TO SHIP or LEAVE, with haul = { inventory, hollowsHit, sector,
   crewAssist, stats } accumulated across any MINE AGAIN loops made in
   that visit (empty inventory on LEAVE before any run completes) — see
   cruise.js's MINE verb handler for how the haul applies to STATE.materials.
   ──────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  // ── Backdrop resolver (minimal) ─────────────────────────────────
  // Mining-mode frame is composed like combat:
  //   z=0: space/deep (full-bleed deep-space, behind bridge cutout)
  //   z=2: our_ship/bridge (full-bleed PNG with transparent viewport)
  //   z=11: .mining-stage paints minigames/mining/bg.jpg in the cutout
  const BG_ROOT = 'sprites/backgrounds/';
  function probeFolder(folder, exts, n) {
    const tries = [];
    for (let i = 1; i <= n; i++) {
      for (const ext of exts) tries.push(probeImage(BG_ROOT + folder + '/' + i + '.' + ext));
    }
    return Promise.all(tries).then(found => found.filter(Boolean));
  }
  // Bridge — tries flat .png, then .jpg.
  function loadBridge() {
    probeImage(BG_ROOT + 'our_ship/bridge.png')
      .then(p => p || probeImage(BG_ROOT + 'our_ship/bridge.jpg'))
      .then(p => { if (p) $('mining-backdrop').style.backgroundImage = "url('" + p + "')"; });
  }
  // Deep space base — folder of numbered jpgs.
  function loadDeepSpace() {
    probeFolder('space/deep', ['jpg','png'], 6).then(found => {
      if (!found.length) return;
      const pick = found[Math.floor(Math.random() * found.length)];
      $('mining-backdrop-base').style.backgroundImage = "url('" + pick + "')";
    });
  }
  loadBridge();
  loadDeepSpace();

  // Mining-stage backgrounds — probed once at boot, picked fresh per
  // mining session at startMining(). File naming: bg.jpg, bg2.jpg,
  // bg3.jpg, … (probes up to bg6.jpg).
  const MINING_BG_ROOT = 'sprites/minigames/mining/';
  const _miningBgs = [];
  const _miningBgReady = [];   // deferred callbacks fired once probing finishes
  let _miningBgsResolved = false;
  function probeMiningBgs() {
    const tries = ['bg.jpg', 'bg2.jpg', 'bg3.jpg', 'bg4.jpg', 'bg5.jpg', 'bg6.jpg'];
    let pending = tries.length;
    tries.forEach(name => {
      const img = new Image();
      const done = () => { if (--pending === 0) {
        _miningBgsResolved = true;
        while (_miningBgReady.length) _miningBgReady.shift()();
      } };
      img.onload  = () => { _miningBgs.push(MINING_BG_ROOT + name); done(); };
      img.onerror = done;
      img.src = MINING_BG_ROOT + name;
    });
  }
  probeMiningBgs();
  function pickMiningBg() {
    if (!_miningBgs.length) return null;
    return _miningBgs[Math.floor(Math.random() * _miningBgs.length)];
  }
  // Apply a fresh-rolled mining bg now if the probes have resolved,
  // otherwise queue and apply as soon as they do. Safe to call from
  // boot or from CONTINUE — guarantees the stage has a bg as soon as
  // one is available.
  function applyMiningBgToStage() {
    const apply = () => {
      const bg = pickMiningBg();
      stage.style.backgroundImage = bg ? "url('" + bg + "')" : '';
    };
    if (_miningBgsResolved) apply();
    else _miningBgReady.push(apply);
  }

  // ─────────────────────────────────────────────────────────────
  // AI quips — skeleton: one line per AI per trigger.
  // Pool-of-many per trigger comes in a later phase (per the
  // engine-side quip system); v1 ships with single-line skeletons
  // so the structure is in place and lines can be expanded without
  // changing call sites.
  // ─────────────────────────────────────────────────────────────
  const MINING_QUIPS = {
    // In-action triggers — fire while the minigame is running.
    idle: {
      aria: "Why aren't we mining? We could be mining!",
      marv: "The rocks are not going to mine themselves. I have run that simulation.",
      rex:  "Field's not getting smaller on its own. Pick a target.",
      chip: "Inactive tractor beam cycles still bill at 60% standby rate.",
      ajoy: "We could be mining. Just a thought."
    },
    hollow_hit: {
      aria: "An empty one! Don't worry, lots of these have STUFF in them. Probably.",
      marv: "You struck a hollow rock. I had not considered this outcome. I have now.",
      rex:  "Dead rock. Move on.",
      chip: "Hollow strike registered. ScrapRight™ does not refund energy spent on empty mass.",
      ajoy: "Hollow. I'd have picked the other one. But sure."
    },
    large_split: {
      aria: "It broke into PIECES! More pieces means more loot! Probably!",
      marv: "Structural integrity gave way. We anticipated this. We did not anticipate enjoying it.",
      rex:  "Good shot. Clean up the fragments before they drift.",
      chip: "Fragmentation event logged. Cleanup yields billed at fragment-rate.",
      ajoy: "It split. Fragments drift, so maybe chase them. Just noting."
    },
    rich_crack: {
      aria: "SPARKLES! Those are the GOOD ones! We're rich! Sort of!",
      marv: "Exotic matter detected. Begin the paperwork. Or do not. I am not a notary.",
      rex:  "High-value target down. Don't lose the fragments.",
      chip: "Exotic detection! ScrapRight™ Pro members keep 12% more rare yield. Ask your station rep.",
      ajoy: "A rich one. I'd have shot it first, but fine. Do collect the bits."
    },
    fragment_lost: {
      aria: "It floated away! Hopefully someone else gets it! Friendly reminder, no one else is here!",
      marv: "That one drifted off. The galaxy has it now.",
      rex:  "Lost a fragment. Tighten the firing arc.",
      chip: "Drift-loss event. Recoverable via ScrapRight™ Drift Recovery — sold separately.",
      ajoy: "Lost one. I saw that coming."
    },
    low_energy: {
      aria: "Energy low! But also, we're DOING it! So! Choices!",
      marv: "Tractor beam is at 24%. Below 20% I am required to mention it again.",
      rex:  "Energy low. Make the next shot count.",
      chip: "Low reserves! ScrapRight™ Power Cells available at all major stations.",
      ajoy: "Energy's low. Maybe aim before firing, this time."
    },

    // End-state triggers — pulled by the haul card.
    perfect: {
      aria: "An AMAZING haul! Look at all the rocks we turned into NOT-rocks!",
      marv: "Yield exceeds projection. The asteroid field will recover. Eventually.",
      rex:  "Clean run. Energy spent efficiently. Logged.",
      chip: "Excellent yield! Brought to you by ScrapRight™ — One Person's Trash, Your Cargo Manifest®.",
      ajoy: "Great haul. I'd have taken the same rocks. Mostly."
    },
    adequate: {
      aria: "A pretty good haul! Some rocks survived but you tried so hard!",
      marv: "Adequate yield. Acceptable energy expenditure. Several rocks remain. So do we.",
      rex:  "Solid run. Could have been tighter. Conserve energy on the next pass.",
      chip: "Solid haul! ScrapRight™ Pro users report 28% higher yield per session. Ask about upgrades.",
      ajoy: "Decent. I'd have used less energy. Noted."
    },
    insufficient: {
      aria: "A little haul! But the experience was the real treasure!",
      marv: "Minimal recovery. Energy spent without commensurate return. Suggest revised approach.",
      rex:  "Low yield. The field won this round. Don't make a habit of it.",
      chip: "Low return! ScrapRight™ Targeting Beacons would have helped. Subscription tiers available.",
      ajoy: "Low yield. I had a better approach ready. Nobody asked."
    }
  };

  // Pre-mine crew assist — optional pick in armed state. Selected crew
  // applies a loot bias (pool weight scaling) or yield bonus during the
  // run. Skeleton 4 crew × 1 bias each; engine-side this will expand
  // with crew-specific dialogue + multi-tier bonuses.
  const CREW_ASSIST = {
    kazuki:   { role: 'Engineer',      bias: '+YIELD',   yieldBonus: 1 },
    osei:     { role: 'Botanist',      bias: '+BIOCOMP', poolFactors: { biocomponent: 3 } },
    tanaka:   { role: 'Xenobiologist', bias: '+EXOTIC',  poolFactors: { exotic: 2 } },
    hargrove: { role: 'Diplomat',      bias: '+SCRAP',   poolFactors: { scrap: 2 } },
  };
  // CREW_ORDER used to be hardcoded to the 4 demo crew. Recomputed fresh
  // each time renderArmed() runs from the real engine's live STATE.crew
  // (role strings) — captain excluded (player avatar, not assignable),
  // and only roles CREW_ASSIST actually has a bias for show up as chips.
  // Empty array is valid: the picker is skipped and BEGIN starts enabled.
  // Live crew name (a stowaway who joined in that role keeps their own).
  const assistName = id => crewNameOf(ROLE_OF_CREWID[id]).toUpperCase();
  function computeCrewOrder() {
    return STATE.crew.map(role => CREWID_OF_ROLE[role]).filter(id => CREW_ASSIST[id]);
  }

  // Sector orientation — first line after BEGIN, keyed to the rolled
  // sector × active AI. Pool-style (vs tagged per-sector-node): when
  // engine-side adds typed sector nodes later, those can override or
  // supplement this pool. Skeleton (1 line per AI per sector).
  const SECTOR_ORIENTATION = {
    standard: {
      aria: "Pretty regular field! Lots of rocks. Some of them are LIES. Let's go!",
      marv: "Standard distribution. Most rocks contain material. A few do not.",
      rex:  "Routine field. Maintain target prioritization. Hollow contacts likely.",
      chip: "Standard sector! ScrapRight™ yield projections within nominal range.",
      ajoy: "Standard field. Some are hollow. I'll tell you which, afterward."
    },
    dense: {
      aria: "DENSE field! The rocks are PACKED in here! More for us!",
      marv: "Mineral density elevated. Yield should exceed projection if executed.",
      rex:  "Dense pocket. Don't get tunnel vision — fragments overlap here.",
      chip: "Dense sector premium! Yield uplift averages 18% in this density.",
      ajoy: "Dense field. Fragments overlap. Try to keep up. I will."
    },
    dead_zone: {
      aria: "DEAD zone! That sounds BAD but it just means lots of empty rocks!",
      marv: "Hollow content elevated. Statistically a poor draw. Press on.",
      rex:  "Dead zone. Most contacts are duds. Conserve energy on the obvious.",
      chip: "Dead zone warning! ScrapRight™ does not refund energy on hollow strikes.",
      ajoy: "Dead zone. Mostly hollow. Do save some energy, for once."
    },
    breaking: {
      aria: "BREAKING field! These rocks are READY to crack! Heehee!",
      marv: "Pre-fragmented material. Larger ratios. The field was disturbed.",
      rex:  "Breaking field. Splits favored. Watch the fragment spread.",
      chip: "Pre-cracked yield! BreakRight™ rated optimal for split-loot recovery.",
      ajoy: "Breaking field. Lots of splits. Do pick up the pieces, ideally."
    },
    still: {
      aria: "Everything is so SLOW! Like a peaceful little nap! For ROCKS!",
      marv: "Tumble velocity near zero. The rocks have stopped moving for now.",
      rex:  "Static field. Aim is easier. Use the extra second per shot.",
      chip: "Still sector! ScrapRight™ Premium Aim certification recommended.",
      ajoy: "Still field. Easy aim, so no excuses. I'm just saying."
    },
    rich_seam: {
      aria: "SPARKLY everywhere! It's a RICH SEAM! We are RICH ALREADY!",
      marv: "Exotic readings across the field. The seam is genuine. Take care.",
      rex:  "Rich seam. Prioritize the bright ones. Make every shot count.",
      chip: "RICH SEAM! ScrapRight™ Platinum window — yield modifiers stack.",
      ajoy: "Rich seam. Bright ones first. I shouldn't have to say it, but here we are."
    }
  };

  // First-time material reveal — fires the FIRST time each material
  // drops in a given session. Active AI delivers a brief lore + utility
  // note. Skeleton (one line per AI per material); pool-of-many comes
  // in the next phase. Resets at every renderArmed (per-run scope).
  const FIRST_MATERIAL_REVEAL = {
    minerals: {
      aria: "Minerals! Silicate base — hull patches at the fabricator!",
      marv: "Mineral content nominal. Silicates. The fabricator will know what to do.",
      rex:  "Minerals. Hull-grade. Stockpile them.",
      chip: "Minerals! ScrapRight™ accepts these at most major stations. 0.4 cr per unit.",
      ajoy: "Minerals. Hull material. Given your flying, keep them."
    },
    scrap: {
      aria: "Scrap! Twisted metal, but you can still DO things with it!",
      marv: "Scrap recovered. Suboptimal but not useless. Fabricator-eligible at low yield.",
      rex:  "Scrap. Field-repair material. Save it.",
      chip: "Scrap! ScrapRight™ buys at 0.1 cr per — better than nothing.",
      ajoy: "Scrap. Repair stock. Keep it. You'll break something."
    },
    metal: {
      aria: "METAL! The good stuff! We can build pretty much anything with this!",
      marv: "Metal acquired. High-utility input. Fabricator recipes open up considerably.",
      rex:  "Metal. Real metal. Hold onto it — we'll want it.",
      chip: "Metal! ScrapRight™ Premium tier — 1.2 cr per. Tell a friend.",
      ajoy: "Metal. The fabricator wants it. So do I."
    },
    exotic: {
      aria: "EXOTIC! That's the SPARKLY one! That means we are RICH!",
      marv: "Exotic matter. The rare drops. The recipes that needed this just unlocked.",
      rex:  "Exotic. Don't lose it. Don't trade it cheap.",
      chip: "Exotic! ScrapRight™ Black Tier — 6.0 cr per. Schedule a sit-down with your station rep.",
      ajoy: "Exotic. Rare. Please don't trade it for a sandwich at the next station."
    },
    biocomponent: {
      aria: "BIOCOMPONENT! Wait — that came from a ROCK?! Anyway, the growbay will LOVE it.",
      marv: "Biocomponent in asteroid matter. Statistically improbable. Growbay nutrient feed.",
      rex:  "Biocomp. Don't ask how. Feed the growbay with it.",
      chip: "Biocomponent! ForageRight™ partners pay 2.1 cr — cross-tier credit applies.",
      ajoy: "Biocomp. Growbay feed. I'll remind you again later."
    }
  };

  // Pre-commit ambient line per AI.
  const PRECOMMIT_AI = {
    aria: "Sparkly rocks!",
    marv: "Mineral density is within nominal parameters. A small percentage of these rocks contain nothing. We will find out which.",
    rex:  "No contacts. Noisy field. Stay sharp.",
    chip: "Unlicensed mining in contested belts voids insurance.",
    ajoy: "Some of these are hollow. I'd tell you which, but you prefer to find out yourself."
  };

  // ─────────────────────────────────────────────────────────────
  // CRATE_POOLS defined in shared.js — use CRATE_POOLS.asteroid directly.
  // ─────────────────────────────────────────────────────────────
  const MD = 'sprites/cargo/materials/';
  const MAT_LABELS = { minerals:'Minerals', scrap:'Scrap', metal:'Metal', exotic:'Exotic', biocomponent:'Biocomp' };

  // SMALL: no rare drops — strip exotic + biocomponent.
  const POOL_SMALL = CRATE_POOLS.asteroid.filter(p => p.r !== 'exotic' && p.r !== 'biocomponent');
  // RICH MIDs roll exotic-favored.
  const POOL_RICH  = [
    { r:'exotic', w:3 }, { r:'minerals', w:2 },
    { r:'biocomponent', w:1 }, { r:'metal', w:1 }
  ];

  function rollFromPool(pool) {
    const total = pool.reduce((s,p) => s + p.w, 0);
    let r = Math.random() * total;
    for (const p of pool) { if ((r -= p.w) <= 0) return p.r; }
    return pool[0].r;
  }

  // Crew bias helpers — scale pool weights and add yield bonus per
  // the selected crew assist. Both no-op when no crew is selected.
  function biasedPool(pool) {
    const crewId = MSTATE.crewAssist;
    const crew = crewId && CREW_ASSIST[crewId];
    if (!crew || !crew.poolFactors) return pool;
    return pool.map(p => ({ ...p, w: p.w * (crew.poolFactors[p.r] || 1) }));
  }
  function yieldBonus() {
    const crewId = MSTATE.crewAssist;
    const crew = crewId && CREW_ASSIST[crewId];
    return (crew && crew.yieldBonus) || 0;
  }

  // ─────────────────────────────────────────────────────────────
  // Sector modifiers — one rolled the first time MINE happens at a given
  // map node, then persisted (see rollSector() below). Each modifier
  // overrides tier spawn weights and/or run tunables, and attaches a
  // label chip on the AI bar plus an AI orientation line delivered as
  // the first patter beat after BEGIN. No typed sector nodes exist yet
  // to override/extend this pool (GAME_BIBLE.md §Asteroid Field).
  // ─────────────────────────────────────────────────────────────
  const SECTOR_MODIFIERS = [
    {
      id: 'standard', label: 'STANDARD FIELD', weight: 30, color: '#e8d8a0',
      // No overrides — uses the default TIERS weights and tunables.
    },
    {
      id: 'dense', label: 'DENSE FIELD', weight: 18, color: '#c8a85a',
      tierWeights: { small: 30, standard: 40, large: 18, rich: 7, hollow: 5 },
    },
    {
      id: 'dead_zone', label: 'DEAD ZONE', weight: 15, color: '#8898a8',
      tierWeights: { small: 30, standard: 35, large: 15, rich: 3, hollow: 17 },
    },
    {
      id: 'breaking', label: 'BREAKING FIELD', weight: 15, color: '#e88830',
      tierWeights: { small: 25, standard: 30, large: 28, rich: 8, hollow: 9 },
    },
    {
      id: 'still', label: 'STILL FIELD', weight: 12, color: '#8cc890',
      speedMul: 0.7, timeCapSec: 22,
    },
    {
      id: 'rich_seam', label: 'RICH SEAM', weight: 10, color: '#c8a85a',
      tierWeights: { small: 35, standard: 35, large: 13, rich: 12, hollow: 5 },
    },
  ];
  const SECTOR_TOTAL_W = SECTOR_MODIFIERS.reduce((s, m) => s + m.weight, 0);
  // Sector persists per map node — rolled once the first time MINE is
  // used at that node, reused on every later visit there (see renderArmed()'s
  // STATE.miningSectors lookup) so re-opening the Stop Menu can't be used to
  // reroll for a better sector.
  function rollSector() {
    let r = Math.random() * SECTOR_TOTAL_W;
    for (const m of SECTOR_MODIFIERS) { if ((r -= m.weight) <= 0) return m; }
    return SECTOR_MODIFIERS[0];
  }

  // ─────────────────────────────────────────────────────────────
  // MSTATE
  // ─────────────────────────────────────────────────────────────
  const MSTATE = {
    activeAi: 'marv',
    mining: false,
    energy: 100,
    materials: 0,        // running count of units gathered (no type leak)
    rocks: 0,            // every crack including hollows
    hollowsHit: 0,
    inventory: {},       // material key → count
    timeCapSec: 18,
    asteroids: [],       // {el, fx, fy, vx, vy, rot, vrot, tier, sz, parent}
    particles: [],
    floaters: [],
    rafId: null,
    spawnIv: null,
    patterIv: null,
    timeIv: null,
    haulTo: null,        // the haul card after a natural end's flash
    lastClickAt: 0,
    pendingTrigger: null,   // 'large_split' / 'rich_crack' / 'hollow_hit' / 'fragment_lost' / 'low_energy'
    energyWarned: false,
    sector: null,           // rolled at renderArmed (see SECTOR_MODIFIERS)
    hitPauseUntil: 0,       // tick freezes motion until this timestamp
    seenMaterials: null,    // Set; per-run, first-time reveal tracking
    crewAssist: null,       // selected CREW_ASSIST entry id (or null)
    // Run stats — tracked silently during play, shown only on the haul
    // card so they don't distract during the action. Reset per-run.
    stats: {
      clicks: 0,
      hits: 0,
      currentChain: 0,
      bestChain: 0,
      fragmentsLost: 0,
    },
  };

  // This visit's run history — accumulates across the BEGIN→haul→MINE
  // AGAIN cycles of one openMining() visit, which resets it.
  const SESSION = {
    runs: 0,
    totalCracks: 0,
    totalMaterials: 0,
    totalHollows: 0,
    bestChainEver: 0,
    bestTier: null,  // 'perfect' / 'adequate' / 'insufficient', highest reached
  };
  const TIER_RANK = { insufficient: 0, adequate: 1, perfect: 2 };
  // Lifetime stats: SESSION stays per-visit (its run count prices the days
  // and labels LEAVE); LIFE accumulates every run of the voyage on
  // STATE.miningLifetime, which index.html's SAVED_FIELDS persists. The
  // haul card's SESSION row reads SESSION (demo wording);
  // LIFE closes the cruise log line (miningSummary).
  function lifeStats() {
    if (!STATE.miningLifetime) STATE.miningLifetime = { runs: 0, totalMaterials: 0 };
    return STATE.miningLifetime;
  }
  let sessionInventory = {}; // material -> count, accumulated across MINE AGAIN loops within one openMining() visit

  const stage = $('mining-stage');

  // ─────────────────────────────────────────────────────────────
  // ARMED state — entered from cruise→MINE. Mining mode is loaded
  // (frame, viewport bg, HUD all visible at 100%), spawner not yet
  // running. Player clicks BEGIN to kick off the run.
  // ─────────────────────────────────────────────────────────────
  function renderArmed() {
    MSTATE.mining = false;
    MSTATE.activeAi = STATE.activeAI || 'marv';
    MSTATE.energy = 100;
    MSTATE.materials = 0;
    MSTATE.rocks = 0;
    MSTATE.hollowsHit = 0;
    MSTATE.inventory = {};
    MSTATE.asteroids = [];
    MSTATE.particles = [];
    MSTATE.floaters = [];
    MSTATE.pendingTrigger = null;
    MSTATE.energyWarned = false;
    STATE.miningSectors = STATE.miningSectors || {};
    MSTATE.sector = STATE.miningSectors[STATE.currentId] ||
      (STATE.miningSectors[STATE.currentId] = rollSector());
    MSTATE.seenMaterials = new Set();
    MSTATE.crewAssist = null;
    MSTATE.stats = { clicks: 0, hits: 0, currentChain: 0, bestChain: 0, fragmentsLost: 0 };
    updateEnergyHud();
    updateSectorTag();

    // Armed status in the top AI-bar slot — placeholder until BEGIN. A
    // full hold says so plainly first: everything MINE yields is cargo,
    // so at most the stacks aboard top up, else nothing can be kept (the
    // grant's own rule, minigames.js cargoHoldRoom).
    const hold = window.cargoHoldRoom();
    const roomLeft = hold ? window.cargoRoomText(hold.room) : '';
    $('mining-ai-name').textContent = 'MINING';
    $('mining-ai-text').textContent = !hold ? 'TRACTOR BEAM READY · STANDBY' : roomLeft ? 'CARGO HOLD FULL · ROOM FOR ' + roomLeft.toUpperCase() : 'CARGO HOLD FULL · NOTHING CAN BE KEPT';
    $('mining-ai-text').classList.toggle('hold-full', !!hold);

    // Bottom narrative carries the AI quip (ambient pre-commit line) — or,
    // with the hold full, the plain warning.
    if (hold) setNarrPlain('CARGO HOLD FULL', (roomLeft ? 'Only ' + roomLeft + ' more can be kept (topping up the stacks aboard); nothing else' : 'Nothing you mine can be kept') + ' until cargo space is freed: jettison or sell something from the hold (the crate icon) first. A run still costs its day.');
    else setAiQuip(MSTATE.activeAi, PRECOMMIT_AI[MSTATE.activeAi]);

    // Stage visible (shows bg) even pre-BEGIN. Apply now if probes are
    // resolved, else queue.
    applyMiningBgToStage();
    stage.classList.add('active');

    // Cursor still default-hand on the stage in armed state — only the
    // mining reticle scopes in once BEGIN is pressed.
    stage.style.cursor = '';

    // Choice column = crew picker (required) + BEGIN MINING.
    //
    // Crew is required to start the run. The BEGIN button is disabled
    // until a chip is selected, and re-disables if the player deselects.
    // Engine-side: if the crew list is empty (no crew available — none in
    // setup, or all lost on the journey) the picker is skipped entirely
    // and BEGIN starts enabled. The captain runs solo.
    const choices = $('mining-choices');
    choices.innerHTML = '';

    const beginBtn = document.createElement('button');
    beginBtn.className = 'enc-choice';
    beginBtn.innerHTML = `
      <div class="enc-choice-body">BEGIN MINING</div>
      <div class="enc-choice-sub" id="begin-sub">Click rocks to break them</div>`;
    beginBtn.addEventListener('click', startMining);

    // Helper: swap sub-label between the gate prompt and the actual hint.
    function setBeginSub(text) {
      const sub = beginBtn.querySelector('#begin-sub');
      if (sub) sub.textContent = text;
    }

    const crewOrder = computeCrewOrder();
    const hasCrew = crewOrder.length > 0;
    if (hasCrew) {
      const picker = document.createElement('div');
      picker.className = 'crew-picker';
      picker.innerHTML = '<div class="crew-picker-label">CREW ASSIST</div>';
      crewOrder.forEach(id => {
        const c = CREW_ASSIST[id];
        const chip = document.createElement('button');
        chip.className = 'crew-chip';
        chip.dataset.crew = id;
        const portraitCss = crewIconCss(id, '28px');
        chip.innerHTML = `
          <div class="portrait" style="${portraitCss}"></div>
          <div class="meta">
            <span class="name">${assistName(id)}</span>
            <span class="bias">${c.bias}</span>
          </div>`;
        chip.addEventListener('click', () => {
          // Toggle selection — clicking the active chip clears it.
          if (MSTATE.crewAssist === id) {
            MSTATE.crewAssist = null;
          } else {
            MSTATE.crewAssist = id;
          }
          picker.querySelectorAll('.crew-chip').forEach(el => {
            el.classList.toggle('selected', el.dataset.crew === MSTATE.crewAssist);
          });
          // Enable BEGIN only when a crew is selected; swap sub-label
          // to match the current gate state.
          const armed = !!MSTATE.crewAssist;
          beginBtn.classList.toggle('disabled', !armed);
          setBeginSub(armed ? 'Click rocks to break them' : 'Choose a crew to assist');
        });
        picker.appendChild(chip);
      });
      choices.appendChild(picker);
      // Start disabled — player must pick a crew first. Sub-label
      // tells them so.
      beginBtn.classList.add('disabled');
      setBeginSub('Choose a crew to assist');
    }

    choices.appendChild(beginBtn);

    // Bail out before committing to a run — no haul, nothing to bank.
    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'enc-choice leave';
    leaveBtn.innerHTML = `<div class="enc-choice-body">◀ LEAVE</div><div class="enc-choice-sub">${SESSION.runs > 0 ? 'Back to the ship · haul kept' : 'Back to the ship'}</div>`;
    leaveBtn.addEventListener('click', () => {
      // After MINE AGAIN, earlier finished runs are already this visit's
      // haul — LEAVE banks them like RETURN TO SHIP (only the run not
      // started is skipped).
      if (SESSION.runs > 0) { finishMining(); return; }
      hideOverlay('overlay-mining');
      const cb = onMiningDone;
      onMiningDone = null;
      if (cb) cb({ inventory: {}, hollowsHit: 0, sector: null, crewAssist: null, stats: null });
    });
    choices.appendChild(leaveBtn);
  }

  // AI quip lives in the bottom narrative panel: title slot = AI name,
  // body slot = the line itself (italic). Top AI bar carries the live
  // status counters now, populated separately by updateStatusLine().
  // The narrative panel without an AI voice (a plain warning).
  function setNarrPlain(title, text) {
    $('mining-narr-title').textContent = title;
    $('mining-narr-body').textContent = text;
    $('mining-narr-body').classList.remove('fading');
  }
  function setAiQuip(aiId, line) {
    const titleEl = $('mining-narr-title');
    const bodyEl  = $('mining-narr-body');
    bodyEl.classList.add('fading');
    setTimeout(() => {
      titleEl.textContent = AI_NAMES[aiId];
      bodyEl.textContent = '"' + line + '"';
      bodyEl.classList.remove('fading');
    }, 200);
  }

  // ─────────────────────────────────────────────────────────────
  // ACTIVE MINING — shooter inside the stage rect.
  // ─────────────────────────────────────────────────────────────

  // Tier table. Spawn weights sum to 100.
  const TIERS = {
    small:    { weight: 35, sizeRange: [32,  48],  speedMul: 0.65, briRange: [0.6, 0.8],  pool: POOL_SMALL,    units: 1, layerZ: 1 },
    standard: { weight: 40, sizeRange: [60,  80],  speedMul: 0.85, briRange: [0.8, 0.95], pool: CRATE_POOLS.asteroid, units: 1, layerZ: 2 },
    large:    { weight: 15, sizeRange: [90, 110],  speedMul: 1.05, briRange: [1.0, 1.1],  pool: null,          units: 0, layerZ: 3, splitsTo: 'standard', splitCount: [2,3] },
    rich:     { weight:  5, sizeRange: [90, 110],  speedMul: 1.05, briRange: [1.0, 1.1],  pool: POOL_RICH,     units: 1, layerZ: 3, splitsTo: 'standard', splitCount: [2,2], rich: true },
    hollow:   { weight:  5, sizeRange: [90, 110],  speedMul: 1.05, briRange: [1.0, 1.1],  pool: null,          units: 0, layerZ: 3, hollow: true },
  };
  const TIER_KEYS = Object.keys(TIERS);

  function rollTier() {
    // Sector modifier (if present) overrides the per-tier spawn weights.
    // A portable drill aboard (items.json "unlocks higher asteroid loot
    // tier") doubles the rich-tier weight.
    const w = Object.assign({}, MSTATE.sector && MSTATE.sector.tierWeights
      || Object.fromEntries(TIER_KEYS.map(k => [k, TIERS[k].weight])));
    if (STATE.items.includes('portable_drill')) w.rich = (w.rich || 0) * 2;
    let total = 0;
    for (const k of TIER_KEYS) total += w[k] || 0;
    let r = Math.random() * total;
    for (const k of TIER_KEYS) { if ((r -= (w[k] || 0)) <= 0) return k; }
    return 'standard';
  }

  // Base fresh-spawn speed (fractional/sec). Tuned so a standard rock
  // takes ~6s to traverse the stage at speedMul 1.0.
  const BASE_SPEED = 0.16;

  function startMining() {
    if (MSTATE.mining) return;
    MSTATE.mining = true;
    window.onJobBegun(SESSION.runs + 1); // a reload mid-run costs the runs' days
    MSTATE.lastClickAt = performance.now();

    // Push fresh status into the top AI bar (counters start at 0).
    updateStatusLine();

    // Swap choice column to a single EXIT MINING button.
    const choices = $('mining-choices');
    choices.innerHTML = '';
    const exitBtn = document.createElement('button');
    exitBtn.className = 'enc-choice leave';
    exitBtn.innerHTML = `
      <div class="enc-choice-body">EXIT MINING</div>
      <div class="enc-choice-sub">Lock in current haul</div>`;
    exitBtn.addEventListener('click', () => endRun('exit'));
    choices.appendChild(exitBtn);

    // Reticle cursor only after BEGIN — armed state stays on default hand.
    stage.style.cursor = generateCursor('mining');

    // Stage-level click — drains energy on every click (hit or miss),
    // then dispatches to the asteroid handler if the click landed on one.
    stage.addEventListener('mousedown', onStageMouseDown);

    // Seed the field.
    for (let i = 0; i < 7; i++) spawnAsteroid(true);

    // Spawner — keeps 6–8 onscreen.
    MSTATE.spawnIv = setInterval(() => {
      if (!MSTATE.mining) return;
      const live = MSTATE.asteroids.filter(a => a.alive).length;
      if (live < 7) spawnAsteroid(false);
    }, 700);

    // Patter cycle — every 4–6s, cash in any pending trigger and pick a line.
    schedulePatter();

    // Time cap — sector modifier can override (e.g., STILL FIELD = 22s).
    const cap = (MSTATE.sector && MSTATE.sector.timeCapSec) || MSTATE.timeCapSec;
    // Counted down in tick() on unpaused frames only — a plain setTimeout
    // kept running behind the pause menu and ended the run there.
    MSTATE.timeLeftMs = cap * 1000;
    MSTATE.timerLast = performance.now();

    // Tick loop.
    MSTATE.lastTick = performance.now();
    MSTATE.rafId = requestAnimationFrame(tick);

    // First line after BEGIN — sector orientation. Falls back to idle
    // patter if no orientation is wired for the rolled sector (defensive).
    const sectorId = MSTATE.sector && MSTATE.sector.id;
    const orient = sectorId && SECTOR_ORIENTATION[sectorId] && SECTOR_ORIENTATION[sectorId][MSTATE.activeAi];
    setAiQuip(MSTATE.activeAi, orient || MINING_QUIPS.idle[MSTATE.activeAi]);
  }

  // Status line lives in the top AI bar now (was bottom narrative).
  // Title slot = "MINING" label, text slot = live counters.
  function updateStatusLine() {
    $('mining-ai-name').textContent = 'MINING';
    $('mining-ai-text').textContent =
      MSTATE.rocks + ' ROCKS · ' + MSTATE.materials + ' MATERIALS';
  }

  // Paint the sector chip on the AI bar from MSTATE.sector. Hidden when
  // no sector is rolled (defensive).
  function updateSectorTag() {
    const el = $('sector-tag');
    if (!el) return;
    const s = MSTATE.sector;
    if (!s) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = s.label;
    el.style.color = s.color;
    el.style.borderColor = s.color;
    // Light tint backed off from the color so the chip has subtle fill.
    el.style.background = 'rgba(0,0,0,0.30)';
  }

  // Energy HUD bar (combat-HP-bar style). Color shifts at thresholds.
  function updateEnergyHud() {
    const pct = Math.max(0, Math.round(MSTATE.energy));
    const fill = $('mining-energy-fill');
    const num  = $('mining-energy-num');
    if (!fill || !num) return;
    fill.style.width = pct + '%';
    fill.classList.toggle('warn', pct < 50 && pct >= 25);
    fill.classList.toggle('crit', pct < 25);
    num.textContent = pct + '%';
  }

  function onStageMouseDown(e) {
    if (!MSTATE.mining) return;
    e.preventDefault();
    MSTATE.lastClickAt = performance.now();

    // Energy always drains, hit or miss.
    MSTATE.energy = Math.max(0, MSTATE.energy - 5);

    // Click-feedback ring at the cursor position (every click, hit or
    // miss). Stand-in for cursor recoil — pops + fades inside the stage.
    const rect = stage.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = (e.clientY - rect.top)  / rect.height;
      const ring = document.createElement('div');
      ring.className = 'mine-click-ring';
      ring.style.left = (fx * 100) + '%';
      ring.style.top  = (fy * 100) + '%';
      stage.appendChild(ring);
      setTimeout(() => ring.remove(), 320);
    }

    // Stats: every click counts. Hit/streak resolved by tier below.
    MSTATE.stats.clicks++;
    let landedTier = null;

    const asteroidEl = e.target.closest('.mine-asteroid');
    if (asteroidEl) {
      const a = MSTATE.asteroids.find(x => x.el === asteroidEl && x.alive);
      if (a) {
        landedTier = a.tier;
        crackAsteroid(a);
      }
    }

    // Streak rules: non-hollow hit extends the chain; hollow OR miss
    // resets it. bestChain is the high-water mark for the haul card.
    if (landedTier && landedTier !== 'hollow') {
      MSTATE.stats.hits++;
      MSTATE.stats.currentChain++;
      if (MSTATE.stats.currentChain > MSTATE.stats.bestChain) {
        MSTATE.stats.bestChain = MSTATE.stats.currentChain;
      }
    } else {
      MSTATE.stats.currentChain = 0;
    }

    // Low-energy patter trigger (one-shot).
    if (!MSTATE.energyWarned && MSTATE.energy < 25 && MSTATE.energy > 0) {
      MSTATE.energyWarned = true;
      MSTATE.pendingTrigger = 'low_energy';
    }

    updateStatusLine();
    updateEnergyHud();
    if (MSTATE.energy <= 0) endRun('depleted');
  }

  function spawnAsteroid(initial, opts) {
    opts = opts || {};
    const tier = opts.tier || rollTier();
    const cfg = TIERS[tier];
    const sz = cfg.sizeRange[0] + Math.random() * (cfg.sizeRange[1] - cfg.sizeRange[0]);
    const bri = cfg.briRange[0] + Math.random() * (cfg.briRange[1] - cfg.briRange[0]);

    let fx, fy, vx, vy;
    if (opts.fx != null) {
      // Fragment from a parent crack.
      fx = opts.fx; fy = opts.fy;
      vx = opts.vx; vy = opts.vy;
    } else if (initial) {
      // Sprinkle across the stage at start.
      fx = 0.05 + Math.random() * 0.9;
      fy = 0.05 + Math.random() * 0.85;
      // Drift in any direction at base speed × tier multiplier × sector multiplier.
      const sectorMul = (MSTATE.sector && MSTATE.sector.speedMul) || 1;
      const ang = Math.random() * Math.PI * 2;
      const sp = BASE_SPEED * cfg.speedMul * sectorMul * (0.6 + Math.random() * 0.4);
      vx = Math.cos(ang) * sp;
      vy = Math.sin(ang) * sp;
    } else {
      // Spawn from a random edge, drift inward.
      const sectorMul = (MSTATE.sector && MSTATE.sector.speedMul) || 1;
      const edge = Math.floor(Math.random() * 4);
      const sp = BASE_SPEED * cfg.speedMul * sectorMul * (0.7 + Math.random() * 0.5);
      if (edge === 0)      { fx = -0.06; fy = 0.1 + Math.random()*0.8; vx =  sp; vy = (Math.random()-0.5)*sp*0.4; }
      else if (edge === 1) { fx = 1.06;  fy = 0.1 + Math.random()*0.8; vx = -sp; vy = (Math.random()-0.5)*sp*0.4; }
      else if (edge === 2) { fx = 0.1 + Math.random()*0.8; fy = -0.06; vy =  sp; vx = (Math.random()-0.5)*sp*0.4; }
      else                 { fx = 0.1 + Math.random()*0.8; fy = 1.06;  vy = -sp; vx = (Math.random()-0.5)*sp*0.4; }
    }

    const src = pickRandom(ASTEROID_FILES);

    const el = document.createElement('img');
    el.className = 'mine-asteroid';
    if (cfg.rich) el.classList.add('rich');
    el.src = src;
    el.style.width = sz + 'px';
    el.style.height = sz + 'px';
    el.style.left = (fx * 100) + '%';
    el.style.top  = (fy * 100) + '%';
    el.style.zIndex = cfg.layerZ;
    el.style.setProperty('--scl', 1);
    el.style.setProperty('--rot', '0deg');
    el.style.setProperty('--bri', bri);
    stage.appendChild(el);

    const rot = (Math.random() - 0.5) * 360;
    const vrot = (Math.random() - 0.5) * 30;  // deg/sec — slow tumble

    // Decay timer — each rock has a finite lifetime. The last 30% fades
    // its opacity visually; at 0 it vanishes with a small dust puff
    // (rock disintegrated, lost forever). Tuned shorter than typical
    // drift-off times so most rocks reach the fade window before they
    // leave the screen, making the urgency mechanic visible. RICH/LARGE
    // get a small extension since they're high-stakes targets.
    const lifeRanges = {
      small:    [4, 6],   // drift-off ~10s → fade nearly always
      standard: [5, 7],   // drift-off ~8s  → fade usually
      large:    [6, 8],   // drift-off ~6.7s → fade ~half the time
      rich:     [7, 9],   // drift-off ~6.7s → mixed; rich rewards skill
      hollow:   [6, 8],   // matches LARGE visually
    };
    const [lifeMin, lifeMax] = lifeRanges[tier] || [9, 11];
    const maxLife = lifeMin + Math.random() * (lifeMax - lifeMin);

    const a = {
      el, fx, fy, vx, vy, rot, vrot, tier, sz, bri,
      alive: true, parentTier: opts.parentTier || null,
      life: maxLife, maxLife,
    };
    MSTATE.asteroids.push(a);
  }

  // Stage shake — applied to .mining-stage only. Tier-scaled.
  // The remove + reflow + re-add trick lets the animation fire even
  // when the class was just on the element (otherwise repeated cracks
  // wouldn't re-trigger the keyframes).
  let _shakeTimer = null;
  function triggerShake(intensity) {
    const cls = 'shake-' + intensity;
    stage.classList.remove('shake-small', 'shake-medium', 'shake-big');
    void stage.offsetWidth;
    stage.classList.add(cls);
    clearTimeout(_shakeTimer);
    _shakeTimer = setTimeout(() => stage.classList.remove(cls), 500);
  }

  // Hit pause — the tick loop checks MSTATE.hitPauseUntil and freezes
  // motion (positions, particle ages, drift) until that timestamp.
  // Render continues so the frozen frame is still visible.
  function triggerHitPause(ms) {
    MSTATE.hitPauseUntil = performance.now() + ms;
  }

  function crackAsteroid(a) {
    if (!a.alive) return;
    a.alive = false;
    MSTATE.rocks++;
    const cfg = TIERS[a.tier];

    if (cfg.hollow) {
      // Hollow: dust puff, no loot, no floater, NO shake. The empty
      // hollow has no weight to it — that's the whole joke.
      MSTATE.hollowsHit++;
      spawnHollowPuff(a.fx, a.fy);
      a.el.classList.add('cracking');
      setTimeout(() => a.el.remove(), 200);
      MSTATE.pendingTrigger = 'hollow_hit';
      return;
    }

    if (cfg.splitsTo) {
      // LARGE/RICH: wind-up first (120ms shudder), THEN fragments fly
      // with shake + hit-pause. The wind-up telegraphs the imminent
      // fragmentation so the explosion reads as "earned," not abrupt.
      const isRich = !!cfg.rich;
      const fragPool = isRich ? POOL_RICH : null;
      a.el.classList.add('winding');

      setTimeout(() => {
        const [minN, maxN] = cfg.splitCount;
        const n = minN + Math.floor(Math.random() * (maxN - minN + 1));
        const parentMag = Math.hypot(a.vx, a.vy);
        const fragMag = Math.max(BASE_SPEED * 0.5, parentMag * 0.6);
        const baseAng = Math.random() * Math.PI * 2;
        for (let i = 0; i < n; i++) {
          const ang = baseAng + (i * (Math.PI * 2 / n)) + (Math.random() - 0.5) * 0.5;
          const vx = Math.cos(ang) * fragMag;
          const vy = Math.sin(ang) * fragMag;
          spawnAsteroid(false, {
            tier: cfg.splitsTo, fx: a.fx, fy: a.fy, vx, vy,
            parentTier: a.tier, overridePool: fragPool
          });
          const last = MSTATE.asteroids[MSTATE.asteroids.length - 1];
          if (last && fragPool) last.overridePool = fragPool;
        }

        spawnLootPuff(a.fx, a.fy, /*small*/ true);
        triggerShake(isRich ? 'big' : 'medium');
        triggerHitPause(isRich ? 110 : 80);
        a.el.classList.add('cracking');
        setTimeout(() => a.el.remove(), 200);
      }, 120);

      MSTATE.pendingTrigger = isRich ? 'rich_crack' : 'large_split';
      return;
    }

    // Standard / Small / Mid-fragment: drop loot, particle puff, +N
    // floater, light shake. No wind-up, no hit-pause — these are the
    // bread-and-butter cracks and need to feel snappy.
    const pool = biasedPool(a.overridePool || cfg.pool);
    const units = cfg.units + yieldBonus();
    let dropped = 0;
    let firstReveal = null;   // First newly-seen material this crack
    function pushMaterial(mat) {
      MSTATE.inventory[mat] = (MSTATE.inventory[mat] || 0) + 1;
      if (MSTATE.seenMaterials && !MSTATE.seenMaterials.has(mat)) {
        MSTATE.seenMaterials.add(mat);
        if (!firstReveal) firstReveal = mat;
      }
    }
    for (let i = 0; i < units; i++) {
      pushMaterial(rollFromPool(pool));
      dropped++;
    }
    // MID fragments roll standard loot 1–2 units (per spec §6).
    if (a.parentTier === 'large' || a.parentTier === 'rich') {
      const extraN = 1 + Math.floor(Math.random() * 2);  // 1 or 2 total
      for (let i = 1; i < extraN; i++) {
        pushMaterial(rollFromPool(pool));
        dropped++;
      }
    }
    MSTATE.materials += dropped;

    // First-time material reveal — fires immediately (interrupts
    // patter cycle) and resets the cycle so the next regular quip
    // is a full ~4–6s away. Higher-priority than queued patter
    // triggers because the reveal is a one-shot moment.
    if (firstReveal && FIRST_MATERIAL_REVEAL[firstReveal]) {
      const line = FIRST_MATERIAL_REVEAL[firstReveal][MSTATE.activeAi];
      if (line) {
        setAiQuip(MSTATE.activeAi, line);
        clearTimeout(MSTATE.patterIv);
        schedulePatter();
      }
    }

    spawnLootPuff(a.fx, a.fy, /*small*/ false);
    spawnFloater(a.fx, a.fy, '+' + dropped);
    triggerShake('small');
    a.el.classList.add('cracking');
    setTimeout(() => a.el.remove(), 200);
  }

  // ── Particles + floater + flash ring ─────────────────────────
  function spawnFlashRing(fx, fy) {
    const el = document.createElement('div');
    el.className = 'mine-flash-ring';
    el.style.left = (fx * 100) + '%';
    el.style.top  = (fy * 100) + '%';
    stage.appendChild(el);
    setTimeout(() => el.remove(), 520);
  }
  function spawnLootPuff(fx, fy, small) {
    // Flash ring at the source — reads as a shockwave.
    if (!small) spawnFlashRing(fx, fy);

    // Big chunky particles (slow-ish, glowy).
    const nMain = small ? 10 : 22;
    for (let i = 0; i < nMain; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = (small ? 0.32 : 0.58) + Math.random() * 0.30;
      const el = document.createElement('div');
      el.className = 'mine-particle loot';
      el.style.left = (fx * 100) + '%';
      el.style.top  = (fy * 100) + '%';
      stage.appendChild(el);
      MSTATE.particles.push({
        el, fx, fy, vx: Math.cos(ang)*sp, vy: Math.sin(ang)*sp,
        life: 1.0 + Math.random() * 0.4, age: 0, drag: 1.6
      });
    }

    // Fast white sparks (longer-distance streaks).
    const nSpark = small ? 4 : 10;
    for (let i = 0; i < nSpark; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 0.85 + Math.random() * 0.45;
      const el = document.createElement('div');
      el.className = 'mine-particle loot spark';
      el.style.left = (fx * 100) + '%';
      el.style.top  = (fy * 100) + '%';
      stage.appendChild(el);
      MSTATE.particles.push({
        el, fx, fy, vx: Math.cos(ang)*sp, vy: Math.sin(ang)*sp,
        life: 0.5 + Math.random() * 0.2, age: 0, drag: 2.4
      });
    }
  }
  function spawnHollowPuff(fx, fy) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 0.10 + Math.random() * 0.10;
      const el = document.createElement('div');
      el.className = 'mine-particle hollow';
      el.style.left = (fx * 100) + '%';
      el.style.top  = (fy * 100) + '%';
      stage.appendChild(el);
      MSTATE.particles.push({
        el, fx, fy, vx: Math.cos(ang)*sp, vy: Math.sin(ang)*sp,
        life: 0.95, age: 0, drag: 1.0
      });
    }
  }
  // Decay puff — fewer particles than hollow, very subtle. Used when
  // an ignored rock times out and disintegrates.
  function spawnDecayPuff(fx, fy) {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 0.06 + Math.random() * 0.06;
      const el = document.createElement('div');
      el.className = 'mine-particle hollow';
      el.style.left = (fx * 100) + '%';
      el.style.top  = (fy * 100) + '%';
      stage.appendChild(el);
      MSTATE.particles.push({
        el, fx, fy, vx: Math.cos(ang)*sp, vy: Math.sin(ang)*sp,
        life: 0.7, age: 0, drag: 1.2
      });
    }
  }

  function spawnFloater(fx, fy, text) {
    const el = document.createElement('div');
    el.className = 'mine-floater';
    el.textContent = text;
    el.style.left = (fx * 100) + '%';
    el.style.top  = (fy * 100) + '%';
    stage.appendChild(el);
    MSTATE.floaters.push({ el, age: 0, life: 0.8 });
  }

  // ── Tick loop ────────────────────────────────────────────────
  function tick(now) {
    if (!MSTATE.mining) return;
    if (PauseBus.paused) {
      MSTATE.lastTick = now;
      MSTATE.timerLast = now; // paused time doesn't count against the cap
      MSTATE.rafId = requestAnimationFrame(tick);
      return;
    }
    // Hit-pause — freeze all motion for the remainder of the pause
    // window while render keeps cycling. Set by LARGE/RICH cracks.
    if (MSTATE.hitPauseUntil && now < MSTATE.hitPauseUntil) {
      MSTATE.lastTick = now;
      MSTATE.rafId = requestAnimationFrame(tick);
      return;
    }
    const dt = Math.min(0.05, (now - MSTATE.lastTick) / 1000);
    MSTATE.lastTick = now;
    if (MSTATE.mining && MSTATE.timeLeftMs != null) {
      MSTATE.timeLeftMs -= Math.min(250, Math.max(0, now - (MSTATE.timerLast || now))); // a hidden-tab gap doesn't count
      MSTATE.timerLast = now;
      if (MSTATE.timeLeftMs <= 0) { MSTATE.timeLeftMs = null; endRun('time'); return; }
    }

    // Asteroids: drift, tumble, decay-fade, off-stage cull, decay-out.
    for (let i = MSTATE.asteroids.length - 1; i >= 0; i--) {
      const a = MSTATE.asteroids[i];
      if (!a.alive) {
        // Orphaned (already cracked) — remove from list once DOM gone.
        if (!a.el.isConnected) MSTATE.asteroids.splice(i, 1);
        continue;
      }
      a.fx += a.vx * dt;
      a.fy += a.vy * dt;
      a.rot += a.vrot * dt;
      a.life -= dt;

      // Decay timeout — rock disintegrates if ignored too long. Small
      // muted puff at the position, then remove. Fragments still
      // trigger fragment_lost so the AI patter notes the loss.
      if (a.life <= 0) {
        a.alive = false;
        spawnDecayPuff(a.fx, a.fy);
        a.el.remove();
        MSTATE.asteroids.splice(i, 1);
        if (a.parentTier === 'large' || a.parentTier === 'rich') {
          MSTATE.pendingTrigger = 'fragment_lost';
          MSTATE.stats.fragmentsLost++;
        }
        continue;
      }

      // Cull if drifted outside the stage bounds (with small margin).
      if (a.fx < -0.15 || a.fx > 1.15 || a.fy < -0.15 || a.fy > 1.15) {
        a.alive = false;
        a.el.remove();
        MSTATE.asteroids.splice(i, 1);
        if (a.parentTier === 'large' || a.parentTier === 'rich') {
          MSTATE.pendingTrigger = 'fragment_lost';
          MSTATE.stats.fragmentsLost++;
        }
        continue;
      }

      a.el.style.left = (a.fx * 100) + '%';
      a.el.style.top  = (a.fy * 100) + '%';
      a.el.style.setProperty('--rot', a.rot + 'deg');

      // Decay fade — the last 30% of life dims the opacity. Visually
      // telegraphs that the rock is about to vanish without changing
      // tier identity (size + speed stay the same).
      const decayThreshold = 0.3 * a.maxLife;
      if (a.life < decayThreshold) {
        a.el.style.opacity = Math.max(0, a.life / decayThreshold);
      } else if (a.el.style.opacity !== '') {
        a.el.style.opacity = '';
      }
    }

    // Particles.
    for (let i = MSTATE.particles.length - 1; i >= 0; i--) {
      const p = MSTATE.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        p.el.remove();
        MSTATE.particles.splice(i, 1);
        continue;
      }
      // Apply per-particle drag (sparks slow faster than chunky bits).
      const drag = p.drag != null ? p.drag : 1.4;
      p.vx *= (1 - dt * drag);
      p.vy *= (1 - dt * drag);
      p.fx += p.vx * dt;
      p.fy += p.vy * dt;
      p.el.style.left = (p.fx * 100) + '%';
      p.el.style.top  = (p.fy * 100) + '%';
      p.el.style.opacity = Math.max(0, 1 - (p.age / p.life));
    }

    // Floaters — CSS animation handles motion + fade; we just clean up.
    for (let i = MSTATE.floaters.length - 1; i >= 0; i--) {
      const f = MSTATE.floaters[i];
      f.age += dt;
      if (f.age >= f.life) { f.el.remove(); MSTATE.floaters.splice(i, 1); }
    }

    MSTATE.rafId = requestAnimationFrame(tick);
  }

  // ── Patter cycle ─────────────────────────────────────────────
  function schedulePatter() {
    const delay = 4000 + Math.random() * 2000;  // 4–6s
    MSTATE.patterIv = setTimeout(() => {
      if (!MSTATE.mining) return;

      // Determine trigger: pending event > idle (if no clicks for 3s).
      let trigger = MSTATE.pendingTrigger;
      const sinceClick = (performance.now() - MSTATE.lastClickAt) / 1000;
      if (!trigger && sinceClick > 3) trigger = 'idle';
      if (!trigger) {                       // Active but recent click: hold.
        schedulePatter();
        return;
      }

      const line = MINING_QUIPS[trigger]?.[MSTATE.activeAi];
      if (line) setAiQuip(MSTATE.activeAi, line);
      MSTATE.pendingTrigger = null;
      schedulePatter();
    }, delay);
  }

  // ── End-of-run ───────────────────────────────────────────────
  // Stops a live run: the tick loop, spawner, patter and stage clicks, and
  // clears the field. endRun() goes on to the haul card; abortMining() not.
  function stopRun() {
    MSTATE.mining = false;
    cancelAnimationFrame(MSTATE.rafId);
    clearInterval(MSTATE.spawnIv);
    clearTimeout(MSTATE.patterIv);
    clearTimeout(MSTATE.timeIv);
    stage.removeEventListener('mousedown', onStageMouseDown);
    stage.style.cursor = '';

    // Tear down active asteroids/particles immediately so the haul
    // card has a clean dim layer beneath it.
    MSTATE.asteroids.forEach(a => a.el.remove());
    MSTATE.particles.forEach(p => p.el.remove());
    MSTATE.floaters.forEach(f => f.el.remove());
    MSTATE.asteroids = []; MSTATE.particles = []; MSTATE.floaters = [];
  }
  function endRun(reason) {
    if (!MSTATE.mining) return;
    stopRun();

    // Brief flash for the natural-cap end (energy depleted / time up).
    if (reason === 'depleted' || reason === 'time') {
      const flash = document.createElement('div');
      flash.className = 'mine-flash';
      flash.innerHTML = reason === 'depleted'
        ? 'TRACTOR BEAM<br>DEPLETED'
        : "TIME'S UP";
      $('mining-root').appendChild(flash);
      setTimeout(() => flash.remove(), 1400);
      MSTATE.haulTo = setTimeout(() => { MSTATE.haulTo = null; showHaul(); }, 1100);
    } else {
      showHaul();
    }
  }

  function tierOf() {
    // PERFECT: ≥12 materials OR any RICH cracked (we can detect that
    // via inventory → if there's any exotic AND the count is high
    // enough, we treat it as a successful rich run; cheaper proxy:
    // 12+ materials gathered).
    const m = MSTATE.materials;
    if (m >= 12) return 'perfect';
    if (m >=  6) return 'adequate';
    return 'insufficient';
  }
  const TIER_LABELS = { perfect: 'EXCELLENT', adequate: 'ADEQUATE', insufficient: 'INSUFFICIENT' };

  function showHaul() {
    const overlay = $('haul-overlay');
    overlay.innerHTML = '';

    const tier = tierOf();

    // Roll the just-finished run into SESSION before painting the card.
    const _s = MSTATE.stats || { bestChain: 0 };
    SESSION.runs++;
    SESSION.totalCracks       += MSTATE.rocks;
    SESSION.totalMaterials    += MSTATE.materials;
    SESSION.totalHollows      += MSTATE.hollowsHit;
    if (_s.bestChain > SESSION.bestChainEver) SESSION.bestChainEver = _s.bestChain;
    if (SESSION.bestTier == null || TIER_RANK[tier] > TIER_RANK[SESSION.bestTier]) {
      SESSION.bestTier = tier;
    }
    const LIFE = lifeStats();
    LIFE.runs++;
    LIFE.totalMaterials += MSTATE.materials;
    SESSION.lastTier = tier;
    if (MSTATE.crewAssist) SESSION.crewUsed = MSTATE.crewAssist;

    // Merge this run's haul into the whole-visit total — RETURN TO SHIP
    // applies sessionInventory (every run made since openMining()), not
    // just the last one, since MINE AGAIN lets the player chain runs.
    for (const [mat, n] of Object.entries(MSTATE.inventory)) {
      sessionInventory[mat] = (sessionInventory[mat] || 0) + n;
    }

    const card = document.createElement('div');
    card.className = 'haul-card';

    // Tier banner
    const banner = document.createElement('div');
    banner.className = 'haul-tier tier-' + tier;
    banner.textContent = TIER_LABELS[tier];
    card.appendChild(banner);

    // AI line
    const aiLine = MINING_QUIPS[tier][MSTATE.activeAi];
    const ai = document.createElement('div');
    ai.className = 'haul-ai';
    ai.innerHTML = '<span class="ai-name">' + AI_NAMES[MSTATE.activeAi] + '</span><span>"' + aiLine + '"</span>';
    card.appendChild(ai);

    // Inventory tiles
    const invLabel = document.createElement('div');
    invLabel.className = 'haul-inv-label';
    invLabel.textContent = 'HAUL · ' + MSTATE.materials + ' MATERIAL' + (MSTATE.materials === 1 ? '' : 'S');
    card.appendChild(invLabel);

    const grid = document.createElement('div');
    grid.className = 'haul-inv-grid';
    const keys = Object.keys(MSTATE.inventory);
    if (!keys.length) {
      const empty = document.createElement('div');
      empty.className = 'haul-empty';
      empty.textContent = 'Nothing recovered.';
      card.appendChild(empty);
    } else {
      keys.forEach(k => {
        const tile = document.createElement('div');
        tile.className = 'haul-tile';
        tile.innerHTML = `
          <img src="${MD}${k}.png" alt="">
          <span class="haul-tile-count">×${MSTATE.inventory[k]}</span>
          <span class="haul-tile-name">${MAT_LABELS[k] || k}</span>`;
        grid.appendChild(tile);
      });
      card.appendChild(grid);
    }

    // What the visit's haul brings beside the rocks, and what a full hold
    // refuses — as RETURN TO SHIP lands it (the cruise log said it alone).
    for (const line of visitSideLines()) {
      const el = document.createElement('div');
      el.className = 'haul-side' + (line.warn ? ' warn' : '');
      el.textContent = line.text;
      card.appendChild(el);
    }

    // Hollow tally — flavor only.
    if (MSTATE.hollowsHit > 0) {
      const tally = document.createElement('div');
      tally.className = 'haul-hollow-tally';
      tally.textContent = 'Hollow rocks struck: ' + MSTATE.hollowsHit;
      card.appendChild(tally);
    }

    // Run stats — silent during play, surface here. Accuracy is
    // hits ÷ clicks, where a "hit" is any non-hollow asteroid struck.
    const s = MSTATE.stats || { clicks:0, hits:0, bestChain:0, fragmentsLost:0 };
    const acc = s.clicks > 0 ? Math.round((s.hits / s.clicks) * 100) : 0;
    const statsRow = document.createElement('div');
    statsRow.className = 'haul-stats';
    statsRow.innerHTML = `
      <span class="stat"><span class="lbl">CRACKS</span><span class="val">${MSTATE.rocks}</span></span>
      <span class="stat"><span class="lbl">ACCURACY</span><span class="val">${acc}%</span></span>
      <span class="stat"><span class="lbl">BEST CHAIN</span><span class="val">${s.bestChain}</span></span>
      <span class="stat"><span class="lbl">LOST FRAGS</span><span class="val">${s.fragmentsLost}</span></span>
    `;
    card.appendChild(statsRow);

    // Session stats — the demo's row (demo-mining ~2226): what THIS
    // mining session (this stop's BEGIN → MINE AGAIN loop) has added up.
    // Only from the 2nd run on (the first would repeat the run above).
    // The voyage totals (LIFE) don't belong under the SESSION label; they
    // ride the cruise log line (miningSummary).
    if (SESSION.runs >= 2) {
      const sessLabel = document.createElement('div');
      sessLabel.className = 'haul-session-label';
      sessLabel.textContent = '— SESSION · ' + SESSION.runs + ' RUNS —';
      card.appendChild(sessLabel);

      const bestTierLabel = SESSION.bestTier
        ? TIER_LABELS[SESSION.bestTier]
        : '—';
      const sessRow = document.createElement('div');
      sessRow.className = 'haul-stats session';
      sessRow.innerHTML = `
        <span class="stat"><span class="lbl">CRACKS</span><span class="val">${SESSION.totalCracks}</span></span>
        <span class="stat"><span class="lbl">MATERIALS</span><span class="val">${SESSION.totalMaterials}</span></span>
        <span class="stat"><span class="lbl">BEST CHAIN</span><span class="val">${SESSION.bestChainEver}</span></span>
        <span class="stat"><span class="lbl">BEST TIER</span><span class="val">${bestTierLabel}</span></span>
      `;
      card.appendChild(sessRow);
    }

    // Crew assist credit — only when one was selected for this run.
    const crewId = MSTATE.crewAssist;
    if (crewId && CREW_ASSIST[crewId]) {
      const c = CREW_ASSIST[crewId];
      const note = document.createElement('div');
      note.className = 'haul-hollow-tally';
      note.textContent = 'Crew assist: ' + assistName(crewId) + ' (' + c.role + ' · ' + c.bias + ')';
      card.appendChild(note);
    }

    // MINE AGAIN loops back to ARMED (same sector, same node) so a
    // player can keep working one stop before heading back. RETURN TO
    // SHIP banks the whole visit's sessionInventory to real STATE.
    const buttons = document.createElement('div');
    buttons.className = 'haul-buttons';
    const again = document.createElement('button');
    again.className = 'haul-btn';
    again.textContent = 'MINE AGAIN · +1 DAY';
    again.addEventListener('click', resetToArmed);
    buttons.appendChild(again);
    const ret = document.createElement('button');
    ret.className = 'haul-btn';
    ret.textContent = 'RETURN TO SHIP';
    ret.addEventListener('click', finishMining);
    buttons.appendChild(ret);
    card.appendChild(buttons);

    overlay.appendChild(card);
    overlay.classList.add('visible');
  }

  /* The visit's side gain (Bible multi-path rule): asteroid ice melts
     into water, a nebula run scoops fuel — half the units mined, cap 15,
     the tanks capping what lands. The same figures cruise.js MINE
     (handleMineVerb) applies on RETURN TO SHIP. */
  const SIDE_GAIN_CAP = 15;
  function visitSideGain() {
    const mined = Object.values(sessionInventory).reduce((a, b) => a + (b || 0), 0);
    const side = Math.min(SIDE_GAIN_CAP, Math.round(mined / 2));
    const region = window.cruiseRegionKey();
    const res = region === 'asteroid_field' ? 'water' : region === 'nebula' ? 'fuel' : null;
    if (!res || side <= 0) return null;
    const max = res === 'water' ? 100 : resMax('fuel');
    const b = STATE.resources[res];
    return { res, side, got: Math.round(clamp(b + side, 0, max) - b) };
  }
  function visitSideLines() {
    const lines = [];
    const many = SESSION.runs > 1 ? ' (this visit)' : '';
    const g = visitSideGain();
    if (g && g.res === 'water') lines.push({ text: g.got > 0 ? 'Ice melts down: +' + g.got + ' water' + many : 'Ice too, but the water tanks are full', warn: !(g.got > 0) });
    if (g && g.res === 'fuel') lines.push({ text: g.got > 0 ? 'Gas scooped: +' + g.got + ' fuel' + many : 'Gas too, but the fuel tank is full', warn: !(g.got > 0) });
    // The hold's own rule (materialLandings): what can't come aboard.
    const land = materialLandings(sessionInventory);
    const left = Object.entries(sessionInventory).filter(([k, n]) => n > (land[k] || 0)).map(([k, n]) => (n - (land[k] || 0)) + ' ' + (MAT_LABELS[k] || k).toLowerCase());
    if (left.length) lines.push({ text: 'Hold full: ' + left.join(', ') + ' stays behind', warn: true });
    return lines;
  }

  function resetToArmed() {
    $('haul-overlay').classList.remove('visible');
    $('haul-overlay').innerHTML = '';
    renderArmed();
  }

  /* RETURN TO SHIP — hands the whole visit's accumulated haul back to
     whoever called openMining(), then closes the overlay. Mirrors
     minigames.js's openMinigame()/onDone() contract. */
  function finishMining() {
    const haul = {
      inventory: sessionInventory,
      runs: SESSION.runs, // each run costs the ship a day (cruise.js MINE)
      hollowsHit: SESSION.totalHollows,
      sector: MSTATE.sector,
      crewAssist: MSTATE.crewAssist,
      stats: MSTATE.stats,
      tier: SESSION.lastTier || null,
      // The cruise-log payload — the visit's best tier, the sector when it mattered, who helped.
      summary: miningSummary(),
    };
    $('haul-overlay').classList.remove('visible');
    $('haul-overlay').innerHTML = '';
    hideOverlay('overlay-mining');
    const cb = onMiningDone;
    onMiningDone = null;
    if (cb) cb(haul);
  }

  function miningSummary() {
    if (!SESSION.runs) return '';
    const bits = [TIER_LABELS[SESSION.bestTier] || ''];
    if (MSTATE.sector && MSTATE.sector.id === 'dead_zone') bits.push('a dead zone, ' + SESSION.totalHollows + ' hollow' + (SESSION.totalHollows === 1 ? '' : 's'));
    else if (MSTATE.sector && MSTATE.sector.label) bits.push(MSTATE.sector.label.toLowerCase());
    const c = SESSION.crewUsed && CREW_ASSIST[SESSION.crewUsed];
    if (c) bits.push(assistName(SESSION.crewUsed) + ' assisting (' + c.bias + ')');
    // The voyage's mining record (STATE.miningLifetime, saved) — once an
    // earlier stop has been mined too.
    const L = lifeStats();
    if (L.runs > SESSION.runs) bits.push(L.runs + ' runs this voyage, ' + L.totalMaterials + ' materials');
    return '[' + bits.filter(Boolean).join(' · ') + ']';
  }

  // ── Entry point ──────────────────────────────────────────────
  // Called by cruise.js's MINE verb handler. onDone(haul) fires when the
  // player clicks RETURN TO SHIP — see finishMining() above. This overlay
  // IS the mining route (owner ruling 46b, 2026-10-12): MINE opens it
  // straight from the Stop menu and its ARMED state is the pre-commit
  // view. MINING_DEMO_SPEC §2/§11's asteroid_mining encounter wrapper was
  // never built and isn't planned.
  let onMiningDone = null;
  // The haul card, and one a natural end's flash is about to show.
  function clearHaulCard() {
    clearTimeout(MSTATE.haulTo); MSTATE.haulTo = null;
    const ho = document.getElementById('haul-overlay');
    if (ho) { ho.classList.remove('visible'); ho.innerHTML = ''; }
    document.querySelectorAll('#mining-root .mine-flash').forEach(f => f.remove());
  }
  // Load-time teardown (index.html teardownLiveUI): drop the visit
  // without banking or calling back into the run being replaced. A run
  // under way stops here without its haul card (which would count toward
  // the loaded voyage's mining record and stay up over its next MINE).
  function abortMining() {
    onMiningDone = null;
    if (MSTATE.mining) stopRun();
    clearHaulCard();
    hideOverlay('overlay-mining');
  }

  function openMining(onDone) {
    if (MSTATE.mining) stopRun();
    clearHaulCard(); // a card left over from an earlier visit never covers this one
    onMiningDone = onDone;
    sessionInventory = {};
    Object.assign(SESSION, { runs: 0, totalCracks: 0, totalMaterials: 0, totalHollows: 0, bestChainEver: 0, bestTier: null, lastTier: null, crewUsed: null });
    showOverlay('overlay-mining');
    renderArmed();
  }

  Object.assign(window, {
    // engine API
    abortMining, openMining,
  });
})();
