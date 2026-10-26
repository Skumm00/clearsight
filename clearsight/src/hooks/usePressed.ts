"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function usePressed<T>(ms = 220) {
  const [pressed, setPressed] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flash = useCallback(
    (key: T) => {
      setPressed(key);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setPressed(null), ms);
    },
    [ms],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return { pressed, flash };
}
