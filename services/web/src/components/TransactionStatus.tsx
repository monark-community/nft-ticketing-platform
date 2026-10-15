"use client";

// Shared, functional display of a transaction's progress and outcome (#101).
// Intentionally plain: the Figma design system will restyle transaction and error states.

import type { TxState } from "@/lib/transactions/types";

const PENDING_TEXT: Partial<Record<TxState["phase"], string>> = {
  preparing: "Preparing transaction...",
  awaitingWallet: "Confirm the transaction in your wallet",
  confirming: "Transaction sent. Waiting for confirmation...",
  stillPending:
    "This is taking longer than usual. The transaction is still pending and may still confirm, so don't send it again.",
};

interface Props {
  state: TxState;
  explorerUrl?: string | null;
  successMessage?: string; // shown when every step confirmed (#105)
  onRetry?: () => void; // shows a retry button after a failure (#105)
  onStopWaiting?: () => void; // shows "Stop waiting" while still pending (#252)
}

function shortenHash(hash: string) {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function TxLink({ hash, explorerUrl }: { hash: string; explorerUrl?: string | null }) {
  return (
    <p className="mt-1 font-mono text-xs">
      Tx:{" "}
      {explorerUrl ? (
        <a href={`${explorerUrl}/tx/${hash}`} target="_blank" rel="noreferrer" className="underline">
          {shortenHash(hash)}
        </a>
      ) : (
        shortenHash(hash)
      )}
    </p>
  );
}

export function TransactionStatus({ state, explorerUrl, successMessage, onRetry, onStopWaiting }: Props) {
  const multiStep = state.steps.length > 1;
  const stepLabel = `Step ${state.stepIndex + 1} of ${state.steps.length}: ${state.steps[state.stepIndex]}`;

  // Success (#105)
  if (state.phase === "success") {
    return (
      <div role="status" aria-live="polite" className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">
        <p className="font-semibold">{successMessage ?? "Transaction confirmed."}</p>
        {state.hash && <TxLink hash={state.hash} explorerUrl={explorerUrl} />}
      </div>
    );
  }

  // Failure (#105)
  if (state.phase === "error") {
    return (
      <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
        <p className="font-semibold">{multiStep ? `Failed at ${stepLabel}` : "Transaction failed"}</p>
        {state.error && <p className="mt-1">{state.error}</p>}
        {state.hash && <TxLink hash={state.hash} explorerUrl={explorerUrl} />}
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  // The user stopped waiting; the transaction may still confirm (#252)
  if (state.phase === "stoppedWaiting") {
    return (
      <div role="status" aria-live="polite" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">Stopped waiting for the transaction</p>
        {state.note && <p className="mt-1">{state.note}</p>}
        {state.hash && <TxLink hash={state.hash} explorerUrl={explorerUrl} />}
      </div>
    );
  }

  // Pending (#102, #104)
  const text = PENDING_TEXT[state.phase];
  if (!text) return null;

  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      {multiStep && <p className="font-semibold">{stepLabel}</p>}
      <p className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-hidden="true" />
        {text}
      </p>
      {state.note && <p className="mt-1 text-xs">{state.note}</p>}
      {state.hash && <TxLink hash={state.hash} explorerUrl={explorerUrl} />}
      {state.phase === "stillPending" && onStopWaiting && (
        <button
          onClick={onStopWaiting}
          className="mt-3 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100"
        >
          Stop waiting
        </button>
      )}
    </div>
  );
}
