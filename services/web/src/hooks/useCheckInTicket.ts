"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { ticketNftAbi, TICKET_NFT_ADDRESS } from "@/lib/contracts/ticket-nft";
import { CHECK_IN_ERRORS, getCheckInErrorMessage } from "@/lib/check-in-errors";

type CheckInStatus = "idle" | "pending" | "success" | "error";

// Sends checkInTicket(tokenId) from the connected scanner wallet (#57).
export function useCheckInTicket() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [status, setStatus] = useState<CheckInStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  async function checkIn(tokenId: bigint) {
    if (!address || !publicClient || !TICKET_NFT_ADDRESS) return;

    setStatus("pending");
    setError(null);
    setTxHash(null);

    try {
      // Simulate first: if the contract would revert (not authorized, already used,
      // nonexistent token), we get the decoded reason before the wallet pops up.
      const { request } = await publicClient.simulateContract({
        address: TICKET_NFT_ADDRESS,
        abi: ticketNftAbi,
        functionName: "checkInTicket",
        args: [tokenId],
        account: address,
      });

      const hash = await writeContractAsync(request);
      setTxHash(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        setError(CHECK_IN_ERRORS.revertedOnChain);
        setStatus("error");
        return;
      }

      setStatus("success");
    } catch (err) {
      console.error("Check-in failed:", err);
      setError(getCheckInErrorMessage(err));
      setStatus("error");
    }
  }

  function reset() {
    setStatus("idle");
    setError(null);
    setTxHash(null);
  }

  return { checkIn, reset, status, error, txHash, isPending: status === "pending" };
}
