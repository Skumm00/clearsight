"""Evaluate an ONNX model on the same test split under 3 preprocessings. Usage: python eval_onnx.py path.onnx"""
import sys
src=open("train.py").read().split("m=models.mobilenet_v3_small")[0]
exec(compile(src,"train_prefix","exec"))
import onnxruntime as ort
s=ort.InferenceSession(sys.argv[1])
for name,t in [("asis_resize224",ev_t),("centercrop224_nodegrade",cc_t),("forced_64px_down_up",d64_t)]:
    P=[];Y=[]
    for x,c in DL(test,t,False):
        P+=[int(s.run(["logits"],{"input":xi[None].numpy()})[0].argmax()) for xi in x]; Y+=c.tolist()
    print(name,round(accuracy_score(Y,P),3),round(f1_score(Y,P,average="macro"),3),dict(zip(LABELS,f1_score(Y,P,average=None).round(2))))
