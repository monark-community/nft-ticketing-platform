"use client";

import { ArrowRight, Calendar, MapPin, Ticket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { SharedPicture, usePictureLink } from "@/components/motion/SharedPicture";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { usePrefetchEvent } from "@/hooks/useEvent";
import { eventImageUrl } from "@/lib/event-details";
import { rememberEventPicture } from "@/lib/event-picture";
import { eventHref, eventStockStatus, formatEventDate, formatPrice, startingPrice, type EventSummary } from "@/lib/events";
import { cn } from "@/lib/utils";

// Event card from the Figma "Events / Default" frame (#283).
// The whole card is one link to the event page, so the "View tickets" button is only a visual cue.
export function EventCard({ event }: { event: EventSummary }) {
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
      className="group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-[border-color,box-shadow] duration-200 hover:border-primary/55 hover:shadow-[0_0_0_2px_rgb(249_115_22/55%),0_0_24px_rgb(249_115_22/22%)] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/30"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-muted">
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
                "size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100",
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

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-4">
          <div>
            <p className="type-label-sm text-muted-foreground">{price === null ? "Tickets" : "Starting from"}</p>
            {price === null ? (
              <p className="type-body-md text-secondary-foreground">Coming soon</p>
            ) : (
              <p className={cn("type-price", soldOut ? "text-muted-foreground" : "text-primary")}>{formatPrice(price)}</p>
            )}
          </div>
          {soldOut ? (
            <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-muted-foreground")}>Sold out</span>
          ) : (
            <span className={buttonVariants({ size: "sm" })}>
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
    <div aria-hidden="true" className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="aspect-[16/9] animate-pulse bg-muted motion-reduce:animate-none" />
      <div className="flex flex-col gap-3 p-5">
        <div className="h-4 w-24 animate-pulse rounded-xs bg-muted motion-reduce:animate-none" />
        <div className="h-6 w-3/4 animate-pulse rounded-xs bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-1/2 animate-pulse rounded-xs bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-2/3 animate-pulse rounded-xs bg-muted motion-reduce:animate-none" />
        <div className="mt-2 flex items-end justify-between border-t border-border pt-4">
          <div className="h-8 w-28 animate-pulse rounded-xs bg-muted motion-reduce:animate-none" />
          <div className="h-9 w-28 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}
