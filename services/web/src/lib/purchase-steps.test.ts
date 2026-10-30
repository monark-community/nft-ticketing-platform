import { describe, expect, it } from "vitest";
import { getPurchaseSteps, isApproving } from "@/lib/purchase-steps";
import { IDLE_TX_STATE, type TxState } from "@/lib/transactions/types";

// The step rows for each Figma status frame (#147).

const BOTH = ["Approve USDC", "Buy tickets"];
const BUY_ONLY = ["Buy tickets"];

const state = (patch: Partial<TxState>): TxState => ({ ...IDLE_TX_STATE, steps: BOTH, ...patch });
const statuses = (s: TxState, approvalNeeded = true) => getPurchaseSteps(s, approvalNeeded).map((step) => step.status);

describe("getPurchaseSteps", () => {
  it("Default: nothing started", () => {
    expect(statuses(IDLE_TX_STATE)).toEqual(["notStarted", "notStarted"]);
  });

  it("Default with an earlier approval: approve already done", () => {
    expect(statuses(IDLE_TX_STATE, false)).toEqual(["done", "notStarted"]);
  });

  it("Approving: step 1 in progress, step 2 waiting", () => {
    expect(statuses(state({ phase: "awaitingWallet", stepIndex: 0 }))).toEqual(["inProgress", "waiting"]);
  });

  it("Buying: step 1 done, step 2 in progress", () => {
    expect(statuses(state({ phase: "confirming", stepIndex: 1 }))).toEqual(["done", "inProgress"]);
  });

  it("Buying without an approve step: the buy row is the active one", () => {
    expect(statuses(state({ phase: "confirming", steps: BUY_ONLY, stepIndex: 0 }), false)).toEqual(["done", "inProgress"]);
  });

  it("Still pending: the active step is pending", () => {
    expect(statuses(state({ phase: "stillPending", stepIndex: 1 }))).toEqual(["done", "pending"]);
  });

  it("Success: both done", () => {
    expect(statuses(state({ phase: "success", stepIndex: 1 }))).toEqual(["done", "done"]);
  });

  it("Failed on the buy step: approve done, buy failed", () => {
    expect(statuses(state({ phase: "error", stepIndex: 1 }))).toEqual(["done", "failed"]);
  });

  it("Failed on the approve step: buy not started", () => {
    expect(statuses(state({ phase: "error", stepIndex: 0 }))).toEqual(["failed", "notStarted"]);
  });
});

describe("isApproving", () => {
  it("is true only while the approve step of a two-step run is active", () => {
    expect(isApproving(state({ phase: "awaitingWallet", stepIndex: 0 }))).toBe(true);
    expect(isApproving(state({ phase: "awaitingWallet", stepIndex: 1 }))).toBe(false);
    expect(isApproving(state({ phase: "awaitingWallet", steps: BUY_ONLY, stepIndex: 0 }))).toBe(false);
  });
});
