"use client";

import { Users } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import type { EventTier } from "@/lib/event-details";
import { getStockStatus } from "@/lib/ticket-stock";
import { formatTokenAmount } from "@/lib/token-amount";
import { cn } from "@/lib/utils";

interface TierCardProps {
  tier: EventTier;
  usdcDecimals: number;
  selected: boolean;
  onSelect: () => void;
  quantity: number;
  maxQuantity: number;
  onQuantityChange: (quantity: number) => void;
  disabled?: boolean; // while a purchase is running
  // The person picked this type (not the page's default choice): play the choosing motion
  chosen?: boolean;
}

// Tier Card from the Figma Design System page (#290): Default, Selected (orange 2px border,
// orange price, quantity stepper) and Sold Out (dimmed). The side notches on the selected card
// come from the event page frame. A sold-out card can still be selected, so the order summary
// can point to the Marketplace (Figma: "Sold out selected").
// Choosing one (#367), as in the Motion Guide: the border turns orange (140 ms), the notches are
// punched into its sides (180 ms), "Selected" is stamped on and the quantity row unfolds (200 ms)
// while the one of the card left behind folds away, and its notches shrink back. The quantity rolls.
export function TierCard({ tier, usdcDecimals, selected, onSelect, quantity, maxQuantity, onQuantityChange, disabled = false, chosen = false }: TierCardProps) {
  const stock = getStockStatus(tier.remaining, tier.supply);
  const soldOut = stock === "soldOut";
  const open = selected && !soldOut;
  // The quantity this card showed last, kept while its row folds away after another type is chosen
  const [shownQuantity, setShownQuantity] = useState(quantity);
  if (selected && quantity !== shownQuantity) setShownQuantity(quantity);

  return (
    <div
      className={cn(
        // The second pixel of the selected border is an inset ring, so the border can fade in and out
        "relative flex flex-col rounded-lg border bg-card p-6 transition-[border-color,box-shadow] duration-[140ms]",
        selected
          ? "border-primary shadow-[inset_0_0_0_1px_var(--primary),0_10px_15px_-3px_var(--primary-tint)]"
          : "border-border shadow-[inset_0_0_0_0_transparent,0_0_0_0_transparent] hover:border-border-accent",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={selected}
        className={cn(
          "flex w-full items-start justify-between gap-4 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          // Not selected: the whole card is the click target
          !selected && "after:absolute after:inset-0 after:rounded-lg",
          soldOut && "opacity-55",
        )}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="type-title-lg text-foreground">{tier.name}</span>
            {soldOut ? (
              <Badge tone="danger">Sold out</Badge>
            ) : selected ? (
              // Stamped on when the person picks it; the page's default choice is simply there
              <Badge tone="selected" className={chosen ? "animate-[stamp-on_200ms_var(--ease-snap)_backwards]" : undefined}>
                Selected
              </Badge>
            ) : stock === "low" ? (
              <Badge tone="warning" dot>
                Low stock · {tier.remaining} left
              </Badge>
            ) : null}
          </span>
          {tier.description && <span className="type-body-sm text-muted-foreground">{tier.description}</span>}
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="flex items-baseline gap-2">
            <span className={cn("type-price transition-colors duration-[140ms]", selected && !soldOut ? "text-primary" : "text-foreground")}>
              {formatTokenAmount(tier.price, usdcDecimals)}
            </span>
            <span className="type-body-sm text-muted-foreground">USDC</span>
          </span>
          <span className="type-label-sm text-muted-foreground">{soldOut ? "None left" : `${tier.remaining.toLocaleString("en-US")} left`}</span>
        </span>
      </button>

      {!soldOut && (
        // Unfolds to its height when chosen and folds when another type is (200 ms, both at once).
        // Folded, it's out of reach. The clip reaches 4 px past each side so focus rings aren't cut.
        <div
          className={cn("grid transition-[grid-template-rows] duration-200 ease-[var(--ease-arrive)]", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
          inert={!open}
          aria-hidden={!open || undefined}
        >
          <div className="flex min-h-0 flex-col gap-4 [clip-path:inset(-4px)]">
            <div className="mt-4 h-px bg-border" aria-hidden="true" />
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 type-body-md-strong text-foreground">
                <Users className="size-4 text-primary" aria-hidden="true" />
                Quantity
              </span>
              <QuantityStepper
                value={shownQuantity}
                max={maxQuantity}
                onChange={onQuantityChange}
                disabled={disabled}
                label={`${tier.name} tickets`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Ticket-stub notches on both sides: punched in when the card is selected, gone when it isn't */}
      <span
        className={cn(
          "pointer-events-none absolute top-1/2 -left-[10px] size-[18px] -translate-y-1/2 rounded-full border-r-2 border-primary bg-background transition-transform duration-[180ms] ease-[var(--ease-snap)]",
          selected ? "scale-100" : "scale-0",
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          "pointer-events-none absolute top-1/2 -right-[10px] size-[18px] -translate-y-1/2 rounded-full border-l-2 border-primary bg-background transition-transform duration-[180ms] ease-[var(--ease-snap)]",
          selected ? "scale-100" : "scale-0",
        )}
        aria-hidden="true"
      />
    </div>
  );
}
