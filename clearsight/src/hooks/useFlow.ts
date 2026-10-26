"use client";

import { useSyncExternalStore } from "react";
import { useFullFlow } from "./useFullFlow";

const subscribe = () => () => {};

export function useQuick() {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get("quick") === "1",
    () => false,
  );
}

export function useFlowQuery() {
  const full = useFullFlow();
  const quick = useQuick();
  const parts = [full && "flow=full", quick && "quick=1"].filter(Boolean);
  return { full, quick, qs: parts.length ? `?${parts.join("&")}` : "" };
}
