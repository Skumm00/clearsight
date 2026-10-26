"use client";

import { useEffect, useState } from "react";

export function useDebouncedProblem(raw: string | null, delayMs: number) {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (raw === null) {
      setShown(null);
      return;
    }
    const t = setTimeout(() => setShown(raw), delayMs);
    return () => clearTimeout(t);
  }, [raw, delayMs]);
  return shown;
}
