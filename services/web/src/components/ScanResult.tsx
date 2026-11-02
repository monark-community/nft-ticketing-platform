"use client";

// Result card for the ticket scanner (#58), restyled from the Figma "Scanner Page" frames (#287).
// Headings never say "valid" or "admit" before the check-in is confirmed on-chain (#282).

import { Check, Clock, Copy, RefreshCw, ScanLine, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ScannedTicketDetails } from "@/hooks/useScannedTicketDetails";
import { shortAddress } from "@/lib/format";
import { formatCheckedInAt, signedAgo, type ScanView } from "@/lib/scanner";
import type { TxState } from "@/lib/transactions/types";
import { cn } from "@/lib/utils";
import type { TicketVerification } from "@/lib/verify-ticket";

interface Props {
  result: TicketVerification;
  view: ScanView;
  transaction: TxState;
  explorerUrl: string | null;
  details: ScannedTicketDetails;
  scannedAt: number; // ms when the QR was read; "QR signed 12 seconds ago" is relative to it
  onCheckIn: () => void;
  onScanNext: () => void;
  onStopWaiting: () => void;
}

const FEE_NOTE = "Checking in records it on-chain and needs a small ETH network fee from this wallet.";

export function ScanResult({ result, view, transaction, explorerUrl, details, scannedAt, onCheckIn, onScanNext, onStopWaiting }: Props) {
  const tokenId = result.qr?.tokenId;
  const owner = result.owner ?? details.owner;
  const nowSeconds = Math.floor(scannedAt / 1000);

  const rows = (
    <DetailRows>
      {details.typeName && view !== "rejected" && <Row label="Ticket type" value={details.typeName} />}
      {tokenId && <Row label="Ticket" value={`#${tokenId}`} mono strong />}
      {owner && <Row label="Owner" value={shortAddress(owner)} mono strong />}
      {view === "rejected"
        ? details.checkedInAt !== null && <Row label="Checked in" value={formatCheckedInAt(details.checkedInAt, new Date(scannedAt))} />
        : result.qr && <Row label="QR signed" value={signedAgo(result.qr.timestamp, nowSeconds)} />}
      {view === "checkedIn" && transaction.hash && <HashRow hash={transaction.hash} explorerUrl={explorerUrl} />}
    </DetailRows>
  );

  if (view === "rejected") {
    return (
      <Card tone="danger" centered>
        <StatusIcon tone="danger">
          <X />
        </StatusIcon>
        <Heading tone="danger" title="Do not admit" subtitle={result.reason ?? "This ticket can't be used."} centered />
        {(tokenId || owner) && <Inset>{rows}</Inset>}
        <Button size="lg" className="w-full" onClick={onScanNext}>
          <ScanLine aria-hidden="true" />
          Scan next ticket
        </Button>
      </Card>
    );
  }

  if (view === "checkedIn") {
    return (
      <Card tone="success" centered>
        <StatusIcon tone="success">
          <Check />
        </StatusIcon>
        <Heading tone="success" title="Checked in" subtitle="Admit attendee" centered />
        {rows}
        <Button size="lg" className="w-full" onClick={onScanNext}>
          Scan next ticket
        </Button>
      </Card>
    );
  }

  if (view === "checkingIn") {
    const label = transaction.phase === "awaitingWallet" ? "Confirm in your wallet..." : transaction.phase === "preparing" ? "Preparing check-in..." : "Waiting for confirmation...";
    return (
      <Card tone="active">
        <div className="flex items-center gap-4 border-b border-border pb-4">
          <StatusIcon tone="active" small>
            <Spinner />
          </StatusIcon>
          <Heading tone="neutral" title="Checking in..." subtitle="Valid ticket · don't admit until confirmed" />
        </div>
        <Inset>{rows}</Inset>
        <WaitingButton label={label} />
        <p className="text-center type-body-sm text-muted-foreground">{FEE_NOTE}</p>
      </Card>
    );
  }

  if (view === "pending") {
    const stopped = transaction.phase === "stoppedWaiting";
    return (
      <Card tone="neutral">
        <div className="flex items-center gap-4 border-b border-border pb-4">
          <StatusIcon tone="active" small>
            <Clock />
          </StatusIcon>
          <Heading tone="neutral" title="Check-in pending" subtitle="Don't admit yet" />
        </div>
        <Inset>{rows}</Inset>
        <div className="flex flex-col gap-3 rounded-md border border-border-accent bg-primary-tint p-4">
          <p className="type-body-md text-foreground">
            {stopped
              ? "Stopped waiting. The check-in may still confirm, so check the transaction before letting this attendee in."
              : "This is taking longer than usual. The check-in may still confirm, so don't scan this ticket again yet."}
          </p>
          {transaction.hash && <HashRow hash={transaction.hash} explorerUrl={explorerUrl} accent />}
        </div>
        {stopped ? (
          <Button variant="secondary" size="lg" className="w-full" onClick={onScanNext}>
            Scan next ticket
          </Button>
        ) : (
          <>
            <WaitingButton label="Waiting for confirmation..." />
            <Button variant="ghost" size="sm" className="self-center" onClick={onStopWaiting}>
              Stop waiting
            </Button>
          </>
        )}
      </Card>
    );
  }

  if (view === "failed") {
    return (
      <Card tone="neutral">
        <div className="flex items-center gap-4 border-b border-border pb-4">
          <StatusIcon tone="danger" small>
            <span className="text-xl leading-none font-bold">!</span>
          </StatusIcon>
          <Heading tone="neutral" title="Check-in failed" subtitle="Ticket is still valid · try again" />
        </div>
        <Inset>{rows}</Inset>
        <Alert tone="error" title={transaction.error ?? "Check-in failed. Please try again."} />
        <Button size="lg" className="w-full" onClick={onCheckIn}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      </Card>
    );
  }

  // Valid ticket, not checked in yet
  return (
    <Card tone="valid">
      <div className="flex items-center gap-4 border-b border-border pb-4">
        <StatusIcon tone="success" small>
          <Check />
        </StatusIcon>
        <Heading tone="neutral" title="Valid ticket" subtitle="Check in to admit" />
      </div>
      {rows}
      <button
        type="button"
        onClick={onCheckIn}
        className="h-13 w-full rounded-sm bg-success type-title-lg text-background transition-colors hover:bg-success/90 focus-visible:ring-3 focus-visible:ring-success/40 focus-visible:outline-none"
      >
        Check in
      </button>
      <p className="text-center type-body-sm text-muted-foreground">{FEE_NOTE}</p>
    </Card>
  );
}

