"use client";

import { useState } from "react";
import { erc20Abi, type Address } from "viem";
import { TICKET_NFT_ADDRESS, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import { getPurchaseErrorMessage, PURCHASE_ERRORS } from "@/lib/purchase-errors";
import { APPROVE_STEP_LABEL, BUY_STEP_LABEL, getPurchaseSteps } from "@/lib/purchase-steps";
import { IDLE_TX_STATE, type TxStep } from "@/lib/transactions/types";
import { useTransaction } from "./useTransaction";

interface Options {
  contractEventId: bigint | null;
  typeId: number;
  quantity: number;
  unitPrice: bigint; // USDC's smallest unit
  usdcAddress: Address | undefined;
  allowance: bigint; // USDC the contract may already take from this wallet
  onSettled?: () => Promise<unknown> | void; // refresh supply and balances after a run
}

// Buys tickets (#147): approve USDC if the current allowance is too low, then buyTickets().
// Uses the shared transaction runner (#101), so each step is simulated before the wallet opens,
// a double click can't buy twice, and a slow transaction shows as "still pending".
export function usePurchaseTickets({ contractEventId, typeId, quantity, unitPrice, usdcAddress, allowance, onSettled }: Options) {
  const tx = useTransaction({ getErrorMessage: getPurchaseErrorMessage });
  // How many tickets the last successful run bought, for the success message
  const [purchased, setPurchased] = useState(0);

  const total = unitPrice * BigInt(quantity);
  const approvalNeeded = allowance < total;

  async function buy(): Promise<boolean> {
    if (contractEventId === null || !usdcAddress || quantity < 1) return false;

    const steps: TxStep[] = [];
    // Approve exactly this order's total, not an unlimited amount
    if (approvalNeeded) {
      steps.push({
        label: APPROVE_STEP_LABEL,
        request: { address: usdcAddress, abi: erc20Abi, functionName: "approve", args: [TICKET_NFT_ADDRESS, total] },
      });
    }
    steps.push({
      label: BUY_STEP_LABEL,
      request: {
        address: TICKET_NFT_ADDRESS,
        abi: ticketNftAbi,
        functionName: "buyTickets",
        args: [contractEventId, BigInt(typeId), BigInt(quantity)],
      },
    });

    const outcome = await tx.run(steps);
    const succeeded = outcome === "success";
    if (succeeded) setPurchased(quantity);
    // Refresh even after a failure: if the approve step went through, "Try again" only runs the buy
    await onSettled?.();
    return succeeded;
  }

  // What a run did belongs to the account that ran it: once the wallet is on another account, the
  // page shows a new order for that one instead of "You're going!", the other account's error or
  // the transaction it stopped waiting for. Only the message that the wallet switched mid-purchase
  // stays (#396). accountChanged is only true between runs, so no phase needs checking.
  const fromAnotherAccount = tx.accountChanged && tx.state.error !== PURCHASE_ERRORS.accountChanged;
  const state = fromAnotherAccount ? IDLE_TX_STATE : tx.state;

  return {
    buy,
    total,
    approvalNeeded,
    purchased,
    // After the wallet switched accounts, the rows are the new account's: an approval by the other
    // account doesn't count for this one (#396)
    steps: getPurchaseSteps(tx.accountChanged ? IDLE_TX_STATE : tx.state, approvalNeeded),
    state,
    isBusy: tx.isBusy,
    reset: tx.reset,
    stopWaiting: tx.stopWaiting,
    explorerUrl: tx.explorerUrl,
  };
}
