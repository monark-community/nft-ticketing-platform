"use client";

import { AlertCircle, CircleChevronDown, RotateCw, Ticket } from "lucide-react";

import { EventCard, EventCardSkeleton } from "@/components/events/EventCard";
import { EventsMessage } from "@/components/events/EventsMessage";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EVENTS_PAGE_SIZE, useEvents } from "@/hooks/useEvents";

// Home page: the list of published events (#283), from the Figma "Events" frames.
export default function EventsPage() {
  const { events, total, loading, loadingMore, error, loadMoreError, hasMore, reload, loadMore } = useEvents();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="page-glow flex-1">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-4 pt-10 pb-16 md:px-8">
          <header className="flex flex-col gap-1">
            <h1 className="type-heading-lg text-foreground md:type-display-xl">Upcoming events</h1>
            <p className="type-body-lg text-secondary-foreground">Find an event and get your tickets</p>
          </header>

          {loading ? (
            <div role="status" aria-label="Loading events" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: Math.min(6, EVENTS_PAGE_SIZE) }, (_, i) => (
                <EventCardSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <EventsMessage
              icon={<AlertCircle aria-hidden="true" />}
              title="Couldn't load events"
              action={
                <Button onClick={reload}>
                  <RotateCw aria-hidden="true" />
                  Try again
                </Button>
              }
            >
              <p role="alert">Something went wrong while loading events. Check your connection and try again.</p>
            </EventsMessage>
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
                  Showing {events.length} of {total} upcoming {total === 1 ? "event" : "events"}
                </p>
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
