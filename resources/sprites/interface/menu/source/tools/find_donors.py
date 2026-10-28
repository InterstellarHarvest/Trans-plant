#!/usr/bin/env python3
"""MENU-002C2: where Mars V3's transplanted stars come from (search only).

The stars and grain of the rebuilt rows 0..23 are copied from real sky of the
V2 painting. So that no star group on screen appears twice, every pixel the
room lets through (overlay alpha < 255) takes its stars from sky the room
hides completely (alpha 255), that is real painting (y >= 24, x >= 530, not
the planet or the sun's core), and that no other visible pixel uses.
Per pane segment, greedily: the offset that covers most of the segment's
visible pixels with such sky (star energy as close as possible as the tie
break), then the best offset for what is left, until all are covered.
Prints DONORS for make_mars_v3.py.

Usage (Trans-plant root): python -I resources/sprites/interface/menu/source/tools/find_donors.py V2.png OVERLAY.png
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SEGMENTS = [(480, 1054), (1070, 1260), (1260, 1536)]   # nebula pane | sun pane (gap, leaves)
SUN = (1330.5, 101.0)
PLANET = (1561, 964, 930 + 25)                          # the registered limb + its glow


def main(v2_path, ov_path):
    v2 = np.asarray(Image.open(v2_path).convert('RGB')).astype(float)
    vis = np.asarray(Image.open(ov_path).convert('RGBA'))[..., 3] < 255
    H, W = vis.shape
    yy, xx = np.mgrid[0:H, 0:W]
    sky = ((np.hypot(xx - PLANET[0], yy - PLANET[1]) >= PLANET[2])
           & (np.hypot(xx - SUN[0], yy - SUN[1]) >= 45) & (yy >= 24) & (xx >= 530))
    free = ~vis & sky
    lum = v2.mean(2)
    energy = np.sqrt(ndi.uniform_filter((lum - ndi.median_filter(lum, 5)) ** 2, 25))
    plan = []
    for x0, x1 in SEGMENTS:
        ty, tx = np.mgrid[0:24, x0:x1]
        left = vis[0:24, x0:x1].copy()
        t_e = energy[24:48, x0:x1][left].mean()
        while left.any():
            py, px = ty[left], tx[left]
            best = None
            for oy in range(24, 700, 2):
                for ox in range(-1100, 500, 2):
                    qy, qx = py + oy, px + ox
                    inb = (qx >= 0) & (qx < W) & (qy < H)
                    if not inb.any():
                        continue
                    g = np.zeros_like(inb)
                    g[inb] = free[qy[inb], qx[inb]]
                    n = int(g.sum())
                    if n == 0:
                        continue
                    sc = (n, -abs(np.log(energy[qy[g], qx[g]].mean() / t_e)))
                    if best is None or sc > best[0]:
                        best = (sc, ox, oy, g)
            sc, ox, oy, g = best
            free[py[g] + oy, px[g] + ox] = False        # used: never twice
            sub = np.zeros_like(left)
            sub[left] = g
            left &= ~sub
            plan.append((x0, x1, ox, oy, sc[0]))
            print(f'segment {x0}..{x1}: offset ({ox:+d}, {oy:+d}) covers {sc[0]} visible px, '
                  f'{int(left.sum())} left', flush=True)
    print('DONORS = [  # (x0, x1, dx, dy), first match wins')
    for x0, x1, ox, oy, n in plan:
        print(f'    ({x0}, {x1}, {ox}, {oy}),  # {n} visible px')
    print(']')


if __name__ == '__main__':
    main(*sys.argv[1:3])
