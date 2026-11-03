"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import type { ApiEvent } from "@/lib/event-details";
import { ticketTypeName } from "@/lib/my-tickets";
import type { TicketVerification } from "@/lib/verify-ticket";

const nft = { address: TICKET_NFT_ADDRESS, abi: ticketNftAbi, chainId: TICKET_NFT_CHAIN_ID } as const;

export interface ScannedTicketDetails {
  typeName: string | null; // "General Admission"
  owner: `0x${string}` | null; // read here for already-used tickets, which verification stops before
  checkedInAt: number | null; // unix seconds of the earlier check-in, for "Do not admit"
}

const EMPTY: ScannedTicketDetails = { typeName: null, owner: null, checkedInAt: null };

// Extra rows for the scan result card (#287). Only labels: if a read fails the row is hidden,
// and the verdict (valid or rejected) never depends on it.
export function useScannedTicketDetails(result: TicketVerification | null, event: ApiEvent | null) {
  const publicClient = usePublicClient({ chainId: TICKET_NFT_CHAIN_ID });
  const tokenId = result?.qr?.tokenId;
  const wanted = Boolean(result && tokenId && (result.ok || result.used));

  const query = useQuery({
    queryKey: ["scanned-ticket", tokenId, result?.used ?? false, event?.id ?? null],
    enabled: wanted && Boolean(publicClient),
    staleTime: Infinity,
    queryFn: async (): Promise<ScannedTicketDetails> => {
      const client = publicClient!;
      const id = BigInt(tokenId!);

      const [typeId, owner, checkedInAt] = await Promise.all([
        client
          .readContract({ ...nft, functionName: "tokenTicketType", args: [id] })
          .then((t) => Number(t as bigint))
          .catch(() => null),
        result!.owner
          ? Promise.resolve(result!.owner)
          : client
              .readContract({ ...nft, functionName: "ownerOf", args: [id] })
              .then((o) => o as `0x${string}`)
              .catch(() => null),
        result!.used ? readCheckInTime(client, id) : Promise.resolve(null),
      ]);

      return { typeName: ticketTypeName(event, typeId), owner, checkedInAt };
    },
  });

  return wanted ? (query.data ?? EMPTY) : EMPTY;
}

type Client = NonNullable<ReturnType<typeof usePublicClient>>;

// When the ticket was checked in, from its TicketCheckedIn event (the same source My Tickets uses).
// TODO(#219): start from the contract's deploy block instead of 0, so this stays fast on Sepolia.
async function readCheckInTime(client: Client, tokenId: bigint): Promise<number | null> {
  try {
    const logs = await client.getContractEvents({ ...nft, eventName: "TicketCheckedIn", args: { tokenId }, fromBlock: BigInt(0) });
    const block = logs[logs.length - 1]?.blockNumber;
    if (block === undefined || block === null) return null;
    return Number((await client.getBlock({ blockNumber: block })).timestamp);
  } catch {
    return null;
  }
}
