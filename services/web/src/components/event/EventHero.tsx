import { CalendarDays, MapPin } from "lucide-react";
import { Fragment, type CSSProperties } from "react";

import { AboutEvent } from "@/components/event/AboutEvent";
import { EventImage } from "@/components/event/EventImage";
import { CountUp } from "@/components/motion/CountUp";
import { SharedPicture } from "@/components/motion/SharedPicture";
import type { ApiEvent } from "@/lib/event-details";
import { formatEventDate } from "@/lib/event-details";
import { percentRemaining } from "@/lib/ticket-stock";
import { cn } from "@/lib/utils";

interface EventHeroProps {
  // null while the event loads after a click on its card: only the picture shows then
  event: ApiEvent | null;
  eventId: string;
  // The clicked card's picture, shown until the event has loaded (#363)
  loadingPicture?: string | null;
  // Tickets left across every type; null while the contract reads load
  availability: { remaining: number; supply: number } | null;
  // The event loaded after the page opened: what it adds fades in
  arrivedLate?: boolean;
  // Opened directly, without a card's picture to fly from: the picture develops (#367)
  develop?: boolean;
}

// Hero card from Figma (Event detail / Default): cover image with a dark vignette, category tag,
// title, date and venue, then the ticket availability bar and the "About this event" row, which
// opens in place (a dropdown at Monark's request, where the Figma has a pill that opens a popup).
// Arriving (#367): the picture develops like a photo when there's no card to fly from, the tag
// slides in, the title rises word by word, then the date and venue fade in (about 0.7 s), and the
// availability bar grows to its width while its number counts. Coming from a card, all of it waits
// until the picture has landed (data-hero-arrival, see globals.css).
export function EventHero({ event, eventId, loadingPicture = null, availability, arrivedLate = false, develop = false }: EventHeroProps) {
  return (
    <section
      data-hero-arrival
      className="overflow-hidden rounded-lg bg-card shadow-[0_25px_50px_-12px_rgb(0_0_0/25%)]"
      aria-busy={event ? undefined : true}
    >
      <div className="relative h-[280px] rounded-t-lg md:h-[390px]">
        {/* The same picture as on the event's card, under the hero's dark vignette: it flies from
            the card when the page opens (#363) */}
        <SharedPicture eventId={eventId} role="hero">
          <EventImage src={event ? event.image_url : loadingPicture} className={develop ? "photo-develop" : undefined} />
        </SharedPicture>
        {event && <HeroText event={event} />}
      </div>

      {event ? (
        // Fades in when the event loads after the page opened
        <div className={cn(arrivedLate && "animate-[page-in_200ms_ease-out_backwards]")}>
          <AvailabilityBar availability={availability} />
          <AboutEvent event={event} />
        </div>
      ) : (
        // Room for the availability bar, so the page doesn't jump when the event arrives
        <div className="h-[60px] border-t border-primary" aria-hidden="true" />
      )}
    </section>
  );
}

// Category tag, title, date and venue over the picture
function HeroText({ event }: { event: ApiEvent }) {
  const words = event.title.split(/\s+/).filter(Boolean);
  // As in the Motion Guide: the tag slides in after the picture starts (120 ms), the words rise from
  // 140 ms, 60 ms apart, and the date and venue fade in as the last word rises: about 0.7 s in all
  const metaDelay = Math.min(140 + words.length * 60 + 60, 560);
  return (
    <>
      {event.category && (
        <span className="absolute top-5 left-5 animate-[slide-in-left_220ms_var(--ease-arrive)_120ms_backwards] rounded-sm border border-primary/70 bg-black/60 px-[11px] py-[5px] font-mono text-[10px] leading-[15px] font-medium tracking-[0.025em] text-primary backdrop-blur-md">
          {event.category}
        </span>
      )}

      <div className="absolute inset-x-4 bottom-6 flex flex-col gap-1 md:right-4 md:left-6">
        <h1 className="font-serif text-[32px] leading-[1.1] font-semibold tracking-[-0.025em] text-foreground drop-shadow-md md:text-5xl md:leading-[48px]">
          {/* Each word rises through its own mask, 60 ms after the one before; the spaces stay
              plain text, so the heading reads as one title */}
          {words.map((word, index) => (
            <Fragment key={index}>
              {index > 0 && " "}
              <span className="-mb-[0.15em] inline-block overflow-hidden pb-[0.15em] align-bottom">
                <span
                  className="inline-block animate-[word-rise_320ms_var(--ease-arrive)_backwards] [animation-delay:var(--word-delay)]"
                  style={{ "--word-delay": `${140 + index * 60}ms` } as CSSProperties}
                >
                  {word}
                </span>
              </span>
            </Fragment>
          ))}
        </h1>
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 animate-[fade-in_200ms_ease-out_backwards] [animation-delay:var(--meta-delay)]"
          style={{ "--meta-delay": `${metaDelay}ms` } as CSSProperties}
        >
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
    </>
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
            {/* Grows to its width once the hero has arrived (420 ms, from 300 ms), and slides when tickets sell (#367) */}
            <div
              className="h-full origin-left animate-[bar-grow_420ms_var(--ease-arrive)_300ms_backwards] rounded-full bg-gradient-to-r from-primary to-primary-soft transition-[width] duration-[420ms]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-bold text-primary">
            {remaining === 0 ? "Sold out" : <CountUp value={percent} from={0} delay={300} ms={420} format={formatPercentLeft} />}
          </span>
        </div>
      )}
    </div>
  );
}

// "66.8% remaining", as percentRemaining rounds it (one decimal at most)
function formatPercentLeft(value: number) {
  return `${Math.round(value * 10) / 10}% remaining`;
}
