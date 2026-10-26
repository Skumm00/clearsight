"""v3: Roboflow Eye Dataset + Mendeley pooled. Requires prep_v3.py, embed_v3.py, group_v3.py (grouping) first.
Phases: dataset build -> source/size/border audit -> cross-source runs -> main run (test once, 3 variants) -> calibration -> ONNX -> results_v3.json"""
import os, json, io, time, random, collections, numpy as np, torch, torch.nn as nn
from PIL import Image, ImageFilter
from torchvision import models, transforms as T
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.metrics import f1_score, accuracy_score, confusion_matrix, classification_report
SEED=0; random.seed(SEED); np.random.seed(SEED); torch.manual_seed(SEED)
ROOT=os.path.dirname(os.path.abspath(__file__)); OUT=f"{ROOT}/out_v3"; os.makedirs(OUT,exist_ok=True)
dev=torch.device("mps" if torch.backends.mps.is_available() else "cpu")
R={}
def save(): json.dump(R,open(f"{ROOT}/results_v3.json","w"),indent=1,default=float)

# ---------- dataset ----------
it=json.load(open(f"{ROOT}/data/manifest_v3g.json"))
for x in it:
    if x["label"]=="EyelidMend": x["label"]="Blepharitis"; x["sub"]="Mendeley Eyelid drooping"
G=collections.defaultdict(list)
for i,x in enumerate(it): G[x["group"]].append(i)
R["raw_counts"]={f"{s}/{c}":n for (s,c),n in collections.Counter((x["src"],x["sub"]) for x in it).items()}
def corner(p):
    a=np.asarray(Image.open(p).convert("L").resize((100,100)))
    return float((np.concatenate([a[:12,:12].ravel(),a[:12,-12:].ravel(),a[-12:,:12].ravel(),a[-12:,-12:].ravel()])<12).mean())
reps=[]; dup=collections.Counter()
for g,m in G.items():
    srcs={it[i]["src"] for i in m}; cross=len(srcs)>1
    bylab=collections.defaultdict(list)
    for i in m:
        if it[i]["label"] is not None: bylab[it[i]["label"]].append(i)
    if len({it[i]["label"] for i in m})>1: dup["groups_with_conflicting_labels"]+=1
    for lab,ids in bylab.items():
        ids=sorted(ids,key=lambda i:(it[i]["src"]!="mendeley",corner(it[i]["path"]),i)); r=ids[0]
        reps.append(dict(path=it[r]["path"],label=lab,src=it[r]["src"],sub=it[r]["sub"],group=g,cross=cross,size=it[r]["size"],
                         subs=sorted({it[i]["sub"] for i in ids})))
        k="across" if cross else ("within_"+it[r]["src"]); dup[k+"_removed"]+=len(ids)-1
dup["dropped_glaucoma_images"]=sum(1 for x in it if x["label"] is None)
R["dup"]=dict(dup)
cnt=collections.Counter(r["label"] for r in reps)
if cnt["Pinguecula"]<150: reps=[r for r in reps if r["label"]!="Pinguecula"]; R["pinguecula"]=f"dropped ({cnt['Pinguecula']}<150)"
else: R["pinguecula"]=f"kept separate ({cnt['Pinguecula']}>=150)"
LABELS=sorted({r["label"] for r in reps},key=str.lower); LI={l:i for i,l in enumerate(LABELS)}
for r in reps: r["y"]=LI[r["label"]]
R["labels"]=LABELS
R["final_counts"]={l:sum(r["label"]==l for r in reps) for l in LABELS}
R["final_counts_by_source"]={l:{s:sum(r["label"]==l and r["src"]==s for r in reps) for s in("roboflow","mendeley")} for l in LABELS}
print(R["dup"],R["pinguecula"],R["final_counts"],flush=True)
y=np.array([r["y"] for r in reps]); grp=np.array([r["group"] for r in reps])
folds=[te for _,te in StratifiedGroupKFold(20,shuffle=True,random_state=SEED).split(np.zeros(len(y)),y,grp)]
test=np.concatenate(folds[:3]); val=np.concatenate(folds[3:6]); train=np.concatenate(folds[6:])
assert not (set(grp[train])&set(grp[test])) and not (set(grp[train])&set(grp[val])) and not (set(grp[val])&set(grp[test]))
R["split"]=[len(train),len(val),len(test)]
R["split_per_class"]={l:[int((y[i]==LI[l]).sum()) for i in (train,val,test)] for l in LABELS}
print("split",R["split"],flush=True)

