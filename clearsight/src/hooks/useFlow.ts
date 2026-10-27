"use client";

import { useFullFlow } from "./useFullFlow";

/** Whether the user started the full screening, plus the query string that carries it to the next step. */
export function useFlowQuery() {
  const full = useFullFlow();
  return { full, qs: full ? "?flow=full" : "" };
}
