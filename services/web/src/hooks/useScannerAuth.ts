"use client";

import { TICKET_NFT_ADDRESS, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import { useCallback, useEffect, useState } from "react";
import { zeroHash } from "viem";
import { useAccount, usePublicClient } from "wagmi";

export type ScannerAuthorization =
  | "unknown"
  | "checking"
  | "authorized"
  | "notAuthorized";

// Mirrors the access check in TicketNFT.checkInTicket(): the wallet can check tickets in
// if it's a scanner for this event, an organizer, or an admin. Lets the scanner page
// warn upfront instead of failing at check-in.
export function useScannerAuthorization(eventId: bigint | null) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [status, setStatus] = useState<ScannerAuthorization>("unknown");

  const check = useCallback(async () => {
    if (!address || !publicClient || eventId === null) {
      setStatus("unknown");
      return;
    }
    const contract = TICKET_NFT_ADDRESS;

    setStatus("checking");
    try {
      const organizerRole = (await publicClient.readContract({
        address: contract,
        abi: ticketNftAbi,
        functionName: "ORGANIZER_ROLE",
      })) as `0x${string}`;

      // Cast to the Solidity return types (the JSON ABI has no exact types)
      const [isEventScanner, isOrganizer, isAdmin] = (await Promise.all([
        publicClient.readContract({
          address: contract,
          abi: ticketNftAbi,
          functionName: "eventScanners",
          args: [eventId, address],
        }),
        publicClient.readContract({
          address: contract,
          abi: ticketNftAbi,
          functionName: "hasRole",
          args: [organizerRole, address],
        }),
        publicClient.readContract({
          address: contract,
          abi: ticketNftAbi,
          functionName: "hasRole",
          args: [zeroHash, address], // DEFAULT_ADMIN_ROLE is bytes32(0)
        }),
      ])) as [boolean, boolean, boolean];

      setStatus(
        isEventScanner || isOrganizer || isAdmin
          ? "authorized"
          : "notAuthorized",
      );
    } catch (err) {
      console.error("Could not check scanner authorization:", err);
      setStatus("unknown");
    }
  }, [address, publicClient, eventId]);

  useEffect(() => {
    check();
  }, [check]);

  return { status, refresh: check };
}
