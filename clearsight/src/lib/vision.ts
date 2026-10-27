
//Standardized Card
export const CARD_WIDTH_MM = 85.6;

export const IRIS_DIAMETER_MM = 11.7;

export const DEFAULT_HFOV_DEG = 63;

export function estimateDistanceMm(irisPx: number, videoWidthPx: number, hfovDeg = DEFAULT_HFOV_DEG): number {
  if (irisPx <= 0) return NaN;
  const focalPx = videoWidthPx / 2 / Math.tan((hfovDeg * Math.PI) / 360);
  return (focalPx * IRIS_DIAMETER_MM) / irisPx;
}

export function solveHfovDeg(knownDistanceMm: number, irisPx: number, videoWidthPx: number): number {
  const focalPx = (knownDistanceMm * irisPx) / IRIS_DIAMETER_MM;
  const hfov = (2 * Math.atan(videoWidthPx / 2 / focalPx) * 180) / Math.PI;
  return Math.min(110, Math.max(40, hfov));
}

export function optotypeHeightMm(logMAR: number, distanceMm: number): number {
  const arcmin = 5 * Math.pow(10, logMAR);
  return distanceMm * Math.tan(((arcmin / 60) * Math.PI) / 180);
}

export function optotypeHeightPx(logMAR: number, distanceMm: number, pxPerMm: number): number {
  return optotypeHeightMm(logMAR, distanceMm) * pxPerMm;
}

export function bestMeasurableLogMAR(distanceMm: number, pxPerMm: number, dpr: number, minDevicePx = 5): number {
  const minCssPx = minDevicePx / dpr;
  const minMm = minCssPx / pxPerMm;
  const arcmin = ((Math.atan(minMm / distanceMm) * 180) / Math.PI) * 60;
  return Math.log10(arcmin / 5);
}

export function snellen(logMAR: number): string {
  const denom = Math.round(20 * Math.pow(10, logMAR));
  return `20/${Math.max(10, denom)}`;
}

export type AcuityBand = "excellent" | "good" | "borderline" | "reduced";

export function interpretAcuity(logMAR: number): { band: AcuityBand; message: string } {
  if (logMAR <= 0.0) return { band: "excellent", message: "Your result is in the typical range for healthy vision." };
  if (logMAR <= 0.1) return { band: "good", message: "Close to typical. No action needed unless you notice changes." };
  if (logMAR <= 0.3) return { band: "borderline", message: "Slightly below typical. Consider a professional eye exam." };
  return { band: "reduced", message: "Below typical for this screening. A professional eye exam is recommended." };
}

/** Short letter-size procedure: each right answer makes the letter smaller, each miss makes it larger. */
export class Staircase {
  level: number;
  trials = 0;
  private bestCorrect: number | null = null;

  constructor(
    start = 0.6,
    private readonly step = 0.2,
    private readonly min = -0.2,
    private readonly max = 1.3,
    private readonly maxTrials = 4,
  ) {
    this.level = start;
  }

  /** Records an answer and returns true once all questions have been asked. */
  respond(correct: boolean): boolean {
    this.trials++;
    if (correct) {
      if (this.bestCorrect === null || this.level < this.bestCorrect) this.bestCorrect = this.level;
      this.level -= this.step;
    } else {
      this.level += this.step;
    }
    this.level = +Math.min(this.max, Math.max(this.min, this.level)).toFixed(2);
    return this.trials >= this.maxTrials;
  }

  /** The smallest letter answered correctly, or the current level if none were. */
  threshold(): number {
    return +(this.bestCorrect ?? this.level).toFixed(2);
  }
}

export type Direction = "up" | "down" | "left" | "right";
export const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

export function randomDirection(prev?: Direction): Direction {
  const pool = DIRECTIONS.filter((d) => d !== prev);
  return pool[Math.floor(Math.random() * pool.length)];
}
