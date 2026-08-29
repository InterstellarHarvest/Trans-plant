/* ============================================================
   Trans-plant shared JS primitives
   ------------------------------------------------------------
   Helpers that every demo-or-future-engine layer uses identically.
   Loaded as a non-module <script>, so const/function declarations
   here go into the shared global scope — every demo's IIFE can
   reference them via the lexical chain (CREW_ATLAS, crewIconCss,
   wireCustomScroll, etc).
   ============================================================ */

// ── Crew sprite atlas ────────────────────────────────────────
// Per-crew sheet packs 9 talk frames + 1 portrait + 1 icon at
// fixed coords. Coords come from sprites/crew_sprites/spritesheet_<id>.json
// (TexturePacker output) and are imported verbatim — regenerating
// the sheets is a copy-paste of the JSON values.
//
// reyes is the only crew with non-default portrait dims (80×143
// vs 80×192); icon y also shifts to avoid overlap.
//
// captain has loose `captain.png` + `captain_icon.png` files (no
// spritesheet yet — captain doesn't talk to themselves so the 9
// talk frames don't exist for them). The fileIcon/filePortrait
// keys make the helpers fall through to direct image URLs.
const CREW_SHEET_W = 376, CREW_SHEET_H = 294;
const CREW_ATLAS = {
  osei:     { sheet:'sprites/crew_sprites/spritesheet_osei.png',     icon:[295,195,48,48], portrait:[295,1,80,192] },
  hargrove: { sheet:'sprites/crew_sprites/spritesheet_hargrove.png', icon:[295,195,48,48], portrait:[295,1,80,192] },
  kazuki:   { sheet:'sprites/crew_sprites/spritesheet_kazuki.png',   icon:[295,195,48,48], portrait:[295,1,80,192] },
  reeves:   { sheet:'sprites/crew_sprites/spritesheet_reeves.png',   icon:[295,195,48,48], portrait:[295,1,80,192] },
  reyes:    { sheet:'sprites/crew_sprites/spritesheet_reyes.png',    icon:[295,146,48,48], portrait:[295,1,80,143] },
  tanaka:   { sheet:'sprites/crew_sprites/spritesheet_tanaka.png',   icon:[295,195,48,48], portrait:[295,1,80,192] },
  vasquez:  { sheet:'sprites/crew_sprites/spritesheet_vasquez.png',  icon:[295,195,48,48], portrait:[295,1,80,192] },
  captain:  { fileIcon:'sprites/crew_sprites/captain_icon.png',
              filePortrait:'sprites/crew_sprites/captain.png' }
};

// Build a CSS background string for a loose image file (used by
// captain since it has no spritesheet, just standalone PNGs).
function _looseFileBg(url) {
  return "background-image: url('" + url + "'); " +
         "background-size: contain; background-position: center; " +
         "background-repeat: no-repeat; image-rendering: pixelated;";
}

// Build a CSS string that crops the crew icon (48×48 square) from
// the spritesheet at the given displayPx (a CSS value like '32px'
// or 'var(--card-icon-size)'). Caller sets the element to the same
// width/height so the cropped region fills the box. Captain falls
// back to its loose icon file via _looseFileBg.
function crewIconCss(crewId, displayPx) {
  const a = CREW_ATLAS[crewId];
  if (!a) return '';
  if (a.fileIcon) return _looseFileBg(a.fileIcon);
  const [x, y, w] = a.icon;
  return "background-image: url('" + a.sheet + "'); " +
         "background-size: calc(" + displayPx + " * " + (CREW_SHEET_W/w).toFixed(4) + ") calc(" + displayPx + " * " + (CREW_SHEET_H/w).toFixed(4) + "); " +
         "background-position: calc(" + displayPx + " * " + (-x/w).toFixed(4) + ") calc(" + displayPx + " * " + (-y/w).toFixed(4) + "); " +
         "background-repeat: no-repeat; image-rendering: pixelated;";
}

// Apply the full portrait crop to an element via inline styles. The
// caller is expected to wrap the element in a positioning container
// — this function paints a child .cd-portrait-sprite that's sized
// to *exactly* the displayed portrait region (so the rest of the
// sheet's content can't bleed through). Without the child element
// the box is wider than the portrait and the talk-frames render
// alongside it. boxW/boxH = the parent box dims (e.g. 192×192).
function applyCrewPortrait(el, crewId, boxW, boxH) {
  const a = CREW_ATLAS[crewId];
  if (!a) return false;
  el.querySelectorAll('.cd-portrait-sprite').forEach(n => n.remove());
  ['background-image','background-size','background-position','background-repeat','image-rendering']
    .forEach(p => el.style.removeProperty(p));

  const sprite = document.createElement('div');
  sprite.className = 'cd-portrait-sprite';

  if (a.filePortrait) {
    sprite.style.cssText =
      'position:absolute; left:0; right:0; bottom:0; top:0;' +
      "background-image: url('" + a.filePortrait + "');" +
      'background-size: contain; background-position: center bottom;' +
      'background-repeat: no-repeat; image-rendering: pixelated;' +
      'pointer-events: none;';
    el.appendChild(sprite);
    return true;
  }
  const [x, y, w, h] = a.portrait;
  const scale = Math.min(boxW / w, boxH / h);
  const dispW = w * scale;
  const dispH = h * scale;
  sprite.style.cssText =
    'position:absolute;' +
    'left:' + ((boxW - dispW) / 2) + 'px;' +
    'bottom:0;' +
    'width:'  + dispW + 'px;' +
    'height:' + dispH + 'px;' +
    "background-image: url('" + a.sheet + "');" +
    'background-size: '     + (CREW_SHEET_W * scale) + 'px ' + (CREW_SHEET_H * scale) + 'px;' +
    'background-position: ' + (-x * scale) + 'px ' + (-y * scale) + 'px;' +
    'background-repeat: no-repeat; image-rendering: pixelated;' +
    'pointer-events: none;';
  el.appendChild(sprite);
  return true;
}

// Probe the underlying sprite source — the spritesheet for normal
// crew, the loose portrait for captain. Cached. Calls back with
// `true` if the image loaded, `false` if it 404'd (in which case
// callers are expected to render an emoji fallback).
const _crewSheetProbe = {};
function probeCrewSprite(crewId, cb) {
  if (crewId in _crewSheetProbe) return cb(_crewSheetProbe[crewId]);
  const a = CREW_ATLAS[crewId];
  const url = a && (a.filePortrait || a.sheet);
  if (!url) { _crewSheetProbe[crewId] = false; return cb(false); }
  const img = new Image();
  img.onload  = () => { _crewSheetProbe[crewId] = true;  cb(true); };
  img.onerror = () => { _crewSheetProbe[crewId] = false; cb(false); };
  img.src = url;
}


// ── Custom scrollbar wiring ──────────────────────────────────
// Hides the native scrollbar on .scroll-content and syncs a gold
// thumb on a dark track. Markup contract:
//   <div class="scroll-host">
//     <div class="scroll-content"> …scrollable content… </div>
//     <div class="scroll-track"><div class="scroll-thumb"></div></div>
//   </div>
// Call wireCustomScroll(host) once at boot per host. Drag, scroll,
// page-jump click, and dynamic-content updates are all handled.
function wireCustomScroll(host) {
  const content = host.querySelector('.scroll-content');
  const track   = host.querySelector('.scroll-track');
  const thumb   = host.querySelector('.scroll-thumb');
  if (!content || !track || !thumb) return;

  function update() {
    const visible = content.clientHeight;
    const total   = content.scrollHeight;
    if (total <= visible + 1) {
      host.classList.add('no-scroll');
      return;
    }
    host.classList.remove('no-scroll');
    const trackH = track.clientHeight;
    const thumbH = Math.max(22, Math.floor(trackH * (visible / total)));
    const maxThumbTop = trackH - thumbH;
    const scrollRatio = content.scrollTop / (total - visible);
    thumb.style.height = thumbH + 'px';
    thumb.style.top    = (scrollRatio * maxThumbTop) + 'px';
  }

  // Coalesce update() calls into a single per-frame run. Without
  // this, a fast DOM rebuild fires the MutationObserver many times
  // mid-rebuild — each transient layout state can briefly remove
  // .no-scroll, which (combined with the cursor being over the host
  // from the click that triggered the rebuild) makes the gold track
  // flash visible for a frame.
  let rafPending = false;
  function scheduleUpdate() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; update(); });
  }

  // Scroll → thumb sync + transient visibility flag (track fades
  // in for 600ms after each scroll event).
  let flashTimer = null;
  content.addEventListener('scroll', () => {
    update();
    host.classList.add('scrolling');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => host.classList.remove('scrolling'), 600);
  });

  // Recompute on layout changes + child mutations so the thumb
  // stays accurate across dynamic content (renderGrid(), tab
  // switches, log entries pushed in).
  if (window.ResizeObserver) new ResizeObserver(scheduleUpdate).observe(content);
  new MutationObserver(scheduleUpdate).observe(content, { childList: true, subtree: true });

  // Drag — pointer capture so releasing off-thumb still ends drag.
  let dragY0 = 0, scroll0 = 0, trackH0 = 0, thumbH0 = 0;
  thumb.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    thumb.setPointerCapture(e.pointerId);
    host.classList.add('dragging');
    dragY0 = e.clientY;
    scroll0 = content.scrollTop;
    trackH0 = track.clientHeight;
    thumbH0 = thumb.clientHeight;
  });
  thumb.addEventListener('pointermove', (e) => {
    if (!thumb.hasPointerCapture(e.pointerId)) return;
    const dy = e.clientY - dragY0;
    const maxThumbTop = trackH0 - thumbH0;
    if (maxThumbTop <= 0) return;
    const scrollable = content.scrollHeight - content.clientHeight;
    content.scrollTop = scroll0 + (dy / maxThumbTop) * scrollable;
  });
  const endDrag = (e) => {
    if (thumb.hasPointerCapture(e.pointerId)) thumb.releasePointerCapture(e.pointerId);
    host.classList.remove('dragging');
  };
  thumb.addEventListener('pointerup', endDrag);
  thumb.addEventListener('pointercancel', endDrag);

  // Track click = page jump (80% of viewport in the click direction).
  // Ignore clicks that originated on the thumb — pointerdown bubbles.
  track.addEventListener('click', (e) => {
    if (e.target === thumb) return;
    const rect = track.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const thumbTop = parseFloat(thumb.style.top) || 0;
    const thumbHN  = thumb.clientHeight;
    const dir = clickY < thumbTop ? -1 : (clickY > thumbTop + thumbHN ? 1 : 0);
    if (dir !== 0) content.scrollTop += dir * content.clientHeight * 0.8;
  });

  update();
}

