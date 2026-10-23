'use strict';
/* ────────────────────────────────────────────────────────────────
   ENDINGS / FAILURES SCREEN — Phase 6. Migrated from resources/
   demo-endings.html's two-screen cinematic+report flow, per
   GAME_BIBLE.md §17.

   Scope notes (see ENGINE_INTEGRATION_HANDOFF.md for the full
   Phase 6 rundown):
   - The demo's ARRIVAL_BODY (destination × crop) and TIER_QUOTE tables
     now live in endings.json's arrival_lines section (MOD.endingLines):
     an arrival report leads with its line and closes
     with its tier quote.
   - The demo's TITLES/FAILURES tables were
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
     back to the generic CROP_*_DEFAULT if the entry has none (shouldn't
     happen post-setup, but avoids a crash on the ?debug=fixed_path
     loop which doesn't run the setup wizard). Returns 'dead' with no
     crop selected at all, matching the bg matrix's 'noplant' case. */
  function resolveCropStatus() {
    if (!STATE.crop) return { status: 'dead', cropBgId: 'noplant' };
    const cropDef = (MOD.crops && MOD.crops.crops || []).find(c => c.id === 'crop_' + STATE.crop);
    const health = (STATE.cropGrowth && STATE.cropGrowth.health) || 0;
    const healthyAt = (cropDef && cropDef.healthy_threshold) || CROP_HEALTHY_DEFAULT;
    const sickAt    = (cropDef && cropDef.sick_threshold) || CROP_SICK_DEFAULT;
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

  // {passengers} (names joined "A", "A and B", "A, B and C"), {is_are},
  // {passenger_count} ("one very quiet passenger" / "two very quiet passengers").
  function passengerText(names) {
    const list = names.length < 2 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    const words = ['one', 'two', 'three', 'four', 'five'];
    const count = (words[names.length - 1] || String(names.length)) + ' very quiet passenger' + (names.length > 1 ? 's' : '');
    return str => String(str).replace(/\{passengers\}/g, list).replace(/\{is_are\}/g, names.length > 1 ? 'are' : 'is')
      .replace(/\{passenger_count\}/g, count);
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
      morale: crewMoraleAvg(), // crew average; null = no crew aboard (owner ruling 15)
      soil:  STATE.soilSurveys || 0,
      cropBonus: (() => { // crops.json arrival_bonus, as scoreValue applies it
        const meta = (MOD.crops && MOD.crops.crops || []).find(c => c.id === 'crop_' + STATE.crop);
        const ab = meta && meta.arrival_bonus;
        return (ab && ab.ending_score_modifier && STATE.cropGrowth && STATE.cropGrowth.health > (ab.health_condition || 0)) ? ab.ending_score_modifier : 1;
      })(),
      days:  STATE.daysElapsed,
      baseDays: STATE.baseDays,
      failed: end.kind === 'failure',
      // The arrival's score (ruling 89; index.html scoreValue, whole points).
      score: end.kind === 'failure' || typeof runScore !== 'function' ? null : runScore(),
    };

    // Ship's Record — the voyage's notable choices (index.html shipsRecordLines).
    const record = shipsRecordLines(5);

    if (end.kind === 'failure') {
      const f = end.module;
      // A failure can author its passengers-aboard copy (crew_gone: the
      // captain dies alone but a stowaway or a rescued survivor still rides
      // along — "no living crew" alone would erase them).
      const riders = typeof passengerNames === 'function' ? passengerNames() : [];
      const ride = riders.length && f.body_passengers ? passengerText(riders) : null;
      const body = ride ? ride(f.body_passengers) : f.body;
      const epitaph = ride && f.epitaph_passengers ? ride(f.epitaph_passengers) : f.epitaph;
      return {
        category: 'failure',
        toneId: f.failure_type,
        title: f.title,
        body,
        // The report card leads with the body's first paragraph (Bible §17
        // "title + body sentence"); the rest waits behind the expander.
        lead: firstPara(body),
        rest: restParas(body),
        record,
        quote: epitaph ? `— ${epitaph}` : null,
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

    // demo-endings ARRIVAL_BODY + TIER_QUOTE, authored in endings.json's
    // arrival_lines section (MOD.endingLines): the destination × crop
    // lead line under the report title, and the bracket's closing quote.
    const lines = MOD.endingLines || {};
    const cropKey = cropInfo.status === 'dead' || !STATE.crop ? 'noplant' : STATE.crop;
    // Each is a list (ruling 88); one per run, seeded on STATE.artSeed so
    // a reload shows the same line. A plain string still reads as one.
    const onePerRun = (key, v) => !Array.isArray(v) ? v
      : (window.SceneArt && SceneArt.stablePick ? SceneArt.stablePick(key, v) : v[0]);
    const arrival = onePerRun('arrival:' + STATE.trail + ':' + cropKey, ((lines.arrival_lines || {})[STATE.trail] || {})[cropKey]) || '';

    return {
      record,
      category: 'arrival',
      toneId: bracket,
      title: TITLES[bracket],
      reportTitle: m.title,
      arrival: arrival.replaceAll('{day}', stats.days),
      body,
      quote: onePerRun('quote:' + bracket, (lines.tier_quotes || {})[bracket]) || null,
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
      { key: 'morale', label: 'MO', pct: stats.morale },
    ].filter(r => r.pct != null); // no crew aboard: no morale bar (owner ruling 15)
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
    // Ruling 89: an arrival shows its score, and says when it is the
    // destination's new best (records.js).
    const scoreBit = stats.score == null ? '' : ` · SCORE <span class="day-score">${stats.score}</span>` +
      (currentView && currentView.recorded && currentView.recorded.newBest ? ' <span class="day-best">NEW BEST</span>' : '') +
      // A dead crop's arrival scores the voyage, not the mission: say so
      // beside the number (it never counts as a best, records.js).
      (currentView && currentView.toneId === 'hollow' ? ' <span class="day-cmp late">CROP LOST</span>' : '');
    $('end-day-line').innerHTML =
      `DAY <span class="day-num">${stats.days}</span> OF ${stats.baseDays} · <span class="day-cmp ${cmpClass}">${cmp}</span>` + scoreBit +
      // The rest of what the score counts (index.html scoreValue). A
      // failure has no score, so no score extras either.
      (!stats.failed && (stats.soil || stats.cropBonus > 1) ? '<span class="score-extras">' + [
        stats.soil ? 'SOIL SURVEYS +' + stats.soil * 2 : '',
        stats.cropBonus > 1 ? 'CROP BONUS +' + Math.round((stats.cropBonus - 1) * 100) + '%' : '',
      ].filter(Boolean).join(' · ') + '</span>' : '');
  }

  let currentView = null;

  function renderCinematic(view) {
    const scene = $('end-scene');
    // The scene fades in (360ms) — but only if .show lands AFTER the
    // screen is displayed: added while #screen-end was display:none, the
    // transition had no start state and never played.
    // revealScene() adds it once the screen is up.
    scene.classList.remove('show');
    if (view.category === 'arrival') {
      scene.style.backgroundImage = `url("${sceneBgPath(view.trail, view.cropBgId)}")`;
    } else {
      scene.style.backgroundImage = '';
    }
    $('screen-end').classList.toggle('is-failure', view.category === 'failure');
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
      btn.onclick = showEndReport;
      bodyEl.style.display = 'none';
      quoteEl.style.display = 'none';
      paintRecord('end-cine-quote', null); // arrivals show it on the report card
    } else {
      btn.textContent = 'New Run';
      btn.onclick = () => { recordFinal(); clearSave(); location.reload(); };
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
      btn2.onclick = endContinueRun;
    } else if (view.beaconOption) {
      btn2.textContent = 'Trigger the Emergency Beacon';
      btn2.style.display = '';
      btn2.onclick = endTriggerBeacon;
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

  /* Report card — owner ruling 31 (2026-10-12), demo-endings
     renderReport: the tier stinger (MADE IT…) or the failure's title in
     its colour, ONE lead line (the destination × crop arrival line; a
     failure's first paragraph), the quote and the Run Report, all in view
     at the demo's card size. The module's paragraphs (an arrival's colony
     report, a failure's remaining paragraphs) and the Ship's Record wait
     behind READ THE COLONY REPORT, collapsed on every visit. */
  function firstPara(t) { return String(t || '').split(/\n\s*\n/)[0].trim(); }
  function restParas(t) { return String(t || '').split(/\n\s*\n/).slice(1).join('\n\n').trim(); }
  function renderReport(view) {
    const arrival = view.category === 'arrival';
    $('end-report-title').textContent = view.title;
    const lead = arrival ? (view.arrival || firstPara(view.body)) : view.lead;
    const fullBody = arrival ? (view.arrival ? view.body : restParas(view.body)) : view.rest;
    const arrEl = $('end-report-arrival');
    arrEl.textContent = lead || ''; arrEl.style.display = lead ? 'block' : 'none';
    const qEl = $('end-report-quote');
    if (view.quote) { qEl.style.display = 'block'; qEl.textContent = view.quote; }
    else qEl.style.display = 'none';
    renderScorePanel(view.stats, view.showReport);
    // Behind the expander: the module's own title (an arrival's "Colony
    // Report Filed"), its paragraphs, then the Ship's Record.
    $('end-report-full-title').textContent = arrival ? (view.reportTitle || '') : '';
    $('end-report-full-title').style.display = arrival && view.reportTitle ? '' : 'none';
    $('end-report-body').textContent = fullBody || '';
    $('end-report-body').style.display = fullBody ? '' : 'none';
    paintRecord('end-report-body', view.record);
    const hasMore = !!(fullBody || (view.record && view.record.length));
    const more = $('end-report-more');
    more.dataset.label = arrival ? 'READ THE COLONY REPORT' : 'READ THE FULL REPORT';
    more.style.display = hasMore ? '' : 'none';
    setReportExpanded(false);
    $('end-report-scroll').scrollTop = 0;
    $('end-report').classList.add('show');
  }
  function setReportExpanded(open) {
    const more = $('end-report-more'), full = $('end-report-full');
    full.hidden = !open;
    more.setAttribute('aria-expanded', open ? 'true' : 'false');
    const label = more.dataset.label;
    more.textContent = open ? label.replace(/^READ /, 'HIDE ') + ' ▴' : label + ' ▾';
    // Opened: bring the report's first line up into view (the card caps
    // at the frame; its text scrolls, Back / New Run stay at its foot).
    if (open) { const sc = $('end-report-scroll'); sc.scrollTop = Math.max(0, full.offsetTop - sc.offsetTop - 8); }
  }
  {
    const more = document.getElementById('end-report-more');
    if (more) more.addEventListener('click', () => setReportExpanded(document.getElementById('end-report-full').hidden));
  }

  /* ── Entry points ─────────────────────────────────────────── */
  function revealScene(view) {
    const scene = $('end-scene');
    void scene.offsetWidth; // flush the opacity:0 start state
    if (view.category === 'arrival') scene.classList.add('show');
  }

  /* demo-endings star drift: two slow parallax layers, no acceleration.
     Runs only while the end screen is up; idles under the pause menu. */
  const STAR_W = 960, STAR_H = 640;
  const starLayers = [
    { count: 80, speed: 0.06, size: 1, alpha: 0.55, xs: [], ys: [] },
    { count: 40, speed: 0.14, size: 2, alpha: 0.85, xs: [], ys: [] },
  ];
  for (const L of starLayers) for (let i = 0; i < L.count; i++) { L.xs.push(Math.random() * STAR_W); L.ys.push(Math.random() * STAR_H); }
  let starLast = 0, starRunning = false;
  function drawStars(now) {
    const cv = $('end-stars'), scr = $('screen-end');
    if (!cv || !scr || !scr.classList.contains('active')) { starRunning = false; return; }
    if (window.PauseBus && PauseBus.paused) { starLast = now; requestAnimationFrame(drawStars); return; }
    let dt = starLast ? (now - starLast) / 16.6667 : 1;
    if (dt > 3) dt = 3;
    starLast = now;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, STAR_W, STAR_H);
    for (const L of starLayers) {
      ctx.fillStyle = 'rgba(255,255,255,' + L.alpha + ')';
      const half = L.size / 2;
      for (let i = 0; i < L.count; i++) {
        let x = L.xs[i] + L.speed * dt;
        if (x > STAR_W) { x = 0; L.ys[i] = Math.random() * STAR_H; }
        L.xs[i] = x;
        ctx.fillRect((x - half) | 0, (L.ys[i] - half) | 0, L.size, L.size);
      }
    }
    requestAnimationFrame(drawStars);
  }
  function startStars() { if (starRunning) return; starRunning = true; starLast = 0; requestAnimationFrame(drawStars); }

  /* Ruling 89: the run goes in the records once its ending is final — at
     once, unless it offers a way on (Keep flying, the beacon); then when
     the player accepts it (reads the report, or starts a new run). */
  function recordFinal() {
    if (!currentView || currentView.recorded || typeof recordRun !== 'function') return;
    currentView.recorded = recordRun(currentView) || { newBest: false };
  }
  function renderEndScreen(end) {
    currentView = buildEndView(end);
    if (!currentView.continueOption && !currentView.beaconOption) recordFinal();
    renderCinematic(currentView);
    showScreen('screen-end');
    revealScene(currentView);
    startStars();
  }
  function showEndReport() {
    // Reading the report accepts the ending (owner ruling 2026-10-10) — a
    // resumable failure's pending save goes now, and so does the way on:
    // Back no longer offers Keep flying / the beacon (it used to, and a
    // reload then lost a run the screen still said could continue).
    clearSave();
    STATE._resumableEnd = false;
    const b2 = $('end-cine-btn2');
    if (b2) { b2.style.display = 'none'; b2.onclick = null; }
    recordFinal();
    if (currentView) renderReport(currentView);
  }
  function endBackToCinematic() {
    $('end-report').classList.remove('show');
  }

  /* Trigger the emergency beacon from the no_fuel failure screen —
     items.json's own authored contract: "Triggers rescue event —
     rescue may be friendly, hostile, or corporate." One use; who
     answers is a roll. Every rescue refuels enough to keep flying;
     the difference is what it costs. */
  function endTriggerBeacon() {
    if (!currentView || !currentView.beaconOption) return;
    const idx = STATE.items.indexOf('emergency_beacon');
    if (idx < 0) return;
    STATE.items.splice(idx, 1); // one use, consumed regardless of who answers
    STATE.ended = false;

    const roll = Math.random();
    let logLines;
    if (roll < 0.45) { // friendly — a hauler with fuel and no agenda
      STATE.resources.fuel = clamp(STATE.resources.fuel + 25, 0, resMax('fuel'));
      addCrewMorale(4); // every crew member
      logLines = ['◆ BEACON ANSWERED — a long-hauler heard you. Fuel transferred, no charge. "Pass it on," they said, and burned off.'];
    } else if (roll < 0.80) { // corporate — rescue with an invoice
      const fee = Math.min(STATE.goldAmount, 25);
      STATE.goldAmount -= fee;
      STATE.resources.fuel = clamp(STATE.resources.fuel + 25, 0, resMax('fuel'));
      addCrewMorale(-2);
      logLines = ['◆ BEACON ANSWERED — a StellarAssist™ recovery tug. Fuel delivered, ' + fee + ' gold invoiced, satisfaction survey transmitted before the fuel line detached.'];
    } else { // hostile — rescue, in the pirate sense
      STATE.goldAmount = Math.floor(STATE.goldAmount / 2);
      if (STATE.items.length) removeRandomItem();
      STATE.resources.fuel = clamp(STATE.resources.fuel + 20, 0, resMax('fuel'));
      addCrewMorale(-5);
      logLines = ['◆ BEACON ANSWERED — by the wrong people. They refueled you, then "salvaged" half your gold and a crate at gunpoint. "Rescue fee," they called it. You are alive to resent it.'];
    }

    $('end-cinematic').classList.remove('show');
    logLines.forEach(l => window.pushCruiseLog(l));
    resumeAfterFailure();
  }

  /* Pressing on from a non-terminal failure: any OTHER failure that
     landed at the same moment (hull 0, mutiny, deprivation…) still
     ends the run; reaching the destination still arrives (the failure
     fired on the final leg, before triggerArrival); a stop the failure
     interrupted on the way in still plays (STATE.pendingArrival); else
     back to hub. */
  function resumeAfterFailure() {
    renderHUD();
    const node = STATE.byId && STATE.byId[STATE.currentId];
    const arriving = !!node && connectionsOf(node).length === 0;
    if (checkFailure({ arriving })) return;
    if (arriving) { triggerArrival(node); return; }
    // The failure stopped the leg before the stop played: play it now (its
    // event, or the station approach), never skipped.
    const pa = STATE.pendingArrival;
    if (pa && node && pa.id === node.id) { arriveAtNode(node, { skipEvent: pa.skipEvent }); return; }
    returnToHub();
  }

  /* Accept a non-terminal failure (continue_option) and press on.
     Sets crop_death_accepted so checkFailure() won't re-fire crop_dead
     on the next resource mutation, un-ends the run, shows the authored
     continue narrative in the hub log, and returns to the hub. */
  function endContinueRun() {
    if (!currentView || !currentView.continueOption) return;
    STATE.ended = false;
    STATE.flags.add('crop_death_accepted');
    const narrative = currentView.continueOption.narrative;
    $('end-cinematic').classList.remove('show');
    if (narrative) window.pushCruiseLog('◆ ' + narrative);
    resumeAfterFailure();
  }

  Object.assign(window, {
    // engine API
    renderEndScreen, endBackToCinematic,
    // test hooks: tools/tests drive and read these through page.evaluate
    showEndReport, endContinueRun,
  });
})();
