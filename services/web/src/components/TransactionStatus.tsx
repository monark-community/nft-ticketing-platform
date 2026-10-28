"use client";

// Shared display of a transaction's progress and outcome (#101), styled with the design system (#290).

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
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
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

function TxLink({ hash, explorerUrl }: { hash: string; explorerUrl?: string | null }) {
  return (
    <p className="mt-1 type-mono-address text-muted-foreground">
      Tx:{" "}
      {explorerUrl ? (
        <a href={`${explorerUrl}/tx/${hash}`} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
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
  const txLink = state.hash && <TxLink hash={state.hash} explorerUrl={explorerUrl} />;

  // Success (#105)
  if (state.phase === "success") {
    return (
      <Alert tone="success" title={successMessage ?? "Transaction confirmed."}>
        {txLink}
      </Alert>
    );
  }

  // Failure (#105)
  if (state.phase === "error") {
    return (
      <Alert
        tone="error"
        title={multiStep ? `Failed at ${stepLabel}` : "Transaction failed"}
        action={onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>}
      >
        {state.error && <p>{state.error}</p>}
        {txLink}
      </Alert>
    );
  }

  // The user stopped waiting; the transaction may still confirm (#252)
  if (state.phase === "stoppedWaiting") {
    return (
      <Alert tone="warning" title="Stopped waiting for the transaction">
        {state.note && <p>{state.note}</p>}
        {txLink}
      </Alert>
    );
  }

  // Pending (#102, #104)
  const text = PENDING_TEXT[state.phase];
  if (!text) return null;

  return (
    <Alert
      tone={state.phase === "stillPending" ? "warning" : "info"}
      icon={null}
      title={
        <span className="flex items-center gap-2">
          <Spinner className="text-primary" />
          {multiStep ? stepLabel : text}
        </span>
      }
      action={
        state.phase === "stillPending" && onStopWaiting && (
          <Button variant="outline" size="sm" onClick={onStopWaiting}>
            Stop waiting
          </Button>
        )
      }
    >
      {multiStep && <p>{text}</p>}
      {state.note && <p className="mt-1">{state.note}</p>}
      {txLink}
    </Alert>
  );
}
