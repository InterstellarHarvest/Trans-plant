#!/usr/bin/env python3
"""MENU-002A mask-edge evaluation of the TIGHT leaf-clear foreground.

For every foreground pixel near the window opening the master colour p is
modelled as a mix of the room behind it (I: the nearest deep-interior
colour) and the painted exterior beside it (E: the nearest fully open
pixel's local exterior colour):  p ~ (1-k) I + k E.  k is the share of
baked-in exterior.  Over a new exterior B the pixel shows
    c = a p + (1-a) B          (a = foreground alpha)
(pixels inside views_common.ISLANDS that are painted Earth are taken as
k = 1: wholly old exterior), where a clean edge would show
    ideal = a (p - k (E - B)) + (1-a) B.
|c - ideal| is the visible baked-exterior error, measured at source
resolution and again after the 960x640 display downscale (what a player
sees).  On the display grid (max channel, 8-bit):
  SERIOUS     error >= 24 in a blob at least 3x3 display px thick (survives
              a 3x3 opening): a patch of old exterior a player can see
  MINOR       error >= 10 anywhere else: the 1-2 px edge fringe, which reads
              as a contact line / rim light at 960x640
  NEGLIGIBLE  error < 10

Writes (under OUT):
  edge_stats.json             per background x region counts + serious clusters
  serious_clusters.json       union over the four backgrounds (src px boxes)
  defect_map_<bg>.png         1536 master, contaminated px tinted by severity
  contamination_k.png         8-bit k over the band (0 elsewhere)
  composites/<bg>_1536.png    TIGHT over each test background
  composites/<bg>_960.png     the same at display size
Usage (Trans-plant root):  python resources/sprites/interface/menu/source/tools/mask_edges.py OUT
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).parent))
import views_common as vc  # noqa: E402

BAND_PX = 12        # how far from the opening a pixel can carry baked exterior
MIN_CONTRAST = 40   # |E - I| below this: room and exterior can't be told apart
MIN_K = 0.35
SERIOUS, MINOR = 24, 10
DISP = (960, 640)


def norm_conv(img, weight, sigma):
    w = ndi.gaussian_filter(weight.astype(np.float64), sigma)
    out = np.stack([ndi.gaussian_filter(img[..., c] * weight, sigma) for c in range(3)], -1)
    return out / np.maximum(w, 1e-6)[..., None]


def model(master, fg):
    a = fg[..., 3].astype(np.float64) / 255.0
    p = master.astype(np.float64)
    open0 = fg[..., 3] == 0
    solid = fg[..., 3] == 255
    deep = solid & (ndi.distance_transform_edt(solid) >= 4)
    d_open, idx_o = ndi.distance_transform_edt(~open0, return_indices=True)
    _, idx_d = ndi.distance_transform_edt(~deep, return_indices=True)
    E_f = norm_conv(p, open0, 2.0)
    I_f = norm_conv(p, deep, 1.5)
    E = E_f[idx_o[0], idx_o[1]]
    I = I_f[idx_d[0], idx_d[1]]
    d = E - I
    dd = np.sqrt((d ** 2).sum(-1))
    k = ((p - I) * d).sum(-1) / np.maximum(dd ** 2, 1e-6)
    k = np.clip(k, 0, 1)
    resid = np.sqrt(((p - (I + k[..., None] * d)) ** 2).sum(-1))
    band = (fg[..., 3] > 0) & (d_open <= BAND_PX)
    fit = resid <= np.maximum(30, 0.6 * dd)
    contaminated = band & (dd >= MIN_CONTRAST) & (k >= MIN_K) & fit
    k_eff = np.where(contaminated, k, 0.0)
    island = vc.island_mask(master, fg[..., 3])  # wholly old exterior: k = 1
    contaminated |= island
    k_eff[island] = 1.0
    return dict(a=a, p=p, E=E, I=I, k=k_eff, contaminated=contaminated, d_open=d_open, band=band)


def errors(M, B):
    a, p, E, k = M['a'][..., None], M['p'], M['E'], M['k'][..., None]
    Bf = B.astype(np.float64)
    c = a * p + (1 - a) * Bf
    ideal = a * np.clip(p - k * (E - Bf), 0, 255) + (1 - a) * Bf
    c8, i8 = np.rint(c).astype(np.uint8), np.rint(np.clip(ideal, 0, 255)).astype(np.uint8)
    err_src = np.abs(c8.astype(int) - i8.astype(int)).max(-1)
    cd = np.array(Image.fromarray(c8).resize(DISP, Image.LANCZOS), int)
    idd = np.array(Image.fromarray(i8).resize(DISP, Image.LANCZOS), int)
    err_disp = np.abs(cd - idd).max(-1)
    return c8, i8, err_src, err_disp


def region_of(x, y):
    for name, (x0, y0, x1, y1) in vc.REGIONS.items():
        if x0 <= x < x1 and y0 <= y < y1:
            return name
    return 'elsewhere'


def main(out):
    out = Path(out)
    vc.check_locked()
    master, fg = vc.load_master(), vc.load_fg()
    M = model(master, fg)
    cont = M['contaminated']
    bgs = vc.test_backgrounds()
    stats = {'band_px': BAND_PX, 'min_contrast': MIN_CONTRAST, 'min_k': MIN_K,
             'thresholds_display_max_channel': {'serious': SERIOUS, 'minor': MINOR},
             'contaminated_px': int(cont.sum()),
             'contaminated_px_by_region': {}, 'partial_alpha_px': int(((fg[..., 3] > 0) & (fg[..., 3] < 255)).sum()),
             'backgrounds': {}}
    ys, xs = np.nonzero(cont)
    for x, y in zip(xs, ys):
        r = region_of(x, y)
        stats['contaminated_px_by_region'][r] = stats['contaminated_px_by_region'].get(r, 0) + 1
    union_ser = np.zeros((DISP[1], DISP[0]), bool)
    kimg = np.rint(M['k'] * 255).astype(np.uint8)
    vc.save(kimg, out / 'contamination_k.png')
    for name, B in bgs.items():
        c8, i8, es, ed = errors(M, B)
        vc.save(c8, out / 'composites' / f'{name}_1536.png')
        vc.save(np.array(Image.fromarray(c8).resize(DISP, Image.LANCZOS)), out / 'composites' / f'{name}_960.png')
        ser = ndi.binary_opening(ed >= SERIOUS, structure=np.ones((3, 3)))
        minor = (ed >= MINOR) & ~ser
        union_ser |= ser
        lab, n = ndi.label(ndi.binary_dilation(ser, np.ones((3, 3))))
        clusters = []
        for i, sl in enumerate(ndi.find_objects(lab)):
            size = int((ser[sl] & (lab[sl] == i + 1)).sum())
            y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
            box = [round(x0 * 1.6), round(y0 * 1.6), round(x1 * 1.6), round(y1 * 1.6)]
            clusters.append({'display_px': size, 'src_box': box, 'peak': int(ed[sl].max()),
                             'region': region_of((box[0] + box[2]) // 2, (box[1] + box[3]) // 2)})
        clusters.sort(key=lambda c: -c['display_px'])
        per_region = {}
        for rname, (x0, y0, x1, y1) in vc.REGIONS.items():
            dx0, dy0, dx1, dy1 = [round(v / 1.6) for v in (x0, y0, x1, y1)]
            e = ed[dy0:dy1, dx0:dx1]
            per_region[rname] = {'serious_display_px': int(ser[dy0:dy1, dx0:dx1].sum()), 'minor_display_px': int(minor[dy0:dy1, dx0:dx1].sum()),
                                 'peak_display': int(e.max()), 'src_px_err_ge_48': int((es[y0:y1, x0:x1] >= 48).sum())}
        stats['backgrounds'][name] = {
            'serious_display_px': int(ser.sum()), 'minor_display_px': int(minor.sum()),
            'src_px_err_ge_48': int((es >= 48).sum()), 'peak_display': int(ed.max()),
            'regions': per_region, 'serious_clusters_ge3px': clusters[:40], 'serious_cluster_count': len(clusters)}
        # Defect map: master dimmed; serious red, minor amber, other contaminated cyan.
        up = lambda m_: np.array(Image.fromarray(m_.astype(np.uint8) * 255).resize((vc.W, vc.H), Image.NEAREST)) > 0
        dm = (master * 0.45).astype(np.uint8)
        dm[fg[..., 3] < 255] = (dm[fg[..., 3] < 255] * 0.5 + np.array([40, 40, 60])).astype(np.uint8)
        dm[cont] = (0, 200, 220)
        dm[cont & up(minor)] = (255, 190, 0)
        dm[cont & up(ser)] = (255, 30, 30)
        vc.save(dm, out / f'defect_map_{name}.png')
    (out / 'edge_stats.json').write_text(json.dumps(stats, indent=1))
    lab, n = ndi.label(ndi.binary_dilation(union_ser, np.ones((5, 5))))
    union = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        box = [max(0, round(sl[1].start * 1.6) - 2), max(0, round(sl[0].start * 1.6) - 2), min(vc.W, round(sl[1].stop * 1.6) + 2), min(vc.H, round(sl[0].stop * 1.6) + 2)]
        cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
        union.append({'id': '', 'src_box': box, 'region': region_of(cx, cy),
                      'contaminated_src_px': int(cont[box[1]:box[3], box[0]:box[2]].sum())})
    union.sort(key=lambda c: (c['src_box'][1] // 40, c['src_box'][0]))
    for i, c in enumerate(union):
        c['id'] = f'S{i + 1:02d}'
    (out / 'serious_clusters.json').write_text(json.dumps(union, indent=1))
    print('union serious clusters', len(union))
    print(json.dumps({k: v for k, v in stats.items() if k != 'backgrounds'}, indent=1))
    for name, s in stats['backgrounds'].items():
        print(name, {k: s[k] for k in ('serious_display_px', 'minor_display_px', 'src_px_err_ge_48', 'peak_display', 'serious_cluster_count')})
        for r, v in s['regions'].items():
            print('   ', r, v)


if __name__ == '__main__':
    main(sys.argv[1])
