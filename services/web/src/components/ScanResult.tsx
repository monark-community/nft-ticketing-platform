"use client";

// Result screen for the ticket scanner (#58).


import { TransactionStatus } from "@/components/TransactionStatus";
import type { TxState } from "@/lib/transactions/types";
import type { TicketVerification } from "@/lib/verify-ticket";

type CheckInStatus = "idle" | "pending" | "success" | "error";

interface Props {
  result: TicketVerification;
  checkInStatus: CheckInStatus;
  txHash: `0x${string}` | null;
  transaction: TxState;
  explorerUrl: string | null;
  onStopWaiting: () => void;
  onCheckIn: () => void;
  onScanNext: () => void;
  canCheckIn: boolean;
}

type View = "valid" | "checkedIn" | "rejected";

const STYLES: Record<View, { panel: string; icon: string; title: string; subtitle: string }> = {
  valid: {
    panel: "bg-muted border-border",
    icon: "bg-primary",
    title: "text-foreground",
    subtitle: "text-foreground",
  },
  checkedIn: {
    panel: "bg-success-bg border-success/40",
    icon: "bg-success",
    title: "text-success",
    subtitle: "text-success",
  },
  rejected: {
    panel: "bg-destructive-bg border-destructive/40",
    icon: "bg-destructive",
    title: "text-destructive",
    subtitle: "text-destructive",
  },
};

const HEADINGS: Record<View, { title: string; subtitle: string }> = {
  valid: { title: "Valid ticket", subtitle: "Check in to admit this attendee" },
  checkedIn: { title: "Checked in", subtitle: "Admit attendee" },
  rejected: { title: "Rejected", subtitle: "Do not admit" },
};

function shortenHex(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function secondsAgo(timestamp: number) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  return seconds === 1 ? "1 second ago" : `${seconds} seconds ago`;
}

function StatusIcon({ view }: { view: View }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-background shrink-0 ${STYLES[view].icon}`}>
      <svg viewBox="0 0 24 24" className="w-8 h-8" aria-hidden="true">
        {view === "rejected" ? (
          <path d="M6 6l12 12M18 6L6 18" {...common} />
        ) : view === "checkedIn" ? (
          <path d="M5 12.5l4.5 4.5L19 7.5" {...common} />
        ) : (
          <path d="M12 7v6M12 17h.01" {...common} />
        )}
      </svg>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-border last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`text-sm font-semibold text-foreground text-right ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

export function ScanResult({ result, checkInStatus, txHash, transaction, explorerUrl, onStopWaiting, onCheckIn, onScanNext, canCheckIn }: Props) {
  const view: View = !result.ok ? "rejected" : checkInStatus === "success" ? "checkedIn" : "valid";
  const styles = STYLES[view];
  const heading = HEADINGS[view];
  const pending = checkInStatus === "pending";

  return (
    <div role="status" aria-live="assertive" className={`rounded-xl border-2 p-5 shadow-sm ${styles.panel}`}>
      {/* Status */}
      <div className="flex items-center gap-4">
        <StatusIcon view={view} />
        <div>
          <p className={`text-2xl font-bold leading-tight ${styles.title}`}>{heading.title}</p>
          <p className={`text-sm font-semibold uppercase tracking-wide ${styles.subtitle}`}>{heading.subtitle}</p>
        </div>
      </div>

      {/* Why it was rejected */}
      {view === "rejected" && result.reason && (
        <p className="mt-4 rounded-lg bg-card border border-destructive/40 px-4 py-3 text-base font-medium text-destructive">
          {result.reason}
        </p>
      )}

      {/* Ticket details */}
      {result.qr && (
        <dl className="mt-4 rounded-lg bg-background/60 px-4">
          <DetailRow label="Ticket" value={`#${result.qr.tokenId}`} />
          <DetailRow label="Event" value={result.eventId !== undefined ? `#${result.eventId}` : "Unknown"} />
          {result.owner && <DetailRow label="Owner" value={shortenHex(result.owner)} mono />}
          <DetailRow label="QR signed" value={secondsAgo(result.qr.timestamp)} />
          {txHash && <DetailRow label="Transaction" value={shortenHex(txHash)} mono />}
        </dl>
      )}
      {view === "valid" && !canCheckIn && (
        <p className="mt-4 rounded-lg bg-primary-tint border border-border-accent px-4 py-3 text-sm font-medium text-primary-soft">
          This wallet is not a scanner for this event, so it cannot check the ticket in.
        </p>
      )}
      {/* Check-in progress (#102) and failure (#105). The green "Checked in" panel above is the success state. */}
      {view === "valid" && (pending || checkInStatus === "error" || transaction.phase === "stoppedWaiting") && (
        <div className="mt-4">
          <TransactionStatus state={transaction} explorerUrl={explorerUrl} onStopWaiting={onStopWaiting} />
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex flex-col gap-2">
        {view === "valid" && (
          <button
            onClick={onCheckIn}
            disabled={pending || !canCheckIn}
            className="w-full bg-success hover:bg-success/90 disabled:bg-disabled disabled:text-disabled-foreground disabled:cursor-not-allowed text-background text-lg font-bold py-3 rounded-lg"
          >
            {pending ? "Checking in..." : checkInStatus === "error" ? "Try check-in again" : "Check in ticket"}
          </button>
        )}
        <button
          onClick={onScanNext}
          disabled={pending}
          className={`w-full disabled:bg-disabled disabled:text-disabled-foreground disabled:border-transparent disabled:cursor-not-allowed font-semibold py-3 rounded-lg ${
            view === "valid"
              ? "bg-card border border-border text-secondary-foreground hover:bg-muted"
              : "bg-primary hover:bg-primary/90 text-primary-foreground"
          }`}
        >
          Scan next ticket
        </button>
      </div>
    </div>
  );
}
