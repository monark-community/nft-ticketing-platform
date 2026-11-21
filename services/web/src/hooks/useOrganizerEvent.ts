"use client";

import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/lib/api";
import { fetchOrganizerEvent } from "@/lib/organizer-manage";

// Loads one event for the organizer's manage page (#189-#194). The public event endpoint returns
// the organizer wallet and sale fields the page checks; ownership is enforced again by every
// organizer-only API call.
export function useOrganizerEvent(id: string) {
  const query = useQuery({
    queryKey: ["organizer-event", id],
    queryFn: () => fetchOrganizerEvent(id),
    enabled: Boolean(id),
    // An id that doesn't exist won't start existing on a retry
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });

  const notFound = query.error instanceof ApiError && query.error.status === 404;

  return {
    event: query.data ?? null,
    loading: query.isPending,
    notFound,
    error: query.error && !notFound ? "Could not load this event. Check your connection and try again." : null,
    reload: () => query.refetch(),
  };
}
