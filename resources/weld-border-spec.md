# Pixel Weld Border — Integration Spec

## Goal

Add a chunky-pixel weld bead around the opaque region of any sprite. The bead must:

- Be made of integer-aligned pixels (no anti-aliasing — `image-rendering: pixelated` friendly).
- Have a lumpy, irregular outer edge (welds aren't smooth rectangles).
- Use 3-tone shading (highlight / mid / shadow) for a rounded "tube" feel.
- Be deterministic given a seed so iterations are reproducible.
- Run in pure JS on `ImageData`, no canvas filters, no shaders, no deps.

## Algorithm (one-liner)

For each transparent pixel within `thickness` of an opaque pixel, decide whether to paint it based on a noise-modulated thickness threshold, then color it by its distance from the panel and its outward normal's dot product with the light direction.

## Function

```js
/**
 * @param {ImageData} src   - source pixels; alpha > 127 = "panel"
 * @param {Object} opts
 * @param {number} opts.thickness   max bead thickness in pixels (1-6 typical, default 3)
 * @param {number} opts.bumpiness   0=smooth, 1=very lumpy (default 0.55)
 * @param {number} opts.noiseScale  noise grid size in pixels (2-3 = chunky, default 2)
 * @param {number} opts.seed        hash seed (default 12345)
 * @param {Object} opts.palette     {shadow, mid, highlight, hot}, each [r,g,b,a]
 * @param {number} opts.hotChance   0..1 chance per pixel of "hot spot" override (default 0)
 * @param {number[]} opts.lightDir  [dx, dy] light source vector (default [-1,-1])
 * @returns {ImageData} new ImageData with weld pixels written into transparent areas
 */
function applyWeldBorder(src, opts = {}) {
  const {
    thickness = 3, bumpiness = 0.55, noiseScale = 2, seed = 12345,
    palette = {
      shadow:    [20, 25, 35, 255],
      mid:       [70, 85, 105, 255],
      highlight: [150, 165, 185, 255],
      hot:       [240, 150, 60, 255],
    },
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

    // bumpiness eats into thickness in noisy spots
    const gx = (x / noiseScale) | 0, gy = (y / noiseScale) | 0;
    const n = hash(gx, gy, seed);
    const eff = thickness - bumpiness * (1 - n) * thickness * 0.7;
    if (d > eff) continue;

    // outward normal · light dir
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
```

## Usage

The source `ImageData` MUST have transparent margin around the panel (at least `thickness + 1` pixels on each side) — otherwise the bead has nowhere to go.

```js
// pad the sprite first
const PAD = 8;
const tmp = document.createElement('canvas');
tmp.width = sprite.width + PAD * 2;
tmp.height = sprite.height + PAD * 2;
const tctx = tmp.getContext('2d');
tctx.drawImage(sprite, PAD, PAD);
const src = tctx.getImageData(0, 0, tmp.width, tmp.height);

// weld it
const welded = applyWeldBorder(src, {
  thickness: 3,
  bumpiness: 0.55,
  noiseScale: 2,
  seed: 12345,
  palette: {
    shadow:    [15, 25, 40, 255],
    mid:       [50, 65, 90, 255],
    highlight: [115, 140, 175, 255],
    hot:       [240, 150, 60, 255],
  },
});

// draw it back to your display canvas (with image-rendering: pixelated)
displayCtx.putImageData(welded, 0, 0);
```

## Palette presets

```js
const WELD_PALETTES = {
  gunmetal:      { shadow: [18,22,30,255],  mid: [70,80,95,255],   highlight: [155,165,180,255], hot: [240,150,60,255] },
  panelMatched:  { shadow: [15,25,40,255],  mid: [50,65,90,255],   highlight: [115,140,175,255], hot: [240,150,60,255] },
  freshHot:      { shadow: [40,15,5,255],   mid: [110,55,20,255],  highlight: [240,180,80,255],  hot: [255,240,120,255] }, // pair with hotChance: 0.06
  oxidized:      { shadow: [25,15,15,255],  mid: [85,55,45,255],   highlight: [165,120,80,255],  hot: [110,140,170,255] }, // pair with hotChance: 0.04
  darkSlag:      { shadow: [8,8,10,255],    mid: [30,30,35,255],   highlight: [70,70,80,255],    hot: [200,80,40,255] },
};
```

## Tuning notes

- `thickness` 2–3 reads as "weld bead." 4+ starts looking like a thick frame; use for big sprites only.
- `bumpiness` ~0.5 is the sweet spot. 0 looks too uniform (machine-cut), 0.9+ looks gnawed.
- `noiseScale` 2 = chunky bumps, 1 = jagged/noisy, 3+ = wide lobes.
- `hotChance` 0.04–0.08 with the `freshHot` palette = "just welded, still glowing" effect. Animate by changing the seed each frame.
- For a "just sealed" pulse animation: redraw with rising `hotChance` then fade by lerping toward `gunmetal` palette over ~30 frames.

## Performance

For a 64×64 padded sprite the function runs in <1ms. For static sprites, call once at load. For animated effects (rising/cooling weld), cache the distance transform separately and only re-run the paint loop.
