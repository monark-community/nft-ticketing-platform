"use client";

import { useState, type CSSProperties } from "react";

import { CountUp } from "@/components/motion/CountUp";
import { capShare, formatUsdc } from "@/lib/marketplace";
import { formatTokenAmount } from "@/lib/token-amount";
import { cn } from "@/lib/utils";

interface CapBarProps {
  price: bigint;
  /** The price it was (the seller changed it): the bar slides and the share counts from there */
  from?: bigint;
  faceValue: bigint;
  maxPrice: bigint | null; // null when no cap applies (a collectible, or an event without a cap)
  decimals: number;
  collectible?: boolean;
  beforeEvent?: boolean; // "Max 30.00 before the event", in the Sell popup
  className?: string;
}

// "Face value 15.00 · Max 30.00" with the orange bar of how much of the cap the price uses
// (Figma: Marketplace / Sell open, Buy open). Collectibles have no cap, so no bar.
// Motion (#368): the bar follows the price (140 ms) and its share counts to the new value. The cap
// is a post at the end of the bar: going over it presses the bar against the post, which glows red.
// With `from`, both start at the old price when the bar appears and move to the new one.
export function CapBar({ price, from, faceValue, maxPrice, decimals, collectible = false, beforeEvent = false, className }: CapBarProps) {
  const share = capShare(price, maxPrice);
  const fromShare = from === undefined ? null : capShare(from, maxPrice);
  const usdc = (value: bigint) => formatTokenAmount(value, decimals);
  const over = share !== null && share > 100;
  // Counts each time the price goes over the cap, to replay the press
  const [overState, setOverState] = useState({ over, presses: 0 });
  if (overState.over !== over) setOverState({ over, presses: overState.presses + (over ? 1 : 0) });

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-3 type-mono-address">
        <span className="text-secondary-foreground">
          Face value {usdc(faceValue)}
          {maxPrice !== null ? ` · Max ${usdc(maxPrice)}${beforeEvent ? " before the event" : ""}` : collectible ? " · Collectible, no price cap" : " · No price cap"}
        </span>
        {share !== null && (
          <span className={cn("shrink-0", over ? "text-destructive" : "text-primary")} aria-label={`${share}% of the ${formatUsdc(maxPrice!, decimals)} cap`}>
            <CountUp value={share} from={fromShare ?? undefined} ms={fromShare === null ? 160 : 200} format={formatShare} />
          </span>
        )}
      </div>
      {share !== null && (
        <div className="relative mr-1" aria-hidden="true">
          <div
            key={overState.presses}
            className={cn("h-1.5 origin-left overflow-hidden rounded-full bg-muted", overState.presses > 0 && over && "animate-[cap-press_200ms_ease-out]")}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width,background-color] duration-[140ms] ease-[var(--ease-arrive)]",
                over ? "bg-destructive" : "bg-primary",
                fromShare !== null && fromShare !== share && "animate-[cap-slide_140ms_var(--ease-arrive)_backwards]",
              )}
              style={{ width: `${Math.min(100, share)}%`, "--cap-from": `${Math.min(100, fromShare ?? share)}%` } as CSSProperties}
            />
          </div>
          {/* The cap: a post at the end of the bar */}
          <span
            className={cn(
              "absolute top-1/2 -right-1 h-3.5 w-1 -translate-y-1/2 rounded-[1px] transition-[background-color,box-shadow] duration-[140ms]",
              over ? "bg-destructive shadow-[0_0_10px_2px_color-mix(in_oklab,var(--destructive)_55%,transparent)]" : "bg-border-accent",
            )}
          />
        </div>
      )}
    </div>
  );
}

// "73.3% of cap", rounded like capShare (two decimals at most)
function formatShare(value: number) {
  return `${Math.round(value * 100) / 100}% of cap`;
}
