"use client";

import type { RefObject } from "react";
import { StatusPill } from "./ui";
import type { FaceState } from "@/hooks/useFaceTracker";
import { SQUINT_RATIO } from "@/hooks/useFaceTracker";
import { useDebugFlag } from "@/hooks/useDebugFlag";

export function CameraPip({
  videoRef,
  state,
  problem,
  shownMm,
  inZone,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  state: FaceState;
  problem?: string | null;
  shownMm?: number | null;
  inZone?: boolean;
}) {
  const mm = shownMm !== undefined ? shownMm : state.distanceMm;
  const meters = mm ? (mm / 1000).toFixed(2) : null;
  const debug = useDebugFlag();
  const d = state.debug;
  return (
    <div className="fixed bottom-5 left-5 z-10 w-56 overflow-hidden rounded-md bg-surface shadow-[var(--shadow)]">
      <div className="relative aspect-video bg-black">
        <video ref={videoRef} playsInline muted className="size-full -scale-x-100 object-cover" />
        {state.status === "loading" && <p className="absolute inset-0 grid place-items-center text-xs text-white/80">Starting camera…</p>}
        {state.status === "error" && <p className="absolute inset-0 grid place-items-center p-3 text-center text-xs text-white/80">{state.error}</p>}
      </div>
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs tracking-wide text-muted uppercase">Distance</span>
          <span className="text-xl font-semibold tabular-nums">{meters ? `${meters} m` : "—"}</span>
        </div>
        <StatusPill ok={!problem && state.faceFound}>{problem ?? (inZone ? "In range" : state.faceFound ? "Tracking" : "Looking for your face")}</StatusPill>
        {debug && (
          <pre className="text-[10px] leading-tight text-muted">
            {`EAR L ${d.earLeft.toFixed(2)} / base ${d.baseLeft.toFixed(2)}${state.leftClosed ? "  CLOSED" : ""}\n`}
            {`EAR R ${d.earRight.toFixed(2)} / base ${d.baseRight.toFixed(2)}${state.rightClosed ? "  CLOSED" : ""}\n`}
            {`squint L ${state.squintLeft.toFixed(2)}  R ${state.squintRight.toFixed(2)} (flag > ${(1 - SQUINT_RATIO).toFixed(2)})\n`}
            {`MP blink L ${d.bsBlinkL.toFixed(2)} R ${d.bsBlinkR.toFixed(2)}\n`}
            {`MP squint L ${d.bsSquintL.toFixed(2)} R ${d.bsSquintR.toFixed(2)}\n`}
            {`blinks ${state.blinkCount}`}
          </pre>
        )}
      </div>
    </div>
  );
}
