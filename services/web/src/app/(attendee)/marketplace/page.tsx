"use client";

import { AlertCircle, CircleChevronDown, RotateCw, ShieldCheck, Ticket } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { EventsMessage } from "@/components/events/EventsMessage";
import { Footer } from "@/components/Footer";
import { BuyDialog } from "@/components/marketplace/BuyDialog";
import { ListingCard, ListingCardSkeleton } from "@/components/marketplace/ListingCard";
import { MarketplaceFilters } from "@/components/marketplace/MarketplaceFilters";
import { SellDialog } from "@/components/marketplace/SellDialog";
import { YourListings } from "@/components/marketplace/YourListings";
import { Navbar } from "@/components/Navbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useListingEvents } from "@/hooks/useListingEvents";
import { LISTINGS_PAGE_SIZE, useListings } from "@/hooks/useListings";
import { DEFAULT_FILTERS, hasActiveFilters, type Listing, type ListingFilters } from "@/lib/marketplace";

const SEARCH_DELAY_MS = 300;
// The listener saves a new listing or sale within a few seconds of its block (it polls every 4 s),
// so after a transaction the lists are read again a few times
const REFRESH_AFTER_CHANGE_MS = [0, 4_500, 9_000];
const MY_LISTINGS: ListingFilters = { ...DEFAULT_FILTERS, sort: "newest" };

