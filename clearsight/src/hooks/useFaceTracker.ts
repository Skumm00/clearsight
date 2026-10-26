"use client";
//squint flagging, closed eye detection. 
import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { estimateDistanceMm } from "@/lib/vision";
import { useLatest } from "./useLatest";

const L_IRIS = [469, 471] as const;
const R_IRIS = [474, 476] as const;

const R_EYE = { outer: 33, inner: 133, pairs: [[160, 144], [158, 153]] } as const;
const L_EYE = { outer: 362, inner: 263, pairs: [[385, 380], [387, 373]] } as const;

const CLOSE_RATIO = 0.5;
const REOPEN_RATIO = 0.62;
const REL_CLOSED_RATIO = 0.62;
const REL_OPEN_MIN = 0.8;
export const SQUINT_RATIO = 0.74;
/** An eye counts as "closed / covered" only after staying closed this long, so ordinary blinks are ignored. */
const HOLD_MS = 450;
const BLINK_MAX_MS = 600;

export interface FaceState {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  faceFound: boolean;
  distanceMm: number | null;
  irisPx: number;
  videoWidth: number;
  stableDistanceMm: number;
  lastDistanceMm: number;
  leftClosed: boolean;
  rightClosed: boolean;
  squintLeft: number;
  squintRight: number;
  blinkCount: number;
  blinksPerMin: number;
  debug: { earLeft: number; earRight: number; baseLeft: number; baseRight: number; bsBlinkL: number; bsBlinkR: number; bsSquintL: number; bsSquintR: number };
}

const INITIAL: FaceState = {
  status: "idle",
  faceFound: false,
  distanceMm: null,
  irisPx: 0,
  videoWidth: 0,
  stableDistanceMm: 1000,
  lastDistanceMm: 1000,
  leftClosed: false,
  rightClosed: false,
  squintLeft: 0,
  squintRight: 0,
  blinkCount: 0,
  blinksPerMin: 0,
  debug: { earLeft: 0, earRight: 0, baseLeft: 0, baseRight: 0, bsBlinkL: 0, bsBlinkR: 0, bsSquintL: 0, bsSquintR: 0 },
};

let infoSilenced = false;
/**
 * MediaPipe's WebAssembly runtime prints informational messages such as
 * "INFO: Created TensorFlow Lite XNNPACK delegate for CPU." through console.error.
 * They are harmless but show up as errors in the Next.js dev overlay, so drop only those.
 */
function silenceMediaPipeInfo() {
  if (infoSilenced) return;
  infoSilenced = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("INFO:")) return;
    original(...args);
  };
}

