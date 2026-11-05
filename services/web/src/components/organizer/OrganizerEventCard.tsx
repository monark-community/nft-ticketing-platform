"use client";

import { CalendarDays, MapPin, Ticket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { eventImageUrl, formatEventDate } from "@/lib/event-details";
import { eventSales, organizerEventStatus, type OrganizerEvent } from "@/lib/organizer-events";
import { cn } from "@/lib/utils";

// One event in the organizer's "My events" list (#187). The status decides what the action does:
// continue a draft, finish publishing a frozen event, or open the public page.
export function OrganizerEventCard({ event, now }: { event: OrganizerEvent; now: number }) {
  const [imageFailed, setImageFailed] = useState(false);
  const status = organizerEventStatus(event, now);
  const sales = eventSales(event);
  const imageUrl = eventImageUrl(event.image_url);
  const showImage = imageUrl && !imageFailed;
  const soldRatio = sales.supply > 0 ? Math.min(100, Math.round((sales.sold / sales.supply) * 100)) : 0;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative aspect-[16/7] overflow-hidden bg-muted">
        {showImage ? (
          // Event images can come from any host (IPFS gateways, organizer uploads), so a plain img is used
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="size-full object-cover"
          />
        ) : (
          <div className="dot-grid flex size-full items-center justify-center text-muted-foreground">
            <Ticket className="size-9" aria-hidden="true" />
          </div>
        )}
        <Badge tone={status.tone} overlay dot={status.phase === "live"} className="absolute top-3 right-3">
          {status.label}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-col gap-2">
          {event.category && (
            <Badge tone="code" className="border border-border">
              {event.category}
            </Badge>
          )}
          <h2 className="type-heading-sm text-foreground">
            <Link
              href={status.href}
              className="transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
            >
              {event.title}
            </Link>
          </h2>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-2 type-body-sm text-secondary-foreground">
            <CalendarDays className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <time dateTime={event.start_date}>{formatEventDate(event.start_date)}</time>
          </p>
          {event.location && (
            <p className="flex items-center gap-2 type-mono-address text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{event.location}</span>
            </p>
          )}
        </div>

        <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
          {sales.supply > 0 ? (
            <>
              <div className="flex items-center justify-between gap-3 type-body-sm">
                <span className="text-secondary-foreground">
                  <span className="font-semibold text-foreground">{sales.sold}</span> of {sales.supply} sold
                </span>
                <span className="text-muted-foreground">
                  {sales.remaining} {sales.remaining === 1 ? "ticket" : "tickets"} left
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Tickets sold"
                aria-valuemin={0}
                aria-valuemax={sales.supply}
                aria-valuenow={sales.sold}
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${soldRatio}%` }} />
              </div>
            </>
          ) : (
            <p className="type-body-sm text-muted-foreground">No ticket types yet</p>
          )}

          <Link
            href={status.href}
            className={cn(
              buttonVariants({ size: "sm", variant: status.phase === "live" || status.phase === "ended" ? "outline" : "secondary" }),
              "mt-1 w-full sm:w-auto sm:self-end"
            )}
          >
            {status.action}
          </Link>
        </div>
      </div>
    </article>
  );
}

// Placeholder card while the organizer's events load
export function OrganizerEventCardSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="aspect-[16/7] animate-pulse bg-muted motion-reduce:animate-none" />
      <div className="flex flex-col gap-4 p-5">
        <div className="h-4 w-24 animate-pulse rounded-xs bg-muted motion-reduce:animate-none" />
        <div className="h-6 w-3/4 animate-pulse rounded-xs bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-1/2 animate-pulse rounded-xs bg-muted motion-reduce:animate-none" />
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-4">
          <div className="h-4 w-full animate-pulse rounded-xs bg-muted motion-reduce:animate-none" />
          <div className="h-2 w-full animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
          <div className="mt-1 h-9 w-32 animate-pulse rounded-sm bg-muted motion-reduce:animate-none sm:self-end" />
        </div>
      </div>
    </div>
  );
}
