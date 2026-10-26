import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const nm = join(root, "node_modules");

const mediapipe = join(nm, "@mediapipe/tasks-vision/wasm");
if (existsSync(mediapipe)) {
  cpSync(mediapipe, join(root, "public/mediapipe/wasm"), { recursive: true });
}

const ort = join(nm, "onnxruntime-web/dist");
if (existsSync(ort)) {
  const out = join(root, "public/ort");
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(ort)) {
    if (f.endsWith(".wasm") || f.endsWith(".mjs")) cpSync(join(ort, f), join(out, f));
  }
}
