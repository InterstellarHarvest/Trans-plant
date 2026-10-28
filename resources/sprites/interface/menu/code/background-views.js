'use strict';
/* ────────────────────────────────────────────────────────────────
   TITLE VIEWS — what the observation deck's windows look out on
   (MENU-002C1 renderer: ONE universal room overlay over separate
   exterior backgrounds).

   The room is one RGBA image, menu_overlay.png (the TIGHT leaf-clear
   foreground with the 002A alpha-only fix, the window openings transparent).
   Every view is a background PNG under it at the same 1536x1024 source
   registration. On a fresh page load one view is chosen, its background and
   the overlay are composited ONCE at 1536x1024 in a canvas that is never
   shown, and the exported bitmap goes into the painting's own <img>
   (#title-paint). Nothing moves and nothing is redrawn after that; setup's
   BACK shows the same picture. All of it happens behind the poster: the
   poster waits for it (menu.js), so the room never shows half-built.

   Opened from disk (file://), images read from disk would taint the canvas
   (Chrome refuses the export), so the overlay and the rotation backgrounds
   come from the generated portable bundle as data: URLs
   (tools/build_portable.js); over http that bundle is never loaded.
   If the export still fails, the same pair is shown as two aligned <img>
   layers (a recovery path, not the normal one). A background that will not
   load falls back to Earth.

   The three station navigation lights (background-effects.css) show only
   with a background that holds the station they are registered to.

   ?view=<id>     force a view (QA)    ?view=random   a fresh rotation draw
   ?arch=layers   force the two-layer recovery path (QA)
   No parameter: a random view from those marked `rotation`.
   ──────────────────────────────────────────────────────────────── */
(function () {
  const $ = id => document.getElementById(id);
  const DIR = 'resources/sprites/interface/menu/';
  const OVERLAY = DIR + 'menu_overlay.png';
  const W = 1536, H = 1024;

  // station: the background holds the painted station the nav lights sit on.
  // rotation: may be drawn on a fresh load (only once the PMO approves its art;
  // a rotation background must also be in tools/build_portable.js).
  const VIEWS = [
    { id: 'earth', bg: DIR + 'backgrounds/earth.png', station: true, rotation: true },     // the approved master's exterior
    { id: 'mars', bg: DIR + 'backgrounds/mars.png', station: false, rotation: true },      // Mars V3, approved
    { id: 'ringed', bg: DIR + 'backgrounds/ringed.png', station: false, rotation: true },  // Ringed V2-B (skyfix B), approved
    { id: 'nebula', bg: DIR + 'backgrounds/nebula.png', station: false, rotation: true },  // Nebula V1, approved
    { id: 'mars-v1', bg: DIR + 'backgrounds/mars_v1.png', station: false, rotation: false }, // Mars V1, rejected; kept for comparison
    { id: 'ringed-v1', bg: DIR + 'backgrounds/ringed_v1.png', station: false, rotation: false }, // ringed V1 (MENU-002F1), REJECTED as final art; kept for comparison
  ];
  const EARTH = VIEWS[0];

  const params = new URLSearchParams(location.search);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  function choose() {
    const q = params.get('view');
    if (q === 'random') return pick(VIEWS.filter(v => v.rotation));
    const forced = VIEWS.find(v => v.id === q);
    if (q && !forced) console.warn('title view "' + q + '" is not registered; using the rotation');
    return forced || pick(VIEWS.filter(v => v.rotation));
  }
  // Opened from disk: the bundled data: URL when there is one.
  const source = rel => (window.TP_PORTABLE && TP_PORTABLE.images[rel]) || rel;

  let view = choose();
  const forceLayers = params.get('arch') === 'layers';
  const state = { id: view.id, station: view.station, arch: null, shown: null, settled: false, ids: VIEWS.map(v => v.id), timing: {}, ready: null };
  state.timing.start = performance.now();
  // Loaded AND decoded, so a swap never shows a half-ready frame.
  const load = src => new Promise((ok, fail) => { const im = new Image(); im.onload = () => im.decode().then(() => ok(im), () => ok(im)); im.onerror = () => fail(new Error('could not load ' + (src.startsWith('data:') ? 'the bundled image' : src))); im.src = src; });
  const loaded = img => new Promise((ok, fail) => { img.addEventListener('load', ok, { once: true }); img.addEventListener('error', () => fail(new Error('could not show the title view')), { once: true }); });
  const paint = $('title-paint');
  $('title-navlights').hidden = true; // until the view with their station is on show

  function shown(how) {
    $('title-navlights').hidden = !view.station;
    state.id = view.id; state.station = view.station; state.shown = view.id; state.arch = how;
    state.timing.ready = performance.now();  // ms since navigation start
  }
  // The one composite, exported and shown in the painting's own <img>.
  function composite(bgImg, ovImg) {
    const t = performance.now();
    const cv = document.createElement('canvas'); // never added to the page
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.drawImage(bgImg, 0, 0);
    ctx.drawImage(ovImg, 0, 0);
    state.timing.draw = performance.now() - t;
    return new Promise((ok, fail) => {
      try { cv.toBlob(b => b ? ok(b) : fail(new Error('canvas export returned nothing')), 'image/png'); } catch (e) { fail(e); }
    }).finally(() => { cv.width = cv.height = 0; }) // free the canvas's pixels at once
      .then(blob => {
        state.timing.encode = performance.now() - t - state.timing.draw; state.timing.blobBytes = blob.size;
        const url = URL.createObjectURL(blob);
        const done = loaded(paint).then(() => paint.decode().catch(() => {})).then(() => { URL.revokeObjectURL(url); shown('composite'); });
        paint.src = url;
        return done;
      });
  }
  // Recovery only: the background in its own <img> under the painting's, which shows the overlay.
  function layers(bgImg, ovImg) {
    const bg = document.createElement('img');
    bg.id = 'title-bg'; bg.className = 'title-layer'; bg.alt = ''; bg.width = W; bg.height = H;
    const both = Promise.all([loaded(bg), loaded(paint)]);
    bg.src = bgImg.src; paint.src = ovImg.src; // both already decoded: they swap in the same frame
    paint.before(bg);
    return both.then(() => shown('layers'));
  }

  const overlay = load(source(OVERLAY));
  function render(v) {
    view = v;
    return Promise.all([load(source(v.bg)), overlay]).then(([bgImg, ovImg]) => {
      state.timing.loaded = performance.now();
      if (forceLayers) return layers(bgImg, ovImg);
      return composite(bgImg, ovImg).catch(e => {
        // e.g. a disk image with no bundled copy taints the canvas
        console.warn('title view: one-time composite unavailable (' + (e && e.name || e) + '); using image layers');
        state.fallback = String(e && e.name || e);
        return layers(bgImg, ovImg);
      });
    });
  }
  state.ready = render(view)
    .catch(e => {
      if (view === EARTH) throw e;
      console.warn('title view "' + view.id + '": ' + (e && e.message) + '; showing Earth');
      return render(EARTH);
    })
    .catch(e => { // nothing to show: the menu still works over the dark deck
      console.warn('title view: ' + (e && e.message) + '; the room is not shown');
      state.station = false; state.failed = true; // no station on show: the station-neutral departure line
    })
    .then(() => { state.settled = true; });

  // Read-only hook for the menu (the poster waits on `ready`; `station`
  // picks the departure line) and the title tests.
  window.TITLE_VIEW = state;
})();
