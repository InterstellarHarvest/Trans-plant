#!/usr/bin/env python3
"""Build a fitted exterior-only Mars artwork plate for MENU-002B art replacement.
Only changes source exterior artwork. Actual masked composite is built by Claude.
"""
from PIL import Image, ImageFilter
import numpy as np
from pathlib import Path
import hashlib
import json

HERE=Path('/mnt/data')
SRC=HERE/'wide_cinematic_space_scene_atmospheric_sci_fi_rea.png'
OUT=HERE/'MENU002_MARS_V2_EXTERIOR_REGISTERED_1536x1024.png'
PREVIEW=HERE/'MENU002_MARS_V2_EXTERIOR_PREVIEW_960x640.jpg'

# Reconstructed from three observed source-art limb landmarks.
# A similarity transform aligns the observed generated disc to the approved
# Earth limb circle center=(1561,964), radius=930 (MENU-002A registration).
ORIGINAL_CENTER=(1482.35294117647,1288.6764705882351)
ORIGINAL_RADIUS=1275.4301211531097
TARGET_CENTER=(1561.,964.)
TARGET_RADIUS=930.
S=TARGET_RADIUS/ORIGINAL_RADIUS
TX=TARGET_CENTER[0]-S*ORIGINAL_CENTER[0]
TY=TARGET_CENTER[1]-S*ORIGINAL_CENTER[1]

img=Image.open(SRC).convert('RGB')
assert img.size==(1536,1024)
new_size=(round(img.width*S),round(img.height*S))
scaled=img.resize(new_size,Image.Resampling.LANCZOS)
# Use the generated full-canvas illustration for hidden full-bleed areas.
# Register the near-Earth-sized planet as a second plate, with feathered edges
# ONLY in areas hidden by the immutable room (left of source x~537, below
# source y~727). Thus no seam can enter a window opening.
w,h=1536,1024
px,py=round(TX),round(TY)
old=np.asarray(img).copy()
registered=old.copy()
registered[py:min(h,py+scaled.height),px:min(w,px+scaled.width)] = np.asarray(scaled)[:min(h-py,scaled.height),:min(w-px,scaled.width)]
# Extend sky through the upper 24px skylight opening by mirroring the nearest
# transformed sky pixels, avoiding stretched vertical columns.
if py>0:
    for y in range(py):
        src_y=py+(py-y)
        registered[y,px:]=registered[src_y,px:]
# Smooth the join only outside window: x<~537, y>~727. The margin is not
# the game scene; it is full-bleed continuity for the exterior-only source.
xx=np.arange(w)[None,:]
yy=np.arange(h)[:,None]
a_x=np.clip((xx-px)/50.,0,1)
a_y=np.clip((py+scaled.height-yy)/38.,0,1)
mask=np.minimum(a_x,a_y)
blend=old.astype(np.float32)*(1-mask[...,None])+registered.astype(np.float32)*mask[...,None]
canvas=Image.fromarray(np.uint8(np.clip(np.rint(blend),0,255)),'RGB')
canvas.save(OUT,optimize=True)
canvas.resize((960,640),Image.Resampling.LANCZOS).save(PREVIEW,quality=95,subsampling=0)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest={
    'name':'MENU-002 Mars revised exterior — high-detail illustrated candidate',
    'status':'ART CANDIDATE, UNAPPROVED; never ship until actual composite reviewed',
    'source_image':SRC.name,
    'source_sha256':sha(SRC),
    'source_dimensions':list(img.size),
    'registered_artwork':OUT.name,
    'registered_sha256':sha(OUT),
    'registered_dimensions':[1536,1024],
    'scale':S,
    'translation_stage_source_px':[TX,TY],
    'reference_source_disc':{'center':ORIGINAL_CENTER,'radius':ORIGINAL_RADIUS,'approximation':'circle estimated from three sampled limb points'},
    'target_disc':{'center':TARGET_CENTER,'radius':TARGET_RADIUS,'reference':'MENU-002A approved Earth limb'},
    'light_source':'white-hot sunrise near top-right, close to MENU-002A baked sunlight registration',
    'preview_sha256':sha(PREVIEW),
    'source_origin':'generated illustrative Mars-like terrain (fictionalized), not a NASA terrain dataset',
    'required_compositing':'offline 1536x1024 RGBA over derived alternate-view foreground, single PNG, no canvas at runtime',
    'no_production_change':True,
    'limitations':['Not yet validated behind the true window mask','Detailed cinematic style still needs PMO visual evaluation against painted room','No room, interface, spacecraft, people or text in exterior']
}
(HERE/'MENU002_MARS_V2_MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({k:v for k,v in manifest.items() if k in ['registered_sha256','source_sha256','scale','translation_stage_source_px','registered_dimensions']},indent=2))
