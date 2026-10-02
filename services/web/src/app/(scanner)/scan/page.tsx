"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { Navbar } from "@/components/Navbar";
import { ConnectWalletButton } from "@/components/WalletConnectButton";
import { Input } from "@/components/ui/input";
import { TICKET_NFT_ADDRESS } from "@/lib/contracts/ticket-nft";
import { verifyTicketQR, type TicketVerification } from "@/lib/verify-ticket";

// The camera only exists in the browser, so skip server rendering for the scanner
const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((mod) => mod.Scanner),
  { ssr: false }
);

export default function ScanPage() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const [eventIdInput, setEventIdInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<TicketVerification | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const eventIdValid = /^\d+$/.test(eventIdInput);
  const scannerReady = isConnected && eventIdValid && !!TICKET_NFT_ADDRESS;

  async function handleScan(codes: IDetectedBarcode[]) {
    const raw = codes[0]?.rawValue;
    if (!raw || verifying || result || !publicClient || !TICKET_NFT_ADDRESS) return;

    setVerifying(true);
    const verification = await verifyTicketQR({
      raw,
      publicClient,
      expectedChainId: chainId,
      expectedContract: TICKET_NFT_ADDRESS,
      expectedEventId: BigInt(eventIdInput),
    });
    setResult(verification);
    setVerifying(false);
  }

  function scanNext() {
    setResult(null);
  }

  return (
    <div className="min-h-screen bg-[#f0f4fb] flex flex-col">
      <Navbar />

      <div className="bg-[#3a7bd5] px-8 pb-5">
        <h1 className="text-white text-2xl font-bold">Ticket Scanner</h1>
        <p className="text-white/70 text-sm mt-1">Scan attendee QR codes at the entrance</p>
      </div>

      <div className="flex-1 flex flex-col items-center py-8 px-4">
        <div className="w-full max-w-md flex flex-col gap-5">
          {/* Setup */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex flex-col gap-3">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Event ID you are scanning for
            </label>
            <Input
              inputMode="numeric"
              placeholder="e.g. 1"
              value={eventIdInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setEventIdInput(e.target.value.trim());
                setResult(null);
              }}
            />
            {!isConnected && (
              <div className="flex flex-col items-center gap-2 pt-2">
                <p className="text-sm text-gray-600">Connect the scanner wallet to start.</p>
                <ConnectWalletButton />
              </div>
            )}
            {!TICKET_NFT_ADDRESS && (
              <p className="text-sm text-red-600">
                Ticket contract address is not configured (NEXT_PUBLIC_TICKET_CONTRACT_ADDRESS).
              </p>
            )}
          </div>

          {/* Camera */}
          {scannerReady && (
            <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
              <div className="rounded-md overflow-hidden aspect-square bg-black">
                <Scanner
                  onScan={handleScan}
                  onError={(err) => setCameraError(err.message)}
                  paused={verifying || !!result}
                  formats={["qr_code"]}
                  sound={false}
                />
              </div>
              <p className="text-xs text-gray-400 text-center mt-2">
                {verifying ? "Verifying ticket…" : result ? "Scanner paused" : "Point the camera at the attendee's QR code"}
              </p>
              {cameraError && (
                <p className="text-sm text-red-600 text-center mt-2">
                  Camera error: {cameraError}. Allow camera access in your browser and reload.
                </p>
              )}
            </div>
          )}

          {/* Result (simple for now; full result screen comes in #58) */}
          {result && (
            <div
              className={`rounded-lg p-5 border shadow-sm ${
                result.ok ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"
              }`}
            >
              <p className={`text-lg font-bold ${result.ok ? "text-green-700" : "text-red-700"}`}>
                {result.ok ? "✅ Ticket verified" : "❌ Ticket rejected"}
              </p>
              {result.reason && <p className="text-sm text-red-700 mt-1">{result.reason}</p>}
              {result.qr && (
                <p className="text-xs text-gray-600 mt-2">
                  Ticket #{result.qr.tokenId}
                  {result.eventId !== undefined && ` · Event #${result.eventId}`}
                </p>
              )}
              <button
                onClick={scanNext}
                className="mt-4 w-full bg-[#3a7bd5] hover:bg-[#2d63b0] text-white font-semibold py-2 rounded-lg"
              >
                Scan next ticket
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
