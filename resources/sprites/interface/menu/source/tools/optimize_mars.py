#!/usr/bin/env python3
"""MENU-002E lossless size optimisation of the approved Mars V3 background,
by the same rule as Earth's (MENU-002C1 optimisation B), with the proofs.

  backgrounds/mars.png: pixels the universal overlay hides completely (alpha
  255) and more than MARGIN source px (chessboard) from any pixel it lets
  through (alpha < 255) are set to 0. Everything the windows show, and an
  8 px band of real Mars around every window edge, is Mars V3's.
Source (never modified): source/mars_v3.png, the approved Mars V3 (25d9496d).
The overlay is read, never written.
Proofs (asserted): same size and colour mode; every pixel the overlay lets
through, and the 8 px band around it, unchanged; the simplified pixels all
under fully opaque room; the overlay over the optimised Mars == the overlay
over Mars V3, every pixel, at 1536x1024.
Usage (Trans-plant root): python -I resources/sprites/interface/menu/source/tools/optimize_mars.py OUT.json [--check]
  --check  verify the committed file instead of writing it
"""
import hashlib
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

MENU = Path('resources/sprites/interface/menu')
OVERLAY = MENU / 'menu_overlay.png'
SOURCE = MENU / 'source/mars_v3.png'
MARS = MENU / 'backgrounds/mars.png'
SHA = {OVERLAY: '358819f27b854f44989ed11d6c1b212d5b22d612f86184c2aa024087d0563616',
       SOURCE: '25d9496d2b9d32ff55f5da9b12b525f5a40314c98ab39f2d51df5ab0814e01a7'}
MARGIN = 8


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def over(fg, bg):  # straight-alpha "over", rounded once (MENU-002A/002C reference)
    a = fg[..., 3:4].astype(np.float64) / 255.0
    return np.clip(np.rint(fg[..., :3] * a + bg * (1 - a)), 0, 255).astype(np.uint8)


def png(arr, mode):
    b = io.BytesIO()
    Image.fromarray(arr, mode).save(b, 'PNG', optimize=True)
    return b.getvalue()


def main(out, check):
    for p, h in SHA.items():
        assert sha(p) == h, f'{p} changed'
    ov = np.array(Image.open(OVERLAY))
    v3 = np.array(Image.open(SOURCE))
    assert Image.open(SOURCE).mode == 'RGB' and v3.shape == (1024, 1536, 3) and ov.shape == (1024, 1536, 4)
    a = ov[..., 3]
    seen = a < 255
    near = ndimage.distance_transform_cdt(~seen, metric='chessboard') <= MARGIN  # seen, or within MARGIN of it

    mars = v3.copy(); mars[~near] = 0
    if not check:
        MARS.write_bytes(png(mars, 'RGB'))
    im = Image.open(MARS)
    marsf = np.array(im)
    assert (marsf == mars).all(), 'the committed file is not the optimisation of the source'

    P = {}
    P['same_size_and_mode'] = bool(im.size == (1536, 1024) and im.mode == 'RGB')
    P['mars_unchanged_where_overlay_alpha_lt_255'] = bool((marsf[seen] == v3[seen]).all())
    P['mars_unchanged_within_margin'] = bool((marsf[near] == v3[near]).all())
    P['mars_simplified_px'] = int((~near).sum())
    P['mars_simplified_px_actually_changed'] = int((marsf != v3).any(-1).sum())
    P['mars_simplified_px_all_hidden'] = bool((a[~near] == 255).all())
    P['mars_composite_optimised_vs_v3_px_differ'] = int((over(ov, marsf) != over(ov, v3)).any(-1).sum())
    assert P['same_size_and_mode'] and P['mars_unchanged_where_overlay_alpha_lt_255'] and P['mars_unchanged_within_margin']
    assert P['mars_simplified_px_all_hidden'] and P['mars_composite_optimised_vs_v3_px_differ'] == 0

    files = {str(p.relative_to(MENU)): {'sha256': sha(p), 'bytes': p.stat().st_size} for p in (OVERLAY, SOURCE, MARS)}
    res = {'margin_px': MARGIN, 'pixels': {'alpha0': int((a == 0).sum()), 'partial': int(((a > 0) & (a < 255)).sum()), 'alpha255': int((a == 255).sum())},
           'proofs': P, 'files': files,
           'saving_bytes': {'backgrounds/mars.png': files['source/mars_v3.png']['bytes'] - files['backgrounds/mars.png']['bytes']}}
    Path(out).write_text(json.dumps(res, indent=1) + '\n')
    print(json.dumps(res, indent=1))


if __name__ == '__main__':
    main(sys.argv[1], '--check' in sys.argv)
