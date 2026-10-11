"use client";

import { TICKET_NFT_ADDRESS, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";

export interface OwnedTicket {
  tokenId: bigint;
  eventId: bigint;
  isUsed: boolean;
}

// TicketNFT is not ERC721Enumerable, so we find tickets by reading Transfer logs
// sent to the user, then confirm with ownerOf that they still hold each one.
// TODO: switch to the backend API once it exposes a "tickets by owner" endpoint.
export function useOwnedTickets() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [tickets, setTickets] = useState<OwnedTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address || !publicClient) return;
    const contract = TICKET_NFT_ADDRESS;

    setLoading(true);
    setError(null);
    try {
      const logs = await publicClient.getContractEvents({
        address: contract,
        abi: ticketNftAbi,
        eventName: "Transfer",
        args: { to: address },
        fromBlock: BigInt(0),
      });

      // The JSON ABI has no exact types, so tell TypeScript what Transfer's args look like
      const candidateIds = Array.from(
        new Set(
          logs
            .map((log) => (log.args as { tokenId?: bigint }).tokenId)
            .filter((id): id is bigint => id !== undefined),
        ),
      );

      const results = await Promise.all(
        candidateIds.map(async (tokenId) => {
          const owner = (await publicClient.readContract({
            address: contract,
            abi: ticketNftAbi,
            functionName: "ownerOf",
            args: [tokenId],
          })) as `0x${string}`;
          if (owner.toLowerCase() !== address.toLowerCase()) return null;

          const [eventId, isUsed] = (await Promise.all([
            publicClient.readContract({
              address: contract,
              abi: ticketNftAbi,
              functionName: "tokenEventId",
              args: [tokenId],
            }),
            publicClient.readContract({
              address: contract,
              abi: ticketNftAbi,
              functionName: "isUsed",
              args: [tokenId],
            }),
          ])) as [bigint, boolean];
          return { tokenId, eventId, isUsed };
        }),
      );

      setTickets(results.filter((t): t is OwnedTicket => t !== null));
    } catch (err) {
      console.error("Failed to load tickets:", err);
      setError(
        "Could not load your tickets. Check that you're on the right network.",
      );
    } finally {
      setLoading(false);
    }
  }, [address, publicClient]);

  useEffect(() => {
    load();
  }, [load]);

  return { tickets, loading, error, reload: load };
}
