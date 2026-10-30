import { CalendarDays, MapPin } from "lucide-react";

import { AboutEventDialog } from "@/components/event/AboutEventDialog";
import { EventImage } from "@/components/event/EventImage";
import type { ApiEvent } from "@/lib/event-details";
import { formatEventDate } from "@/lib/event-details";
import { percentRemaining } from "@/lib/ticket-stock";

interface EventHeroProps {
  event: ApiEvent;
  // Tickets left across every type; null while the contract reads load
  availability: { remaining: number; supply: number } | null;
}

// Hero card from Figma (Event detail / Default): cover image with a dark vignette, category tag,
// "About this event", title, date and venue, then the ticket availability bar.
export function EventHero({ event, availability }: EventHeroProps) {
  return (
    <section className="overflow-hidden rounded-lg bg-card shadow-[0_25px_50px_-12px_rgb(0_0_0/25%)]">
      <div className="relative h-[280px] md:h-[390px]">
        <EventImage src={event.image_url} />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-black/60" aria-hidden="true" />

        {event.category && (
          <span className="absolute top-5 left-5 rounded-sm border border-primary/70 bg-black/60 px-[11px] py-[5px] font-mono text-[10px] leading-[15px] font-medium tracking-[0.025em] text-primary backdrop-blur-md">
            {event.category}
          </span>
        )}
        <div className="absolute top-5 right-4">
          <AboutEventDialog event={event} />
        </div>

        <div className="absolute inset-x-4 bottom-6 flex flex-col gap-1 md:right-4 md:left-6">
          <h1 className="font-serif text-[32px] leading-[1.1] font-semibold tracking-[-0.025em] text-foreground drop-shadow-md md:text-5xl md:leading-[48px]">
            {event.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2">
            <span className="flex items-center gap-1.5 text-xs text-secondary-foreground">
              <CalendarDays className="size-4 text-primary" aria-hidden="true" />
              {formatEventDate(event.start_date)}
            </span>
            {event.location && (
              <span className="flex items-center gap-1.5 type-mono-address text-secondary-foreground">
                <MapPin className="size-4 text-primary" aria-hidden="true" />
                {event.location}
              </span>
            )}
          </div>
        </div>
      </div>

      <AvailabilityBar availability={availability} />
    </section>
  );
}

// "Ticket Availability Status" bar under the hero. The fill is the share of tickets left.
function AvailabilityBar({ availability }: Pick<EventHeroProps, "availability">) {
  const remaining = availability?.remaining ?? 0;
  const supply = availability?.supply ?? 0;
  const percent = percentRemaining(remaining, supply);

  return (
    <div className="flex flex-col gap-3 border-t border-primary px-5 pt-[15px] pb-[14px] sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-xs font-semibold text-foreground">Ticket Availability Status</h2>
        <p className="text-[11px] leading-[16.5px] text-muted-foreground">
          {!availability
            ? "Checking availability…"
            : supply === 0
              ? "No tickets yet"
              : `${remaining.toLocaleString("en-US")} of ${supply.toLocaleString("en-US")} tickets left`}
        </p>
      </div>
      {availability && supply > 0 && (
        <div className="flex items-center gap-3 sm:min-w-[280px] sm:justify-end">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-popover sm:w-40"
            role="progressbar"
            aria-label="Tickets remaining"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-soft" style={{ width: `${percent}%` }} />
          </div>
          <span className="shrink-0 text-xs font-bold text-primary">{remaining === 0 ? "Sold out" : `${percent}% remaining`}</span>
        </div>
      )}
    </div>
  );
}
