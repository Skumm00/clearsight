"""ClearSight external-eye classifier. Usage: .venv/bin/python train.py  (after download.py)
Steps: count -> phash dedupe (group-aware) -> stratified group 70/15/15 split -> finetune MobileNetV3-Small
-> early stop on val macro-F1 -> single test eval -> ONNX export + verification -> JSON/metrics outputs."""
import os, json, glob, time, random, collections
import numpy as np, torch, torch.nn as nn, imagehash
from PIL import Image
from torchvision import models, transforms as T
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.metrics import f1_score, classification_report, confusion_matrix, accuracy_score

SEED=0; random.seed(SEED); np.random.seed(SEED); torch.manual_seed(SEED)
ROOT=os.path.dirname(os.path.abspath(__file__))
LABELS=["Cataract","Conjunctivitis","Eyelid drooping","Normal","Uveitis"]
HAMMING=6; MAX_MIN=20; MAX_EPOCHS=14; PATIENCE=4; BS=32
OUT_MODEL=os.environ.get("OUT_MODEL",f"{ROOT}/out_v2")  # copy to clearsight/public/models only after review
dev=torch.device("mps" if torch.backends.mps.is_available() else "cpu")

# 1. load + count
items=[]; raw_counts={}; bad=collections.Counter()
for ci,l in enumerate(LABELS):
    fs=sorted(glob.glob(f"{ROOT}/data/raw/{l}/*"))
    raw_counts[l]=len(fs)
    for f in fs:
        try:
            im=Image.open(f); im.load(); im=im.convert("RGB")
        except Exception: bad[l]+=1; continue
        if min(im.size)<32: bad[l]+=1; continue   # unusable thumbnails
        items.append((f,ci,imagehash.phash(im)))
print("raw",raw_counts,"unreadable/tiny",dict(bad))

# 2. dedupe: union-find on Hamming<=HAMMING (across all classes, to catch cross-class leakage)
n=len(items); par=list(range(n))
def find(x):
    while par[x]!=x: par[x]=par[par[x]]; x=par[x]
    return x
H=np.array([it[2].hash.flatten() for it in items])
for i in range(n):
    d=(H[i+1:]!=H[i]).sum(1)
    for j in np.nonzero(d<=HAMMING)[0]: par[find(i)]=find(i+1+j)
groups=collections.defaultdict(list)
for i in range(n): groups[find(i)].append(i)
keep=[]; gid=[]; removed=collections.Counter(); conflict=0
for g,m in groups.items():
    if len({items[i][1] for i in m})>1:   # same image under multiple labels = label noise: drop whole group
        conflict+=len(m)
        for i in m: removed[LABELS[items[i][1]]]+=1
        continue
    keep.append(m[0]); gid.append(g)
    for i in m[1:]: removed[LABELS[items[i][1]]]+=1
data=[items[i] for i in keep]
final_counts=collections.Counter(LABELS[d[1]] for d in data)
print("removed",dict(removed),"conflicting-label images dropped",conflict,"after",dict(final_counts))

# 3. split (each kept image is its own group post-dedupe; groups were collapsed to one representative,
#    so no near-duplicate can cross splits)
y=np.array([d[1] for d in data]); g=np.array(gid)
sk=StratifiedGroupKFold(n_splits=20,shuffle=True,random_state=SEED)
folds=[te for _,te in sk.split(np.zeros(len(y)),y,g)]
test=np.concatenate(folds[:3]); val=np.concatenate(folds[3:6]); train=np.concatenate(folds[6:])
print("split",len(train),len(val),len(test))

import io
class Degrade:
    """Size-neutralizing aug, same prob for every class: down to random short side 48-224, back up, blur, JPEG jitter."""
    def __call__(s,im):
        if random.random()<0.9:
            w,h=im.size; sc=random.uniform(48,224)/min(w,h)
            if sc<1: im=im.resize((max(8,round(w*sc)),max(8,round(h*sc))),Image.BILINEAR).resize((w,h),Image.BICUBIC)
        if random.random()<0.3:
            from PIL import ImageFilter; im=im.filter(ImageFilter.GaussianBlur(random.uniform(0.5,2.0)))
        if random.random()<0.5:
            b=io.BytesIO(); im.save(b,"JPEG",quality=random.randint(20,95)); b.seek(0); im=Image.open(b).convert("RGB")
        return im
norm=T.Normalize([0.485,0.456,0.406],[0.229,0.224,0.225])
tr_t=T.Compose([T.Resize(256),Degrade(),T.RandomResizedCrop(224,scale=(0.6,1.0)),T.RandomHorizontalFlip(),T.RandomRotation(10),
    T.ColorJitter(0.3,0.3,0.3,0.03),T.ToTensor(),norm])
ev_t=T.Compose([T.Resize((224,224)),T.ToTensor(),norm])
cc_t=T.Compose([T.Resize(224),T.CenterCrop(224),T.ToTensor(),norm])
d64_t=T.Compose([T.Resize((64,64),Image.BILINEAR),T.Resize((224,224),Image.BICUBIC),T.ToTensor(),norm])
class DS(torch.utils.data.Dataset):
    def __init__(s,idx,t): s.idx=idx; s.t=t; s.cache={}
    def __len__(s): return len(s.idx)
    def __getitem__(s,k):
        f,c,_=data[s.idx[k]]
        if f not in s.cache:
            im=Image.open(f).convert("RGB"); im.thumbnail((320,320)); s.cache[f]=im
        return s.t(s.cache[f]),c
