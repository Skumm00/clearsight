import json,torch,numpy as np
from PIL import Image
from torchvision import models, transforms as T
it=json.load(open("data/manifest_v3.json"))
m=models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1); m.fc=torch.nn.Identity(); m=m.to("mps").eval()
tf=T.Compose([T.Resize((224,224)),T.ToTensor(),T.Normalize([.485,.456,.406],[.229,.224,.225])])
class D(torch.utils.data.Dataset):
    def __len__(s): return len(it)
    def __getitem__(s,k):
        im=Image.open(it[k]["path"]).convert("RGB"); w,h=im.size
        im=im.crop((int(w*.12),int(h*.12),int(w*.88),int(h*.88))); return tf(im)
if __name__=='__main__':
    E=[]
    with torch.no_grad():
        for x in torch.utils.data.DataLoader(D(),batch_size=128,num_workers=4):
            x=x.to("mps"); fs=[m(x),m(x.flip(3)),m(x.flip(2)),m(x.flip(2).flip(3))]
            E.append(torch.stack([torch.nn.functional.normalize(f,dim=1) for f in fs],1).cpu())
    np.save("data/emb_v3.npy",torch.cat(E).numpy()); print("done")
