"use client";

import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { RotateCw, Wallet } from "lucide-react";
import { useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAccount, useChains, usePublicClient, useSwitchChain } from "wagmi";

import { TearOff } from "@/components/motion";
import { NetworkGuard } from "@/components/NetworkWarning";
import { ScanResult } from "@/components/ScanResult";
import { CameraFrame, CameraPausedBar, EventPicker, ScannerHeader, ScannerPanel, SoundToggle, type CameraLock } from "@/components/scanner/ScannerParts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ConnectWalletButton } from "@/components/WalletConnectButton";
import { useCheckInTicket } from "@/hooks/useCheckInTicket";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useScannableEvents } from "@/hooks/useScannableEvents";
import { useScannedTicketDetails } from "@/hooks/useScannedTicketDetails";
import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID } from "@/lib/contracts/ticket-nft";
import { playSignal, readSoundOn, rememberSoundOn, signalFor, unlockSound } from "@/lib/scan-signals";
import { cameraErrorMessage, canResumeCamera, codeFrame, pickEventId, scanView, wrongEventReason } from "@/lib/scanner";
import { cn } from "@/lib/utils";
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

// Where the sweeping line is now (px from the top of the camera), read from its transform
function linePosition(line: HTMLElement | null): number {
  if (!line) return 0;
  try {
    return new DOMMatrixReadOnly(getComputedStyle(line).transform).m42;
  } catch {
    return 0;
  }
}

