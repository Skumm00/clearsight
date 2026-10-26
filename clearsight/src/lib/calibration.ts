"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_WIDTH_MM, DEFAULT_HFOV_DEG } from "./vision";

const KEY = "clearsight.calibration.v1";

export interface Calibration {
  pxPerMm: number;
  hfovDeg: number;
  done: boolean;
}

const DEFAULT: Calibration = { pxPerMm: 96 / 25.4, hfovDeg: DEFAULT_HFOV_DEG, done: false };

export function cardFramePx(pxPerMm: number) {
  return pxPerMm * CARD_WIDTH_MM;
}

export function useCalibration() {
  const [cal, setCal] = useState<Calibration>(DEFAULT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setCal({ ...DEFAULT, ...JSON.parse(raw) });
    } catch {
      /* storage unavailable: fall back to defaults */
    }
    setLoaded(true);
  }, []);

  const save = useCallback((next: Partial<Calibration>) => {
    setCal((prev) => {
      const merged = { ...prev, ...next };
      try {
        localStorage.setItem(KEY, JSON.stringify(merged));
      } catch {
        /* ignore */
      }
      return merged;
    });
  }, []);

  return { cal, save, loaded };
}
