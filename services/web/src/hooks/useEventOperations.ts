"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchScanners, fetchWhitelist } from "@/lib/organizer-manage";

// The guest list and scanner rows from the API (#191, #194). Additions are written to the database
// first (the API checks the wallets), then to the contract from the organizer's wallet; the
// blockchain listener marks each row synced_to_chain and removes rows when the chain removes them.
export function useEventOperations(eventId: string, enabled = true) {
  const whitelist = useQuery({
    queryKey: ["event-whitelist", eventId],
    queryFn: () => fetchWhitelist(eventId),
    enabled: Boolean(eventId) && enabled,
    refetchInterval: 15_000,
  });

  const scanners = useQuery({
    queryKey: ["event-scanners", eventId],
    queryFn: () => fetchScanners(eventId),
    enabled: Boolean(eventId) && enabled,
    refetchInterval: 15_000,
  });

  return {
    whitelist: whitelist.data ?? [],
    scanners: scanners.data ?? [],
    loading: whitelist.isPending || scanners.isPending,
    error:
      whitelist.error || scanners.error
        ? "Could not load the guest list or scanners. Check your connection and try again."
        : null,
    reload: async () => {
      await Promise.all([whitelist.refetch(), scanners.refetch()]);
    },
  };
}
