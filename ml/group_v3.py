"""Near-duplicate grouping (ordered, size-capped union-find to avoid chaining).
Evidence: filename '<hash>-Copy_<id>' prefix (priority), then centered ResNet18-embedding cosine (max over h/v flips) >= EMB_T, most similar pairs first.
Also exact/near phash (flip+crop robust) is folded in: such pairs have embedding cosine ~0.9+."""
import json,torch,collections,numpy as np
EMB_T=0.70; CAP=8
it=json.load(open("data/manifest_v3.json")); S=torch.load("data/sim_v3.pt").float(); n=len(it)
par=list(range(n)); size=[1]*n
def find(x):
    while par[x]!=x: par[x]=par[par[x]]; x=par[x]
    return x
def union(a,b):
    a,b=find(a),find(b)
    if a==b or size[a]+size[b]>CAP: return
    par[a]=b; size[b]+=size[a]
byp=collections.defaultdict(list)
for i,x in enumerate(it):
    if x["prefix"]: byp[x["prefix"]].append(i)
for m in byp.values():
    for j in m[1:]: union(m[0],j)
iu=torch.triu(S>=EMB_T,1); idx=torch.nonzero(iu); vals=S[iu]; order=torch.argsort(vals,descending=True)
for k in order.tolist(): union(int(idx[k,0]),int(idx[k,1]))
roots={}
for i,x in enumerate(it): x["group"]=roots.setdefault(find(i),len(roots))
json.dump(it,open("data/manifest_v3g.json","w"))
G=collections.Counter(x["group"] for x in it); print("groups",len(G),"size hist",sorted(collections.Counter(G.values()).items()))
