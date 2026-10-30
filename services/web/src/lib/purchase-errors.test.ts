import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  UserRejectedRequestError,
  type Abi,
} from "viem";
import { describe, expect, it } from "vitest";
import { getPurchaseErrorMessage, PURCHASE_ERRORS } from "@/lib/purchase-errors";

// buyTickets() reverts and wallet errors map to purchase messages (#147).

const abi = [{ type: "error", name: "Error", inputs: [{ name: "message", type: "string" }] }] as const satisfies Abi;

// The error viem throws when simulating buyTickets() would revert with a require() message
function buyRevert(reason: string) {
  const data = encodeErrorResult({ abi, errorName: "Error", args: [reason] });
  return new ContractFunctionExecutionError(new ContractFunctionRevertedError({ abi, data, functionName: "buyTickets" }), {
    abi,
    functionName: "buyTickets",
    args: [BigInt(1), BigInt(0), BigInt(2)],
  });
}

describe("getPurchaseErrorMessage", () => {
  it("says the user was not charged when they cancel in the wallet", () => {
    expect(getPurchaseErrorMessage(new UserRejectedRequestError(new Error("User rejected the request.")))).toBe(
      PURCHASE_ERRORS.userRejected,
    );
  });

  it.each([
    ["Not enough tickets left", PURCHASE_ERRORS.notEnoughLeft],
    ["Per-wallet limit reached", PURCHASE_ERRORS.walletLimit],
    ["Address not whitelisted for presale", PURCHASE_ERRORS.notWhitelisted],
    ["Sale is not active", PURCHASE_ERRORS.saleNotActive],
    ["Event has ended", PURCHASE_ERRORS.eventEnded],
  ])('maps the "%s" revert', (reason, message) => {
    expect(getPurchaseErrorMessage(buyRevert(reason))).toBe(message);
  });

  it("gives the generic purchase message for anything else", () => {
    expect(getPurchaseErrorMessage(new Error("Something unexpected happened"))).toBe(PURCHASE_ERRORS.unknown);
  });
});
