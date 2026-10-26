"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Mic, MicOff, TriangleAlert } from "lucide-react";
import { Button, Card, Instruction, StepFrame } from "@/components/ui";
import { CameraPip } from "@/components/CameraPip";
import { TumblingE } from "@/components/TumblingE";
import { useCalibration } from "@/lib/calibration";
import { SQUINT_RATIO, useFaceTracker } from "@/hooks/useFaceTracker";
import { parseSpokenDirection, useSpeech } from "@/hooks/useSpeech";
import { useLatest } from "@/hooks/useLatest";
import { useDebouncedProblem } from "@/hooks/useDebouncedProblem";
import { useFlowQuery } from "@/hooks/useFlow";
import { usePressed } from "@/hooks/usePressed";
import { loadResults, saveResults, type EyeAcuity } from "@/lib/results";
import {
  bestMeasurableLogMAR,
  interpretAcuity,
  optotypeHeightPx,
  randomDirection,
  snellen,
  Staircase,
  type Direction,
} from "@/lib/vision";

type Eye = "right" | "left";
const EYES: Eye[] = ["right", "left"];
const START_MIN_MM = 500;
const START_MAX_MM = 1100;
const PAUSE_BELOW = 0.7;
const PAUSE_ABOVE = 1.5;
const RESIZE_AFTER = 0.1;
const makeStaircase = (quick: boolean) => (quick ? new Staircase(0.6, 0.15, -0.2, 1.3, 3, 10) : new Staircase());

const PAUSE_DELAY_MS = 1500;
const SQUINT_THRESHOLD = 1 - SQUINT_RATIO;
const ARROWS: { dir: Direction; icon: typeof ArrowUp }[] = [
  { dir: "up", icon: ArrowUp },
  { dir: "left", icon: ArrowLeft },
  { dir: "down", icon: ArrowDown },
  { dir: "right", icon: ArrowRight },
];

