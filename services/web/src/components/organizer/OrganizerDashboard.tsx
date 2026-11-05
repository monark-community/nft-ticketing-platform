"use client";

import { AlertCircle, CalendarPlus, RotateCw, Ticket } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EventsMessage } from "@/components/events/EventsMessage";
import { OrganizerEventCard, OrganizerEventCardSkeleton } from "@/components/organizer/OrganizerEventCard";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { useOrganizerEvents } from "@/hooks/useOrganizerEvents";
import {
  filterOrganizerEvents,
  summarizeOrganizerEvents,
  type OrganizerFilter,
  type OrganizerSummary,
} from "@/lib/organizer-events";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";

const FILTERS: Array<{ key: OrganizerFilter; label: string }> = [
  { key: "all", label: "All events" },
  { key: "live", label: "Live" },
  { key: "unpublished", label: "Unpublished" },
  { key: "past", label: "Past" },
];

const EMPTY_TEXT: Record<OrganizerFilter, string> = {
  all: "Create your first event and it will appear here.",
  live: "No events are live right now.",
  unpublished: "No drafts or events waiting to be published.",
  past: "No events have ended yet.",
};

// "My events" (#187): the organizer's drafts, events waiting to publish, live events and past
// events, with their sales. The list comes from GET /api/events/mine (#250).
export function OrganizerDashboard() {
  const { events, loading, error, reload } = useOrganizerEvents();
  const [filter, setFilter] = useState<OrganizerFilter>("all");
  const now = useNowMinutes();

  const summary = useMemo(() => summarizeOrganizerEvents(events, now), [events, now]);
  const visible = useMemo(() => filterOrganizerEvents(events, filter, now), [events, filter, now]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading your events">
        {Array.from({ length: 3 }, (_, index) => (
          <OrganizerEventCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        tone="error"
        title="Couldn't load your events"
        action={
          <Button variant="secondary" size="sm" onClick={reload}>
            <RotateCw aria-hidden="true" />
            Try again
          </Button>
        }
      >
        Check your connection and try again.
      </Alert>
    );
  }

  if (events.length === 0) {
    return (
      <EventsMessage
        icon={<CalendarPlus aria-hidden="true" />}
        title="No events yet"
        action={
          <Link href={ROUTES.newEvent} className={buttonVariants({ size: "md" })}>
            Create event
          </Link>
        }
      >
        <p>{EMPTY_TEXT.all}</p>
      </EventsMessage>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SummaryStrip summary={summary} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Filter your events" className="flex flex-wrap gap-2">
          {FILTERS.map(({ key, label }) => {
            const selected = filter === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setFilter(key)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full border px-4 type-label-button transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-secondary-foreground hover:border-border-accent hover:text-foreground"
                )}
              >
                {label}
                <span className={cn("type-label-sm", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {countFor(summary, key)}
                </span>
              </button>
            );
          })}
        </div>
        <p className="type-body-sm text-muted-foreground" aria-live="polite">
          Showing {visible.length} of {summary.total} {summary.total === 1 ? "event" : "events"}
        </p>
      </div>

      {visible.length === 0 ? (
        <EventsMessage
          icon={filter === "live" ? <Ticket aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
          title={`No ${labelFor(filter)} events`}
          action={
            <Button variant="secondary" onClick={() => setFilter("all")}>
              Show all events
            </Button>
          }
        >
          <p>{EMPTY_TEXT[filter]}</p>
        </EventsMessage>
      ) : (
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((event) => (
            <li key={event.id} className="flex">
              <OrganizerEventCard event={event} now={now} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryStrip({ summary }: { summary: OrganizerSummary }) {
  const stats = [
    { label: "All events", value: summary.total },
    { label: "Live now", value: summary.live },
    { label: "Unpublished", value: summary.unpublished },
    { label: "Tickets sold", value: summary.ticketsSold },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(({ label, value }) => (
        <div key={label} className="rounded-lg border border-border bg-card px-4 py-3">
          <dt className="type-label-sm text-muted-foreground">{label}</dt>
          <dd className="type-heading-md text-foreground">{value.toLocaleString("en-US")}</dd>
        </div>
      ))}
    </dl>
  );
}

function countFor(summary: OrganizerSummary, filter: OrganizerFilter): number {
  if (filter === "all") return summary.total;
  return summary[filter];
}

function labelFor(filter: OrganizerFilter): string {
  return filter === "unpublished" ? "unpublished" : filter;
}

// Re-evaluate "Live" and "Past" while the dashboard stays open
function useNowMinutes() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
