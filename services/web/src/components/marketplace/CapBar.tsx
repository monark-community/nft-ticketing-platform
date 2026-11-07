import { capShare, formatUsdc } from "@/lib/marketplace";
import { formatTokenAmount } from "@/lib/token-amount";
import { cn } from "@/lib/utils";

interface CapBarProps {
  price: bigint;
  faceValue: bigint;
  maxPrice: bigint | null; // null when no cap applies (a collectible, or an event without a cap)
  decimals: number;
  collectible?: boolean;
  beforeEvent?: boolean; // "Max 30.00 before the event", in the Sell popup
  className?: string;
}

// "Face value 15.00 · Max 30.00" with the orange bar of how much of the cap the price uses
// (Figma: Marketplace / Sell open, Buy open). Collectibles have no cap, so no bar.
export function CapBar({ price, faceValue, maxPrice, decimals, collectible = false, beforeEvent = false, className }: CapBarProps) {
  const share = capShare(price, maxPrice);
  const usdc = (value: bigint) => formatTokenAmount(value, decimals);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-3 type-mono-address">
        <span className="text-secondary-foreground">
          Face value {usdc(faceValue)}
          {maxPrice !== null ? ` · Max ${usdc(maxPrice)}${beforeEvent ? " before the event" : ""}` : collectible ? " · Collectible, no price cap" : " · No price cap"}
        </span>
        {share !== null && (
          <span className={cn("shrink-0", share > 100 ? "text-destructive" : "text-primary")} aria-label={`${share}% of the ${formatUsdc(maxPrice!, decimals)} cap`}>
            {share}% of cap
          </span>
        )}
      </div>
      {share !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className={cn("h-full rounded-full", share > 100 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, share)}%` }} />
        </div>
      )}
    </div>
  );
}