# ---------- audit: resolution / black borders / stretch per class and source ----------
def stats(r):
    im=Image.open(r["path"]).convert("L"); a=np.asarray(im.resize((100,100)))
    corner=np.concatenate([a[:12,:12].ravel(),a[:12,-12:].ravel(),a[-12:,:12].ravel(),a[-12:,-12:].ravel()])
    return dict(blackcorner=float((corner<12).mean()),blackfrac=float((a<12).mean()),sharp=float(np.abs(np.diff(np.asarray(im.resize((224,224))).astype(float),axis=1)).mean()))
aud=collections.defaultdict(list)
for r in reps:
    s=stats(r); s["short"]=min(r["size"]); s["square"]=r["size"][0]==r["size"][1]; aud[(r["label"],r["src"])].append(s)
R["audit"]={f"{l}|{s}":dict(n=len(v),median_short_side=float(np.median([a["short"] for a in v])),frac_square=float(np.mean([a["square"] for a in v])),
    mean_black_corner_frac=float(np.mean([a["blackcorner"] for a in v])),mean_sharpness=float(np.mean([a["sharp"] for a in v]))) for (l,s),v in sorted(aud.items())}
save()

# ---------- transforms ----------
class Degrade:
    def __call__(s,im):
        if random.random()<0.9:
            w,h=im.size; sc=random.uniform(48,224)/min(w,h)
            if sc<1: im=im.resize((max(8,round(w*sc)),max(8,round(h*sc))),Image.BILINEAR).resize((w,h),Image.BICUBIC)
        if random.random()<0.3: im=im.filter(ImageFilter.GaussianBlur(random.uniform(0.5,2.0)))
        if random.random()<0.5:
            b=io.BytesIO(); im.save(b,"JPEG",quality=random.randint(20,95)); b.seek(0); im=Image.open(b).convert("RGB")
        return im
norm=T.Normalize([0.485,0.456,0.406],[0.229,0.224,0.225])
tr_t=T.Compose([T.Resize((256,256)),Degrade(),T.RandomApply([T.RandomRotation(15,fill=0)],p=0.7),   # black-corner rotation for ALL classes
    T.RandomResizedCrop(224,scale=(0.6,1.0)),T.RandomHorizontalFlip(),T.RandomVerticalFlip(0.15),T.ColorJitter(0.3,0.3,0.3,0.03),T.ToTensor(),norm])
ev_t=T.Compose([T.Resize((224,224)),T.ToTensor(),norm])
cc_t=T.Compose([T.Resize(224),T.CenterCrop(224),T.ToTensor(),norm])
d64_t=T.Compose([T.Resize((64,64),Image.BILINEAR),T.Resize((224,224),Image.BICUBIC),T.ToTensor(),norm])
CACHE={}
class DS(torch.utils.data.Dataset):
    def __init__(s,idx,t,ymap=None): s.idx=list(idx); s.t=t; s.ymap=ymap
    def __len__(s): return len(s.idx)
    def __getitem__(s,k):
        r=reps[s.idx[k]]; p=r["path"]
        if p not in CACHE:
            im=Image.open(p).convert("RGB"); im.thumbnail((320,320)); CACHE[p]=im
        return s.t(CACHE[p]),(s.ymap[r["y"]] if s.ymap else r["y"])
def DL(idx,t,sh,ymap=None): return torch.utils.data.DataLoader(DS(idx,t,ymap),batch_size=32,shuffle=sh,num_workers=0)
def logits_of(m,dl):
    m.eval(); L=[];Y=[]
    with torch.no_grad():
        for x,t in dl: L.append(m(x.to(dev)).cpu()); Y+=t.tolist()
    return torch.cat(L).numpy(),np.array(Y)
def fit(tr,va,ncls,ymap=None,max_min=14,max_ep=16,patience=5,tag=""):
    m=models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1)
    m.classifier[3]=nn.Linear(m.classifier[3].in_features,ncls); m=m.to(dev)
    yy=np.array([ymap[reps[i]["y"]] if ymap else reps[i]["y"] for i in tr]); c=np.bincount(yy,minlength=ncls).clip(1)
    crit=nn.CrossEntropyLoss(weight=torch.tensor(len(yy)/(ncls*c),dtype=torch.float32,device=dev))
    opt=torch.optim.AdamW(m.parameters(),lr=1e-3,weight_decay=1e-4); sch=torch.optim.lr_scheduler.CosineAnnealingLR(opt,max_ep)
    dtr=DL(tr,tr_t,True,ymap); dva=DL(va,d64_t,False,ymap); best=-1;bad=0;t0=time.time();st=None;log=[]
    for ep in range(max_ep):
        m.train()
        for x,t in dtr:
            x,t=x.to(dev),t.to(dev); opt.zero_grad(); crit(m(x),t).backward(); opt.step()
        sch.step(); lv,yv=logits_of(m,dva); f1=f1_score(yv,lv.argmax(1),average="macro"); log.append(f1)
        print(f"[{tag}] ep{ep+1} val(64px) macroF1 {f1:.3f} t={time.time()-t0:.0f}s",flush=True)
        if f1>best: best=f1;bad=0;st={k:v.cpu().clone() for k,v in m.state_dict().items()}
        else:
            bad+=1
            if bad>=patience: break
        if time.time()-t0>max_min*60: break
    m.load_state_dict(st); return m,best,len(log)