// ── Pixel weld border ────────────────────────────────────────
// Generates a chunky, integer-aligned weld bead around the opaque
// region of a sprite. Used by HULL BREACH (welded patches), and
// available for any "repaired/sealed/fixed" state across the game
// (engine repair, salvage, derelict claims, hull upgrades).
//
// applyWeldBorder() — pure ImageData transform (writes bead into
//   transparent margin around the sprite). Source must already
//   have ≥ thickness+1 px of transparent padding on every side.
//
// bakeWeldedSprite() — convenience: takes an HTMLImageElement,
//   pads it, runs applyWeldBorder, returns a fresh canvas you
//   can either drawImage from or convert via toDataURL.
//
// WELD_PALETTES — 5 named presets (gunmetal, panelMatched,
//   freshHot, oxidized, darkSlag).

const WELD_PALETTES = {
  gunmetal:     { shadow:[18,22,30,255],  mid:[70,80,95,255],   highlight:[155,165,180,255], hot:[240,150,60,255]   },
  panelMatched: { shadow:[15,25,40,255],  mid:[50,65,90,255],   highlight:[115,140,175,255], hot:[240,150,60,255]   },
  freshHot:     { shadow:[40,15,5,255],   mid:[110,55,20,255],  highlight:[240,180,80,255],  hot:[255,240,120,255]  },
  oxidized:     { shadow:[25,15,15,255],  mid:[85,55,45,255],   highlight:[165,120,80,255],  hot:[110,140,170,255]  },
  darkSlag:     { shadow:[8,8,10,255],    mid:[30,30,35,255],   highlight:[70,70,80,255],    hot:[200,80,40,255]    },
};

function applyWeldBorder(src, opts = {}) {
  const {
    thickness = 3, bumpiness = 0.55, noiseScale = 2, seed = 12345,
    palette = WELD_PALETTES.gunmetal,
    hotChance = 0,
    lightDir = [-1, -1],
  } = opts;

  const w = src.width, h = src.height, sd = src.data;
  const out = new ImageData(new Uint8ClampedArray(sd), w, h);
  const od = out.data;

  // 1. binary mask
  const mask = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) mask[i] = sd[p + 3] > 127 ? 1 : 0;

  // 2. 8-conn chamfer distance transform + nearest-source tracking
  const INF = 9999;
  const dist = new Int16Array(w * h);
  const nx = new Int16Array(w * h), ny = new Int16Array(w * h);
  for (let i = 0; i < dist.length; i++) {
    if (mask[i]) { dist[i] = 0; nx[i] = i % w; ny[i] = (i / w) | 0; }
    else         { dist[i] = INF; nx[i] = -1; ny[i] = -1; }
  }
  const relax = (i, j) => {
    if (j < 0 || j >= dist.length) return;
    const c = dist[j] + 1;
    if (c < dist[i]) { dist[i] = c; nx[i] = nx[j]; ny[i] = ny[j]; }
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x > 0)              relax(i, i - 1);
    if (y > 0)              relax(i, i - w);
    if (x > 0 && y > 0)     relax(i, i - w - 1);
    if (x < w-1 && y > 0)   relax(i, i - w + 1);
  }
  for (let y = h-1; y >= 0; y--) for (let x = w-1; x >= 0; x--) {
    const i = y * w + x;
    if (x < w-1)            relax(i, i + 1);
    if (y < h-1)            relax(i, i + w);
    if (x < w-1 && y < h-1) relax(i, i + w + 1);
    if (x > 0 && y < h-1)   relax(i, i + w - 1);
  }

  // 3. value-noise hash
  const hash = (a, b, c) => {
    let v = (a * 374761393) ^ (b * 668265263) ^ (c * 2147483647);
    v = (v ^ (v >>> 13)) * 1274126177;
    return ((v ^ (v >>> 16)) >>> 0) / 4294967295;
  };

  // 4. normalize light dir
  const ll = Math.hypot(lightDir[0], lightDir[1]) || 1;
  const lx = lightDir[0] / ll, ly = lightDir[1] / ll;

  // 5. paint weld pixels
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (mask[i]) continue;
    const d = dist[i];
    if (d <= 0 || d > thickness) continue;
    const gx = (x / noiseScale) | 0, gy = (y / noiseScale) | 0;
    const n = hash(gx, gy, seed);
    const eff = thickness - bumpiness * (1 - n) * thickness * 0.7;
    if (d > eff) continue;
    const ox = x - nx[i], oy = y - ny[i];
    const ol = Math.hypot(ox, oy) || 1;
    const lam = (ox / ol) * lx + (oy / ol) * ly;
    let c;
    if (d >= thickness)            c = palette.shadow;
    else if (lam > 0.3 && d <= 2)  c = palette.highlight;
    else if (lam < -0.2)           c = palette.shadow;
    else                           c = palette.mid;
    if (hotChance > 0 && hash(x, y, seed + 999) < hotChance) c = palette.hot;
    const p = i * 4;
    od[p] = c[0]; od[p+1] = c[1]; od[p+2] = c[2]; od[p+3] = c[3];
  }
  return out;
}

/**
 * Bake a welded version of an HTMLImageElement into a fresh canvas.
 * Pads the source by `padding` px (default = thickness + 1) so the bead
 * has room to grow. Returns the canvas (use ctx.drawImage or .toDataURL).
 */
function bakeWeldedSprite(img, opts = {}) {
  const padding = opts.padding != null ? opts.padding : ((opts.thickness || 3) + 1);
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const W = w + padding * 2, H = h + padding * 2;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, padding, padding);
  const src = ctx.getImageData(0, 0, W, H);
  const welded = applyWeldBorder(src, opts);
  ctx.putImageData(welded, 0, 0);
  return cv;
}


/* ============================================================
   Cursor system
   ------------------------------------------------------------
   Two cursor families: pixel-map sprites (off-center hotspots,
   for UI states like pointer/hand/grab) and parametric reticles
   (center hotspots, for minigame targeting).

   ALWAYS-ON: pointer / hand are baked at script load and exposed
   as CSS vars (--cursor-pointer / --cursor-hand) on :root.
   shared.css uses these for html/body default + .panel-btn +
   .scroll-thumb. Demos use the same vars in their own cursor:
   rules. Note: there's intentionally no closed-fist "grab"
   cursor — draggable elements (sliders, scroll thumbs) keep
   the hand cursor through the drag, per design call 2026-05-06.

   MINIGAMES: reticles stay dormant. Wire one by adding a row to
   CURSOR_CONTEXTS, then call generateCursor('<context_tag>') and
   set element.style.cursor = result.

   Available reticle ids: classic, dot, circle, brackets, diamond,
   chevron, scanner, bullseye, crossdot, tripod, hud, leaf,
   orbital, dashes, xhair, scope.
   ============================================================ */

// Bresenham midpoint pixel circle. Used by reticle draw fns.
function _pixelCircle(ctx, cx, cy, radius, thickness) {
  if (radius < 1) { ctx.fillRect(cx, cy, 1, 1); return; }
  for (let w = 0; w < thickness; w++) {
    const r = radius - w;
    if (r < 0) break;
    let x = r, y = 0, err = 1 - r;
    while (x >= y) {
      const pts = [
        [cx+x,cy+y],[cx-x,cy+y],[cx+x,cy-y],[cx-x,cy-y],
        [cx+y,cy+x],[cx-y,cy+x],[cx+y,cy-x],[cx-y,cy-x],
      ];
      for (const [px,py] of pts) ctx.fillRect(px, py, 1, 1);
      y++;
      if (err < 0) err += 2*y+1;
      else { x--; err += 2*(y-x)+1; }
    }
  }
}

