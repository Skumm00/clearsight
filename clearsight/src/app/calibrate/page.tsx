"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, Sun, ShieldAlert } from "lucide-react";
import { Button, Dots, Instruction, StepFrame } from "@/components/ui";
import { useCalibration, cardFramePx } from "@/lib/calibration";
import { CARD_WIDTH_MM } from "@/lib/vision";
import { useFlowQuery } from "@/hooks/useFlow";
import { useFaceTracker } from "@/hooks/useFaceTracker";
import { DEFAULT_HFOV_DEG, solveHfovDeg } from "@/lib/vision";

const STEPS = ["notice", "card", "distance", "brightness"] as const;

export default function Calibrate() {
  const router = useRouter();
  const { qs } = useFlowQuery();
  const { cal, save } = useCalibration();
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const { videoRef, state } = useFaceTracker(cal.hfovDeg, step === "distance");
  // The camera shows its OWN estimate of the distance (iris size + the field of view it assumes).
  // The user then corrects that number to the true distance (from a tape measure), and every correction
  // re-solves the camera's field of view so the app's estimate matches reality from then on.
  const [snap, setSnap] = useState<{ irisPx: number; w: number } | null>(null);
  const [targetCm, setTargetCm] = useState<number | null>(null);
  const hasFace = state.faceFound && state.irisPx > 0;
  const measuredCm = Math.round(state.stableDistanceMm / 10);

  const adjust = (delta: number) => {
    if (!hasFace && !snap) return;
    const base = targetCm ?? measuredCm;
    const next = Math.min(150, Math.max(30, base + delta));
    const reference = snap ?? { irisPx: state.irisPx, w: state.videoWidth };
    if (!snap) setSnap(reference);
    setTargetCm(next);
    save({ hfovDeg: solveHfovDeg(next * 10, reference.irisPx, reference.w) });
  };

  const resetEstimate = () => {
    setSnap(null);
    setTargetCm(null);
    save({ hfovDeg: DEFAULT_HFOV_DEG });
  };
  const last = i === STEPS.length - 1;

  const next = () => {
    if (last) {
      save({ done: true });
      router.push(`/test/acuity${qs}`);
    } else setI(i + 1);
  };

  const frameW = cardFramePx(cal.pxPerMm);
  const frameH = frameW / (85.6 / 53.98);

  return (
    <StepFrame
      title="Configuration"
      footer={
        <div className="flex flex-col items-center gap-5">
          <Dots count={STEPS.length} active={i} />
          <Button onClick={next}>{step === "notice" ? "I understand" : last ? "Start acuity test" : "Next step"}</Button>
        </div>
      }
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col items-center gap-8"
        >
          {step === "notice" && (
            <>
              <span className="grid size-16 place-items-center rounded-md bg-warn-soft text-warn">
                <ShieldAlert size={30} />
              </span>
              <Instruction>
                This is a <b>screening aid</b>, not a medical test. It gives a first impression of your vision and tells you whether an
                eye exam is worth booking.
              </Instruction>
              <p className="max-w-xl text-center text-muted">
                Your camera is used only to measure distance and eye state. Frames are processed in your browser and are never uploaded or
                stored.
              </p>
            </>
          )}

          {step === "distance" && (
            <>
              <div className="grid w-full max-w-md gap-4">
                <div className="relative aspect-video overflow-hidden rounded-md bg-black">
                  <video ref={videoRef} playsInline muted className="size-full -scale-x-100 object-cover" />
                  {state.status !== "ready" && (
                    <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-white/80">
                      {state.status === "error" ? "The camera could not start. You can skip this step." : "Starting camera…"}
                    </p>
                  )}
                </div>

                <div className="text-center">
                  <p className="text-xs tracking-wide text-muted uppercase">Measured distance</p>
                  <p className="text-5xl font-light tabular-nums">{hasFace ? `${(measuredCm / 100).toFixed(2)} m` : "—"}</p>
                </div>

                <div className="flex items-center justify-center gap-2" role="group" aria-label="Adjust the measured distance">
                  {[-5, -1, 1, 5].map((d) => (
                    <Button key={d} variant="ghost" className="h-11 min-w-14 px-3" aria-label={`${d > 0 ? "Increase" : "Decrease"} by ${Math.abs(d)} cm`} disabled={!hasFace && !snap} onClick={() => adjust(d)}>
                      {d > 0 ? `+${d}` : `−${Math.abs(d)}`}
                    </Button>
                  ))}
                </div>

                <p className="text-center text-sm text-muted">
                  {!hasFace && !snap
                    ? "We can’t see your face yet."
                    : targetCm === null
                      ? "This is the camera’s estimate. If it doesn’t match your tape measure, adjust it (in cm)."
                      : `Adjusted. The camera now treats this distance as ${(targetCm / 100).toFixed(2)} m.`}
                </p>
                {(snap || targetCm !== null) && (
                  <button onClick={resetEstimate} className="text-sm text-muted underline">
                    Reset to the camera&apos;s own estimate
                  </button>
                )}
              </div>
              <Instruction>
                Sit <b>0.6 m</b> (60 cm) from the screen, measured with a tape, and look at it. The camera estimates your distance; adjust it if it is off.
              </Instruction>
            </>
          )}

          {step === "brightness" && (
            <>
              <span className="grid size-16 place-items-center rounded-md bg-accent-soft text-accent">
                <Sun size={30} />
              </span>
              <Instruction>
                Turn your screen brightness <b>all the way up</b>, then sit in a room without glare.
              </Instruction>
            </>
          )}

          {step === "card" && (
            <>
              <div className="flex items-center gap-8">
                <div
                  style={{ width: frameW, height: frameH, borderRadius: 3.5 * cal.pxPerMm }}
                  className="grid place-items-center rounded-md border-2 border-dashed border-muted/60 bg-white p-4 text-center text-sm text-neutral-500 shadow-[var(--shadow)]"
                >
                  Hold any standard card against the screen (ID, credit or bank card). We collect nothing.
                </div>
                <input
                  aria-label="Screen size adjustment"
                  type="range"
                  min={2.4}
                  max={8}
                  step={0.01}
                  value={cal.pxPerMm}
                  onChange={(e) => save({ pxPerMm: Number(e.target.value) })}
                  style={{ "--p": `${((cal.pxPerMm - 2.4) / (8 - 2.4)) * 100}%` } as React.CSSProperties}
                  className="vslider"
                />
              </div>
              <Instruction>
                Drag the slider until the frame is <b>exactly the size of your card</b>.
              </Instruction>
              <p className="text-sm text-muted">
                Calibrated: {cal.pxPerMm.toFixed(2)} px/mm (card = {CARD_WIDTH_MM} mm)
              </p>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </StepFrame>
  );
}
