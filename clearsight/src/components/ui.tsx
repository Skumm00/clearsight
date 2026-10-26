"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex h-12 items-center justify-center rounded-sm px-8 text-[15px] font-normal transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "border border-accent bg-accent text-accent-ink hover:brightness-110",
        variant === "ghost" && "border border-accent bg-transparent text-accent hover:bg-accent-soft",
        className,
      )}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx("rounded-md border border-[color:var(--card-border)] bg-surface shadow-[var(--shadow)]", className)}>
      {children}
    </div>
  );
}

export function StepFrame({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="relative flex h-16 w-full items-center justify-center px-4">
        <ThemeToggle className="absolute top-1/2 left-4 -translate-y-1/2" />
        <h1 className="text-base font-semibold text-ink">{title}</h1>
        <Link
          href="/"
          aria-label="Exit test"
          className="absolute top-1/2 right-4 grid size-10 -translate-y-1/2 place-items-center rounded-sm text-muted hover:bg-accent-soft hover:text-ink"
        >
          <X size={22} />
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5">
        <section className="flex flex-1 flex-col items-center justify-center gap-8 pb-8">{children}</section>
        {footer && <footer className="pb-8">{footer}</footer>}
      </main>
    </div>
  );
}

export function Dots({ count, active }: { count: number; active: number }) {
  return (
    <div className="flex items-center justify-center gap-2" aria-label={`Step ${active + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={clsx("size-2 rounded-full transition-all", i === active ? "w-6 bg-accent" : "bg-line")} />
      ))}
    </div>
  );
}

export function Instruction({ children }: { children: ReactNode }) {
  return <p className="max-w-2xl text-center text-3xl leading-snug font-light text-ink [&_b]:font-semibold">{children}</p>;
}

export function StatusPill({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-sm px-3 py-1 text-sm font-medium",
        ok ? "bg-accent-soft text-ink" : "bg-warn-soft text-warn",
      )}
    >
      <span className={clsx("size-2 rounded-full", ok ? "bg-ok" : "bg-warn")} />
      {children}
    </span>
  );
}
