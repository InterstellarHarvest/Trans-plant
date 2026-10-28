#!/usr/bin/env python3
"""MENU-002H lossless size optimisation of the approved Ringed V2-B and
Nebula V1 backgrounds, by the same rule as Earth's (MENU-002C1 B) and Mars'
(MENU-002E), with the proofs.

  backgrounds/<id>.png: pixels the universal overlay hides completely (alpha
  255) and more than MARGIN source px (chessboard) from any pixel it lets
  through (alpha < 255) are set to 0. Everything the windows show, and an
  8 px band of the real exterior around every window edge, is the source's.
Sources (never modified):
  ringed  source/ringed_v2_skyfix_b.png, Ringed V2 skyfix B (75c0aea0), made
          from source/ringed_v2.png (V2 as supplied, 35022bee) by
          resources/sprites/interface/menu/source/tools/skyfix_ab.py
  nebula  source/nebula_v1.png, Nebula V1 as supplied (e4d037eb)
The overlay is read, never written.
Proofs (asserted, per background): same size and colour mode; every pixel the
overlay lets through, and the 8 px band around it, unchanged; the simplified
pixels all under fully opaque room; the overlay over the optimised file == the
overlay over its source, every pixel, at 1536x1024. A background that fails a
proof is reported and not written (the release keeps the source).
Usage (Trans-plant root):
  python resources/sprites/interface/menu/source/tools/optimize_backgrounds.py OUT.json [--check]
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
OVERLAY = MENU / 'menu_overlay.png'
OVERLAY_SHA = '358819f27b854f44989ed11d6c1b212d5b22d612f86184c2aa024087d0563616'
JOBS = {  # id: (approved source, its sha256, optimised runtime file)
    'ringed': (MENU / 'source/ringed_v2_skyfix_b.png', '75c0aea0a88e72cd1ed8e5c324e3943f0953b260420033861cb953853bd0279c', MENU / 'backgrounds/ringed.png'),
    'nebula': (MENU / 'source/nebula_v1.png', 'e4d037ebae8850d24d3a05ca117dbdaf745af24f8d11798a2f3e40fe54c4841a', MENU / 'backgrounds/nebula.png'),
}
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
    assert sha(OVERLAY) == OVERLAY_SHA, 'overlay changed'
    ov = np.array(Image.open(OVERLAY))
    assert ov.shape == (1024, 1536, 4)
    a = ov[..., 3]
    seen = a < 255
    near = ndimage.distance_transform_cdt(~seen, metric='chessboard') <= MARGIN  # seen, or within MARGIN of it
    res = {'margin_px': MARGIN, 'overlay': {'file': str(OVERLAY.relative_to(MENU)), 'sha256': OVERLAY_SHA},
           'pixels': {'alpha0': int((a == 0).sum()), 'partial': int(((a > 0) & (a < 255)).sum()), 'alpha255': int((a == 255).sum()),
                      'simplified_region': int((~near).sum())},
           'backgrounds': {}}
    ok_all = True
    for vid, (src, src_sha, dst) in JOBS.items():
        assert sha(src) == src_sha, f'{src} changed'
        sim = Image.open(src)
        assert sim.mode == 'RGB' and sim.size == (1536, 1024), f'{src}: {sim.mode} {sim.size}'
        s = np.array(sim)
        opt = s.copy(); opt[~near] = 0
        if not check:
            data = png(opt, 'RGB')
            # proof on the encoded bytes before anything is written
            dec = np.array(Image.open(io.BytesIO(data)))
            if not ((dec == opt).all() and (over(ov, dec) == over(ov, s)).all()):
                res['backgrounds'][vid] = {'result': 'FAILED parity: not written, keep the source'}
                ok_all = False
                continue
            dst.write_bytes(data)
        im = Image.open(dst)
        f = np.array(im)
        P = {}
        P['file_is_the_optimisation_of_the_source'] = bool(f.shape == opt.shape and (f == opt).all())
        P['same_size_and_mode'] = bool(im.size == (1536, 1024) and im.mode == 'RGB')
        P['unchanged_where_overlay_alpha_lt_255'] = bool((f[seen] == s[seen]).all())
        P['unchanged_within_margin'] = bool((f[near] == s[near]).all())
        P['simplified_px'] = int((~near).sum())
        P['simplified_px_actually_changed'] = int((f != s).any(-1).sum())
        P['simplified_px_all_hidden'] = bool((a[~near] == 255).all())
        P['composite_optimised_vs_source_px_differ'] = int((over(ov, f) != over(ov, s)).any(-1).sum())
        passed = all(P[k] for k in ('file_is_the_optimisation_of_the_source', 'same_size_and_mode', 'unchanged_where_overlay_alpha_lt_255',
                                    'unchanged_within_margin', 'simplified_px_all_hidden')) and P['composite_optimised_vs_source_px_differ'] == 0
        ok_all &= passed
        res['backgrounds'][vid] = {
            'result': 'PASS' if passed else 'FAIL', 'proofs': P,
            'source': {'file': str(src.relative_to(MENU)), 'sha256': src_sha, 'bytes': src.stat().st_size},
            'optimised': {'file': str(dst.relative_to(MENU)), 'sha256': sha(dst), 'bytes': dst.stat().st_size},
            'saving_bytes': src.stat().st_size - dst.stat().st_size,
            'saving_pct': round(100 * (src.stat().st_size - dst.stat().st_size) / src.stat().st_size, 1)}
    res['all_pass'] = ok_all
    Path(out).write_text(json.dumps(res, indent=1) + '\n')
    print(json.dumps(res, indent=1))
    assert ok_all, 'a background failed parity'


if __name__ == '__main__':
    main(sys.argv[1], '--check' in sys.argv)
