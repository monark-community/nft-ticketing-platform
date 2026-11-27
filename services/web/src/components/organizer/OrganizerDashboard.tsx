"use client";

import { AlertCircle, CalendarPlus, Plus, RotateCw, Ticket } from "lucide-react";
import * as m from "motion/react-m";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { EventsMessage } from "@/components/events/EventsMessage";
import { FlapText, PrintIn, RollingNumber } from "@/components/motion";
import { OrganizerEventTable, OrganizerEventTableSkeleton } from "@/components/organizer/OrganizerEventTable";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { useOrganizerEvents } from "@/hooks/useOrganizerEvents";
import { useHeldLoading } from "@/hooks/useHeldLoading";
import { useSawLoading } from "@/hooks/useSawLoading";
import { flapZeros, printDelay } from "@/lib/motion";
import {
  filterOrganizerEvents,
  formatRevenue,
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
// events, in the Figma table with their sales. The list comes from GET /api/events/mine (#250).
// Motion (#375): the summary numbers flip in like a departure board, tile after tile; the filter's
// orange pill slides to the one you pick and "Showing 2 of 6" rolls.
export function OrganizerDashboard() {
  const { events, loading, error, reload } = useOrganizerEvents();
  const sawLoading = useSawLoading(loading);
  // Placeholders never flash for a fast answer, and never blink when they do show (#365)
  const showPlaceholders = useHeldLoading(loading);
  const [filter, setFilter] = useState<OrganizerFilter>("all");
  const now = useNowMinutes();

  const summary = useMemo(() => summarizeOrganizerEvents(events, now), [events, now]);
  const visible = useMemo(() => filterOrganizerEvents(events, filter, now), [events, filter, now]);
  // With no events the empty state has its own Create event button, so the header one stays hidden
  const showCreate = !showPlaceholders && !error && events.length > 0;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="type-body-sm text-muted-foreground">Organizer</p>
          <h1 className="type-heading-lg text-foreground md:type-display-xl">My events</h1>
          <p className="type-body-lg text-secondary-foreground">Create events, follow sales and manage your tickets.</p>
        </div>
        {showCreate && (
          <Link href={ROUTES.newEvent} className={cn(buttonVariants({ size: "md" }), "w-full sm:w-auto")}>
            <Plus aria-hidden="true" />
            Create event
          </Link>
        )}
      </header>

      {showPlaceholders ? (
        <OrganizerEventTableSkeleton />
      ) : error ? (
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
      ) : events.length === 0 ? (
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
      ) : (
        <div className="flex flex-col gap-6">
          {/* When it replaces the placeholders, the summary prints in under its scan line, then the
              table's rows one after another (#365) */}
          <PrintIn play={sawLoading}>
            <SummaryStrip summary={summary} arrive={sawLoading} />
          </PrintIn>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <FilterTabs filter={filter} onChange={setFilter} summary={summary} />
            <p className="type-body-sm text-muted-foreground" aria-live="polite">
              <RollingNumber value={`Showing ${visible.length} of ${summary.total} ${summary.total === 1 ? "event" : "events"}`} />
            </p>
          </div>

          <div id="organizer-events-panel" role="tabpanel" aria-labelledby={`organizer-filter-${filter}`}>
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
              <OrganizerEventTable events={visible} now={now} print={sawLoading} printFrom={1} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterTabs({
  filter,
  onChange,
  summary,
}: {
  filter: OrganizerFilter;
  onChange: (filter: OrganizerFilter) => void;
  summary: OrganizerSummary;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // The tabs pattern: Left/Right move between tabs (Home/End jump to the first/last)
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % FILTERS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + FILTERS.length) % FILTERS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = FILTERS.length - 1;
    else return;

    event.preventDefault();
    onChange(FILTERS[next].key);
    tabRefs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label="Filter your events" className="flex flex-wrap gap-2">
      {FILTERS.map(({ key, label }, index) => {
        const selected = filter === key;
        return (
          <button
            key={key}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`organizer-filter-${key}`}
            aria-selected={selected}
            aria-controls="organizer-events-panel"
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(key)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              "relative inline-flex h-9 items-center gap-2 rounded-full border px-4 type-label-button transition-colors duration-200",
              selected
                ? "border-primary text-primary-foreground"
                : "border-border bg-card text-secondary-foreground hover:border-border-accent hover:text-foreground"
            )}
          >
            {/* One orange pill for all the filters: it slides behind the labels to the one you pick */}
            {selected && (
              <m.span
                layoutId="organizer-filter-pill"
                className="absolute -inset-px rounded-full bg-primary"
                transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                aria-hidden="true"
              />
            )}
            <span className="relative">{label}</span>
            <span className={cn("relative type-label-sm transition-colors duration-200", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
              {countFor(summary, key)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Arriving (it replaced the loading placeholder), each number starts with every digit at 0, then its
// digits flip over one after another like a departure board, once the print has shown them (from
// 320 ms), one tile after another 80 ms apart like the print. Later changes flip only the digits that
// changed. The numbers are in the mono font, so every digit is as wide as the 0 it replaces.
function SummaryStrip({ summary, arrive }: { summary: OrganizerSummary; arrive: boolean }) {
  const stats = [
    { label: "All events", value: summary.total.toLocaleString("en-US") },
    { label: "Live now", value: summary.live.toLocaleString("en-US") },
    { label: "Unpublished", value: summary.unpublished.toLocaleString("en-US") },
    { label: "Tickets sold", value: summary.ticketsSold.toLocaleString("en-US") },
    { label: "Revenue", value: formatRevenue(summary.revenue) },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {stats.map(({ label, value }, index) => (
        // The revenue, the longest number, takes the rest of its row until the five tiles fit on one
        <div key={label} className={cn("rounded-lg border border-border bg-card px-4 py-3", index === stats.length - 1 && "col-span-2 xl:col-span-1")}>
          <dt className="type-label-sm text-muted-foreground">{label}</dt>
          <dd className="font-mono text-xl leading-8 font-semibold text-foreground">
            <FlapText text={value} from={arrive ? flapZeros(value) : undefined} stagger={30} delay={320 + printDelay(index)} />
          </dd>
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
