"use client";

import { useEffect, useMemo, useState } from "react";
import type { FaceState } from "./useFaceTracker";
import { useDebouncedProblem } from "./useDebouncedProblem";

type Eye = "right" | "left" | "both";

interface GateOptions {
  state: FaceState;
  eye: Eye;
  startMinMm: number;
  startMaxMm: number;
  pauseBelow?: number;
  pauseAbove?: number;
  bypass?: boolean;
  pauseDelayMs?: number;
}

export function useGate({
  state,
  eye,
  startMinMm,
  startMaxMm,
  pauseBelow = 0.7,
  pauseAbove = 1.5,
  bypass = false,
  pauseDelayMs = 1500,
}: GateOptions) {
  const [phase, setPhase] = useState<"prep" | "run">(bypass ? "run" : "prep");
  const [lockedMm, setLockedMm] = useState((startMinMm + startMaxMm) / 2);
  const stableMm = state.stableDistanceMm;
  const otherEye = eye === "right" ? "left" : eye === "left" ? "right" : null;
  const otherClosed = otherEye === "left" ? state.leftClosed : otherEye === "right" ? state.rightClosed : true;

  const rawProblem = useMemo(() => {
    if (bypass || state.status !== "ready") return null;
    if (!state.faceFound) return "Face not found";
    if (phase === "prep") {
      if (stableMm < startMinMm) return `Move back to about ${((startMinMm + startMaxMm) / 2000).toFixed(2)} m`;
      if (stableMm > startMaxMm) return `Move closer to about ${((startMinMm + startMaxMm) / 2000).toFixed(2)} m`;
    } else if (stableMm < lockedMm * pauseBelow) return "Too close, move back";
    else if (stableMm > lockedMm * pauseAbove) return "Too far, move closer";
    if (!otherClosed) return `Close your ${otherEye} eye`;
    return null;
  }, [bypass, state.status, state.faceFound, phase, stableMm, lockedMm, startMinMm, startMaxMm, pauseBelow, pauseAbove, otherClosed, otherEye]);

  const paused = useDebouncedProblem(rawProblem, pauseDelayMs);
  const problem = phase === "prep" ? rawProblem : paused;

  useEffect(() => {
    if (phase === "prep" && !bypass && state.status === "ready" && !rawProblem) {
      setLockedMm(stableMm);
      setPhase("run");
    }
  }, [phase, bypass, state.status, rawProblem, stableMm]);

  const sizeMm = bypass || Math.abs(stableMm - lockedMm) / lockedMm <= 0.1 ? lockedMm : stableMm;

  const running = (bypass || phase === "run") && !problem;
  const roundMm = (mm: number) => Math.round(mm / 50) * 50;
  const shownMm = bypass ? null : running ? roundMm(lockedMm) : state.faceFound ? roundMm(stableMm) : null;

  return { phase: bypass ? ("run" as const) : phase, problem, lockedMm, sizeMm, shownMm, inZone: running && !bypass, reset: () => setPhase("prep") };
}
