import json, os, sys, concurrent.futures as cf, urllib.request
FOLDERS = {"a69d3ef0-a997-464e-af75-432a5e7d165b":"Normal","0c4aa446-e535-448d-bc65-afede618d085":"Cataract",
 "3a484383-d2cf-4cc0-93bc-55a8e7faa8a8":"Eyelid drooping","03f5c932-0989-4dab-9428-29505ee62895":"Conjunctivitis",
 "20b6cff3-abf8-41be-a580-afbeef78566b":"Uveitis"}  # mapped by file counts == dataset description's pre-SMOTE counts
meta = json.load(open("data/meta.json"))
jobs=[]
for f in meta["files"]:
    c = FOLDERS.get(f.get("folder_id"))
    if not c: continue
    d=f"data/raw/{c}"; os.makedirs(d,exist_ok=True)
    jobs.append((f["content_details"]["download_url"], f"{d}/{f['id'][:8]}_{f['filename']}"))
def get(j):
    u,p=j
    if os.path.exists(p): return
    for t in range(4):
        try:
            r=urllib.request.Request(u,headers={"User-Agent":"curl/8.4.0"})
            open(p,"wb").write(urllib.request.urlopen(r,timeout=60).read()); return
        except Exception as e:
            err=e
    print("FAIL",u,err)
with cf.ThreadPoolExecutor(8) as ex: list(ex.map(get,jobs))
print(len(jobs))
