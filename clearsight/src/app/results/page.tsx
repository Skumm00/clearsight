"use client";

import Link from "next/link";
import { CheckCircle2, CircleAlert, Contrast, Eye, Glasses, Grid3x3, Info, Palette, ScanEye, Timer, TriangleAlert } from "lucide-react";
import { Button, Card, StepFrame } from "@/components/ui";
import { EyeCareFinder } from "@/components/EyeCareFinder";
import { useResults } from "@/lib/results";
import { buildPlan, type Section, type Tone, type Urgency } from "@/lib/recommendations";

const URGENCY_STYLE: Record<Urgency, { icon: typeof CheckCircle2; cls: string }> = {
  none: { icon: CircleAlert, cls: "bg-accent-soft text-accent" },
  routine: { icon: CheckCircle2, cls: "bg-accent-soft text-accent" },
  soon: { icon: TriangleAlert, cls: "bg-warn-soft text-warn" },
  prompt: { icon: TriangleAlert, cls: "bg-warn-soft text-warn" },
};

const TONE_LABEL: Record<Tone, { text: string; cls: string }> = {
  ok: { text: "Looks typical", cls: "bg-accent-soft text-ink" },
  watch: { text: "Worth watching", cls: "bg-warn-soft text-warn" },
  see: { text: "See a professional", cls: "bg-warn-soft text-warn" },
};

const SECTION_ICON = { acuity: Eye, color: Palette, scan: ScanEye, amsler: Grid3x3, contrast: Contrast, blink: Timer, near: Glasses } as const;

function SectionCard({ section }: { section: Section }) {
  const Icon = SECTION_ICON[section.id];
  const tone = TONE_LABEL[section.tone];
  return (
    <Card className="p-6 text-left">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon size={22} className="text-ink" />
          <h4 className="text-lg font-semibold">{section.title}</h4>
        </div>
        <span className={`rounded-sm px-2.5 py-1 text-xs font-medium ${tone.cls}`}>{tone.text}</span>
      </div>

      <dl className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {section.scores.map((s) => (
          <div key={s.label} className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className="font-medium tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-[15px]">{section.summary}</p>

      {section.actions.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[15px] text-muted">
          {section.actions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex gap-2 rounded-sm bg-accent-soft p-3 text-sm">
        <Info size={16} className="mt-0.5 shrink-0 text-muted" />
        <p>
          <span className="font-medium">How we know: </span>
          <span className="text-muted">{section.how}</span>
        </p>
      </div>
    </Card>
  );
}

export default function ResultsPage() {
  const { results, loaded, reset } = useResults();
  if (!loaded) return <StepFrame title="Your summary">{null}</StepFrame>;

  const plan = buildPlan(results);
  const { icon: Icon, cls } = URGENCY_STYLE[plan.urgency];
  const missing = [
    !results.acuity && { href: "/test/acuity", label: "Visual acuity" },
    !results.color && { href: "/test/color", label: "Color vision" },
    !results.scan && { href: "/test/scan", label: "Eye photo scan" },
    !results.amsler && { href: "/test/amsler", label: "Amsler grid" },
    !results.contrast && { href: "/test/contrast", label: "Contrast sensitivity" },
    !results.blink && { href: "/test/blink", label: "Blink & strain" },
    !results.near && { href: "/test/near", label: "Near vision" },
  ].filter(Boolean) as { href: string; label: string }[];

  return (
    <StepFrame title="Your summary">
      <div className="w-full max-w-3xl space-y-10 py-4">
        <Card className="flex items-start gap-4 p-6">
          <span className={`grid size-11 shrink-0 place-items-center rounded-sm ${cls}`}>
            <Icon size={22} />
          </span>
          <div className="text-left">
            <h2 className="text-2xl font-light">{plan.headline}</h2>
            <p className="mt-1 text-muted">{plan.summary}</p>
          </div>
        </Card>

        {plan.sections.length > 0 && (
          <section>
            <h3 className="mb-3 text-left text-lg font-medium">Based on your results</h3>
            <div className="space-y-4">
              {plan.sections.map((s) => (
                <SectionCard key={s.id} section={s} />
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-3 text-left text-lg font-medium">Habits for healthier eyes</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {plan.habits.map((t) => (
              <li key={t.title}>
                <Card className="h-full p-5 text-left">
                  <p className="font-medium">{t.title}</p>
                  <p className="mt-1 text-[15px] text-muted">{t.body}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        {plan.moreHabits.length > 0 && (
          <section>
            <h3 className="mb-3 text-left text-lg font-medium">More suggestions for you</h3>
            <ul className="grid gap-3 sm:grid-cols-2">
              {plan.moreHabits.map((t) => (
                <li key={t.title}>
                  <Card className="h-full p-5 text-left">
                    <p className="font-medium">{t.title}</p>
                    <p className="mt-1 text-[15px] text-muted">{t.body}</p>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}

        {missing.length > 0 && (
          <p className="text-center text-sm text-muted">
            Want a fuller picture? Take:{" "}
            {missing.map((m, i) => (
              <span key={m.href}>
                {i > 0 && ", "}
                <Link href={m.href} className="text-accent underline">
                  {m.label}
                </Link>
              </span>
            ))}
            .
          </p>
        )}

        <section className="text-center">
          <h3 className="mb-4 text-lg font-medium">Find eye care near you</h3>
          <div className="flex justify-center">
            <EyeCareFinder />
          </div>
        </section>

        <div className="flex flex-wrap justify-center gap-3 pb-6">
          <Link href="/" className="inline-flex h-12 items-center rounded-sm border border-accent px-8 text-accent hover:bg-accent-soft">
            Back to home
          </Link>
          <Button variant="ghost" onClick={reset}>
            Clear my results
          </Button>
        </div>
        <p className="pb-6 text-center text-xs text-muted">
          ClearSight is a screening aid, not a medical diagnosis. These tips are general wellness guidance and do not replace advice from an eye care professional.
        </p>
      </div>
    </StepFrame>
  );
}
