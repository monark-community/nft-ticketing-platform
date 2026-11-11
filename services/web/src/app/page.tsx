"use client";

import { AlertCircle, CircleChevronDown, FilterX, RotateCw, SearchX, Ticket } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { EventCard, EventCardSkeleton } from "@/components/events/EventCard";
import { EventFilters } from "@/components/events/EventFilters";
import { EventsMessage } from "@/components/events/EventsMessage";
import { HostBanner } from "@/components/events/HostBanner";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EVENTS_PAGE_SIZE, useEvents } from "@/hooks/useEvents";
import { filtersFromParams, filtersToQuery, hasEventFilters, NO_EVENT_FILTERS, type EventFilters as Filters } from "@/lib/events";

const SEARCH_DELAY_MS = 300;
const SUGGESTED_EVENTS = 6; // upcoming events shown under "No events found"

// Home page: the list of published events (#283) with search, category filters and the
// "Want to host an event?" banner (#320), from the Figma "Events" frames.
export default function EventsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="page-glow flex-1">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-4 pt-10 pb-16 md:px-8">
          <header className="flex flex-col gap-1">
            <h1 className="type-heading-lg text-foreground md:type-display-xl">Upcoming events</h1>
            <p className="type-body-lg text-secondary-foreground">Find an event and get your tickets</p>
          </header>

          {/* useSearchParams needs a Suspense boundary in the App Router */}
          <Suspense fallback={<LoadingGrid />}>
            <EventsList />
          </Suspense>

          <HostBanner />
        </div>
      </main>

      <Footer />
    </div>
  );
}

function LoadingGrid() {
  return (
    <div role="status" aria-label="Loading events" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: Math.min(6, EVENTS_PAGE_SIZE) }, (_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  );
}

// The filters live in the address (/?q=jazz&category=Concerts), so a reload, the Back button and a
// shared link keep them, and the "Search Events" link clears them.
function EventsList() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { q, category } = filtersFromParams(params);
  const filters = useMemo<Filters>(() => ({ q, category }), [q, category]);

  const setFilters = useCallback(
    (next: Filters) => {
      // replaceState, not a navigation: the page stays where it is and Back still leaves the list
      window.history.replaceState(null, "", `${pathname}${filtersToQuery(next)}`);
    },
    [pathname],
  );

  // What's typed in the box. It reaches the address after a short pause, so each key press isn't a request
  const [search, setSearch] = useState(q);
  // The address changed some other way (Back, the navbar link, "Clear filters"): show its search text
  const [shownQ, setShownQ] = useState(q);
  if (shownQ !== q) {
    setShownQ(q);
    if (search.trim() !== q) setSearch(q);
  }
  useEffect(() => {
    const typed = search.trim();
    if (typed === q) return;
    const timer = setTimeout(() => setFilters({ q: typed, category }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search, q, category, setFilters]);

  const { events, total, allTotal, loading, loadingMore, error, loadMoreError, hasMore, reload, loadMore } = useEvents(filters);
  const filtered = hasEventFilters(filters);
  const noResults = !loading && !error && events.length === 0 && filtered;
  // Something to browse under "No events found"
  const suggested = useEvents(NO_EVENT_FILTERS, { enabled: noResults, pageSize: SUGGESTED_EVENTS });

  function clearFilters() {
    setSearch("");
    setFilters(NO_EVENT_FILTERS);
  }

  return (
    <>
      <EventFilters
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={(next) => setFilters({ q: search.trim(), category: next })}
        totalEvents={allTotal}
        onRefresh={() => void reload()}
        refreshing={loading}
      />

      {loading ? (
        <LoadingGrid />
      ) : error ? (
        <EventsMessage
          icon={<AlertCircle aria-hidden="true" />}
          title="Couldn't load events"
          action={
            <Button onClick={() => void reload()}>
              <RotateCw aria-hidden="true" />
              Try again
            </Button>
          }
        >
          <p role="alert">Something went wrong while loading events. Check your connection and try again.</p>
        </EventsMessage>
      ) : noResults ? (
        <>
          <div role="status">
            <EventsMessage
              icon={<SearchX aria-hidden="true" />}
              title="No events found"
              action={
                <Button onClick={clearFilters}>
                  <FilterX aria-hidden="true" />
                  Clear filters &amp; view all
                </Button>
              }
            >
              <p>
                {filters.q ? (
                  <>
                    We couldn&apos;t find any {filters.category && <strong className="text-foreground">{filters.category} </strong>}events
                    matching your search <strong className="text-foreground">&quot;{filters.q}&quot;</strong>.
                  </>
                ) : (
                  <>
                    There are no upcoming <strong className="text-foreground">{filters.category}</strong> events right now.
                  </>
                )}{" "}
                Try another search or clear your filters.
              </p>
            </EventsMessage>
          </div>

          {suggested.events.length > 0 && (
            <section aria-labelledby="other-events-title" className="flex flex-col gap-6">
              <h2 id="other-events-title" className="type-heading-md text-foreground">
                Other upcoming events
              </h2>
              <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {suggested.events.map((event) => (
                  <li key={event.id} className="flex">
                    <EventCard event={event} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : events.length === 0 ? (
        <EventsMessage icon={<Ticket aria-hidden="true" />} title="No upcoming events">
          <p>There are no events on sale right now. Check back soon.</p>
        </EventsMessage>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <li key={event.id} className="flex">
                <EventCard event={event} />
              </li>
            ))}
          </ul>

          <div className="flex flex-col items-center gap-3">
            {loadMoreError && (
              <Alert tone="error" title="Couldn't load more events" className="w-full max-w-md">
                Something went wrong while loading more events. Try again.
              </Alert>
            )}
            {hasMore && (
              <Button variant="outline" onClick={loadMore} loading={loadingMore}>
                {!loadingMore && <CircleChevronDown className="text-primary" aria-hidden="true" />}
                {loadMoreError ? "Try again" : "Load more events"}
              </Button>
            )}
            <p className="type-body-sm text-muted-foreground" aria-live="polite">
              Showing {events.length} of {total} {filtered ? "matching" : "upcoming"} {total === 1 ? "event" : "events"}
            </p>
          </div>
        </>
      )}
    </>
  );
}
