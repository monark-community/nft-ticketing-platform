"use client";

// Shared display of a transaction's progress and outcome (#101), as a small receipt (#364): each
// step prints one more line. When it's done the bottom edge tears off; a failure prints its line
// in red and the receipt shakes once. What to do next stays under the receipt, in plain words.

import { X } from "lucide-react";
import { useState } from "react";

import { DrawnCheck } from "@/components/motion/DrawnCheck";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { isReceiptFinished, receiptLines, receiptTitle, type ReceiptLine, type ReceiptTone } from "@/lib/transactions/receipt";
import type { TxState } from "@/lib/transactions/types";
import { cn } from "@/lib/utils";

const STILL_PENDING_TEXT =
  "This is taking longer than usual. The transaction is still pending and may still confirm, so don't send it again.";

interface Props {
  state: TxState;
  explorerUrl?: string | null;
  successMessage?: string; // shown when every step confirmed (#105)
  onRetry?: () => void; // shows a retry button after a failure (#105)
  onStopWaiting?: () => void; // shows "Stop waiting" while still pending (#252)
}

// Ink colours on the receipt's paper
const TONE: Record<ReceiptTone, string> = {
  plain: "",
  // Dark enough for small text on the paper: 6.0:1 and 5.7:1 (4.5:1 needed)
  ok: "font-bold text-[#166534]",
  slow: "text-[#854d0e]",
  bad: "font-bold text-[#b91c1c]",
};

function Line({ line, explorerUrl }: { line: ReceiptLine; explorerUrl?: string | null }) {
  return (
    // Opens its own height while its text prints from left to right (160 ms)
    <li className="unfold-in [animation-duration:160ms]">
      <div className="min-h-0 overflow-hidden">
        <div className={cn("print-across mt-0.5 flex items-center justify-between gap-2 border-t border-dashed border-[#c9c6be] pt-1", TONE[line.tone])}>
          {line.hash && explorerUrl ? (
            <a href={`${explorerUrl}/tx/${line.hash}`} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:opacity-70">
              {line.text}
            </a>
          ) : (
            <span>{line.text}</span>
          )}
          {line.busy && <Spinner className="size-3 text-[#c2410c]" />}
          {line.tone === "ok" && <DrawnCheck className="size-3.5" />}
          {line.tone === "bad" && <X className="size-3.5 shrink-0" strokeWidth={2.6} aria-hidden="true" />}
        </div>
      </div>
    </li>
  );
}

export function TransactionStatus({ state, explorerUrl, successMessage, onRetry, onStopWaiting }: Props) {
  // Whether the wallet was opened for the current step, so a failure before that doesn't print a
  // wallet line. Followed during render, from the phases as they arrive.
  const [walletAsked, setWalletAsked] = useState<number | null>(null);
  const asked = state.phase === "awaitingWallet" ? state.stepIndex : state.phase === "idle" || state.phase === "preparing" ? null : walletAsked;
  if (asked !== walletAsked) setWalletAsked(asked);

  if (state.phase === "idle") return null;

  const lines = receiptLines(state, asked === state.stepIndex);
  const finished = isReceiptFinished(state);
  const multiStep = state.steps.length > 1;
  const stepLabel = `Step ${state.stepIndex + 1} of ${state.steps.length}: ${state.steps[state.stepIndex]}`;

  return (
    <div data-slot="transaction-status" className="flex flex-col">
      {/* Announced politely as lines are added; a failure interrupts (role="alert" below) */}
      <div
        role="status"
        className={cn(
          "relative w-full max-w-[340px] rounded-t-[4px] bg-[#ecebe6] px-3.5 pt-3 pb-4 font-mono text-[12.5px] leading-normal text-[#1d1d1f]",
          finished && "mb-2",
          state.phase === "error" && "shake-once"
        )}
      >
        <p className="text-[#6b6760]">{receiptTitle(state)}</p>
        <ol className="flex flex-col pt-1.5">
          {lines.map((line) => (
            <Line key={line.key} line={line} explorerUrl={explorerUrl} />
          ))}
        </ol>
        {finished && <span className="receipt-tear" aria-hidden="true" />}
      </div>

      {state.phase === "error" && (
        <div role="alert" className="fade-in mt-3 flex flex-col items-start gap-1">
          <p className="type-body-md-strong text-destructive">{multiStep ? `Failed at ${stepLabel}` : "Transaction failed"}</p>
          {state.error && <p className="type-body-sm text-secondary-foreground">{state.error}</p>}
          {onRetry && (
            <Button size="sm" onClick={onRetry} className="mt-2">
              Try again
            </Button>
          )}
        </div>
      )}

      {/* The outcome in words, announced politely too. This region is there from the first step,
          so screen readers notice what is added to it. */}
      <div role="status" className="flex flex-col">
        {state.phase === "success" && <p className="fade-in mt-3 type-body-md-strong text-success">{successMessage ?? "Transaction confirmed."}</p>}

        {state.phase === "stoppedWaiting" && (
          <div className="fade-in mt-3 flex flex-col gap-1">
            <p className="type-body-md-strong text-primary">Stopped waiting for the transaction</p>
            {state.note && <p className="type-body-sm text-secondary-foreground">{state.note}</p>}
          </div>
        )}

        {state.phase === "stillPending" && (
          <div className="fade-in mt-3 flex flex-col items-start gap-1">
            <p className="type-body-sm text-secondary-foreground">{STILL_PENDING_TEXT}</p>
            {state.note && <p className="type-body-sm text-secondary-foreground">{state.note}</p>}
            {onStopWaiting && (
              <Button variant="outline" size="sm" onClick={onStopWaiting} className="mt-2">
                Stop waiting
              </Button>
            )}
          </div>
        )}

        {/* e.g. the transaction was sped up in the wallet */}
        {!finished && state.phase !== "stillPending" && state.note && <p className="mt-3 type-body-sm text-secondary-foreground">{state.note}</p>}
      </div>
    </div>
  );
}
