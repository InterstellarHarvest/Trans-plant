'use strict';
/* ────────────────────────────────────────────────────────────────
   STANDING ORDERS MODAL — Restoration item 5, ported from
   resources/demo-orders.html.

   Entry: window.openOrders() — opened by clicking any cell of the
   cruise readout strip (cruise.js). Markup is static in index.html
   (#overlay-orders, od-prefixed ids); chrome in screen-orders.css.

   The demo's committed-vs-preview model is kept exactly: opening
   snapshots STATE.orders into `preview`; pills/slider edit only the
   preview; APPLY commits it back to STATE.orders (water through
   setWaterSplit() so the growbay slider stays in lockstep); CANCEL /
   ESC / backdrop discards. Teal saved-current markers show what is
   actually committed while the player auditions alternatives.

   Projections translate every setting into day numbers via the same
   ORDERS_* tables index.html's travel/drain mechanics consume — the
   modal predicts with the exact rates the engine will charge.

   Load-order rule: loads BEFORE index.html's main inline script —
   top level only wires DOM listeners + local tables; every STATE /
   ORDERS_* / helper read resolves at call time.
   ──────────────────────────────────────────────────────────────── */
(function () {
  const $ = id => document.getElementById(id);

  // Typical event time-cost days per node — folded into the arrival /
  // fuel-runway projections so "days per leg" reflects what a leg
  // really costs (travel days + the stop's event). Estimation only;
  // the mechanics never use this.
  const AVG_EVENT_DAYS = 2;

  const AI_SPRITE = { aria: 'sprites/interface/AI/aria.png', marv: 'sprites/interface/AI/marv.png', rex: 'sprites/interface/AI/rex.png', chip: 'sprites/interface/AI/chip.png', ajoy: 'sprites/interface/AI/ajoy.png' };

  // ── Plain-language tier descriptions (demo verbatim) ──────────
  const PACE_DESCS = [
    'Crawl to arrival. Burn little. Crew rests.',
    'The default. Steady fuel. Crew fine.',
    'Faster. Burn harder. Crew tires.',
    'Arrive fastest. Bleed fuel and crew. Not a drill.'
  ];
  const RATIONS_DESCS = [
    'Half rations. Morale sinks. Food lasts.',
    'Full rations. Morale holds steady.',
    'Double rations. Morale lifts. Food empties fast.'
  ];

  // ── AI quips — demo's ARIA table verbatim; the other four written
  // to their registered voices (ai_companions.json registers; CHIP is
  // the only one allowed exclamation points, per the bible).
  const AI_QUIPS = {
    aria: {
      pace: [
        'Slow is safe. Safety is a warm hug.',
        'Steady as she goes. An acceptable compromise.',
        'Bold. I support boldness, even when it is alarming.',
        'PLAID selected. Fuel consumption up 140%. I am personally excited about this.'
      ],
      rations: [
        'Vending Machine mode. A proud tradition of thin men.',
        'Everyone gets exactly enough. The galaxy\'s most tolerable compromise.',
        'Pig out! The cook disapproves but the crew does not.'
      ],
      water_matched: 'The plant\'s mood is exactly what one would hope for a plant\'s mood to be.',
      water_plant_starving: 'Wheat is thirsty. Also, slightly offended.',
      water_crew_starving: 'Crew is thirsty. Also, audibly complaining.'
    },
    marv: {
      pace: [
        'Slow. We will arrive eventually. I have modeled "eventually." You will not enjoy the model.',
        'The default setting. Statistically the least bad option. That is the entire compliment.',
        'Faster arrival, 60% more burn. I ran the numbers twice. They did not improve.',
        'PLAID. Fuel consumption up 140%. I have pre-drafted the distress beacon message.'
      ],
      rations: [
        'Half rations. Morale will decline. I have charted it. The chart is very straight.',
        'Standard rations. Everyone is fed. Nobody is happy. Working as designed.',
        'Double rations. The food runs out sooner. The math does not care how good dinner was.'
      ],
      water_matched: 'Water allocation is currently optimal. Optimality never lasts.',
      water_plant_starving: 'The crop is under-watered. It will die slowly, then all at once.',
      water_crew_starving: 'The crew is under-watered. Humans complain before they fail. Both are scheduled.'
    },
    rex: {
      pace: [
        'Reduced speed. Tactically cautious. Prudence and cowardice share a border.',
        'Cruise velocity nominal. Threat posture: acceptable.',
        'Aggressive burn. Approved. The fuel reserves do not get a vote.',
        'PLAID engaged. Maximum aggression. Projected casualty: the fuel gauge.'
      ],
      rations: [
        'Half rations. Hungry troops fight worse. Logged for the after-action report.',
        'Standard rations. Supply lines holding. Do not test them.',
        'Double rations. Morale up, reserves down. A salient invites encirclement.'
      ],
      water_matched: 'Water discipline holding on both fronts. Maintain.',
      water_plant_starving: 'The crop is losing its supply line. Plants do not surrender. They just die.',
      water_crew_starving: 'Crew hydration below combat effectiveness. Correct it, commander.'
    },
    chip: {
      pace: [
        'LIGHT SPEED! Fuel savings may be redeemed as CHIP Loyalty Points! Terms apply!',
        'RIDICULOUS SPEED! The manufacturer-recommended setting, per the warranty you did not read!',
        'LUDICROUS SPEED! Accelerated engine wear is not covered under the Basic Care plan!',
        'PLAID! This setting voids the warranty! It is also tremendously exciting!'
      ],
      rations: [
        'Vending Machine mode! Every meal proudly sponsored by the concept of scarcity!',
        'Standard rations! A balanced pick from our Balanced Choices line!',
        'PIG OUT! Upgrade your dining experience today! Replacement food sold separately!'
      ],
      water_matched: 'Hydration allocation optimized! This message brought to you by water!',
      water_plant_starving: 'Your crop reports dissatisfaction! Ask about our premium irrigation package!',
      water_crew_starving: 'Crew hydration has dropped below the complimentary tier! Refills available at participating stations!'
    },
    ajoy: {
      pace: [
        'Light speed. Playing it safe. I mean, we could get there this decade, but sure.',
        'The default. The setting for people who do not want to have opinions. Enjoy.',
        'Ludicrous, huh. I would have topped off the tank first, but you seem confident.',
        'PLAID. Bold. I flagged the fuel math for you. Twice. But no, let\'s feel the wind.'
      ],
      rations: [
        'Half rations. The crew will love that. I am sure they will say so. Repeatedly.',
        'Standard rations. Fine. It is what I would have suggested, not that anyone asked.',
        'Double rations. Very generous. Someone should watch the pantry math. I guess that is me.'
      ],
      water_matched: 'The water split is actually correct. I am as surprised as you are.',
      water_plant_starving: 'The plant is parched. I mentioned the watering schedule earlier. You seemed busy.',
      water_crew_starving: 'The crew is thirsty. But the plant looks great, so. Priorities.'
    }
  };

  // Committed-vs-preview: preview is the modal's scratch copy.
  const preview = { pace: 1, rations: 1, water: 50 };
  let hadModalOpen = false; // body.modal-open restore (orders can stack over the growbay)

  function isOpen() {
    const ov = $('overlay-orders');
    return ov && ov.classList.contains('active');
  }

  // ── Saved-state accessors (index.html's ORDERS tables) ────────
  function savedIdx() {
    const o = ensureOrders();
    return {
      pace: Math.max(0, ORDERS_PACE.findIndex(p => p.id === o.pace)),
      rations: Math.max(0, ORDERS_RATIONS.findIndex(r => r.id === o.rations)),
      water: o.waterSplit,
    };
  }
  function cropMeta() {
    return (typeof window.cropMetaOf === 'function' && STATE.crop) ? cropMetaOf(STATE.crop) : null;
  }
  function waterNeed() {
    const m = cropMeta();
    return (m && m.water_need) || 50;
  }

  // ── Projection model — engine-real inputs, demo-shaped outputs ─
  // Everything is a day number the player already cares about.
  function remainingLegs() {
    // BFS from the current node to the arrival node (no outgoing
    // connections). Forks explore both branches (map.js authors their
    // connects_to as {alpha:[ids], beta:[ids]} — arrays of arrays once
    // Object.values()d, hence the flatten); shortest route wins.
    if (!STATE.byId || !STATE.currentId) return 1;
    const seen = new Set([STATE.currentId]);
    let frontier = [STATE.currentId];
    let depth = 0;
    for (; frontier.length && depth < 99; depth++) {
      const next = [];
      for (const id of frontier) {
        const n = STATE.byId[id];
        if (!n) continue;
        const raw = Array.isArray(n.connects_to) ? n.connects_to : Object.values(n.connects_to || {});
        const conns = [];
        for (const c of raw) {
          if (typeof c === 'string') conns.push(c);
          else if (Array.isArray(c)) for (const cc of c) { if (typeof cc === 'string') conns.push(cc); }
        }
        if (!conns.length) return Math.max(1, depth); // arrival node reached
        for (const cid of conns) {
          if (!seen.has(cid)) { seen.add(cid); next.push(cid); }
        }
      }
      frontier = next;
    }
    return Math.max(1, depth);
  }
  function baseLegDays() {
    const nodeCount = Math.max(1, (STATE.nodes && STATE.nodes.length) || 10);
    return Math.max(1, (STATE.baseDays * ORDERS_BASE.legDaysFrac) / nodeCount);
  }
  function perLegDays(paceIdx) {
    return baseLegDays() * ORDERS_PACE[paceIdx].etaMult + AVG_EVENT_DAYS;
  }
  function projectedArrivalDay(paceIdx) {
    return STATE.daysElapsed + Math.max(1, Math.round(remainingLegs() * perLegDays(paceIdx)));
  }
  function fuelEmptyDay(paceIdx) {
    const perLegFuel = (typeof window.fuelPerLegBase === 'function' ? fuelPerLegBase() : 3) * ORDERS_PACE[paceIdx].fuelMult;
    const legsOfFuel = STATE.resources.fuel / perLegFuel;
    return STATE.daysElapsed + Math.floor(legsOfFuel * perLegDays(paceIdx));
  }
  function foodEmptyDay(rationsIdx) {
    const perDay = ORDERS_BASE.foodPerDay * ORDERS_RATIONS[rationsIdx].foodMult;
    return STATE.daysElapsed + Math.floor(STATE.resources.food / perDay);
  }
  function cropMatureDay(plantPct) {
    const m = cropMeta();
    const cg = STATE.cropGrowth;
    if (!m || !cg || cg.health <= 0) return Infinity;
    const ratio = Math.min(1, plantPct / waterNeed());
    if (ratio === 0) return Infinity;
    // Growbay's real rate is (100/maturity) × health-factor; the water
    // ratio rides on top the way the demo projected it — under-watering
    // erodes health, so the slider must move this number.
    const dailyRate = (100 / m.maturity_days) * Math.max(0.05, cg.health / 100) * ratio;
    if (dailyRate <= 0.01) return Infinity;
    return STATE.daysElapsed + Math.ceil(Math.max(0, 100 - cg.growth) / dailyRate);
  }
  // Demo crewDrainRate() — hydration points/day for a given plant share.
  function crewDrainRate(plantPct) {
    const crewPct = 100 - plantPct;
    const ratio = Math.min(1, crewPct / (100 - waterNeed()));
    if (ratio >= 1)   return 0;
    if (ratio >= 0.7) return 1;
    if (ratio >= 0.4) return 3;
    return 6;
  }
  function crewCriticalDay(plantPct) {
    const rate = crewDrainRate(plantPct);
    if (rate === 0) return Infinity;
    return STATE.daysElapsed + Math.ceil(100 / rate);
  }

  function waterDesc(plantPct) {
    const plantRatio = plantPct / waterNeed();
    const crewRatio = (100 - plantPct) / (100 - waterNeed());
    if (plantRatio < 0.5)  return 'Plant parches. Crew bathes. Growth crawls.';
    if (plantRatio < 0.85) return 'Plant thirsty. Crop slows.';
    if (crewRatio < 0.5)   return 'Plant thrives. Crew goes dry.';
    if (crewRatio < 0.85)  return 'Plant well-fed. Crew watches the taps.';
    return 'Matched. Plant and crew both fine.';
  }

  // ── Stat row HTML (demo statLine/dayDelta verbatim, od- classes) ─
  function statLine(label, value, deltaStr, deltaClass, warn) {
    return '<div class="od-preview-stat' + (warn ? ' warn' : '') + '">' +
      label + ' · <strong>' + value + '</strong>' +
      (deltaStr ? ' <span class="delta ' + (deltaClass || 'neutral') + '">' + deltaStr + '</span>' : '') +
      ' <span class="od-warn-badge">⚠</span>' +
      '</div>';
  }
  function dayDelta(cur, base, laterIsBetter) {
    if (cur === base) return { text: null, cls: null };
    const d = cur - base;
    const text = (d > 0 ? '+' : '') + d + 'd';
    const cls = (d > 0) === laterIsBetter ? 'good' : 'bad';
    return { text, cls };
  }

  // ── Section renders (demo logic on engine state) ──────────────
  function renderEngines() {
    const sv = savedIdx();
    const p = ORDERS_PACE[preview.pace];
    const s = ORDERS_PACE[sv.pace];
    const arrival   = projectedArrivalDay(preview.pace);
    const savedArr  = projectedArrivalDay(sv.pace);
    const fuelEmpty = fuelEmptyDay(preview.pace);
    const savedFuel = fuelEmptyDay(sv.pace);

    const arrDelta  = dayDelta(arrival, savedArr, false);   // sooner is better
    const fuelDelta = dayDelta(fuelEmpty, savedFuel, true); // later is better

    const crewLabel = p.drainMult < 1 ? 'EASING' : (p.drainMult > 1 ? 'RISING' : 'STEADY');
    let crewDeltaText = null, crewDeltaCls = null;
    if (p.drainMult !== s.drainMult) {
      crewDeltaText = p.drainMult > s.drainMult ? '▲' : '▼';
      crewDeltaCls  = p.drainMult > s.drainMult ? 'bad' : 'good';
    }

    const fuelWarn = fuelEmpty < arrival;

    $('od-engines-preview').innerHTML =
      statLine('ARRIVAL',    'DAY ' + arrival,   arrDelta.text,  arrDelta.cls,  false) +
      statLine('FUEL EMPTY', 'DAY ' + fuelEmpty, fuelDelta.text, fuelDelta.cls, fuelWarn) +
      statLine('CREW DRAIN', crewLabel,          crewDeltaText,  crewDeltaCls,  false);

    $('od-engines-desc').textContent = PACE_DESCS[preview.pace];
    $('od-engines-warn').classList.toggle('on', fuelWarn);

    document.querySelectorAll('#od-engines-pills .od-pill').forEach((el, i) => {
      el.classList.toggle('selected', i === preview.pace);
      el.classList.toggle('saved-current', i === sv.pace);
    });
  }

  function renderRations() {
    const sv = savedIdx();
    const r = ORDERS_RATIONS[preview.rations];
    const s = ORDERS_RATIONS[sv.rations];
    const foodEmpty  = foodEmptyDay(preview.rations);
    const savedEmpty = foodEmptyDay(sv.rations);
    // Warning compares against the PREVIEW's arrival day (demo note:
    // speeding the ship up can dodge a food shortage).
    const arrival = projectedArrivalDay(preview.pace);

    const foodDelta = dayDelta(foodEmpty, savedEmpty, true);

    const fpd = ORDERS_BASE.foodPerDay * r.foodMult;
    let fpdText = null;
    if (r.foodMult !== s.foodMult) {
      const d = fpd - ORDERS_BASE.foodPerDay * s.foodMult;
      fpdText = (d > 0 ? '+' : '') + (Math.round(d * 100) / 100);
    }

    const moraleOrder = { FALLING: 0, STEADY: 1, RISING: 2 };
    let moraleDelta = null, moraleCls = null;
    if (r.morale !== s.morale) {
      const up = moraleOrder[r.morale] > moraleOrder[s.morale];
      moraleDelta = up ? '▲' : '▼';
      moraleCls   = up ? 'good' : 'bad';
    }

    const foodWarn = foodEmpty < arrival;

    $('od-rations-preview').innerHTML =
      statLine('FOOD EMPTY', 'DAY ' + foodEmpty,          foodDelta.text, foodDelta.cls, foodWarn) +
      statLine('FOOD / DAY', Math.round(fpd * 100) / 100, fpdText,        'neutral',     false) +
      statLine('MORALE',     r.morale,                    moraleDelta,    moraleCls,     false);

    $('od-rations-desc').textContent = RATIONS_DESCS[preview.rations];
    $('od-rations-warn').classList.toggle('on', foodWarn);

    document.querySelectorAll('#od-rations-pills .od-pill').forEach((el, i) => {
      el.classList.toggle('selected', i === preview.rations);
      el.classList.toggle('saved-current', i === sv.rations);
    });
  }

  function renderWater() {
    const sv = savedIdx();
    const plant = preview.water;
    const crew = 100 - plant;
    $('od-water-plant-pct').textContent = plant + '%';
    $('od-water-crew-pct').textContent  = crew + '%';
    $('od-water-fill-plant').style.width = plant + '%';
    $('od-water-fill-crew').style.width  = crew + '%';
    $('od-water-thumb').style.left       = plant + '%';
    $('od-water-saved-mark').style.left  = sv.water + '%';

    const arrival     = projectedArrivalDay(preview.pace);
    const mature      = cropMatureDay(plant);
    const savedMature = cropMatureDay(sv.water);
    const crewDay     = crewCriticalDay(plant);
    const savedCrewD  = crewCriticalDay(sv.water);

    const noCrop = !cropMeta() || !STATE.cropGrowth;
    const matureStr = noCrop ? 'NO CROP' : (mature === Infinity ? 'NEVER' : 'DAY ' + mature);
    const matureDelta = dayDelta(
      mature === Infinity ? 9999 : mature,
      savedMature === Infinity ? 9999 : savedMature,
      false
    );
    const plantWarn = !noCrop && mature > arrival;

    const drain      = crewDrainRate(plant);
    const savedDrain = crewDrainRate(sv.water);
    const crewLabel  = drain === 0 ? 'NOMINAL' : ('CRITICAL DAY ' + crewDay);

    let crewDeltaText = null, crewDeltaCls = null;
    if (drain !== savedDrain) {
      crewDeltaText = drain > savedDrain ? '▲' : '▼';
      crewDeltaCls  = drain > savedDrain ? 'bad' : 'good';
    } else if (drain > 0 && crewDay !== savedCrewD) {
      const d = dayDelta(crewDay, savedCrewD, true);
      crewDeltaText = d.text; crewDeltaCls = d.cls;
    }

    const crewWarn = crewDay < arrival;

    $('od-water-preview').innerHTML =
      statLine('PLANT MATURES', matureStr, matureDelta.text, matureDelta.cls, plantWarn) +
      statLine('CREW',          crewLabel, crewDeltaText,    crewDeltaCls,    crewWarn);

    $('od-water-desc').textContent = waterDesc(plant);
    $('od-water-warn').classList.toggle('on', plantWarn || crewWarn);
  }

  // AI commentary — demo renderAi(): hover overrides audition a tier
  // without committing; otherwise the line reflects the preview state.
  function renderAi(override) {
    const sv = savedIdx();
    const q = AI_QUIPS[STATE.activeAI] || AI_QUIPS.marv;
    let line;
    if (override && 'pace' in override) {
      line = q.pace[override.pace];
    } else if (override && 'rations' in override) {
      line = q.rations[override.rations];
    } else {
      const plant = preview.water;
      const crewRatio  = (100 - plant) / (100 - waterNeed());
      const plantRatio = plant / waterNeed();
      if (crewRatio < 0.6)                       line = q.water_crew_starving;
      else if (plantRatio < 0.7)                 line = q.water_plant_starving;
      else if (preview.pace !== sv.pace)         line = q.pace[preview.pace];
      else if (preview.rations !== sv.rations)   line = q.rations[preview.rations];
      else                                       line = q.water_matched;
    }
    $('od-ai-text').textContent = line;
  }

  function renderAll() {
    renderEngines();
    renderRations();
    renderWater();
    renderAi();
  }

  // ── Pill interactions (click commits to preview; hover auditions
  //    the AI line — demo behavior) ───────────────────────────────
  document.querySelectorAll('#od-engines-pills .od-pill').forEach(el => {
    const idx = parseInt(el.getAttribute('data-idx'), 10);
    el.addEventListener('click', () => { preview.pace = idx; renderAll(); });
    el.addEventListener('mouseenter', () => { if (isOpen() && idx !== preview.pace) renderAi({ pace: idx }); });
    el.addEventListener('mouseleave', () => { if (isOpen()) renderAi(); });
  });
  document.querySelectorAll('#od-rations-pills .od-pill').forEach(el => {
    const idx = parseInt(el.getAttribute('data-idx'), 10);
    el.addEventListener('click', () => { preview.rations = idx; renderAll(); });
    el.addEventListener('mouseenter', () => { if (isOpen() && idx !== preview.rations) renderAi({ rations: idx }); });
    el.addEventListener('mouseleave', () => { if (isOpen()) renderAi(); });
  });

  // ── Water slider (pointer drag, demo 15/85 floor/ceiling) ─────
  (function wireWaterDrag() {
    const track = $('od-water-track');
    if (!track) return;
    const MIN_WATER = 15, MAX_WATER = 85;
    let dragging = false;

    function pctFromEvent(e) {
      const rect = track.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const pct = Math.round(Math.max(0, Math.min(1, x)) * 100);
      return Math.max(MIN_WATER, Math.min(MAX_WATER, pct));
    }
    track.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      track.setPointerCapture(e.pointerId);
      preview.water = pctFromEvent(e);
      renderAll();
    });
    track.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      preview.water = pctFromEvent(e);
      renderAll();
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      if (track.hasPointerCapture && e.pointerId !== undefined && track.hasPointerCapture(e.pointerId)) {
        track.releasePointerCapture(e.pointerId);
      }
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
  })();

  // ── Open / close ──────────────────────────────────────────────
  window.openOrders = function () {
    const sv = savedIdx();
    preview.pace = sv.pace;
    preview.rations = sv.rations;
    preview.water = sv.water;

    const ai = STATE.activeAI || 'marv';
    $('od-ai-avatar').style.backgroundImage = "url('" + (AI_SPRITE[ai] || AI_SPRITE.marv) + "')";
    $('od-ai-name').textContent = ai.toUpperCase() + ':';

    // body.modal-open gates the pause menu's ESC (shared.js PauseMenu
    // toggle) — remember whether someone underneath (growbay) already
    // holds it so closing Orders doesn't strip theirs.
    hadModalOpen = document.body.classList.contains('modal-open');
    document.body.classList.add('modal-open');
    showOverlay('overlay-orders');
    renderAll();
  };

  function closeOrders(result) {
    if (!isOpen()) return;
    if (result === 'apply') {
      const o = ensureOrders();
      o.pace = ORDERS_PACE[preview.pace].id;
      o.rations = ORDERS_RATIONS[preview.rations].id;
      setWaterSplit(preview.water); // keeps growbay's cropGrowth.waterPlant in lockstep
      if (typeof window.pushCruiseLog === 'function') {
        window.pushCruiseLog('◆ ORDERS — ' + ORDERS_PACE[preview.pace].name +
          ' · ' + ORDERS_RATIONS[preview.rations].name +
          ' · water ' + preview.water + '/' + (100 - preview.water) + '.');
      }
    }
    hideOverlay('overlay-orders');
    if (!hadModalOpen) document.body.classList.remove('modal-open');
    if (typeof window.renderHUD === 'function') renderHUD();
    if (typeof window.renderCruise === 'function') renderCruise(); // repaints the readout + autosaves
  }
  window.closeOrders = closeOrders;

  $('od-cancel').addEventListener('click', () => closeOrders('cancel'));
  $('od-apply').addEventListener('click', () => closeOrders('apply'));
  $('od-backdrop').addEventListener('click', () => closeOrders('cancel'));

  // ESC cancels — capture phase so the growbay's own window-level ESC
  // handler (and the pause menu) never see the keypress while the
  // Orders modal is the top surface.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    closeOrders('cancel');
  }, true);
})();
