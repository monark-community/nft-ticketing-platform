"use client";

import { Calendar, CircleUser, MapPin, Pencil } from "lucide-react";

import { EventImage } from "@/components/event/EventImage";
import { Button } from "@/components/ui/button";
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

// One resale listing, from the Figma "Marketplace / Default" card: type and ticket number over the
// event image, the event, the resale price against face value and the cap, the seller and Buy.
export function ListingCard({ listing, mine, onBuy, onEdit }: ListingCardProps) {
  const price = toUnits(listing.price, DECIMALS);
  const faceValue = toUnits(listing.ticket_type.face_value, DECIMALS);
  const maxPrice = listing.max_price === null ? null : toUnits(listing.max_price, DECIMALS);
  const share = capShare(price, maxPrice);
  const usdc = (value: bigint) => formatTokenAmount(value, DECIMALS);
  const { event } = listing;

  return (
    <article className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors duration-200 hover:border-border-accent">
      <div className="relative aspect-[16/8] overflow-hidden bg-muted">
        <EventImage src={event.image_url} className={cn(listing.used && "grayscale-[40%]")} />
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
          <div className="flex items-center justify-between gap-3 font-mono text-[10px] leading-4 text-muted-foreground">
            <span>Face value {usdc(faceValue)}</span>
            {listing.collectible ? (
              <span className="rounded-xs border border-primary/60 px-1.5 text-primary">Collectible · no price cap</span>
            ) : maxPrice !== null ? (
              <span>Max cap: {usdc(maxPrice)}</span>
            ) : (
              <span>No price cap</span>
            )}
          </div>
          {share !== null && (
            <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, share)}%` }} />
            </div>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3">
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

// Placeholder card while listings load
export function ListingCardSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="aspect-[16/8] animate-pulse bg-muted motion-reduce:animate-none" />
      <div className="flex flex-col gap-3 p-4">
        <div className="h-6 w-3/4 animate-pulse rounded-xs bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-1/2 animate-pulse rounded-xs bg-muted motion-reduce:animate-none" />
        <div className="h-16 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
        <div className="flex justify-between">
          <div className="h-4 w-24 animate-pulse rounded-xs bg-muted motion-reduce:animate-none" />
          <div className="h-9 w-16 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}
