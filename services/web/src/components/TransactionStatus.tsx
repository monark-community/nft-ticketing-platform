"use client";

// Shared, functional display of a transaction's progress (#101).
// Intentionally plain: the Figma design system will restyle transaction and error states.

import type { TxState } from "@/lib/transactions/types";

const PHASE_TEXT: Partial<Record<TxState["phase"], string>> = {
  preparing: "Preparing transaction...",
  awaitingWallet: "Confirm the transaction in your wallet",
  confirming: "Transaction sent. Waiting for confirmation...",
};

function shortenHash(hash: string) {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

export function TransactionStatus({ state }: { state: TxState }) {
  const text = PHASE_TEXT[state.phase];
  if (!text) return null;

  const multiStep = state.steps.length > 1;

  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      {multiStep && (
        <p className="font-semibold">
          Step {state.stepIndex + 1} of {state.steps.length}: {state.steps[state.stepIndex]}
        </p>
      )}
      <p className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-hidden="true" />
        {text}
      </p>
      {state.hash && <p className="mt-1 font-mono text-xs text-blue-800">Tx: {shortenHash(state.hash)}</p>}
    </div>
  );
}
