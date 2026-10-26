/**
 * Procedurally generated Ishihara-style plates (original artwork, not copied from any
 * published plate set). A number is rasterised to a mask, then the disc is filled with
 * packed dots whose hue depends on whether the dot center is inside the number.
 *
 * Palettes are chosen along the red-green confusion axis, which is the most common
 * color-vision deficiency. These are screening plates, not a clinical diagnosis.
 */

export interface PlateSpec {
  number: number | null; // null = control / "nothing" plate
  fg: string[];
  bg: string[];
  kind: "control" | "red-green" | "red-green-hard";
}

const MAKE = (number: number | null, kind: PlateSpec["kind"], fg: string[], bg: string[]): PlateSpec => ({ number, kind, fg, bg });

const ORANGES = ["#e8590c", "#f76707", "#fd7e14", "#e8710a"];
const GREENS = ["#5f8d7d", "#6c9a8a", "#4f7f70", "#789e8f"];
const REDS = ["#c2410c", "#d1491a", "#b9380e"];
const OLIVES = ["#8a9a5b", "#7d8f4f", "#97a465"];

export const PLATES: PlateSpec[] = [
  MAKE(12, "control", ["#1f2937", "#111827"], ["#d6d3c4", "#cfcbb8", "#e0ddd0"]),
  MAKE(42, "red-green", ORANGES, GREENS),
  MAKE(73, "red-green", REDS, OLIVES),
  MAKE(29, "red-green-hard", ["#d9622b", "#e06f35", "#cf5a24"], ["#8fa07a", "#7f9170", "#9aab86"]),
  MAKE(null, "red-green", ORANGES, ORANGES), // nothing-to-see plate: single palette
];

/** Mulberry32 PRNG so each plate looks identical on every render. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawPlate(canvas: HTMLCanvasElement, spec: PlateSpec, seed: number, size: number) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  const mask = document.createElement("canvas");
  mask.width = mask.height = size;
  const mctx = mask.getContext("2d", { willReadFrequently: true })!;
  if (spec.number !== null) {
    mctx.fillStyle = "#000";
    mctx.font = `700 ${size * 0.62}px sans-serif`;
    mctx.textAlign = "center";
    mctx.textBaseline = "middle";
    mctx.fillText(String(spec.number), size / 2, size / 2 + size * 0.03);
  }
  const data = mctx.getImageData(0, 0, size, size).data;
  const inside = (x: number, y: number) => data[((y | 0) * size + (x | 0)) * 4 + 3] > 128;

  const rand = rng(seed);
  const R = size / 2;
  const placed: { x: number; y: number; r: number }[] = [];
  const pick = (a: string[]) => a[Math.floor(rand() * a.length)];

  for (let r = size * 0.03; r >= size * 0.008; r *= 0.88) {
    let misses = 0;
    while (misses < 160) {
      const ang = rand() * Math.PI * 2;
      const rad = Math.sqrt(rand()) * (R - r - 2);
      const x = R + Math.cos(ang) * rad;
      const y = R + Math.sin(ang) * rad;
      let ok = true;
      for (const p of placed) {
        if (Math.hypot(p.x - x, p.y - y) < p.r + r + 1.2) {
          ok = false;
          break;
        }
      }
      if (!ok) {
        misses++;
        continue;
      }
      misses = 0;
      placed.push({ x, y, r });
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = inside(x, y) ? pick(spec.fg) : pick(spec.bg);
      ctx.fill();
    }
  }
}

export function optionsFor(spec: PlateSpec): (number | null)[] {
  const truth = spec.number;
  if (truth === null) return [12, 45, 73, null];
  const swap = Number(String(truth).split("").reverse().join(""));
  const distractors = new Set<number>();
  if (swap !== truth) distractors.add(swap);
  distractors.add(((truth + 21) % 90) + 10);
  distractors.add(((truth + 37) % 90) + 10);
  const list: (number | null)[] = [truth, ...[...distractors].slice(0, 2)];
  list.sort((a, b) => (((a ?? 0) * 7) % 11) - (((b ?? 0) * 7) % 11));
  return [...list, null];
}
