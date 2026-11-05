"use client";

import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api";
import type { EventsPage } from "@/lib/events";

// Events for the Marketplace's "All events" filter: every published event, past ones included,
// since used tickets of a past event can still be resold as collectibles. The API returns at most
// 50 per page, which covers the MVP; the search box finds any event by name.
export function useListingEvents() {
  const [events, setEvents] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiClient<EventsPage>("/api/events?page=1&limit=50&include_past=true")
      .then((result) => {
        if (!cancelled) setEvents(result.events.map(({ id, title }) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title)));
      })
      .catch(() => {
        // Without the list the filter only offers "All events"; the listings still load
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return events;
}
