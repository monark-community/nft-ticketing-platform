"use client";

import { getCheckInErrorMessage } from "@/lib/check-in-errors";
import { TICKET_NFT_ADDRESS, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import { useTransaction } from "./useTransaction";

type CheckInStatus = "idle" | "pending" | "success" | "error";

// Sends checkInTicket(tokenId) from the connected scanner wallet (#57),
// using the shared transaction hook (#101).
export function useCheckInTicket() {
  const tx = useTransaction({ getErrorMessage: getCheckInErrorMessage });

  function checkIn(tokenId: bigint) {
    return tx.run([
      {
        label: "Check in ticket",
        request: {
          address: TICKET_NFT_ADDRESS,
          abi: ticketNftAbi,
          functionName: "checkInTicket",
          args: [tokenId],
        },
      },
    ]);
  }

  const status: CheckInStatus = tx.isBusy
    ? "pending"
    : tx.state.phase === "success"
      ? "success"
      : tx.state.phase === "error"
        ? "error"
        : "idle";

  return {
    checkIn,
    reset: tx.reset,
    status,
    error: tx.state.error,
    txHash: tx.state.hash,
    isPending: status === "pending",
    transaction: tx.state,
    explorerUrl: tx.explorerUrl,
  };
}
