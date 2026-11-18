"use client";

import { useSyncExternalStore } from "react";

import { REDUCED_MOTION_QUERY } from "@/lib/motion";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// True when the system's "reduce motion" setting is on (false during server rendering). CSS
// animations already stop through the rule in globals.css; this is for the ones driven by script.
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}
