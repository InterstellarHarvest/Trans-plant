from pathlib import Path
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter
import hashlib
W,H=1536,1024
rng=np.random.default_rng(281027)
y,x=np.mgrid[0:H,0:W].astype(np.float32)
# midnight-blue near-black, warmly illuminated near upper-right skylight
sky=np.zeros((H,W,3),dtype=np.float32)
sky[:]=[4.5,8.5,22]
r2=((x-1160)/1320)**2+((y-300)/740)**2
sky+=np.exp(-r2*1.8)[...,None]*np.array([2.1,1.2,3.2],dtype=np.float32)
# faint reddish dust bow under upper-right directional sun
haze=np.exp(-((x-1264)/370)**2-((y-100)/290)**2)
sky+=haze[...,None]*np.array([12,6,1],dtype=np.float32)
# Multi-octave brushed stellar gas on left with nearly invisible deep-blue contours
for sz,amp in [(10,0.8),(32,0.5),(105,0.3)]:
 n=cv2.resize(rng.normal(size=(max(3,H//sz),max(3,W//sz))).astype(np.float32),(W,H),interpolation=cv2.INTER_CUBIC)
 sky+=n[...,None]*np.array([0.4,0.7,1],dtype=np.float32)*amp
# sunlight bloom behind planet at upper right
rr=np.sqrt((x-1264)**2+(y-130)**2)
sunh=np.exp(-rr/125)
sky+=sunh[...,None]*np.array([75,38,13],dtype=np.float32)
# stars: very small with organic halo
star=Image.new('RGBA',(W,H),(0,0,0,0));sd=ImageDraw.Draw(star,'RGBA')
for i in range(900):
 sx,sy=float(rng.uniform(0,W)),float(rng.uniform(0,H))
 if rng.random()<0.22 and sx>660: continue
 rad=float(rng.choice([.42,.55,.75,.85,1,1.1,1.35,1.75],p=[.12,.17,.24,.2,.13,.09,.035,.015]))
 lum=int(rng.integers(90,202))
 hue=rng.choice([(226,236,250),(227,211,198),(158,199,234),(255,233,207)])
 sd.ellipse((sx-rad,sy-rad,sx+rad,sy+rad),fill=(*hue,int(lum*.85)))
 if rad>1.3:
  sd.ellipse((sx-2.8*rad,sy-2.8*rad,sx+2.8*rad,sy+2.8*rad),fill=(*hue,24))
# Martian disk centered lower-right, matching original Earth limb
cx,cy,R=1561.,964.,930.
dx=(x-cx)/R; dy=(cy-y)/R; rho2=dx**2+dy**2; inplanet=rho2<=1
z=np.sqrt(np.maximum(0,1-rho2))
# fBm surface marbling with sheet-like volcanic basalt plains
fb=np.zeros((H,W),np.float32)
weights=[(270,1.12),(150,0.67),(85,0.47),(43,0.26),(22,0.13),(11,0.085),(5,0.04),(2,0.018)]
for sz,amp in weights:
 a=rng.normal(size=(max(3,H//sz),max(3,W//sz))).astype(np.float32)
 n=cv2.resize(a,(W,H),interpolation=cv2.INTER_CUBIC)
 fb+=n*amp
fb=(fb-fb.mean())/(fb.std()+1e-5)
# regional marbled variable using low frequency gradients + ridges
large=cv2.resize(rng.normal(size=(10,17)).astype(np.float32),(W,H),interpolation=cv2.INTER_CUBIC)
medium=cv2.resize(rng.normal(size=(28,42)).astype(np.float32),(W,H),interpolation=cv2.INTER_CUBIC)
shiftx=large*23+medium*7
shifty=large*13-medium*9
# simulated Martian canyon cuts across surface
canyonY = 540+0.16*(x-1050)+48*np.sin((x-650)/190)+12*np.sin((x-600)/85)+medium*7
canyonDist=np.abs(y-canyonY)
canyon=(np.exp(-((canyonDist)/11)**2)*0.36+np.exp(-((canyonDist)/43)**2)*0.18)*np.exp(-((x-1060)/570)**4)
# solar-lit crater basins without obvious repeated circles
crater=np.zeros((H,W),np.float32)
crater_h=np.zeros((H,W),np.float32)
for i in range(195):
 px=float(rng.uniform(730,1640));py=float(rng.uniform(165,1150));rad=float(np.exp(rng.uniform(np.log(4),np.log(70))))
 if (px-cx)**2+(py-cy)**2>(R-rad*.9)**2:continue
 xx0=max(0,int(px-rad*2.3));xx1=min(W,int(px+rad*2.3));yy0=max(0,int(py-rad*2.3));yy1=min(H,int(py+rad*2.3))
 xx=x[yy0:yy1,xx0:xx1]; yy=y[yy0:yy1,xx0:xx1]
 u=((xx-px)/rad)**2+((yy-py)/(rad*max(.60,.83-0.2*(abs(px-cx)/R))))**2
 rim=np.exp(-((np.sqrt(u)-1)/0.16)**2)
 basin=np.exp(-u*2.3)
 shadow=np.exp(-((np.sqrt(u)-.75)/.20)**2)*np.clip((yy-py)/rad,-1,1)
 mag=float(rng.uniform(.8,2.1))
 crater[yy0:yy1,xx0:xx1]+=mag*(.36*rim-.52*basin+.25*shadow)
 crater_h[yy0:yy1,xx0:xx1]+=mag*rim
# colored terrain palette modeled after vintage hand-painted planetary covers
terrain=fb*0.75+large*0.55-canyon*2.0+crater*.65
# rusty dark volcanic basins, iron-rich dust plains
base=np.stack([148+terrain*24,75+terrain*18,46+terrain*12],axis=-1)
# apricot-hued highlands and darker basalt swaths
high=np.clip((terrain-.10)*.28,0,.38)
base+=(high[...,None]*np.array([40,28,13],dtype=np.float32))
low=np.clip((-terrain-0.5)*.24,0,.48)
base-=(low[...,None]*np.array([54,41,30],dtype=np.float32))
# fine wind streaks, dusty air suspended above deserts
noiseh=cv2.resize(rng.normal(size=(600,900)).astype(np.float32),(W,H),interpolation=cv2.INTER_LINEAR)
base+=noiseh[...,None]*np.array([5,3.8,2.1],dtype=np.float32)
# Sunward shading; upper right gets bright copper light, lower-left fades into violet shadows
# light from upper-right, in our stage projection +x,+y (cartesian)
N=np.stack([dx,dy,z],axis=-1)
L=np.array([0.48,0.78,0.53],dtype=np.float32);L/=np.linalg.norm(L)
ndotl=np.sum(N*L[None,None,:],axis=-1)
shade=np.clip(.30+.98*np.clip(ndotl,0,1),.16,1.16)
base*=shade[...,None]
# atmospheric dusty scatter follows silhouette
rho=np.sqrt(rho2)
edge=np.exp(-np.clip((1-rho)*R,0,1000)/34)
# warm reflected edge glow, relatively subdued except sunward
sunvec=np.clip((dx*.3+dy*.8+0.7),.12,1)
base+=edge[...,None]*sunvec[...,None]*np.array([72,34,17],dtype=np.float32)
# scattered ochre haze in sunward region
base+=np.exp(-((x-1264)/370)**2-((y-130)/220)**2)[...,None]*np.array([30,17,6],dtype=np.float32)
# shadowed terminator slight dusky purple
shadowness=np.clip(.55-ndotl,0,.55)
base[...,2]+=shadowness*12
# thin optical air at limb; very soft 2-5 px
alpha=np.clip((1-rho)*R/2.3+.55,0,1)
alpha=np.where(rho<.99,1,alpha)
# separate sky glow just outside limb
out=np.clip((rho-1)*R,0,300)
outer=np.exp(-out/18)*(rho>=1)
# warm reddish halo, stronger toward top right
sky+=outer[...,None]*np.array([43,18,9],dtype=np.float32)*(0.25+0.75*np.clip(sunvec,0,1))[...,None]
canvas=sky*(1-alpha[...,None])+base*alpha[...,None]
canvas=np.clip(canvas,0,255).astype(np.uint8)
im=Image.fromarray(canvas,'RGB')
# stars only in space, rendered under planet
stararr=np.array(star)
arr=np.array(im,dtype=np.float32)
star_a=(stararr[...,3]/255.)*(1-alpha)
arr=arr*(1-star_a[...,None])+stararr[...,:3]*star_a[...,None]
# bright but not overbearing sun flare at required light position
sun=np.exp(-((x-1264)**2+(y-130)**2)/(2*57**2))
sun2=np.exp(-((x-1264)**2+(y-130)**2)/(2*160**2))
arr+=sun[...,None]*np.array([59,42,19],dtype=np.float32)+sun2[...,None]*np.array([8,4,0.9],dtype=np.float32)
arr=np.clip(arr,0,255).astype(np.uint8)
outfile=Path('/mnt/data/MENU002B_MARS_EXTERIOR_CANDIDATE_1536x1024.png')
Image.fromarray(arr).save(outfile,optimize=True)
print('OUTPUT',outfile,'SHA256',hashlib.sha256(outfile.read_bytes()).hexdigest(),'BYTES',outfile.stat().st_size)
Image.fromarray(arr).resize((960,640),Image.Resampling.LANCZOS).save('/mnt/data/MENU002B_MARS_EXTERIOR_preview_960x640.jpg',quality=93)
