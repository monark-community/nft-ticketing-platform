// Checks run before a ticket purchase (#149), so the page can explain why buying is blocked
// instead of letting the wallet open a transaction the contract would reject.
// Kept free of React so every rule can be unit tested.

import { formatEth, formatTokenAmount } from "@/lib/token-amount";
import type { AlertTone } from "@/components/ui/alert";

// buyTickets() accepts at most 100 tickets per call
export const MAX_TICKETS_PER_PURCHASE = 100;

// Gas measured on the local Hardhat node (#284): approve ~46k, buyTickets ~150k plus ~155k per
// ticket. Rounded up, since a wallet's first purchase writes more storage. Only used to estimate
// the network fee shown in the order summary and to warn when the wallet's ETH can't cover it.
export const APPROVE_GAS = BigInt(60_000);
export const BUY_BASE_GAS = BigInt(160_000);
export const BUY_GAS_PER_TICKET = BigInt(160_000);

export function estimatePurchaseGas(quantity: number, needsApproval: boolean): bigint {
  const buyGas = BUY_BASE_GAS + BUY_GAS_PER_TICKET * BigInt(Math.max(quantity, 1));
  return needsApproval ? APPROVE_GAS + buyGas : buyGas;
}

export interface PurchaseCheckInput {
  configured: boolean; // the event exists on-chain with ticket types
  saleActive: boolean;
  endTime: number; // unix seconds; sales stop once it has passed
  now: number; // unix seconds
  tierName: string;
  remaining: number; // tickets left of the selected type
  quantity: number;
  isConnected: boolean;
  onContractChain: boolean; // the wallet is on the network the contract is deployed to
  // Every buyer needs an account with an email (Monark: "email is required for all users, not
  // wallet-only"). Checked here, in the frontend: the purchase itself goes straight to the contract.
  signedIn: boolean;
  profileComplete: boolean;
  presaleActive: boolean;
  whitelisted: boolean;
  perWalletLimit: number; // 0 = no limit
  held: number; // tickets this wallet already holds for the event
  total: bigint; // price x quantity, in USDC's smallest unit
  usdcBalance: bigint;
  ethBalance: bigint;
  ethNeeded: bigint; // estimated network fee, in wei
}

export type PurchaseBlock =
  | { reason: "notOnSale" }
  | { reason: "saleNotActive" }
  | { reason: "saleEnded" }
  | { reason: "soldOut"; tierName: string }
  | { reason: "notEnoughLeft"; tierName: string; remaining: number }
  | { reason: "notConnected" }
  | { reason: "wrongNetwork" }
  | { reason: "notSignedIn" }
  | { reason: "profileIncomplete" }
  | { reason: "notOnGuestList" }
  | { reason: "walletLimit"; limit: number; held: number }
  | { reason: "notEnoughUsdc"; total: bigint; balance: bigint }
  | { reason: "notEnoughEth"; needed: bigint; balance: bigint };

// Returns the first reason the purchase can't go ahead, or null when it can.
// Event-wide reasons come first, so someone without a wallet still sees "sold out" or "ended".
// The order matches the contract's own require() checks in buyTickets().
export function getPurchaseBlock(input: PurchaseCheckInput): PurchaseBlock | null {
  if (!input.configured) return { reason: "notOnSale" };
  if (!input.saleActive) return { reason: "saleNotActive" };
  if (input.now >= input.endTime) return { reason: "saleEnded" };
  if (input.remaining <= 0) return { reason: "soldOut", tierName: input.tierName };
  if (input.quantity > input.remaining) {
    return { reason: "notEnoughLeft", tierName: input.tierName, remaining: input.remaining };
  }

  if (!input.isConnected) return { reason: "notConnected" };
  if (!input.onContractChain) return { reason: "wrongNetwork" };
  if (!input.signedIn) return { reason: "notSignedIn" };
  if (!input.profileComplete) return { reason: "profileIncomplete" };
  if (input.presaleActive && !input.whitelisted) return { reason: "notOnGuestList" };
  if (input.perWalletLimit > 0 && input.held + input.quantity > input.perWalletLimit) {
    return { reason: "walletLimit", limit: input.perWalletLimit, held: input.held };
  }
  if (input.usdcBalance < input.total) {
    return { reason: "notEnoughUsdc", total: input.total, balance: input.usdcBalance };
  }
  if (input.ethBalance < input.ethNeeded) {
    return { reason: "notEnoughEth", needed: input.ethNeeded, balance: input.ethBalance };
  }
  return null;
}

