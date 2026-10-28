from PIL import Image,ImageFilter
import numpy as np, hashlib, os
src_path='/mnt/data/wide_cinematic_space_scene_high_detail_sci_fi_ast.png'
out='/mnt/data/MENU002_RINGED_V2_REGISTERED_CANDIDATE_1536x1024.png'
base=np.asarray(Image.open(src_path).convert('RGB')).astype(np.float32)
H,W=base.shape[:2]
s=0.70; ox=330; oy=57
new_w=round(W*s);new_h=round(H*s)
scaled=np.asarray(Image.open(src_path).convert('RGB').resize((new_w,new_h), Image.Resampling.LANCZOS)).astype(np.float32)
# Painterly source-image registration: original full-bleed starfield remains in
# unpainted margins, with the complete detailed painting fitted on top.
# The transition zones are deliberately outside the main window wherever possible.
x=np.arange(new_w,dtype=np.float32)
y=np.arange(new_h,dtype=np.float32)
# Fast smooth window edge blending, not duplicated or reflected rows.
def smoothstep(a):
 t=np.clip(a,0,1);return t*t*(3-2*t)
ax=np.minimum(smoothstep(x/75),smoothstep((new_w-1-x)/72))
ay=np.minimum(smoothstep(y/75),smoothstep((new_h-1-y)/8))
a=(ay[:,None]*ax[None,:])[:,:,None]
result=base.copy()
sub=result[oy:oy+new_h,ox:ox+new_w]
sub[:]=sub*(1-a)+scaled*a
Image.fromarray(np.uint8(np.clip(np.rint(result),0,255)),'RGB').save(out,optimize=True)
im=Image.open(out)
im.resize((960,640),Image.Resampling.LANCZOS).save('/mnt/data/MENU002_RINGED_V2_REGISTERED_PREVIEW_960x640.jpg',quality=92,subsampling=0)
print('output',out,im.size,os.path.getsize(out),'hash',hashlib.sha256(open(out,'rb').read()).hexdigest())
print('source:',src_path,hashlib.sha256(open(src_path,'rb').read()).hexdigest())
print('source fit: scale',s,'offset',ox,oy,'extent',ox+new_w,oy+new_h)
