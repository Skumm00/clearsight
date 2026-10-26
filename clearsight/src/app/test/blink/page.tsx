"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, Button, Instruction, StepFrame } from "@/components/ui";
import { CameraPip } from "@/components/CameraPip";
import { useCalibration } from "@/lib/calibration";
import { useFaceTracker } from "@/hooks/useFaceTracker";
import { saveResults } from "@/lib/results";
import { useLatest } from "@/hooks/useLatest";

const DURATION_S = 45;
const PASSAGE =
  "The first cameras were large wooden boxes with a small hole at the front. Light passing through the hole formed an upside-down picture on the " +
  "opposite wall, and people traced it by hand. Over time, lenses made the picture sharper, and chemicals made it permanent. Today a camera fits " +
  "inside a phone, and it can recognize faces, measure distance and even help check the health of the eyes that use it. Reading quietly and " +
  "naturally for a little while is all this test needs. Try not to think about your blinking.";

function interpret(perMin: number) {
  if (perMin >= 15) return { tone: "ok", text: "Typical. Many people blink about 15-20 times a minute at rest." };
  if (perMin >= 8) return { tone: "watch", text: "A bit low. Blinking often drops while reading or using screens, which can dry the eyes." };
  return { tone: "watch", text: "Low. People often blink far less on screens, and a low rate is linked to dry, tired eyes. Try the habits below." };
}

export default function BlinkTest() {
  const { cal, loaded } = useCalibration();
  const { videoRef, state } = useFaceTracker(cal.hfovDeg, loaded);
  const [phase, setPhase] = useState<"intro" | "run" | "done">("intro");
  const [left, setLeft] = useState(DURATION_S);
  const [startBlinks, setStartBlinks] = useState(0);
  const [result, setResult] = useState<{ perMin: number; blinks: number } | null>(null);
  const blinkRef = useLatest(state.blinkCount);

  useEffect(() => {
    if (phase !== "run") return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const remaining = Math.max(0, DURATION_S - Math.floor(elapsed));
      setLeft(remaining);
      if (elapsed >= DURATION_S) {
        clearInterval(id);
        const blinks = blinkRef.current - startBlinks;
        const perMin = Math.round((blinks / DURATION_S) * 60);
        setResult({ perMin, blinks });
        saveResults({ blink: { perMin, blinks, seconds: DURATION_S } });
        setPhase("done");
      }
    }, 250);
    return () => clearInterval(id);
  }, [phase, blinkRef, startBlinks]);

  const ready = state.status === "ready" && state.faceFound;
  const live = Math.max(0, state.blinkCount - startBlinks);

  if (phase === "done" && result) {
    const info = interpret(result.perMin);
    return (
      <StepFrame title="Blink & strain · Results">
        <Card className="w-full max-w-xl p-8 text-center">
          <p className="text-6xl font-light tabular-nums">
            {result.perMin}
            <span className="text-2xl text-muted"> blinks / min</span>
          </p>
          <p className="mt-2 text-sm text-muted">{result.blinks} blinks counted in {DURATION_S} seconds</p>
          <p className="mt-5 text-lg">{info.text}</p>
          <p className="mt-4 text-sm text-muted">
            Webcams can miss quick or partial blinks, so the real number may be higher. This is a rough indicator of screen strain, not a diagnosis.
          </p>
        </Card>
        <div className="flex gap-3">
          <Link href="/results" className="inline-flex h-12 items-center rounded-sm bg-accent px-8 text-accent-ink">
            See my summary
          </Link>
          <Button variant="ghost" onClick={() => location.reload()}>
            Repeat
          </Button>
        </div>
        <CameraPip videoRef={videoRef} state={state} />
      </StepFrame>
    );
  }

  return (
    <StepFrame title="Blink & strain">
      {phase === "intro" ? (
        <div className="flex flex-col items-center gap-6">
          <Instruction>
            Read a short passage naturally for <b>{DURATION_S} seconds</b>. We will count your blinks.
          </Instruction>
          <p className="max-w-lg text-center text-muted">Sit comfortably with your face visible to the camera. Try not to think about blinking.</p>
          <Button
            disabled={!ready}
            onClick={() => {
              setStartBlinks(state.blinkCount);
              setLeft(DURATION_S);
              setPhase("run");
            }}
          >
            {ready ? "Start" : state.status === "error" ? "Camera unavailable" : "Waiting for the camera"}
          </Button>
        </div>
      ) : (
        <div className="flex w-full max-w-2xl flex-col items-center gap-6">
          <div className="flex items-baseline gap-6 text-muted">
            <span className="text-5xl font-light text-ink tabular-nums">{left}s</span>
            <span className="text-lg tabular-nums">{live} blinks</span>
          </div>
          <Card className="p-8 text-left text-xl leading-relaxed">{PASSAGE}</Card>
          {!state.faceFound && <p className="text-sm text-warn">We can’t see your face. Move into view so blinks are counted.</p>}
        </div>
      )}
      <CameraPip videoRef={videoRef} state={state} />
    </StepFrame>
  );
}
