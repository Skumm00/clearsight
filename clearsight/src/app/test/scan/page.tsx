"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, ScanEye } from "lucide-react";
import { Button, Card, StepFrame } from "@/components/ui";
import { classifyEye, ModelMissingError } from "@/lib/classifier";
import { saveResults, type ScanFinding } from "@/lib/results";
import { conditionInfo, displayLabel } from "@/lib/labels";
import { HABITS } from "@/lib/recommendations";
import { useFullFlow } from "@/hooks/useFullFlow";

const MIN_CONFIDENCE = 0.6;

function isNormal(label: string) {
  return label.toLowerCase().includes("normal");
}

export default function ScanPage() {
  const full = useFullFlow();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [findings, setFindings] = useState<ScanFinding[] | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const pick = useCallback((file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError(null);
    setMissing(false);
    setFindings(null);
    setUrl(URL.createObjectURL(file));
  }, []);

  const analyze = async () => {
    if (!imgRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const result = await classifyEye(imgRef.current);
      setFindings(result);
      saveResults({ scan: { findings: result.slice(0, 3), at: Date.now() } });
    } catch (e) {
      if (e instanceof ModelMissingError) setMissing(true);
      else setError("Something went wrong while analyzing the photo. Try a different image.");
    } finally {
      setBusy(false);
    }
  };

  const top = findings?.[0];
  const headline = !top
    ? ""
    : top.probability < MIN_CONFIDENCE
      ? "The scan was inconclusive for this photo."
      : isNormal(top.label)
        ? "No clear signs of the conditions we screen for."
        : `Possible signs: ${displayLabel(top.label).toLowerCase()}.`;

  const flaggedInfo = top && top.probability >= MIN_CONFIDENCE && !isNormal(top.label) ? conditionInfo(top.label) : undefined;
  const tailored = !!flaggedInfo && flaggedInfo.habits.length > 0;
  const habits = tailored ? flaggedInfo!.habits : HABITS.slice(0, 3);

  return (
    <StepFrame title="Eye photo scan">
      {!findings && (
        <>
          <div className="max-w-xl text-center">
            <h2 className="text-3xl font-light">
              Upload a <b className="font-semibold">close-up photo</b> of one eye.
            </h2>
            <p className="mt-3 text-muted">
              Use good light, keep the eye open and in focus, and avoid flash glare. The photo is analyzed in your browser and is never uploaded.
            </p>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files?.[0]);
            }}
            className="grid w-full max-w-xl place-items-center rounded-md border-2 border-dashed border-line bg-surface p-6"
          >
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img ref={imgRef} src={url} alt="Your uploaded eye" className="max-h-72 rounded-sm object-contain" />
            ) : (
              <button onClick={() => inputRef.current?.click()} className="flex flex-col items-center gap-3 py-10 text-muted hover:text-ink">
                <ImagePlus size={36} />
                <span>Drop a photo here, or choose one</span>
              </button>
            )}
            <input ref={inputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </div>

          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => inputRef.current?.click()}>
              {url ? "Choose another" : "Choose photo"}
            </Button>
            <Button onClick={analyze} disabled={!url || busy}>
              {busy ? <Loader2 className="animate-spin" size={18} /> : <ScanEye size={18} className="mr-2" />}
              {busy ? "Analyzing" : "Analyze photo"}
            </Button>
          </div>

          {full && (
            <Link href="/results" className="text-sm text-muted underline">
              Skip this step
            </Link>
          )}

          {missing && (
            <p className="max-w-md rounded-sm bg-warn-soft p-4 text-center text-sm text-warn">
              The scan model is not installed in this build yet, so no result can be shown.
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </>
      )}

      {findings && (
        <>
          <Card className="w-full max-w-xl p-8">
            <p className="text-sm font-semibold tracking-wide text-muted uppercase">Scan result</p>
            <p className="mt-2 text-3xl font-light">{headline}</p>
            <ul className="mt-6 space-y-3">
              {findings.slice(0, 5).map((f) => (
                <li key={f.label}>
                  <div className="flex justify-between text-sm">
                    <span>{displayLabel(f.label)}</span>
                    <span className="tabular-nums text-muted">{Math.round(f.probability * 100)}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-sm bg-line">
                    <div className="h-full rounded-sm bg-accent" style={{ width: `${Math.round(f.probability * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            {top && top.probability >= MIN_CONFIDENCE && conditionInfo(top.label) && (
              <div className="mt-6 rounded-sm bg-accent-soft p-4 text-left text-[15px]">
                <p className="font-medium">About this finding</p>
                <p className="mt-1 text-muted">{conditionInfo(top.label)!.about}</p>
                <p className="mt-2">{conditionInfo(top.label)!.seek}</p>
              </div>
            )}
            <div className="mt-6 text-left">
              <p className="font-medium">Suggested habits</p>
              <ul className="mt-2 space-y-3 text-[15px]">
                {habits.map((h) => (
                  <li key={h.title}>
                    <span className="font-medium">{h.title}. </span>
                    <span className="text-muted">{h.body}</span>
                  </li>
                ))}
              </ul>
              {tailored && <p className="mt-2 text-xs text-muted">Chosen for the finding above. General wellness tips, not treatment.</p>}
            </div>
            <p className="mt-6 text-sm text-muted">
              This is an experimental screening aid trained on a small public dataset. It can be wrong in both directions and is not a diagnosis. If
              you have symptoms or concerns, see an eye professional.
            </p>
          </Card>
          <p className="max-w-xl text-center text-xs text-muted">
            Trained on two public datasets (both CC BY 4.0): &ldquo;Image Dataset on Eye Diseases Classification&rdquo; by Bitto, Ahmed et al. (Mendeley Data),
            and &ldquo;Eye Dataset&rdquo; by Yudis Project (Roboflow Universe). Images were collected from the web, not all labels are clinically verified, and accuracy on
            phone photos is untested.
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setFindings(null)}>
              Scan another
            </Button>
            <Link href="/results" className="inline-flex h-12 items-center rounded-sm bg-accent px-8 text-accent-ink">
              {full ? "See my full results" : "See my summary"}
            </Link>
          </div>
        </>
      )}
    </StepFrame>
  );
}
