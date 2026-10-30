"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";

import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { EntryQrDialog } from "@/components/tickets/EntryQrDialog";
import { TicketGroupCard } from "@/components/tickets/TicketGroupCard";
import { TicketSection, TicketsSkeleton } from "@/components/tickets/TicketSection";
import { ConnectWalletPrompt, HowItWorks, NoTicketsCard } from "@/components/tickets/TicketsEmptyState";
import { TicketViewSwitcher } from "@/components/tickets/TicketViewSwitcher";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useOwnedTickets } from "@/hooks/useOwnedTickets";
import { useTicketEvents } from "@/hooks/useTicketEvents";
import { groupTickets, parseTicketView, type TicketView } from "@/lib/my-tickets";

const VIEW_KEY = "nftokenpass:my-tickets-view";

// My Tickets (#286), from the Figma "My Tickets Page": the connected wallet's tickets grouped into
// upcoming and past, in a grid or a list, and the entry QR popup. Tickets are read from the contract
// (useOwnedTickets); the API only adds the event's name, date, venue and image.
export default function MyTicketsPage() {
  const hasMounted = useHasMounted();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const owned = useOwnedTickets();
  const details = useTicketEvents(owned.tickets.length > 0);
  const now = useNowMinutes();
  const grouped = useMemo(() => groupTickets(owned.tickets, details.events, now), [owned.tickets, details.events, now]);

  const [view, setView] = useState<TicketView>(readSavedView);
  const changeView = (next: TicketView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Private browsing or blocked storage: the choice just isn't remembered
    }
  };

  // The popup belongs to the wallet that opened it, so a wallet switch closes it
  const [qrFor, setQrFor] = useState<{ key: string; wallet: string } | null>(null);
  const qrGroup = qrFor && qrFor.wallet === address ? (grouped.upcoming.find((g) => g.key === qrFor.key) ?? null) : null;

  const connected = hasMounted && isConnected && Boolean(address);
  const loading = owned.loading || (owned.tickets.length > 0 && details.loading);
  const hasTickets = grouped.upcoming.length + grouped.past.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="page-glow flex-1">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 pt-8 pb-16 md:px-8">
          <div className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-end sm:justify-between sm:pb-8">
            <div className="flex flex-col gap-1">
              <h1 className="font-serif text-[32px] leading-10 font-semibold tracking-[-0.8px] text-foreground">My Tickets</h1>
              <p className="text-[15px] leading-6 text-muted-foreground">Your tickets and entry QR codes</p>
            </div>
            {connected && !loading && !owned.error && hasTickets && (
              <div className="flex justify-end">
                <TicketViewSwitcher view={view} onChange={changeView} />
              </div>
            )}
          </div>

          {/* The server can't know the wallet, so nothing wallet-specific renders until mounted (#220) */}
          {!hasMounted ? (
            <TicketsSkeleton />
          ) : !connected ? (
            <div className="flex flex-col gap-16 pt-8">
              <ConnectWalletPrompt onConnect={() => openConnectModal?.()} />
              <HowItWorks />
            </div>
          ) : loading ? (
            <TicketsSkeleton />
          ) : owned.error ? (
            <Alert
              tone="error"
              title="Couldn't load your tickets"
              action={
                <Button variant="secondary" size="sm" onClick={() => owned.reload()}>
                  Try again
                </Button>
              }
            >
              {owned.error}
            </Alert>
          ) : !hasTickets ? (
            <div className="flex flex-col gap-12 pt-4">
              <NoTicketsCard />
              <HowItWorks />
            </div>
          ) : (
            <div className="flex flex-col gap-16">
              {details.failed && (
                <Alert
                  tone="warning"
                  title="Event details aren't available right now"
                  action={
                    <Button variant="secondary" size="sm" onClick={() => details.reload()}>
                      Try again
                    </Button>
                  }
                >
                  Your tickets and entry QR codes still work.
                </Alert>
              )}
              {grouped.upcoming.length > 0 && (
                <TicketSection title="Upcoming" count={grouped.upcoming.length} tone="upcoming" view={view}>
                  {grouped.upcoming.map((group) => (
                    <TicketGroupCard key={group.key} group={group} view={view} onShowQr={() => setQrFor({ key: group.key, wallet: address! })} />
                  ))}
                </TicketSection>
              )}
              {grouped.past.length > 0 && (
                <TicketSection title="Past" count={grouped.past.length} tone="past" view={view}>
                  {grouped.past.map((group) => (
                    <TicketGroupCard key={group.key} group={group} view={view} onShowQr={() => {}} />
                  ))}
                </TicketSection>
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />
      <EntryQrDialog group={qrGroup} onClose={() => setQrFor(null)} />
    </div>
  );
}

function readSavedView(): TicketView {
  try {
    return parseTicketView(typeof window === "undefined" ? null : localStorage.getItem(VIEW_KEY));
  } catch {
    return "grid";
  }
}

// The current time, updated every minute, so tickets move to "past" when an event ends with the page open
function useNowMinutes() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
