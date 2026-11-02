"use client";

import { useQuery } from "@tanstack/react-query";
import { zeroHash } from "viem";
import { usePublicClient } from "wagmi";

import { apiClient } from "@/lib/api";
import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import type { ApiEvent } from "@/lib/event-details";
import { canScanEvent, onChainEvents } from "@/lib/scanner";

interface EventsPage {
  events: ApiEvent[];
  total: number;
}

const PAGE_SIZE = 50;
const MAX_PAGES = 20;

const nft = { address: TICKET_NFT_ADDRESS, abi: ticketNftAbi, chainId: TICKET_NFT_CHAIN_ID } as const;

// Events the connected wallet can check tickets in for (#287): upcoming and in-progress published
// events from the API (#283), kept when the contract says this wallet is a scanner for the event,
// its organizer, or an admin. Replaces typing an event ID on the old scanner page.
export function useScannableEvents(wallet: `0x${string}` | undefined) {
  const publicClient = usePublicClient({ chainId: TICKET_NFT_CHAIN_ID });

  const query = useQuery({
    queryKey: ["scanner-events", wallet],
    enabled: Boolean(wallet && publicClient),
    staleTime: 60_000,
    queryFn: async () => {
      const client = publicClient!;
      const address = wallet!;

      const events: ApiEvent[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const result = await apiClient<EventsPage>(`/api/events?page=${page}&limit=${PAGE_SIZE}`);
        events.push(...result.events);
        if (result.events.length < PAGE_SIZE || events.length >= result.total) break;
      }

      // Roles are the same for every event, so read them once
      const organizerRole = (await client.readContract({ ...nft, functionName: "ORGANIZER_ROLE" })) as `0x${string}`;
      const [hasOrganizerRole, isAdmin] = (await Promise.all([
        client.readContract({ ...nft, functionName: "hasRole", args: [organizerRole, address] }),
        client.readContract({ ...nft, functionName: "hasRole", args: [zeroHash, address] }), // DEFAULT_ADMIN_ROLE
      ])) as [boolean, boolean];

      const checked = await Promise.all(
        onChainEvents(events).map(async (event) => {
          const eventId = BigInt(event.contract_event_id);
          const [isEventScanner, eventOrganizer] = (await Promise.all([
            client.readContract({ ...nft, functionName: "eventScanners", args: [eventId, address] }),
            client.readContract({ ...nft, functionName: "eventOrganizer", args: [eventId] }),
          ])) as [boolean, `0x${string}`];
          return canScanEvent(address, { isEventScanner, eventOrganizer, hasOrganizerRole, isAdmin }) ? event : null;
        }),
      );
      return checked.filter((e): e is NonNullable<typeof e> => e !== null);
    },
  });

  return {
    events: query.data ?? [],
    loading: Boolean(wallet) && query.isPending,
    failed: query.isError,
    reload: () => void query.refetch(),
  };
}
