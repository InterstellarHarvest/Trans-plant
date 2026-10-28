#!/usr/bin/env python3
"""MENU-002F2 revised ruling: one localized, sky-only A/B for the duplicated stars.
A = ringed_v2.png as accepted (untouched). B = A with ONLY the footprint of each
duplicated star (measurements.json 'stars_shown_twice') that sits on dark sky
(local median luma < DARK) removed at its 1x-original position; the same star in
the 0.70x copy (the one the composition keeps) is protected and left as is.
Stars inside the bright sun-side nebula are left: they read as nebula sparkle at
960x640, and a median fill there visibly smooths the nebula texture (tried, rejected).
No other pixel changes: the doubled nebula texture, planet, rings and sunlight
are not touched.
Footprint = the 8-connected component of (luma - local median) > T that contains
the seed (core + diffraction spikes), within R px, dilated 1 px, feathered; filled
with the local median (21x21) of the source plus the fine grain (source - median)
of the nearest donor spot 28-48 px away with no bright star (excess <= DONOR_MAX), so the patch keeps the sky
colour and its faint background stars instead of reading as a smooth smudge.
Usage (Trans-plant root):
  python -I resources/sprites/interface/menu/source/tools/skyfix_ab.py MEASUREMENTS_JSON OUT_PNG"""
import hashlib
import json
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = 'resources/sprites/interface/menu/source/ringed_v2.png'
T, R, PROTECT, DARK, DONOR_MAX = 6, 18, 4, 120, 45

M = json.load(open(sys.argv[1]))['duplicates']['stars_shown_twice']
a = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
H, W = a.shape[:2]
L = a @ np.float32([0.299, 0.587, 0.114])
bg = np.stack([ndimage.median_filter(a[..., c], size=21) for c in range(3)], -1)
excess = L - bg @ np.float32([0.299, 0.587, 0.114])
yy, xx = np.mgrid[0:H, 0:W]
keep = np.zeros((H, W), bool)
for st in M:
    cx, cy = st['shown_in_copy']
    keep |= (xx - cx) ** 2 + (yy - cy) ** 2 <= PROTECT ** 2
mask = np.zeros((H, W), bool)
fill = bg.copy()
report = []
for st in M:
    sx, sy = st['shown_at_1x']
    if bg[sy, sx] @ np.float32([0.299, 0.587, 0.114]) >= DARK:
        report.append({'star_1x': [sx, sy], 'kept_copy_star': st['shown_in_copy'], 'left': 'bright nebula'})
        continue
    near = (xx - sx) ** 2 + (yy - sy) ** 2 <= R ** 2
    lab, _ = ndimage.label((excess > T) & near, structure=np.ones((3, 3)))
    seed = lab[sy - 1:sy + 2, sx - 1:sx + 2].max()   # peak may sit 1 px off the listed centre
    fp = ndimage.binary_dilation(lab == seed, iterations=1) & near & ~keep if seed else np.zeros((H, W), bool)
    mask |= fp
    fy, fx = np.nonzero(fp)
    for d in range(28, 49, 4):                        # nearest donor holding faint grain but no bright star
        ok = [(dx, dy) for dx, dy in ((-d, 0), (d, 0), (0, d), (0, -d), (-d, d), (d, d), (-d, -d), (d, -d))
              if 0 <= fx.min() + dx and fx.max() + dx < W and 0 <= fy.min() + dy and fy.max() + dy < H
              and excess[fy + dy, fx + dx].max() <= DONOR_MAX and not (mask | keep)[fy + dy, fx + dx].any()]
        if ok:
            break
    dx, dy = ok[0]
    fill[fy, fx] = bg[fy, fx] + (a[fy + dy, fx + dx] - bg[fy + dy, fx + dx])
    report.append({'star_1x': [sx, sy], 'kept_copy_star': st['shown_in_copy'], 'footprint_px': int(fp.sum()), 'grain_donor_offset': [dx, dy]})
soft = np.clip(ndimage.gaussian_filter(mask.astype(np.float32), 0.8) * 1.6, 0, 1)
soft[ndimage.binary_dilation(mask, iterations=3) == 0] = 0      # strictly local
soft[keep] = 0
out = np.uint8(np.clip(np.rint(a * (1 - soft[..., None]) + fill * soft[..., None]), 0, 255))
Image.fromarray(out, 'RGB').save(sys.argv[2], optimize=True)
changed = np.any(out != a.astype(np.uint8), -1)
ys, xs = np.nonzero(changed)
print(json.dumps({'A': SRC, 'A_sha256': hashlib.sha256(open(SRC, 'rb').read()).hexdigest(),
                  'B': sys.argv[2], 'B_sha256': hashlib.sha256(open(sys.argv[2], 'rb').read()).hexdigest(),
                  'changed_px': int(changed.sum()), 'changed_bbox': [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
                  'stars': report}, indent=1))
