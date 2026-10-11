// Runs one or more contract calls in order and reports every state change (#101).
// Kept free of React so the sequencing can be tested on its own; useTransaction wraps it.

import type { Address, Hash, TransactionReceipt } from "viem";
import type { TxState, TxStep } from "./types";

export interface TransactionClient {
  simulate: (step: TxStep, account: Address) => Promise<unknown>; // returns the prepared request
  write: (request: unknown) => Promise<Hash>;
  waitForReceipt: (hash: Hash) => Promise<TransactionReceipt>;
}

interface RunParams {
  steps: TxStep[];
  account: Address;
  client: TransactionClient;
  onUpdate: (state: TxState) => void;
  getErrorMessage: (err: unknown) => string;
}

// Resolves to true if every step succeeded.
export async function runTransactionSteps({
  steps,
  account,
  client,
  onUpdate,
  getErrorMessage,
}: RunParams): Promise<boolean> {
  const labels = steps.map((s) => s.label);
  let state: TxState = { phase: "preparing", steps: labels, stepIndex: 0, hash: null, error: null };
  const update = (patch: Partial<TxState>) => {
    state = { ...state, ...patch };
    onUpdate(state);
  };

  try {
    for (let i = 0; i < steps.length; i++) {
      // Simulate first: a call that would revert fails here, before the wallet pops up
      update({ phase: "preparing", stepIndex: i, hash: null });
      const request = await client.simulate(steps[i], account);

      update({ phase: "awaitingWallet" });
      const hash = await client.write(request);

      update({ phase: "confirming", hash });
      await client.waitForReceipt(hash);
    }

    update({ phase: "success" });
    return true;
  } catch (err) {
    console.error(`Transaction failed at step "${labels[state.stepIndex]}":`, err);
    update({ phase: "error", error: getErrorMessage(err) });
    return false;
  }
}
