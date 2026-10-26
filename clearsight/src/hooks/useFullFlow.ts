"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function useFullFlow() {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get("flow") === "full",
    () => false,
  );
}
