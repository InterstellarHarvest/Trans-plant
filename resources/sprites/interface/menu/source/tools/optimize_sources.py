#!/usr/bin/env python3
"""MENU-002C1 lossless size optimisations of the runtime menu images (PMO
conditional approval, 002C1 section 4), with the exactness proofs.

  A. menu_overlay.png: RGB set to 0 under fully transparent pixels (alpha 0).
     Alpha unchanged; RGB unchanged wherever alpha > 0.
  B. backgrounds/earth.png: pixels the overlay hides completely (alpha 255)
     and more than MARGIN source px (chessboard) from any pixel the overlay
     lets through (alpha < 255) are set to 0. Everything the windows show,
     and an 8 px band of real Earth around every window edge, is the
     approved master's.
Sources (never modified):
  source/menu_overlay_alphafix002a_original.png  the 002A alpha-fix overlay (75cbedaa)
  scene_master_leafclear_v1_1536x1024.png        the approved master (= the old earth.png)
Proofs (asserted): A's alpha and visible RGB; B's visible pixels and margin;
the optimised overlay over the optimised Earth == the master, every pixel;
the optimised overlay over Mars V2 / V1 == the original overlay over them.
Usage (Trans-plant root): python -I resources/sprites/interface/menu/source/tools/optimize_sources.py OUT.json [--check]
  --check  verify the committed files instead of writing them
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
SRC_OVERLAY = MENU / 'source/menu_overlay_alphafix002a_original.png'
MASTER = MENU / 'scene_master_leafclear_v1_1536x1024.png'
OVERLAY = MENU / 'menu_overlay.png'
EARTH = MENU / 'backgrounds/earth.png'
MARS = {'mars': MENU / 'source/mars_v2.png', 'mars_v1': MENU / 'backgrounds/mars_v1.png'}
SHA = {SRC_OVERLAY: '75cbedaadd5062ac3cd78ccf1c18cc517233cf4ceeaad95923f07333a6f0b7ca',
       MASTER: '129557686e9273e1dda84e1e9462ddb4ab01989adee945c15f12a0cd36b4e914',
       MARS['mars']: '72aecea6722e5cb5d33660de35d7796a67aaaef9ec177afd77c7b04919a7d1f5',
       MARS['mars_v1']: '70697f46d8358d013c49e0a323a6130d3b94fb67efc3592152b0c77e1ba3f31c'}
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
    ov0 = np.array(Image.open(SRC_OVERLAY))
    master = np.array(Image.open(MASTER))
    assert ov0.shape == (1024, 1536, 4) and master.shape == (1024, 1536, 3)
    a = ov0[..., 3]
    seen = a < 255
    near = ndimage.distance_transform_cdt(~seen, metric='chessboard') <= MARGIN  # seen, or within MARGIN of it

    ov = ov0.copy(); ov[a == 0, :3] = 0
    earth = master.copy(); earth[~near] = 0
    if not check:
        OVERLAY.write_bytes(png(ov, 'RGBA'))
        EARTH.write_bytes(png(earth, 'RGB'))
    ovf, earthf = np.array(Image.open(OVERLAY)), np.array(Image.open(EARTH))
    assert Image.open(OVERLAY).mode == 'RGBA' and Image.open(EARTH).mode == 'RGB'
    assert (ovf == ov).all() and (earthf == earth).all(), 'committed files are not the optimisation of the sources'

    P = {}
    P['overlay_alpha_unchanged'] = bool((ovf[..., 3] == a).all())
    P['overlay_rgb_unchanged_where_alpha_gt_0'] = bool((ovf[a > 0, :3] == ov0[a > 0, :3]).all())
    P['overlay_rgb_changed_px_all_alpha0'] = int((ovf[..., :3] != ov0[..., :3]).any(-1).sum())
    P['earth_unchanged_where_overlay_alpha_lt_255'] = bool((earthf[seen] == master[seen]).all())
    P['earth_unchanged_within_margin'] = bool((earthf[near] == master[near]).all())
    P['earth_simplified_px'] = int((~near).sum())
    P['earth_simplified_px_all_hidden'] = bool((a[~near] == 255).all())
    comp = over(ovf, earthf)
    P['earth_composite_vs_master_px_differ'] = int((comp != master).any(-1).sum())
    for k, p in MARS.items():
        bg = np.array(Image.open(p))
        P[f'{k}_composite_optimised_vs_original_overlay_px_differ'] = int((over(ovf, bg) != over(ov0, bg)).any(-1).sum())
    assert P['overlay_alpha_unchanged'] and P['overlay_rgb_unchanged_where_alpha_gt_0']
    assert P['earth_unchanged_where_overlay_alpha_lt_255'] and P['earth_unchanged_within_margin'] and P['earth_simplified_px_all_hidden']
    assert P['earth_composite_vs_master_px_differ'] == 0
    assert all(v == 0 for k, v in P.items() if k.endswith('original_overlay_px_differ'))

    files = {str(p.relative_to(MENU)): {'sha256': sha(p), 'bytes': p.stat().st_size} for p in (SRC_OVERLAY, MASTER, OVERLAY, EARTH, *MARS.values())}
    res = {'margin_px': MARGIN, 'pixels': {'alpha0': int((a == 0).sum()), 'partial': int(((a > 0) & (a < 255)).sum()), 'alpha255': int((a == 255).sum())},
           'proofs': P, 'files': files,
           'saving_bytes': {'menu_overlay.png': files[str(SRC_OVERLAY.relative_to(MENU))]['bytes'] - files['menu_overlay.png']['bytes'],
                            'backgrounds/earth.png': files[str(MASTER.relative_to(MENU))]['bytes'] - files['backgrounds/earth.png']['bytes']}}
    Path(out).write_text(json.dumps(res, indent=1) + '\n')
    print(json.dumps(res, indent=1))


if __name__ == '__main__':
    main(sys.argv[1], '--check' in sys.argv)
