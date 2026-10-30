// Purchase-specific error messages (#147), on top of the shared transaction errors (#101).
// The checks in purchase-checks.ts catch most problems before the wallet opens; these cover
// what can still change while the user is confirming (someone buys the last tickets, etc.).

import { getTransactionErrorMessage } from "@/lib/transactions/errors";

export const PURCHASE_ERRORS = {
  userRejected: "The purchase was cancelled in your wallet. You were not charged.",
  insufficientFunds: "Your wallet doesn't have enough ETH to pay the network fee.",
  revertedOnChain:
    "The purchase failed on-chain, so no tickets were minted and no USDC was taken. The network fee was spent.",
  notEnoughLeft:
    "Someone bought the last tickets of this type while you were confirming. Lower the quantity or choose another ticket type.",
  walletLimit: "This purchase would take you over the event's ticket limit per wallet.",
  notWhitelisted: "Presale is open to the guest list only, and this wallet isn't on it.",
  saleNotActive: "Ticket sales for this event were paused while you were confirming.",
  eventEnded: "Ticket sales for this event have ended.",
  unknown: "The purchase failed. Please try again.",
} as const;

export function getPurchaseErrorMessage(err: unknown): string {
  return getTransactionErrorMessage(err, {
    messages: {
      userRejected: PURCHASE_ERRORS.userRejected,
      insufficientFunds: PURCHASE_ERRORS.insufficientFunds,
      revertedOnChain: PURCHASE_ERRORS.revertedOnChain,
      unknown: PURCHASE_ERRORS.unknown,
    },
    // require() messages from TicketNFT.buyTickets()
    revertReasons: {
      "Not enough tickets left": PURCHASE_ERRORS.notEnoughLeft,
      "Per-wallet limit reached": PURCHASE_ERRORS.walletLimit,
      "Address not whitelisted for presale": PURCHASE_ERRORS.notWhitelisted,
      "Sale is not active": PURCHASE_ERRORS.saleNotActive,
      "Event has ended": PURCHASE_ERRORS.eventEnded,
    },
  });
}