// Pixel-map cursors. 0=transparent, 1=primary color, 2=outline.
// hotspot = [x,y] in native pixel coords.
const CURSOR_SPRITES = [
  { id:'pointer', name:'Pointer', hotspot:[1,1], pixels:[
    [2,0,0,0,0,0,0,0,0,0,0,0],[2,2,0,0,0,0,0,0,0,0,0,0],
    [2,1,2,0,0,0,0,0,0,0,0,0],[2,1,1,2,0,0,0,0,0,0,0,0],
    [2,1,1,1,2,0,0,0,0,0,0,0],[2,1,1,1,1,2,0,0,0,0,0,0],
    [2,1,1,1,1,1,2,0,0,0,0,0],[2,1,1,1,1,1,1,2,0,0,0,0],
    [2,1,1,1,1,1,1,1,2,0,0,0],[2,1,1,1,1,1,1,1,1,2,0,0],
    [2,1,1,1,1,1,2,2,2,2,2,0],[2,1,1,2,1,1,2,0,0,0,0,0],
    [2,1,2,0,2,1,1,2,0,0,0,0],[2,2,0,0,2,1,1,2,0,0,0,0],
    [2,0,0,0,0,2,1,1,2,0,0,0],[0,0,0,0,0,2,1,1,2,0,0,0],
    [0,0,0,0,0,0,2,2,0,0,0,0],
  ]},
  { id:'hand', name:'Hand', hotspot:[6,1], pixels:[
    [0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,2,1,1,2,0,0,0,0,0,0,0,0],
    [0,0,0,0,2,1,1,2,0,0,0,0,0,0,0,0],
    [0,0,0,0,2,1,1,2,0,0,0,0,0,0,0,0],
    [0,0,0,0,2,1,1,2,2,2,0,2,2,0,0,0],
    [0,0,0,0,2,1,1,2,1,1,2,1,1,2,2,0],
    [0,0,0,0,2,1,1,2,1,1,2,1,1,2,1,2],
    [0,2,2,0,2,1,1,2,1,1,2,1,1,2,1,2],
    [2,1,1,2,1,1,1,1,1,1,1,1,1,1,1,2],
    [2,1,1,1,2,1,1,1,1,1,1,1,1,1,1,2],
    [0,2,1,1,2,1,1,1,1,1,1,1,1,1,1,2],
    [0,2,1,1,1,1,1,1,1,1,1,1,1,1,2,0],
    [0,0,2,1,1,1,1,1,1,1,1,1,1,1,2,0],
    [0,0,0,2,1,1,1,1,1,1,1,1,1,2,0,0],
    [0,0,0,2,1,1,1,1,1,1,1,1,2,0,0,0],
    [0,0,0,0,2,1,1,1,1,1,1,2,0,0,0,0],
    [0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0],
  ]},
  { id:'scan', name:'Scan', hotspot:[6,1], pixels:[
    [0,0,0,0,0,2,1,2,0,0,0,0,0],[0,0,0,0,0,2,1,2,0,0,0,0,0],
    [0,0,0,0,0,2,1,2,0,0,0,0,0],[0,0,0,0,0,0,2,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0],[2,2,2,0,0,0,0,0,0,0,2,2,2],
    [1,1,1,2,0,0,0,0,0,2,1,1,1],[2,2,2,0,0,0,0,0,0,0,2,2,2],
    [0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,2,0,0,0,0,0,0],
    [0,0,0,0,0,2,1,2,0,0,0,0,0],[0,0,0,0,0,2,1,2,0,0,0,0,0],
    [0,0,0,0,0,2,1,2,0,0,0,0,0],
  ]},
  { id:'denied', name:'Denied', hotspot:[6,6], pixels:[
    [0,0,0,2,2,2,2,2,2,2,0,0,0],[0,0,2,1,1,1,1,1,1,1,2,0,0],
    [0,2,1,1,2,2,2,2,1,1,1,2,0],[2,1,1,2,0,0,0,2,1,1,1,1,2],
    [2,1,2,0,0,0,2,1,1,1,1,1,2],[2,1,2,0,0,2,1,1,1,2,2,1,2],
    [2,1,2,0,2,1,1,1,2,0,2,1,2],[2,1,2,2,1,1,1,2,0,0,2,1,2],
    [2,1,1,1,1,1,2,0,0,0,2,1,2],[2,1,1,1,1,2,0,0,0,2,1,1,2],
    [0,2,1,1,1,2,2,2,2,1,1,2,0],[0,0,2,1,1,1,1,1,1,1,2,0,0],
    [0,0,0,2,2,2,2,2,2,2,0,0,0],
  ]},
  { id:'wait', name:'Wait', hotspot:[5,7], pixels:[
    [2,2,2,2,2,2,2,2,2,2,2],[0,2,1,1,1,1,1,1,1,2,0],
    [0,0,2,1,1,1,1,1,2,0,0],[0,0,0,2,1,1,1,2,0,0,0],
    [0,0,0,0,2,1,2,0,0,0,0],[0,0,0,0,2,1,2,0,0,0,0],
    [0,0,0,0,2,1,2,0,0,0,0],[0,0,0,2,1,1,1,2,0,0,0],
    [0,0,2,1,1,1,1,1,2,0,0],[0,0,2,1,1,1,1,1,2,0,0],
    [0,0,2,1,1,1,1,1,2,0,0],[0,0,0,2,1,1,1,2,0,0,0],
    [0,0,0,0,2,1,2,0,0,0,0],[0,0,0,2,1,2,1,2,0,0,0],
    [0,0,2,1,2,0,2,1,2,0,0],[0,2,1,2,0,0,0,2,1,2,0],
    [2,2,2,2,2,2,2,2,2,2,2],
  ]},
];

// Parametric reticles. draw(ctx, half, thickness, gap, opts).
const RETICLE_REGISTRY = [
  { id:'classic', name:'Classic', draw(ctx,s,t,g,o){
    ctx.fillStyle=o.color1;
    ctx.fillRect(-s,-Math.floor(t/2),s-g,t); ctx.fillRect(g+1,-Math.floor(t/2),s-g,t);
    ctx.fillRect(-Math.floor(t/2),-s,t,s-g); ctx.fillRect(-Math.floor(t/2),g+1,t,s-g);
  }},
  { id:'dot', name:'Dot', draw(ctx,s,t,g,o){
    const r=Math.max(1,t); ctx.fillStyle=o.color1; ctx.fillRect(-r,-r,r*2+1,r*2+1);
  }},
  { id:'circle', name:'Circle', draw(ctx,s,t,g,o){
    ctx.fillStyle=o.color1; _pixelCircle(ctx,0,0,s-1,t);
  }},
  { id:'brackets', name:'Brackets', draw(ctx,s,t,g,o){
    const arm=Math.max(3,Math.floor(s*0.45)); ctx.fillStyle=o.color1;
    ctx.fillRect(-s,-s,arm,t); ctx.fillRect(-s,-s,t,arm);
    ctx.fillRect(s-arm+1,-s,arm,t); ctx.fillRect(s-t+1,-s,t,arm);
    ctx.fillRect(-s,s-t+1,arm,t); ctx.fillRect(-s,s-arm+1,t,arm);
    ctx.fillRect(s-arm+1,s-t+1,arm,t); ctx.fillRect(s-t+1,s-arm+1,t,arm);
  }},
  { id:'diamond', name:'Diamond', draw(ctx,s,t,g,o){
    ctx.fillStyle=o.color1; const r=s-1;
    for (let i=0;i<=r;i++){ const py=-r+i;
      ctx.fillRect(i,py,t,1); ctx.fillRect(-i-t+1,py,t,1);
      ctx.fillRect(r-i,i,t,1); ctx.fillRect(-r+i-t+1,i,t,1); }
  }},
  { id:'chevron', name:'Chevron', draw(ctx,s,t,g,o){
    ctx.fillStyle=o.color1; const h=Math.floor(s*0.7);
    for (let i=0;i<h;i++){ ctx.fillRect(i,-h+i+g,t,t); ctx.fillRect(-i-t+1,-h+i+g,t,t); }
  }},
  { id:'scanner', name:'Scanner', draw(ctx,s,t,g,o){
    ctx.fillStyle=o.color1;
    ctx.fillRect(-s,-1,s*2+1,t);
    ctx.fillRect(-Math.floor(t/2),-s,t,s-g); ctx.fillRect(-Math.floor(t/2),g+1,t,s-g);
    const tick=Math.max(2,Math.floor(s*0.3)); ctx.fillStyle=o.color2;
    ctx.fillRect(-s,-tick-2,t,tick); ctx.fillRect(s-t+1,-tick-2,t,tick);
    ctx.fillRect(-s,2+t,t,tick); ctx.fillRect(s-t+1,2+t,t,tick);
  }},
  { id:'bullseye', name:'Bullseye', draw(ctx,s,t,g,o){
    ctx.fillStyle=o.color1; _pixelCircle(ctx,0,0,s-1,t);
    if (s>6){ ctx.fillStyle=o.color2; _pixelCircle(ctx,0,0,Math.floor((s-1)*0.55),Math.max(1,t-1)); }
  }},
  { id:'crossdot', name:'Cross-Dot', draw(ctx,s,t,g,o){
    const arm=Math.floor(s*0.5); ctx.fillStyle=o.color1;
    ctx.fillRect(-s,-Math.floor(t/2),arm,t); ctx.fillRect(s-arm+1,-Math.floor(t/2),arm,t);
    ctx.fillRect(-Math.floor(t/2),-s,t,arm); ctx.fillRect(-Math.floor(t/2),s-arm+1,t,arm);
    const d=Math.max(1,t); ctx.fillStyle=o.color2; ctx.fillRect(-d,-d,d*2+1,d*2+1);
  }},
  { id:'tripod', name:'Tripod', draw(ctx,s,t,g,o){
    ctx.fillStyle=o.color1; const r=s-1;
    const angles=[-Math.PI/2,Math.PI/6,5*Math.PI/6];
    for (const a of angles){ const dx=Math.cos(a),dy=Math.sin(a);
      for (let i=g;i<=r;i++) ctx.fillRect(Math.round(dx*i),Math.round(dy*i),t,t); }
  }},
  { id:'hud', name:'HUD', draw(ctx,s,t,g,o){
    const arm=Math.max(3,Math.floor(s*0.35)); ctx.fillStyle=o.color1;
    ctx.fillRect(-s,-s,arm,t); ctx.fillRect(-s,-s,t,arm);
    ctx.fillRect(s-arm+1,-s,arm,t); ctx.fillRect(s-t+1,-s,t,arm);
    ctx.fillRect(-s,s-t+1,arm,t); ctx.fillRect(-s,s-arm+1,t,arm);
    ctx.fillRect(s-arm+1,s-t+1,arm,t); ctx.fillRect(s-t+1,s-arm+1,t,arm);
    ctx.fillStyle=o.color2;
    ctx.fillRect(-g-2,0,g-1,1); ctx.fillRect(3,0,g-1,1);
    ctx.fillRect(0,-g-2,1,g-1); ctx.fillRect(0,3,1,g-1);
  }},
  { id:'leaf', name:'Leaf', draw(ctx,s,t,g,o){
    ctx.fillStyle=o.color1; const h=s-1;
    for (let y=-h;y<=h;y++){ const w=Math.round((1-(y*y)/(h*h))*h*0.6);
      if (w>0){ ctx.fillRect(-w,y,t,1); ctx.fillRect(w-t+1,y,t,1); } }
    ctx.fillStyle=o.color2; ctx.fillRect(0,-h,1,h*2+1);
  }},
  { id:'orbital', name:'Orbital', draw(ctx,s,t,g,o){
    ctx.fillStyle=o.color1; _pixelCircle(ctx,0,0,s-1,Math.max(1,t-1));
    const ext=Math.floor(s*0.35);
    ctx.fillRect(-s-ext,-Math.floor(t/2),ext,t); ctx.fillRect(s,-Math.floor(t/2),ext,t);
    ctx.fillRect(-Math.floor(t/2),-s-ext,t,ext); ctx.fillRect(-Math.floor(t/2),s,t,ext);
  }},
  { id:'dashes', name:'Dashes', draw(ctx,s,t,g,o){
    ctx.fillStyle=o.color1;
    const seg=Math.max(2,Math.floor(s*0.3)); const dg=Math.max(1,Math.floor(t*0.8));
    for (let i=g+1;i<s;i+=seg+dg){ const len=Math.min(seg,s-i);
      ctx.fillRect(i,-Math.floor(t/2),len,t); ctx.fillRect(-i-len+1,-Math.floor(t/2),len,t);
      ctx.fillRect(-Math.floor(t/2),i,t,len); ctx.fillRect(-Math.floor(t/2),-i-len+1,t,len); }
  }},
  { id:'xhair', name:'X-Hair', draw(ctx,s,t,g,o){
    ctx.fillStyle=o.color1; const r=s-1;
    for (let i=g;i<=r;i++){
      ctx.fillRect(i,i,t,t); ctx.fillRect(-i-t+1,i,t,t);
      ctx.fillRect(i,-i-t+1,t,t); ctx.fillRect(-i-t+1,-i-t+1,t,t); }
  }},
  { id:'scope', name:'Scope', draw(ctx,s,t,g,o){
    ctx.fillStyle=o.color1; _pixelCircle(ctx,0,0,s-1,t);
    ctx.fillRect(-s,-Math.floor(t/2),s-g,t); ctx.fillRect(g+1,-Math.floor(t/2),s-g,t);
    ctx.fillRect(-Math.floor(t/2),-s,t,s-g); ctx.fillRect(-Math.floor(t/2),g+1,t,s-g);
  }},
];

