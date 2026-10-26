'use strict';
/* ────────────────────────────────────────────────────────────────
   RECORDS — run history and best scores (owner ruling 89, 2026-10-15).

   Every finished run is written to localStorage (RECORDS_KEY, apart from
   the run save, so a new run never clears it): arrivals with their tier
   and score, failures with how the voyage ended. The last RECORDS_KEEP
   runs are kept, newest first; each destination's best arrival (highest
   score, crop alive — the crop is the mission) is kept for good.
   The title screen's RECORDS button opens the panel; CLEAR RECORDS
   (confirmed) empties it. Tab stays inside the open panel; closing it
   (×, ESC, the backdrop) returns focus to RECORDS.

   A run is recorded once, when its ending is final: at once for an
   arrival or a terminal failure, and when the player accepts a failure
   that offered a way on (Keep flying, the beacon) by reading its report
   or starting a new run. Each finish is its own entry (id: art seed, day,
   result), so a save slot replayed to a different end adds one rather than
   overwriting the first; the same ending rendered twice stays one entry.
   NEW BEST only when the score beats the stored best. Arrivals carry the
   score scale they were scored on (SCORE_VERSION): only entries on the
   current scale count for a destination's best (ruling 99 rescored the
   arrivals); older ones stay in the history.
   ?debug= URLs record nothing, as they save nothing.

   Load-order note: loads before index.html's inline script; reads MOD /
   STATE only inside functions called later.
   ──────────────────────────────────────────────────────────────── */