# ---------- cross-source runs (4 shared classes; cross-source groups excluded) ----------
SH=["Normal","Cataract","Conjunctivitis","Uveitis"]; SM={LI[l]:k for k,l in enumerate(SH)}
R["cross_source"]={}
pure={s:[i for i,r in enumerate(reps) if r["src"]==s and not r["cross"] and r["label"] in SH] for s in("roboflow","mendeley")}
for a,b in (("roboflow","mendeley"),("mendeley","roboflow")):
    ia=np.array(pure[a]); ga=grp[ia]; ya=y[ia]
    fs=[te for _,te in StratifiedGroupKFold(7,shuffle=True,random_state=SEED).split(np.zeros(len(ia)),ya,ga)]
    inner_te=ia[fs[0]]; va_=ia[fs[1]]; tr_=ia[np.concatenate(fs[2:])]; tb=np.array(pure[b])
    m,bv,ne=fit(tr_,va_,4,SM,max_min=8,max_ep=10,patience=4,tag=f"{a}->{b}")
    res={}
    for nm,idx in (("same_source_heldout",inner_te),("other_source",tb)):
        for vn,t in (("asis",ev_t),("forced64",d64_t)):
            l,yt=logits_of(m,DL(idx,t,False,SM)); p=l.argmax(1)
            res[f"{nm}_{vn}"]=dict(n=len(idx),acc=accuracy_score(yt,p),macro_f1=f1_score(yt,p,average="macro"),
                per_class_recall={SH[k]:float(((p==k)&(yt==k)).sum()/max(1,(yt==k).sum())) for k in range(4)},
                counts={SH[k]:int((yt==k).sum()) for k in range(4)})
    res["train_n"]=len(tr_); res["train_counts"]={SH[k]:int((np.array([SM[y[i]] for i in tr_])==k).sum()) for k in range(4)}
    R["cross_source"][f"train_{a}_test_{b}"]=res; save(); print(a,"->",b,{k:(round(v["acc"],3),round(v["macro_f1"],3)) for k,v in res.items() if isinstance(v,dict) and "acc" in v},flush=True)

# ---------- main run ----------
m,best,ne=fit(train,val,len(LABELS),max_min=22,max_ep=18,patience=5,tag="main"); R["main_epochs"]=ne; R["best_val_f1_64px"]=best
# temperature on val (64px-degraded + as-is val logits pooled)
lv=np.concatenate([logits_of(m,DL(val,t,False))[0] for t in (ev_t,d64_t)]); yv=np.concatenate([y[val],y[val]])
lt=torch.tensor(lv); yt_=torch.tensor(yv); logT=torch.zeros(1,requires_grad=True)
o=torch.optim.LBFGS([logT],lr=0.1,max_iter=100); 
def cl(): o.zero_grad(); l=nn.functional.cross_entropy(lt/logT.exp(),yt_); l.backward(); return l
o.step(cl); Temp=float(logT.exp()); R["temperature"]=Temp
R["val_nll_before_after"]=[float(nn.functional.cross_entropy(lt,yt_)),float(nn.functional.cross_entropy(lt/Temp,yt_))]
# single test evaluation (3 preprocessings of the same held-out set)
R["test"]={}
for vn,t in (("asis_resize224",ev_t),("centercrop224_nodegrade",cc_t),("forced_64px_down_up",d64_t)):
    l,yt=logits_of(m,DL(test,t,False)); p=l.argmax(1)
    R["test"][vn]=dict(acc=accuracy_score(yt,p),macro_f1=f1_score(yt,p,average="macro"),
        report=classification_report(yt,p,labels=list(range(len(LABELS))),target_names=LABELS,digits=3,output_dict=True,zero_division=0),cm=confusion_matrix(yt,p,labels=list(range(len(LABELS)))).tolist())
    R["test"][vn]["logits"]=None
    if vn=="asis_resize224": L0,Y0=l,yt
    if vn=="forced_64px_down_up": L64=l
    print(vn,round(R["test"][vn]["acc"],3),round(R["test"][vn]["macro_f1"],3),flush=True)
