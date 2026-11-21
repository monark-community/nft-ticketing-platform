import { useState } from "react";

// True once `loading` has been true while this component was on the page (#365). Content that
// replaces a loading placeholder prints in (`<PrintIn play={sawLoading}>`); content that was
// already there, from a cache, shows at once.
export function useSawLoading(loading: boolean): boolean {
  const [saw, setSaw] = useState(loading);
  if (loading && !saw) setSaw(true);
  return saw;
}
