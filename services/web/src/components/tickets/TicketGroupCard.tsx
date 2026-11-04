"use client";

import { Calendar, CircleCheck, Clock, MapPin, QrCode } from "lucide-react";

import { EventImage } from "@/components/event/EventImage";
import { Button } from "@/components/ui/button";
import {
  formatCheckInDate,
  formatTicketDate,
  ticketCountLabel,
  typeBadgeLabel,
  typeTone,
  type TypeTone,
  type TicketGroup,
  type TicketView,
} from "@/lib/my-tickets";
import { cn } from "@/lib/utils";

// One card per event + ticket type + status, from the Figma "My Tickets / Grid" and "List" frames.
// "Sell on Marketplace" from the design is left out until the Marketplace exists (#295).
export function TicketGroupCard({ group, view, onShowQr }: { group: TicketGroup; view: TicketView; onShowQr: () => void }) {
  const past = group.status !== "valid";

  if (view === "list") {
    return (
      // Phones: a small thumbnail next to the details, the action underneath. Wider: one row as in Figma.
      <article
        className={cn(
          "grid grid-cols-[88px_minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-card shadow-[0_4px_24px_rgb(0_0_0/40%)] sm:flex sm:min-h-[140px] sm:flex-row sm:items-stretch",
          past && "opacity-70",
        )}
      >
        <div className="relative mt-4 ml-4 h-20 shrink-0 overflow-hidden rounded-sm sm:m-0 sm:my-3 sm:h-auto sm:w-52 sm:rounded-none">
          <EventImage src={group.event?.image_url ?? null} className={cn(past && "grayscale-[60%]")} />
          <div className="absolute inset-0 hidden bg-gradient-to-r from-card/60 via-transparent to-transparent sm:block" aria-hidden="true" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 px-4 py-4 sm:px-5">
          <Tags group={group} withType />
          <h3 className="font-serif text-xl leading-7 font-medium tracking-[-0.5px] text-foreground">{group.title}</h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <When group={group} />
          </div>
        </div>

        <div className="col-span-2 flex flex-col items-stretch justify-center gap-2.5 px-4 pb-4 sm:min-w-[200px] sm:items-end sm:border-l sm:border-white/5 sm:px-6 sm:py-4">
          <Action group={group} onShowQr={onShowQr} compact />
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[0_4px_24px_rgb(0_0_0/40%)]",
        past && "opacity-70",
      )}
    >
      <div className="relative h-48 shrink-0 overflow-hidden">
        <EventImage src={group.event?.image_url ?? null} className={cn(past && "grayscale-[60%]")} />
        <div className="absolute inset-0 bg-gradient-to-t from-card/80 via-transparent to-transparent" aria-hidden="true" />
      </div>

      <div className="flex flex-1 flex-col justify-between gap-5 p-5">
        <div className="flex flex-col gap-1">
          {/* Past cards leave the type out to fit "Used · Collectible", as in Figma */}
          <Tags group={group} withType={!past} />
          <h3 className="pt-2 font-serif text-xl leading-7 font-medium text-foreground">{group.title}</h3>
          <When group={group} />
        </div>

        <div className="flex flex-col gap-2">
          <Action group={group} onShowQr={onShowQr} />
        </div>
      </div>
    </article>
  );
}

const TAG = "rounded-xs px-2 py-0.5 font-mono text-xs leading-4 whitespace-nowrap";
const STATUS = "shrink-0";

function StatusTags({ group }: { group: TicketGroup }) {
  if (group.status === "valid") return <span className={cn(TAG, STATUS, "bg-success-bg text-success")}>Valid</span>;
  if (group.status === "expired") return <span className={cn(TAG, STATUS, "bg-muted text-muted-foreground")}>Expired</span>;
  // Checked-in tickets stay in the wallet as collectibles: resale has no price cap after use
  return (
    <>
      <span className={cn(TAG, STATUS, "bg-muted text-muted-foreground")}>Used</span>
      <span className={cn(TAG, STATUS, "border border-primary text-primary")}>Collectible</span>
    </>
  );
}

// Status, type and "Ticket #12" on one line that never wraps: a long type name is shortened with
// "…" (full name on hover and in the QR popup), so cards in a row stay lined up.
function Tags({ group, withType }: { group: TicketGroup; withType: boolean }) {
  const type = withType ? typeBadgeLabel(group) : null;
  const count = ticketCountLabel(group);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <StatusTags group={group} />
      {type && (
        <span className={cn(TAG, "min-w-0 truncate uppercase", TYPE_TONE[typeTone(group.tickets[0].typeId)])} title={type}>
          {type}
        </span>
      )}
      <span className="ml-auto shrink-0 pl-2 font-mono text-xs leading-4 text-muted-foreground">{count}</span>
    </div>
  );
}

// Ticket type colors: white, gold, burgundy (see typeTone). Kept apart from the status colors
// (green valid, red expired/errors) and the orange used for actions.
const TYPE_TONE: Record<TypeTone, string> = {
  white: "bg-white/10 text-zinc-100 ring-1 ring-inset ring-white/20",
  gold: "bg-amber-400/12 text-amber-300 ring-1 ring-inset ring-amber-400/35",
  burgundy: "bg-[#7a1530]/45 text-[#f2b8c6] ring-1 ring-inset ring-[#9b1d3f]/70",
};

function When({ group }: { group: TicketGroup }) {
  const date = group.event ? formatTicketDate(group.event.start_date, group.status === "valid") : null;
  const location = group.event?.location;

  return (
    <>
      {date && (
        <p className="flex items-center gap-1.5 pt-1 text-xs leading-4 text-secondary-foreground">
          <Calendar className="size-3 shrink-0" aria-hidden="true" />
          {date}
        </p>
      )}
      {location && (
        <p className="flex items-center gap-1.5 text-xs leading-4 text-muted-foreground">
          <MapPin className="size-3 shrink-0" aria-hidden="true" />
          {location}
        </p>
      )}
    </>
  );
}

function Action({ group, onShowQr, compact = false }: { group: TicketGroup; onShowQr: () => void; compact?: boolean }) {
  if (group.status === "valid") {
    const count = group.tickets.length;
    return (
      <Button
        onClick={onShowQr}
        className={cn("h-10 text-sm font-semibold tracking-normal normal-case", compact ? "px-5 sm:h-9" : "w-full")}
        aria-label={count > 1 ? `Show entry QR codes for ${count} tickets to ${group.title}` : `Show entry QR for ${group.title}`}
      >
        <QrCode className="size-3.5" aria-hidden="true" />
        Show entry QR
      </Button>
    );
  }

  const text =
    group.status === "used"
      ? group.checkedInAt
        ? `Checked in on ${formatCheckInDate(group.checkedInAt)}`
        : "Checked in"
      : "This event has ended";
  const Icon = group.status === "used" ? CircleCheck : Clock;

  return (
    <p
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-sm bg-background/50 py-2.5 font-mono text-xs leading-4 text-muted-foreground",
        compact ? "px-3" : "w-full",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", group.status === "used" && "text-success")} aria-hidden="true" />
      {text}
    </p>
  );
}
