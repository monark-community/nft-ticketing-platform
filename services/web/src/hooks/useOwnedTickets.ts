"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";

import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import type { OwnedTicket } from "@/lib/my-tickets";

export type { OwnedTicket } from "@/lib/my-tickets";

type Client = NonNullable<ReturnType<typeof usePublicClient>>;

const contract = { address: TICKET_NFT_ADDRESS, abi: ticketNftAbi } as const;

// TicketNFT is not ERC721Enumerable, so we find tickets by reading Transfer logs
// sent to the user, then confirm with ownerOf that they still hold each one.
// TODO(#219): replace the block-0 log scan before Sepolia.
async function readOwnedTickets(client: Client, owner: `0x${string}`): Promise<OwnedTicket[]> {
  const logs = await client.getContractEvents({ ...contract, eventName: "Transfer", args: { to: owner }, fromBlock: BigInt(0) });

  // The JSON ABI has no exact types, so tell TypeScript what Transfer's args look like
  const candidateIds = Array.from(
    new Set(logs.map((log) => (log.args as { tokenId?: bigint }).tokenId).filter((id): id is bigint => id !== undefined)),
  );

  const results = await Promise.all(
    candidateIds.map(async (tokenId): Promise<OwnedTicket | null> => {
      const holder = (await client.readContract({ ...contract, functionName: "ownerOf", args: [tokenId] })) as `0x${string}`;
      if (holder.toLowerCase() !== owner.toLowerCase()) return null;

      const [eventId, isUsed, typeId] = await Promise.all([
        client.readContract({ ...contract, functionName: "tokenEventId", args: [tokenId] }) as Promise<bigint>,
        client.readContract({ ...contract, functionName: "isUsed", args: [tokenId] }) as Promise<boolean>,
        // Only used for the type name, so a failed read just leaves the name out
        (client.readContract({ ...contract, functionName: "tokenTicketType", args: [tokenId] }) as Promise<bigint>)
          .then(Number)
          .catch(() => null),
      ]);
      return { tokenId, eventId, isUsed, typeId, checkedInAt: null };
    }),
  );

  const tickets = results.filter((t): t is OwnedTicket => t !== null);
  return withCheckInTimes(client, tickets);
}

// "Checked in on Oct 10, 2026": the date of each used ticket's TicketCheckedIn event.
// Only a label, so if it can't be read the card says "Checked in" without a date.
async function withCheckInTimes(client: Client, tickets: OwnedTicket[]): Promise<OwnedTicket[]> {
  const usedIds = tickets.filter((t) => t.isUsed).map((t) => t.tokenId);
  if (usedIds.length === 0) return tickets;

  try {
    const logs = await client.getContractEvents({ ...contract, eventName: "TicketCheckedIn", args: { tokenId: usedIds }, fromBlock: BigInt(0) });
    const blockOf = new Map<string, bigint>();
    for (const log of logs) {
      const id = (log.args as { tokenId?: bigint }).tokenId;
      if (id !== undefined && log.blockNumber !== null) blockOf.set(id.toString(), log.blockNumber);
    }

    const blocks = Array.from(new Set(blockOf.values()));
    const times = new Map<bigint, number>();
    await Promise.all(blocks.map(async (n) => times.set(n, Number((await client.getBlock({ blockNumber: n })).timestamp))));

    return tickets.map((t) => {
      const block = blockOf.get(t.tokenId.toString());
      return block === undefined ? t : { ...t, checkedInAt: times.get(block) ?? null };
    });
  } catch (err) {
    console.error("Failed to load check-in dates:", err);
    return tickets;
  }
}

// The connected wallet's tickets. Reads always go to the contract's chain, so they work while the
// wallet is on another network. After a wallet switch, the previous wallet's tickets are never shown,
// even if its slower request finishes later.
export function useOwnedTickets() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: TICKET_NFT_CHAIN_ID });

  const [result, setResult] = useState<{ owner: string; tickets: OwnedTicket[]; error: string | null } | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    if (!address || !publicClient) return;
    const request = ++latestRequest.current;
    setInFlight(true);

    try {
      const tickets = await readOwnedTickets(publicClient, address);
      if (request === latestRequest.current) setResult({ owner: address, tickets, error: null });
    } catch (err) {
      console.error("Failed to load tickets:", err);
      if (request === latestRequest.current) {
        setResult({ owner: address, tickets: [], error: "We couldn't load your tickets. Check your connection and try again." });
      }
    } finally {
      if (request === latestRequest.current) setInFlight(false);
    }
  }, [address, publicClient]);

  useEffect(() => {
    load();
  }, [load]);

  // Only results for the wallet that is connected now count
  const current = result !== null && address !== undefined && result.owner === address;

  return {
    tickets: current ? result.tickets : [],
    loading: Boolean(address) && (!current || inFlight),
    error: current ? result.error : null,
    reload: load,
  };
}
