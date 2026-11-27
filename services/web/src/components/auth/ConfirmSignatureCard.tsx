"use client";

import { Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { AuthCard } from "@/components/auth/AuthCard";
import { WalletPill } from "@/components/auth/WalletPill";
import { DrawnCheck, RollingNumber } from "@/components/motion";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// checking = looking for an existing session; waiting = the wallet shows the message to sign;
// failed = cancelled in the wallet, or the API couldn't be reached; signed = it went through, shown
// for a moment before a new account goes on to Create account (#371)
export type SignatureStatus = "checking" | "waiting" | "failed" | "signed";

// If "checking" lasts this long, nothing is going to open the wallet on its own
// (e.g. the session expired mid-way), so offer the button
const STALLED_AFTER_MS = 4000;

interface ConfirmSignatureCardProps {
  address: string;
  status: SignatureStatus;
  error?: { title: string; message: string } | null;
  onSign: () => void;
  onCancel: () => void; // disconnects the wallet and goes back to step 1
}

// Step 2 (Figma: Sign in / Confirm signature). Signing a message proves the wallet is yours;
// it is free and sends no transaction. The cancelled state isn't in Figma (#282 notes).
// Motion (#371): your wallet and NFTokenPass with dots travelling between them while the wallet
// waits; signing joins the line in green with a tick, cancelling breaks it before the message.
export function ConfirmSignatureCard({ address, status, error, onSign, onCancel }: ConfirmSignatureCardProps) {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (status !== "checking") return;
    const timer = setTimeout(() => setStalled(true), STALLED_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setStalled(false);
    };
  }, [status]);

  return (
    <AuthCard aria-labelledby="confirm-title" className="items-center text-center">
      {/* Thin orange sheen along the top edge */}
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" aria-hidden="true" />

      <div className="flex flex-col items-center gap-3 sm:px-2">
        <WalletPill address={address} />

        <h1 id="confirm-title" className="pt-3 type-heading-md tracking-[-0.025em] text-foreground">
          Confirm it&apos;s you
        </h1>
        <p className="max-w-[340px] pb-5 type-body-md text-secondary-foreground">
          Sign a message in your wallet to log in. This is free and doesn&apos;t send a transaction.
        </p>

        <Handshake status={status} />

        {status === "failed" && (
          // Once the line has broken
          <div className="w-full animate-[fade-in_160ms_ease-out_180ms_backwards]">
            <Alert tone="error" title={error?.title ?? "Signature cancelled"} className="w-full text-left">
              {error?.message}
            </Alert>
          </div>
        )}

        {(status === "failed" || stalled) && (
          <Button size="lg" className="mt-3 w-full" onClick={onSign}>
            Sign message
          </Button>
        )}

        <Button
          variant="ghost"
          size="lg"
          className="mt-3 w-full bg-popover text-[15px] font-medium tracking-normal text-foreground normal-case hover:bg-muted"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </AuthCard>
  );
}

const LABEL: Record<SignatureStatus, string> = {
  checking: "Checking your wallet…",
  waiting: "Waiting for signature…",
  signed: "Signed",
  failed: "Not signed",
};

// Your wallet on the left, NFTokenPass on the right, and the line between them (globals.css)
function Handshake({ status }: { status: SignatureStatus }) {
  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-md bg-background px-4 py-4" data-handshake={status}>
      <div className="flex w-full max-w-[260px] items-center gap-2" aria-hidden="true">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-md bg-popover text-primary">
          <Wallet className="size-4" />
        </span>
        <span className="handshake-wire relative h-0.5 flex-1">
          <i className="handshake-half left-0" data-half="left" />
          <i className="handshake-half right-0" data-half="right" />
          {(status === "checking" || status === "waiting") && (
            <>
              <b className="handshake-dot" />
              <b className="handshake-dot [animation-delay:0.46s]" />
              <b className="handshake-dot [animation-delay:0.93s]" />
            </>
          )}
          {status === "signed" && (
            <span className="punch absolute top-1/2 left-1/2 -mt-[11px] -ml-[11px] flex size-[22px] items-center justify-center rounded-full bg-success text-background">
              <DrawnCheck className="size-3.5" />
            </span>
          )}
        </span>
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-md bg-popover">
          <span className="size-3 rounded-[2px] bg-primary" />
        </span>
      </div>
      <span
        role="status"
        className={cn(
          "text-[13px] leading-5 font-medium tracking-[0.025em]",
          status === "signed" ? "text-success" : status === "failed" ? "text-destructive" : "text-foreground",
        )}
      >
        {/* Rolls over to the new words */}
        <RollingNumber value={LABEL[status]} align="center" />
      </span>
    </div>
  );
}
