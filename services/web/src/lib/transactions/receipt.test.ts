import { describe, expect, it } from "vitest";

import { isReceiptFinished, nextReceiptLine, receiptLines, receiptTitle, shortHash } from "./receipt";
import { IDLE_TX_STATE, type TxState } from "./types";

const HASH = "0x3a9f00000000000000000000000000000000000000000000000000000000e21c" as const;
const state = (patch: Partial<TxState>): TxState => ({ ...IDLE_TX_STATE, steps: ["Approve organizer"], ...patch });
const texts = (s: TxState, walletAsked = true) => receiptLines(s, walletAsked).map((line) => line.text);

describe("shortHash", () => {
  it("keeps the start and the end", () => {
    expect(shortHash(HASH)).toBe("0x3a9f…e21c");
  });
});

describe("receiptLines", () => {
  it("is empty before anything starts", () => {
    expect(receiptLines(IDLE_TX_STATE, false)).toEqual([]);
  });

  it("prints one more line at each step of a transaction that goes through", () => {
    expect(texts(state({ phase: "preparing" }), false)).toEqual(["Preparing…"]);
    expect(texts(state({ phase: "awaitingWallet" }))).toEqual(["Confirm in your wallet…"]);
    expect(texts(state({ phase: "confirming", hash: HASH }))).toEqual(["Confirmed in your wallet", "Sent · 0x3a9f…e21c"]);
    expect(texts(state({ phase: "success", hash: HASH }))).toEqual(["Confirmed in your wallet", "Sent · 0x3a9f…e21c", "Confirmed"]);
  });

  it("keeps the lines already printed: their keys don't change from one step to the next", () => {
    const confirming = receiptLines(state({ phase: "confirming", hash: HASH }), true).map((line) => line.key);
    const done = receiptLines(state({ phase: "success", hash: HASH }), true).map((line) => line.key);
    expect(done.slice(0, 2)).toEqual(confirming);
    expect(receiptLines(state({ phase: "awaitingWallet" }), true)[0].key).toBe(confirming[0]);
  });

  it("shows a spinner only on what is being waited for", () => {
    const busy = (s: TxState) => receiptLines(s, true).filter((line) => line.busy).map((line) => line.text);
    expect(busy(state({ phase: "awaitingWallet" }))).toEqual(["Confirm in your wallet…"]);
    expect(busy(state({ phase: "confirming", hash: HASH }))).toEqual(["Sent · 0x3a9f…e21c"]);
    expect(busy(state({ phase: "stillPending", hash: HASH }))).toEqual(["Still waiting"]);
    expect(busy(state({ phase: "success", hash: HASH }))).toEqual([]);
  });

  it("prints Still waiting in amber when it takes longer than usual, and Stopped waiting after the user stops", () => {
    const slow = receiptLines(state({ phase: "stillPending", hash: HASH }), true);
    expect(slow.at(-1)).toMatchObject({ text: "Still waiting", tone: "slow" });
    const stopped = receiptLines(state({ phase: "stoppedWaiting", hash: HASH }), true);
    expect(stopped.map((line) => line.text)).toEqual(["Confirmed in your wallet", "Sent · 0x3a9f…e21c", "Stopped waiting"]);
  });

  it("prints a red Failed line after a rejection in the wallet, under the wallet line", () => {
    const lines = receiptLines(state({ phase: "error", error: "You rejected the request." }), true);
    expect(lines.map((line) => line.text)).toEqual(["Confirm in your wallet", "Failed"]);
    expect(lines.at(-1)?.tone).toBe("bad");
  });

  it("doesn't mention the wallet when the failure came before it opened", () => {
    expect(texts(state({ phase: "error", error: "Not allowed." }), false)).toEqual(["Failed"]);
  });

  it("keeps the Sent line when the transaction failed after it was sent", () => {
    expect(texts(state({ phase: "error", hash: HASH, error: "Reverted." }))).toEqual(["Confirmed in your wallet", "Sent · 0x3a9f…e21c", "Failed"]);
  });

  it("gives each confirmed step of a sequence one line", () => {
    const buying = state({ steps: ["Approve USDC", "Buy tickets"], stepIndex: 1, phase: "awaitingWallet" });
    expect(texts(buying)).toEqual(["Approve USDC · confirmed", "Confirm in your wallet…"]);
    expect(receiptLines(buying, true)[0].tone).toBe("ok");
  });

  it("links the Sent line to the transaction", () => {
    expect(receiptLines(state({ phase: "confirming", hash: HASH }), true)[1].hash).toBe(HASH);
  });
});

describe("receiptTitle and isReceiptFinished", () => {
  it("names the step, with its number when there are several", () => {
    expect(receiptTitle(state({ phase: "preparing" }))).toBe("Approve organizer");
    expect(receiptTitle(state({ steps: ["Approve USDC", "Buy tickets"], stepIndex: 1, phase: "preparing" }))).toBe("Step 2 of 2 · Buy tickets");
    expect(receiptTitle({ ...IDLE_TX_STATE, phase: "preparing" })).toBe("Transaction");
  });

  it("is finished once confirmed, failed or stopped", () => {
    expect(isReceiptFinished(state({ phase: "success" }))).toBe(true);
    expect(isReceiptFinished(state({ phase: "error" }))).toBe(true);
    expect(isReceiptFinished(state({ phase: "stoppedWaiting" }))).toBe(true);
    expect(isReceiptFinished(state({ phase: "confirming" }))).toBe(false);
    expect(isReceiptFinished(state({ phase: "stillPending" }))).toBe(false);
  });
});

describe("nextReceiptLine", () => {
  it("prints the lines that arrive together one at a time, in order", () => {
    const lines = receiptLines(state({ phase: "success", hash: HASH }), true);
    const keys = lines.map((line) => line.key);
    expect(nextReceiptLine(lines, [])?.text).toBe("Confirmed in your wallet");
    expect(nextReceiptLine(lines, keys.slice(0, 1))?.text).toBe("Sent · 0x3a9f…e21c");
    expect(nextReceiptLine(lines, keys.slice(0, 2))?.text).toBe("Confirmed");
    expect(nextReceiptLine(lines, keys)).toBeNull();
  });

  it("doesn't wait for a line that has gone: a line that changed in place keeps its turn", () => {
    // "Confirm in your wallet…" became "Confirmed in your wallet": the same line, already printed
    const asked = receiptLines(state({ phase: "awaitingWallet" }), true).map((line) => line.key);
    expect(nextReceiptLine(receiptLines(state({ phase: "confirming", hash: HASH }), true), asked)?.text).toBe("Sent · 0x3a9f…e21c");
  });
});