// Ticket scanner for venue staff (#58), with the Figma "Scanner Page" design (#287).
// Motion (#373): nothing here waits for an animation, so the next scan is never held back. A found
// code is framed while it's checked; the result comes out of the camera frame as the screen edge
// glows in its colour, with a beep or buzz; Scan next ticket tears the card off over the camera.
export default function ScanPage() {
  const { address, isConnected: walletConnected, chainId: walletChainId } = useAccount();
  const hasMounted = useHasMounted();
  // Treat the wallet as disconnected until mount, so the first client render matches the server (#220)
  const isConnected = hasMounted && walletConnected;
  // Tickets are verified on the contract's chain, whatever network the wallet is on (#287 review)
  const publicClient = usePublicClient({ chainId: TICKET_NFT_CHAIN_ID });
  const contractChain = useChains().find((c) => c.id === TICKET_NFT_CHAIN_ID);
  const { switchChain, isPending: switchingNetwork } = useSwitchChain();
  const wrongNetwork = isConnected && walletChainId !== TICKET_NFT_CHAIN_ID;

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

  const reduced = useReducedMotion();
  const camera = useRef<HTMLDivElement>(null);
  const handed = useRef<HTMLDivElement>(null);
  // The corners' place around the code just found, and the camera's middle the result comes out of
  const [lock, setLock] = useState<CameraLock | null>(null);
  const [handFrom, setHandFrom] = useState<{ x: number; y: number } | null>(null);
  // The last card, being torn off over the camera
  const [tearing, setTearing] = useState<{ key: number; top: number; card: ReactNode } | null>(null);
  const ignore = () => {};

  // Sound: on unless turned off on this device; browsers allow it after the first tap or key press
  const [soundChoice, setSoundChoice] = useState<boolean | null>(null);
  const soundOn = soundChoice ?? (hasMounted ? readSoundOn() : true);
  useEffect(() => {
    window.addEventListener("pointerdown", unlockSound);
    window.addEventListener("keydown", unlockSound);
    return () => {
      window.removeEventListener("pointerdown", unlockSound);
      window.removeEventListener("keydown", unlockSound);
    };
  }, []);
  // Each result signals as it appears (signalFor): a valid ticket and a confirmed check-in beep,
  // "Do not admit" buzzes. scannedAt tells two scans with the same result apart.
  useEffect(() => {
    const signal = view && signalFor(view);
    if (signal) playSignal(signal);
  }, [view, scannedAt]);

  function toggleSound() {
    const next = !soundOn;
    setSoundChoice(next);
    rememberSoundOn(next);
    // Turning it on beeps once, so staff hear how loud it is
    if (next) {
      unlockSound();
      playSignal("ok", { vibrate: false });
    }
  }

  // The result grows out of the camera's middle: its transform-origin is set before it's painted
  useLayoutEffect(() => {
    const outer = handed.current;
    const inner = outer?.firstElementChild as HTMLElement | null | undefined;
    if (!result || !handFrom || !outer || !inner) return;
    const box = outer.getBoundingClientRect();
    inner.style.transformOrigin = `${handFrom.x - box.left}px ${handFrom.y - box.top}px`;
  }, [result, handFrom]);

  async function handleScan(codes: IDetectedBarcode[]) {
    const raw = codes[0]?.rawValue;
    if (!raw || verifying || result || !publicClient || eventId === null) return;

    setVerifying(true);
    // The corners close in on the code while it's checked (this never holds the result back)
    const box = camera.current;
    if (box) {
      const rect = box.getBoundingClientRect();
      const video = box.querySelector("video");
      const frame = codeFrame(codes[0].boundingBox, { width: video?.videoWidth ?? 0, height: video?.videoHeight ?? 0 }, rect);
      const lineFrom = linePosition(box.querySelector<HTMLElement>("[data-scan-line]"));
      setLock({ ...frame, lineFrom, lineTo: (frame.top + rect.height - frame.bottom) / 2 });
      setHandFrom({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }
    const verification = await verifyTicketQR({
      raw,
      publicClient,
      expectedChainId: TICKET_NFT_CHAIN_ID,
      expectedContract: TICKET_NFT_ADDRESS,
      expectedEventId: BigInt(eventId),
    });
    // Name the events instead of showing contract IDs
    if (verification.wrongEvent && event) {
      const ticketEvent = scannable.allEvents.find((e) => e.contract_event_id === verification.eventId?.toString());
      verification.reason = wrongEventReason(ticketEvent?.title ?? null, event.title);
    }
    setScannedAt(Date.now());
    setResult(verification);
    setVerifying(false);
  }

  function resetScan() {
    setResult(null);
    setLock(null);
    setHandFrom(null);
    checkIn.reset();
  }

  // The camera is back at once; the card tears off downwards over it
  function scanNext() {
    const copy = renderResult(false);
    if (!reduced && copy && handed.current) setTearing({ key: scannedAt, top: handed.current.offsetTop, card: copy });
    resetScan();
  }

  function chooseEvent(id: string) {
    setChosenEventId(id);
    rememberEvent(id);
    resetScan();
  }

  // The result card; the torn-off copy (live: false) does nothing when clicked
  function renderResult(live: boolean) {
    if (!result || !view) return null;
    return (
      <ScanResult
        result={result}
        view={view}
        transaction={checkIn.transaction}
        explorerUrl={checkIn.explorerUrl}
        details={details}
        scannedAt={scannedAt}
        wrongNetwork={wrongNetwork}
        networkName={contractChain?.name ?? "the right network"}
        switchingNetwork={live && switchingNetwork}
        onSwitchNetwork={live ? () => switchChain({ chainId: TICKET_NFT_CHAIN_ID }) : ignore}
        onCheckIn={live ? () => result.qr && checkIn.checkIn(BigInt(result.qr.tokenId)) : ignore}
        onScanNext={live ? scanNext : ignore}
        onStopWaiting={live ? checkIn.stopWaiting : ignore}
      />
    );
  }
  const resultCard = renderResult(true);

  return (
    <div className="flex min-h-screen flex-col">
      <ScannerHeader address={isConnected ? address : undefined} />
      <NetworkGuard />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-6 pb-10">
        <div className="flex items-center justify-between gap-3">
          <h1 className="type-heading-md text-foreground">Ticket scanner</h1>
          {isConnected && <SoundToggle on={soundOn} onToggle={toggleSound} />}
        </div>

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
              <div className="relative flex flex-col gap-5">
                {/* Camera: hidden but kept mounted while a result is on screen, so resuming is instant */}
                {result ? (
                  <CameraPausedBar canResume={canResumeCamera(view, checkIn.transaction.phase)} onResume={scanNext} />
                ) : null}
                <div className={result ? "hidden" : "flex flex-col gap-3"}>
                  {/* The frozen picture while a code is checked is a canvas: it fills the box like the video does */}
                  <div
                    ref={camera}
                    className="relative mx-auto aspect-square w-full max-w-[310px] overflow-hidden rounded-lg border border-border bg-card [&_canvas]:object-cover"
                  >
                    <Scanner
                      onScan={handleScan}
                      onError={(err) => setCameraError(cameraErrorMessage(err))}
                      // Ideal, not minimum, sizes: a webcam that can't reach them still starts
                      constraints={{ facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }}
                      paused={verifying || !!result}
                      formats={["qr_code"]}
                      sound={false}
                      components={{ finder: false }}
                      styles={{ container: { width: "100%", height: "100%" }, video: { objectFit: "cover" } }}
                    >
                      <CameraFrame lock={lock} />
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
                      {cameraError}
                    </Alert>
                  )}
                </div>

                {resultCard && (
                  <div ref={handed}>
                    <div key={scannedAt} className={cn(handFrom && "motion-safe:animate-[hand-over_200ms_var(--ease-arrive)_backwards]")} data-hand-over>
                      {resultCard}
                    </div>
                  </div>
                )}

                {/* The last card, torn off over the camera: only a picture of it, nothing in it works */}
                {tearing && (
                  <div
                    key={tearing.key}
                    className="pointer-events-none absolute inset-x-0 z-10 [&_*]:animate-none!"
                    style={{ top: tearing.top }}
                    aria-hidden="true"
                    inert
                    data-torn-card
                  >
                    <TearOff torn fall="down" onTorn={() => setTearing(null)}>
                      {tearing.card}
                    </TearOff>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* The screen edge glows in the result's colour for 400 ms, like the light on a gate */}
      {result && (
        <span
          key={scannedAt}
          className="pointer-events-none fixed inset-0 z-50 motion-safe:animate-[gate-glow_400ms_ease-out_forwards]"
          style={{ "--gate": result.ok ? "var(--success)" : "var(--destructive)" } as CSSProperties}
          aria-hidden="true"
          data-gate-glow={result.ok ? "valid" : "rejected"}
        />
      )}
    </div>
  );
}