def DL(idx,t,sh): return torch.utils.data.DataLoader(DS(idx,t),batch_size=BS,shuffle=sh,num_workers=0)
dtr,dva,dte=DL(train,tr_t,True),DL(val,d64_t,False),DL(test,ev_t,False)  # val for early stop = size-neutralized (64px)

m=models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1)
m.classifier[3]=nn.Linear(m.classifier[3].in_features,len(LABELS)); m=m.to(dev)
cnt=np.bincount(y[train],minlength=len(LABELS)); w=torch.tensor(len(train)/(len(LABELS)*cnt),dtype=torch.float32,device=dev)
crit=nn.CrossEntropyLoss(weight=w); opt=torch.optim.AdamW(m.parameters(),lr=1e-3,weight_decay=1e-4)
sched=torch.optim.lr_scheduler.CosineAnnealingLR(opt,MAX_EPOCHS)
def predict(dl):
    m.eval(); P=[];Y=[]
    with torch.no_grad():
        for x,t in dl: P+=m(x.to(dev)).argmax(1).cpu().tolist(); Y+=t.tolist()
    return np.array(Y),np.array(P)
best=-1;bad_ep=0;t0=time.time();best_state=None;log=[]
for ep in range(MAX_EPOCHS):
    m.train(); tl=0
    for x,t in dtr:
        x,t=x.to(dev),t.to(dev); opt.zero_grad(); l=crit(m(x),t); l.backward(); opt.step(); tl+=l.item()*len(t)
    sched.step(); yv,pv=predict(dva); f1=f1_score(yv,pv,average="macro")
    log.append((ep+1,tl/len(train),f1)); print(f"ep{ep+1} loss {tl/len(train):.3f} val macroF1 {f1:.3f} t={time.time()-t0:.0f}s",flush=True)
    if f1>best: best=f1; bad_ep=0; best_state={k:v.cpu().clone() for k,v in m.state_dict().items()}
    else:
        bad_ep+=1
        if bad_ep>=PATIENCE: break
    if time.time()-t0>MAX_MIN*60: break
m.load_state_dict(best_state)

# 4. single test evaluation
yt,pt=predict(dte)
acc=accuracy_score(yt,pt); mf1=f1_score(yt,pt,average="macro")
rep=classification_report(yt,pt,target_names=LABELS,digits=3,output_dict=True)
cm=confusion_matrix(yt,pt)
print("TEST acc",acc,"macroF1",mf1); print(classification_report(yt,pt,target_names=LABELS,digits=3)); print(cm)

def ev(t):
    y_,p_=predict(DL(test,t,False)); return dict(acc=accuracy_score(y_,p_),macro_f1=f1_score(y_,p_,average="macro"),
        per_class_f1=dict(zip(LABELS,f1_score(y_,p_,average=None).tolist())),cm=confusion_matrix(y_,p_).tolist())
variants={"asis_resize224":ev(ev_t),"centercrop224_nodegrade":ev(cc_t),"forced_64px_down_up":ev(d64_t)}
for k,v in variants.items(): print(k,round(v["acc"],3),round(v["macro_f1"],3),{a:round(b,2) for a,b in v["per_class_f1"].items()})
# 5. export ONNX
m=m.cpu().eval(); os.makedirs(OUT_MODEL,exist_ok=True)
path=f"{OUT_MODEL}/eye_classifier.onnx"
torch.onnx.export(m,torch.randn(1,3,224,224),path,input_names=["input"],output_names=["logits"],opset_version=17,dynamo=False)
import onnxruntime as ort
s=ort.InferenceSession(path); maxdiff=0
for k in range(8):
    x,_=dte.dataset[k]; x=x[None]
    with torch.no_grad(): a=m(x).numpy()
    b=s.run(["logits"],{"input":x.numpy()})[0]; maxdiff=max(maxdiff,float(np.abs(a-b).max())); assert a.argmax()==b.argmax()
size=os.path.getsize(path)/1e6; print("onnx MB",size,"maxdiff",maxdiff)
json.dump({"labels":LABELS,"input_size":224,"mean":[0.485,0.456,0.406],"std":[0.229,0.224,0.225]},open(f"{OUT_MODEL}/eye_labels.json","w"),indent=2)
json.dump(dict(raw=raw_counts,unreadable=dict(bad),removed=dict(removed),conflict=conflict,final=dict(final_counts),
  split=[len(train),len(val),len(test)],split_per_class={nm:[int((y[i]==c).sum()) for i in (train,val,test)] for c,nm in enumerate(LABELS)},
  epochs=len(log),log=log,best_val=best,test_acc=acc,test_macro_f1=mf1,report=rep,cm=cm.tolist(),
  variants=variants,onnx_mb=size,onnx_maxdiff=maxdiff,device=str(dev),train_s=time.time()-t0),open(f"{ROOT}/results_v2.json","w"),indent=1)
