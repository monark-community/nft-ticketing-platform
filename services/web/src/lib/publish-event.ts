// Publishing a new event (#193): freeze it in the API (IPFS), set it up on TicketNFT, then
// publish it in the API. Kept free of React so the plan can be unit tested.

import { keccak256, stringToHex } from "viem";

import { localInputFromMs, type ChainSettings, type SaleRulesForm } from "@/lib/create-event";
import { getTransactionErrorMessage } from "@/lib/transactions/errors";

// The contract lets an organizer pick any unused event ID. Deriving it from the API's event id
// makes it unique and the same every time, so a publish that stopped halfway carries on with the
// same on-chain event. 48 bits keeps it inside the API's BigInt column and JavaScript numbers.
export function contractEventIdFor(apiEventId: string): bigint {
  const hash = keccak256(stringToHex(`nftokenpass:event:${apiEventId}`));
  const id = BigInt(`0x${hash.slice(2, 14)}`);
  return id === BigInt(0) ? BigInt(1) : id;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// What TicketNFT has for the event ID (eventOrganizer, eventConfigs, royaltyPercentage,
// presaleActive and each ticket type's metadata URI)
export interface ChainEventState {
  organizer: string; // the zero address until someone configures this ID
  configured: boolean;
  active: boolean;
  presale: boolean;
  sold: number;
  endTime: bigint;
  royaltyBps: bigint;
  resaleCapBps: bigint;
  perWalletLimit: bigint;
  typeUris: string[]; // one per ticket type added on-chain, in type ID order
}

export function settingsMatch(chain: ChainEventState, wanted: ChainSettings): boolean {
  return (
    chain.configured &&
    chain.endTime === wanted.endTime &&
    chain.royaltyBps === wanted.royaltyBps &&
    chain.resaleCapBps === wanted.resaleCapBps &&
    chain.perWalletLimit === wanted.perWalletLimit
  );
}

// The rules the contract has, as the form shows them. Used when the browser that saved the
// rules isn't this one, and when tickets already sold so the contract's rules are final.
export function saleRulesFromChain(chain: ChainEventState): SaleRulesForm {
  return {
    perWalletLimit: chain.perWalletLimit.toString(),
    salesEnd: localInputFromMs(Number(chain.endTime) * 1000),
    resaleCapBps: Number(chain.resaleCapBps),
    royaltyPercent: String(Number(chain.royaltyBps) / 100),
    presale: chain.presale,
  };
}

export type PublishBlock =
  | "idTaken" // another wallet configured this event ID
  | "rulesLocked" // tickets sold, and the form's rules differ from the contract's
  | "typesMismatch"; // the contract's ticket types don't match the frozen ones

export interface PublishPlan {
  blocked: PublishBlock | null;
  freeze: boolean;
  configure: boolean;
  addTypesFrom: number; // first ticket type (in API creation order) still to add on-chain
  setPresale: boolean | null; // presale to set, or null when it's already right
  openSales: boolean;
  publish: boolean; // the API call that makes the event public
}

// What's left to do, from the API status and the contract. Each step is skipped once it has
// happened, so pressing the button again after a failure picks up where it stopped.
export function planPublish(input: {
  status: "DRAFT" | "FROZEN" | "PUBLISHED";
  wallet: string;
  chain: ChainEventState;
  wanted: ChainSettings;
  typeUris: (string | null)[]; // ipfs:// URI of each API ticket type, in creation order (null before freeze)
  presale: boolean;
}): PublishPlan {
  const { status, chain, wanted } = input;
  const plan: PublishPlan = {
    blocked: null,
    freeze: status === "DRAFT",
    configure: !settingsMatch(chain, wanted),
    addTypesFrom: chain.typeUris.length,
    setPresale: chain.presale === input.presale ? null : input.presale,
    openSales: !chain.active,
    publish: status !== "PUBLISHED",
  };

  if (chain.organizer !== ZERO_ADDRESS && chain.organizer.toLowerCase() !== input.wallet.toLowerCase()) {
    return { ...plan, blocked: "idTaken" };
  }
  if (plan.configure && chain.sold > 0) return { ...plan, blocked: "rulesLocked" };

  // Type IDs follow the API's creation order. A type the contract has must be the same frozen
  // type (same metadata URI), and it can't have more types than the event.
  const tooMany = chain.typeUris.length > input.typeUris.length;
  const different = chain.typeUris.some((uri, i) => input.typeUris[i] !== uri);
  if (tooMany || (!plan.freeze && different)) return { ...plan, blocked: "typesMismatch" };
  return plan;
}

export function hasWorkLeft(plan: PublishPlan, ticketTypes: number): boolean {
  return plan.freeze || plan.configure || plan.addTypesFrom < ticketTypes || plan.setPresale !== null || plan.openSales || plan.publish;
}

// The four rows of "What happens next" in Figma
export const PUBLISH_STAGES = [
  { key: "freeze", label: "Freeze details (upload to IPFS)" },
  { key: "configure", label: "Create the event on-chain" },
  { key: "ticketTypes", label: "Add ticket types on-chain" },
  { key: "publish", label: "Publish" },
] as const;
export type PublishStage = (typeof PUBLISH_STAGES)[number]["key"];

export type StageStatus = "done" | "ready" | "waiting" | "active" | "failed";

// Which rows are done, from the plan. The first row that isn't done is "ready".
export function stageStatuses(plan: PublishPlan | null, ticketTypes: number, current: { stage: PublishStage; failed: boolean } | null): Record<PublishStage, StageStatus> {
  const done: Record<PublishStage, boolean> = plan
    ? {
        freeze: !plan.freeze,
        configure: !plan.freeze && !plan.configure,
        ticketTypes: !plan.freeze && !plan.configure && plan.addTypesFrom >= ticketTypes,
        publish: !hasWorkLeft(plan, ticketTypes),
      }
    : { freeze: false, configure: false, ticketTypes: false, publish: false };

  const result = {} as Record<PublishStage, StageStatus>;
  let readyGiven = false;
  for (const { key } of PUBLISH_STAGES) {
    if (current?.stage === key) {
      result[key] = current.failed ? "failed" : "active";
      readyGiven = true;
    } else if (done[key]) {
      result[key] = "done";
    } else if (!readyGiven && !current) {
      result[key] = "ready";
      readyGiven = true;
    } else {
      result[key] = "waiting";
    }
  }
  return result;
}

// Wallet labels for each transaction, mapped back to a Figma row
export const TX_LABELS = {
  configure: "Create the event on-chain",
  addType: (name: string) => `Add ticket type: ${name}`,
  presaleOn: "Start the presale",
  presaleOff: "Turn off the presale",
  openSales: "Open ticket sales",
} as const;

export function stageForTxLabel(label: string): PublishStage {
  if (label === TX_LABELS.configure) return "configure";
  if (label.startsWith("Add ticket type")) return "ticketTypes";
  return "publish";
}

export const PUBLISH_ERRORS = {
  userRejected: "The transaction was cancelled in your wallet. Nothing else changed: press Continue publishing to pick up from this step.",
  revertedOnChain: "The transaction failed on-chain. The network fee was spent, but nothing changed. Press Continue publishing to try this step again.",
  unknown: "This step failed. Press Continue publishing to try it again.",
  notOrganizerRole: "This wallet doesn't have the organizer role on the contract. An admin grants it when they approve your organizer request.",
  notEventOrganizer: "This event ID belongs to another wallet on the contract. Connect the wallet that created the event.",
  endInPast: "The sales end time has passed. Change it in Sale rules, then publish again.",
  rulesLocked: "Tickets have already sold, so the sale rules can't change on-chain anymore.",
  noTypes: "The event has no ticket types on-chain yet.",
} as const;

export function getPublishErrorMessage(err: unknown): string {
  return getTransactionErrorMessage(err, {
    messages: {
      userRejected: PUBLISH_ERRORS.userRejected,
      revertedOnChain: PUBLISH_ERRORS.revertedOnChain,
      unknown: PUBLISH_ERRORS.unknown,
    },
    customErrors: { AccessControlUnauthorizedAccount: PUBLISH_ERRORS.notOrganizerRole },
    revertReasons: {
      "Not the event organizer": PUBLISH_ERRORS.notEventOrganizer,
      "End time must be in the future": PUBLISH_ERRORS.endInPast,
      "Event terms locked": PUBLISH_ERRORS.rulesLocked,
      "No ticket types": PUBLISH_ERRORS.noTypes,
    },
  });
}

// Errors from the API steps (freeze and publish), by the API's own messages
export function getApiStepErrorMessage(stage: "freeze" | "publish", err: unknown): string {
  const text = err instanceof Error ? err.message : "";
  if (/PINATA_JWT is not configured/.test(text)) {
    return "The server can't upload to IPFS right now (its Pinata key isn't set up). Nothing was frozen. Try again later.";
  }
  if (/Failed to pin/.test(text)) return "The upload to IPFS failed. Nothing was frozen. Try again in a moment.";
  if (/Unsupported file type|maximum allowed size|File too large/i.test(text)) {
    return "The cover image was rejected. Use a PNG, JPG or WebP image of 10 MB or less.";
  }
  if (/Add at least one ticket type/.test(text)) return "Add at least one ticket type before publishing.";
  if (/Forbidden: requires/.test(text)) return "Your account isn't an organizer, or your access changed. Sign in again, then try again.";
  if (/Failed to fetch|NetworkError|network/i.test(text)) return "Could not reach the server. Check your connection and try again.";
  return stage === "freeze" ? "Freezing the event failed. Nothing was locked. Try again." : "Publishing failed on the server. The event is set up on-chain; press Continue publishing to try again.";
}
