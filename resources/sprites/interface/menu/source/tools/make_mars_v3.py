#!/usr/bin/env python3
"""MENU-002C2 Mars V3: repair of the V2 skylight chevron (artwork only).

V2's registration (source/provenance/build_menu002c_mars_revised.py)
placed the scaled painting at stage (480, 24); the 24 stage rows above it had
no painting, so they were filled by mirroring rows 25..48 about row 24
(x >= 480, blended into the unscaled source over x 480..530). The sun's rays
are radial, so the mirror bends every ray at row 24 into a chevron, and the
stars above row 24 are a mirror image of the stars below.

V3 rebuilds exactly that band (rows 0..23, x >= 480) from the real painting
next to it (rows >= 24), and nothing else. The two skylight panes over that
band see different sky, and meet under the beam (x 1054..1070 is hidden in
every row 0..23), where one model fades into the other:
SUN PANES (x >= 1070): the sky is the sun's rays and glow. The star-free
painting along the ray through each pixel from the sun centre C (fitted, see
SUN) is fitted with  floor + A * (r / rb) ** beta  over the PROFILE px of
real painting next to row 24 and continued outward; stars as below. A ray
stays one straight ray across row 24.
NEBULA PANE (x <= 1054): the sky is starfield over the blue nebula, which is
not radial, so it is carried in three layers:
  glow + nebula  the broad light (a masked Gaussian, sigma GLOW, of the
                 star-free painting) carried upward column by column with
                 its own rate of change at row 24 (geometric, so a glow that
                 fades upward keeps fading at the same rate).
  rays           the ray streaks (star-free painting minus the broad light)
                 continued along the ray through each pixel from the sun
                 centre C (fitted, see SUN), their contrast following the
                 glow. Only as much as the streak really is a ray: its
                 coherence along the ray over the PROFILE px of real
                 painting next to row 24 (a ray keeps its sign and size;
                 nebula texture does not). A ray stays one straight ray
                 across row 24.
  grain          the texture that is not a ray, from the same donor sky as
                 the stars, scaled to the energy of the real rows under it.
Stars (both panes): real stars transplanted from elsewhere in the painting
(nothing is mirrored or blurred). Every pixel the room lets through takes its
stars from sky the room hides completely and no other visible pixel uses
(DONORS, from find_donors.py), so no star group on screen appears twice.
Per segment: the donor's stars at the real rows' local energy (as bright),
then, where the donor sky is denser than the real rows below, thinned by a
soft threshold to no more stars than they have. Never brightened: brighter
stars above row 24 than below would read as a band.
"Star-free" = the median along the ray (+- ALONG px): it keeps rays, drops stars.
x 480..529: blended into the unscaled source exactly as V2 was (weight
(x - 480) / 50). Rows 24..1023 and x < 480 are V2 byte for byte (asserted).

Usage (Trans-plant root):
  python -I resources/sprites/interface/menu/source/tools/make_mars_v3.py V2.png SOURCE.png OVERLAY.png OUT.png REPORT.json
  V2.png       Mars V2 (72aecea6...)
  SOURCE.png   the unregistered generated painting (dddfe849...)
  OVERLAY.png  the universal menu_overlay.png (358819f2...; read, never written)
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

V2_SHA = '72aecea6722e5cb5d33660de35d7796a67aaaef9ec177afd77c7b04919a7d1f5'
SRC_SHA = 'dddfe84912726fbad26300b9697c5257fa529312083b25f9b474e603b4fa29d7'
W, H = 1536, 1024
TOP = 24                  # rows 0..23 were mirrored about row 24
X0, BLEND = 480, 50       # V2 placed the painting at x 480, blended over 50 px
SUN = (1330.5, 101.0)     # ray convergence: the best of a 1 px grid search
                          # (straightness of the streaks in rows 26..60)
PROFILE = 40              # px of real painting along the ray read for each pixel
ALONG = 6                 # +- px of the along-ray median (removes stars)
GLOW = 8.0                # sigma of the broad light
RATE_ROWS = 12            # the glow's rate of change: row 24 vs row 36
OVERLAY_SHA = '358819f27b854f44989ed11d6c1b212d5b22d612f86184c2aa024087d0563616'
DONORS = [                # (x0, x1, dx, dy), first free match wins: find_donors.py
    (480, 1054, -302, 24),    # nebula pane: 3067 visible px
    (1070, 1260, -548, 48),   # sun pane, beam gap: 3679 visible px
    (1070, 1260, -16, 24),    #   the rest: 391 visible px (sky under the frame)
    (1260, 1536, -730, 628),  # sun pane, leaf gaps: 460 visible px
    (1260, 1536, -198, 28),   #   the rest: 39 visible px
]
SEGMENTS = [(X0, 1054), (1070, 1260), (1260, W)]   # nebula pane | sun pane: beam gap, leaf gaps
SUN_GUARD, PLANET = 45, (1561, 964, 930 + 25)   # not donor sky: the sun's core, the planet + limb glow
PANE_SPLIT = (1054, 1070) # overlay alpha 255 in every row 0..23: the beam between the panes


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def at(img, ys, xs):
    """Bilinear RGB of a stage image at float stage points."""
    return np.stack([ndi.map_coordinates(img[..., c], [ys, xs], order=1, mode='nearest') for c in range(3)], -1)


def ray_dir(ys, xs):
    dx, dy = xs - SUN[0], ys - SUN[1]
    r = np.hypot(dx, dy)
    return r, dx / r, dy / r


def star_density(img, vis, above=False):
    """Stars per 1000 visible px of rows 0..23 (above) or of the real rows
    24..47, per SEGMENT: local maxima of luminance over its 7 px median > 10."""
    lum = img[:2 * TOP + 8].mean(-1)
    hp = lum - ndi.median_filter(lum, 7)
    peak = (hp == ndi.maximum_filter(hp, 3)) & (hp > 10)
    rows = slice(0, TOP) if above else slice(TOP, 2 * TOP)
    out = []
    for x0, x1 in SEGMENTS:
        m = vis[rows, x0:x1]
        out.append(peak[rows, x0:x1][m].sum() / max(m.sum(), 1) * 1000)
    return out


def donors(vis, xs, ys):
    """Donor stage point per band pixel. Visible pixels (in segment order, as
    find_donors.py allocated them): the first DONORS offset whose donor is
    hidden real sky not yet used. Hidden pixels (nobody sees them): the first
    offset of any segment that lands in real painting."""
    yy, xx = np.mgrid[0:H, 0:W]
    free = (~vis & (yy >= TOP) & (xx >= X0 + BLEND)
            & (np.hypot(xx - SUN[0], yy - SUN[1]) >= SUN_GUARD)
            & (np.hypot(xx - PLANET[0], yy - PLANET[1]) >= PLANET[2]))
    qy, qx = np.full(xs.shape, -1), np.full(xs.shape, -1)
    tvis = vis[ys, xs]
    for x0, x1, dx, dy in DONORS:
        seg = (xs >= x0) & (xs < x1)
        first = qy < 0
        cy_, cx_ = ys + dy, xs + dx
        inb = (cx_ >= 0) & (cx_ < W) & (cy_ < H)
        take = seg & first & tvis & inb
        take[take] = free[cy_[take], cx_[take]]
        free[cy_[take], cx_[take]] = False
        qy[take], qx[take] = cy_[take], cx_[take]
    assert (qy[tvis] >= 0).all(), 'a visible pixel without hidden donor sky'
    for dx, dy in [(dx, dy) for _, _, dx, dy in DONORS] + [(97, 37)]:   # hidden pixels: any real
        cy_, cx_ = ys + dy, xs + dx                                    # painting, never clamped
        rest = (qy < 0) & (cx_ >= X0 + BLEND) & (cx_ < W) & (cy_ >= TOP) & (cy_ < H)
        qy[rest], qx[rest] = cy_[rest], cx_[rest]
    assert (qy >= 0).all()
    return qy, qx


def main(v2_path, src_path, ov_path, out_path, report_path):
    assert sha(v2_path) == V2_SHA, 'not Mars V2'
    assert sha(src_path) == SRC_SHA, 'not the unregistered source'
    assert sha(ov_path) == OVERLAY_SHA, 'not the universal overlay'
    vis = np.asarray(Image.open(ov_path).convert('RGBA'))[..., 3] < 255
    v2 = np.asarray(Image.open(v2_path).convert('RGB')).astype(np.float64)
    src = np.asarray(Image.open(src_path).convert('RGB')).astype(np.float64)
    assert v2.shape == (H, W, 3) and src.shape == (H, W, 3)
    # the defect, as recorded: rows 0..23 mirror rows 48..25 wherever the blend is complete
    assert np.array_equal(v2[:TOP, X0 + BLEND:], v2[2 * TOP:TOP:-1, X0 + BLEND:]), 'mirror not where expected'
    cx, cy = SUN

    # maps over the real rows next to the band (stage coordinates, rows < 24 never read)
    my, mx = np.mgrid[TOP:H, 0:W].astype(float)
    _, mux, muy = ray_dir(my, mx)
    s = np.arange(-ALONG, ALONG + 1, dtype=float)
    free = np.empty(my.shape + (3,))
    for r0 in range(0, my.shape[0], 34):          # in row chunks (memory)
        sl = np.s_[r0:r0 + 34]
        yy = my[sl][..., None] + s * muy[sl][..., None]
        xx = mx[sl][..., None] + s * mux[sl][..., None]
        v = at(v2, yy, xx)
        v[yy < TOP] = np.nan                      # never the mirrored rows
        free[sl] = np.nanmedian(v, axis=-2)
    glow = np.stack([ndi.gaussian_filter(free[..., c], GLOW, mode='nearest') for c in range(3)], -1)
    streak = free - glow
    stars = v2[TOP:] - free
    stage = lambda m: np.concatenate([np.zeros((TOP, W, 3)), m], 0)   # map -> stage rows
    free_s, glow_s, streak_s, stars_s = stage(free), stage(glow), stage(streak), stage(stars)

    band = v2[TOP:TOP + 40, 860:1100].reshape(-1, 3)
    floor = np.percentile(band, 5, axis=0)       # dark-sky level (per channel)

    ys, xs = np.mgrid[0:TOP, X0:W].astype(float)
    xi = xs.astype(int)
    up = (TOP - ys)[..., None]                    # rows above row 24

    # 1. glow + nebula, column by column
    g24 = glow_s[TOP, xi]
    g36 = glow_s[TOP + RATE_ROWS, xi]
    rate = np.clip((g24 - floor + 1) / np.maximum(g36 - floor + 1, 1e-6), 0.6, 1.4)
    glow_up = floor + np.maximum(g24 - floor, 0) * rate ** (up / RATE_ROWS)

    # 2. rays, along the ray through each pixel
    r, ux, uy = ray_dir(ys, xs)
    rb = r * (cy - TOP) / (cy - ys)               # where the ray crosses row 24
    k = np.arange(0, PROFILE + 1, dtype=float)
    rk = np.maximum(rb[..., None] - k, 1.0)
    py, px = cy + rk * uy[..., None], cx + rk * ux[..., None]
    prof = at(streak_s, py, px)                   # (24, n, 41, 3)
    wk = np.exp(-k / 15.0)[:, None]
    m1 = (prof * wk).sum(-2) / wk.sum()
    m2 = (prof ** 2 * wk).sum(-2) / wk.sum()
    coh = np.clip((m1 ** 2).mean(-1) / np.maximum(m2.mean(-1), 1e-6), 0, 1)
    coh = ndi.uniform_filter(coh, 3, mode='nearest')[..., None]
    s0 = (prof[..., :5, :] * wk[:5]).sum(-2) / wk[:5].sum()            # streak at row 24
    gb = at(glow_s, py[..., 0], px[..., 0])                             # glow where it crosses
    contrast = np.clip((glow_up - floor + 1) / np.maximum(gb - floor + 1, 1e-6), 0, 1.5)
    rays_up = coh * s0 * contrast

    # 3. stars + grain, transplanted from real sky
    qy, qx = donors(vis, xs.astype(int), ys.astype(int))
    d_star = stars_s[qy, qx]
    d_tex = streak_s[qy, qx]
    ty = (ys + TOP).astype(int)                   # the real rows 24..47 straight below
    def energy(a):
        return np.sqrt(np.maximum(ndi.uniform_filter(np.square(a).mean(-1), (TOP, 41), mode='nearest'), 0))
    g_tex = np.clip(energy(streak_s[ty, xi]) / np.maximum(energy(d_tex), 1e-3), 0.25, 2.0)[..., None]
    nebula_pane = glow_up + rays_up + (1 - coh) * g_tex * d_tex

    # sun panes: the whole star-free light continued along the ray
    pf = at(free_s, py, px)                       # (24, n, 41, 3)
    lx = np.log(rk / rb[..., None])[..., None]
    ly = np.log(np.maximum(pf - floor, 1.0))
    sw = wk.sum()
    mlx, mly = (lx * wk).sum(-2) / sw, (ly * wk).sum(-2) / sw
    beta = ((wk * (lx - mlx[..., None, :]) * (ly - mly[..., None, :])).sum(-2)
            / np.maximum((wk * (lx - mlx[..., None, :]) ** 2).sum(-2), 1e-9))
    beta = np.clip(beta, -4.0, 0.0)               # never brighter away from the sun
    f0 = (pf[..., :5, :] * wk[:5]).sum(-2) / wk[:5].sum()
    sun_pane = floor + np.maximum(f0 - floor, 0) * (r / rb)[..., None] ** beta

    # the two skylight panes meet under the beam (x 1054..1070 hidden in every row 0..23)
    wsun = np.clip((xs - PANE_SPLIT[0]) / (PANE_SPLIT[1] - PANE_SPLIT[0]), 0, 1)[..., None]
    light = nebula_pane * (1 - wsun) + sun_pane * wsun
    a = np.clip((xs - X0) / BLEND, 0, 1)[..., None]

    # stars: per segment, as many as the real rows below have (a soft threshold
    # on the donor's stars), then as bright (the energy gain)
    d_lum = np.abs(d_star.mean(-1))
    under = stars_s[ty, xi]
    seg = np.searchsorted([s[0] for s in SEGMENTS], xs, 'right') - 1
    tau = np.zeros(xs.shape)
    def band(stars):
        v = v2.copy()
        v[:TOP, X0:] = src[:TOP, X0:] * (1 - a) + (light + stars) * a
        return v
    def with_tau(t):
        d = d_star * (np.maximum(d_lum - t, 0) / np.maximum(d_lum, 1e-6))[..., None]
        g = np.clip(energy(under) / np.maximum(energy(d), 1e-3), 0.25, 2.0)[..., None]
        return g * d
    target = star_density(v2, vis)                # the real rows 24..47, per segment
    taus = []
    for i, (x0, x1) in enumerate(SEGMENTS):
        best = None
        for t in np.arange(0, 41, 2.0):           # never brighter: only fewer
            tau[seg == i] = t
            got = star_density(band(with_tau(tau)), vis, above=True)[i]
            err = max(got - target[i], 0)
            if best is None or err < best[0] - 1e-9:
                best = (err, t, got)
        tau[seg == i] = best[1]
        taus.append({'x': [x0, x1], 'tau': best[1],
                     'stars_per_1000px': round(best[2], 1), 'real_rows_below': round(target[i], 1)})
    v3 = band(with_tau(tau))
    assert np.isfinite(v3).all()
    v3 = np.clip(np.rint(v3), 0, 255).astype(np.uint8)
    v2u = v2.astype(np.uint8)
    assert np.array_equal(v3[TOP:], v2u[TOP:]) and np.array_equal(v3[:, :X0], v2u[:, :X0])
    Image.fromarray(v3, 'RGB').save(out_path, optimize=True)

    changed = np.any(v3 != v2u, -1)
    ys_c, xs_c = np.where(changed)
    rep = {
        'v2_sha256': V2_SHA, 'source_sha256': SRC_SHA, 'v3_sha256': sha(out_path),
        'v3_bytes': Path(out_path).stat().st_size, 'dimensions': [W, H],
        'repair_region': {'rows': [0, TOP - 1], 'x': [X0, W - 1], 'px': TOP * (W - X0)},
        'changed_px': int(changed.sum()),
        'changed_bbox': [int(xs_c.min()), int(ys_c.min()), int(xs_c.max()), int(ys_c.max())],
        'unchanged_outside_region': True,
        'sun_centre': SUN, 'profile_px': PROFILE, 'along_median_px': ALONG, 'glow_sigma': GLOW,
        'donors': DONORS, 'star_threshold': taus, 'visible_px_rebuilt': int(vis[:TOP, X0:].sum()),
        'sky_floor_rgb': [round(float(f), 2) for f in floor],
    }
    Path(report_path).write_text(json.dumps(rep, indent=1) + '\n')
    print(json.dumps(rep, indent=1))


if __name__ == '__main__':
    main(*sys.argv[1:6])