// Maps a context tag to a cursor + designer defaults. Player
// can override color1, color2, thickness, outline at runtime.
// To wire a new minigame: add a row, then call generateCursor('<tag>').
const CURSOR_CONTEXTS = {
  // Always-on (used by html/body, .panel-btn, .scroll-thumb).
  pointer: { family:'sprite', cursor:'pointer', color1:'#cccc99', scale:2, outline:true },
  hand:    { family:'sprite', cursor:'hand',    color1:'#cccc99', scale:2, outline:true },

  // Available, not yet wired.
  denied:  { family:'sprite', cursor:'denied',  color1:'#cc3333', scale:2, outline:true },
  wait:    { family:'sprite', cursor:'wait',    color1:'#cccc99', scale:2, outline:true },
  scan:    { family:'sprite', cursor:'scan',    color1:'#35c6bf', scale:2, outline:true },

  // Fallback for any reticle-context tag without its own row.
  default: { family:'reticle', cursor:'classic', size:32, thickness:2, gap:3,
             color1:'#35c6bf', color2:'#c8a85a', outline:true, dot:false, scale:2 },

  // Add minigame entries below this line. Template:
  //   my_minigame: { family:'reticle', cursor:'scanner', size:32, thickness:2,
  //                  gap:3, color1:'#35c6bf', color2:'#c8a85a',
  //                  outline:true, dot:false, scale:2 },

  // Medical triage — scanner armed.
  medical_scan: { family:'reticle', cursor:'scanner', size:32, thickness:5,
                  gap:3, color1:'#6dcff1', color2:'#e9f0cd',
                  opacity:35, outline:false, dot:false, scale:2 },

  // Asteroid mining — gold/cream cross-dot, scoped to the mining stage.
  mining: { family:'reticle', cursor:'crossdot', size:32, thickness:2,
            gap:3, color1:'#c8a85a', color2:'#e8d8a0',
            outline:true, dot:true, scale:2 },
};

// Cache of generated cursor strings, keyed by context+overrides.
const _cursorCache = new Map();

// Build a CSS cursor string ("url(...) x y, fallback") for a tag.
// playerSettings (optional): { color1, color2, thickness, outline, opacity }.
// opacity: 0–100 (default 100).
function generateCursor(contextTag, playerSettings) {
  const ctx = CURSOR_CONTEXTS[contextTag] || CURSOR_CONTEXTS['default'];
  const family = ctx.family || 'reticle';
  const ps = playerSettings || {};
  const color1  = ps.color1 || ctx.color1;
  const color2  = ps.color2 || ctx.color2 || color1;
  const outline = ps.outline !== undefined ? ps.outline : ctx.outline;
  const scale   = ctx.scale || 2;
  const thickness = ps.thickness || ctx.thickness || 2;
  const opacity = (ps.opacity != null ? ps.opacity
                 : (ctx.opacity != null ? ctx.opacity : 100)) / 100;

  const cacheKey = contextTag+'|'+color1+'|'+color2+'|'+outline+'|'+thickness+'|'+opacity;
  const hit = _cursorCache.get(cacheKey);
  if (hit) return hit;

  let dataUrl, hotX, hotY, fallback;

  if (family === 'sprite') {
    const sprite = CURSOR_SPRITES.find(s => s.id === ctx.cursor);
    if (!sprite) return 'auto';
    const px = sprite.pixels;
    const h = px.length;
    const w = Math.max(...px.map(r => r.length));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.globalAlpha = opacity;
    const colors = { 1: color1, 2: outline ? '#000000' : color1 };
    for (let y=0; y<h; y++) for (let x=0; x<px[y].length; x++) {
      if (px[y][x] === 0) continue;
      c.fillStyle = colors[px[y][x]];
      c.fillRect(x, y, 1, 1);
    }
    c.globalAlpha = 1;
    const sw=w*scale, sh=h*scale;
    const scaled = document.createElement('canvas');
    scaled.width=sw; scaled.height=sh;
    const sc = scaled.getContext('2d');
    sc.imageSmoothingEnabled = false;
    sc.drawImage(cv, 0, 0, sw, sh);
    dataUrl = scaled.toDataURL('image/png');
    hotX = Math.floor(sprite.hotspot[0] * scale);
    hotY = Math.floor(sprite.hotspot[1] * scale);
    fallback = ctx.cursor === 'hand' ? 'pointer'
             : ctx.cursor === 'wait' ? 'wait'
             : 'auto';
  } else {
    const entry = RETICLE_REGISTRY.find(r => r.id === ctx.cursor);
    if (!entry) return 'crosshair';
    const size = ctx.size || 32;
    const gap  = ctx.gap || 3;
    const dot  = ctx.dot || false;
    const cv = document.createElement('canvas');
    cv.width=size; cv.height=size;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.globalAlpha = opacity;
    const cx = Math.floor(size/2), cy = Math.floor(size/2);
    const half = Math.floor(size/2) - 1;
    if (outline) {
      const blk = { color1:'#000000', color2:'#000000' };
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        c.save(); c.translate(cx+dx, cy+dy);
        entry.draw(c, half, thickness, gap, blk);
        c.restore();
      }
    }
    c.save(); c.translate(cx, cy);
    entry.draw(c, half, thickness, gap, { color1, color2 });
    c.restore();
    if (dot) { c.fillStyle = color2; c.fillRect(cx, cy, 1, 1); }
    c.globalAlpha = 1;
    const cs = size * scale;
    const scaled = document.createElement('canvas');
    scaled.width=cs; scaled.height=cs;
    const sc = scaled.getContext('2d');
    sc.imageSmoothingEnabled = false;
    sc.drawImage(cv, 0, 0, cs, cs);
    dataUrl = scaled.toDataURL('image/png');
    hotX = Math.floor(cs/2); hotY = Math.floor(cs/2);
    fallback = 'crosshair';
  }

  const css = "url('" + dataUrl + "') " + hotX + " " + hotY + ", " + fallback;
  _cursorCache.set(cacheKey, css);
  return css;
}

function getReticle(id)   { return RETICLE_REGISTRY.find(r => r.id === id) || null; }
function getSprite(id)    { return CURSOR_SPRITES.find(s => s.id === id) || null; }
function listReticleIds() { return RETICLE_REGISTRY.map(r => r.id); }
function listSpriteIds()  { return CURSOR_SPRITES.map(s => s.id); }
function listContexts()   { return Object.keys(CURSOR_CONTEXTS); }

// Bake the always-on cursors into CSS vars on :root so html/body
// + shared.css rules pick them up. Called immediately if the DOM
// is ready, otherwise on DOMContentLoaded. Safe to call again
// later (e.g. after a player palette change in settings).
function refreshCursorVars(playerSettings) {
  const root = document.documentElement;
  if (!root) return;
  root.style.setProperty('--cursor-pointer', generateCursor('pointer', playerSettings));
  root.style.setProperty('--cursor-hand',    generateCursor('hand',    playerSettings));
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => refreshCursorVars());
} else {
  refreshCursorVars();
}


/* ============================================================
   Asset pool / random pick
   ------------------------------------------------------------
   Engine-wide primitives for "pick N sprites from a pool with
   sticky-after-first-roll caching." Used for:
   - asteroid scatter on any space-context surface (viewscreen,
     encounter bg layer, salvage debris field)
   - bg variant rolls (salvage_bg_planet, _planet2, …)
   - any future "decoration pool" need (junk piles, bushes,
     equipment racks, NPC clusters)

   Layers, smallest → largest:
     probeImage(path)            async image load probe
     pickFromList(key, list, n)  sticky random pick (1 or N)
     pickAsteroids(key, n)       alias over the 81-sprite grid
     scatterLayout(n, opts)      sync non-overlap scatter (generic)
     resetPickCache(prefix?)     clear cached picks on scene change

   Encounter (demo-encounter.html) has its own local copies of
   probeImage / pickFromList / _bgPicked that pre-date this section.
   Lexical scope means its IIFE locals win — no conflict, no breakage.
   Migrating encounter onto these globals is a separate cleanup pass.
   ============================================================ */

const ASTEROIDS_DIR = 'sprites/asteroids/';
const ASTEROID_FILES = (() => {
  const out = [];
  for (let r = 1; r <= 9; r++) for (let c = 1; c <= 9; c++) {
    out.push(ASTEROIDS_DIR + 'r' + r + '_c' + c + '.png');
  }
  return out;
})();

// cacheKey → chosen string (n=1) | string[] (n>1).
// Sticky: same key returns same pick until resetPickCache() clears it.
const _pickCache = new Map();

function probeImage(path) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve(path);
    img.onerror = () => resolve(null);
    img.src = path;
  });
}

// Sticky random pick from a candidate list.
//   n === 1 → returns string | null            (encounter signature)
//   n  >  1 → returns string[] (sample w/o replacement, capped at list.length)
// Same cacheKey returns the same selection on every subsequent call
// until resetPickCache() clears it. Lets re-renders be stable without
// the caller threading "did I already pick?" state.
function pickFromList(cacheKey, list, n = 1) {
  const empty = n === 1 ? null : [];
  if (!list || !list.length) return empty;
  if (_pickCache.has(cacheKey)) return _pickCache.get(cacheKey);
  let chosen;
  if (n === 1) {
    chosen = list[Math.floor(Math.random() * list.length)];
  } else {
    const pool = list.slice();
    const k = Math.min(n, pool.length);
    chosen = [];
    for (let i = 0; i < k; i++) {
      const j = Math.floor(Math.random() * pool.length);
      chosen.push(pool.splice(j, 1)[0]);
    }
  }
  _pickCache.set(cacheKey, chosen);
  return chosen;
}

