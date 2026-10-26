"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Card, Instruction, StepFrame } from "@/components/ui";
import { CameraPip } from "@/components/CameraPip";
import { useCalibration } from "@/lib/calibration";
import { useFaceTracker } from "@/hooks/useFaceTracker";
import { useGate } from "@/hooks/useGate";
import { saveResults } from "@/lib/results";
import { bestMeasurableLogMAR, optotypeHeightPx, snellen } from "@/lib/vision";

const LETTERS = "CDHKNORSVZ".split("");
const LEVELS = [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0];

function line(seed: number) {
  const out: string[] = [];
  let x = seed * 9301 + 49297;
  while (out.length < 5) {
    x = (x * 9301 + 49297) % 233280;
    const c = LETTERS[x % LETTERS.length];
    if (!out.includes(c)) out.push(c);
  }
  return out.join(" ");
}

function interpret(logMAR: number) {
  if (logMAR <= 0.1) return "You read very small print comfortably at reading distance.";
  if (logMAR <= 0.3) return "Typical reading-distance vision.";
  return "Small print was hard to read at this distance. This is common after about age 40 (presbyopia), and reading glasses may help. An eye exam can confirm.";
}

export default function NearTest() {
  const { cal, loaded } = useCalibration();
  const { videoRef, state } = useFaceTracker(cal.hfovDeg, loaded);
  const [bypass, setBypass] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const gate = useGate({ state, eye: "both", startMinMm: 330, startMaxMm: 480, pauseBelow: 0.8, pauseAbove: 1.25, bypass });
  const running = gate.phase === "run" && !gate.problem;

  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const smallest = bestMeasurableLogMAR(gate.sizeMm, cal.pxPerMm, dpr);
  const lines = useMemo(
    () =>
      LEVELS.filter((l) => l >= smallest - 0.001).map((l, i) => ({
        logMAR: l,
        px: optotypeHeightPx(l, gate.sizeMm, cal.pxPerMm),
        text: line(i + 3),
      })),
    [smallest, gate.sizeMm, cal.pxPerMm],
  );

  if (done && chosen !== null) {
    const v = lines[chosen].logMAR;
    return (
      <StepFrame title="Near vision · Results">
        <Card className="w-full max-w-xl p-8 text-center">
          <p className="text-sm font-semibold tracking-wide text-muted uppercase">Smallest line you read</p>
          <p className="mt-2 text-5xl font-light tabular-nums">{snellen(v)}</p>
          <p className="mt-1 text-sm text-muted">near acuity at about 40 cm (logMAR {v.toFixed(2)})</p>
          <p className="mt-5 text-lg">{interpret(v)}</p>
          <p className="mt-4 text-sm text-muted">Screening aid only. Use your usual reading glasses if you have them, and good lighting.</p>
        </Card>
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
    <StepFrame title="Near vision">
      {!running ? (
        <div className="flex flex-col items-center gap-6">
          <Instruction>
            Hold the screen about <b>40 cm</b> from your face with <b>both eyes open</b>.
          </Instruction>
          <p className="max-w-lg text-center text-muted">Wear your usual reading glasses if you have them. Lines of letters appear once the camera sees the right distance.</p>
          <button onClick={() => setBypass(true)} className="text-sm text-muted underline">
            Camera can’t see me? Skip the camera checks
          </button>
        </div>
      ) : (
        <>
          <p className="max-w-xl text-center text-xl text-muted">Tap the <b className="font-semibold text-ink">smallest line</b> you can read clearly.</p>
          <div className="optotype-stage flex w-full max-w-xl flex-col items-center gap-3 rounded-sm p-6 shadow-[var(--shadow)]">
            {lines.map((l, i) => (
              <button
                key={l.logMAR}
                onClick={() => setChosen(i)}
                className={`w-full rounded-sm px-2 py-1 text-center ${chosen === i ? "bg-[#cfe3ff]" : "hover:bg-neutral-100"}`}
                style={{ fontSize: l.px / 0.72, lineHeight: 1.2, fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700, letterSpacing: "0.15em" }}
                aria-label={`Line ${i + 1}`}
              >
                {l.text}
              </button>
            ))}
          </div>
          <Button disabled={chosen === null} onClick={() => {
            saveResults({ near: { logMAR: lines[chosen!].logMAR } });
            setDone(true);
          }}>
            Done
          </Button>
        </>
      )}
      <CameraPip videoRef={videoRef} state={state} problem={gate.problem} shownMm={gate.shownMm} inZone={gate.inZone} />
    </StepFrame>
  );
}
