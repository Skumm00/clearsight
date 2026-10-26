"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Instruction, StepFrame } from "@/components/ui";
import { CameraPip } from "@/components/CameraPip";
import { useCalibration } from "@/lib/calibration";
import { useFaceTracker } from "@/hooks/useFaceTracker";
import { useGate } from "@/hooks/useGate";
import { useLatest } from "@/hooks/useLatest";
import { loadResults, saveResults } from "@/lib/results";
import { usePressed } from "@/hooks/usePressed";
import { optotypeHeightPx } from "@/lib/vision";

type Eye = "right" | "left";
const EYES: Eye[] = ["right", "left"];
/** Sloan letters, as used on the Pelli-Robson chart. */
const LETTERS = "CDHKNORSVZ".split("");
/** Pelli-Robson steps contrast down 0.15 log units per triplet, from 100% (logCS 0.00). */
const STEP = 0.15;
const LEVELS = 15;
/** Letters are large (about 2.8 degrees tall at 1 m), so this test measures contrast, not sharpness. */
const LETTER_LOGMAR = 1.5;

function randomTriplet(prev: string[] = []) {
  const pool = LETTERS.filter((l) => !prev.includes(l));
  const out: string[] = [];
  while (out.length < 3) {
    const c = pool[Math.floor(Math.random() * pool.length)];
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

function interpret(logCS: number) {
  if (logCS >= 1.65) return "Typical contrast sensitivity.";
  if (logCS >= 1.35) return "Slightly reduced. Dim light and glare may be harder than usual.";
  return "Reduced. A professional exam can look for causes such as cataracts or other eye conditions.";
}

export default function ContrastTest() {
  const { cal, loaded } = useCalibration();
  const { videoRef, state } = useFaceTracker(cal.hfovDeg, loaded);
  const [bypass, setBypass] = useState(false);
  const { pressed, flash } = usePressed<string>();
  const [eyeIdx, setEyeIdx] = useState(0);
  const [level, setLevel] = useState(0);
  // Deterministic first render (no Math.random during prerender); randomized once in the browser below.
  const [triplet, setTriplet] = useState<string[]>(["C", "D", "H"]);
  const [picked, setPicked] = useState<string[]>([]);
  const [scores, setScores] = useState<Partial<Record<Eye, number>>>({});
  const [done, setDone] = useState(false);

  useEffect(() => setTriplet(randomTriplet()), []);

  const eye = EYES[Math.min(eyeIdx, 1)];
  const gate = useGate({ state, eye, startMinMm: 500, startMaxMm: 1100, bypass });
  const running = gate.phase === "run" && !gate.problem;

  const logCS = +(level * STEP).toFixed(2);
  const contrast = Math.pow(10, -logCS);
  const gray = Math.round(255 * (1 - contrast));
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const maxPx = typeof window === "undefined" ? 200 : (window.innerWidth * 0.85) / 3.6;
  const sizePx = Math.min(maxPx, Math.max(5 / dpr, optotypeHeightPx(LETTER_LOGMAR, gate.sizeMm, cal.pxPerMm)));

  const finishEye = useCallback(
    (score: number) => {
      setScores((s) => ({ ...s, [eye]: score }));
      saveResults({ contrast: { ...loadResults().contrast, [eye]: score } });
      setLevel(0);
      setPicked([]);
      setTriplet(randomTriplet());
      if (eyeIdx === 0) {
        setEyeIdx(1);
        gate.reset();
      } else setDone(true);
    },
    [eye, eyeIdx, gate],
  );

  const submit = useCallback(
    (letters: string[]) => {
      const correct = letters.filter((l, i) => l === triplet[i]).length;
      if (correct >= 2) {
        if (level + 1 >= LEVELS) return finishEye(+((LEVELS - 1) * STEP).toFixed(2));
        setLevel(level + 1);
        setTriplet(randomTriplet(triplet));
        setPicked([]);
      } else {
        finishEye(Math.max(0, +((level - 1) * STEP).toFixed(2)));
      }
    },
    [level, triplet, finishEye],
  );

  const pick = useCallback(
    (letter: string) => {
      if (!running) return;
      flash(letter);
      const next = [...picked, letter];
      if (next.length === 3) submit(next);
      else setPicked(next);
    },
    [picked, running, submit, flash],
  );

  const pickRef = useLatest(pick);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const l = e.key.toUpperCase();
      if (LETTERS.includes(l)) pickRef.current(l);
      if (e.key === "Backspace") setPicked((p) => p.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickRef]);

  if (done) {
    return (
      <StepFrame title="Contrast sensitivity · Results">
        <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
          {EYES.map((e) => (
            <Card key={e} className="p-6">
              <p className="text-sm font-semibold tracking-wide text-muted uppercase">{e} eye</p>
              <p className="mt-2 text-5xl font-light tabular-nums">{(scores[e] ?? 0).toFixed(2)}</p>
              <p className="mt-1 text-sm text-muted">log contrast sensitivity</p>
              <p className="mt-4">{interpret(scores[e] ?? 0)}</p>
            </Card>
          ))}
        </div>
        <p className="max-w-xl text-center text-sm text-muted">
          Screen brightness, glare and display settings change how faint the letters really are, so treat this as a rough screening, not a clinical measurement.
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
    <StepFrame title={`Contrast sensitivity · ${eye} eye`}>
      {!running ? (
        <div className="flex flex-col items-center gap-6">
          <Instruction>
            Close your <b>{eye === "right" ? "left" : "right"}</b> eye and sit about <b>0.7 m</b> from the screen. Anywhere from 0.5 to 1 m works.
          </Instruction>
          <p className="max-w-lg text-center text-muted">
            Letters will fade from dark to faint. Set your screen brightness high and avoid glare. The test starts once the camera sees the right distance.
          </p>
          <button onClick={() => setBypass(true)} className="text-sm text-muted underline">
            Camera can’t see me? Skip the camera checks
          </button>
        </div>
      ) : (
        <>
          <p className="text-center text-xl text-muted">Pick the three letters you see, left to right.</p>
          <div className="optotype-stage grid h-[300px] w-full max-w-3xl place-items-center rounded-sm shadow-[var(--shadow)]">
            <div className="flex gap-[0.6em]" style={{ fontSize: sizePx / 0.72, lineHeight: 1, color: `rgb(${gray},${gray},${gray})` }}>
              {triplet.map((l, i) => (
                <span key={i} className="font-bold" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
                  {l}
                </span>
              ))}
            </div>
          </div>
          <div className="flex min-h-8 gap-3 text-2xl font-semibold tabular-nums">
            {[0, 1, 2].map((i) => (
              <span key={i} className="grid h-10 w-10 place-items-center rounded-sm border border-line">
                {picked[i] ?? ""}
              </span>
            ))}
          </div>
          <div className="flex max-w-xl flex-wrap justify-center gap-2">
            {LETTERS.map((l) => (
              <Button key={l} variant="ghost" className={`h-11 w-11 px-0 ${pressed === l ? "scale-95 !bg-accent !text-accent-ink" : ""}`} onClick={() => pick(l)}>
                {l}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted">You can also type the letters on your keyboard. Guess if you are unsure.</p>
        </>
      )}
      <CameraPip videoRef={videoRef} state={state} problem={gate.problem} shownMm={gate.shownMm} inZone={gate.inZone} />
    </StepFrame>
  );
}
