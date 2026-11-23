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
  // What the printed ticket on the success card shows; null hides it
  ticket: { title: string; tierName: string; date: string } | null;
  steps: PurchaseStep[];
  state: TxState;
  explorerUrl: string | null;
  block: PurchaseBlock | null;
  blockMessage: BlockMessage | null;
  ready: boolean; // the contract and wallet reads have loaded
  walletError?: string | null; // a wallet read failed, so the checks can't run
  onRetryWallet?: () => void;
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
      <ol className="flex flex-col gap-4" aria-label="Purchase steps">
        {steps.map((step, index) => (
          <StepRow key={step.label} step={index + 1} label={step.label} status={step.status} linkToNext={index < steps.length - 1} />
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
  walletError,
  onRetryWallet,
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

      {/* Without the wallet's balances the checks can't run, so say why Buy is disabled */}
      {walletError && !isBusy && (
        <Alert
          tone="error"
          title={walletError}
          action={
            onRetryWallet && (
              <Button size="sm" onClick={onRetryWallet}>
                <RotateCw aria-hidden="true" /> Try again
              </Button>
            )
          }
        />
      )}

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
// Above it, the ticket prints out of a slot and its stub tears off (#367): the one long moment of
// the app, about 0.8 s. It's decorative and starts only once the purchase is confirmed. As in the
// Motion Guide, "You're going!" fades in once the ticket is out (320 ms, from 680 ms); the button is
// there and usable from the start.
function SuccessPanel({ state, explorerUrl, purchased, ticket }: PurchasePanelProps) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 rounded-md border border-success/60 bg-success-bg/30 px-4 py-5 text-center">
      {ticket ? (
        <PrintedTicket ticket={ticket} count={purchased} />
      ) : (
        <span className="flex size-9 items-center justify-center rounded-full border border-success/60 bg-success-bg text-success">
          <Check className="size-5" aria-hidden="true" />
        </span>
      )}
      <div className="animate-[fade-in_320ms_ease-out_680ms_backwards]">
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

// Where the paper bits fly when the stub tears off: right or left, up or down
const PAPER_BITS = [
  { x: -10, y: -14 },
  { x: 13, y: -9 },
  { x: -16, y: -4 },
  { x: 19, y: 1 },
  { x: -22, y: 6 },
  { x: 25, y: 11 },
  { x: -28, y: 16 },
];

// A paper ticket coming out of a slot: the main part with the event, and a stub with a barcode,
// joined by a perforation. Decorative: the text under it says what happened.
function PrintedTicket({ ticket, count }: { ticket: NonNullable<PurchasePanelProps["ticket"]>; count: number }) {
  return (
    <div className="w-full" aria-hidden="true">
      <div className="h-1.5 rounded-full bg-[#050506] shadow-[inset_0_1px_2px_#000,0_1px_0_var(--border)]" />
      <div className="relative mx-2 -mt-[3px] flex ticket-print text-left drop-shadow-[0_10px_14px_rgb(0_0_0/45%)]">
        <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-bl-md bg-foreground px-3.5 py-3 text-[#17181a]">
          <span className="w-fit rounded-xs border border-[#17181a]/35 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] uppercase">
            Admit {count} · {ticket.tierName}
          </span>
          <span className="truncate font-serif text-[17px] leading-tight font-bold">{ticket.title}</span>
          <span className="font-mono text-[10.5px] text-[#4a4b4f] uppercase">{ticket.date}</span>
        </div>
        <div className="relative flex w-[74px] flex-none origin-top-left stub-tear flex-col items-center justify-center gap-1.5 rounded-br-md border-l-2 border-dashed border-[#17181a] bg-primary px-2 py-2.5 text-primary-foreground">
          <span className="h-7 w-full bg-[repeating-linear-gradient(90deg,#17181a_0_2px,transparent_2px_4px,#17181a_4px_5px,transparent_5px_8px,#17181a_8px_11px,transparent_11px_13px)]" />
          <span className="font-mono text-[9px] font-bold tracking-[0.2em]">NFTP</span>
          {PAPER_BITS.map((bit, index) => (
            <span
              key={index}
              className="paper-bit absolute -left-[3px] size-[5px] rounded-full bg-primary"
              style={{ top: `${8 + index * 12}%`, "--bit-x": `${bit.x}px`, "--bit-y": `${bit.y}px` } as React.CSSProperties}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
