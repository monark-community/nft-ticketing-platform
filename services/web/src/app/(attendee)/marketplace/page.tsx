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
import { PrintIn, RollingNumber } from "@/components/motion";
import { ShuffleGrid } from "@/components/motion/ShuffleGrid";
import { SellDialog } from "@/components/marketplace/SellDialog";
import { YourListings } from "@/components/marketplace/YourListings";
import { Navbar } from "@/components/Navbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useListingEvents } from "@/hooks/useListingEvents";
import { useHeldLoading } from "@/hooks/useHeldLoading";
import { useSawLoading } from "@/hooks/useSawLoading";
import { LISTINGS_PAGE_SIZE, useListings } from "@/hooks/useListings";
import {
  DEFAULT_FILTERS,
  hasActiveFilters,
  savedListingChanges,
  withListingChanges,
  type Listing,
  type ListingChange,
  type ListingChanges,
  type ListingFilters,
} from "@/lib/marketplace";
import { printDelay } from "@/lib/motion";

const SEARCH_DELAY_MS = 300;
// The listener saves a new listing or sale within a few seconds of its block (it polls every 4 s),
// so after a transaction the lists are read again every 2 s until they have it, for 20 s at most
const RELOAD_EVERY_MS = 2_000;
const RELOAD_FOR_MS = 20_000;
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
  const sawListingsLoading = useSawLoading(market.loading);
  // Placeholders never flash for a fast answer, and never blink when they do show (#365)
  const showPlaceholders = useHeldLoading(market.loading);
  const mine = useListings(MY_LISTINGS, { seller: wallet, enabled: Boolean(wallet), pageSize: 50 });
  const events = useListingEvents();

  const [buying, setBuying] = useState<Listing | null>(null);
  // Focus lands here when the Buy popup closes after a purchase: the bought card has left (#457)
  const listingsHeading = useRef<HTMLHeadingElement>(null);
  const [selling, setSelling] = useState<{ tokenId: string | null } | null>(null);
  const [sellLinkClosed, setSellLinkClosed] = useState(false);

  // Listings changed here that the API doesn't have yet. What you change in the Sell or Buy popup
  // shows on the page when you close it, so you see it happen (#368); a listing cancelled from Your
  // listings says it leaves in a few seconds, and leaves once the API has it.
  const [changes, setChanges] = useState<Record<string, PendingChange>>({});
  const lastChange = useRef(0);
  const recordChange = useCallback((change: ListingChange, show: PendingChange["show"]) => {
    lastChange.current = Date.now();
    setChanges((current) => ({ ...current, [change.tokenId]: { price: change.price, show } }));
  }, []);
  const showPopupChanges = useCallback(() => {
    setChanges((current) => mapChanges(current, (change) => (change.show === "afterPopup" ? { ...change, show: "now" } : change)));
  }, []);
  // Done with the ones the API's lists have
  const saved = savedListingChanges(pricesOf(changes), [market.listings, mine.listings]);
  if (saved.length > 0) setChanges(mapChanges(changes, (change, tokenId) => (saved.includes(tokenId) ? null : change)));

  const waiting = Object.keys(changes).length > 0;
  const { reload: reloadMarket } = market;
  const { reload: reloadMine } = mine;
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => {
      if (Date.now() - lastChange.current >= RELOAD_FOR_MS) {
        setChanges({}); // still not there: the API's copy is shown, whatever it says
        return;
      }
      void reloadMarket(true);
      if (wallet) void reloadMine(true);
    }, RELOAD_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [waiting, reloadMarket, reloadMine, wallet]);

  const shown = useMemo(() => pricesOf(changes, "now"), [changes]);
  const listings = useMemo(() => withListingChanges(market.listings, shown), [market.listings, shown]);
  const total = market.total - (market.listings.length - listings.length);
  const myListings = useMemo(() => withListingChanges(mine.listings, shown), [mine.listings, shown]);
  const waitingPrices = useMemo(() => pricesOf(changes), [changes]);

  const myTokens = useMemo(() => new Set(myListings.map((l) => l.token_id)), [myListings]);
  const isMine = (listing: Listing) => Boolean(wallet) && (myTokens.has(listing.token_id) || listing.seller_wallet === wallet?.toLowerCase());
  const filtered = hasActiveFilters(filters);

  function clearFilters() {
    setSearch("");
    setFilters({ ...DEFAULT_FILTERS, sort: filters.sort });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="page-glow flex-1">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-4 pt-10 pb-16 md:px-8">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="type-heading-lg text-foreground">Marketplace</h1>
              <p className="type-body-lg text-secondary-foreground">Buy tickets resold by other fans</p>
            </div>
            {/* The ticket icon is pulled out of the button on hover (#368) */}
            <Button variant="outline" className="group normal-case tracking-normal" onClick={() => setSelling({ tokenId: null })}>
              <Ticket
                className="text-primary transition-transform duration-[140ms] ease-[var(--ease-snap)] group-hover:translate-x-[3px] group-hover:-rotate-12"
                aria-hidden="true"
              />
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

          {wallet && myListings.length > 0 && (
            <YourListings
              listings={myListings}
              onEdit={(tokenId) => setSelling({ tokenId })}
              onCancelled={(tokenId) => recordChange({ tokenId, price: null }, "no")}
            />
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
          
          <h2 ref={listingsHeading} tabIndex={-1} className="sr-only">
            Resale listings
          </h2>

          {showPlaceholders ? (
            <div role="status" aria-label="Loading listings" className="placeholder-in grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
          ) : listings.length === 0 ? (
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
              {/* Cards print in when they replace the placeholders (#365); a filter or sort change
                  slides the cards that stay, lifting them a little while they move (#368) */}
              <ShuffleGrid
                items={listings}
                itemKey={(listing) => listing.token_id}
                batch={market.batch}
                print={sawListingsLoading}
                updating={market.updating}
                lift
                className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
              >
                {(listing, arrival) => (
                  <PrintOnArrival print={arrival.print} order={arrival.order}>
                    <ListingCard
                      listing={listing}
                      mine={isMine(listing)}
                      onBuy={() => setBuying(listing)}
                      onEdit={() => setSelling({ tokenId: listing.token_id })}
                    />
                  </PrintOnArrival>
                )}
              </ShuffleGrid>

              <div className="flex flex-col items-center gap-3">
                <p className="type-body-sm text-muted-foreground" aria-live="polite">
                  Showing <RollingNumber value={listings.length} /> of <RollingNumber value={total} /> {total === 1 ? "listing" : "listings"}
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

      <BuyDialog
        listing={buying}
        onClose={() => {
          setBuying(null);
          showPopupChanges();
        }}
        onBought={() => buying && recordChange({ tokenId: buying.token_id, price: null }, "afterPopup")}
        focusAfterBuy={listingsHeading}
      />
      <SellDialog
        open={selling !== null}
        tokenId={selling?.tokenId ?? null}
        onClose={() => {
          setSelling(null);
          showPopupChanges();
        }}
        onChanged={(change) => recordChange(change, "afterPopup")}
        changes={waitingPrices}
      />
      {/* useSearchParams needs a Suspense boundary in the App Router */}
      <Suspense fallback={null}>
        <SellFromLink
          closed={sellLinkClosed || selling !== null}
          onClose={() => {
            setSellLinkClosed(true);
            showPopupChanges();
            // Drop ?sell= so a reload doesn't open it again
            window.history.replaceState(null, "", window.location.pathname);
          }}
          onChanged={(change) => recordChange(change, "afterPopup")}
          changes={waitingPrices}
        />
      </Suspense>
    </div>
  );
}

// "Sell on Marketplace" on My Tickets opens the Sell popup for that ticket: /marketplace?sell=12
function SellFromLink({ closed, onClose, onChanged, changes }: { closed: boolean; onClose: () => void; onChanged: (change: ListingChange) => void; changes: ListingChanges }) {
  const tokenId = useSearchParams().get("sell");
  const hasMounted = useHasMounted(); // the wallet is only known once mounted (#220)
  if (closed || !hasMounted || !tokenId || !/^\d+$/.test(tokenId)) return null;
  return <SellDialog open tokenId={tokenId} onClose={onClose} onChanged={onChanged} changes={changes} />;
}

interface PendingChange {
  price: string | null; // USDC; null once it's no longer listed
  show: "now" | "afterPopup" | "no"; // on the page: now, once the popup it was made in closes, or not
}

function mapChanges(changes: Record<string, PendingChange>, map: (change: PendingChange, tokenId: string) => PendingChange | null) {
  return Object.fromEntries(
    Object.entries(changes).flatMap(([tokenId, change]) => {
      const next = map(change, tokenId);
      return next ? [[tokenId, next]] : [];
    }),
  );
}

// token ID -> price, for the changes shown on the page now, or all of them
function pricesOf(changes: Record<string, PendingChange>, show?: PendingChange["show"]): ListingChanges {
  return Object.fromEntries(Object.entries(changes).flatMap(([tokenId, change]) => (show === undefined || change.show === show ? [[tokenId, change.price]] : [])));
}

// A card that prints in when it appears with `print`, in turn with the others (printDelay)
function PrintOnArrival({ print, order, children }: { print: boolean; order: number; children: React.ReactNode }) {
  const [printing] = useState(print);
  return (
    <PrintIn play={printing} delay={printDelay(order)} className="w-full">
      {children}
    </PrintIn>
  );
}
