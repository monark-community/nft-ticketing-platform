// Marketplace error messages (#295), on top of the shared transaction errors (#101).
// The checks in marketplace.ts catch most problems before the wallet opens; these cover what can
// still change while the user is confirming (the seller changes the price, someone buys it first).

import { getTransactionErrorMessage } from "@/lib/transactions/errors";

export const RESALE_ERRORS = {
  buyRejected: "The purchase was cancelled in your wallet. You were not charged.",
  buyReverted: "The purchase failed on-chain, so the ticket wasn't transferred and no USDC was taken. The network fee was spent.",
  priceChanged: "The seller changed the price while you were confirming. Check the new price, then try again.",
  notListed: "Someone else bought this ticket, or the seller took it off the Marketplace, while you were confirming.",
  royaltyChanged: "The organizer changed the royalty after this ticket was listed, so it can't be bought until the seller lists it again.",
  overCap: "This listing is above the event's price cap now, so it can't be bought.",
  walletLimit: "Buying this ticket would take you over the event's ticket limit per wallet.",
  ownTicket: "This is your own listing.",
  buyFailed: "The purchase failed. Please try again.",

  listRejected: "Listing was cancelled in your wallet. Nothing changed.",
  overMax: "The price is above this ticket's maximum resale price.",
  notOwner: "This wallet doesn't own the ticket anymore.",
  zeroPrice: "The price must be more than 0.",
  listFailed: "The ticket couldn't be listed. Please try again.",

  cancelRejected: "Cancelling was stopped in your wallet. The ticket is still listed.",
  notSeller: "This listing isn't yours anymore: the ticket was sold or transferred.",
  cancelFailed: "The listing couldn't be cancelled. Please try again.",
} as const;

// buyResaleTicket(): require() messages from TicketNFT
export function getResaleBuyErrorMessage(err: unknown): string {
  return getTransactionErrorMessage(err, {
    messages: { userRejected: RESALE_ERRORS.buyRejected, revertedOnChain: RESALE_ERRORS.buyReverted, unknown: RESALE_ERRORS.buyFailed },
    revertReasons: {
      "Listing price changed": RESALE_ERRORS.priceChanged,
      "Ticket is not listed": RESALE_ERRORS.notListed,
      "Royalty changed since listing": RESALE_ERRORS.royaltyChanged,
      "Sale price exceeds maximum resale price": RESALE_ERRORS.overCap,
      "Per-wallet limit reached": RESALE_ERRORS.walletLimit,
      "Cannot buy your own ticket": RESALE_ERRORS.ownTicket,
    },
  });
}

// listForResale()
export function getListErrorMessage(err: unknown): string {
  return getTransactionErrorMessage(err, {
    messages: { userRejected: RESALE_ERRORS.listRejected, unknown: RESALE_ERRORS.listFailed },
    revertReasons: {
      "Sale price exceeds maximum resale price": RESALE_ERRORS.overMax,
      "You do not own this ticket": RESALE_ERRORS.notOwner,
      "Price must be greater than zero": RESALE_ERRORS.zeroPrice,
    },
  });
}

// cancelListing()
export function getCancelErrorMessage(err: unknown): string {
  return getTransactionErrorMessage(err, {
    messages: { userRejected: RESALE_ERRORS.cancelRejected, unknown: RESALE_ERRORS.cancelFailed },
    revertReasons: { "Not the seller of this listing": RESALE_ERRORS.notSeller },
  });
}
