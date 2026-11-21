// Wallet transaction errors on the organizer manage page (#189-#194). The contract's require()
// messages are turned into something the organizer can act on, like the publish and resale flows.

import { getTransactionErrorMessage } from "@/lib/transactions/errors";

export const MANAGE_ERRORS = {
  userRejected: "The transaction was cancelled in your wallet. Nothing changed.",
  revertedOnChain: "The transaction failed on-chain. Nothing changed, but the network fee was spent.",
  unknown: "The transaction failed. Nothing changed; try again.",
  notOrganizerRole: "This wallet doesn't have the organizer role on the contract. An admin grants it when they approve your organizer request.",
  notEventOrganizer: "Only the wallet that created this event on-chain can manage it. Connect that wallet and try again.",
  noRevenue: "There's no revenue to withdraw yet. Sales revenue appears here as tickets are bought.",
  notEnoughTickets: "There aren't enough tickets left of this type for that many recipients. Lower the number and try again.",
  batchTooLarge: "At most 100 wallets can be handled in one transaction.",
  noRecipients: "Enter at least one wallet to receive a ticket.",
  noTicketTypes: "This event has no ticket types on-chain yet. Finish publishing it first.",
  ended: "Ticket sales have ended for this event.",
  notAuthorized: "This wallet isn't allowed to check in tickets for this event.",
} as const;

export function getManageTransactionErrorMessage(err: unknown): string {
  return getTransactionErrorMessage(err, {
    messages: {
      userRejected: MANAGE_ERRORS.userRejected,
      revertedOnChain: MANAGE_ERRORS.revertedOnChain,
      unknown: MANAGE_ERRORS.unknown,
    },
    customErrors: {
      AccessControlUnauthorizedAccount: MANAGE_ERRORS.notOrganizerRole,
    },
    revertReasons: {
      "Not the event organizer": MANAGE_ERRORS.notEventOrganizer,
      "No revenue to withdraw": MANAGE_ERRORS.noRevenue,
      "Not enough tickets left": MANAGE_ERRORS.notEnoughTickets,
      "Batch size cannot exceed 100": MANAGE_ERRORS.batchTooLarge,
      "Must issue at least one ticket": MANAGE_ERRORS.noRecipients,
      "Must provide at least one address": MANAGE_ERRORS.noRecipients,
      "No ticket types": MANAGE_ERRORS.noTicketTypes,
      "Event has ended": MANAGE_ERRORS.ended,
      "Not authorized to check in": MANAGE_ERRORS.notAuthorized,
    },
  });
}
