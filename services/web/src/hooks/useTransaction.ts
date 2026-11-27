"use client";

// Reusable hook for sending blockchain transactions with consistent states (#101).
// Pass one step for a single call, or several for a sequence (e.g. approve, then buy).

import { runTransactionSteps, type TransactionClient } from "@/lib/transactions/run-transaction";
import { IDLE_TX_STATE, type TxOutcome, type TxState, type TxStep } from "@/lib/transactions/types";
import { useRef, useState } from "react";
import type { Address } from "viem";
import { useAccount, useConfig, usePublicClient, useWriteContract } from "wagmi";
import { getAccount } from "wagmi/actions";

interface Options {
  getErrorMessage: (err: unknown) => string;
  timeoutMs?: number;
}

export function useTransaction({ getErrorMessage, timeoutMs }: Options) {
  const { address, chain } = useAccount();
  const config = useConfig();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<TxState>(IDLE_TX_STATE);
  // The account the last run sent from (#396)
  const [runAccount, setRunAccount] = useState<Address | null>(null);

  // Prevents duplicate submissions (#106). A ref, not state: it changes immediately,
  // so a fast double-click can't start a second run before React re-renders.
  const inFlight = useRef(false);
  // Lets the user stop waiting on a still-pending transaction (#252)
  const stopController = useRef<AbortController | null>(null);

  // Resolves to how the run ended. Callers that write API rows first can keep them after
  // "stoppedWaiting" (the transaction may still confirm) and only undo them after "error".
  async function run(steps: TxStep[]): Promise<TxOutcome | "idle"> {
    if (!address || !publicClient || steps.length === 0) return "idle";
    if (inFlight.current) return "idle";
    inFlight.current = true;
    stopController.current = new AbortController();
    setRunAccount(address);

    const client: TransactionClient = {
      simulate: async (step, account) => {
        const { request } = await publicClient.simulateContract({ ...step.request, account });
        return request;
      },
      write: (request) => writeContractAsync(request as Parameters<typeof writeContractAsync>[0]),
      waitForReceipt: (hash, options) => publicClient.waitForTransactionReceipt({ hash, ...options }),
    };

    try {
      return await runTransactionSteps({
        steps,
        account: address,
        client,
        onUpdate: setState,
        getErrorMessage,
        timeoutMs,
        stopSignal: stopController.current.signal,
        // Read when the run fails, not from this render: the wallet may have switched since
        currentAccount: () => getAccount(config).address,
      });
    } finally {
      inFlight.current = false;
      stopController.current = null;
    }
  }

  // Only available while "still pending": returns to the form so the user isn't stuck (#252)
  function stopWaiting() {
    if (state.phase === "stillPending") stopController.current?.abort();
  }

  function reset() {
    if (inFlight.current) return; // never hide a transaction that is still in progress
    setState(IDLE_TX_STATE);
  }

  // Callers should disable their action buttons while busy, including "still pending" (#106)
  const isBusy =
    state.phase === "preparing" ||
    state.phase === "awaitingWallet" ||
    state.phase === "confirming" ||
    state.phase === "stillPending";

  // The wallet is on another account than the one the last run used, so what that run did (an
  // approval, a failed step) is about the other account, not this one (#396)
  const accountChanged = !isBusy && runAccount !== null && address !== undefined && address.toLowerCase() !== runAccount.toLowerCase();

  // Block explorer for the connected chain (Sepolia has Etherscan; the local Hardhat node has none)
  const explorerUrl = chain?.blockExplorers?.default.url ?? null;

  return { state, run, reset, stopWaiting, isBusy, accountChanged, explorerUrl };
}
