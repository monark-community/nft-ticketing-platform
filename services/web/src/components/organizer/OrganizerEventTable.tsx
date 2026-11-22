"use client";

import { CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

import { EventImage } from "@/components/event/EventImage";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEventDate } from "@/lib/event-details";
import { PRINT_MS, printDelay } from "@/lib/motion";
import { eventSales, formatRevenue, organizerEventStatus, type OrganizerEvent } from "@/lib/organizer-events";
import { cn } from "@/lib/utils";

// The "My events" table from Figma (#187): Event / Date / Status / Sold / Revenue / action.
// On phones each row becomes a two-column card so the page never scrolls sideways.
// With `print`, the rows print in one after another as the table replaces its placeholders (#365),
// starting after `printFrom` steps. Rows that appear later (a filter changed) just show.
export function OrganizerEventTable({ events, now, print = false, printFrom = 0 }: { events: OrganizerEvent[]; now: number; print?: boolean; printFrom?: number }) {
  // Only the rows of the first render print: once they're done, the class goes, so switching
  // between the phone card and the table row (resizing, turning a tablet) doesn't print them again
  const [printing, setPrinting] = useState(print);
  const [firstRows] = useState(() => events.map((event) => event.id));
  const [printFor] = useState(() => printDelay(printFrom + events.length) + PRINT_MS);
  useEffect(() => {
    if (!printing) return;
    const timer = setTimeout(() => setPrinting(false), printFor);
    return () => clearTimeout(timer);
  }, [printing, printFor]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="block w-full table-fixed text-left lg:table">
        <caption className="sr-only">Your events</caption>
        <thead className="hidden border-b border-border lg:table-header-group">
          <tr>
            <Th>Event</Th>
            <Th className="w-[15%]">Date</Th>
            <Th className="w-[13%]">Status</Th>
            <Th align="right" className="w-[10%]">
              Sold
            </Th>
            <Th align="right" className="w-[15%]">
              Revenue
            </Th>
            <Th align="right" className="w-48">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody className="block lg:table-row-group">
          {events.map((event) => {
            const first = printing ? firstRows.indexOf(event.id) : -1;
            return <OrganizerEventRow key={event.id} event={event} now={now} printDelay={first >= 0 ? printDelay(printFrom + first) : null} />;
          })}
        </tbody>
      </table>
    </div>
  );
}

function OrganizerEventRow({ event, now, printDelay }: { event: OrganizerEvent; now: number; printDelay: number | null }) {
  const status = organizerEventStatus(event, now);
  const sales = eventSales(event);
  const print = printDelay;

  return (
    <tr
      className={cn("grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border p-4 last:border-0 lg:table-row lg:p-0", print !== null && "print-row")}
      style={print !== null ? ({ "--print-ms": `${PRINT_MS}ms`, "--print-delay": `${print}ms` } as CSSProperties) : undefined}
    >
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

// Placeholder rows while the organizer's events load: the orange band sweeps down them, and they
// show only when loading takes a moment (#365)
export function OrganizerEventTableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div
      className="placeholder-in skeleton-sweep rounded-lg border border-border bg-card"
      role="status"
      aria-label="Loading your events"
    >
      <div
        className="hidden border-b border-border px-5 py-3 type-label-sm text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1fr)_15%_13%_10%_15%_12rem]"
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
          className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border p-4 last:border-0 lg:grid-cols-[minmax(0,1fr)_15%_13%_10%_15%_12rem] lg:items-center lg:px-5 lg:py-4"
        >
          <div className="col-span-2 flex items-center gap-3 lg:col-span-1">
            <Skeleton className="size-12 shrink-0 rounded-sm" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-16 lg:justify-self-end" />
          <Skeleton className="h-4 w-24 lg:justify-self-end" />
          <Skeleton className="col-span-2 h-9 w-full rounded-sm lg:col-span-1 lg:w-28 lg:justify-self-end" />
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
