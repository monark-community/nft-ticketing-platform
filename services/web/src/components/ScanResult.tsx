"use client";

// Result screen for the ticket scanner (#58).


import type { TicketVerification } from "@/lib/verify-ticket";

type CheckInStatus = "idle" | "pending" | "success" | "error";

interface Props {
  result: TicketVerification;
  checkInStatus: CheckInStatus;
  checkInError: string | null;
  txHash: `0x${string}` | null;
  onCheckIn: () => void;
  onScanNext: () => void;
  canCheckIn: boolean;
}

type View = "valid" | "checkedIn" | "rejected";

const STYLES: Record<View, { panel: string; icon: string; title: string; subtitle: string }> = {
  valid: {
    panel: "bg-blue-50 border-blue-300",
    icon: "bg-blue-600",
    title: "text-blue-900",
    subtitle: "text-blue-800",
  },
  checkedIn: {
    panel: "bg-green-50 border-green-400",
    icon: "bg-green-600",
    title: "text-green-900",
    subtitle: "text-green-800",
  },
  rejected: {
    panel: "bg-red-50 border-red-400",
    icon: "bg-red-600",
    title: "text-red-900",
    subtitle: "text-red-800",
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
    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white shrink-0 ${STYLES[view].icon}`}>
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
    <div className="flex justify-between gap-4 py-2 border-b border-black/5 last:border-b-0">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className={`text-sm font-semibold text-gray-900 text-right ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

export function ScanResult({ result, checkInStatus, checkInError, txHash, onCheckIn, onScanNext, canCheckIn }: Props) {
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
        <p className="mt-4 rounded-lg bg-white border border-red-200 px-4 py-3 text-base font-medium text-red-900">
          {result.reason}
        </p>
      )}

      {/* Ticket details */}
      {result.qr && (
        <dl className="mt-4 rounded-lg bg-white/70 px-4">
          <DetailRow label="Ticket" value={`#${result.qr.tokenId}`} />
          <DetailRow label="Event" value={result.eventId !== undefined ? `#${result.eventId}` : "Unknown"} />
          {result.owner && <DetailRow label="Owner" value={shortenHex(result.owner)} mono />}
          <DetailRow label="QR signed" value={secondsAgo(result.qr.timestamp)} />
          {txHash && <DetailRow label="Transaction" value={shortenHex(txHash)} mono />}
        </dl>
      )}
      {view === "valid" && !canCheckIn && (
        <p className="mt-4 rounded-lg bg-amber-50 border border-amber-300 px-4 py-3 text-sm font-medium text-amber-900">
          This wallet is not a scanner for this event, so it cannot check the ticket in.
        </p>
      )}
      {/* Check-in error (ticket is still valid, the transaction failed) */}
      {view === "valid" && checkInStatus === "error" && checkInError && (
        <p className="mt-4 rounded-lg bg-amber-50 border border-amber-300 px-4 py-3 text-sm font-medium text-amber-900">
          Check-in failed: {checkInError}
        </p>
      )}

      {/* Actions */}
      <div className="mt-5 flex flex-col gap-2">
        {view === "valid" && (
          <button
            onClick={onCheckIn}
            disabled={pending || !canCheckIn}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-lg font-bold py-3 rounded-lg"
          >
            {pending ? "Checking in... confirm in your wallet" : checkInStatus === "error" ? "Try check-in again" : "Check in ticket"}
          </button>
        )}
        <button
          onClick={onScanNext}
          disabled={pending}
          className={`w-full disabled:opacity-60 disabled:cursor-not-allowed font-semibold py-3 rounded-lg ${
            view === "valid"
              ? "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              : "bg-[#3a7bd5] hover:bg-[#2d63b0] text-white"
          }`}
        >
          Scan next ticket
        </button>
      </div>
    </div>
  );
}
