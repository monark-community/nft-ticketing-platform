"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "@/lib/api";
import { sellableTickets, type SellableTicket } from "@/lib/marketplace";

// The connected wallet's tickets that can be listed, from GET /api/tickets/owner/:address (#219):
// the API knows each ticket's event, type, face value and current listing, which the Sell popup
// shows. Their resale terms are read again from the contract before listing.
export function useSellableTickets(wallet: string | undefined, enabled: boolean) {
  const [result, setResult] = useState<{ wallet: string; tickets: SellableTicket[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const reload = useCallback(
    async (quiet = false) => {
      if (!wallet) return;
      const id = ++request.current;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const data = await apiClient<{ tickets: SellableTicket[] }>(`/api/tickets/owner/${wallet}`);
        if (id === request.current) setResult({ wallet, tickets: sellableTickets(data.tickets) });
      } catch (err) {
        if (id === request.current && !quiet) setError(err instanceof Error ? err.message : "Failed to fetch your tickets");
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [wallet],
  );

  useEffect(() => {
    if (enabled && wallet) void reload();
  }, [enabled, wallet, reload]);

  // Only tickets of the wallet connected now count
  const current = result !== null && result.wallet === wallet;
  return { tickets: current ? result.tickets : [], loading: Boolean(wallet) && enabled && (loading || (!current && !error)), error, reload };
}
