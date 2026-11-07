"use client";

import { Pencil, X } from "lucide-react";
import { useChainId } from "wagmi";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useTransaction } from "@/hooks/useTransaction";
import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import { formatEventDate } from "@/lib/events";
import { formatUsdc, toUnits, type Listing } from "@/lib/marketplace";
import { getCancelErrorMessage } from "@/lib/resale-errors";

// "Your listings" (not in the Figma, asked for in #295): the connected wallet's own listings, with
// a way to change the price (the Sell popup) or cancel (cancelListing()).
export function YourListings({ listings, onEdit, onChanged }: { listings: Listing[]; onEdit: (tokenId: string) => void; onChanged: () => void }) {
  return (
    <section aria-labelledby="your-listings-title" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 id="your-listings-title" className="type-heading-sm text-foreground">
          Your listings
        </h2>
        <span className="rounded-xs bg-muted px-2 py-0.5 type-mono-address text-secondary-foreground">{listings.length}</span>
      </div>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {listings.map((listing) => (
          <ListingRow key={listing.token_id} listing={listing} onEdit={() => onEdit(listing.token_id)} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  );
}

function ListingRow({ listing, onEdit, onChanged }: { listing: Listing; onEdit: () => void; onChanged: () => void }) {
  const tx = useTransaction({ getErrorMessage: getCancelErrorMessage });
  const onContractChain = useChainId() === TICKET_NFT_CHAIN_ID;

  async function cancel() {
    const ok = await tx.run([
      {
        label: "Cancel listing",
        request: { address: TICKET_NFT_ADDRESS, abi: ticketNftAbi, functionName: "cancelListing", args: [BigInt(listing.token_id)] },
      },
    ]);
    if (ok) onChanged();
  }

  const cancelled = tx.state.phase === "success";
  const busyText = tx.state.phase === "awaitingWallet" ? "Confirm in your wallet…" : "Cancelling…";

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="type-body-md-strong text-foreground">
          {listing.event.title} · {listing.ticket_type.name} · <span className="font-mono">Ticket #{listing.token_id}</span>
        </p>
        <p className="type-body-sm text-secondary-foreground">
          {formatEventDate(listing.event.start_date)} · Listed for <span className="font-mono text-primary">{formatUsdc(toUnits(listing.price, 6), 6)}</span>
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
    </li>
  );
}
