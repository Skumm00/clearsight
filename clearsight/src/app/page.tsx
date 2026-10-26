import Link from "next/link";
import { Contrast, Eye, Glasses, Grid3x3, MapPin, Palette, ScanEye, Timer } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const OPTIONS = [
  { href: "/test/acuity", icon: Eye, title: "Visual acuity", blurb: "See how sharp your vision is with a letter test sized to your distance.", cta: "Start acuity check", ready: true },
  { href: "/test/color", icon: Palette, title: "Color vision", blurb: "Find the hidden numbers in dotted plates.", cta: "Start color check", ready: true },
  { href: "/test/scan", icon: ScanEye, title: "Eye photo scan", blurb: "Upload a photo for an AI check of the outer eye.", cta: "Start photo scan", ready: true },
  { href: "/care", icon: MapPin, title: "Eye-care finder", blurb: "Find optometrists and eye care near you.", cta: "Find eye care", ready: true },
  { href: "/test/amsler", icon: Grid3x3, title: "Amsler grid", blurb: "Check your central vision for distortion.", cta: "Start Amsler grid", ready: true },
  { href: "/test/contrast", icon: Contrast, title: "Contrast sensitivity", blurb: "Spot letters that fade into the background.", cta: "Start contrast check", ready: true },
  { href: "/test/blink", icon: Timer, title: "Blink & strain", blurb: "Track your blink rate while you use a screen.", cta: "Start blink check", ready: true },
  { href: "/test/near", icon: Glasses, title: "Near vision", blurb: "Check close-up focus at reading distance.", cta: "Start near check", ready: true },
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-end px-5">
        <ThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-6 pt-16 pb-14 text-center">
        <h1 className="max-w-2xl text-4xl leading-[1.2] font-light sm:text-5xl">
          Screen your vision. Scan your eyes. <b className="font-semibold">Know your next step.</b>
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted">
          Camera-verified vision tests, an AI photo scan and personalized guidance, all in your browser.
        </p>

        <Link
          href="/calibrate?flow=full"
          className="mt-10 flex h-12 w-full max-w-md items-center justify-center rounded-sm bg-accent text-[15px] text-accent-ink hover:brightness-110"
        >
          Start full screening
        </Link>

        <section id="checks" className="mt-20 w-full" aria-label="Screening options">
          <h2 className="mb-8 text-2xl font-semibold">Or choose one of our vision checks to start.</h2>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {OPTIONS.map(({ href, icon: Icon, title, blurb, cta, ready }) => (
              <li key={title} className="flex">
                <div className="flex w-full flex-col items-center rounded-md bg-surface p-6 text-center shadow-[var(--shadow)]">
                  <Icon size={52} strokeWidth={1.25} className={ready ? "text-ink" : "text-muted"} />
                  <h3 className="mt-6 text-xl font-semibold">{title}</h3>
                  <p className="mt-2 mb-6 text-[15px] leading-snug text-muted">{blurb}</p>
                  {ready ? (
                    <Link
                      href={href}
                      className="mt-auto flex h-11 w-full items-center justify-center rounded-sm bg-accent text-sm text-accent-ink hover:brightness-110"
                    >
                      {cta}
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="mt-auto flex h-11 w-full cursor-not-allowed items-center justify-center rounded-sm border border-line text-sm text-muted"
                    >
                      {cta}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="px-6 py-6 text-center text-xs text-muted">
        ClearSight is a screening aid, not a medical diagnosis. Congressional App Challenge 2026.
      </footer>
    </div>
  );
}