// Highest quantity the stepper allows: what's left, what the wallet limit still allows, and the
// contract's per-purchase cap. Never below 1, so the stepper always has a valid value.
export function getMaxQuantity({ remaining, perWalletLimit, held }: { remaining: number; perWalletLimit: number; held: number }): number {
  const limitLeft = perWalletLimit > 0 ? perWalletLimit - held : MAX_TICKETS_PER_PURCHASE;
  return Math.max(1, Math.min(remaining, limitLeft, MAX_TICKETS_PER_PURCHASE));
}

export interface BlockMessage {
  tone: AlertTone;
  title: string;
  message: string;
}

// What to tell the user for each block. Every message says what to do next (#282).
export function getBlockMessage(block: PurchaseBlock, options: { usdcDecimals: number; chainName: string }): BlockMessage {
  const usdc = (value: bigint) => `${formatTokenAmount(value, options.usdcDecimals)} USDC`;

  switch (block.reason) {
    case "notOnSale":
      return {
        tone: "info",
        title: "Tickets aren't on sale yet",
        message: "The organizer hasn't set up ticket sales for this event yet. Check back soon.",
      };
    case "saleNotActive":
      return {
        tone: "info",
        title: "Ticket sales are closed",
        message: "Ticket sales for this event haven't opened yet, or are paused. Check back soon.",
      };
    case "saleEnded":
      return {
        tone: "info",
        title: "Ticket sales have ended",
        message: "This event is over, so tickets can't be bought anymore.",
      };
    case "soldOut":
      return {
        tone: "warning",
        title: `${block.tierName} is sold out`,
        message: "Choose another ticket type, or check the Marketplace for resale tickets.",
      };
    case "notEnoughLeft":
      return {
        tone: "warning",
        title: `Only ${block.remaining} left`,
        message: `Only ${block.remaining} ${block.tierName} ${block.remaining === 1 ? "ticket is" : "tickets are"} left. Lower the quantity.`,
      };
    case "notConnected":
      return {
        tone: "info",
        title: "Connect your wallet to buy",
        message: "Your tickets are minted as NFTs to the wallet you connect.",
      };
    case "notSignedIn":
      return {
        tone: "info",
        title: "Sign in to buy",
        message: "Sign a free message in your wallet to log in. Tickets are linked to your account.",
      };
    case "profileIncomplete":
      return {
        tone: "info",
        title: "Finish your account to buy",
        message: "Add your name and email first. It only takes a moment, and you'll come back here.",
      };
    case "wrongNetwork":
      return {
        tone: "warning",
        title: "Wrong network",
        message: `Switch your wallet to ${options.chainName} to buy tickets.`,
      };
    case "notOnGuestList":
      return {
        tone: "warning",
        title: "Not on the guest list",
        message: "Presale is open to the guest list only, and this wallet isn't on it.",
      };
    case "walletLimit": {
      const left = block.limit - block.held;
      return {
        tone: "warning",
        title: "Wallet limit reached",
        message:
          `You can hold up to ${block.limit} tickets for this event, and you already have ${block.held}.` +
          (left > 0 ? ` Lower the quantity to ${left} or fewer.` : ""),
      };
    }
    case "notEnoughUsdc":
      return {
        tone: "warning",
        title: "Not enough USDC",
        message: `This order costs ${usdc(block.total)} and your wallet has ${usdc(block.balance)}. Add ${usdc(block.total - block.balance)} or lower the quantity.`,
      };
    case "notEnoughEth":
      return {
        tone: "warning",
        title: "Not enough ETH for the network fee",
        message: `Add about ${formatEth(block.needed - block.balance)} ETH to this wallet, then try again.`,
      };
  }
}
