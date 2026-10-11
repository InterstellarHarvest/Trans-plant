'use strict';
/* ────────────────────────────────────────────────────────────────
   ENDINGS / FAILURES SCREEN — Phase 6. Migrated from resources/
   demo-endings.html's two-screen cinematic+report flow, per
   GAME_BIBLE.md §17.

   Scope notes (see ENGINE_INTEGRATION_HANDOFF.md for the full
   Phase 6 rundown):
   - The demo's TITLES/ARRIVAL_BODY/TIER_QUOTE/FAILURES tables were
     dev-placeholder copy that never made it into the real module
     JSON — modules/endings/endings.json and modules/failures/
     failures.json diverged into richer, differently-structured
     content (body_template + score/crop/crew_paragraphs for
     endings; title/body/epitaph for failures) during the content-
     authoring pass. This file reads the REAL modules, not the
     demo's mirror — same "don't port a drifted copy" rule Phase 4
     applied to Fabricator's recipes.
   - The one exception: the four tier-reactive cinematic titles
     (MADE IT / MOSTLY MADE IT / BARELY MADE IT / NOBODY'S SURE) are
     presentational stingers, not narrative content tied to a
     specific module — Bible §17 frames them as part of the
     structural two-screen flow (the demo's own version), not
     something endings.json needs to carry. Kept as a small local
     constant here, same treatment Phase 3 gave NPC_QUIRKS/
     NPC_DISPOSITION_NAME in index.html.
   - Crop status (thriving/sick/dead) is now genuinely wireable —
     Phase 4's Growbay tracks real STATE.cropGrowth.health — so the
     "assume thriving" placeholder from endRun()'s original Phase 3/4
     version is resolved here using crops.json's own authored
     healthy_threshold/sick_threshold per crop.
   - Emergency beacon (Bible: "no_fuel's emergency_beacon becomes the
     final option") is NOT implemented as an interactive mechanic —
     the Bible doesn't specify what accepting rescue actually does
     mechanically, and inventing a rescue-outcome branch isn't a
     one-line extrapolation like the crop-status wiring above. The
     report card still renders the module's authored body/epitaph
     text (which already reads as "the beacon is your only option"),
     it just isn't a clickable branch. Flagged, not silently built.

   Load-order note (same as every other engine/js/*.js file): loads
   via <script src> before index.html's inline script has declared
   MOD/STATE — only ever read inside function bodies invoked later.
   ──────────────────────────────────────────────────────────────── */
