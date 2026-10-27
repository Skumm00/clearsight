"use client";

import Link from "next/link";
import { Button } from "@/components/ui";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-light">Something went wrong.</h1>
      <p className="max-w-md text-muted">The page hit a problem. Your results so far are saved on this device, so you can try again or go back to the start.</p>
      <div className="flex gap-3">
        <Button onClick={() => retry()}>Try again</Button>
        <Link href="/" className="inline-flex h-12 items-center rounded-sm border border-accent px-8 text-accent hover:bg-accent-soft">
          Back to home
        </Link>
      </div>
    </div>
  );
}
