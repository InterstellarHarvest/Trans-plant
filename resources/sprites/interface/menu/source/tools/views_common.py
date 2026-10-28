"""MENU-002A shared helpers: the locked menu art, exact compositing at the
1536x1024 source registration, and the four mask-test backgrounds.

Needs numpy, scipy, pillow (a scratch venv; the repo has no Python deps).
Every path is relative to the Trans-plant root (run from there).
"""
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image

W, H = 1536, 1024
MENU = Path('resources/sprites/interface/menu')
MASTER = MENU / 'scene_master_leafclear_v1_1536x1024.png'
TIGHT = MENU / 'foreground_TIGHT_leafclear_v1_1536x1024.png'
CONSERVATIVE = MENU / 'foreground_CONSERVATIVE_leafclear_v1_1536x1024.png'
LOCKED = {  # the approved MENU-001 files, never rewritten here
    MASTER: '129557686e9273e1dda84e1e9462ddb4ab01989adee945c15f12a0cd36b4e914',
    TIGHT: 'a369451fa2562a07f4fb53d0d08c1dd1720c04742fbbf9273bfc088b7511114f',
    CONSERVATIVE: 'e01f99b94b943040781411e0088034e573e4ff177d250552d7ac8309aede79d5',
    MENU / 'window_matte_tight_1536x1024.png': '84a8f2f7f555b1537c20f3b0c7ef875bfec97d9e90f9507a4c7007fd0a7c6299',
    MENU / 'window_matte_conservative_1536x1024.png': 'bb72b0cd9054504ab9cd19c7748f56b9c3ac150146e0ce94e210305baa102dc3',
}
FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'

# Problem areas named in the MENU-001B4A review, plus the main frame edges
# (source px boxes x0, y0, x1, y1).
REGIONS = {
    'skylights_left':   (520, 0, 830, 160),
    'skylights_right':  (800, 0, 1330, 110),
    'vines_top_right':  (1290, 0, 1440, 175),
    'pillar_beam':      (520, 100, 720, 700),
    'rail_and_sill':    (620, 600, 1140, 745),
    'shrub_right':      (1095, 470, 1290, 745),
    'terrarium_pipe':   (1215, 185, 1345, 365),
    'terrarium_column': (1290, 140, 1440, 680),
}

# Old exterior left as opaque islands the edge model can't reach (checked by
# eye on the master): painted Earth ocean/cloud, blue > red + 8, inside these
# boxes only. The boxes stop above the terrarium glass.
ISLANDS = {
    'terrarium lid band + pipe-loop hole': [(1250, 225, 1400, 330), (1250, 330, 1296, 375)],
}


def island_mask(master, alpha):
    m = master.astype(int)
    earth = (m[..., 2] > m[..., 0] + 8) & (alpha > 0)
    out = np.zeros(alpha.shape, bool)
    for boxes in ISLANDS.values():
        for x0, y0, x1, y1 in boxes:
            out[y0:y1, x0:x1] = earth[y0:y1, x0:x1]
    return out


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def check_locked():
    for p, h in LOCKED.items():
        got = sha256(p)
        assert got == h, f'{p} changed: {got}'


def load_master():
    return np.array(Image.open(MASTER).convert('RGB'))


def load_fg(path=TIGHT):
    a = np.array(Image.open(path))
    assert a.shape == (H, W, 4)
    return a


def composite(fg, exterior):
    """Straight-alpha 'over' at 1536x1024, rounded once: fg over exterior."""
    a = fg[..., 3:4].astype(np.float64) / 255.0
    out = fg[..., :3].astype(np.float64) * a + exterior.astype(np.float64) * (1.0 - a)
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


# ── Mask-test backgrounds (flat or deterministic; NOT artwork) ──────────
def bg_flat(rgb):
    out = np.empty((H, W, 3), np.uint8)
    out[:] = rgb
    return out


NAVY = (10, 16, 40)
MARS_ORANGE = (226, 116, 52)


def bg_nebula():
    """Purple/magenta nebula: smooth gradient + soft blobs + low-frequency
    noise from a fixed seed (identical on every run)."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
    t = (xx / W * 0.6 + yy / H * 0.4)
    base = np.stack([24 + 40 * t, 8 + 12 * t, 46 + 44 * t], -1)
    rng = np.random.default_rng(2002)
    for i in range(7):
        cx, cy = rng.uniform(450, 1450), rng.uniform(20, 760)
        r = rng.uniform(110, 260)
        col = np.array([215, 60, 175]) if i % 2 == 0 else np.array([125, 60, 220])  # magenta / violet
        g = np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r * r))[..., None]
        base = base + g * col * 0.42
    noise = rng.standard_normal((H // 32 + 2, W // 32 + 2))
    noise = np.array(Image.fromarray(((noise + 3) * 40).clip(0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), np.float64)
    base = base + ((noise - 120) * 0.18)[..., None] * np.array([1.0, 0.4, 0.9])
    return np.clip(np.rint(base), 0, 255).astype(np.uint8)


def bg_checker(cell=16):
    yy, xx = np.mgrid[0:H, 0:W]
    on = ((xx // cell + yy // cell) % 2).astype(bool)
    out = np.zeros((H, W, 3), np.uint8)
    out[on] = 255
    return out


def test_backgrounds():
    return {
        'navy': bg_flat(NAVY),
        'mars_orange': bg_flat(MARS_ORANGE),
        'nebula': bg_nebula(),
        'checker': bg_checker(),
    }


def save(arr, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr).save(path, optimize=True)
    return path
