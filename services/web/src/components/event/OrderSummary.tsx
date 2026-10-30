import { Layers, Ticket } from "lucide-react";

import type { EventTier } from "@/lib/event-details";
import { shortAddress } from "@/lib/format";
import type { PurchaseBlock } from "@/lib/purchase-checks";
import { formatEth, formatTokenAmount } from "@/lib/token-amount";
import { cn } from "@/lib/utils";

interface OrderSummaryProps {
  tier: EventTier | null;
  quantity: number;
  total: bigint;
  usdcDecimals: number;
  presaleActive: boolean;
  perWalletLimit: number; // 0 = no limit
  held: number | null; // null when no wallet is connected
  networkFee: bigint | null; // estimate in wei, null when unknown
  block: PurchaseBlock | null;
  walletAddress?: string;
  children?: React.ReactNode; // the steps, alerts and buy button, then the resale rules
}

// Order summary card from Figma (#148): the order's terms before buying. The rows come from the
// contract, so what the user sees is what buyTickets() will charge.
export function OrderSummary({
  tier,
  quantity,
  total,
  usdcDecimals,
  presaleActive,
  perWalletLimit,
  held,
  networkFee,
  block,
  walletAddress,
  children,
}: OrderSummaryProps) {
  const soldOut = !tier || tier.remaining <= 0;
  const usdc = (value: bigint) => `${formatTokenAmount(value, usdcDecimals)} USDC`;

  // Tickets this wallet will hold after the order, e.g. "2 of 4". Over the limit, it shows what it
  // already holds, in red, next to the "Wallet limit reached" alert.
  const overLimit = block?.reason === "walletLimit";
  const walletLimit =
    perWalletLimit === 0
      ? "No limit"
      : held === null
        ? `${perWalletLimit} per wallet`
        : `${held + (soldOut || overLimit ? 0 : quantity)} of ${perWalletLimit}`;

  return (
    <section
      id="order-summary"
      aria-labelledby="order-summary-title"
      className="flex scroll-mt-24 flex-col rounded-lg border border-border bg-card px-5 pt-5 pb-4 shadow-[0_20px_25px_-5px_rgb(0_0_0/10%)]"
    >
      <h2 id="order-summary-title" className="flex items-center gap-2 border-b border-border pb-4 font-serif text-sm font-semibold text-foreground">
        <Ticket className="size-4 text-primary" aria-hidden="true" />
        Order Summary
      </h2>

      <dl className="flex flex-col gap-[10px] py-4">
        {presaleActive && <Row label="Sale phase" value="Presale" valueClassName="text-primary" />}
        <Row label="Selected Tier" value={tier?.name ?? "—"} valueClassName="font-sans font-medium" />
        <Row label="Unit Price" value={tier ? usdc(tier.price) : "—"} />
        <Row label="Quantity" value={soldOut ? "—" : String(quantity)} />
        <Row label="Wallet Limit" value={walletLimit} valueClassName={overLimit ? "text-destructive" : undefined} />
        <Row label="Network fee (est.)" value={networkFee !== null && !soldOut ? `~${formatEth(networkFee)} ETH` : "—"} valueClassName="text-primary" />
        {block?.reason === "notEnoughUsdc" && <Row label="Your USDC balance" value={usdc(block.balance)} valueClassName="text-destructive" />}
        {block?.reason === "notEnoughEth" && <Row label="Your ETH balance" value={`${formatEth(block.balance)} ETH`} />}
      </dl>

      <div className="flex items-start justify-between border-t border-border pt-4 pb-4">
        <span className="pt-2 text-xs font-semibold text-foreground">Total Cost</span>
        <span className="flex flex-col items-end">
          <span className="font-mono text-3xl leading-[37.5px] font-bold text-primary">{soldOut ? "—" : formatTokenAmount(total, usdcDecimals)}</span>
          <span className="font-mono text-[10px] leading-[15px] tracking-[0.05em] text-muted-foreground uppercase">USDC</span>
        </span>
      </div>

      <div className="flex gap-[10px] rounded-md border border-border bg-popover p-[13px]">
        <Layers className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-[11px] leading-[14px]">
          <span className="block font-semibold text-foreground">Minted Directly to Connected Wallet</span>
          <span className="text-secondary-foreground">
            Your ticket is minted as an NFT and sent to{" "}
            {walletAddress ? (
              <>
                your wallet (<span className="font-mono text-primary-soft">{shortAddress(walletAddress)}</span>).
              </>
            ) : (
              "the wallet you connect."
            )}
          </span>
        </p>
      </div>

      {children}
    </section>
  );
}

function Row({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-right font-mono text-xs font-medium text-foreground", valueClassName)}>{value}</dd>
    </div>
  );
}
