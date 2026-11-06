import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  UserRejectedRequestError,
  type Abi,
} from "viem";
import { describe, expect, it } from "vitest";

import { getCancelErrorMessage, getListErrorMessage, getResaleBuyErrorMessage, RESALE_ERRORS } from "@/lib/resale-errors";

// Marketplace reverts and wallet errors map to messages the user can act on (#295)

const abi = [{ type: "error", name: "Error", inputs: [{ name: "message", type: "string" }] }] as const satisfies Abi;

// The error viem throws when simulating a TicketNFT call that would revert with a require() message
function revert(functionName: string, reason: string) {
  const data = encodeErrorResult({ abi, errorName: "Error", args: [reason] });
  return new ContractFunctionExecutionError(new ContractFunctionRevertedError({ abi, data, functionName }), {
    abi,
    functionName,
    args: [BigInt(1)],
  });
}

const rejected = () => new UserRejectedRequestError(new Error("User rejected the request."));

describe("getResaleBuyErrorMessage", () => {
  it.each([
    ["Listing price changed", RESALE_ERRORS.priceChanged],
    ["Ticket is not listed", RESALE_ERRORS.notListed],
    ["Royalty changed since listing", RESALE_ERRORS.royaltyChanged],
    ["Sale price exceeds maximum resale price", RESALE_ERRORS.overCap],
    ["Per-wallet limit reached", RESALE_ERRORS.walletLimit],
    ["Cannot buy your own ticket", RESALE_ERRORS.ownTicket],
  ])('maps the "%s" revert', (reason, message) => {
    expect(getResaleBuyErrorMessage(revert("buyResaleTicket", reason))).toBe(message);
  });

  it("says the buyer wasn't charged when they cancel in the wallet", () => {
    expect(getResaleBuyErrorMessage(rejected())).toBe(RESALE_ERRORS.buyRejected);
  });

  it("gives the generic message for anything else", () => {
    expect(getResaleBuyErrorMessage(new Error("Something unexpected happened"))).toBe(RESALE_ERRORS.buyFailed);
  });
});

describe("getListErrorMessage", () => {
  it.each([
    ["Sale price exceeds maximum resale price", RESALE_ERRORS.overMax],
    ["You do not own this ticket", RESALE_ERRORS.notOwner],
    ["Price must be greater than zero", RESALE_ERRORS.zeroPrice],
  ])('maps the "%s" revert', (reason, message) => {
    expect(getListErrorMessage(revert("listForResale", reason))).toBe(message);
  });

  it("says nothing changed when the seller cancels in the wallet", () => {
    expect(getListErrorMessage(rejected())).toBe(RESALE_ERRORS.listRejected);
  });
});

describe("getCancelErrorMessage", () => {
  it("explains a listing that isn't the seller's anymore", () => {
    expect(getCancelErrorMessage(revert("cancelListing", "Not the seller of this listing"))).toBe(RESALE_ERRORS.notSeller);
  });

  it("says the ticket is still listed when the seller stops in the wallet", () => {
    expect(getCancelErrorMessage(rejected())).toBe(RESALE_ERRORS.cancelRejected);
  });
});
