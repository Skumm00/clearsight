"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Card, Instruction, StepFrame } from "@/components/ui";
import { CameraPip } from "@/components/CameraPip";
import { useCalibration } from "@/lib/calibration";
import { useFaceTracker } from "@/hooks/useFaceTracker";
import { useGate } from "@/hooks/useGate";
import { saveResults, loadResults } from "@/lib/results";

type Eye = "right" | "left";
const EYES: Eye[] = ["right", "left"];
const CELLS = 20;
/** A standard Amsler grid is 10 cm square (5 mm cells) viewed at about 35 cm. */
const GRID_MM = 100;
const VIEW_MM = 350;

export default function AmslerTest() {
  const { cal, loaded } = useCalibration();
  const { videoRef, state } = useFaceTracker(cal.hfovDeg, loaded);
  const [bypass, setBypass] = useState(false);
  const [eyeIdx, setEyeIdx] = useState(0);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [counts, setCounts] = useState<Partial<Record<Eye, number>>>({});
  const [done, setDone] = useState(false);

  const eye = EYES[Math.min(eyeIdx, 1)];

  const { gridPx, requiredMm } = useMemo(() => {
    const avail = loaded ? Math.min(window.innerHeight * 0.62, window.innerWidth * 0.9) : 600;
    const px = Math.min(GRID_MM * cal.pxPerMm, avail);
    return { gridPx: px, requiredMm: VIEW_MM * (px / cal.pxPerMm / GRID_MM) };
  }, [cal.pxPerMm, loaded]);

  const gate = useGate({ state, eye, startMinMm: requiredMm * 0.85, startMaxMm: requiredMm * 1.2, bypass });
  const running = gate.phase === "run" && !gate.problem;
  const cell = gridPx / CELLS;

  const toggle = (i: number) =>
    setMarked((m) => {
      const next = new Set(m);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const finishEye = () => {
    const n = marked.size;
    setCounts((c) => ({ ...c, [eye]: n }));
    saveResults({ amsler: { ...loadResults().amsler, [eye]: n } });
    setMarked(new Set());
    if (eyeIdx === 0) {
      setEyeIdx(1);
      gate.reset();
    } else setDone(true);
  };

  if (done) {
    return (
      <StepFrame title="Amsler grid · Results">
        <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
          {EYES.map((e) => {
            const n = counts[e] ?? 0;
            return (
              <Card key={e} className="p-6">
                <p className="text-sm font-semibold tracking-wide text-muted uppercase">{e} eye</p>
                <p className="mt-2 text-4xl font-light">{n === 0 ? "All lines straight" : `${n} area${n === 1 ? "" : "s"} marked`}</p>
                <p className="mt-3">
                  {n === 0
                    ? "You reported no wavy, blurry or missing lines."
                    : "You reported distortion or gaps in your central vision. Changes like this can come from conditions affecting the center of the retina, so please have it checked soon."}
                </p>
              </Card>
            );
          })}
        </div>
        <p className="max-w-xl text-center text-sm text-muted">
          The Amsler grid is a self-check, not a diagnosis. If you notice new distortion in daily life, do not wait for a routine exam.
        </p>
        <div className="flex gap-3">
          <Link href="/results" className="inline-flex h-12 items-center rounded-sm bg-accent px-8 text-accent-ink">
            See my summary
          </Link>
          <Button variant="ghost" onClick={() => location.reload()}>
            Repeat
          </Button>
        </div>
      </StepFrame>
    );
  }

  return (
    <StepFrame title={`Amsler grid · ${eye} eye`}>
      {!running ? (
        <div className="flex flex-col items-center gap-6">
          <Instruction>
            Close your <b>{eye === "right" ? "left" : "right"}</b> eye and hold the screen about <b>{(requiredMm / 1000).toFixed(2)} m</b> away.
          </Instruction>
          <p className="max-w-lg text-center text-muted">
            Look at the center dot with your open eye. The grid appears once the camera sees the right distance and your other eye closed.
          </p>
          <button onClick={() => setBypass(true)} className="text-sm text-muted underline">
            Camera can’t see me? Skip the camera checks
          </button>
        </div>
      ) : (
        <>
          <p className="max-w-xl text-center text-xl text-muted">
            Keep looking at the dot. Tap any squares where lines look <b className="font-semibold text-ink">wavy, blurry or missing</b>.
          </p>
          {loaded && (
            <svg
              width={gridPx}
              height={gridPx}
              viewBox={`0 0 ${gridPx} ${gridPx}`}
              className="optotype-stage rounded-sm shadow-[var(--shadow)]"
              role="group"
              aria-label="Amsler grid"
            >
              {Array.from({ length: CELLS * CELLS }, (_, i) => {
                const x = (i % CELLS) * cell;
                const y = Math.floor(i / CELLS) * cell;
                return (
                  <rect
                    key={i}
                    x={x}
                    y={y}
                    width={cell}
                    height={cell}
                    fill={marked.has(i) ? "rgba(220, 38, 38, 0.35)" : "transparent"}
                    stroke="#000"
                    strokeWidth={Math.max(1, cell / 10)}
                    onClick={() => toggle(i)}
                    style={{ cursor: "pointer" }}
                  />
                );
              })}
              <circle cx={gridPx / 2} cy={gridPx / 2} r={Math.max(3, cell / 3)} fill="#000" pointerEvents="none" />
            </svg>
          )}
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setMarked(new Set())} disabled={marked.size === 0}>
              Clear marks
            </Button>
            <Button onClick={finishEye}>{marked.size === 0 ? "All lines look straight" : "Done with this eye"}</Button>
          </div>
        </>
      )}
      <CameraPip videoRef={videoRef} state={state} problem={gate.problem} shownMm={gate.shownMm} inZone={gate.inZone} />
    </StepFrame>
  );
}
