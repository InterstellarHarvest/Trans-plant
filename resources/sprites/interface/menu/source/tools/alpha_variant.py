#!/usr/bin/env python3
"""MENU-002A proposed derived alpha variant of the TIGHT leaf-clear foreground.

PROPOSAL ONLY. The approved foreground is never rewritten; this writes a
separate file under OUT with the same RGB (byte-for-byte) and a lower alpha
on the pixels that still hold the old Earth exterior (category A in the
report), by two explicit rules:
  MODEL   inside each REPAIR box (a SERIOUS cluster's source box, padded
          by PAD px), a pixel
          the edge model marks as baked exterior (share k) gets
              alpha' = 0 if k >= 0.8, else round(alpha (1-k))
  ISLAND  the same rule inside views_common.ISLANDS boxes, where the edge
          model takes painted Earth ocean/cloud (blue > red + 8) as k = 1,
          so those pixels go to alpha 0 (the band over the terrarium lid,
          the pipe-loop hole; the boxes stop above the terrarium glass).
So the new exterior shows through where the old one was painted. Nothing
outside those boxes changes, no alpha ever rises, and over the Earth
master the variant still reproduces the master exactly (its RGB is the
master's).

Writes: <OUT>/foreground_TIGHT_leafclear_v1_alphafix002a_PROPOSED_1536x1024.png,
        alphafix_footprint.json (counts, boxes, every changed pixel),
        alphafix_changed_mask.png, alphafix_effect.json (serious px before/after).
Usage (Trans-plant root):  python resources/sprites/interface/menu/source/tools/alpha_variant.py OUT
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).parent))
import views_common as vc  # noqa: E402
import mask_edges as me  # noqa: E402

# Category A: old exterior the matte left opaque (see REPORT.txt §5), as
# the source boxes (x0, y0, x1, y1) of the SERIOUS clusters judged by eye.
# The terrarium lid band and pipe-loop hole are views_common.ISLANDS.
REPAIR = {
    'terrarium-top leaves over clouds': [(1350, 182, 1365, 197), (1380, 195, 1397, 212), (1361, 209, 1376, 224)],
    'rail end / rail post foot / sill': [(1112, 636, 1143, 658), (724, 710, 740, 725), (785, 702, 802, 719)],
    'shrub gaps holding sunlit haze': [(1224, 552, 1239, 568), (1225, 529, 1244, 551), (1171, 595, 1188, 610), (1193, 598, 1208, 613),
                                       (1259, 564, 1274, 580), (1128, 662, 1149, 687), (1155, 640, 1170, 655), (1169, 659, 1184, 674),
                                       (1251, 641, 1266, 656), (1128, 691, 1144, 711)],
}
PAD = 3
NAME = 'foreground_TIGHT_leafclear_v1_alphafix002a_PROPOSED_1536x1024.png'


def main(out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    vc.check_locked()
    master, fg = vc.load_master(), vc.load_fg()
    M = me.model(master, fg)
    k, cont = M['k'], M['contaminated']
    a0 = fg[..., 3].astype(np.float64)
    a1 = fg[..., 3].copy()
    new = np.where(k >= 0.8, 0, np.rint(a0 * (1 - k))).astype(np.uint8)
    per = {}

    def apply(key, group, x0, y0, x1, y1):
        sel = np.zeros(cont.shape, bool)
        sel[y0:y1, x0:x1] = cont[y0:y1, x0:x1]
        a1[sel] = np.minimum(a1[sel], new[sel])
        per[key] = {'group': group, 'box_padded': [x0, y0, x1, y1]}

    for group, boxes in REPAIR.items():
        for x0, y0, x1, y1 in boxes:
            apply(f'R{len(per) + 1}', group, max(0, x0 - PAD), max(0, y0 - PAD), min(vc.W, x1 + PAD), min(vc.H, y1 + PAD))
    for group, boxes in vc.ISLANDS.items():
        for i, box in enumerate(boxes):
            apply(f'I{i + 1}', group, *box)
    changed = a1 != fg[..., 3]
    assert not (a1 > fg[..., 3]).any()
    variant = fg.copy()
    variant[..., 3] = a1
    assert (variant[..., :3] == fg[..., :3]).all()
    vc.save(variant, out / NAME)
    # Over the Earth master the variant must still give the master exactly.
    assert (vc.composite(variant, master) == master).all()
    for cid, d in per.items():
        x0, y0, x1, y1 = d['box_padded']
        d['changed_px'] = int(changed[y0:y1, x0:x1].sum())
        d['to_zero_px'] = int((changed & (a1 == 0))[y0:y1, x0:x1].sum())
    ys, xs = np.nonzero(changed)
    pixels = [[int(x), int(y), int(fg[y, x, 3]), int(a1[y, x])] for x, y in zip(xs, ys)]
    foot = {
        'file': NAME, 'sha256': vc.sha256(out / NAME), 'source': str(vc.TIGHT), 'source_sha256': vc.LOCKED[vc.TIGHT],
        'rgb': 'identical to source (all 1,572,864 px)',
        'alpha_rule': 'MODEL: inside padded cluster boxes, edge-model baked-exterior px: k>=0.8 -> 0, else round(alpha*(1-k)); ISLAND: the same rule inside views_common.ISLANDS boxes, where painted Earth (blue > red + 8) is k = 1 -> 0; alpha never raised',
        'changed_px': int(changed.sum()), 'changed_to_zero_px': int((changed & (a1 == 0)).sum()),
        'changed_bbox': [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
        'pct_of_frame': round(100 * changed.sum() / changed.size, 4),
        'over_earth_master': 'identical to master (0 px differ)',
        'clusters': per, 'pixels_x_y_alphaOld_alphaNew': pixels,
    }
    (out / 'alphafix_footprint.json').write_text(json.dumps(foot, indent=1))
    mask = (master * 0.35).astype(np.uint8)
    mask[changed] = (255, 0, 200)
    vc.save(mask, out / 'alphafix_changed_mask.png')
    # Effect: serious display px per background, before vs after, both
    # measured against the same clean target.
    effect = {}
    for name, B in vc.test_backgrounds().items():
        _, i8, _, ed0 = me.errors(M, B)
        c1 = vc.composite(variant, B)
        cd = np.array(Image.fromarray(c1).resize(me.DISP, Image.LANCZOS), int)
        idd = np.array(Image.fromarray(i8).resize(me.DISP, Image.LANCZOS), int)
        ed1 = np.abs(cd - idd).max(-1)
        s0 = ndi.binary_opening(ed0 >= me.SERIOUS, structure=np.ones((3, 3)))
        s1 = ndi.binary_opening(ed1 >= me.SERIOUS, structure=np.ones((3, 3)))
        effect[name] = {'serious_display_px_before': int(s0.sum()), 'serious_display_px_after': int(s1.sum()),
                        'minor_display_px_before': int(((ed0 >= me.MINOR) & ~s0).sum()), 'minor_display_px_after': int(((ed1 >= me.MINOR) & ~s1).sum())}
        vc.save(c1, out / 'composites' / f'{name}_alphafix_1536.png')
    (out / 'alphafix_effect.json').write_text(json.dumps(effect, indent=1))
    print(json.dumps({k: v for k, v in foot.items() if k not in ('pixels_x_y_alphaOld_alphaNew', 'clusters')}, indent=1))
    print(json.dumps(effect, indent=1))


if __name__ == '__main__':
    main(sys.argv[1])
