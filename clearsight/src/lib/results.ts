"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "clearsight.results.v1";

export interface EyeAcuity {
  logMAR: number;
  squintAnswers: number;
  totalAnswers: number;
}

export interface ScanFinding {
  label: string;
  probability: number;
}

export interface Results {
  acuity?: { right?: EyeAcuity; left?: EyeAcuity };
  color?: { correct: number; total: number; controlOk: boolean };
  scan?: { findings: ScanFinding[]; at: number };
  amsler?: { right?: number; left?: number };
  contrast?: { right?: number; left?: number };
  blink?: { perMin: number; blinks: number; seconds: number };
  near?: { logMAR: number };
}

export function loadResults(): Results {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Results) : {};
  } catch {
    return {};
  }
}

export function saveResults(patch: Results) {
  try {
    const merged = { ...loadResults(), ...patch };
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* storage unavailable: results just won't carry over */
  }
}

export function clearResults() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function useResults() {
  const [results, setResults] = useState<Results>({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setResults(loadResults());
    setLoaded(true);
  }, []);
  const reset = useCallback(() => {
    clearResults();
    setResults({});
  }, []);
  return { results, loaded, reset };
}
