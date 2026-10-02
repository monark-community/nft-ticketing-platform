// Turns errors from checkInTicket() into messages venue staff can act on (#57).

import {
  BaseError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  UserRejectedRequestError,
} from "viem";

export const CHECK_IN_ERRORS = {
  notAuthorized: "This wallet is not an authorized scanner for this event.",
  alreadyUsed: "This ticket has already been used.",
  nonexistent: "This ticket does not exist.",
  userRejected: "The check-in was cancelled in the wallet.",
  insufficientGas:
    "The scanner wallet does not have enough ETH to pay for gas.",
  revertedOnChain:
    "The check-in transaction failed on-chain. The ticket may have just been checked in by another scanner.",
  unknown: "Check-in failed. Please try again.",
} as const;

// Different nodes word these errors differently (Hardhat: "Sender doesn't have enough funds",
// most RPCs: "insufficient funds"), and viem sometimes wraps them as contract errors.
// So check the wording first, before treating anything as a contract revert.
const USER_REJECTED_PATTERN = /user (rejected|denied)/i;
const INSUFFICIENT_FUNDS_PATTERN =
  /insufficient funds|(doesn't|does not) have enough funds|exceeds (the )?balance|exceeds transaction sender account balance/i;

export function getCheckInErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (
    (err instanceof BaseError &&
      err.walk((e) => e instanceof UserRejectedRequestError)) ||
    USER_REJECTED_PATTERN.test(message)
  ) {
    return CHECK_IN_ERRORS.userRejected;
  }
  if (
    (err instanceof BaseError &&
      err.walk((e) => e instanceof InsufficientFundsError)) ||
    INSUFFICIENT_FUNDS_PATTERN.test(message)
  ) {
    return CHECK_IN_ERRORS.insufficientGas;
  }

  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      // Custom error from OpenZeppelin's ownerOf()
      if (revert.data?.errorName === "ERC721NonexistentToken") {
        return CHECK_IN_ERRORS.nonexistent;
      }
      // require() messages from TicketNFT.checkInTicket()
      const reason = revert.reason ?? "";
      if (reason.includes("Not authorized to check in"))
        return CHECK_IN_ERRORS.notAuthorized;
      if (reason.includes("Ticket already used"))
        return CHECK_IN_ERRORS.alreadyUsed;
      if (reason) return `Check-in was rejected by the contract: ${reason}`;
    }
  }

  return CHECK_IN_ERRORS.unknown;
}
