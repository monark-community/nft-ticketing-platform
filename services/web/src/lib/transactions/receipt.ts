// The lines of the transaction receipt (#364): each step of a transaction prints one more line.
// Kept free of React so it can be tested.

import type { TxState } from "./types";

export type ReceiptTone = "plain" | "ok" | "slow" | "bad";

export interface ReceiptLine {
  key: string; // stable while the line stays on the receipt, so only new lines print
  text: string;
  tone: ReceiptTone;
  busy: boolean; // shows a spinner: this is what is being waited for
  hash?: string; // the "Sent" line links to the transaction
}

/** "0x3a9f…e21c" */
export function shortHash(hash: string) {
  return hash.length > 12 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;
}

/** True once nothing more will print: confirmed, failed, or the user stopped waiting */
export function isReceiptFinished(state: TxState) {
  return state.phase === "success" || state.phase === "error" || state.phase === "stoppedWaiting";
}

/** The receipt's heading: what is being done, and which step of how many when there are several */
export function receiptTitle(state: TxState) {
  const label = state.steps[state.stepIndex] ?? "Transaction";
  return state.steps.length > 1 ? `Step ${state.stepIndex + 1} of ${state.steps.length} · ${label}` : label;
}

/**
 * The lines to show for a transaction's state, oldest first. `walletAsked` is whether the wallet
 * was opened for the current step: a failure before that (the check that runs first) doesn't
 * leave a "Confirm in your wallet" line behind.
 */
export function receiptLines(state: TxState, walletAsked: boolean): ReceiptLine[] {
  if (state.phase === "idle") return [];
  const step = state.stepIndex;
  const line = (kind: string, text: string, tone: ReceiptTone = "plain", busy = false, hash?: string): ReceiptLine => ({
    key: `${step}:${kind}`,
    text,
    tone,
    busy,
    hash,
  });

  // Steps already confirmed take one line each
  const lines: ReceiptLine[] = state.steps.slice(0, step).map((label, index) => ({ key: `${index}:done`, text: `${label} · confirmed`, tone: "ok", busy: false }));

  const wallet = line("wallet", "Confirmed in your wallet");
  const sent = (busy: boolean) => (state.hash ? [line("sent", `Sent · ${shortHash(state.hash)}`, "plain", busy, state.hash)] : []);

  switch (state.phase) {
    case "preparing":
      return [...lines, line("prepare", "Preparing…", "plain", true)];
    case "awaitingWallet":
      return [...lines, line("wallet", "Confirm in your wallet…", "plain", true)];
    case "confirming":
      return [...lines, wallet, ...sent(true)];
    case "stillPending":
      return [...lines, wallet, ...sent(false), line("slow", "Still waiting", "slow", true)];
    case "stoppedWaiting":
      return [...lines, wallet, ...sent(false), line("stopped", "Stopped waiting", "slow")];
    case "success":
      return [...lines, wallet, ...sent(false), line("confirmed", "Confirmed", "ok")];
    case "error": {
      const before = state.hash ? [wallet, ...sent(false)] : walletAsked ? [line("wallet", "Confirm in your wallet")] : [];
      return [...lines, ...before, line("failed", "Failed", "bad")];
    }
  }
}
