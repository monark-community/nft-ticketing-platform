"use client";

import { Pencil, X } from "lucide-react";
import { AnimatePresence, useIsPresent, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useChainId } from "wagmi";

import { RollingNumber } from "@/components/motion/RollingNumber";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useTransaction } from "@/hooks/useTransaction";
import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import { formatEventDate } from "@/lib/events";
import { formatUsdc, toUnits, type Listing } from "@/lib/marketplace";
import { cn } from "@/lib/utils";
import { getCancelErrorMessage } from "@/lib/resale-errors";

// "Your listings" (not in the Figma, asked for in #295): the connected wallet's own listings, with
// a way to change the price (the Sell popup) or cancel (cancelListing()).
// Motion (#368): a changed price rolls to the new one, and a cancelled listing, once it has left
// the Marketplace, tears off to the left along a jagged edge (200 ms), then the list closes the gap (300 ms).
export function YourListings({ listings, onEdit, onCancelled }: { listings: Listing[]; onEdit: (tokenId: string) => void; onCancelled: (tokenId: string) => void }) {
  const reduced = Boolean(useReducedMotion());
  return (
    <section aria-labelledby="your-listings-title" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 id="your-listings-title" className="type-heading-sm text-foreground">
          Your listings
        </h2>
        <span className="rounded-xs bg-muted px-2 py-0.5 type-mono-address text-secondary-foreground">{listings.length}</span>
      </div>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        <AnimatePresence initial={false}>
          {listings.map((listing) => (
            <ListingRow key={listing.token_id} listing={listing} onEdit={() => onEdit(listing.token_id)} onCancelled={() => onCancelled(listing.token_id)} reduced={reduced} />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

// Torn off to the left, then the space it leaves closes
const TEAR_OFF = {
  x: -32,
  rotate: -1.2,
  opacity: 0,
  height: 0,
  paddingTop: 0,
  paddingBottom: 0,
  transition: {
    default: { duration: 0.2, ease: "easeIn" },
    height: { delay: 0.2, duration: 0.3 },
    paddingTop: { delay: 0.2, duration: 0.3 },
    paddingBottom: { delay: 0.2, duration: 0.3 },
  },
} as const;

function ListingRow({ listing, onEdit, onCancelled, reduced }: { listing: Listing; onEdit: () => void; onCancelled: () => void; reduced: boolean }) {
  const tx = useTransaction({ getErrorMessage: getCancelErrorMessage });
  const onContractChain = useChainId() === TICKET_NFT_CHAIN_ID;
  const tearing = !useIsPresent(); // leaving the list: torn along a jagged right edge

  async function cancel() {
    const ok = await tx.run([
      {
        label: "Cancel listing",
        request: { address: TICKET_NFT_ADDRESS, abi: ticketNftAbi, functionName: "cancelListing", args: [BigInt(listing.token_id)] },
      },
    ]);
    if (ok === "success") onCancelled();
  }

  const cancelled = tx.state.phase === "success";
  const busyText = tx.state.phase === "awaitingWallet" ? "Confirm in your wallet…" : "Cancelling…";

  return (
    <m.li
      exit={reduced ? undefined : TEAR_OFF}
      className={cn("flex flex-col gap-3 overflow-hidden px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5", tearing && !reduced && "torn-edge")}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="type-body-md-strong text-foreground">
          {listing.event.title} · {listing.ticket_type.name} · <span className="font-mono">Ticket #{listing.token_id}</span>
        </p>
        <p className="type-body-sm text-secondary-foreground">
          {formatEventDate(listing.event.start_date)} · Listed for{" "}
          <RollingNumber value={formatUsdc(toUnits(listing.price, 6), 6)} className="font-mono text-primary" />
        </p>
        {tx.state.phase === "error" && tx.state.error && <Alert tone="error" title={tx.state.error} className="mt-2" />}
      </div>
      {cancelled ? (
        <p className="type-body-sm text-success" role="status">
          Cancelled. It leaves the Marketplace in a few seconds.
        </p>
      ) : (
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={onEdit} disabled={tx.isBusy}>
            <Pencil aria-hidden="true" />
            Edit price
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={cancel}
            loading={tx.isBusy}
            disabled={!onContractChain}
            title={onContractChain ? undefined : "Switch your wallet to the contract's network first"}
          >
            {!tx.isBusy && <X aria-hidden="true" />}
            {tx.isBusy ? busyText : "Cancel"}
          </Button>
        </div>
      )}
    </m.li>
  );
}