(function () {

  const SCENE_BASE = 'sprites/backgrounds/endgame';

  // Trail id → bg folder + file prefix. Interstellar diverges on both
  // (Bible §17's "Arrival Bg Matrix" — engine must use a resolver,
  // never direct string interpolation from the trail id).
  const DEST_PATHS = {
    lunar:        { folder: 'lunar',      prefix: 'lunar'     },
    mars:         { folder: 'mars',       prefix: 'mars'      },
    interstellar: { folder: 'far_garden', prefix: 'fargarden' },
  };

  // crops.json ids don't all match the bg filename suffix — sweet_potato's
  // asset is named *_potato.jpg (found during this port, fixed here rather
  // than renaming crops.json's id, same "don't touch the ID, fix the
  // resolver" approach Phase 4 used for items.json's short-id mismatch).
  const CROP_BG_ID = { sweet_potato: 'potato' };

  // Per-trail placement of the cinematic title/button group, ported
  // verbatim from the demo's tuned values (960x640 game-window space).
  const DEST_PLACEMENT = {
    lunar:        { x: 390, y: 500 },
    mars:         { x: 244, y: 444 },
    interstellar: { x: 365, y: 530 },
  };
  const FAILURE_CENTRE = { x: 480, y: 320 };
  const FAILURE_TITLE_SIZE = 36;

  // Tier-reactive cinematic titles — see header note. 'hollow' is the
  // crew-arrived-crop-dead bracket (scoreBracket() override in index.html).
  const TITLES = {
    legendary: 'MADE IT',
    good:      'MOSTLY\nMADE IT',
    rough:     'BARELY\nMADE IT',
    pyrrhic:   "NOBODY'S\nSURE",
    hollow:    "MADE IT.\nIT DIDN'T",
  };

  // Failures with no report card — Bible §17: "hull_zero and crew_gone
  // are cinematic-only... for those, the body sentence + optional quote
  // render on the cinematic itself." crop_dead isn't in the Bible's
  // original 5-failure table (it was gated on Phase 4's crop-tick loop
  // existing, per the Phase 3 handoff) — treated as full two-screen
  // since it carries a continue_option in failures.json suggesting more
  // weight than a one-line cinematic-only beat.
  const CINEMATIC_ONLY_FAILURES = new Set(['hull_zero', 'crew_gone']);

  function $(id) { return document.getElementById(id); }

  /* Resolves STATE.cropGrowth.health against the selected crop's own
     authored healthy_threshold/sick_threshold (crops.json) — falls
     back to generic 70/30 if no crop was ever selected (shouldn't
     happen post-setup, but avoids a crash on the ?debug=fixed_path
     loop which doesn't run the setup wizard). Returns 'dead' with no
     crop selected at all, matching the bg matrix's 'noplant' case. */
  function resolveCropStatus() {
    if (!STATE.crop) return { status: 'dead', cropBgId: 'noplant' };
    const cropDef = (MOD.crops && MOD.crops.crops || []).find(c => c.id === 'crop_' + STATE.crop);
    const health = (STATE.cropGrowth && STATE.cropGrowth.health) || 0;
    const healthyAt = (cropDef && cropDef.healthy_threshold) || 70;
    const sickAt    = (cropDef && cropDef.sick_threshold) || 30;
    let status;
    if (health <= 0) status = 'dead';
    else if (health >= healthyAt) status = 'thriving';
    else if (health >= sickAt) status = 'sick';
    else status = 'sick'; // below sick_threshold but > 0 — still "sick", not "dead"
    const cropBgId = status === 'dead' ? 'noplant' : (CROP_BG_ID[STATE.crop] || STATE.crop);
    return { status, cropBgId };
  }

  function sceneBgPath(trail, cropBgId) {
    const p = DEST_PATHS[trail] || DEST_PATHS.mars;
    return `${SCENE_BASE}/${p.folder}/${p.prefix}_${cropBgId}.jpg`;
  }

  // full = nobody lost; partial = some lost, someone left; solo = alone
  // (it used to need 3 crew for 'full' — the setup allows 2, so every
  // intact crew read "empty spaces where people used to stand").
  function crewKeyFor(count) {
    if (count <= 0) return 'solo';
    const start = STATE.startCrew != null ? STATE.startCrew : count;
    return (STATE.flags.has('crew_lost') || count < start) ? 'partial' : 'full';
  }

  /* Builds the {category, toneId, title, body, quote, showReport,
     stats, ...} shape both render functions consume, from a resolved
     ending/failure module + real STATE. Mirrors the demo's buildEnding()
     but reads real modules instead of hardcoded tables. */
  function buildEndView(end) {
    const stats = {
      crew:  STATE.crew.length,
      fuel:  STATE.resources.fuel,
      food:  STATE.resources.food,
      water: STATE.resources.water,
      hull:  STATE.resources.hull,
      days:  STATE.daysElapsed,
      baseDays: STATE.baseDays,
      failed: end.kind === 'failure',
    };

    // Ship's Record — the voyage's notable choices (index.html shipsRecordLines).
    const record = typeof shipsRecordLines === 'function' ? shipsRecordLines(5) : [];

    if (end.kind === 'failure') {
      const f = end.module;
      return {
        category: 'failure',
        toneId: f.failure_type,
        title: f.title,
        body: f.body,
        record,
        quote: f.epitaph ? `— ${f.epitaph}` : null,
        showReport: !CINEMATIC_ONLY_FAILURES.has(f.failure_type),
        // failures.json can author a continue_option (crop_dead does:
        // "Keep flying") — a non-terminal failure the player can accept
        // and press on from, landing at the 'hollow' arrival bracket.
        continueOption: f.continue_option || null,
        // no_fuel authors emergency_beacon_option — live only if the
        // player actually carries the beacon (items.json: "Triggers
        // rescue event — rescue may be friendly, hostile, or corporate").
        beaconOption: !!(f.emergency_beacon_option && STATE.items.includes('emergency_beacon')),
        stats,
      };
    }

    const m = end.module;
    const bracket = scoreBracket();
    const cropInfo = resolveCropStatus();
    let body = m.body_template || m.body || '';
    const scorePara = (m.score_paragraphs && (m.score_paragraphs[bracket] || m.score_paragraphs.any)) || '';
    const cropPara = (m.crop_paragraphs && m.crop_paragraphs[cropInfo.status]) || '';
    const crewPara = (m.crew_paragraphs && m.crew_paragraphs[crewKeyFor(stats.crew)]) || '';
    const reportNum = 1000 + Math.floor(Math.random() * 9000);
    body = body
      .replaceAll('{score_paragraph}', scorePara)
      .replaceAll('{crop_paragraph}', cropPara)
      .replaceAll('{crew_paragraph}', crewPara)
      .replaceAll('{crew_reaction}', crewPara)
      .replaceAll('{report_number}', reportNum);
    // crops.json zinnia unique_ending_modifier "zinnia_survived": living
    // zinnias change the final paragraph whatever the bracket (authored
    // once, on ending_colonyfiled_001's zinnia_modifier).
    if (STATE.crop === 'zinnia' && STATE.cropGrowth && STATE.cropGrowth.health > 0) {
      const zm = m.zinnia_modifier || ((MOD.endings || []).find(e => e.zinnia_modifier) || {}).zinnia_modifier;
      if (zm && zm.additional_paragraph) body += '\n\n' + zm.additional_paragraph;
    }

    return {
      record,
      category: 'arrival',
      toneId: bracket,
      title: TITLES[bracket],
      reportTitle: m.title,
      body,
      quote: null,
      showReport: true,
      trail: STATE.trail,
      cropBgId: cropInfo.cropBgId,
      stats,
    };
  }

  function setTierColours(toneId, isFailure) {
    const varBase = isFailure ? '--fail-' : '--tier-';
    const scoped = getComputedStyle($('screen-end'));
    const color  = scoped.getPropertyValue(varBase + toneId + '-color').trim();
    const border = scoped.getPropertyValue(varBase + toneId + '-border').trim();
    $('end-cine-title').style.color = color || '';
    $('end-report-title').style.color = color || '';
    $('end-report-card').style.borderColor = border || '';
  }

  function renderScorePanel(stats, show) {
    const panel = $('end-report-score');
    if (!show) { panel.style.display = 'none'; return; }
    panel.style.display = 'flex';

    const pips = $('end-crew-pips');
    pips.innerHTML = '';
    const launched = Math.max(STATE.startCrew != null ? STATE.startCrew : stats.crew, stats.crew);
    for (let i = 0; i < launched; i++) {
      const p = document.createElement('div');
      p.className = 'crew-pip ' + (i < stats.crew ? 'filled' : 'empty');
      pips.appendChild(p);
    }
    $('end-crew-val').textContent = stats.crew + ' / ' + launched;

    const bars = $('end-res-bars');
    bars.innerHTML = '';
    const res = [
      { key: 'fuel', label: 'FUEL', pct: stats.fuel },
      { key: 'food', label: 'FOOD', pct: stats.food },
      { key: 'water', label: 'H2O', pct: stats.water },
      { key: 'hull', label: 'HULL', pct: stats.hull },
    ];
    for (const r of res) {
      const wrap = document.createElement('div');
      wrap.className = 'res-bar-wrap';
      wrap.innerHTML =
        `<div class="res-bar-label">${r.label}</div>` +
        `<div class="res-bar"><div class="res-bar-fill ${r.key}" style="width:${clamp(r.pct, 0, 100)}%"></div></div>`;
      bars.appendChild(wrap);
    }

    const delta = stats.baseDays - stats.days;
    const nDays = n => n + (n === 1 ? ' DAY' : ' DAYS');
    let cmp, cmpClass;
    // A failure never arrived: "N days early" read as praise.
    if (stats.failed) { cmp = 'THE VOYAGE ENDED HERE'; cmpClass = 'late'; }
    else if (delta > 0) { cmp = nDays(delta) + ' EARLY'; cmpClass = 'early'; }
    else if (delta < 0) { cmp = nDays(-delta) + ' LATE'; cmpClass = 'late'; }
    else { cmp = 'ON TIME'; cmpClass = ''; }
    $('end-day-line').innerHTML =
      `DAY <span class="day-num">${stats.days}</span> OF ${stats.baseDays} · <span class="day-cmp ${cmpClass}">${cmp}</span>`;
  }

  let currentView = null;

  function renderCinematic(view) {
    const scene = $('end-scene');
    if (view.category === 'arrival') {
      scene.style.backgroundImage = `url("${sceneBgPath(view.trail, view.cropBgId)}")`;
      scene.classList.add('show');
    } else {
      scene.style.backgroundImage = '';
      scene.classList.remove('show');
    }
    setTierColours(view.toneId, view.category === 'failure');

    $('end-cine-title').textContent = view.title;
    const titleSize = view.category === 'failure' ? FAILURE_TITLE_SIZE : 28;
    $('screen-end').style.setProperty('--cine-title-size', titleSize + 'px');
    const p = view.category === 'failure' ? FAILURE_CENTRE : (DEST_PLACEMENT[view.trail] || FAILURE_CENTRE);
    $('screen-end').style.setProperty('--cine-x', p.x + 'px');
    $('screen-end').style.setProperty('--cine-y', p.y + 'px');

    const btn = $('end-cine-btn');
    const btn2 = $('end-cine-btn2');
    const bodyEl = $('end-cine-body');
    const quoteEl = $('end-cine-quote');
    if (view.showReport) {
      btn.textContent = 'View Report';
      btn.onclick = window.showEndReport;
      bodyEl.style.display = 'none';
      quoteEl.style.display = 'none';
      paintRecord('end-cine-quote', null); // arrivals show it on the report card
    } else {
      btn.textContent = 'New Run';
      btn.onclick = () => { if (typeof clearSave === 'function') clearSave(); location.reload(); };
      bodyEl.textContent = view.body || '';
      bodyEl.style.display = view.body ? 'block' : 'none';
      if (view.quote) { quoteEl.textContent = view.quote; quoteEl.style.display = 'block'; }
      else quoteEl.style.display = 'none';
      paintRecord('end-cine-quote', view.record); // failures: the record sits under the epitaph
    }
    // continue_option (authored on the failure module, e.g. crop_dead's
    // "Keep flying"): the run isn't over unless the player says so.
    // Same button slot serves no_fuel's emergency beacon (the two never
    // coexist on one failure module).
    if (view.continueOption) {
      btn2.textContent = view.continueOption.text || 'Keep Flying';
      btn2.style.display = '';
      btn2.onclick = window.endContinueRun;
    } else if (view.beaconOption) {
      btn2.textContent = 'Trigger the Emergency Beacon';
      btn2.style.display = '';
      btn2.onclick = window.endTriggerBeacon;
    } else {
      btn2.style.display = 'none';
      btn2.onclick = null;
    }

    $('end-report').classList.remove('show');
    $('end-cinematic').classList.add('show');
  }

  // Ship's Record block — under the failure epitaph on the cinematic, on
  // the report card for arrivals.
  function paintRecord(anchorId, lines) {
    const anchor = $(anchorId);
    if (!anchor) return;
    let box = document.getElementById(anchorId + '-record');
    if (!box) { box = document.createElement('div'); box.id = anchorId + '-record'; box.className = 'end-record'; anchor.insertAdjacentElement('afterend', box); }
    box.innerHTML = '';
    box.style.display = (lines && lines.length) ? '' : 'none';
    if (!lines || !lines.length) return;
    const h = document.createElement('div'); h.className = 'end-record-title'; h.textContent = "SHIP'S RECORD"; box.appendChild(h);
    for (const l of lines) { const d = document.createElement('div'); d.className = 'end-record-line'; d.textContent = '— ' + l; box.appendChild(d); }
  }

  function renderReport(view) {
    $('end-report-title').textContent = view.reportTitle || view.title;
    $('end-report-body').textContent = view.body;
    const qEl = $('end-report-quote');
    if (view.quote) { qEl.style.display = 'block'; qEl.textContent = view.quote; }
    else qEl.style.display = 'none';
    paintRecord('end-report-quote', view.record);
    renderScorePanel(view.stats, view.showReport);
    $('end-report').classList.add('show');
  }

  /* ── Entry points ─────────────────────────────────────────── */
  window.renderEndScreen = function (end) {
    currentView = buildEndView(end);
    renderCinematic(currentView);
    showScreen('screen-end');
  };
  window.showEndReport = function () {
    // Reading the report accepts the ending (owner ruling 2026-10-10) — a
    // resumable failure's pending save goes now, and so does the way on:
    // Back no longer offers Keep flying / the beacon (it used to, and a
    // reload then lost a run the screen still said could continue).
    if (typeof clearSave === 'function') clearSave();
    STATE._resumableEnd = false;
    const b2 = $('end-cine-btn2');
    if (b2) { b2.style.display = 'none'; b2.onclick = null; }
    if (currentView) renderReport(currentView);
  };
  window.endBackToCinematic = function () {
    $('end-report').classList.remove('show');
  };

  /* Trigger the emergency beacon from the no_fuel failure screen —
     items.json's own authored contract: "Triggers rescue event —
     rescue may be friendly, hostile, or corporate." One use; who
     answers is a roll. Every rescue refuels enough to keep flying;
     the difference is what it costs. */
  window.endTriggerBeacon = function () {
    if (!currentView || !currentView.beaconOption) return;
    const idx = STATE.items.indexOf('emergency_beacon');
    if (idx < 0) return;
    STATE.items.splice(idx, 1); // one use, consumed regardless of who answers
    STATE.ended = false;

    const roll = Math.random();
    let logLines;
    if (roll < 0.45) { // friendly — a hauler with fuel and no agenda
      STATE.resources.fuel = clamp(STATE.resources.fuel + 25, 0, resMax('fuel'));
      STATE.resources.morale = clamp(STATE.resources.morale + 4, 0, 100);
      logLines = ['◆ BEACON ANSWERED — a long-hauler heard you. Fuel transferred, no charge. "Pass it on," they said, and burned off.'];
    } else if (roll < 0.80) { // corporate — rescue with an invoice
      const fee = Math.min(STATE.goldAmount, 25);
      STATE.goldAmount -= fee;
      STATE.resources.fuel = clamp(STATE.resources.fuel + 25, 0, resMax('fuel'));
      STATE.resources.morale = clamp(STATE.resources.morale - 2, 0, 100);
      logLines = ['◆ BEACON ANSWERED — a StellarAssist™ recovery tug. Fuel delivered, ' + fee + ' gold invoiced, satisfaction survey transmitted before the fuel line detached.'];
    } else { // hostile — rescue, in the pirate sense
      STATE.goldAmount = Math.floor(STATE.goldAmount / 2);
      if (STATE.items.length) STATE.items.splice(Math.floor(Math.random() * STATE.items.length), 1);
      STATE.resources.fuel = clamp(STATE.resources.fuel + 20, 0, resMax('fuel'));
      STATE.resources.morale = clamp(STATE.resources.morale - 5, 0, 100);
      logLines = ['◆ BEACON ANSWERED — by the wrong people. They refueled you, then "salvaged" half your gold and a crate at gunpoint. "Rescue fee," they called it. You are alive to resent it.'];
    }

    $('end-cinematic').classList.remove('show');
    if (typeof window.pushCruiseLog === 'function') logLines.forEach(l => window.pushCruiseLog(l));
    resumeAfterFailure();
  };

  /* Pressing on from a non-terminal failure: any OTHER failure that
     landed at the same moment (hull 0, mutiny, deprivation…) still
     ends the run; reaching the destination still arrives (the failure
     fired on the final leg, before triggerArrival); else back to hub. */
  function resumeAfterFailure() {
    renderHUD();
    const node = STATE.byId && STATE.byId[STATE.currentId];
    const arriving = !!node && connectionsOf(node).length === 0;
    if (checkFailure({ arriving })) return;
    if (arriving) { triggerArrival(node); return; }
    returnToHub();
  }

  /* Accept a non-terminal failure (continue_option) and press on.
     Sets crop_death_accepted so checkFailure() won't re-fire crop_dead
     on the next resource mutation, un-ends the run, shows the authored
     continue narrative in the hub log, and returns to the hub. */
  window.endContinueRun = function () {
    if (!currentView || !currentView.continueOption) return;
    STATE.ended = false;
    STATE.flags.add('crop_death_accepted');
    const narrative = currentView.continueOption.narrative;
    $('end-cinematic').classList.remove('show');
    if (narrative && typeof window.pushCruiseLog === 'function') window.pushCruiseLog('◆ ' + narrative);
    resumeAfterFailure();
  };

})();
