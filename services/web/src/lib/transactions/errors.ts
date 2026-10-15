// Turns any transaction error into a message the user can act on (#101, #103).
// Features can override the generic messages and map their contract's revert reasons.

import {
  BaseError,
  ChainMismatchError,
  ContractFunctionRevertedError,
  HttpRequestError,
  InsufficientFundsError,
  TimeoutError,
  UserRejectedRequestError,
} from "viem";

export const TX_ERRORS = {
  userRejected: "The transaction was cancelled in your wallet.",
  insufficientFunds: "Your wallet does not have enough ETH to pay for gas.",
  wrongNetwork: "Your wallet is on the wrong network. Switch networks and try again.",
  revertedOnChain:
    "The transaction was sent but failed on-chain (it reverted). Nothing changed, but the gas fee was spent.",
  network: "Could not reach the blockchain network. Check your connection and try again.",
  cancelled: "The transaction was cancelled in your wallet before it confirmed.",
  replaced:
    "The transaction was replaced by a different transaction from your wallet, so it did not go through.",
  unknown: "The transaction failed. Please try again.",
};

export type TxErrorMessages = typeof TX_ERRORS;

export interface ErrorOverrides {
  messages?: Partial<TxErrorMessages>;
  // require() messages from the contract: substring of the reason -> message to show
  revertReasons?: Record<string, string>;
  // custom Solidity errors: error name -> message to show
  customErrors?: Record<string, string>;
}

// Thrown by the runner when a sent transaction is mined but its receipt says it reverted.
export class TransactionRevertedError extends Error {
  constructor(public hash: string) {
    super(`Transaction ${hash} reverted on-chain`);
    this.name = "TransactionRevertedError";
  }
}

// Thrown by the runner when the wallet cancelled or replaced a pending transaction (#104).
// A sped-up ("repriced") transaction is not an error: the runner keeps tracking the new one.
export class TransactionReplacedError extends Error {
  constructor(public reason: "cancelled" | "replaced") {
    super(`Transaction was ${reason}`);
    this.name = "TransactionReplacedError";
  }
}

// Different nodes word these errors differently (Hardhat: "Sender doesn't have enough funds",
// most RPCs: "insufficient funds"), and viem sometimes wraps them as contract errors.
// So the wording is checked first, before treating anything as a contract revert.
const USER_REJECTED_PATTERN = /user (rejected|denied)/i;
const INSUFFICIENT_FUNDS_PATTERN =
  /insufficient funds|(doesn't|does not) have enough funds|exceeds (the )?balance|exceeds transaction sender account balance/i;
const NETWORK_PATTERN = /failed to fetch|network error|fetch failed|ECONNREFUSED/i;

function has(err: unknown, type: abstract new (...args: never[]) => Error): boolean {
  return err instanceof BaseError && !!err.walk((e) => e instanceof type);
}

export function getTransactionErrorMessage(err: unknown, overrides: ErrorOverrides = {}): string {
  const messages = { ...TX_ERRORS, ...overrides.messages };
  const text = err instanceof Error ? err.message : String(err);

  if (has(err, UserRejectedRequestError) || USER_REJECTED_PATTERN.test(text)) {
    return messages.userRejected;
  }
  if (has(err, InsufficientFundsError) || INSUFFICIENT_FUNDS_PATTERN.test(text)) {
    return messages.insufficientFunds;
  }
  if (has(err, ChainMismatchError)) {
    return messages.wrongNetwork;
  }
  if (err instanceof TransactionRevertedError) {
    return messages.revertedOnChain;
  }
  if (err instanceof TransactionReplacedError) {
    return err.reason === "cancelled" ? messages.cancelled : messages.replaced;
  }

  // The contract would revert: caught while simulating, before anything was sent
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const errorName = revert.data?.errorName;
      if (errorName && overrides.customErrors?.[errorName]) {
        return overrides.customErrors[errorName];
      }
      const reason = revert.reason ?? "";
      for (const [match, message] of Object.entries(overrides.revertReasons ?? {})) {
        if (reason.includes(match)) return message;
      }
      if (reason) return `The contract rejected the transaction: ${reason}`;
      if (errorName) return `The contract rejected the transaction (${errorName}).`;
    }
  }

  if (has(err, HttpRequestError) || has(err, TimeoutError) || NETWORK_PATTERN.test(text)) {
    return messages.network;
  }

  return messages.unknown;
}
