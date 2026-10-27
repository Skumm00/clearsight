"use client";

import type { InferenceSession } from "onnxruntime-web";
import type { ScanFinding } from "./results";

interface Meta {
  labels: string[];
  input_size: number;
  mean: number[];
  std: number[];
  temperature?: number;
}

export class ModelMissingError extends Error {
  constructor() {
    super("The scan model has not been installed yet.");
  }
}

let loading: Promise<{ session: InferenceSession; meta: Meta; ort: typeof import("onnxruntime-web") }> | null = null;

function load() {
  loading ??= (async () => {
    const metaRes = await fetch("/models/eye_labels.json");
    if (!metaRes.ok) throw new ModelMissingError();
    const meta = (await metaRes.json()) as Meta;

    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.wasmPaths = "/ort/";
    ort.env.wasm.numThreads = 1; // single thread: no cross-origin isolation headers required
    const session = await ort.InferenceSession.create("/models/eye_classifier.onnx", { executionProviders: ["wasm"] });
    return { session, meta, ort };
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

function softmax(logits: ArrayLike<number>) {
  const max = Math.max(...Array.from(logits));
  const exps = Array.from(logits, (v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function toTensorData(img: HTMLImageElement, size: number, mean: number[], std: number[]) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const out = new Float32Array(3 * size * size);
  const plane = size * size;
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) out[c * plane + i] = (data[i * 4 + c] / 255 - mean[c]) / std[c];
  }
  return out;
}

export async function classifyEye(img: HTMLImageElement): Promise<ScanFinding[]> {
  const { session, meta, ort } = await load();
  const size = meta.input_size;
  const input = new ort.Tensor("float32", toTensorData(img, size, meta.mean, meta.std), [1, 3, size, size]);
  const output = await session.run({ [session.inputNames[0]]: input });
  const logits = output[session.outputNames[0]].data as Float32Array;
  const t = meta.temperature && meta.temperature > 0 ? meta.temperature : 1;
  const probs = softmax(Array.from(logits, (v) => v / t));
  return meta.labels.map((label, i) => ({ label, probability: probs[i] })).sort((a, b) => b.probability - a.probability);
}
