"use client";

import { Users } from "lucide-react";

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
}

// Tier Card from the Figma Design System page (#290): Default, Selected (orange 2px border,
// orange price, quantity stepper) and Sold Out (dimmed). The side notches on the selected card
// come from the event page frame. A sold-out card can still be selected, so the order summary
// can point to the Marketplace (Figma: "Sold out selected").
export function TierCard({ tier, usdcDecimals, selected, onSelect, quantity, maxQuantity, onQuantityChange, disabled = false }: TierCardProps) {
  const stock = getStockStatus(tier.remaining, tier.supply);
  const soldOut = stock === "soldOut";

  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 rounded-lg bg-card transition-colors",
        selected
          ? "border-2 border-primary p-[23px] shadow-[0_10px_15px_-3px_var(--primary-tint)]"
          : "border border-border p-6 hover:border-border-accent",
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
              <Badge tone="selected">Selected</Badge>
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
            <span className={cn("type-price", selected && !soldOut ? "text-primary" : "text-foreground")}>
              {formatTokenAmount(tier.price, usdcDecimals)}
            </span>
            <span className="type-body-sm text-muted-foreground">USDC</span>
          </span>
          <span className="type-label-sm text-muted-foreground">{soldOut ? "None left" : `${tier.remaining.toLocaleString("en-US")} left`}</span>
        </span>
      </button>

      {selected && !soldOut && (
        <>
          <div className="h-px bg-border" aria-hidden="true" />
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 type-body-md-strong text-foreground">
              <Users className="size-4 text-primary" aria-hidden="true" />
              Quantity
            </span>
            <QuantityStepper
              value={quantity}
              max={maxQuantity}
              onChange={onQuantityChange}
              disabled={disabled}
              label={`${tier.name} tickets`}
            />
          </div>
        </>
      )}

      {selected && (
        // Ticket-stub notches on both sides of the selected card
        <>
          <span className="absolute top-1/2 -left-[10px] size-[18px] -translate-y-1/2 rounded-full border-r-2 border-primary bg-background" aria-hidden="true" />
          <span className="absolute top-1/2 -right-[10px] size-[18px] -translate-y-1/2 rounded-full border-l-2 border-primary bg-background" aria-hidden="true" />
        </>
      )}
    </div>
  );
}
