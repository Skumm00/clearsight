"""Pool Roboflow + Mendeley, compute flip/crop-robust perceptual hashes, build near-duplicate groups, write data/manifest_v3.json."""
import os, glob, json, re, collections, numpy as np, torch, imagehash
from multiprocessing import Pool
from PIL import Image, ImageOps
ROOT=os.path.dirname(os.path.abspath(__file__))
RF=f"{ROOT}/data/roboflow/extracted"
MAP_RF={"Allergic Conj":"Conjunctivitis","Bacterial Conj":"Conjunctivitis","Viral Conj":"Conjunctivitis","Blepharitis":"Blepharitis",
 "Cataract":"Cataract","Glaucoma":None,"Healthy":"Normal","Pinguecula":"Pinguecula","Stye":"Stye","Uveitis":"Uveitis","Xanthelasma":"Xanthelasma","pterygium":"Pterygium"}
MAP_ME={"Normal":"Normal","Cataract":"Cataract","Conjunctivitis":"Conjunctivitis","Uveitis":"Uveitis","Eyelid drooping":"EyelidMend"}
def bits(h): return h.hash.flatten().astype(np.uint8)
def hv(f):
    im=Image.open(f).convert("RGB"); w,h=im.size
    c=im.crop((int(w*.15),int(h*.15),int(w*.85),int(h*.85)))
    out=[]
    for x in (im,c):
        for v in (x,ImageOps.mirror(x),ImageOps.flip(x),ImageOps.flip(ImageOps.mirror(x))):
            out.append(bits(imagehash.phash(v)))
    return np.stack(out), im.size
if __name__=="__main__":
    items=[]
    for sp in ("train","valid","test"):
        for d in sorted(glob.glob(f"{RF}/{sp}/*/")):
            sub=os.path.basename(d.rstrip("/"))
            for f in sorted(glob.glob(d+"*")):
                m=re.match(r"(.+?-Copy_[0-9a-f]+)_jpg",os.path.basename(f))
                items.append(dict(path=f,src="roboflow",sub=sub,label=MAP_RF[sub],prefix=m.group(1) if m else None,rf_split=sp))
    for d in sorted(glob.glob(f"{ROOT}/data/raw/*/")):
        sub=os.path.basename(d.rstrip("/"))
        for f in sorted(glob.glob(d+"*")): items.append(dict(path=f,src="mendeley",sub=sub,label=MAP_ME[sub],prefix=None))
    print(len(items))
    with Pool(8) as p: res=p.map(hv,[i["path"] for i in items],chunksize=64)
    H=np.stack([r[0] for r in res]); n=len(items)
    for it,r in zip(items,res): it["size"]=list(r[1])
    # distance: min over 4 flips of j for full hash, and for crop hash
    t=torch.tensor(H,dtype=torch.float32)*2-1   # n,8,64
    par=list(range(n))
    def find(x):
        while par[x]!=x: par[x]=par[par[x]]; x=par[x]
        return x
    TH=6
    for base in (0,4):
        A=t[:,base]                      # original orientation
        D=torch.full((n,n),64.)
        for v in range(4):
            B=t[:,base+v]; D=torch.minimum(D,(64-A@B.T)/2)
        idx=torch.nonzero(torch.triu(D<=TH,1)).numpy()
        print("pairs",base,len(idx))
        for i,j in idx: par[find(int(i))]=find(int(j))
    byp=collections.defaultdict(list)
    for i,it in enumerate(items):
        if it["prefix"]: byp[it["prefix"]].append(i)
    for m in byp.values():
        for j in m[1:]: par[find(m[0])]=find(j)
    for i,it in enumerate(items): it["group"]=int(find(i))
    json.dump(items,open(f"{ROOT}/data/manifest_v3.json","w"))
    G=collections.defaultdict(list)
    for i,it in enumerate(items): G[it["group"]].append(i)
    st=collections.Counter()
    for m in G.values():
        s={items[i]["src"] for i in m}
        st["groups_"+"+".join(sorted(s))]+=1; st["imgs_in_groups_"+"+".join(sorted(s))]+=len(m)
    print(len(G),dict(st))
