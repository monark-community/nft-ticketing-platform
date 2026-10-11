"use client";

import { Button } from "@/components/ui/button";
import { TICKET_NFT_ADDRESS } from "@/lib/contracts/ticket-nft";
import {
  buildCheckInMessage,
  encodeTicketQR,
  QR_MAX_AGE_SECONDS,
  type TicketQRData,
} from "@/lib/ticket-qr";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { useAccount, useChainId, useSignMessage } from "wagmi";

interface Props {
  tokenId: bigint;
  eventId: bigint;
}

export function TicketQRCode({ tokenId, eventId }: Props) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync, isPending } = useSignMessage();

  const [qrValue, setQrValue] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Countdown so the user knows when to regenerate
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const left = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
      setSecondsLeft(left);
      if (left === 0) setQrValue(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  async function generate() {
    if (!address) return;
    setError(null);

    const data: TicketQRData = {
      tokenId: tokenId.toString(),
      eventId: eventId.toString(),
      contractAddress: TICKET_NFT_ADDRESS,
      chainId,
      timestamp: Math.floor(Date.now() / 1000),
    };

    try {
      // Gasless: the wallet signs a message, nothing is sent on-chain
      const signature = await signMessageAsync({ message: buildCheckInMessage(data) });
      setQrValue(encodeTicketQR(data, signature));
      setExpiresAt(data.timestamp + QR_MAX_AGE_SECONDS);
    } catch {
      setError("Signature was cancelled. Sign the message to show your entry QR code.");
    }
  }

  if (!qrValue) {
    return (
      <div className="flex flex-col items-center gap-2">
        <Button
          onClick={generate}
          disabled={isPending}
          className="bg-[#3a7bd5] hover:bg-[#2d63b0] text-white font-semibold"
        >
          {isPending ? "Confirm in your wallet…" : "Show Entry QR Code"}
        </Button>
        <p className="text-xs text-gray-400 text-center">
          You&apos;ll sign a free message to prove you own this ticket.
        </p>
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="bg-white p-3 rounded-lg border border-gray-200">
        <QRCodeSVG value={qrValue} size={200} level="M" />
      </div>
      <p className="text-xs text-gray-500">
        Expires in {secondsLeft}s
      </p>
      <button
        onClick={generate}
        className="text-xs font-semibold text-[#3a7bd5] hover:underline"
      >
        Regenerate
      </button>
    </div>
  );
}