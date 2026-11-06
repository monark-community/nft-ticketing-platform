"use client";

import { CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";

import { EventImage } from "@/components/event/EventImage";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatEventDate } from "@/lib/event-details";
import { eventSales, formatRevenue, organizerEventStatus, type OrganizerEvent } from "@/lib/organizer-events";
import { cn } from "@/lib/utils";

// The "My events" table from Figma (#187): Event / Date / Status / Sold / Revenue / action.
// On phones each row becomes a two-column card so the page never scrolls sideways.
export function OrganizerEventTable({ events, now }: { events: OrganizerEvent[]; now: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="block w-full table-fixed text-left lg:table">
        <caption className="sr-only">Your events</caption>
        <thead className="hidden border-b border-border lg:table-header-group">
          <tr>
            <Th className="w-[32%]">Event</Th>
            <Th className="w-[15%]">Date</Th>
            <Th className="w-[13%]">Status</Th>
            <Th align="right" className="w-[10%]">
              Sold
            </Th>
            <Th align="right" className="w-[15%]">
              Revenue
            </Th>
            <Th align="right" className="w-[15%]">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody className="block lg:table-row-group">
          {events.map((event) => (
            <OrganizerEventRow key={event.id} event={event} now={now} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrganizerEventRow({ event, now }: { event: OrganizerEvent; now: number }) {
  const status = organizerEventStatus(event, now);
  const sales = eventSales(event);

  return (
    <tr className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border p-4 last:border-0 lg:table-row lg:p-0">
      <td className="col-span-2 block min-w-0 lg:table-cell lg:px-5 lg:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative size-12 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
            <EventImage src={event.image_url} />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <Link
              href={status.href}
              className="type-body-md-strong text-foreground transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
            >
              {event.title}
            </Link>
            {(event.category || event.location) && (
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 type-body-sm text-muted-foreground">
                {event.category && <span>{event.category}</span>}
                {event.location && (
                  <span className="flex min-w-0 items-center gap-1">
                    <MapPin className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{event.location}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </td>

      <td className="block lg:table-cell lg:px-5 lg:py-4">
        <p className="type-label-sm text-muted-foreground lg:hidden">Date</p>
        <p className="flex items-center gap-1.5 type-body-sm text-secondary-foreground">
          <CalendarDays className="hidden size-3.5 shrink-0 text-primary lg:block" aria-hidden="true" />
          <time dateTime={event.start_date}>{formatEventDate(event.start_date)}</time>
        </p>
      </td>

      <td className="block lg:table-cell lg:px-5 lg:py-4">
        <p className="type-label-sm text-muted-foreground lg:hidden">Status</p>
        <Badge tone={status.tone} dot={status.dot}>
          {status.label}
        </Badge>
      </td>

      <td className="block lg:table-cell lg:px-5 lg:py-4 lg:text-right">
        <p className="type-label-sm text-muted-foreground lg:hidden">Sold</p>
        <p className="type-body-md text-foreground">
          <span className="font-semibold">{sales.sold.toLocaleString("en-US")}</span>
          <span className="text-muted-foreground"> / {sales.supply.toLocaleString("en-US")}</span>
        </p>
      </td>

      <td className="block lg:table-cell lg:px-5 lg:py-4 lg:text-right">
        <p className="type-label-sm text-muted-foreground lg:hidden">Revenue</p>
        <p className="type-body-md text-foreground">{formatRevenue(sales.revenue)}</p>
      </td>

      <td className="col-span-2 block lg:table-cell lg:px-5 lg:py-4 lg:text-right">
        <Link
          href={status.href}
          className={cn(
            buttonVariants({
              size: "sm",
              variant: status.phase === "draft" || status.phase === "frozen" ? "secondary" : "outline",
            }),
            "w-full lg:w-auto"
          )}
        >
          {status.action}
        </Link>
      </td>
    </tr>
  );
}

// Placeholder rows while the organizer's events load
export function OrganizerEventTableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-card"
      role="status"
      aria-label="Loading your events"
    >
      <div
        className="hidden border-b border-border px-5 py-3 type-label-sm text-muted-foreground lg:grid lg:grid-cols-[32%_15%_13%_10%_15%_15%]"
        aria-hidden="true"
      >
        <span>Event</span>
        <span>Date</span>
        <span>Status</span>
        <span className="text-right">Sold</span>
        <span className="text-right">Revenue</span>
        <span />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border p-4 last:border-0 lg:grid-cols-[32%_15%_13%_10%_15%_15%] lg:items-center lg:px-5 lg:py-4"
        >
          <div className="col-span-2 flex items-center gap-3 lg:col-span-1">
            <div className="size-12 shrink-0 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="h-4 w-3/4 animate-pulse rounded-xs bg-muted motion-reduce:animate-none" />
              <div className="h-3 w-1/2 animate-pulse rounded-xs bg-muted motion-reduce:animate-none" />
            </div>
          </div>
          <div className="h-4 w-28 animate-pulse rounded-xs bg-muted motion-reduce:animate-none" />
          <div className="h-5 w-20 animate-pulse rounded-xs bg-muted motion-reduce:animate-none" />
          <div className="h-4 w-16 animate-pulse rounded-xs bg-muted motion-reduce:animate-none lg:justify-self-end" />
          <div className="h-4 w-24 animate-pulse rounded-xs bg-muted motion-reduce:animate-none lg:justify-self-end" />
          <div className="col-span-2 h-9 w-full animate-pulse rounded-sm bg-muted motion-reduce:animate-none lg:col-span-1 lg:w-28 lg:justify-self-end" />
        </div>
      ))}
    </div>
  );
}

function Th({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn("px-5 py-3 type-label-sm text-muted-foreground", align === "right" ? "text-right" : "text-left", className)}
    >
      {children}
    </th>
  );
}
