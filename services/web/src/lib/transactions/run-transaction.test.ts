import {
  WaitForTransactionReceiptTimeoutError,
  type Hash,
  type ReplacementReturnType,
  type TransactionReceipt,
} from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTransactionErrorMessage, TX_ERRORS } from "@/lib/transactions/errors";
import {
  runTransactionSteps,
  STOPPED_WAITING_NOTE,
  type TransactionClient,
} from "@/lib/transactions/run-transaction";
import type { TxState, TxStep } from "@/lib/transactions/types";

// The transaction runner's steps, timeout and stop waiting, with a fake client (#271).

const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const HASH_1 = "0x1111111111111111111111111111111111111111111111111111111111111111";
const HASH_2 = "0x2222222222222222222222222222222222222222222222222222222222222222";
const SPED_UP_HASH = "0x9999999999999999999999999999999999999999999999999999999999999999";

const step = (label: string): TxStep => ({
  label,
  request: { address: ACCOUNT, abi: [], functionName: label },
});

const receipt = (status: "success" | "reverted") => ({ status }) as TransactionReceipt;

const timeout = (hash: Hash) => new WaitForTransactionReceiptTimeoutError({ hash });

const replacement = (reason: ReplacementReturnType["reason"], hash: Hash = SPED_UP_HASH) =>
  ({ reason, transaction: { hash } }) as unknown as ReplacementReturnType;

type WaitForReceipt = TransactionClient["waitForReceipt"];

// A client where every step simulates and sends fine, and confirms right away by default
function fakeClient(waitForReceipt?: WaitForReceipt) {
  const hashes = [HASH_1, HASH_2];
  let sent = 0;
  return {
    simulate: vi.fn(async (s: TxStep) => s.label),
    write: vi.fn(async () => hashes[sent++] as Hash),
    waitForReceipt: vi.fn<WaitForReceipt>(waitForReceipt ?? (async () => receipt("success"))),
  };
}

// A promise the test resolves itself, for transactions that are still pending
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function run(
  client: TransactionClient,
  options: { steps?: TxStep[]; stopSignal?: AbortSignal; onUpdate?: (s: TxState) => void } = {},
) {
  const states: TxState[] = [];
  const done = runTransactionSteps({
    steps: options.steps ?? [step("buy")],
    account: ACCOUNT,
    client,
    onUpdate: (s) => {
      states.push(s);
      options.onUpdate?.(s);
    },
    getErrorMessage: (err) => getTransactionErrorMessage(err),
    timeoutMs: 1000,
    stopSignal: options.stopSignal,
  });
  const phases = () => states.map((s) => s.phase);
  const last = () => states[states.length - 1];
  return { done, states, phases, last };
}

