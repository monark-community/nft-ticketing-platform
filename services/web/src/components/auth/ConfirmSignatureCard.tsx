"use client";

import { useEffect, useState } from "react";

import { AuthCard } from "@/components/auth/AuthCard";
import { WalletPill } from "@/components/auth/WalletPill";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

// checking = looking for an existing session; waiting = the wallet shows the message to sign;
// failed = cancelled in the wallet, or the API couldn't be reached
export type SignatureStatus = "checking" | "waiting" | "failed";

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

        {status === "failed" ? (
          <Alert tone="error" title={error?.title ?? "Signature cancelled"} className="w-full text-left">
            {error?.message}
          </Alert>
        ) : (
          <div role="status" className="flex w-full items-center justify-center gap-3 rounded-md bg-background py-4">
            <span className="relative flex size-5 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-primary/30 blur-[4px]" aria-hidden="true" />
              <Spinner className="relative size-5 text-primary" />
            </span>
            <span className="text-[13px] leading-5 font-medium tracking-[0.025em] text-foreground">
              {status === "checking" ? "Checking your wallet…" : "Waiting for signature…"}
            </span>
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
