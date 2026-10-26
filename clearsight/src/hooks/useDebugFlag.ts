"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function useDebugFlag() {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get("debug") === "1",
    () => false,
  );
}
