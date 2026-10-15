// Runs one or more contract calls in order and reports every state change (#101).
// Kept free of React so the sequencing can be tested on its own; useTransaction wraps it.

import {
  WaitForTransactionReceiptTimeoutError,
  type Address,
  type Hash,
  type ReplacementReturnType,
  type TransactionReceipt,
} from "viem";
import { TransactionReplacedError, TransactionRevertedError } from "./errors";
import type { TxState, TxStep } from "./types";

export interface TransactionClient {
  simulate: (step: TxStep, account: Address) => Promise<unknown>; // returns the prepared request
  write: (request: unknown) => Promise<Hash>;
  waitForReceipt: (
    hash: Hash,
    options: { timeout?: number; onReplaced: (replacement: ReplacementReturnType) => void }
  ) => Promise<TransactionReceipt>;
}

// How long to wait before telling the user the transaction is taking longer than usual
export const DEFAULT_PENDING_TIMEOUT_MS = 120_000;

export const STOPPED_WAITING_NOTE =
  "Your transaction may still go through. Check your wallet's activity before trying again.";

// Thrown internally when the user stops waiting on a still-pending transaction (#252)
class StoppedWaitingError extends Error {
  constructor() {
    super("Stopped waiting for the transaction");
    this.name = "StoppedWaitingError";
  }
}

// Rejects as soon as the signal is aborted, so the UI responds immediately
function rejectOnAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new StoppedWaitingError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new StoppedWaitingError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      }
    );
  });
}

interface RunParams {
  steps: TxStep[];
  account: Address;
  client: TransactionClient;
  onUpdate: (state: TxState) => void;
  getErrorMessage: (err: unknown) => string;
  timeoutMs?: number;
  stopSignal?: AbortSignal; // aborting it stops waiting on a still-pending transaction (#252)
}

// Resolves to true if every step succeeded.
export async function runTransactionSteps({
  steps,
  account,
  client,
  onUpdate,
  getErrorMessage,
  timeoutMs = DEFAULT_PENDING_TIMEOUT_MS,
  stopSignal,
}: RunParams): Promise<boolean> {
  const labels = steps.map((s) => s.label);
  let state: TxState = { phase: "preparing", steps: labels, stepIndex: 0, hash: null, error: null, note: null };
  let finished = false; // after stopping, late updates (e.g. a replacement) must not change the state
  const update = (patch: Partial<TxState>) => {
    if (finished) return;
    state = { ...state, ...patch };
    onUpdate(state);
  };

  // Waits for the receipt, following replacements done in the wallet (#104):
  // - sped up (repriced): same action, new hash, so keep tracking the new transaction
  // - cancelled or replaced: the action won't happen, so fail with a clear message
  // A timeout is not a failure: a slow transaction can still confirm, so the user is told
  // it is still pending (and not to resend it) while we keep waiting.
  async function waitForConfirmation(hash: Hash): Promise<TransactionReceipt> {
    let replacedBy: "cancelled" | "replaced" | null = null;
    const onReplaced = (replacement: ReplacementReturnType) => {
      if (replacement.reason === "repriced") {
        update({
          hash: replacement.transaction.hash,
          note: "The transaction was sped up in your wallet. Tracking the new one.",
        });
      } else {
        replacedBy = replacement.reason;
      }
    };

    let receipt: TransactionReceipt;
    try {
      receipt = await client.waitForReceipt(hash, { timeout: timeoutMs, onReplaced });
    } catch (err) {
      if (!(err instanceof WaitForTransactionReceiptTimeoutError)) throw err;
      update({ phase: "stillPending" });
      // Keep waiting with no overall limit, in rounds of `timeoutMs`, until it confirms or the
      // user stops waiting (#252). Rounds let the background polling end after a stop.
      for (;;) {
        try {
          receipt = await rejectOnAbort(client.waitForReceipt(hash, { timeout: timeoutMs, onReplaced }), stopSignal);
          break;
        } catch (roundErr) {
          if (!(roundErr instanceof WaitForTransactionReceiptTimeoutError)) throw roundErr;
        }
      }
      update({ phase: "confirming" });
    }

    if (replacedBy) throw new TransactionReplacedError(replacedBy);
    return receipt;
  }

  try {
    for (let i = 0; i < steps.length; i++) {
      // Simulate first: a call that would revert fails here, before the wallet pops up
      update({ phase: "preparing", stepIndex: i, hash: null, note: null });
      const request = await client.simulate(steps[i], account);

      update({ phase: "awaitingWallet" });
      const hash = await client.write(request);

      update({ phase: "confirming", hash });
      const receipt = await waitForConfirmation(hash);

      // Mined, but the contract reverted (e.g. state changed between simulation and mining).
      // A later step must not run, so stop the sequence here (#103).
      if (receipt.status !== "success") {
        throw new TransactionRevertedError(hash);
      }
    }

    update({ phase: "success", note: null });
    finished = true;
    return true;
  } catch (err) {
    if (err instanceof StoppedWaitingError) {
      // Back to the form: the transaction may still confirm, so warn before a retry (#252)
      update({ phase: "stoppedWaiting", error: null, note: STOPPED_WAITING_NOTE });
      finished = true;
      return false;
    }
    console.error(`Transaction failed at step "${labels[state.stepIndex]}":`, err);
    update({ phase: "error", error: getErrorMessage(err) });
    finished = true;
    return false;
  }
}
