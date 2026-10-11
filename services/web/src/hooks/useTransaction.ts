"use client";

// Reusable hook for sending blockchain transactions with consistent states (#101).
// Pass one step for a single call, or several for a sequence (e.g. approve, then buy).

import { runTransactionSteps, type TransactionClient } from "@/lib/transactions/run-transaction";
import { IDLE_TX_STATE, type TxState, type TxStep } from "@/lib/transactions/types";
import { useRef, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

interface Options {
  getErrorMessage: (err: unknown) => string;
  timeoutMs?: number;
}

export function useTransaction({ getErrorMessage, timeoutMs }: Options) {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<TxState>(IDLE_TX_STATE);

  // Prevents duplicate submissions (#106). A ref, not state: it changes immediately,
  // so a fast double-click can't start a second run before React re-renders.
  const inFlight = useRef(false);

  async function run(steps: TxStep[]): Promise<boolean> {
    if (!address || !publicClient || steps.length === 0) return false;
    if (inFlight.current) return false;
    inFlight.current = true;

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
      });
    } finally {
      inFlight.current = false;
    }
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

  // Block explorer for the connected chain (Sepolia has Etherscan; the local Hardhat node has none)
  const explorerUrl = chain?.blockExplorers?.default.url ?? null;

  return { state, run, reset, isBusy, explorerUrl };
}
