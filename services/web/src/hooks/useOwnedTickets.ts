"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { apiClient } from "@/lib/api";
import { ownedTicketsFromApi, type ApiOwnedTicket, type OwnedTicket } from "@/lib/my-tickets";

export type { OwnedTicket } from "@/lib/my-tickets";

// "View my tickets" opens this page right after a purchase, but the API saves the new ticket a few
// seconds after its block (the listener polls every 4 s). So the list is read again, quietly,
// 5 s and 10 s after it first loads.
const QUIET_RELOADS_MS = [5_000, 10_000];

// The connected wallet's tickets, from GET /api/tickets/owner/:address (#219). The API keeps them up
// to date from the contract's events and reads the ones it missed after a restart, so this no
// longer scans Transfer logs from block 0, which hosted Sepolia RPCs refuse. After a wallet switch,
// the previous wallet's tickets are never shown, even if its slower request finishes later.
export function useOwnedTickets() {
  const { address } = useAccount();

  const [result, setResult] = useState<{ owner: string; tickets: OwnedTicket[]; error: string | null } | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const latestRequest = useRef(0);
  const busy = useRef(false); // a load is running: a quiet reload then has nothing to add

  // quiet: refresh what's shown without the loading state, and keep it if the request fails
  const load = useCallback(async (quiet = false) => {
    if (!address || (quiet && busy.current)) return;
    const request = ++latestRequest.current;
    busy.current = true;
    if (!quiet) setInFlight(true);

    try {
      const { tickets } = await apiClient<{ tickets: ApiOwnedTicket[] }>(`/api/tickets/owner/${address}`);
      if (request === latestRequest.current) setResult({ owner: address, tickets: ownedTicketsFromApi(tickets), error: null });
    } catch (err) {
      console.error("Failed to load tickets:", err);
      if (request === latestRequest.current && !quiet) {
        setResult({ owner: address, tickets: [], error: "We couldn't load your tickets. Check your connection and try again." });
      }
    } finally {
      if (request === latestRequest.current) {
        busy.current = false;
        setInFlight(false);
      }
    }
  }, [address]);

  useEffect(() => {
    load();
    const timers = QUIET_RELOADS_MS.map((delay) => setTimeout(() => void load(true), delay));
    return () => timers.forEach(clearTimeout);
  }, [load]);

  // Only results for the wallet that is connected now count
  const current = result !== null && address !== undefined && result.owner === address;

  return {
    tickets: current ? result.tickets : [],
    loading: Boolean(address) && (!current || inFlight),
    error: current ? result.error : null,
    reload: () => load(),
  };
}
