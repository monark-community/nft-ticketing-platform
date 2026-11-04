"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";

import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID } from "@/lib/contracts/ticket-nft";
import { buildEntryQRData, isSignatureRejected, type OwnedTicket } from "@/lib/my-tickets";
import { buildCheckInMessage, encodeTicketQR } from "@/lib/ticket-qr";

export type EntryQr =
  | { status: "signing" }
  | { status: "ready"; value: string; timestamp: number }
  | { status: "cancelled" } // closed or rejected in the wallet
  | { status: "failed" };

// Entry QR codes for the tickets shown in the QR popup, by token ID (#286). The popup owns this
// state, so closing it forgets every code.
// Each code is a free signature, nothing goes on-chain. One wallet request at a time, and a code
// signed by a wallet that is no longer connected is thrown away.
export function useEntryQr() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [codes, setCodes] = useState<Record<string, EntryQr>>({});
  const pending = useRef(false);
  const addressRef = useRef(address);

  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  const sign = useCallback(
    async (ticket: Pick<OwnedTicket, "tokenId" | "eventId">) => {
      if (pending.current || !address) return;
      pending.current = true;
      const key = ticket.tokenId.toString();
      const signer = address;
      setCodes((current) => ({ ...current, [key]: { status: "signing" } }));

      const data = buildEntryQRData(ticket, TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID, Math.floor(Date.now() / 1000));
      let next: EntryQr;
      try {
        const signature = await signMessageAsync({ message: buildCheckInMessage(data) });
        next = { status: "ready", value: encodeTicketQR(data, signature), timestamp: data.timestamp };
      } catch (err) {
        next = { status: isSignatureRejected(err) ? "cancelled" : "failed" };
      } finally {
        pending.current = false;
      }

      // The wallet changed while signing: this code would be rejected at the door, so drop it
      const sameWallet = addressRef.current === signer;
      setCodes((current) => {
        const { [key]: _dropped, ...rest } = current; // eslint-disable-line @typescript-eslint/no-unused-vars
        return sameWallet ? { ...rest, [key]: next } : rest;
      });
    },
    [address, signMessageAsync],
  );

  return { codes, sign };
}
