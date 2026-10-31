"use client";

import { Dialog } from "@base-ui/react/dialog";
import { ChevronLeft, ChevronRight, RotateCw, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useEntryQr, type EntryQr } from "@/hooks/useEntryQr";
import { formatTicketDate, qrSecondsLeft, type TicketGroup } from "@/lib/my-tickets";
import { QR_MAX_AGE_SECONDS } from "@/lib/ticket-qr";
import { cn } from "@/lib/utils";

// Entry QR popup from the Figma "My Tickets / QR open" and "QR expired" frames (#286).
// Opening it asks the wallet to sign for the first ticket; the arrows move between the group's tickets
// and each one is signed when shown. Closing it forgets every code.
// Not in Figma: waiting for the signature, and a cancelled or failed signature.
export function EntryQrDialog({ group, onClose }: { group: TicketGroup | null; onClose: () => void }) {
  return (
    <Dialog.Root open={group !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[520px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-primary/40 bg-[#131313] px-5 py-8 shadow-[0_0_25px_rgb(249_115_22/25%)] outline-none transition-[opacity,scale] duration-200 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 sm:px-8">
          {/* Keyed by group, so another group starts again at its first ticket with no codes */}
          {group && <EntryQrContent key={group.key} group={group} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EntryQrContent({ group }: { group: TicketGroup }) {
  const [index, setIndex] = useState(0);
  const { codes, sign } = useEntryQr();
  const now = useNowSeconds();

  const ticket = group.tickets[Math.min(index, group.tickets.length - 1)];
  const code = codes[ticket.tokenId.toString()];
  const total = group.tickets.length;
  const secondsLeft = code?.status === "ready" ? qrSecondsLeft(code.timestamp, now) : 0;
  const expired = code?.status === "ready" && secondsLeft === 0;
  const signing = code?.status === "signing";

  // Ask for a signature the first time each ticket is shown (one request at a time, see useEntryQr)
  useEffect(() => {
    if (!code) sign(ticket);
  }, [code, sign, ticket]);

  const date = group.event ? formatTicketDate(group.event.start_date, true) : null;
  const details = [group.typeName, date].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Dialog.Close
        className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Close"
      >
        <X className="size-4" aria-hidden="true" />
      </Dialog.Close>

      <Dialog.Title className="px-8 font-serif text-2xl leading-8 font-medium tracking-[-0.75px] text-white sm:text-3xl sm:leading-9">
        {group.title}
      </Dialog.Title>

      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center justify-center gap-3 sm:gap-4">
          {total > 1 && (
            <PagerButton label="Previous ticket" disabled={index === 0 || signing} onClick={() => setIndex((i) => i - 1)}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </PagerButton>
          )}
          <p className="font-mono text-lg leading-7 font-medium tracking-[0.45px] text-white" aria-live="polite">
            {total > 1 ? (
              <>
                Ticket {index + 1} of {total} <span className="font-normal text-muted-foreground">·</span>{" "}
              </>
            ) : (
              "Ticket "
            )}
            <span className="font-semibold text-primary">#{ticket.tokenId.toString()}</span>
          </p>
          {total > 1 && (
            <PagerButton label="Next ticket" disabled={index === total - 1 || signing} onClick={() => setIndex((i) => i + 1)}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </PagerButton>
          )}
        </div>
        {total > 1 && (
          <div className="flex items-center gap-1.5 pt-0.5" aria-hidden="true">
            {group.tickets.map((t, i) => (
              <span key={t.tokenId.toString()} className={cn("size-2 rounded-full", i === index ? "bg-primary" : "bg-white/30")} />
            ))}
          </div>
        )}
      </div>

      {details && <Dialog.Description className="text-sm leading-5 text-secondary-foreground">{details}</Dialog.Description>}

      <StatusPill code={code} expired={expired} />

      <QrBox code={code} expired={expired} />

      <Footer code={code} expired={expired} secondsLeft={secondsLeft} onSign={() => sign(ticket)} />

      <p className="max-w-[320px] text-[11px] leading-4 text-muted-foreground">
        Show this at the entrance. The code expires after {QR_MAX_AGE_SECONDS} seconds.
      </p>
    </div>
  );
}

function PagerButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center rounded-full border border-primary bg-[#131313] text-primary shadow-[0_0_6px_rgb(249_115_22/35%)] transition-opacity outline-none hover:bg-primary-tint focus-visible:ring-3 focus-visible:ring-ring/50 disabled:border-border disabled:text-disabled-foreground disabled:shadow-none"
    >
      {children}
    </button>
  );
}

function StatusPill({ code, expired }: { code: EntryQr | undefined; expired: boolean }) {
  if (code?.status === "ready" && !expired) {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-success/30 bg-success/12 px-3 py-1 font-mono text-xs leading-4 font-medium tracking-[0.3px] text-success">
        <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
        Ready to scan
      </span>
    );
  }
  if (!code || code.status === "signing") {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-border-accent bg-primary-tint px-3 py-1 font-mono text-xs leading-4 font-medium tracking-[0.3px] text-primary">
        <span className="size-1.5 rounded-full bg-primary animate-pulse-dot" aria-hidden="true" />
        Confirm in your wallet
      </span>
    );
  }
  return null;
}

const BOX = "flex size-[260px] items-center justify-center rounded-lg sm:size-[280px]";

function QrBox({ code, expired }: { code: EntryQr | undefined; expired: boolean }) {
  if (code?.status === "ready") {
    return (
      <div className="relative pt-1">
        <div
          className={cn(
            BOX,
            "border-[6px] bg-white p-5",
            expired
              ? "border-destructive opacity-35 blur-[4px] shadow-[0_0_12px_rgb(255_180_171/45%)]"
              : "border-success shadow-[0_0_10px_rgb(139_216_164/35%)]",
          )}
          role="img"
          aria-label={expired ? "Expired entry QR code" : "Entry QR code"}
        >
          <QRCodeSVG value={code.value} size={208} level="M" className="size-full" />
        </div>
        {expired && (
          <span className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive-bg px-3 py-1 font-mono text-xs leading-4 text-destructive shadow-lg">
            <span className="size-1.5 rounded-full bg-destructive" aria-hidden="true" />
            Expired
          </span>
        )}
      </div>
    );
  }

  const waiting = !code || code.status === "signing";
  return (
    <div className={cn(BOX, "mt-1 flex-col gap-3 border border-dashed border-border bg-card px-8")}>
      {waiting ? (
        <>
          <Spinner className="size-6 text-primary" />
          <p className="text-sm leading-5 text-secondary-foreground">Sign the message in your wallet to show your QR code. It&apos;s free.</p>
        </>
      ) : (
        <p className="text-sm leading-5 text-muted-foreground">No QR code yet</p>
      )}
    </div>
  );
}

function Footer({ code, expired, secondsLeft, onSign }: { code: EntryQr | undefined; expired: boolean; secondsLeft: number; onSign: () => void }) {
  if (code?.status === "ready" && !expired) {
    return (
      <>
        <div className="flex w-[260px] flex-col gap-1.5 py-2 sm:w-[280px]">
          <p className="flex items-center gap-1.5 font-mono text-xs leading-4 text-primary" aria-live="off">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            Expires in {secondsLeft}s
          </p>
          <div className="h-1 overflow-hidden rounded-full bg-primary/20" aria-hidden="true">
            <div className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${(secondsLeft / QR_MAX_AGE_SECONDS) * 100}%` }} />
          </div>
        </div>
        <button
          type="button"
          onClick={onSign}
          className="flex w-[260px] items-center justify-center gap-2 rounded-md border border-input bg-card px-4 py-2.5 font-mono text-xs leading-4 font-medium text-zinc-200 outline-none hover:border-border-accent focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-[280px]"
        >
          <RotateCw className="size-3" aria-hidden="true" />
          Regenerate code
        </button>
      </>
    );
  }

  if (!code || code.status === "signing") return null;

  const message = expired
    ? "This code expired. Tap Regenerate code to sign a new one."
    : code.status === "cancelled"
      ? "Signature cancelled. Sign the message in your wallet to show this ticket's QR code."
      : "We couldn't get a signature from your wallet. Check that it's unlocked and try again.";

  return (
    <>
      <p className="pt-2 text-xs leading-4 text-destructive" role="alert">
        {message}
      </p>
      <Button onClick={onSign} className="h-11 w-full rounded-md text-sm font-semibold tracking-normal normal-case">
        <RotateCw className="size-3" aria-hidden="true" />
        {expired ? "Regenerate code" : "Sign to show QR"}
      </Button>
    </>
  );
}

// The current time in seconds, updated every second while the popup is open
function useNowSeconds() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
