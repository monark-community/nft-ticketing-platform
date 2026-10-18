"use client";

import { TICKET_NFT_ADDRESS, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import { useCallback, useEffect, useRef, useState } from "react";
import { zeroHash } from "viem";
import { useAccount, usePublicClient } from "wagmi";

export type ScannerAuthorization = "unknown" | "authorized" | "notAuthorized";

// The result of a completed check, tagged with the address and event it ran for, so a
// stale result is never shown after the inputs change.
type CheckResult = {
  key: string;
  status: ScannerAuthorization;
};

function checkKey(address: `0x${string}`, eventId: bigint) {
  return `${address}:${eventId}`;
}

// Mirrors the access check in TicketNFT.checkInTicket(): the wallet can check tickets in
// if it's a scanner for this event, an organizer, or an admin. Lets the scanner page
// warn upfront instead of failing at check-in.
export function useScannerAuthorization(eventId: bigint | null) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [result, setResult] = useState<CheckResult | null>(null);
  // Only the most recently started check is allowed to update the state.
  const requestRef = useRef(0);

  const check = useCallback(async (): Promise<CheckResult | null> => {
    if (!address || !publicClient || eventId === null) return null;

    const key = checkKey(address, eventId);
    const contract = TICKET_NFT_ADDRESS;

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

      return {
        key,
        status:
          isEventScanner || isOrganizer || isAdmin
            ? "authorized"
            : "notAuthorized",
      };
    } catch (err) {
      console.error("Could not check scanner authorization:", err);
      return { key, status: "unknown" };
    }
  }, [address, publicClient, eventId]);

  // The result is recorded in a promise callback, never synchronously from the effect,
  // so the check never triggers a cascading re-render (react-hooks/set-state-in-effect).
  const refresh = useCallback(() => {
    const requestId = ++requestRef.current;
    void check().then((next) => {
      if (next && requestId === requestRef.current) {
        setResult(next);
      }
    });
  }, [check]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const status: ScannerAuthorization =
    result && address && eventId !== null && result.key === checkKey(address, eventId)
      ? result.status
      : "unknown";

  return { status, refresh };
}