rot_t=T.Compose([T.Resize((224,224)),T.RandomRotation((12,12),fill=0),T.ToTensor(),norm])
l,yt=logits_of(m,DL(test,rot_t,False)); p=l.argmax(1)
R["test"]["all_rotated_12deg_blackfill"]=dict(acc=accuracy_score(yt,p),macro_f1=f1_score(yt,p,average="macro"))
# like-for-like vs v2 on RF-only, non-cross test images of the 4 shared classes (v2 never saw those)
import onnxruntime as ort2
v2=ort2.InferenceSession(f"{ROOT}/out_v2/eye_classifier.onnx"); V2L=["Cataract","Conjunctivitis","Eyelid drooping","Normal","Uveitis"]
sel=[k for k,i in enumerate(test) if reps[i]["src"]=="roboflow" and not reps[i]["cross"] and reps[i]["label"] in SH]
tl=lambda k: SH.index(reps[test[k]]["label"])
v2c=[[V2L.index(n) for n in SH]][0]; v3c=[LI[n] for n in SH]; ok2=ok3=0
for k in sel:
    x,_=DS(test,ev_t)[k]; a=v2.run(["logits"],{"input":x[None].numpy()})[0][0][v2c]; ok2+=int(a.argmax()==tl(k)); ok3+=int(L0[k][v3c].argmax()==tl(k))
R["v2_vs_v3_rf_only_4class"]=dict(n=len(sel),v2_acc=ok2/len(sel),v3_acc=ok3/len(sel))
# by-source breakdown, subtype confusion, normal FP, confidence
tsrc=np.array([reps[i]["src"] for i in test]); P0=L0.argmax(1)
R["test_by_source_asis"]={s:dict(n=int((tsrc==s).sum()),acc=accuracy_score(Y0[tsrc==s],P0[tsrc==s])) for s in("roboflow","mendeley") if (tsrc==s).any()}
sm=torch.softmax(torch.tensor(L0),1).numpy(); smT=torch.softmax(torch.tensor(L0)/Temp,1).numpy()
def conf_stats(pr):
    c=pr.max(1); ok=(pr.argmax(1)==Y0); bins=np.linspace(0,1,11); ece=0
    for a,b in zip(bins[:-1],bins[1:]):
        k=(c>a)&(c<=b)
        if k.any(): ece+=k.mean()*abs(ok[k].mean()-c[k].mean())
    return dict(mean_conf=float(c.mean()),acc=float(ok.mean()),ece=float(ece),hist=np.histogram(c,bins=bins)[0].tolist(),
                mean_conf_correct=float(c[ok].mean()),mean_conf_wrong=float(c[~ok].mean()) if (~ok).any() else None,frac_wrong_conf_above_0p8=float(((c>0.8)&~ok).sum()/max(1,(~ok).sum())))
R["confidence_raw"]=conf_stats(sm); R["confidence_temp_scaled"]=conf_stats(smT)
ni=[k for k in range(len(test)) if Y0[k]==LI["Normal"]]; rng=random.Random(1); n20=rng.sample(ni,min(20,len(ni)))
def nfp(ix,L):
    p=L[ix].argmax(1); return {LABELS[k]:int((p==k).sum()) for k in range(len(LABELS))}
R["normal_check"]=dict(n_normal_test=len(ni),all_normal_asis=nfp(ni,L0),all_normal_64px=nfp(ni,L64),sample20_asis=nfp(n20,L0),sample20_64px=nfp(n20,L64),
    sample20_sources=dict(collections.Counter(tsrc[n20])),normal_test_sources=dict(collections.Counter(tsrc[ni])))
# subtype confusion for Conjunctivitis
subs=[reps[i]["sub"] for i in test]; sc=collections.defaultdict(collections.Counter)
for k in range(len(test)):
    if Y0[k]==LI["Conjunctivitis"]: sc[subs[k]][LABELS[P0[k]]]+=1
R["conj_subtype_pred"]={k:dict(v) for k,v in sc.items()}
# ---------- export ----------
m=m.cpu().eval(); path=f"{OUT}/eye_classifier.onnx"
torch.onnx.export(m,torch.randn(1,3,224,224),path,input_names=["input"],output_names=["logits"],opset_version=17,dynamo=False)
import onnxruntime as ort
s=ort.InferenceSession(path); md=0
for k in range(8):
    x,_=DS(test,ev_t)[k]; x=x[None]
    with torch.no_grad(): a=m(x).numpy()
    b=s.run(["logits"],{"input":x.numpy()})[0]; md=max(md,float(np.abs(a-b).max())); assert a.argmax()==b.argmax()
R["onnx_mb"]=os.path.getsize(path)/1e6; R["onnx_maxdiff"]=md
json.dump({"labels":LABELS,"input_size":224,"mean":[0.485,0.456,0.406],"std":[0.229,0.224,0.225],"temperature":Temp},open(f"{OUT}/eye_labels.json","w"),indent=2)
torch.save(m.state_dict(),f"{OUT}/model.pt"); save(); print("DONE",R["onnx_mb"],md,Temp)