beforeEach(() => {
  // Failures are logged on purpose; keep the test output clean
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runTransactionSteps", () => {
  it("runs every step in order and ends in success", async () => {
    const client = fakeClient();
    const { done, phases, last } = run(client, { steps: [step("approve"), step("buy")] });

    expect(await done).toBe(true);
    expect(phases()).toEqual([
      "preparing", "awaitingWallet", "confirming",
      "preparing", "awaitingWallet", "confirming",
      "success",
    ]);
    expect(client.write).toHaveBeenCalledTimes(2);
    expect(last()).toMatchObject({ phase: "success", stepIndex: 1, hash: HASH_2, error: null });
  });

  it("does not open the wallet when the simulation fails", async () => {
    const client = fakeClient();
    client.simulate.mockRejectedValueOnce(new Error("insufficient funds for gas"));
    const { done, phases, last } = run(client);

    expect(await done).toBe(false);
    expect(client.write).not.toHaveBeenCalled();
    expect(phases()).not.toContain("awaitingWallet");
    expect(last()).toMatchObject({ phase: "error", error: TX_ERRORS.insufficientFunds });
  });

  it("fails when the transaction is mined but reverted, and skips the next step", async () => {
    const client = fakeClient(async () => receipt("reverted"));
    const { done, last } = run(client, { steps: [step("approve"), step("buy")] });

    expect(await done).toBe(false);
    expect(client.simulate).toHaveBeenCalledTimes(1);
    expect(last()).toMatchObject({ phase: "error", stepIndex: 0, error: TX_ERRORS.revertedOnChain });
  });

  it("keeps tracking the new transaction when it is sped up in the wallet", async () => {
    const client = fakeClient(async (_hash, { onReplaced }) => {
      onReplaced(replacement("repriced"));
      return receipt("success");
    });
    const { done, states, last } = run(client);

    expect(await done).toBe(true);
    expect(states).toContainEqual(
      expect.objectContaining({
        hash: SPED_UP_HASH,
        note: "The transaction was sped up in your wallet. Tracking the new one.",
      }),
    );
    expect(last().phase).toBe("success");
  });

  it.each([
    ["cancelled", TX_ERRORS.cancelled],
    ["replaced", TX_ERRORS.replaced],
  ] as const)("fails when the transaction is %s in the wallet", async (reason, message) => {
    const client = fakeClient(async (_hash, { onReplaced }) => {
      onReplaced(replacement(reason));
      return receipt("success");
    });
    const { done, last } = run(client);

    expect(await done).toBe(false);
    expect(last()).toMatchObject({ phase: "error", error: message });
  });

  it("reports still pending after the timeout, then succeeds when it confirms", async () => {
    const client = fakeClient();
    client.waitForReceipt
      .mockRejectedValueOnce(timeout(HASH_1))
      .mockRejectedValueOnce(timeout(HASH_1)) // a second round still not mined
      .mockResolvedValueOnce(receipt("success"));
    const { done, phases } = run(client);

    expect(await done).toBe(true);
    expect(phases()).toEqual([
      "preparing", "awaitingWallet", "confirming",
      "stillPending", "confirming",
      "success",
    ]);
    expect(client.waitForReceipt).toHaveBeenCalledTimes(3);
    expect(client.waitForReceipt).toHaveBeenCalledWith(HASH_1, expect.objectContaining({ timeout: 1000 }));
  });

  it("stops waiting when the user stops while it is still pending", async () => {
    const pending = deferred<TransactionReceipt>();
    const client = fakeClient();
    client.waitForReceipt.mockRejectedValueOnce(timeout(HASH_1)).mockReturnValueOnce(pending.promise);
    const stop = new AbortController();
    const { done, last } = run(client, {
      stopSignal: stop.signal,
      onUpdate: (s) => {
        if (s.phase === "stillPending") stop.abort();
      },
    });

    expect(await done).toBe(false);
    expect(last()).toMatchObject({ phase: "stoppedWaiting", error: null, note: STOPPED_WAITING_NOTE });
  });

  it("ignores the transaction confirming after the user stopped waiting", async () => {
    const pending = deferred<TransactionReceipt>();
    let onReplaced: ((r: ReplacementReturnType) => void) | undefined;
    const client = fakeClient();
    client.waitForReceipt
      .mockRejectedValueOnce(timeout(HASH_1))
      .mockImplementationOnce((_hash, options) => {
        onReplaced = options.onReplaced;
        return pending.promise;
      });
    const stop = new AbortController();
    const { done, states, last } = run(client, { stopSignal: stop.signal });

    await vi.waitFor(() => expect(last().phase).toBe("stillPending"));
    stop.abort();
    expect(await done).toBe(false);
    const countAfterStop = states.length;

    // The wallet speeds it up and it then confirms, after the user already left
    onReplaced?.(replacement("repriced"));
    pending.resolve(receipt("success"));
    await new Promise((r) => setTimeout(r, 0));

    expect(states).toHaveLength(countAfterStop);
    expect(last().phase).toBe("stoppedWaiting");
  });
});
