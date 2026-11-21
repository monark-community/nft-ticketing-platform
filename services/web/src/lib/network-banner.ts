// What the wrong network banner shows (#364). Kept free of React so it can be tested.

export type BannerState = "hidden" | "wrong" | "switched";

/** How long "Switched to Sepolia" stays before the banner folds away */
export const SWITCHED_MS = 1000;

/**
 * The banner's next state. `wrong` is whether a connected wallet is on an unsupported network.
 * Coming back to a supported network while the banner shows turns it green ("switched"); a
 * disconnected wallet just hides it.
 */
export function nextBannerState(current: BannerState, wrong: boolean, connected: boolean): BannerState {
  if (wrong) return "wrong";
  if (current === "wrong") return connected ? "switched" : "hidden";
  if (current === "switched" && !connected) return "hidden";
  return current;
}