// Marketplace (#295), from the Figma "Marketplace" frames: tickets resold by other fans, with
// search, event, category and sort; the Buy and Sell popups; and the wallet's own listings.
// Listings come from the API (#315); buying and selling go straight to the contract (#294).
export default function MarketplacePage() {
  const hasMounted = useHasMounted();
  const { address, isConnected } = useAccount();
  const wallet = hasMounted && isConnected ? address : undefined;

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ListingFilters>(DEFAULT_FILTERS);
  // Typing waits a moment before searching, so each key press isn't a request
  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.q === search ? current : { ...current, q: search })), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const market = useListings(filters);
  const mine = useListings(MY_LISTINGS, { seller: wallet, enabled: Boolean(wallet), pageSize: 50 });
  const events = useListingEvents();

  const [buying, setBuying] = useState<Listing | null>(null);
  const [selling, setSelling] = useState<{ tokenId: string | null } | null>(null);
  const [sellLinkClosed, setSellLinkClosed] = useState(false);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const { reload: reloadMarket } = market;
  const { reload: reloadMine } = mine;
  const refreshAfterChange = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = REFRESH_AFTER_CHANGE_MS.map((delay) =>
      setTimeout(() => {
        void reloadMarket(true);
        if (wallet) void reloadMine(true);
      }, delay),
    );
  }, [reloadMarket, reloadMine, wallet]);

  const myTokens = useMemo(() => new Set(mine.listings.map((l) => l.token_id)), [mine.listings]);
  const isMine = (listing: Listing) => Boolean(wallet) && (myTokens.has(listing.token_id) || listing.seller_wallet === wallet?.toLowerCase());
  const filtered = hasActiveFilters(filters);

  function clearFilters() {
    setSearch("");
    setFilters({ ...DEFAULT_FILTERS, sort: filters.sort });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="page-glow flex-1">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-4 pt-10 pb-16 md:px-8">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="type-heading-lg text-foreground">Marketplace</h1>
              <p className="type-body-lg text-secondary-foreground">Buy tickets resold by other fans</p>
            </div>
            <Button variant="outline" className="normal-case tracking-normal" onClick={() => setSelling({ tokenId: null })}>
              <Ticket className="text-primary" aria-hidden="true" />
              Sell a ticket
            </Button>
          </header>

          <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary-tint text-primary">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </span>
            <p className="type-body-md text-secondary-foreground">
              Every resale follows the organizer&apos;s price cap, and the organizer receives a royalty on each sale.
            </p>
          </div>

          {wallet && mine.listings.length > 0 && (
            <YourListings listings={mine.listings} onEdit={(tokenId) => setSelling({ tokenId })} onChanged={refreshAfterChange} />
          )}

          <MarketplaceFilters
            search={search}
            onSearchChange={setSearch}
            filters={filters}
            onChange={setFilters}
            events={events}
            onRefresh={() => void market.reload()}
            refreshing={market.loading}
          />

          {market.loading ? (
            <div role="status" aria-label="Loading listings" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: Math.min(6, LISTINGS_PAGE_SIZE) }, (_, i) => (
                <ListingCardSkeleton key={i} />
              ))}
            </div>
          ) : market.error ? (
            <EventsMessage
              icon={<AlertCircle aria-hidden="true" />}
              title="Couldn't load listings"
              action={
                <Button onClick={() => void market.reload()}>
                  <RotateCw aria-hidden="true" />
                  Try again
                </Button>
              }
            >
              <p role="alert">Something went wrong while loading the Marketplace. Check your connection and try again.</p>
            </EventsMessage>
          ) : market.listings.length === 0 ? (
            filtered ? (
              <EventsMessage
                icon={<Ticket aria-hidden="true" />}
                title="No listings match"
                action={
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              >
                <p>No resale tickets match your search. Try another event or category.</p>
              </EventsMessage>
            ) : (
              <EventsMessage
                icon={<Ticket aria-hidden="true" />}
                title="No resale tickets yet"
                action={<Button onClick={() => setSelling({ tokenId: null })}>Sell a ticket</Button>}
              >
                <p>When fans list their tickets, they show up here.</p>
              </EventsMessage>
            )
          ) : (
            <>
              <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {market.listings.map((listing) => (
                  <li key={listing.token_id} className="flex">
                    <ListingCard
                      listing={listing}
                      mine={isMine(listing)}
                      onBuy={() => setBuying(listing)}
                      onEdit={() => setSelling({ tokenId: listing.token_id })}
                    />
                  </li>
                ))}
              </ul>

              <div className="flex flex-col items-center gap-3">
                <p className="type-body-sm text-muted-foreground" aria-live="polite">
                  Showing {market.listings.length} of {market.total} {market.total === 1 ? "listing" : "listings"}
                </p>
                {market.loadMoreError && (
                  <Alert tone="error" title="Couldn't load more listings" className="w-full max-w-md">
                    Something went wrong while loading more listings. Try again.
                  </Alert>
                )}
                {market.hasMore && (
                  <Button variant="outline" className="normal-case tracking-normal" onClick={() => void market.loadMore()} loading={market.loadingMore}>
                    {market.loadMoreError ? "Try again" : "Load more listings"}
                    {!market.loadingMore && <CircleChevronDown className="text-primary" aria-hidden="true" />}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />

      <BuyDialog listing={buying} onClose={() => setBuying(null)} onBought={refreshAfterChange} />
      <SellDialog open={selling !== null} tokenId={selling?.tokenId ?? null} onClose={() => setSelling(null)} onChanged={refreshAfterChange} />
      {/* useSearchParams needs a Suspense boundary in the App Router */}
      <Suspense fallback={null}>
        <SellFromLink
          closed={sellLinkClosed || selling !== null}
          onClose={() => {
            setSellLinkClosed(true);
            // Drop ?sell= so a reload doesn't open it again
            window.history.replaceState(null, "", window.location.pathname);
          }}
          onChanged={refreshAfterChange}
        />
      </Suspense>
    </div>
  );
}

// "Sell on Marketplace" on My Tickets opens the Sell popup for that ticket: /marketplace?sell=12
function SellFromLink({ closed, onClose, onChanged }: { closed: boolean; onClose: () => void; onChanged: () => void }) {
  const tokenId = useSearchParams().get("sell");
  const hasMounted = useHasMounted(); // the wallet is only known once mounted (#220)
  if (closed || !hasMounted || !tokenId || !/^\d+$/.test(tokenId)) return null;
  return <SellDialog open tokenId={tokenId} onClose={onClose} onChanged={onChanged} />;
}
