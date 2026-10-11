// Check-in specific error messages (#57), on top of the shared transaction errors (#101).

import { getTransactionErrorMessage } from "@/lib/transactions/errors";

export const CHECK_IN_ERRORS = {
  notAuthorized: "This wallet is not an authorized scanner for this event.",
  alreadyUsed: "This ticket has already been used.",
  nonexistent: "This ticket does not exist.",
  userRejected: "The check-in was cancelled in the wallet.",
  insufficientFunds: "The scanner wallet does not have enough ETH to pay for gas.",
  revertedOnChain:
    "The check-in transaction failed on-chain. The ticket may have just been checked in by another scanner.",
  unknown: "Check-in failed. Please try again.",
} as const;

export function getCheckInErrorMessage(err: unknown): string {
  return getTransactionErrorMessage(err, {
    messages: {
      userRejected: CHECK_IN_ERRORS.userRejected,
      insufficientFunds: CHECK_IN_ERRORS.insufficientFunds,
      revertedOnChain: CHECK_IN_ERRORS.revertedOnChain,
      unknown: CHECK_IN_ERRORS.unknown,
    },
    // require() messages from TicketNFT.checkInTicket()
    revertReasons: {
      "Not authorized to check in": CHECK_IN_ERRORS.notAuthorized,
      "Ticket already used": CHECK_IN_ERRORS.alreadyUsed,
    },
    // Custom error from OpenZeppelin's ownerOf()
    customErrors: {
      ERC721NonexistentToken: CHECK_IN_ERRORS.nonexistent,
    },
  });
}
