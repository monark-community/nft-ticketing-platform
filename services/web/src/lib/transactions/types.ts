// Shared types for blockchain transactions (#101).

import type { Abi, Address, Hash } from "viem";

// Where a transaction (or a sequence of them) currently is.
export type TxPhase =
  | "idle"
  | "preparing" // simulating, to catch reverts before the wallet opens
  | "awaitingWallet" // waiting for the user to confirm in their wallet
  | "confirming" // sent, waiting to be included in a block
  | "stillPending" // past the timeout but not failed: it may still confirm, so don't resend (#104)
  | "success"
  | "error";

// One contract call. A flow like buying tickets is several steps
// (approve USDC, then buyTickets), run one after the other.
export interface TxStep {
  label: string; // shown to the user, e.g. "Approve USDC"
  request: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
  };
}

export interface TxState {
  phase: TxPhase;
  steps: string[]; // labels of all steps in this run
  stepIndex: number; // which step is active (0-based)
  hash: Hash | null; // hash of the active step's transaction, once sent
  error: string | null;
  note: string | null; // extra info, e.g. the transaction was sped up in the wallet
}

export const IDLE_TX_STATE: TxState = {
  phase: "idle",
  steps: [],
  stepIndex: 0,
  hash: null,
  error: null,
  note: null,
};
