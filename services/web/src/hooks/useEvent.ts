"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { apiClient } from "@/lib/api";
import type { ApiEvent } from "@/lib/event-details";

// The API's error text for an unknown event id (services/api event.controller getEvent)
const NOT_FOUND = "Event not found";

// One event and its ticket types, from the API
function eventQuery(id: string) {
  return {
    queryKey: ["event", id],
    queryFn: () => apiClient<ApiEvent>(`/api/events/${encodeURIComponent(id)}`),
  };
}

// Loads one event and its ticket types from the API (#284): title, venue, dates, descriptions.
// Prices, supply and sale state come from the contract instead (useEventOnChain).
export function useEvent(id: string) {
  const query = useQuery({
    ...eventQuery(id),
    enabled: Boolean(id),
    // Don't retry an id that doesn't exist; retry other failures twice
    retry: (failureCount, error) => error.message !== NOT_FOUND && failureCount < 2,
  });

  const notFound = query.error?.message === NOT_FOUND;

  return {
    event: query.data ?? null,
    loading: query.isPending,
    notFound,
    error: query.error && !notFound ? "Could not load this event. Check your connection and try again." : null,
    reload: () => query.refetch(),
  };
}

/**
 * Starts loading an event before its page opens: when the pointer reaches its card, or the card
 * gets focus. The page then opens complete, while the card's picture flies into it (#363).
 * An event loaded in the last 30 seconds isn't loaded again.
 */
export function usePrefetchEvent() {
  const queryClient = useQueryClient();
  return useCallback(
    (id: string) => {
      void queryClient.prefetchQuery({ ...eventQuery(id), staleTime: 30_000 });
    },
    [queryClient]
  );
}
