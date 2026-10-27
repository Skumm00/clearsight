import { cpSync, existsSync, mkdirSync } from "node:fs";
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
  for (const f of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) {
    cpSync(join(ort, f), join(out, f));
  }
}
