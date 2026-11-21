import { useEffect, useState } from "react";

import { PLACEHOLDER_DELAY_MS, PLACEHOLDER_MIN_MS, placeholderStep, type PlaceholderPhase } from "@/lib/motion";

// `loading`, held a little longer when the placeholders made it on screen (#365). Placeholders wait
// PLACEHOLDER_DELAY_MS before they show (`placeholder-in`), so content that answers faster replaces
// them before anyone sees them. Once they show, they stay at least PLACEHOLDER_MIN_MS, so they never
// blink. Use it to choose between the placeholders and the content:
//   const showPlaceholders = useHeldLoading(loading);
export function useHeldLoading(loading: boolean): boolean {
  const [state, setState] = useState<{ loading: boolean; phase: PlaceholderPhase }>(() => ({ loading, phase: loading ? "waiting" : "idle" }));
  // Follows `loading` during render, so the content never shows for a frame before a hold starts
  let { phase } = state;
  if (state.loading !== loading) {
    phase = placeholderStep(phase, loading ? "load-start" : "load-end");
    setState({ loading, phase });
  }

  useEffect(() => {
    if (phase !== "waiting" && phase !== "shown") return;
    const event = phase === "waiting" ? "delay-over" : "minimum-over";
    const timer = setTimeout(() => setState((s) => ({ ...s, phase: placeholderStep(s.phase, event) })), phase === "waiting" ? PLACEHOLDER_DELAY_MS : PLACEHOLDER_MIN_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  return loading || phase === "shown";
}