// Convenience: pick N unique asteroid sprites from the shared 81-grid.
// cacheKey scopes the pick — different scenes pass different keys so
// they get independent (and stable) selections.
//   pickAsteroids('viewscreen', 1)         → ['sprites/asteroids/r3_c5.png']
//   pickAsteroids('salvage-debris', 12)    → 12 unique paths
function pickAsteroids(cacheKey, n) {
  const r = pickFromList(cacheKey, ASTEROID_FILES, n);
  return Array.isArray(r) ? r : (r ? [r] : []);
}

// Clear sticky picks. No arg → clear all. With prefix → clear only
// keys that start with it (e.g. resetPickCache('salvage-') wipes
// salvage scene state without disturbing encounter's picks).
function resetPickCache(prefix) {
  if (!prefix) { _pickCache.clear(); return; }
  for (const k of [..._pickCache.keys()]) {
    if (k.indexOf(prefix) === 0) _pickCache.delete(k);
  }
}

// Loot pools by scene context. Weighted random draws via rollCratePool() below.
// r = resource/material id matching materials.json. w = relative weight.
const CRATE_POOLS = {
  asteroid: [{r:'minerals',w:6},{r:'scrap',w:6},{r:'metal',w:3},{r:'exotic',w:1},{r:'biocomponent',w:1}],
  deepspace: [{r:'metal',w:5},{r:'exotic',w:3},{r:'scrap',w:2},{r:'biocomponent',w:1}],
  space:     [{r:'metal',w:5},{r:'exotic',w:3},{r:'scrap',w:2},{r:'biocomponent',w:1}],
  planet:    [{r:'biocomponent',w:6},{r:'minerals',w:3},{r:'metal',w:2},{r:'scrap',w:2}],
};

// Tiny seedable LCG. Same seed → same sequence. Lets scatterLayout
// produce reproducible placements (QA, screenshots, stable scene
// composition across re-renders without re-rolling).
function _seededRng(seed) {
  let s = (seed | 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 1000000) / 1000000;
  };
}

// ENGINE-LAYER ONLY — not called by any demo.
// Reserved for Phase 2 procedural placement: asteroid fields, NPC cluster
// seeding, item scatter on salvage surfaces. Do not delete; do not call
// from demos. See GAME_BIBLE.md §9 (Map Generation) for intended use.
function scatterLayout(n, opts) {
  opts = opts || {};
  const bounds      = opts.bounds     || { x:0, y:0, w:1, h:1 };
  const minSpacing  = opts.minSpacing || 0;
  const sizeRange   = opts.sizeRange  || [1, 1];
  const rotRange    = opts.rotRange   || [0, 0];
  const seed        = opts.seed != null ? opts.seed : (Date.now() & 0x7fffffff);
  const maxAttempts = opts.maxAttempts != null ? opts.maxAttempts : n * 30;

  const rng = _seededRng(seed);
  const placed = [];
  const minSq = minSpacing * minSpacing;
  let attempts = 0;
  while (placed.length < n && attempts < maxAttempts) {
    attempts++;
    const x = bounds.x + rng() * bounds.w;
    const y = bounds.y + rng() * bounds.h;
    if (minSpacing > 0) {
      let ok = true;
      for (let i = 0; i < placed.length; i++) {
        const dx = x - placed[i].x, dy = y - placed[i].y;
        if (dx * dx + dy * dy < minSq) { ok = false; break; }
      }
      if (!ok) continue;
    }
    const scale = sizeRange[0] + rng() * (sizeRange[1] - sizeRange[0]);
    const rot   = rotRange[0]  + rng() * (rotRange[1]  - rotRange[0]);
    placed.push({ x: x, y: y, scale: scale, rot: rot });
  }
  return placed;
}


/* ============================================================
   Pause system — PauseBus + auto-mounted Bridge Terminal overlay
   ------------------------------------------------------------
   PauseBus is a tiny pub/sub each demo's rAF loop checks at the
   top of every frame:

     function frame(now){
       if(PauseBus.paused){ rafId = requestAnimationFrame(frame); return; }
       // …real frame…
     }

   onChange(fn) lets a demo do per-game pause work (for example,
   dim active visuals) without polling. setTimeout-based
   timers keep ticking — that's intentional MVP scope; the real
   STATE-pass refactor will pause those too.

   PauseMenu auto-mounts on every page that links shared.js. ESC
   toggles it (suppressed while body.modal-open is set, so per-
   demo modals retain their close-on-Esc convention). A small
   pause icon at bottom-right is the second open trigger. DOM is
   built lazily on first open.

   Save/load slots use the host engine's saveRun/loadRun hooks when
   present; standalone demos retain a cosmetic localStorage preview.
   The cursor controls in SETTINGS are real (wired through
   refreshCursorVars + persisted in localStorage).
   ============================================================ */

const PauseBus = {
  paused: false,
  listeners: new Set(),
  pause()  {
    if (this.paused) return;
    this.paused = true;
    this.listeners.forEach(fn => { try { fn(true); } catch (e) { console.warn(e); } });
  },
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.listeners.forEach(fn => { try { fn(false); } catch (e) { console.warn(e); } });
  },
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
};
// Classic-script top-level `const` bindings are not properties of window.
// Engine files intentionally probe `window.PauseBus` before consulting it,
// so publish this single shared owner rather than leaving those guards inert.
window.PauseBus = PauseBus;

const TP_SETTINGS_KEY = 'transplant:settings';
const TP_SAVE_PREFIX  = 'transplant:save:';

function tpLoadSettings() {
  try { return JSON.parse(localStorage.getItem(TP_SETTINGS_KEY)) || {}; }
  catch (e) { return {}; }
}
function tpSaveSettings(patch) {
  const next = Object.assign({}, tpLoadSettings(), patch);
  try { localStorage.setItem(TP_SETTINGS_KEY, JSON.stringify(next)); } catch (e) {}
  return next;
}

// Re-apply persisted cursor settings on boot, after the always-on
// cursors have been baked once with defaults. Only cursorColor +
// cursorOutline have any real effect today; text speed remains a stub.
function tpApplyCursorSettings() {
  const s = tpLoadSettings();
  const ps = {};
  if (s.cursorColor)               ps.color1  = s.cursorColor;
  if (s.cursorOutline !== undefined) ps.outline = s.cursorOutline;
  if (Object.keys(ps).length) refreshCursorVars(ps);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', tpApplyCursorSettings);
} else {
  tpApplyCursorSettings();
}

