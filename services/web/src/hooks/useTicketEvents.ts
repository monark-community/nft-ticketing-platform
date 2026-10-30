"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";
import type { ApiEvent } from "@/lib/event-details";
import { indexEventsByChainId } from "@/lib/my-tickets";

interface EventsPage {
  events: ApiEvent[];
  total: number;
  page: number;
  limit: number;
}

// The API allows up to 50 events per page; stop after 20 pages so a bad response can't loop forever
const PAGE_SIZE = 50;
const MAX_PAGES = 20;

// Title, date, venue, image and ticket type names for the events the wallet has tickets for (#286).
// Tickets only know the contract's event ID, so this loads the published events and matches on
// contract_event_id. The tickets and their QR codes still work if this fails.
// include_past: the events list only shows upcoming events (#283), but tickets need their event's
// details during the event (at the door) and after it (past tickets).
export function useTicketEvents(enabled: boolean) {
  const query = useQuery({
    queryKey: ["events", "all-published"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const events: ApiEvent[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const result = await apiClient<EventsPage>(`/api/events?page=${page}&limit=${PAGE_SIZE}&include_past=true`);
        events.push(...result.events);
        if (result.events.length < PAGE_SIZE || events.length >= result.total) break;
      }
      return indexEventsByChainId(events);
    },
  });

  return {
    events: query.data ?? null,
    loading: enabled && query.isPending,
    failed: query.isError,
    reload: () => query.refetch(),
  };
}