(function () {
  const RECORDS_KEY = 'transplant_records_v1';
  const RECORDS_KEEP = 10;
  // The score scale an arrival was scored on: 2 since ruling 99 (the
  // trimmed deadlines, time in hand worth 100, per-trail brackets).
  // Entries without it were scored on the old scale.
  const SCORE_VERSION = 2;
  const DEST_LABEL = { lunar: 'LUNAR', mars: 'MARS', interstellar: 'FAR GARDEN' };
  const TIER_LABEL = { legendary: 'MADE IT', good: 'MOSTLY MADE IT', rough: 'BARELY MADE IT', pyrrhic: "NOBODY'S SURE", hollow: "MADE IT. IT DIDN'T" };
  const $ = id => document.getElementById(id);

  function blank() { return { runs: [], best: {} }; }
  function loadRecords() {
    try {
      const r = JSON.parse(localStorage.getItem(RECORDS_KEY));
      if (r && Array.isArray(r.runs) && r.best && typeof r.best === 'object') return r;
    } catch (_) {}
    return blank();
  }
  function saveRecords(r) {
    try { localStorage.setItem(RECORDS_KEY, JSON.stringify(r)); return true; } catch (_) { return false; }
  }
  function recordingOff() { return new URLSearchParams(location.search).has('debug'); }

  // The shown score: whole points, rounded down so it never reads past
  // the bracket it earned (124.6 is MOSTLY MADE IT, not 125).
  function runScore() { return Math.max(0, Math.floor(scoreValue())); }

  /* One finished run, from the end view endings.js built. `run` is STATE,
     or a save snapshot (the same fields) for a failure left pending. */
  function entryFor(view, run) {
    run = run || STATE;
    const arrival = view.category === 'arrival';
    const crop = run.crop || null;
    // One id per finish, not per run: a save slot replays the same run
    // (same art seed), and each finish is its own entry.
    // The same ending rendered twice (identical day and result) is one.
    return {
      id: [run.artSeed || 0, run.daysElapsed, view.toneId, arrival ? runScore() : 'x'].join(':'),
      ts: Date.now(),
      ship: run.shipName || 'The Ship',
      trail: run.trail,
      crop,
      cropAlive: !!(crop && run.cropGrowth && run.cropGrowth.health > 0),
      captain: run.captain || null,
      kind: arrival ? 'arrival' : 'failure',
      tone: view.toneId,                       // bracket, or failure_type
      title: arrival ? TIER_LABEL[view.toneId] || view.toneId : String(view.title || '').toUpperCase(),
      score: arrival ? runScore() : null,
      scoreVersion: arrival ? SCORE_VERSION : null,
      days: run.daysElapsed,
      baseDays: run.baseDays,
      crew: (run.crew || []).length,
      startCrew: run.startCrew != null ? run.startCrew : (run.crew || []).length,
    };
  }
  const currentScale = e => !!e && e.scoreVersion === SCORE_VERSION;
  const countsForBest = e => e.kind === 'arrival' && e.cropAlive && currentScale(e);
  const beats = (a, b) => !b || a.score > b.score || (a.score === b.score && a.days < b.days);

  /* Records a finished run. Returns { entry, newBest } (newBest: it is now
     its destination's best), or null when nothing was recorded. */
  function recordRun(view) {
    if (!view || recordingOff() || !STATE.trail) return null;
    return addEntry(entryFor(view));
  }
  function addEntry(e) {
    const r = loadRecords();
    r.runs = [e].concat(r.runs.filter(x => x.id !== e.id)).slice(0, RECORDS_KEEP);
    let newBest = false;
    if (countsForBest(e)) {
      const cur = currentScale(r.best[e.trail]) ? r.best[e.trail] : null; // an old-scale best is replaced
      if (!(cur && cur.id === e.id) && beats(e, cur)) { r.best[e.trail] = e; newBest = true; }
    }
    saveRecords(r);
    return { entry: e, newBest };
  }

  /* The saved voyage is about to be replaced (LAUNCH over it): a failure
     it left pending (Keep flying / the beacon, never taken) is final now,
     so it goes in the records as that failure. Its id matches the one the
     end screen would have recorded, so a run already recorded stays one. */
  function recordSavedFailure() {
    if (recordingOff()) return null;
    let snap = null;
    try { snap = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (_) {}
    const f = snap && snap.pendingFailure && snap.trail && (MOD.failures || []).find(x => x.id === snap.pendingFailure);
    if (!f) return null;
    const e = entryFor({ category: 'failure', toneId: f.failure_type, title: f.title }, snap);
    return loadRecords().runs.some(x => x.id === e.id) ? null : addEntry(e);
  }

  function clearRecords() { try { localStorage.removeItem(RECORDS_KEY); } catch (_) {} }
  const trailLabel = trail => DEST_LABEL[trail] || '';
  function hasRecords() { const r = loadRecords(); return r.runs.length > 0 || Object.keys(r.best).length > 0; }

  /* ── Panel ─────────────────────────────────────────────────── */
  const cropName = id => {
    const c = id && ((MOD.crops && MOD.crops.crops) || []).find(x => x.id === 'crop_' + id);
    return c ? c.name : (id ? id : 'No crop');
  };
  const captainName = id => id ? id.charAt(0).toUpperCase() + id.slice(1) : '';
  const fmtDate = ts => { try { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (_) { return ''; } };

  // The end screen's colour table (screen-end.css, scoped to this overlay too).
  const toneStyle = e => `color: var(--${e.kind === 'arrival' ? 'tier' : 'fail'}-${String(e.tone).replace(/[^a-z_]/g, '')}-color)`;

  function bestRow(trail, e) {
    if (!e) return `<div class="rec-best empty"><span class="rec-dest">${DEST_LABEL[trail]}</span><span class="rec-none">No arrival yet</span></div>`;
    return `<div class="rec-best"><span class="rec-dest">${DEST_LABEL[trail]}</span>` +
      `<span class="rec-score">${e.score}</span>` +
      `<span class="rec-what"><span class="rec-tone" style="${toneStyle(e)}">${escapeHTML(e.title)}</span>` +
      `<span class="rec-sub">${escapeHTML(e.ship)} · ${escapeHTML(cropName(e.crop))} · ${escapeHTML(captainName(e.captain))} · day ${e.days} of ${e.baseDays} · crew ${e.crew}/${e.startCrew}</span></span></div>`;
  }
  function runRow(e) {
    return `<div class="rec-run">` +
      `<span class="rec-date">${escapeHTML(fmtDate(e.ts))}</span>` +
      `<span class="rec-dest">${DEST_LABEL[e.trail] || escapeHTML(e.trail)}</span>` +
      `<span class="rec-tone" style="${toneStyle(e)}">${escapeHTML(e.title)}</span>` +
      `<span class="rec-score">${e.score == null ? '—' : e.score}</span>` +
      `<span class="rec-sub">${oldScale(e) ? '<span class="rec-old" title="Scored before the current scale: it never counts as a best">OLD SCALE</span> ' : ''}` +
      `${escapeHTML(e.ship)} · ${escapeHTML(cropName(e.crop))} · day ${e.days}</span></div>`;
  }
  // An arrival scored on the old scale (no scoreVersion: before ruling
  // 99's rescore) stays in the history, marked; it can't be a best.
  function oldScale(e) { return e.kind === 'arrival' && e.score != null && !currentScale(e); }

  function paintRecords() {
    const r = loadRecords();
    $('rec-best').innerHTML = ['lunar', 'mars', 'interstellar'].map(t => bestRow(t, currentScale(r.best[t]) ? r.best[t] : null)).join('');
    $('rec-runs').innerHTML = r.runs.length ? r.runs.map(runRow).join('') : '<div class="rec-none">No voyages finished yet.</div>';
    $('rec-runs-title').textContent = 'LAST ' + RECORDS_KEEP + ' VOYAGES';
    const clear = $('rec-clear');
    clear.disabled = !(r.runs.length || Object.keys(r.best).length);
    setConfirm(false);
  }
  function setConfirm(on) {
    $('rec-clear').style.display = on ? 'none' : '';
    $('rec-confirm').style.display = on ? '' : 'none';
  }
  function openRecords() {
    paintRecords();
    showOverlay('overlay-records');
    $('rec-x').focus({ preventScroll: true });
  }
  function closeRecords() {
    hideOverlay('overlay-records');
    refreshRecordsButton();
    const btn = $('btn-records'), title = $('screen-title');
    if (btn && title && title.classList.contains('active')) btn.focus({ preventScroll: true });
  }
  // The title menu shows the hint on its SHIP STATUS display (a tooltip
  // would sit flat over the perspective-mapped screen); its lamp is CSS.
  function refreshRecordsButton() {
    const btn = $('btn-records');
    if (!btn) return;
    const has = hasRecords();
    btn.classList.toggle('disabled', !has);
    btn.setAttribute('aria-disabled', String(!has));
    btn.dataset.hint = has ? 'Your voyages and best arrivals.' : 'Finish a voyage to start your records.';
  }
  // Tab and Shift+Tab cycle through the panel's own visible controls.
  function trapTab(e) {
    if (e.key !== 'Tab') return;
    const list = [...$('rec-card').querySelectorAll('button')].filter(b => !b.disabled && b.offsetParent !== null);
    if (!list.length) return;
    e.preventDefault();
    const i = list.indexOf(document.activeElement);
    list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length].focus();
  }

  function wire() {
    const btn = $('btn-records');
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => { if (hasRecords()) openRecords(); });
    $('rec-x').addEventListener('click', closeRecords);
    $('overlay-records').addEventListener('click', e => { if (e.target.id === 'overlay-records') closeRecords(); });
    $('overlay-records').addEventListener('keydown', trapTab);
    // Focus follows the confirm (the pressed button hides under it).
    $('rec-clear').addEventListener('click', () => { setConfirm(true); $('rec-no').focus(); });
    $('rec-no').addEventListener('click', () => { setConfirm(false); $('rec-clear').focus(); });
    $('rec-yes').addEventListener('click', () => { clearRecords(); paintRecords(); refreshRecordsButton(); $('rec-x').focus(); });
    // Same refresh rhythm as Continue: whenever the title buttons appear.
    const buttons = $('title-buttons');
    if (buttons) new MutationObserver(() => { if (buttons.classList.contains('visible')) refreshRecordsButton(); })
      .observe(buttons, { attributes: true, attributeFilter: ['class'] });
    refreshRecordsButton();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();

  Object.assign(window, {
    // engine API (endings.js)
    recordRun, recordSavedFailure, runScore,
    // the title menu (title.js): RECORDS' state, the save's destination
    hasRecords, refreshRecordsButton, trailLabel,
    // test hook: tools/tests/test_records.js reads the stored records
    loadRecords, SCORE_VERSION,
  });
})();
