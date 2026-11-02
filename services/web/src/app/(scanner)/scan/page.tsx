"use client";

import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { RotateCw, Wallet } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";

import { ScanResult } from "@/components/ScanResult";
import { CameraFrame, CameraPausedBar, EventPicker, ScannerHeader, ScannerPanel } from "@/components/scanner/ScannerParts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ConnectWalletButton } from "@/components/WalletConnectButton";
import { useCheckInTicket } from "@/hooks/useCheckInTicket";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useScannableEvents } from "@/hooks/useScannableEvents";
import { useScannedTicketDetails } from "@/hooks/useScannedTicketDetails";
import { TICKET_NFT_ADDRESS } from "@/lib/contracts/ticket-nft";
import { canResumeCamera, pickEventId, scanView } from "@/lib/scanner";
import { verifyTicketQR, type TicketVerification } from "@/lib/verify-ticket";

// The camera only exists in the browser, so skip server rendering for the scanner
const Scanner = dynamic(() => import("@yudiel/react-qr-scanner").then((mod) => mod.Scanner), { ssr: false });

const EVENT_STORAGE_KEY = "scanner:event";

function readRememberedEvent(): string | null {
  try {
    return window.localStorage.getItem(EVENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberEvent(id: string) {
  try {
    window.localStorage.setItem(EVENT_STORAGE_KEY, id);
  } catch {
    // Storage can be blocked (private mode); the picker still works for this visit
  }
}

// Ticket scanner for venue staff (#58), with the Figma "Scanner Page" design (#287)
export default function ScanPage() {
  const { address, isConnected: walletConnected } = useAccount();
  const hasMounted = useHasMounted();
  // Treat the wallet as disconnected until mount, so the first client render matches the server (#220)
  const isConnected = hasMounted && walletConnected;
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const scannable = useScannableEvents(isConnected ? address : undefined);
  const [chosenEventId, setChosenEventId] = useState<string | null>(null);
  const eventIds = scannable.events.map((e) => e.contract_event_id!);
  const eventId = pickEventId(eventIds, chosenEventId ?? (hasMounted ? readRememberedEvent() : null));
  const event = scannable.events.find((e) => e.contract_event_id === eventId) ?? null;

  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<TicketVerification | null>(null);
  const [scannedAt, setScannedAt] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const checkIn = useCheckInTicket();
  const details = useScannedTicketDetails(result, event);

  const view = result ? scanView(result, checkIn.transaction.phase) : null;

  async function handleScan(codes: IDetectedBarcode[]) {
    const raw = codes[0]?.rawValue;
    if (!raw || verifying || result || !publicClient || eventId === null) return;

    setVerifying(true);
    const verification = await verifyTicketQR({
      raw,
      publicClient,
      expectedChainId: chainId,
      expectedContract: TICKET_NFT_ADDRESS,
      expectedEventId: BigInt(eventId),
    });
    setScannedAt(Date.now());
    setResult(verification);
    setVerifying(false);
  }

  function scanNext() {
    setResult(null);
    checkIn.reset();
  }

  function chooseEvent(id: string) {
    setChosenEventId(id);
    rememberEvent(id);
    scanNext();
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ScannerHeader address={isConnected ? address : undefined} />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-6 pb-10">
        <h1 className="type-heading-lg text-foreground">Ticket scanner</h1>

        {!isConnected ? (
          <ScannerPanel
            icon={<Wallet aria-hidden="true" />}
            title="Connect the scanner wallet"
            action={<ConnectWalletButton />}
          >
            Use the wallet the organizer added as a scanner for this event.
          </ScannerPanel>
        ) : (
          <>
            <EventPicker events={scannable.events} value={eventId} loading={scannable.loading} onChange={chooseEvent} />

            {scannable.failed ? (
              <Alert
                tone="error"
                title="Couldn't load your events"
                action={
                  <Button variant="outline" size="sm" onClick={scannable.reload}>
                    <RotateCw aria-hidden="true" />
                    Try again
                  </Button>
                }
              >
                Check your connection and try again.
              </Alert>
            ) : scannable.loading ? null : !event ? (
              <ScannerPanel title="This wallet can't scan tickets">
                Ask the event organizer to add this wallet as a scanner, then reload this page.
              </ScannerPanel>
            ) : (
              <>
                {/* Camera: hidden but kept mounted while a result is on screen, so resuming is instant */}
                {result ? (
                  <CameraPausedBar canResume={canResumeCamera(view, checkIn.transaction.phase)} onResume={scanNext} />
                ) : null}
                <div className={result ? "hidden" : "flex flex-col gap-3"}>
                  <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-lg border border-border bg-card">
                    <Scanner
                      onScan={handleScan}
                      onError={(err) => setCameraError(err.message)}
                      paused={verifying || !!result}
                      formats={["qr_code"]}
                      sound={false}
                      components={{ finder: false }}
                      styles={{ container: { width: "100%", height: "100%" }, video: { objectFit: "cover" } }}
                    >
                      <CameraFrame />
                    </Scanner>
                  </div>
                  <p className="flex items-center justify-center gap-2 text-center type-body-md text-secondary-foreground" aria-live="polite">
                    {verifying ? (
                      <>
                        <Spinner className="text-primary" />
                        Checking ticket...
                      </>
                    ) : (
                      "Point the camera at the attendee's QR code"
                    )}
                  </p>
                  {cameraError && (
                    <Alert tone="error" title="Camera unavailable">
                      {cameraError}. Allow camera access in your browser, then reload this page.
                    </Alert>
                  )}
                </div>

                {result && view && (
                  <ScanResult
                    result={result}
                    view={view}
                    transaction={checkIn.transaction}
                    explorerUrl={checkIn.explorerUrl}
                    details={details}
                    scannedAt={scannedAt}
                    onCheckIn={() => result.qr && checkIn.checkIn(BigInt(result.qr.tokenId))}
                    onScanNext={scanNext}
                    onStopWaiting={checkIn.stopWaiting}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