type Tone = "valid" | "active" | "neutral" | "success" | "danger";

const CARD: Record<Tone, string> = {
  valid: "border-2 border-success/60 bg-card shadow-[0_0_24px_rgb(134_239_172/12%)]",
  active: "border-2 border-primary bg-card shadow-[0_0_24px_rgb(249_115_22/12%)]",
  neutral: "border border-border bg-card shadow-[0_0_32px_rgb(249_115_22/6%)]",
  success: "border border-success/30 bg-[linear-gradient(180deg,var(--success-bg),var(--card)_70%)]",
  danger: "border border-destructive/40 bg-destructive-bg shadow-[0_0_32px_rgb(255_180_171/10%)]",
};

function Card({ tone, centered, children }: { tone: Tone; centered?: boolean; children: ReactNode }) {
  return (
    <section role="status" aria-live="assertive" className={cn("flex flex-col gap-5 rounded-lg p-5", centered && "items-stretch", CARD[tone])}>
      {children}
    </section>
  );
}

const ICON: Record<"success" | "danger" | "active", string> = {
  success: "bg-success-bg text-success ring-success/20",
  danger: "bg-destructive/25 text-destructive ring-destructive/20",
  active: "bg-primary-tint text-primary ring-primary/15",
};

function StatusIcon({ tone, small, children }: { tone: keyof typeof ICON; small?: boolean; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full ring-8",
        small ? "size-11 [&_svg]:size-5" : "size-14 self-center [&_svg]:size-6",
        ICON[tone]
      )}
    >
      {children}
    </span>
  );
}

const TITLE: Record<"neutral" | "success" | "danger", string> = {
  neutral: "text-foreground",
  success: "text-foreground",
  danger: "text-destructive",
};

const SUBTITLE: Record<"neutral" | "success" | "danger", string> = {
  neutral: "text-secondary-foreground",
  success: "text-success",
  danger: "text-foreground",
};

function Heading({ tone, title, subtitle, centered }: { tone: keyof typeof TITLE; title: string; subtitle: string; centered?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-0.5", centered && "items-center text-center")}>
      <p className={cn("type-heading-md", TITLE[tone])}>{title}</p>
      <p className={cn("type-body-md", SUBTITLE[tone])}>{subtitle}</p>
    </div>
  );
}

function Inset({ children }: { children: ReactNode }) {
  return <div className="rounded-md bg-background/50 px-3">{children}</div>;
}

function DetailRows({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col">{children}</dl>;
}

function Row({ label, value, mono, strong }: { label: string; value: ReactNode; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <dt className="type-body-md text-muted-foreground">{label}</dt>
      <dd className={cn("text-right text-foreground", mono ? "type-mono-value" : "type-body-lg", strong && "font-bold")}>{value}</dd>
    </div>
  );
}

function HashRow({ hash, explorerUrl, accent }: { hash: `0x${string}`; explorerUrl: string | null; accent?: boolean }) {
  const [copied, setCopied] = useState(false);
  const short = shortAddress(hash);

  async function copy() {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (http, permissions); the hash is still shown
    }
  }

  return (
    <div className={cn("flex items-center justify-between gap-4", !accent && "border-b border-border py-3 last:border-b-0")}>
      <dt className={accent ? "type-mono-value text-primary" : "type-body-md text-muted-foreground"}>Transaction</dt>
      <dd className="flex items-center gap-2 type-mono-value text-foreground">
        {explorerUrl ? (
          <a href={`${explorerUrl}/tx/${hash}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
            {short}
          </a>
        ) : (
          short
        )}
        <button type="button" onClick={copy} className="rounded-xs p-1 text-muted-foreground transition-colors hover:text-foreground" aria-label="Copy transaction hash">
          {copied ? <Check className="size-3.5 text-success" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
        </button>
      </dd>
    </div>
  );
}

function WaitingButton({ label }: { label: string }) {
  return (
    <Button size="lg" className="w-full" disabled>
      <Spinner />
      {label}
    </Button>
  );
}
