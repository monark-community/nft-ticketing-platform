"use client";

import { ArrowRight, Check, RotateCw, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { TxHash } from "@/components/event/TxHash";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { StepRow } from "@/components/ui/step-row";
import { ROUTES } from "@/lib/nav";
import type { BlockMessage, PurchaseBlock } from "@/lib/purchase-checks";
import { isApproving, type PurchaseStep } from "@/lib/purchase-steps";
import type { TxState } from "@/lib/transactions/types";
import { cn } from "@/lib/utils";

interface PurchasePanelProps {
  steps: PurchaseStep[];
  state: TxState;
  explorerUrl: string | null;
  block: PurchaseBlock | null;
  blockMessage: BlockMessage | null;
  ready: boolean; // the contract and wallet reads have loaded
  isBusy: boolean;
  quantity: number;
  totalLabel: string; // "30.00 USDC"
  purchased: number; // tickets bought by the last successful run
  onBuy: () => void;
  onStopWaiting: () => void;
  onConnect: () => void;
  onSwitchNetwork: () => void;
  onSignIn: () => void;
  signingIn: boolean; // the wallet is showing the sign-in message
  finishAccountHref: string; // create account step, coming back to this event afterwards
}

// Bottom of the order summary (#147, #149): the two step rows, then whichever Figma status frame
// applies (Default, Approving, Buying, Still pending, Success, Failed, or a blocked state).
export function PurchasePanel(props: PurchasePanelProps) {
  const { steps, state } = props;

  return (
    <div className="flex flex-col gap-4 pt-4">
      <ol className="flex flex-col gap-2" aria-label="Purchase steps">
        {steps.map((step, index) => (
          <StepRow key={step.label} step={index + 1} label={step.label} status={step.status} />
        ))}
      </ol>

      {state.phase === "success" ? <SuccessPanel {...props} /> : <Actions {...props} />}
    </div>
  );
}

function Actions({
  steps,
  state,
  explorerUrl,
  block,
  blockMessage,
  ready,
  isBusy,
  quantity,
  totalLabel,
  onBuy,
  onStopWaiting,
  onConnect,
  onSwitchNetwork,
  onSignIn,
  signingIn,
  finishAccountHref,
}: PurchasePanelProps) {
  const approving = isApproving(state);
  // Failed on the buy step after the approval went through: "Try again" only runs the buy
  const approvalKept = state.phase === "error" && steps[0].status === "done" && steps[1].status === "failed";
  const tickets = `${quantity} ${quantity === 1 ? "ticket" : "tickets"}`;

  // Text and spinner on the button while a step runs
  const busyLabel: Partial<Record<TxState["phase"], string>> = {
    preparing: "Preparing…",
    awaitingWallet: "Confirm in your wallet…",
    confirming: approving ? "Approving…" : "Buying…",
    stillPending: "Waiting for confirmation…",
  };

  // Line under the button (Figma: "Step 1 of 2: allow 30.00 USDC to be used for this purchase.")
  let caption: React.ReactNode = null;
  if (state.phase === "awaitingWallet") {
    caption = approving
      ? `Step 1 of 2: allow ${totalLabel} to be used for this purchase.`
      : state.steps.length > 1
        ? `Step 2 of 2: buy ${tickets} for ${totalLabel}.`
        : `Confirm the purchase of ${tickets} in your wallet.`;
  } else if (state.phase === "confirming") {
    caption = "Transaction sent. Waiting for confirmation.";
  } else if (approvalKept) {
    caption = "USDC is already approved, so only the purchase runs again.";
  }

  let button: React.ReactNode;
  if (isBusy) {
    button = (
      <Button size="lg" loading className="w-full font-mono tracking-normal normal-case">
        {busyLabel[state.phase]}
      </Button>
    );
  } else if (block?.reason === "notConnected") {
    button = (
      <Button size="lg" className="w-full" onClick={onConnect}>
        Connect wallet
      </Button>
    );
  } else if (block?.reason === "wrongNetwork") {
    button = (
      <Button size="lg" className="w-full" onClick={onSwitchNetwork}>
        Switch network
      </Button>
    );
  } else if (block?.reason === "notSignedIn") {
    button = (
      <Button size="lg" className="w-full" onClick={onSignIn} loading={signingIn}>
        {signingIn ? "Confirm in your wallet…" : "Sign in to buy"}
      </Button>
    );
  } else if (block?.reason === "profileIncomplete") {
    button = (
      <Link href={finishAccountHref} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
        Finish your account <ArrowRight aria-hidden="true" />
      </Link>
    );
  } else if (state.phase === "error" && !block) {
    button = (
      <Button size="lg" className="w-full" onClick={onBuy}>
        <RotateCw aria-hidden="true" /> Try again
      </Button>
    );
  } else {
    const soldOut = block?.reason === "soldOut";
    button = (
      <Button size="lg" className="w-full" onClick={onBuy} disabled={!ready || Boolean(block)}>
        {soldOut ? (
          "Buy tickets"
        ) : (
          <>
            Buy tickets — <span className="font-mono">{totalLabel}</span>
            <ArrowRight aria-hidden="true" />
          </>
        )}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {state.phase === "error" && state.error && <Alert tone="error" title={state.error} />}

      {state.phase === "stillPending" && (
        <Alert
          tone="warning"
          title="This is taking longer than usual. Your purchase may still confirm, so don't buy again yet."
          action={
            <Button variant="outline" size="sm" onClick={onStopWaiting}>
              Stop waiting
            </Button>
          }
        >
          {state.hash && <TxHash hash={state.hash} explorerUrl={explorerUrl} className="justify-start" />}
        </Alert>
      )}

      {state.phase === "stoppedWaiting" && (
        <Alert tone="warning" title="Stopped waiting for the transaction">
          {state.note}
          {state.hash && <TxHash hash={state.hash} explorerUrl={explorerUrl} className="mt-1 justify-start" />}
        </Alert>
      )}

      {/* Blocked states. Hidden while busy so they don't flash when balances refresh mid-purchase. */}
      {!isBusy && block && blockMessage && (
        <Alert
          tone={blockMessage.tone}
          title={blockMessage.title}
          action={
            block.reason === "soldOut" && (
              <Link href={ROUTES.marketplace} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
                See resale tickets <ArrowRight aria-hidden="true" />
              </Link>
            )
          }
        >
          {blockMessage.message}
        </Alert>
      )}

      {button}

      {caption && <p className="text-center text-[11px] leading-[16.5px] text-muted-foreground">{caption}</p>}
      {state.phase === "confirming" && state.hash && <TxHash hash={state.hash} explorerUrl={explorerUrl} />}

      <p className="flex items-center justify-center gap-1.5 text-[11px] leading-[16.5px] text-muted-foreground">
        <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
        Each ticket is verified on-chain at the door.
      </p>
    </div>
  );
}

// Figma: Success. "You're going!" with the tickets bought and a link to My Tickets.
function SuccessPanel({ state, explorerUrl, purchased }: PurchasePanelProps) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 rounded-md border border-success/60 bg-success-bg/30 px-4 py-5 text-center">
      <span className="flex size-9 items-center justify-center rounded-full border border-success/60 bg-success-bg text-success">
        <Check className="size-5" aria-hidden="true" />
      </span>
      <div>
        <p className="font-serif text-[28px] leading-9 font-semibold text-foreground">You&apos;re going!</p>
        <p className="type-body-sm text-secondary-foreground">
          {purchased} {purchased === 1 ? "ticket was" : "tickets were"} sent to your wallet.
        </p>
      </div>
      <Link href={ROUTES.myTickets} className={cn(buttonVariants({ size: "md" }), "w-full")}>
        View my tickets <ArrowRight aria-hidden="true" />
      </Link>
      {state.hash && <TxHash hash={state.hash} explorerUrl={explorerUrl} />}
    </div>
  );
}
