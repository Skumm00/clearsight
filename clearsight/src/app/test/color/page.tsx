"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { Button, Card, Instruction, StepFrame } from "@/components/ui";
import { drawPlate, optionsFor, PLATES } from "@/lib/plates";
import { parseSpokenNumber, useSpeech } from "@/hooks/useSpeech";
import { useLatest } from "@/hooks/useLatest";
import { saveResults } from "@/lib/results";
import { useFlowQuery } from "@/hooks/useFlow";

export default function ColorTest() {
  const { full, qs } = useFlowQuery();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<(number | null | undefined)[]>([]);
  const [done, setDone] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spec = PLATES[i];
  const options = useMemo(() => optionsFor(spec), [spec]);

  useEffect(() => {
    if (canvasRef.current && !done) drawPlate(canvasRef.current, spec, 1000 + i * 77, 340);
  }, [spec, i, done]);

  const choose = useCallback(
    (value: number | null) => {
      setAnswers((a) => {
        const next = [...a];
        next[i] = value;
        return next;
      });
      if (i + 1 >= PLATES.length) setDone(true);
      else setI(i + 1);
    },
    [i],
  );

  const chooseRef = useLatest(choose);
  const optionsRef = useLatest(options);

  const speech = useSpeech((text) => {
    if (/\b(nothing|none|no number)\b/i.test(text)) return chooseRef.current(null);
    const n = parseSpokenNumber(text);
    if (n !== null && optionsRef.current.includes(n)) chooseRef.current(n);
  }, !done);

  useEffect(() => {
    if (!done) return;
    const scored = PLATES.map((p, idx) => ({ p, idx })).filter(({ p }) => p.kind !== "control");
    saveResults({
      color: {
        correct: scored.filter(({ p, idx }) => answers[idx] === p.number).length,
        total: scored.length,
        controlOk: answers[0] === PLATES[0].number,
      },
    });
  }, [done, answers]);

  if (done) {
    const control = answers[0] === PLATES[0].number;
    const scored = PLATES.map((p, idx) => ({ p, idx })).filter(({ p }) => p.kind !== "control");
    const correct = scored.filter(({ p, idx }) => answers[idx] === p.number).length;
    const missed = scored.length - correct;
    const message = !control
      ? "The control plate was not read correctly, so the result is unreliable. Check your screen brightness and lighting, then retry."
      : missed === 0
        ? "You read every plate. No sign of a red-green color vision deficiency in this screening."
        : missed === 1
          ? "One plate was missed. That can be a fluke, so try again in good light."
          : "Several plates were missed, which can indicate a red-green color vision deficiency. An eye care professional can confirm this.";
    return (
      <StepFrame title="Color vision · Results">
        <Card className="max-w-xl p-8 text-center">
          <p className="text-6xl font-light tabular-nums">
            {correct}
            <span className="text-3xl text-muted"> / {scored.length}</span>
          </p>
          <p className="mt-4 text-lg">{message}</p>
          <p className="mt-4 text-sm text-muted">
            Screening aid only. Screen color settings affect this test, and results are not a diagnosis.
          </p>
        </Card>
        <div className="flex gap-3">
          <Link
            href={full ? `/test/scan${qs}` : "/"}
            className="inline-flex h-12 items-center rounded-sm bg-accent px-8 text-accent-ink"
          >
            {full ? "Next: eye photo scan" : "Back to home"}
          </Link>
          <Button
            variant="ghost"
            onClick={() => {
              setI(0);
              setAnswers([]);
              setDone(false);
            }}
          >
            Repeat
          </Button>
        </div>
      </StepFrame>
    );
  }

  return (
    <StepFrame title={`Color vision · ${i + 1} of ${PLATES.length}`}>
      <Instruction>
        Keep <b>both eyes open</b> and select the <b>number</b> you see in the circle.
      </Instruction>
      <div className="grid place-items-center rounded-md bg-white p-8 shadow-[var(--shadow)]">
        <canvas ref={canvasRef} aria-label="Dotted color plate" />
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {options.map((o) => (
          <Button key={String(o)} variant="ghost" className="min-w-24 text-lg" onClick={() => choose(o)}>
            {o === null ? "Nothing" : o}
          </Button>
        ))}
      </div>
      <p className="flex items-center gap-2 text-sm text-muted">
        <Mic size={16} />
        {!speech.supported ? "Voice not supported in this browser" : speech.heard ? `Heard: “${speech.heard}”` : "Or say the number out loud"}
      </p>
    </StepFrame>
  );
}
