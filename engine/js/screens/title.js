'use strict';
/* ────────────────────────────────────────────────────────────────
   TITLE — the observation-deck menu (ruling 113). Styles:
   resources/screen-title.css.

   poster → intro → menu → departing → departed
   A key or click dismisses the poster; once it has faded the two painted
   terminal displays power on and the intro types (a key or click shows it
   whole). The menu is three real buttons on the upper display — NEW GAME,
   CONTINUE, RECORDS (ruling 89) — and SHIP STATUS on the lower one. NEW
   GAME and CONTINUE play the departure (skippable), then hand over to
   startNewGame() / loadRun(); RECORDS opens the records panel
   (engine/js/screens/records.js). Coming back (setup's BACK) shows the
   menu again.

   The menu is live HTML mapped onto the painting's displays: each display
   is a flat box carried by a matrix3d homography onto its measured corners,
   so text, focus ring and hit-testing all follow the screen's perspective.
   The painting itself never moves; the only motion outside the displays is
   three station navigation lights (CSS opacity). No frame loop runs.

   Skip safety: the key that dismisses the poster can't also skip the intro;
   a skip brings the menu up under the pointer and the caret, so the buttons
   arm a beat later (a double-click or a held Enter never runs into NEW GAME).
   ──────────────────────────────────────────────────────────────── */