export default function AcuityTest() {
  const { cal, loaded } = useCalibration();
  const { full, quick, qs } = useFlowQuery();
  const { pressed, flash } = usePressed<Direction>();
  const { videoRef, state } = useFaceTracker(cal.hfovDeg, loaded);

  const [eyeIdx, setEyeIdx] = useState(0);
  const [phase, setPhase] = useState<"prep" | "test" | "done">("prep");
  const [dir, setDir] = useState<Direction>("right");
  const [level, setLevel] = useState(0.8);
  const [results, setResults] = useState<Partial<Record<Eye, EyeAcuity>>>({});
  const [voiceOn, setVoiceOn] = useState(true);
  const [manualEyeCheck, setManualEyeCheck] = useState(false);
  const [lockedMm, setLockedMm] = useState(1000);
  const stair = useRef(new Staircase());
  const lastAnswerAt = useRef(0);
  const squintCount = useRef(0);
  const answerCount = useRef(0);

  // Random only in the browser: Math.random() during prerender would mismatch the server HTML.
  useEffect(() => setDir(randomDirection()), []);

  const eye = EYES[Math.min(eyeIdx, 1)];
  const otherEye: Eye = eye === "right" ? "left" : "right";
  const otherClosed = otherEye === "left" ? state.leftClosed : state.rightClosed;

  const stableMm = state.stableDistanceMm;
  const squinting = (eye === "right" ? state.squintRight : state.squintLeft) > SQUINT_THRESHOLD;
  const squintingRef = useLatest(squinting);
  const quickRef = useLatest(quick);

  const [squintShown, setSquintShown] = useState(false);
  useEffect(() => {
    if (squinting) {
      setSquintShown(true);
      return;
    }
    const t = setTimeout(() => setSquintShown(false), 1200);
    return () => clearTimeout(t);
  }, [squinting]);

  useEffect(() => {
    if (stair.current.trials === 0) {
      stair.current = makeStaircase(quick);
      setLevel(stair.current.level);
    }
  }, [quick]);

  const rawProblem = useMemo(() => {
    if (state.status !== "ready") return null;
    if (!state.faceFound) return "Face not found";
    if (phase === "prep") {
      if (stableMm < START_MIN_MM) return "Move back a little (0.5 m or more)";
      if (stableMm > START_MAX_MM) return "Move closer (within about 1 m)";
    } else if (stableMm < lockedMm * PAUSE_BELOW) return "Too close, move back";
    else if (stableMm > lockedMm * PAUSE_ABOVE) return "Too far, move closer";
    if (!manualEyeCheck && !otherClosed) return `Close your ${otherEye} eye`;
    return null;
  }, [state.status, state.faceFound, phase, stableMm, lockedMm, manualEyeCheck, otherClosed, otherEye]);

  const pausedProblem = useDebouncedProblem(rawProblem, PAUSE_DELAY_MS);
  const problem = phase === "prep" ? rawProblem : pausedProblem;

  useEffect(() => {
    if (phase === "prep" && state.status === "ready" && !rawProblem) {
      setLockedMm(stableMm);
      setPhase("test");
    }
  }, [phase, state.status, rawProblem, stableMm]);

  const finishEye = useCallback(() => {
    const entry: EyeAcuity = {
      logMAR: stair.current.threshold(),
      squintAnswers: squintCount.current,
      totalAnswers: answerCount.current,
    };
    squintCount.current = 0;
    answerCount.current = 0;
    setResults((r) => ({ ...r, [eye]: entry }));
    saveResults({ acuity: { ...loadResults().acuity, [eye]: entry } });
    if (eyeIdx === 0) {
      stair.current = makeStaircase(quickRef.current);
      setLevel(stair.current.level);
      setEyeIdx(1);
      setPhase("prep");
    } else setPhase("done");
  }, [eye, eyeIdx]);

  const answer = useCallback(
    (d: Direction) => {
      const now = Date.now();
      if (phase !== "test" || problem || now - lastAnswerAt.current < 700) return;
      lastAnswerAt.current = now;
      flash(d);
      answerCount.current++;
      if (squintingRef.current) squintCount.current++;
      const converged = stair.current.respond(d === dir);
      setLevel(stair.current.level);
      if (converged) finishEye();
      else setDir((prev) => randomDirection(prev));
    },
    [phase, problem, dir, finishEye, squintingRef, flash],
  );

  const answerRef = useLatest(answer);

  const speech = useSpeech((text) => {
    const d = parseSpokenDirection(text);
    if (d) answerRef.current(d as Direction);
  }, voiceOn && phase === "test");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
      if (map[e.key]) answerRef.current(map[e.key]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answerRef]);

  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const dist = Math.abs(stableMm - lockedMm) / lockedMm > RESIZE_AFTER ? stableMm : lockedMm;
  const minPx = 5 / dpr;
  const sizePx = Math.min(600, Math.max(minPx, optotypeHeightPx(level, dist, cal.pxPerMm)));

  if (phase === "done") {
    const best = bestMeasurableLogMAR(state.lastDistanceMm, cal.pxPerMm, dpr);
    return (
      <StepFrame title="Visual acuity · Results">
        <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
          {EYES.map((e) => {
            const entry = results[e];
            const v = entry?.logMAR ?? 0;
            const squintShare = entry && entry.totalAnswers > 0 ? entry.squintAnswers / entry.totalAnswers : 0;
            const info = interpretAcuity(v);
            const limited = v <= best + 0.01;
            return (
              <Card key={e} className="p-6">
                <p className="text-sm font-semibold tracking-wide text-muted uppercase">{e} eye</p>
                <p className="mt-2 text-5xl font-light tabular-nums">{snellen(v)}</p>
                <p className="mt-1 text-sm text-muted">logMAR {v.toFixed(2)}</p>
                <p className="mt-4">{info.message}</p>
                {squintShare >= 0.25 && entry && (
                  <p className="mt-3 text-sm text-warn">
                    Squinting was detected on {entry.squintAnswers} of {entry.totalAnswers} answers. Squinting can make vision look sharper than it is,
                    so this result may be optimistic.
                  </p>
                )}
                {limited && (
                  <p className="mt-3 text-sm text-warn">At the limit of what this screen can display at your distance. Real acuity may be better.</p>
                )}
              </Card>
            );
          })}
        </div>
        <p className="max-w-xl text-center text-sm text-muted">
          Screening aid only. Results depend on screen calibration, lighting and distance accuracy, and are not a diagnosis.
        </p>
        <div className="flex gap-3">
          <Link
            href={full ? `/test/color${qs}` : "/"}
            className="inline-flex h-12 items-center rounded-sm bg-accent px-8 text-accent-ink"
          >
            {full ? "Next: color vision" : "Back to home"}
          </Link>
          <Button variant="ghost" onClick={() => location.reload()}>
            Repeat
          </Button>
        </div>
      </StepFrame>
    );
  }

  return (
    <StepFrame
      title={`Visual acuity · ${eye} eye`}
      footer={
        phase === "test" && (
          <div className="flex flex-col items-center gap-4">
            <div className="grid grid-cols-3 gap-2">
              {ARROWS.map(({ dir: d, icon: Icon }, i) => (
                <Button
                  key={d}
                  variant="ghost"
                  aria-label={`Open side points ${d}`}
                  onClick={() => answer(d)}
                  className={`${pressed === d ? "scale-95 !bg-accent !text-accent-ink" : ""} ${d === "up" ? "col-start-2" : d === "left" ? "col-start-1 row-start-2" : d === "down" ? "col-start-2 row-start-2" : "col-start-3 row-start-2"}`}
                  data-i={i}
                >
                  <Icon size={20} />
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted">
              <button onClick={() => setVoiceOn((v) => !v)} className="flex items-center gap-2 hover:text-ink">
                {voiceOn && speech.supported ? <Mic size={16} /> : <MicOff size={16} />}
                {!speech.supported ? "Voice not supported in this browser" : voiceOn ? (speech.heard ? `Heard: “${speech.heard}”` : "Say up, down, left or right") : "Voice off"}
              </button>
              <button onClick={() => setManualEyeCheck((m) => !m)} className="underline">
                {manualEyeCheck ? "Use camera eye check" : "Skip eye check"}
              </button>
            </div>
          </div>
        )
      }
    >
      {phase === "prep" ? (
        <div className="flex flex-col items-center gap-6">
          <Instruction>
            Close your <b>{otherEye}</b> eye and sit about <b>0.7 m</b> from the screen. Anywhere from 0.5 to 1 m works.
          </Instruction>
          <p className="max-w-lg text-center text-muted">
            The test starts by itself once the camera sees the right distance and your {otherEye} eye closed.
          </p>
          <button onClick={() => setManualEyeCheck(true)} className="text-sm text-muted underline">
            Camera can’t see my eye? Skip the eye check
          </button>
        </div>
      ) : (
        <>
          <p className="text-center text-xl text-muted">Which way does the open side of the E point?</p>
          <div className="optotype-stage grid h-[420px] w-full max-w-xl place-items-center rounded-md shadow-[0_2px_12px_rgba(30,50,80,0.08)]">
            {problem ? (
              <p className="px-8 text-center text-2xl font-light text-neutral-600">{problem}</p>
            ) : (
              <TumblingE sizePx={sizePx} dir={dir} />
            )}
          </div>
          {squintShown && !problem && (
            <p role="status" className="flex items-center gap-2 rounded-sm bg-warn-soft px-3 py-2 text-sm font-medium text-warn">
              <TriangleAlert size={16} /> Squinting detected. Relax your eyes and answer with what you can see.
            </p>
          )}
          <p className="text-xs text-muted tabular-nums">
            Letter height {(sizePx / cal.pxPerMm).toFixed(1)} mm · size level {snellen(level)}
          </p>
        </>
      )}
      <CameraPip
        videoRef={videoRef}
        state={state}
        problem={problem}
        shownMm={phase === "test" && !problem ? Math.round(lockedMm / 50) * 50 : state.faceFound ? Math.round(stableMm / 50) * 50 : null}
        inZone={phase === "test" && !problem}
      />
    </StepFrame>
  );
}
