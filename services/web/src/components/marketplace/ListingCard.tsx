"use client";

import { Calendar, CircleUser, MapPin, Pencil } from "lucide-react";

import { EventImage } from "@/components/event/EventImage";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEventDate } from "@/lib/events";
import { shortAddress } from "@/lib/format";
import { capShare, toUnits, type Listing } from "@/lib/marketplace";
import { formatTokenAmount } from "@/lib/token-amount";
import { cn } from "@/lib/utils";

const DECIMALS = 6; // USDC

interface ListingCardProps {
  listing: Listing;
  mine: boolean; // listed by the connected wallet
  onBuy: () => void;
  onEdit: () => void;
}

// A notch bitten into the card's edge at the tear line (as on the event cards, #366)
const NOTCH =
  "pointer-events-none absolute top-0 -mt-[9px] size-[18px] scale-0 rounded-full border border-border-accent bg-background transition-transform duration-[170ms] ease-[var(--ease-snap)] group-hover:scale-100 group-focus-within:scale-100";

// One resale listing, from the Figma "Marketplace / Default" card: type and ticket number over the
// event image, the event, the resale price against face value and the cap, the seller and Buy.
// On hover (or with a button focused) it becomes a ticket stub and its measure lights up (#368):
// notches and a dashed tear line above the seller, the face-value tick on the bar with the markup
// bright, and the line under the price rolls to "+7.00 over face value" and "73.3% of cap".
export function ListingCard({ listing, mine, onBuy, onEdit }: ListingCardProps) {
  const price = toUnits(listing.price, DECIMALS);
  const faceValue = toUnits(listing.ticket_type.face_value, DECIMALS);
  const maxPrice = listing.max_price === null ? null : toUnits(listing.max_price, DECIMALS);
  const share = capShare(price, maxPrice);
  const faceShare = capShare(faceValue, maxPrice);
  const usdc = (value: bigint) => formatTokenAmount(value, DECIMALS);
  const { event } = listing;
  const markup = price - faceValue;
  const markupText = `${markup < BigInt(0) ? "-" : "+"}${usdc(markup < BigInt(0) ? -markup : markup)} ${markup < BigInt(0) ? "under" : "over"} face value`;

  return (
    // Not overflow-hidden: the notches reach over the card's edge (the picture clips itself)
    <article className="group flex h-full w-full flex-col rounded-lg border border-border bg-card transition-colors duration-200 hover:border-border-accent">
      <div className="relative aspect-[16/8] overflow-hidden rounded-t-[calc(var(--radius-lg)-1px)] bg-muted">
        <EventImage
          src={event.image_url}
          className={cn("transition-transform duration-[400ms] ease-[var(--ease-arrive)] group-hover:scale-[1.03] motion-reduce:transition-none", listing.used && "grayscale-[40%]")}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-card to-transparent" />
        <span className="absolute top-3 left-3 max-w-[55%] truncate rounded-xs bg-background/70 px-2 py-1 type-mono-tag text-primary backdrop-blur-sm" title={listing.ticket_type.name}>
          {listing.ticket_type.name}
        </span>
        <span className="absolute top-3 right-3 flex items-center gap-1.5 rounded-xs bg-background/70 px-2 py-1 type-mono-address text-foreground backdrop-blur-sm">
          <span className="size-1.5 rounded-full bg-sky-400" aria-hidden="true" />
          Ticket #{listing.token_id}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="type-heading-sm text-foreground">{event.title}</h2>
          <p className="flex items-center gap-2 type-body-sm text-secondary-foreground">
            <Calendar className="size-3.5 text-primary" aria-hidden="true" />
            <time dateTime={event.start_date}>{formatEventDate(event.start_date)}</time>
          </p>
          {event.location && (
            <p className="flex items-center gap-2 type-mono-address text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{event.location}</span>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-md bg-background/60 px-3 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="type-label-sm text-secondary-foreground">Resale price</span>
            <span className="font-mono text-lg leading-6 font-bold text-primary">{usdc(price)} USDC</span>
          </div>
          {/* The line rolls over to the markup on hover, each half in its own place */}
          <div className="relative h-4 overflow-hidden font-mono text-[10px] leading-4 text-muted-foreground">
            <div className="flex items-center justify-between gap-3 transition-[translate,opacity] duration-[160ms] ease-[var(--ease-arrive)] group-hover:-translate-y-full group-hover:opacity-0">
              <span>Face value {usdc(faceValue)}</span>
              {listing.collectible ? (
                <span className="rounded-xs border border-primary/60 px-1.5 text-primary">Collectible · no price cap</span>
              ) : maxPrice !== null ? (
                <span>Max cap: {usdc(maxPrice)}</span>
              ) : (
                <span>No price cap</span>
              )}
            </div>
            <div
              className="absolute inset-x-0 top-0 flex translate-y-full items-center justify-between gap-3 text-primary-soft opacity-0 transition-[translate,opacity] duration-[160ms] ease-[var(--ease-arrive)] group-hover:translate-y-0 group-hover:opacity-100"
              aria-hidden="true"
            >
              <span className="truncate">{markupText}</span>
              {share !== null && <span className="shrink-0">{share}% of cap</span>}
            </div>
          </div>
          {share !== null && (
            // On hover the part up to face value dims and a tick marks it, so the bright part is the markup
            <div className="relative h-1 rounded-full bg-muted" aria-hidden="true">
              <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.min(100, share)}%` }} />
              {faceShare !== null && (
                <>
                  <div
                    className="absolute inset-y-0 left-0 rounded-l-full bg-background/60 opacity-0 transition-opacity duration-[160ms] group-hover:opacity-100"
                    style={{ right: `${100 - Math.min(100, faceShare)}%` }}
                  />
                  <div
                    className="absolute -inset-y-1 -ml-px w-0.5 scale-y-0 rounded-[1px] bg-foreground transition-transform duration-[160ms] ease-[var(--ease-snap)] group-hover:scale-y-100"
                    style={{ left: `${Math.min(100, faceShare)}%` }}
                  />
                </>
              )}
            </div>
          )}
        </div>

        {/* The tear line above the seller, with a notch on each side, on hover */}
        <div className="relative mt-auto flex items-center justify-between gap-3 border-t border-dashed border-transparent pt-3 transition-colors duration-[160ms] group-hover:border-primary group-focus-within:border-primary">
          <span className={cn(NOTCH, "-left-[26px] [clip-path:inset(-2px_-2px_-2px_50%)]")} aria-hidden="true" />
          <span className={cn(NOTCH, "-right-[26px] [clip-path:inset(-2px_50%_-2px_-2px)]")} aria-hidden="true" />
          <span className="flex min-w-0 items-center gap-1.5 type-mono-address text-secondary-foreground">
            <CircleUser className="size-3.5 shrink-0" aria-hidden="true" />
            {mine ? "You" : shortAddress(listing.seller_wallet)}
          </span>
          {mine ? (
            <Button variant="outline" size="sm" onClick={onEdit} aria-label={`Change the price of your ticket #${listing.token_id}`}>
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          ) : (
            <Button size="sm" className="normal-case tracking-normal" onClick={onBuy} aria-label={`Buy ticket #${listing.token_id} to ${event.title} for ${usdc(price)} USDC`}>
              Buy
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

// Placeholder card while listings load: the orange band sweeps down it (#365)
export function ListingCardSkeleton() {
  return (
    <div aria-hidden="true" className="skeleton-sweep flex flex-col rounded-lg border border-border bg-card">
      <Skeleton className="aspect-[16/8] rounded-none" />
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-16 rounded-md" />
        <div className="flex justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-16 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
