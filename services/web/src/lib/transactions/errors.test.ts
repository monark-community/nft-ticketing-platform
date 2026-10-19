import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  InsufficientFundsError,
  UserRejectedRequestError,
  type Abi,
} from "viem";
import { describe, expect, it } from "vitest";
import { CHECK_IN_ERRORS, getCheckInErrorMessage } from "@/lib/check-in-errors";
import { getTransactionErrorMessage, TX_ERRORS } from "@/lib/transactions/errors";

// Every known error maps to the right message, and anything else gets the generic one (#272).

// Just the errors checkInTicket() can revert with
const abi = [
  { type: "error", name: "Error", inputs: [{ name: "message", type: "string" }] },
  { type: "error", name: "ERC721NonexistentToken", inputs: [{ name: "tokenId", type: "uint256" }] },
] as const satisfies Abi;

// The error viem throws when simulating checkInTicket() would revert
function checkInRevert(
  ...error: [errorName: "Error", args: [string]] | [errorName: "ERC721NonexistentToken", args: [bigint]]
) {
  const [errorName, args] = error;
  const data = encodeErrorResult({ abi, errorName, args } as Parameters<typeof encodeErrorResult>[0]);
  return new ContractFunctionExecutionError(
    new ContractFunctionRevertedError({ abi, data, functionName: "checkInTicket" }),
    { abi, functionName: "checkInTicket", args: [BigInt(42)] },
  );
}

const userRejected = () => new UserRejectedRequestError(new Error("User rejected the request."));
const insufficientFunds = () => new InsufficientFundsError();
const unknownError = () => new Error("Something unexpected happened");

describe("getTransactionErrorMessage", () => {
  it("maps a wallet rejection", () => {
    expect(getTransactionErrorMessage(userRejected())).toBe(TX_ERRORS.userRejected);
  });

  it("maps insufficient funds", () => {
    expect(getTransactionErrorMessage(insufficientFunds())).toBe(TX_ERRORS.insufficientFunds);
  });

  it("maps Hardhat's wording for insufficient funds", () => {
    const err = new Error("Sender doesn't have enough funds to send tx.");
    expect(getTransactionErrorMessage(err)).toBe(TX_ERRORS.insufficientFunds);
  });

  it("gives the generic message for an unknown error", () => {
    expect(getTransactionErrorMessage(unknownError())).toBe(TX_ERRORS.unknown);
    expect(getTransactionErrorMessage("not even an Error")).toBe(TX_ERRORS.unknown);
  });
});

describe("getCheckInErrorMessage", () => {
  it.each([
    ["a wallet rejection", userRejected(), CHECK_IN_ERRORS.userRejected],
    ["insufficient funds", insufficientFunds(), CHECK_IN_ERRORS.insufficientFunds],
    [
      "a wallet that is not an authorized scanner",
      checkInRevert("Error", ["Not authorized to check in"]),
      CHECK_IN_ERRORS.notAuthorized,
    ],
    [
      "a ticket that was already used",
      checkInRevert("Error", ["Ticket already used"]),
      CHECK_IN_ERRORS.alreadyUsed,
    ],
    [
      "a ticket that does not exist",
      checkInRevert("ERC721NonexistentToken", [BigInt(42)]),
      CHECK_IN_ERRORS.nonexistent,
    ],
    ["an unknown error", unknownError(), CHECK_IN_ERRORS.unknown],
  ])("maps %s", (_name, err, message) => {
    expect(getCheckInErrorMessage(err)).toBe(message);
  });
});
