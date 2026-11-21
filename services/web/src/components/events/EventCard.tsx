"use client";

import { ArrowRight, Calendar, MapPin, Ticket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CountUp } from "@/components/motion/CountUp";
import { SharedPicture, usePictureLink } from "@/components/motion/SharedPicture";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { usePrefetchEvent } from "@/hooks/useEvent";
import { eventImageUrl } from "@/lib/event-details";
import { rememberEventPicture } from "@/lib/event-picture";
import { eventHref, eventStockStatus, formatEventDate, formatPrice, startingPrice, type EventSummary } from "@/lib/events";
import { cn } from "@/lib/utils";

// A notch bitten into the card's edge at the divider: a circle in the page's colour centred on the
// edge, with only its inner half showing (the outer half is clipped), so it covers the border there
const NOTCH =
  "pointer-events-none absolute top-0 -mt-[9px] size-[18px] scale-0 rounded-full border border-primary/55 bg-background transition-transform duration-[170ms] ease-[var(--ease-snap)] group-hover:scale-100 group-focus-visible:scale-100";

// Event card from the Figma "Events / Default" frame (#283).
// The whole card is one link to the event page, so the "View tickets" button is only a visual cue.
// On hover or keyboard focus it becomes a ticket with a stub (#366): two notches bite into its
// sides at the divider, which turns into a dashed tear line; the picture zooms 3% and the arrow
// steps forward. `countFrom` counts the price up from that number when the card first appears
// (after `countDelay` ms), while it prints in.
export function EventCard({ event, countFrom, countDelay = 0 }: { event: EventSummary; countFrom?: number; countDelay?: number }) {
  const [imageFailed, setImageFailed] = useState(false);
  const status = eventStockStatus(event.ticket_types);
  const price = startingPrice(event.ticket_types);
  const soldOut = status === "soldOut";
  // ipfs:// images go through the gateway (#284)
  const imageUrl = eventImageUrl(event.image_url);
  const showImage = imageUrl && !imageFailed;
  const href = eventHref(event.id);
  // The picture flies into the event page, which starts loading as soon as the pointer is on the card (#363)
  const openWithPicture = usePictureLink(event.id, href, "card");
  const prefetchEvent = usePrefetchEvent();
  const prefetch = () => prefetchEvent(event.id);

  return (
    <Link
      href={href}
      onClick={(click) => {
        // The event page shows this picture until the event has loaded (#363)
        rememberEventPicture(event.id, showImage ? event.image_url : null);
        openWithPicture(click);
      }}
      onPointerEnter={prefetch}
      onPointerDown={prefetch}
      onFocus={prefetch}
      // Not overflow-hidden: the notches reach over the card's edge (the picture clips itself)
      className="group flex h-full w-full flex-col rounded-lg border border-border bg-card transition-[border-color,box-shadow] duration-200 hover:border-primary/55 hover:shadow-[0_0_0_2px_rgb(249_115_22/55%),0_0_24px_rgb(249_115_22/22%)] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/30"
    >
      <div className="relative aspect-[16/9] overflow-hidden rounded-t-[calc(var(--radius-lg)-1px)] bg-muted">
        {/* The picture flies into the event page's hero, and back from it (#363) */}
        <SharedPicture eventId={event.id} role="card">
          {showImage ? (
            // Event images can come from any host (IPFS gateways, organizer uploads), so a plain img is used
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              onError={() => setImageFailed(true)}
              className={cn(
                "size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] group-focus-visible:scale-[1.03] motion-reduce:transition-none",
                soldOut && "opacity-60 grayscale-[40%]"
              )}
            />
          ) : (
            <div className="dot-grid flex size-full items-center justify-center text-muted-foreground">
              <Ticket className="size-10" aria-hidden="true" />
            </div>
          )}
        </SharedPicture>
        {status === "low" && (
          <Badge tone="warning" overlay dot className="after-flight absolute top-3 right-3">
            Low stock
          </Badge>
        )}
        {soldOut && (
          <Badge tone="neutral" overlay dot className="after-flight absolute top-3 right-3">
            Sold out
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        {event.category && <Badge tone="code" className="border border-border">{event.category}</Badge>}

        <h2 className="type-heading-sm text-foreground">{event.title}</h2>

        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-2 type-body-sm text-secondary-foreground">
            <Calendar className="size-3.5 text-primary" aria-hidden="true" />
            <time dateTime={event.start_date}>{formatEventDate(event.start_date)}</time>
          </p>
          {event.location && (
            <p className="flex items-center gap-2 type-mono-address text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{event.location}</span>
            </p>
          )}
        </div>

        {/* The divider: a dashed tear line with a notch on each side while hovered or focused */}
        <div className="relative mt-auto flex items-end justify-between gap-3 border-t border-border pt-4 transition-colors duration-[160ms] before:pointer-events-none before:absolute before:inset-x-0 before:-top-px before:border-t before:border-dashed before:border-primary/80 before:opacity-0 before:transition-opacity before:duration-[160ms] group-hover:border-t-transparent group-hover:before:opacity-100 group-focus-visible:border-t-transparent group-focus-visible:before:opacity-100">
          <span className={cn(NOTCH, "-left-[30px] [clip-path:inset(-2px_-2px_-2px_50%)]")} aria-hidden="true" />
          <span className={cn(NOTCH, "-right-[30px] [clip-path:inset(-2px_50%_-2px_-2px)]")} aria-hidden="true" />
          <div>
            <p className="type-label-sm text-muted-foreground">{price === null ? "Tickets" : "Starting from"}</p>
            {price === null ? (
              <p className="type-body-md text-secondary-foreground">Coming soon</p>
            ) : (
              <p className={cn("type-price", soldOut ? "text-muted-foreground" : "text-primary")}>
                <CountUp value={price} from={countFrom} delay={countDelay} ms={360} format={formatPrice} />
              </p>
            )}
          </div>
          {soldOut ? (
            <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-muted-foreground")}>Sold out</span>
          ) : (
            <span className={cn(buttonVariants({ size: "sm" }), "group-hover:[&_svg.lucide-arrow-right]:translate-x-1 group-focus-visible:[&_svg.lucide-arrow-right]:translate-x-1")}>
              View tickets
              <ArrowRight aria-hidden="true" />
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// Placeholder card while events load ("Events / Loading")
export function EventCardSkeleton() {
  return (
    <div aria-hidden="true" className="skeleton-sweep flex flex-col rounded-lg border border-border bg-card">
      <Skeleton className="aspect-[16/9] rounded-none" />
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <div className="mt-2 flex items-end justify-between border-t border-border pt-4">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-9 w-28 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
