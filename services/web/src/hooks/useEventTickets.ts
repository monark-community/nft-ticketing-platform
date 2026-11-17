"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchEventTickets, TICKETS_PAGE_SIZE, type TicketQuery, type TicketSummary } from "@/lib/organizer-manage";

const EMPTY_SUMMARY: TicketSummary = { total: 0, sold: 0, issued: 0, valid: 0, used: 0 };

// The event's tickets, owners and check-in state (#190). The listener writes resales and check-ins
// to the API, so this refreshes on its own while the page is open.
export function useEventTickets(eventId: string, query: TicketQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? TICKETS_PAGE_SIZE;
  const status = query.status ?? "";
  const kind = query.kind ?? "";
  const ticketTypeId = query.ticketTypeId ?? "";

  const result = useQuery({
    queryKey: ["event-tickets", eventId, page, limit, status, kind, ticketTypeId],
    queryFn: () =>
      fetchEventTickets(eventId, {
        page,
        limit,
        status: query.status,
        kind: query.kind,
        ticketTypeId: query.ticketTypeId,
      }),
    enabled: Boolean(eventId),
    refetchInterval: 15_000,
  });

  return {
    tickets: result.data?.tickets ?? [],
    summary: result.data?.summary ?? EMPTY_SUMMARY,
    total: result.data?.total ?? 0,
    loading: result.isPending,
    fetching: result.isFetching,
    error: result.error ? "Could not load the event's tickets. Check your connection and try again." : null,
    reload: () => result.refetch(),
  };
}
