"use client";

import { Navbar } from "@/components/Navbar";
import { ScanResult } from "@/components/ScanResult";
import { Input } from "@/components/ui/input";
import { ConnectWalletButton } from "@/components/WalletConnectButton";
import { useCheckInTicket } from "@/hooks/useCheckInTicket";
import { useScannerAuthorization } from "@/hooks/useScannerAuth";
import { TICKET_NFT_ADDRESS } from "@/lib/contracts/ticket-nft";
import { verifyTicketQR, type TicketVerification } from "@/lib/verify-ticket";
import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";

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
  const checkIn = useCheckInTicket();

  const eventIdValid = /^\d+$/.test(eventIdInput);
  const scannerAuth = useScannerAuthorization(eventIdValid ? BigInt(eventIdInput) : null);
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
    scannerAuth.refresh();
  }

  function scanNext() {
    setResult(null);
    checkIn.reset();
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
                checkIn.reset();
              }}
            />
            {!isConnected && (
              <div className="flex flex-col items-center gap-2 pt-2">
                <p className="text-sm text-gray-600">Connect the scanner wallet to start.</p>
                <ConnectWalletButton />
              </div>
            )}
            {isConnected && eventIdValid && scannerAuth.status === "notAuthorized" && (
              <p className="text-sm rounded-md bg-amber-50 border border-amber-300 px-3 py-2 text-amber-900">
                This wallet is not a scanner for event #{eventIdInput}. You can still verify
                tickets, but check-in will fail until the organizer adds this wallet as a scanner.
              </p>
            )}
            {!TICKET_NFT_ADDRESS && (
              <p className="text-sm text-red-600">
                Ticket contract address is not configured (NEXT_PUBLIC_TICKET_CONTRACT_ADDRESS).
              </p>
            )}
          </div>

          {/* Camera */}
          {scannerReady && (
            <div className={`bg-white border border-gray-200 rounded-lg p-3 shadow-sm ${result ? "hidden" : ""}`}>
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
                {verifying ? "Verifying ticket..." : "Point the camera at the attendee's QR code"}
              </p>
              {cameraError && (
                <p className="text-sm text-red-600 text-center mt-2">
                  Camera error: {cameraError}. Allow camera access in your browser and reload.
                </p>
              )}
            </div>
          )}

          {/* Result (#58) */}
          {result && (
            <ScanResult
              result={result}
              checkInStatus={checkIn.status}
              checkInError={checkIn.error}
              txHash={checkIn.txHash}
              onCheckIn={() => result.qr && checkIn.checkIn(BigInt(result.qr.tokenId))}
              onScanNext={scanNext}
              canCheckIn={scannerAuth.status !== "notAuthorized"}
            />
          )}
        </div>
      </div>
    </div>
  );
}