(function () {
  const $ = id => document.getElementById(id);
  const scr = $('screen-title');

  const TAGLINES = ['Earth is dying.', 'You have a ship, a crop, and a plan.', 'The plan is not good.'];
  const TYPE_SPEED_MS = 50, LINE_PAUSE_MS = 800;
  const POSTER_FADE_MS = 600;  // input can't skip the intro until the poster is gone
  // The displays power on at 0.60–1.15 s (upper) and 0.72–1.27 s (lower);
  // the first letter follows the lower one by a beat (≈1.30 s).
  const AFTER_POWER_ON_MS = 30;
  const POWER_ON_FALLBACK_MS = 1600; // if the power-on never reports its end
  const ARM_MS = 400;
  const DEPART_MS = 2400;      // displays power down (0.55–1.45 s), the frame fades (1.32–2.28 s)
  const REDUCED_DEPART_MS = 450;

  /* Registration (stage px = source px / 1.6): each quad is the painted
     display's dark glass, corners TL, TR, BR, BL, from straight-line fits to
     the master's bezel edges (RMS ≤ 0.5 source px); size is the plane's own
     box, so 1 css px ≈ 1 stage px at the near (left) edge. */
  const DISPLAYS = {
    upper: { quad: [[84.48, 96.95], [296.31, 144.90], [295.07, 368.47], [80.98, 357.34]], size: [214, 260] },
    lower: { quad: [[82.64, 368.60], [292.42, 378.12], [291.49, 447.61], [81.49, 447.98]], size: [210, 79] },
  };

  // Homography taking the plane's box (0,0)-(w,h) onto quad TL,TR,BR,BL.
  function homography(w, h, quad) {
    const src = [[0, 0], [w, 0], [w, h], [0, h]];
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = quad[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    for (let c = 0; c < 8; c++) { // Gauss-Jordan with partial pivoting
      let p = c;
      for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    return b.map((v, i) => v / A[i][i]); // h0..h7, h8 = 1
  }
  const toMatrix3d = h => 'matrix3d(' + [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, 1].map(n => +n.toFixed(8)).join(',') + ')';
  const H_ = {};
  function mapPoint(name, x, y) { // plane px -> stage px
    const h = H_[name], d = h[6] * x + h[7] * y + 1;
    return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
  }
  for (const name in DISPLAYS) {
    const D = DISPLAYS[name], el = $('title-disp-' + name), [w, h] = D.size;
    el.style.width = w + 'px'; el.style.height = h + 'px';
    H_[name] = homography(w, h, D.quad);
    el.style.transform = toMatrix3d(H_[name]);
  }

  /* ── Stage, motion, liveness ─────────────────────────────────── */
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(mq && mq.matches);
  const onScreen = () => scr.classList.contains('active');
  let stage = 'poster';
  function setStage(s) {
    stage = s;
    scr.dataset.stage = s;
    if (s !== 'intro') scr.classList.remove('power-on');
    $('title-buttons').classList.toggle('visible', s === 'menu');
    syncLive();
  }
  // CSS motion runs only while the title is the screen on show, the tab is
  // visible and the pause terminal is shut; reduced motion turns it off.
  function syncLive() {
    scr.classList.toggle('live', onScreen() && !document.hidden && !PauseBus.paused);
    scr.classList.toggle('rm', reduced());
    // A departure doesn't wait out a hidden tab: it lands at once.
    if (stage === 'departing' && document.hidden) finishDeparture();
  }
  document.addEventListener('visibilitychange', syncLive);
  PauseBus.onChange(syncLive);
  if (mq && mq.addEventListener) mq.addEventListener('change', syncLive);

  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  /* ── Poster → intro ──────────────────────────────────────────── */
  let introStarting = false;
  let stopPowerOnWait = null;
  function dismissPoster() {
    introStarting = true;
    scr.classList.add('power-on');
    setStage('intro');
    later(() => { introStarting = false; }, reduced() ? 200 : POSTER_FADE_MS);
    if (reduced()) { later(playIntro, 200); return; }
    // Type once the lower display has actually finished powering on (its
    // animation, not a guess at it), with a timer as the backstop.
    const lower = document.querySelector('#title-disp-lower .inner');
    const onEnd = e => { if (e.target === lower && e.animationName === 'title-crt-on') start(); };
    stopPowerOnWait = () => { lower.removeEventListener('animationend', onEnd); stopPowerOnWait = null; };
    const start = () => { if (!stopPowerOnWait) return; stopPowerOnWait(); if (stage === 'intro') playIntro(AFTER_POWER_ON_MS); };
    lower.addEventListener('animationend', onEnd);
    later(start, POWER_ON_FALLBACK_MS);
  }
  function setTag(i, text) { $(['title-tagline', 'title-tagline-2', 'title-tagline-3'][i]).textContent = text; }
  function typewrite(i, text, speed, onDone) {
    const el = $(['title-tagline', 'title-tagline-2', 'title-tagline-3'][i]);
    el.textContent = '';
    const span = document.createElement('span');
    const cur = document.createElement('span');
    cur.className = 'tw-cursor';
    el.append(span, cur);
    let n = 0;
    (function tick() {
      if (n < text.length) { span.textContent += text[n++]; later(tick, speed); }
      else { cur.remove(); if (onDone) onDone(); }
    })();
  }
  function playIntro(beat = 400) {
    clearTimers();
    [0, 1, 2].forEach(i => setTag(i, ''));
    if (reduced()) { // lines appear whole, one beat each
      TAGLINES.forEach((t, i) => later(() => setTag(i, t), 300 + i * 700));
      later(showMenu, 300 + 3 * 700 + 600);
      return;
    }
    later(() => typewrite(0, TAGLINES[0], TYPE_SPEED_MS, () =>
      later(() => typewrite(1, TAGLINES[1], TYPE_SPEED_MS, () =>
        later(() => typewrite(2, TAGLINES[2], TYPE_SPEED_MS + 10, () => later(showMenu, 900)), LINE_PAUSE_MS)), LINE_PAUSE_MS)), beat);
  }
  function finishIntro() {
    TAGLINES.forEach((t, i) => setTag(i, t));
    showMenu();
  }

  /* ── Menu: eligibility from the game's own rules ─────────────── */
  const btns = () => Array.from(document.querySelectorAll('#title-buttons .title-btn'));
  let armedAt = 0;
  const armed = () => stage === 'menu' && performance.now() >= armedAt;
  let elig = { save: false, where: '', records: false };
  function readEligibility() {
    // hasSave() is the game's: it also clears a save it can't resume.
    const save = typeof hasSave === 'function' && hasSave();
    let where = '';
    if (save) {
      let snap = null;
      try { snap = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (_) {}
      const dest = snap && window.trailLabel ? trailLabel(snap.trail) : '';
      if (dest) where = dest + (Number.isFinite(snap.daysElapsed) ? ', day ' + snap.daysElapsed : '');
    }
    elig = { save, where, records: !!(window.hasRecords && hasRecords()) };
    return elig;
  }
  const statusLine = () => (elig.save ? (elig.where ? 'Saved voyage: ' + elig.where + '.' : 'A saved voyage is aboard.') : 'No saved voyage aboard.') +
    (elig.records ? ' Records on file.' : '');
  function refreshButtons() {
    readEligibility();
    const c = $('btn-continue');
    c.setAttribute('aria-disabled', String(!elig.save));
    c.classList.toggle('disabled', !elig.save);
    c.dataset.hint = elig.save ? (elig.where ? 'Resume the saved voyage: ' + elig.where + '.' : 'Resume the saved voyage.') : 'No saved voyage aboard.';
    if (window.refreshRecordsButton) refreshRecordsButton(); // records.js owns RECORDS' state
    if (stage === 'menu' && !document.querySelector('#title-buttons .title-btn:hover, #title-buttons .title-btn:focus-visible')) showHint(null);
  }
  function showMenu() {
    clearTimers();
    if (stopPowerOnWait) stopPowerOnWait();
    introStarting = false;
    refreshButtons();
    armedAt = performance.now() + ARM_MS;
    setStage('menu');
    showHint(null);
    if (onScreen()) $('btn-new').focus({ preventScroll: true });
  }
  window.addEventListener('storage', e => { if (onScreen() && (!e.key || e.key === SAVE_KEY || e.key === 'transplant_records_v1')) refreshButtons(); });
  window.addEventListener('focus', () => { if (onScreen() && stage === 'menu') refreshButtons(); });

  // SHIP STATUS: the eligibility summary; a hovered or keyboard-focused
  // button's hint takes it over. Two lines at most: a long line steps the
  // type down until it fits, the copy is never cut.
  const MSG_PX = [12.5, 12, 11.5, 11];
  function fitStatus() {
    const el = $('title-st-msg');
    for (const px of MSG_PX) {
      el.style.setProperty('--msg-size', px + 'px');
      if (el.scrollHeight <= Math.ceil(px * 1.24 * 2) + 1) return;
    }
  }
  // Measured with the real face: refit once the fonts have loaded.
  if (document.fonts) document.fonts.addEventListener('loadingdone', () => { if (onScreen()) fitStatus(); });
  function showHint(b) {
    const el = $('title-st-msg');
    el.classList.toggle('hint', !!b);
    el.textContent = b ? '▸ ' + b.dataset.hint : statusLine();
    fitStatus();
  }
  btns().forEach(b => {
    b.addEventListener('mouseenter', () => { if (stage === 'menu') showHint(b); });
    b.addEventListener('mouseleave', () => {
      if (stage !== 'menu') return;
      const f = document.activeElement;
      showHint(f && f.matches && f.matches('#title-buttons .title-btn:focus-visible') ? f : null);
    });
    b.addEventListener('focus', () => { if (stage === 'menu' && b.matches(':focus-visible')) showHint(b); });
    b.addEventListener('blur', () => { if (stage === 'menu') showHint(null); });
  });
  // Arrow keys move between the three; Home/End jump.
  $('title-buttons').addEventListener('keydown', e => {
    const list = btns(), i = list.indexOf(document.activeElement);
    if (i < 0) return;
    const d = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : (e.key === 'ArrowUp' || e.key === 'ArrowLeft') ? -1 : 0;
    if (d) { e.preventDefault(); list[(i + d + list.length) % list.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
  });

  $('btn-new').addEventListener('click', () => { if (armed()) startDeparture('new'); });
  $('btn-continue').addEventListener('click', () => {
    if (!armed()) return;
    if (readEligibility().save) startDeparture('continue'); else refreshButtons();
  });
  // RECORDS: records.js opens the panel (when there are records). This
  // guard runs first, in the capture phase: a click into a menu that hasn't
  // armed yet, or during the departure, never reaches it.
  $('btn-records').addEventListener('click', e => { if ((stage === 'menu' && !armed()) || stage === 'departing') e.stopImmediatePropagation(); }, true);

  /* ── Departure → the game ────────────────────────────────────── */
  let departKind = null;
  function startDeparture(kind) {
    // Blur first: the button's blur handler restores the idle line.
    if (document.activeElement) document.activeElement.blur();
    scr.focus({ preventScroll: true });
    const msg = $('title-st-msg');
    msg.classList.remove('hint');
    msg.textContent = kind === 'continue' ? 'Resuming voyage.' : 'Departure authorised. Mind the station.';
    fitStatus();
    departKind = kind;
    setStage('departing');
    later(finishDeparture, reduced() ? REDUCED_DEPART_MS : DEPART_MS);
  }
  function finishDeparture() {
    if (stage !== 'departing') return;
    clearTimers();
    const kind = departKind;
    departKind = null;
    setStage('departed');
    if (kind === 'continue') { if (!loadRun()) showMenu(); } // the save went bad meanwhile: back to the menu
    else startNewGame();
  }
  // Leaving the title stops its timers (an intro left half-typed finishes
  // on the next key or click). Coming back after a departure (setup's
  // BACK) shows the menu.
  let wasOnScreen = false;
  new MutationObserver(() => {
    syncLive();
    const on = onScreen();
    if (on === wasOnScreen) return;
    wasOnScreen = on;
    if (!on) {
      clearTimers();
      introStarting = false;
      if (stage === 'departing') { departKind = null; setStage('departed'); }
      return;
    }
    if (stage === 'departed') finishIntro();
    else if (stage === 'poster') scr.focus({ preventScroll: true });
  }).observe(scr, { attributes: true, attributeFilter: ['class'] });

  /* ── Input: poster / skip intro / skip departure ─────────────── */
  function onSceneInput(e) {
    if (e.target && e.target.closest && e.target.closest('#overlay-records, #title-buttons .title-btn')) return;
    if (e.type === 'keydown' && (e.key === 'Tab' || e.key === 'Shift' || e.metaKey || e.ctrlKey || e.altKey)) return;
    // Every skipping key is consumed: the menu focuses NEW GAME, and an
    // Enter left to run its default would press it.
    if (stage === 'poster') { if (e.type === 'keydown') e.preventDefault(); if (!introStarting) dismissPoster(); }
    else if (stage === 'intro') { if (e.type === 'keydown') e.preventDefault(); if (!introStarting) finishIntro(); }
    else if (stage === 'departing') { e.preventDefault(); finishDeparture(); }
  }
  scr.addEventListener('click', onSceneInput);
  // Capture phase: ESC on the poster, intro or departure must not also
  // open the pause terminal (shared.js handles ESC in the bubble phase).
  window.addEventListener('keydown', e => {
    if (!onScreen() || PauseMenu.isOpen()) return;
    if ((stage === 'poster' || stage === 'intro' || stage === 'departing') && e.key === 'Escape') e.stopPropagation();
    // An unarmed menu (just skipped into) or a held key swallows activation.
    const recordsOpen = $('overlay-records').classList.contains('active');
    if (stage === 'menu' && !recordsOpen && (e.key === 'Enter' || e.key === ' ') && (e.repeat || !armed())) { e.preventDefault(); return; }
    onSceneInput(e);
  }, true);
  window.addEventListener('keyup', e => {
    // Space presses a button on keyup: an unarmed one must not.
    if (onScreen() && stage === 'menu' && e.key === ' ' && !armed() && e.target.closest && e.target.closest('#title-buttons .title-btn')) e.preventDefault();
  }, true);

  setStage('poster');
  requestAnimationFrame(() => requestAnimationFrame(() => scr.classList.remove('init')));

  // Read-only hook for tools/tests/test_title_menu.js.
  window.TITLE_MENU = { get stage() { return stage; }, get armed() { return armed(); }, DISPLAYS, mapPoint };
})();
