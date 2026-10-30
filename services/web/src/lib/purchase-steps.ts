// The two step rows under the order summary (#147): "1. Approve USDC" and "2. Buy tickets".
// Maps the transaction runner's state (#101) to what each row shows, matching the Figma status
// frames (Approving, Buying, Still pending, Success, Failed). Kept free of React so it can be tested.

import type { TxState } from "@/lib/transactions/types";

export type StepStatus = "notStarted" | "waiting" | "inProgress" | "pending" | "done" | "failed";

export interface PurchaseStep {
  label: string;
  status: StepStatus;
}

export const APPROVE_STEP_LABEL = "Approve USDC";
export const BUY_STEP_LABEL = "Buy tickets";

// approvalNeeded: whether the current allowance is too low for this order (before any run)
export function getPurchaseSteps(state: TxState, approvalNeeded: boolean): PurchaseStep[] {
  const rows = [APPROVE_STEP_LABEL, BUY_STEP_LABEL];

  if (state.phase === "idle") {
    return [
      // An earlier approval already covers this order, so only the buy step will run
      { label: APPROVE_STEP_LABEL, status: approvalNeeded ? "notStarted" : "done" },
      { label: BUY_STEP_LABEL, status: "notStarted" },
    ];
  }

  // A run without the approve step only has "Buy tickets", so its step 0 is the second row
  const offset = state.steps.length === 1 ? 1 : 0;
  const active = state.stepIndex + offset;

  return rows.map((label, row) => {
    if (state.phase === "success" || row < active) return { label, status: "done" };
    if (row > active) return { label, status: state.phase === "error" ? "notStarted" : "waiting" };
    switch (state.phase) {
      case "error":
        return { label, status: "failed" };
      case "stillPending":
      case "stoppedWaiting":
        return { label, status: "pending" };
      default: // preparing, awaitingWallet, confirming
        return { label, status: "inProgress" };
    }
  });
}

// True while the approve step is the one running (for the button text and the caption under it)
export function isApproving(state: TxState): boolean {
  return state.steps.length > 1 && state.stepIndex === 0;
}
