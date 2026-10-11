"use client";

// Reusable hook for sending blockchain transactions with consistent states (#101).
// Pass one step for a single call, or several for a sequence (e.g. approve, then buy).

import { runTransactionSteps, type TransactionClient } from "@/lib/transactions/run-transaction";
import { IDLE_TX_STATE, type TxState, type TxStep } from "@/lib/transactions/types";
import { useState } from "react";
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

  async function run(steps: TxStep[]): Promise<boolean> {
    if (!address || !publicClient || steps.length === 0) return false;

    const client: TransactionClient = {
      simulate: async (step, account) => {
        const { request } = await publicClient.simulateContract({ ...step.request, account });
        return request;
      },
      write: (request) => writeContractAsync(request as Parameters<typeof writeContractAsync>[0]),
      waitForReceipt: (hash, options) => publicClient.waitForTransactionReceipt({ hash, ...options }),
    };

    return runTransactionSteps({
      steps,
      account: address,
      client,
      onUpdate: setState,
      getErrorMessage,
      timeoutMs,
    });
  }

  function reset() {
    setState(IDLE_TX_STATE);
  }

  const isBusy =
    state.phase === "preparing" ||
    state.phase === "awaitingWallet" ||
    state.phase === "confirming" ||
    state.phase === "stillPending";

  // Block explorer for the connected chain (Sepolia has Etherscan; the local Hardhat node has none)
  const explorerUrl = chain?.blockExplorers?.default.url ?? null;

  return { state, run, reset, isBusy, explorerUrl };
}