type Pt = { x: number; y: number };
function ear(lm: Pt[], eye: typeof R_EYE | typeof L_EYE, w: number, h: number) {
  const width = dist(lm[eye.outer], lm[eye.inner], w, h);
  if (width === 0) return 0;
  const v = eye.pairs.reduce((sum, [a, b]) => sum + dist(lm[a], lm[b], w, h), 0);
  return v / (2 * width);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }, w: number, h: number) {
  return Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function useFaceTracker(hfovDeg: number, enabled = true) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<FaceState>(INITIAL);
  const hfovRef = useLatest(hfovDeg);

  const stopRef = useRef<() => void>(() => {});

  const start = useCallback(async () => {
    setState((s) => ({ ...s, status: "loading", error: undefined }));
    try {
      silenceMediaPipeInfo();
      const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      const landmarker: FaceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      const video = videoRef.current;
      if (!video) throw new Error("Video element missing");
      video.srcObject = stream;
      await video.play();

      let raf = 0;
      let alive = true;
      let lastTs = -1;
      const distWindow: number[] = [];
      const irisWindow: number[] = [];
      let ema = 0;
      let leftSince = 0;
      let rightSince = 0;
      let leftClosed = false;
      let rightClosed = false;
      let baseL = 0.26;
      let baseR = 0.26;
      let bothSince = 0;
      let blinks = 0;
      const blinkTimes: number[] = [];

      const loop = () => {
        if (!alive) return;
        raf = requestAnimationFrame(loop);
        if (video.readyState < 2 || video.currentTime === lastTs) return;
        lastTs = video.currentTime;
        const now = performance.now();
        const res = landmarker.detectForVideo(video, now);
        const lm = res.faceLandmarks[0];
        if (!lm) {
          setState((s) => (s.faceFound ? { ...s, faceFound: false, distanceMm: null } : s));
          return;
        }

        const w = video.videoWidth;
        const h = video.videoHeight;
        const earL = ear(lm, L_EYE, w, h);
        const earR = ear(lm, R_EYE, w, h);

        // Open baseline per eye: jumps up instantly, decays slowly, so a closed eye never drags it down for long.
        baseL = Math.min(0.42, Math.max(0.17, Math.max(earL, baseL * 0.9996)));
        baseR = Math.min(0.42, Math.max(0.17, Math.max(earR, baseR * 0.9996)));

        // An eye is closed if it is narrow compared with its OWN open baseline, or much narrower than the OTHER
        // (still open) eye. The second test survives glasses: lenses and glare distort both eyes alike, so the
        // asymmetry between a closed eye and an open eye remains even when the absolute numbers shift.
        const otherOpenR = earR > baseR * REL_OPEN_MIN;
        const otherOpenL = earL > baseL * REL_OPEN_MIN;
        const relClosedL = otherOpenR && earL < earR * REL_CLOSED_RATIO;
        const relClosedR = otherOpenL && earR < earL * REL_CLOSED_RATIO;
        // Hysteresis: close below CLOSE_RATIO of baseline (or by comparison), reopen only when both tests agree.
        leftClosed = leftClosed ? !(earL >= baseL * REOPEN_RATIO && !relClosedL) : earL < baseL * CLOSE_RATIO || relClosedL;
        rightClosed = rightClosed ? !(earR >= baseR * REOPEN_RATIO && !relClosedR) : earR < baseR * CLOSE_RATIO || relClosedR;
        leftSince = leftClosed ? leftSince || now : 0;
        rightSince = rightClosed ? rightSince || now : 0;
        const leftHeld = leftSince > 0 && now - leftSince > HOLD_MS;
        const rightHeld = rightSince > 0 && now - rightSince > HOLD_MS;

        // Distance from the iris of the OPEN eye only: a closed eye's iris is hidden and would inflate the distance.
        const irisL = dist(lm[L_IRIS[0]], lm[L_IRIS[1]], w, h);
        const irisR = dist(lm[R_IRIS[0]], lm[R_IRIS[1]], w, h);
        const useL = !leftClosed || rightClosed;
        const useR = !rightClosed || leftClosed;
        const irisPx = (useL ? irisL : 0) + (useR ? irisR : 0);
        const irisCount = (useL ? 1 : 0) + (useR ? 1 : 0);
        const irisAvg = irisPx / irisCount;
        irisWindow.push(irisAvg);
        if (irisWindow.length > 9) irisWindow.shift();
        const raw = estimateDistanceMm(irisAvg, w, hfovRef.current);
        distWindow.push(raw);
        if (distWindow.length > 9) distWindow.shift();
        const distanceMm = median(distWindow);
        ema = ema === 0 ? distanceMm : ema + 0.08 * (distanceMm - ema);

        // Blink = both eyes briefly closed, counted when they reopen.
        const bothClosed = leftClosed && rightClosed;
        if (bothClosed) bothSince = bothSince || now;
        else {
          if (bothSince && now - bothSince < BLINK_MAX_MS) {
            blinks++;
            blinkTimes.push(now);
          }
          bothSince = 0;
        }
        while (blinkTimes.length && now - blinkTimes[0] > 60_000) blinkTimes.shift();
        const windowSec = Math.min(60, (now - startedAt) / 1000);
        const perMin = windowSec > 5 ? (blinkTimes.length / windowSec) * 60 : 0;

        const squintLeftScore = leftClosed ? 0 : Math.max(0, 1 - earL / baseL);
        const squintRightScore = rightClosed ? 0 : Math.max(0, 1 - earR / baseR);

        const cats = res.faceBlendshapes?.[0]?.categories ?? [];
        const bs = (name: string) => cats.find((c) => c.categoryName === name)?.score ?? 0;

        setState({
          status: "ready",
          faceFound: true,
          distanceMm,
          irisPx: median(irisWindow),
          videoWidth: w,
          stableDistanceMm: ema,
          lastDistanceMm: distanceMm,
          leftClosed: leftHeld,
          rightClosed: rightHeld,
          squintLeft: squintLeftScore,
          squintRight: squintRightScore,
          blinkCount: blinks,
          blinksPerMin: Math.round(perMin),
          debug: {
            earLeft: earL,
            earRight: earR,
            baseLeft: baseL,
            baseRight: baseR,
            bsBlinkL: bs("eyeBlinkLeft"),
            bsBlinkR: bs("eyeBlinkRight"),
            bsSquintL: bs("eyeSquintLeft"),
            bsSquintR: bs("eyeSquintRight"),
          },
        });
      };

      const startedAt = performance.now();
      raf = requestAnimationFrame(loop);

      stopRef.current = () => {
        alive = false;
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        landmarker.close();
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Camera could not be started";
      setState((s) => ({ ...s, status: "error", error: message }));
    }
  }, [hfovRef]);

  useEffect(() => {
    if (!enabled) return;
    start();
    return () => stopRef.current();
  }, [enabled, start]);

  return { videoRef, state };
}