const PauseMenu = (() => {
  const PAUSE_ICON_DIR = 'sprites/interface/pause/';
  const SECTIONS = [
    { id: 'resume',   label: 'RESUME',     icon: 'resume.png'   },
    { id: 'settings', label: 'SETTINGS',   icon: 'settings.png' },
    { id: 'save',     label: 'SAVE',       icon: 'save.png'     },
    { id: 'load',     label: 'LOAD',       icon: 'load.png'     },
    { id: 'log',      label: "SHIP'S LOG", icon: 'log.png'      },
    { id: 'help',     label: 'HELP',       icon: 'help.png'     },
    { id: 'quit',     label: 'QUIT',       icon: 'quit.png'     },
  ];

  const CURSOR_SWATCHES = [
    { id: 'gold',  hex: '#c8a85a', label: 'GOLD'  },
    { id: 'cream', hex: '#e8d8a0', label: 'CREAM' },
    { id: 'teal',  hex: '#35c6bf', label: 'TEAL'  },
    { id: 'red',   hex: '#cc3333', label: 'RED'   },
  ];

  let overlay = null;
  let selected = 'resume';
  let toastTimer = null;

  function isOpen() { return overlay && !overlay.hidden; }

  // Prefer mounting inside the demo's game container so the overlay
  // sits within the 960×640 stage like other modals (per spec). Falls
  // back to <body> with a fixed-position class if no container exists.
  function findHost() {
    return document.getElementById('game')
        || document.getElementById('scale-root')
        || document.body;
  }
  function ensurePositioned(host) {
    if (host === document.body) return;
    const s = getComputedStyle(host);
    if (s.position === 'static') host.style.position = 'relative';
  }

  function build() {
    overlay = document.createElement('div');
    overlay.id = 'pause-overlay';
    overlay.className = 'pause-overlay';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="pause-shell">' +
        '<div class="pause-bezel">' +
          '<div class="pause-screen">' +
            '<div class="pause-topbar">' +
              '<span class="pause-led"></span>' +
              '<span class="pause-title">BRIDGE TERMINAL · PAUSED</span>' +
              '<button type="button" class="pause-close-hint" aria-label="Close (Esc)">ESC ✕</button>' +
            '</div>' +
            '<div class="pause-body">' +
              '<nav class="pause-sidebar" role="menu"></nav>' +
              '<main class="pause-content"></main>' +
            '</div>' +
            '<div class="pause-toast" hidden></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    const host = findHost();
    if (host === document.body) overlay.classList.add('pause-overlay-fixed');
    ensurePositioned(host);
    host.appendChild(overlay);

    overlay.querySelector('.pause-close-hint').addEventListener('click', close);

    const sidebar = overlay.querySelector('.pause-sidebar');
    SECTIONS.forEach(sec => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pause-item';
      b.dataset.section = sec.id;
      b.setAttribute('role', 'menuitem');
      b.innerHTML =
        '<span class="pause-arrow">▶</span>' +
        (sec.icon ? '<span class="pause-item-icon" style="--icon:url(\'' + PAUSE_ICON_DIR + sec.icon + '\')"></span>' : '') +
        '<span class="pause-label">' + sec.label + '</span>';
      b.addEventListener('mouseenter', () => select(sec.id, false));
      b.addEventListener('click', () => activate(sec.id));
      sidebar.appendChild(b);
    });
    overlay.addEventListener('click', e => {
      // Outer dim click could close, but the spec says full takeover —
      // require ESC or RESUME. Swallow stray clicks on the dim layer.
      if (e.target === overlay) e.stopPropagation();
    });
  }

  function open() {
    if (!overlay) build();
    overlay.hidden = false;
    document.body.classList.add('pause-open');
    selected = 'resume';
    select('resume', true);
    PauseBus.pause();
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove('pause-open');
    PauseBus.resume();
  }

  function toggle() {
    if (isOpen()) close();
    else if (!document.body.classList.contains('modal-open')) open();
  }

  function select(id, render) {
    selected = id;
    overlay.querySelectorAll('.pause-item').forEach(b => {
      b.classList.toggle('selected', b.dataset.section === id);
    });
    if (render !== false) renderSection(id);
  }

  function activate(id) {
    select(id, true);
    if (id === 'resume') close();
  }

  function toast(msg) {
    const el = overlay.querySelector('.pause-toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 1600);
  }

  function renderSection(id) {
    const c = overlay.querySelector('.pause-content');
    c.innerHTML = '';
    if (id === 'resume')   c.appendChild(panelWelcome());
    else if (id === 'settings') c.appendChild(panelSettings());
    else if (id === 'save')     c.appendChild(panelSaveLoad('save'));
    else if (id === 'load')     c.appendChild(panelSaveLoad('load'));
    else if (id === 'log')      c.appendChild(panelLog());
    else if (id === 'help')     c.appendChild(panelHelp());
    else if (id === 'quit')     c.appendChild(panelQuit());
  }

  // --- panels ---

  function panelWelcome() {
    const w = document.createElement('div');
    w.className = 'pause-panel';
    w.innerHTML =
      '<h2 class="pause-h">WELCOME, CAPTAIN.</h2>' +
      '<pre class="pause-pre">' +
        '[ SYSTEMS NOMINAL ]\n' +
        '> ALL HANDS ACCOUNTED FOR.\n' +
        '> CROP STATUS  · pending readout\n' +
        '> TRAIL        · in transit\n' +
        '> JOURNAL DRIVE· offline\n\n' +
        'Select an option from the panel at left.\n' +
        'Press ESC or RESUME to return to your post.' +
      '</pre>';
    return w;
  }

  function panelSettings() {
    const s = tpLoadSettings();
    const w = document.createElement('div');
    w.className = 'pause-panel';
    w.innerHTML =
      '<h2 class="pause-h">SETTINGS</h2>' +
      '<div class="pause-form">' +
        '<div class="pause-row">' +
          '<label>CURSOR COLOR</label>' +
          '<div class="pause-swatches" data-field="cursorColor">' +
            CURSOR_SWATCHES.map(sw =>
              '<button type="button" class="pause-swatch' + ((s.cursorColor||'#c8a85a').toLowerCase() === sw.hex.toLowerCase() ? ' on' : '') +
              '" data-hex="' + sw.hex + '" title="' + sw.label + '" style="--sw:' + sw.hex + '"></button>'
            ).join('') +
          '</div>' +
        '</div>' +
        '<div class="pause-row">' +
          '<label>CURSOR OUTLINE</label>' +
          '<button type="button" class="pause-toggle" data-field="cursorOutline" data-on="' + (s.cursorOutline === false ? '0' : '1') + '">' +
            (s.cursorOutline === false ? 'OFF' : 'ON') +
          '</button>' +
        '</div>' +
        '<div class="pause-row stub">' +
          '<label>TEXT SPEED <span class="pause-stub">·STUB</span></label>' +
          '<div class="pause-radios" data-field="textSpeed">' +
            ['slow','normal','fast'].map(v =>
              '<button type="button" class="pause-radio' + ((s.textSpeed||'normal') === v ? ' on' : '') + '" data-val="' + v + '">' + v.toUpperCase() + '</button>'
            ).join('') +
          '</div>' +
        '</div>' +
      '</div>';

    // Cursor swatches — REAL
    w.querySelectorAll('.pause-swatch').forEach(b => {
      b.addEventListener('click', () => {
        const hex = b.dataset.hex;
        const next = tpSaveSettings({ cursorColor: hex });
        refreshCursorVars({
          color1: hex,
          outline: next.cursorOutline !== false,
        });
        w.querySelectorAll('.pause-swatch').forEach(o => o.classList.toggle('on', o === b));
      });
    });

    // Cursor outline — REAL
    const tog = w.querySelector('.pause-toggle[data-field="cursorOutline"]');
    tog.addEventListener('click', () => {
      const cur = tog.dataset.on === '1';
      const nv = !cur;
      tog.dataset.on = nv ? '1' : '0';
      tog.textContent = nv ? 'ON' : 'OFF';
      const next = tpSaveSettings({ cursorOutline: nv });
      refreshCursorVars({
        color1: next.cursorColor || undefined,
        outline: nv,
      });
    });

    // Stub — persist for future text-speed wiring.
    w.querySelectorAll('.pause-radios').forEach(group => {
      group.addEventListener('click', e => {
        const b = e.target.closest('.pause-radio'); if (!b) return;
        group.querySelectorAll('.pause-radio').forEach(o => o.classList.toggle('on', o === b));
        tpSaveSettings({ [group.dataset.field]: b.dataset.val });
      });
    });

    return w;
  }

  function panelSaveLoad(mode) {
    const w = document.createElement('div');
    w.className = 'pause-panel';
    const inEngine = typeof window.saveRun === 'function' && typeof window.loadRun === 'function';
    const slots = [1,2,3].map(n => {
      let blob = null;
      try { blob = JSON.parse(localStorage.getItem(TP_SAVE_PREFIX + n)); } catch (e) {}
      return { n, blob };
    });
    w.innerHTML =
      '<h2 class="pause-h">' + (mode === 'save' ? 'SAVE GAME' : 'LOAD GAME') + '</h2>' +
      '<p class="pause-sub">' + (inEngine
        ? 'LOCAL SLOTS · SAVES BETWEEN ENCOUNTERS · LOADS RETURN TO CRUISE'
        : 'SLOTS WRITE TO LOCAL STORAGE · CONTENTS COSMETIC IN THIS DEMO') + '</p>' +
      '<div class="pause-slots">' +
        slots.map(s => {
          const empty = !s.blob;
          const ts = empty ? '' : new Date(s.blob.ts || 0).toISOString().replace('T',' ').slice(0,16);
          const label = empty ? 'EMPTY' : (inEngine && s.blob.v === 1
            ? String(s.blob.trail || 'RUN').toUpperCase() + ' · DAY ' + Math.floor(s.blob.daysElapsed || 0)
            : (s.blob.label || 'SAVE'));
          return (
            '<div class="pause-slot' + (empty ? ' empty' : '') + '" data-slot="' + s.n + '">' +
              '<span class="pause-slot-n">SLOT ' + s.n + '</span>' +
              '<span class="pause-slot-meta">' + label + (empty ? '' : ' · ' + ts) + '</span>' +
              (mode === 'save'
                ? '<button type="button" class="pause-btn" data-act="save">SAVE</button>'
                : '<button type="button" class="pause-btn"' + (empty ? ' disabled' : '') + ' data-act="load">LOAD</button>') +
            '</div>'
          );
        }).join('') +
      '</div>';

    w.querySelectorAll('.pause-slot').forEach(row => {
      const n = parseInt(row.dataset.slot, 10);
      const btn = row.querySelector('.pause-btn');
      btn.addEventListener('click', () => {
        if (btn.dataset.act === 'save') {
          if (inEngine) {
            if (!window.saveRun(TP_SAVE_PREFIX + n)) {
              toast('SAVE UNAVAILABLE — RETURN TO CRUISE');
              return;
            }
          } else {
            const blob = { ts: Date.now(), label: 'TEST · DAY 0' };
            try { localStorage.setItem(TP_SAVE_PREFIX + n, JSON.stringify(blob)); } catch (e) {}
          }
          toast('SAVED TO SLOT ' + n);
          renderSection('save');
        } else {
          if (btn.disabled) return;
          if (inEngine) {
            if (window.loadRun(TP_SAVE_PREFIX + n)) close();
            else toast('LOAD FAILED — SLOT IS NOT A RUN SAVE');
          } else {
            toast('LOADED SLOT ' + n + ' (cosmetic — no state restored)');
          }
        }
      });
    });
    return w;
  }

  // Pause SHIP'S LOG sub-panel. In the engine (window.openShipsLog
  // exists), it previews the last few live entries and opens the
  // engine-backed journal overlay. On standalone demo pages it falls
  // back to launching demo-shipslog.html as before.
  function panelLog() {
    const w = document.createElement('div');
    w.className = 'pause-panel';
    const inEngine = typeof window.openShipsLog === 'function';
    let previewHtml = '';
    // NB: index.html declares STATE with const — global binding, but NOT
    // window.STATE. typeof-check reaches it across script boundaries.
    if (inEngine && typeof STATE !== 'undefined' && Array.isArray(STATE.shipLog) && STATE.shipLog.length) {
      const recent = STATE.shipLog.slice(-4).reverse();
      previewHtml = '<div class="pause-log-preview">' + recent.map(e =>
        '<div class="pause-log-line">D' + e.day + ' · ' + String(e.text).replace(/</g, '&lt;').slice(0, 90) + '</div>'
      ).join('') + '</div>';
    }
    w.innerHTML =
      '<h2 class="pause-h">SHIP\'S LOG</h2>' +
      '<p class="pause-log-blurb">Live log accumulating since launch — your decisions, discoveries, and quiet days, recorded in your AI\'s voice.</p>' +
      previewHtml +
      '<div class="pause-log-actions">' +
        '<button type="button" class="pause-btn" data-act="open-log">OPEN SHIP\'S LOG' + (inEngine ? '' : ' ↗') + '</button>' +
      '</div>';
    w.querySelector('[data-act="open-log"]').addEventListener('click', () => {
      if (inEngine) {
        PauseMenu.close && PauseMenu.close();
        window.openShipsLog();
      } else {
        window.open('demo-shipslog.html', '_blank', 'noopener');
      }
    });
    return w;
  }

  function panelHelp() {
    const w = document.createElement('div');
    w.className = 'pause-panel';
    w.innerHTML =
      '<h2 class="pause-h">HELP</h2>' +
      '<div class="pause-help-cols">' +
        '<div class="pause-help-col">' +
          '<h3 class="pause-h3">MOUSE</h3>' +
          '<dl class="pause-dl">' +
            '<dt>LEFT CLICK</dt><dd>Interact · select</dd>' +
            '<dt>HOVER</dt><dd>Preview without committing</dd>' +
            '<dt>DRAG</dt><dd>Slider commit · scroll thumb</dd>' +
          '</dl>' +
        '</div>' +
        '<div class="pause-help-col">' +
          '<h3 class="pause-h3">KEYBOARD</h3>' +
          '<dl class="pause-dl">' +
            '<dt>ESC</dt><dd>Open this terminal · close modal</dd>' +
            '<dt>↑ ↓</dt><dd>Navigate menu</dd>' +
            '<dt>ENTER</dt><dd>Confirm</dd>' +
            '<dt>← →</dt><dd>Cycle (where supported)</dd>' +
          '</dl>' +
        '</div>' +
      '</div>' +
      '<p class="pause-blurb">' +
        'TRANS-PLANT — a deep-space crossing with a crew, a cargo hold, and a crop. ' +
        'The crop is the mission. Get it home alive. ' +
        'Choose your trail, ration carefully, and listen to the AI when it sounds nervous.' +
      '</p>';
    return w;
  }

  function panelQuit() {
    const w = document.createElement('div');
    w.className = 'pause-panel pause-quit';
    w.innerHTML =
      '<h2 class="pause-h danger">QUIT TO TITLE</h2>' +
      '<p class="pause-quit-prompt">RETURN TO TITLE? UNSAVED PROGRESS WILL BE LOST.</p>' +
      '<div class="pause-quit-actions">' +
        '<button type="button" class="pause-btn pause-btn-danger" data-act="confirm">CONFIRM</button>' +
        '<button type="button" class="pause-btn" data-act="cancel">CANCEL</button>' +
      '</div>';
    w.querySelector('[data-act="confirm"]').addEventListener('click', () => {
      window.location.href = 'demo-title.html';
    });
    w.querySelector('[data-act="cancel"]').addEventListener('click', () => {
      activate('resume');
    });
    return w;
  }

  // Keyboard — global ESC + sidebar arrows/enter while open.
  function onKey(e) {
    if (e.key === 'Escape') {
      if (isOpen()) { e.preventDefault(); close(); return; }
      if (document.body.classList.contains('modal-open')) return;  // demo modals own ESC
      e.preventDefault(); open(); return;
    }
    if (!isOpen()) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = SECTIONS.findIndex(s => s.id === selected);
      const j = (i + (e.key === 'ArrowDown' ? 1 : -1) + SECTIONS.length) % SECTIONS.length;
      select(SECTIONS[j].id, true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activate(selected);
    }
  }

  let _initialized = false;
  function init() {
    if (_initialized) return;
    _initialized = true;
    document.addEventListener('keydown', onKey);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { open, close, toggle, isOpen, PauseBus };
})();

/* ─────────────────────────────────────────────────────────────────
   MarketModal — generic vendor buy/sell/trade overlay
   ─────────────────────────────────────────────────────────────────
   Mounts a modal authored by `.enc-market` markup somewhere in the
   host demo's DOM. Host provides:
     - vendor:    { name, greeting, farewell, wares: [...], buyPrices: {id: g}, flavor: { buy/sell/deny/no_buyback: [...] } }
     - getGold/setGold  callbacks
     - getCargo:  () => Array<{ id, name, icon }>
     - addCargo:  (entry) => void
     - canAddCargo: (ware) => bool  (OPTIONAL pre-buy gate, checked
                    before any cost applies — engine cargo capacity.
                    Refusal logs cargoFullMsg (optional string) as deny.)
     - removeCargo: (id) => void   (removes one matching id)
     - logEl:     element to receive .market-log-line children (the running log)
     - hostEl:    element that receives .market-mode class (drives reflow)
     - rootId:    DOM id of the .enc-market element (default 'enc-market')
     - readouts:  { goldId } DOM ids for the gold readout (default 'market-gold-readout')
     - listIds:   { buy, sell } DOM ids for the two side-pane <ul>s (defaults market-buy-list / market-sell-list)
     - closeBtnId: DOM id of the STEP BACK button (default 'market-close-btn')
     - subjectNameEl: optional element to overwrite with vendor.name on mount
     - onClose:   () => void  fires after farewell logged + DOM cleanup
   Cost shapes (per ware):
     { gold: N }                       → BUY
     { item: 'wheat_sample' }          → TRADE (barter)
     { gold: N, item: 'wheat_sample' } → TRADE (mixed)
   The modal does NOT manage open/close keyboard handlers globally —
   pause menu owns Escape. Hosts can wire their own Escape if they want.
   ─────────────────────────────────────────────────────────────── */
const MarketModal = (function() {
  let _state = null;   // active session: { opts, consumedWares: Set, soldCargoIdxs: Set, originalSubjectName: string | null }

  function $$(id) { return document.getElementById(id); }

  function isOpen() { return !!_state; }

  function mount(opts) {
    if (_state) close();   // safety — never double-mount
    const rootId   = opts.rootId   || 'enc-market';
    const closeBtn = opts.closeBtnId || 'market-close-btn';
    const buyId    = (opts.listIds && opts.listIds.buy)  || 'market-buy-list';
    const sellId   = (opts.listIds && opts.listIds.sell) || 'market-sell-list';
    const goldId   = (opts.readouts && opts.readouts.goldId) || 'market-gold-readout';
    _state = {
      opts: Object.assign({}, opts, { rootId, closeBtn, buyId, sellId, goldId }),
      consumedWares:      new Set(),
      soldCargoIdxs:      new Set(),   // fence-mode: index-based deferred removal
      soldCargoById:      new Map(),   // normal-mode: id → count sold this session
      purchasedWareCosts: new Map(),   // id → cost obj, for discounted buyback
      originalSubjectName: null
    };
    // Subject name is left as-is — the NPC's generated name remains.
    // The vendor's display name lives in the modal header / log, not
    // in the encounter's subject slot.
    // Host reflow — apply .market-mode so the demo can hide its
    // scenario UI and reshape the dialog strip into a log column.
    if (opts.hostEl) opts.hostEl.classList.add('market-mode');
    // Mount the modal element.
    const root = $$(rootId);
    if (root) root.classList.remove('hidden');
    // Initial log: greeting, then fence notice if vendor uses wantedTags
    // and the player is carrying something they'd want.
    if (opts.logEl) {
      opts.logEl.innerHTML = '';
      opts.logEl.classList.remove('hidden');
      if (opts.vendor && opts.vendor.greeting) {
        appendLog(opts.vendor.greeting, 'flavor');
      }
      if (opts.vendor && opts.vendor.wantedTags && opts.getCargo) {
        const cargo = opts.getCargo();
        const hasFenceable = cargo.some(item =>
          item.tags && item.tags.some(t => opts.vendor.wantedTags.includes(t))
        );
        if (hasFenceable) {
          const notice = (opts.vendor.flavor && opts.vendor.flavor.fence)
            ? opts.vendor.flavor.fence[0]
            : '*eyes your cargo*';
          appendLog(notice, 'flavor');
        }
      }
    }
    // Bind close button.
    const btn = $$(closeBtn);
    if (btn) {
      btn._marketBound && btn.removeEventListener('click', btn._marketBound);
      btn._marketBound = () => close();
      btn.addEventListener('click', btn._marketBound);
    }
    refreshGoldReadout();
    renderLists();
  }

  function close() {
    if (!_state) return;
    const opts = _state.opts;
    if (opts.vendor && opts.vendor.farewell && opts.logEl) {
      appendLog(opts.vendor.farewell, 'flavor');
    }
    // Compact host cargo — two deferred-removal paths:
    // fence mode uses index-based soldCargoIdxs (specific tagged items);
    // normal sell uses soldCargoById (id → count, one removeCargo call per unit).
    if (opts.getCargo && opts.removeCargo) {
      if (_state.soldCargoIdxs.size) {
        const cargo = opts.getCargo();
        Array.from(_state.soldCargoIdxs)
          .map(i => cargo[i] && cargo[i].id)
          .filter(Boolean)
          .forEach(id => opts.removeCargo(id));
      }
      _state.soldCargoById.forEach((count, id) => {
        for (let i = 0; i < count; i++) opts.removeCargo(id);
      });
    }
    // Hide the modal element.
    const root = $$(opts.rootId);
    if (root) root.classList.add('hidden');
    if (opts.hostEl) opts.hostEl.classList.remove('market-mode');
    // Restore subject name.
    if (opts.subjectNameEl && _state.originalSubjectName !== null) {
      opts.subjectNameEl.textContent = _state.originalSubjectName;
    }
    const onClose = opts.onClose;
    _state = null;
    if (typeof onClose === 'function') onClose();
  }

  function appendLog(text, kind) {
    if (!_state || !_state.opts.logEl) return;
    const line = document.createElement('div');
    line.className = 'market-log-line ' + (kind || '');
    line.textContent = text;
    _state.opts.logEl.appendChild(line);
    _state.opts.logEl.scrollTop = _state.opts.logEl.scrollHeight;
  }

  function refreshGoldReadout() {
    if (!_state) return;
    const el = $$(_state.opts.goldId);
    if (!el || !_state.opts.getGold) return;
    el.textContent = _state.opts.getGold() + ' gold';
  }

  function flashGold(delta) {
    const el = $$(_state.opts.goldId);
    if (!el) return;
    el.classList.remove('delta-flash', 'pos', 'neg');
    void el.offsetWidth;
    el.classList.add('delta-flash', delta > 0 ? 'pos' : 'neg');
  }

  function pickFlavor(kind) {
    const v = _state.opts.vendor;
    const pool = v && v.flavor && v.flavor[kind];
    return (pool && pool.length) ? pool[Math.floor(Math.random() * pool.length)] : '';
  }

  function formatCost(cost) {
    if (!cost) return '';
    const parts = [];
    if (cost.gold) parts.push(cost.gold + 'g');
    if (cost.item) parts.push(prettyItemName(cost.item));
    return parts.join(' + ');
  }
  function formatNegativeCost(cost) {
    const parts = [];
    if (cost.gold) parts.push('-' + cost.gold + 'g');
    if (cost.item) parts.push('-1 ' + prettyItemName(cost.item));
    return parts.join(', ');
  }
  function prettyItemName(id) {
    if (!_state) return id;
    const cargo = _state.opts.getCargo && _state.opts.getCargo();
    const found = cargo && cargo.find(c => c.id === id);
    if (found) return found.name.toLowerCase();
    // Look up in vendor wares too.
    const v = _state.opts.vendor;
    if (v && v.wares) {
      const w = v.wares.find(x => x.id === id);
      if (w) return w.name.toLowerCase();
    }
    return id.replace(/_/g, ' ');
  }

  function playerHasItem(id) {
    if (!_state || !_state.opts.getCargo) return false;
    const cargo = _state.opts.getCargo();
    // Skip indexes already sold this session.
    return cargo.some((c, i) => c.id === id && !_state.soldCargoIdxs.has(i));
  }
  function canAffordCost(cost) {
    if (!cost) return true;
    if (cost.gold && _state.opts.getGold() < cost.gold) return false;
    if (cost.item && !playerHasItem(cost.item)) return false;
    return true;
  }
  function applyCost(cost) {
    if (cost.gold) _state.opts.setGold(_state.opts.getGold() - cost.gold);
    if (cost.item && _state.opts.removeCargo) _state.opts.removeCargo(cost.item);
  }

  function renderLists() {
    renderBuy();
    renderSell();
    refreshGoldReadout();
  }

  function makeIcon(icon) {
    const el = document.createElement('div');
    el.className = 'market-row-icon';
    if (icon && /\.(png|jpg)$/i.test(icon)) {
      el.style.backgroundImage = "url('" + icon + "')";
    } else {
      el.textContent = icon || '📦';
    }
    return el;
  }
  function makeName(name) {
    const el = document.createElement('div');
    el.className = 'market-row-name';
    el.textContent = name;
    return el;
  }

  function renderBuy() {
    const list = $$(_state.opts.buyId);
    if (!list) return;
    list.innerHTML = '';
    const wares = (_state.opts.vendor && _state.opts.vendor.wares) || [];
    wares.forEach((ware, idx) => {
      const consumed = _state.consumedWares.has(idx);
      const afford   = canAffordCost(ware.cost);
      const row = document.createElement('div');
      row.className = 'market-row' + (consumed ? ' consumed' : '') + (!consumed && !afford ? ' locked' : '');
      if (ware.desc) row.dataset.tip = ware.desc;
      row.appendChild(makeIcon(ware.icon));
      row.appendChild(makeName(ware.name));
      const costEl = document.createElement('div');
      costEl.className = 'market-row-cost';
      if (consumed) {
        costEl.classList.add('locked');
        costEl.textContent = 'sold';
      } else {
        costEl.textContent = formatCost(ware.cost);
        if (ware.cost.item && ware.cost.gold) costEl.classList.add('mixed');
        else if (ware.cost.item)               costEl.classList.add('barter');
        if (!afford) costEl.classList.add('locked');
      }
      row.appendChild(costEl);
      const btn = document.createElement('button');
      btn.className = 'market-row-btn';
      btn.textContent = ware.cost.item ? 'TRADE' : 'BUY';
      btn.disabled = consumed || !afford;
      btn.addEventListener('click', () => buyWare(idx));
      row.appendChild(btn);
      list.appendChild(row);
    });
  }
  function renderSell() {
    const list = $$(_state.opts.sellId);
    if (!list) return;
    list.innerHTML = '';
    const vendor  = _state.opts.vendor;
    const isFence = !!(vendor && vendor.wantedTags);
    const side    = list.closest('.market-side');
    const titleEl = side && side.querySelector('.market-side-title');
    if (side) side.classList.toggle('fence-mode', isFence);

    const cargo = (_state.opts.getCargo && _state.opts.getCargo()) || [];

    if (isFence) {
      // Fence mode: only show items the vendor wants (tagged cargo).
      if (titleEl) titleEl.textContent = 'FENCE ITEM';
      const fencePrices  = vendor.fencePrices  || {};
      const wantedTags   = vendor.wantedTags;
      const defaultValue = vendor.defaultFenceValue || 10;
      let hasAny = false;
      cargo.forEach((entry, idx) => {
        if (_state.soldCargoIdxs.has(idx)) return;
        if (!entry.tags || !entry.tags.some(t => wantedTags.includes(t))) return;
        hasAny = true;
        const offer = fencePrices[entry.id] != null ? fencePrices[entry.id] : defaultValue;
        const row = document.createElement('div');
        row.className = 'market-row';
        if (entry.desc) row.dataset.tip = entry.desc;
        row.appendChild(makeIcon(entry.icon));
        row.appendChild(makeName(entry.name));
        const costEl = document.createElement('div');
        costEl.className = 'market-row-cost';
        costEl.textContent = '+' + offer + 'g';
        row.appendChild(costEl);
        const btn = document.createElement('button');
        btn.className = 'market-row-btn';
        btn.textContent = 'FENCE';
        btn.addEventListener('click', () => fenceItem(idx, offer));
        row.appendChild(btn);
        list.appendChild(row);
      });
      if (side) side.classList.toggle('hidden', !hasAny);
    } else {
      // Normal sell: group cargo by id (stacked display), one row per
      // unique item. SELL removes one unit at a time. Buyback price
      // applies when the player bought from this vendor but the vendor
      // has no standing buyPrices entry — floor(gold_cost × 0.6).
      if (titleEl) titleEl.textContent = 'YOUR CARGO';
      if (side) side.classList.remove('hidden');
      const buyPrices = (vendor && vendor.buyPrices) || {};

      // Count how many of each id remain in cargo (total minus sold).
      const groups = new Map(); // id → { entry, total }
      cargo.forEach(entry => {
        if (!groups.has(entry.id)) groups.set(entry.id, { entry, total: 0 });
        groups.get(entry.id).total++;
      });

      groups.forEach(({ entry, total }, id) => {
        const sold      = _state.soldCargoById.get(id) || 0;
        const available = total - sold;
        if (available <= 0) return;

        const regularOffer  = buyPrices[id];
        const purchasedCost = _state.purchasedWareCosts.get(id);
        const buybackOffer  = (purchasedCost && purchasedCost.gold)
          ? Math.max(1, Math.floor(purchasedCost.gold * 0.6))
          : null;
        const offer     = regularOffer || buybackOffer;
        const isBuyback = !regularOffer && !!buybackOffer;

        const row = document.createElement('div');
        row.className = 'market-row' + (offer ? '' : ' locked');
        if (entry.desc) row.dataset.tip = entry.desc;
        row.appendChild(makeIcon(entry.icon));

        // Name cell with optional stack-count badge.
        const nameWrap = document.createElement('div');
        nameWrap.className = 'market-row-name';
        nameWrap.textContent = entry.name;
        if (available > 1) {
          const badge = document.createElement('span');
          badge.className = 'market-row-count';
          badge.textContent = ' ×' + available;
          nameWrap.appendChild(badge);
        }
        row.appendChild(nameWrap);

        const costEl = document.createElement('div');
        costEl.className = 'market-row-cost';
        if (offer) {
          costEl.textContent = '+' + offer + 'g' + (isBuyback ? ' ↩' : '');
        } else {
          costEl.textContent = 'no offer';
          costEl.classList.add('locked');
        }
        row.appendChild(costEl);

        const btn = document.createElement('button');
        btn.className = 'market-row-btn';
        btn.textContent = 'SELL';
        btn.disabled = !offer;
        btn.addEventListener('click', () => sellCargoStacked(id, offer, entry.name));
        row.appendChild(btn);
        list.appendChild(row);
      });
    }
  }

  function fenceItem(idx, offer) {
    if (!_state) return;
    const cargo = _state.opts.getCargo();
    const entry = cargo && cargo[idx];
    if (!entry || _state.soldCargoIdxs.has(idx)) return;
    _state.opts.setGold(_state.opts.getGold() + offer);
    _state.soldCargoIdxs.add(idx);
    appendLog('Fenced ' + entry.name + ' · +' + offer + 'g', 'system pos');
    const flavor = pickFlavor('fence');
    if (flavor) appendLog(flavor, 'flavor');
    flashGold(offer);
    renderLists();
  }

  function buyWare(idx) {
    if (!_state) return;
    const ware = _state.opts.vendor.wares[idx];
    if (!ware || _state.consumedWares.has(idx)) return;
    if (!canAffordCost(ware.cost)) {
      const deny = pickFlavor('deny');
      if (deny) appendLog(deny, 'deny');
      return;
    }
    // Optional host hook (engine cargo capacity): gate the buy BEFORE
    // any cost applies — a refused buy must leave gold/cargo untouched
    // and the ware unconsumed. Hosts without the hook are unaffected.
    if (_state.opts.canAddCargo && !_state.opts.canAddCargo(ware)) {
      appendLog(_state.opts.cargoFullMsg || 'No room for that.', 'deny');
      return;
    }
    applyCost(ware.cost);
    _state.opts.addCargo({ id: ware.id, name: ware.name, icon: ware.icon });
    if (!ware.stackable) _state.consumedWares.add(idx);
    _state.purchasedWareCosts.set(ware.id, ware.cost);
    appendLog('Bought ' + ware.name + ' · ' + formatNegativeCost(ware.cost), 'system neg');
    const flavor = pickFlavor('buy');
    if (flavor) appendLog(flavor, 'flavor');
    if (ware.cost.gold) flashGold(-ware.cost.gold);
    renderLists();
  }
  function sellCargo(idx) {
    // Legacy index-based sell — kept for fence mode only.
    if (!_state) return;
    const cargo = _state.opts.getCargo();
    const entry = cargo && cargo[idx];
    if (!entry || _state.soldCargoIdxs.has(idx)) return;
    const buyPrices = _state.opts.vendor.buyPrices || {};
    const price = buyPrices[entry.id];
    if (!price) {
      const deny = pickFlavor('no_buyback');
      if (deny) appendLog(deny, 'deny');
      return;
    }
    _state.opts.setGold(_state.opts.getGold() + price);
    _state.soldCargoIdxs.add(idx);
    appendLog('Sold ' + entry.name + ' · +' + price + 'g', 'system pos');
    const flavor = pickFlavor('sell');
    if (flavor) appendLog(flavor, 'flavor');
    flashGold(+price);
    renderLists();
  }

  function sellCargoStacked(id, offer, name) {
    if (!_state || !offer) return;
    const cargo  = _state.opts.getCargo();
    const sold   = _state.soldCargoById.get(id) || 0;
    const available = cargo.filter(e => e.id === id).length - sold;
    if (available <= 0) return;
    _state.soldCargoById.set(id, sold + 1);
    _state.opts.setGold(_state.opts.getGold() + offer);
    // Buyback: item was purchased from this vendor, vendor has no standing
    // buy-price for it. Restore the ware slot so it re-appears as available.
    const buyPrices = (_state.opts.vendor && _state.opts.vendor.buyPrices) || {};
    const isBuyback = !buyPrices[id] && _state.purchasedWareCosts.has(id);
    if (isBuyback) {
      const wares = (_state.opts.vendor && _state.opts.vendor.wares) || [];
      const wareIdx = wares.findIndex(w => w.id === id);
      if (wareIdx >= 0) _state.consumedWares.delete(wareIdx);
    }
    appendLog('Sold ' + name + ' · +' + offer + 'g', 'system pos');
    const flavor = pickFlavor('sell');
    if (flavor) appendLog(flavor, 'flavor');
    flashGold(offer);
    renderLists();
  }

  return { mount, close, isOpen, appendLog };
})();
