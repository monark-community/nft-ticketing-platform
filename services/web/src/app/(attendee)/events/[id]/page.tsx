"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useChains, useSwitchChain } from "wagmi";

import { EventHero } from "@/components/event/EventHero";
import { MobileBuyBar } from "@/components/event/MobileBuyBar";
import { OrderSummary } from "@/components/event/OrderSummary";
import { PurchasePanel } from "@/components/event/PurchasePanel";
import { ResaleRules } from "@/components/event/ResaleRules";
import { TierCard } from "@/components/event/TierCard";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useEvent } from "@/hooks/useEvent";
import { useEventOnChain } from "@/hooks/useEventOnChain";
import { useHasMounted } from "@/hooks/useHasMounted";
import { usePurchaseTickets } from "@/hooks/usePurchaseTickets";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID } from "@/lib/contracts/ticket-nft";
import { buildTiers } from "@/lib/event-details";
import { ROUTES } from "@/lib/nav";
import { estimatePurchaseGas, getBlockMessage, getMaxQuantity, getPurchaseBlock } from "@/lib/purchase-checks";
import { formatTokenAmount } from "@/lib/token-amount";

// Event page (#284) with the ticket purchase flow (#147, #148, #149).
// Figma: "Event detail / Default", "About open", "Resale rules open" and the purchase status frames.
// Event details come from the API; prices, supply and sale rules from the contract.
export default function EventPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const { event, loading, notFound, error, reload } = useEvent(id);

  const hasMounted = useHasMounted();
  const { address, isConnected: walletConnected, chainId } = useAccount();
  // The server can't know the wallet, so treat the first render as disconnected (#220)
  const isConnected = hasMounted && walletConnected;
  const wallet = isConnected ? address : undefined;
  // Buying needs a signed-in account with a name and email (Monark: email required for all users)
  const { user, signIn, isLoading: signingIn } = useWalletAuth();

  const contractEventId = event?.contract_event_id ? BigInt(event.contract_event_id) : null;
  const chain = useEventOnChain(contractEventId, wallet);
  const decimals = chain.usdcDecimals;

  const tiers = useMemo(() => (event ? buildTiers(event.ticket_types, chain.tiers, decimals) : []), [event, chain.tiers, decimals]);

  // The selected type defaults to the first one with tickets left
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const selected = tiers.find((t) => t.key === selectedKey) ?? tiers.find((t) => t.remaining > 0) ?? tiers[0] ?? null;

  const perWalletLimit = chain.event?.perWalletLimit ?? 0;
  const held = chain.wallet?.held ?? null;
  const maxQuantity = getMaxQuantity({ remaining: selected?.remaining ?? 0, perWalletLimit, held: held ?? 0 });
  const qty = Math.min(quantity, maxQuantity);

  const purchase = usePurchaseTickets({
    contractEventId,
    typeId: selected?.typeId ?? 0,
    quantity: qty,
    unitPrice: selected?.price ?? BigInt(0),
    usdcAddress: chain.usdcAddress,
    allowance: chain.wallet?.allowance ?? BigInt(0),
    onSettled: chain.refetch,
  });

  // Current time for the "sales ended" check, refreshed every 30 seconds
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(timer);
  }, []);

  const chains = useChains();
  const contractChain = chains.find((c) => c.id === TICKET_NFT_CHAIN_ID);
  const explorer = contractChain?.blockExplorers?.default.url;
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();

  const networkFee = chain.gasPrice !== undefined ? estimatePurchaseGas(qty, purchase.approvalNeeded) * chain.gasPrice : null;

  // Everything needed to decide whether the purchase can go ahead has loaded
  const ready =
    Boolean(event) &&
    (contractEventId === null || (!chain.loading && chain.event !== null)) &&
    (!isConnected || contractEventId === null || (!chain.walletLoading && !chain.walletError));

  const block =
    ready && selected
      ? getPurchaseBlock({
          configured: contractEventId !== null && Boolean(chain.event?.configured),
          saleActive: chain.event?.saleActive ?? false,
          endTime: chain.event?.endTime ?? 0,
          now,
          tierName: selected.name,
          remaining: selected.remaining,
          quantity: qty,
          isConnected,
          onContractChain: chainId === TICKET_NFT_CHAIN_ID,
          signedIn: Boolean(user),
          profileComplete: Boolean(user?.profile_complete),
          presaleActive: chain.event?.presaleActive ?? false,
          whitelisted: chain.wallet?.whitelisted ?? false,
          perWalletLimit,
          held: held ?? 0,
          total: purchase.total,
          usdcBalance: chain.wallet?.usdcBalance ?? BigInt(0),
          ethBalance: chain.wallet?.ethBalance ?? BigInt(0),
          ethNeeded: networkFee ?? BigInt(0),
        })
      : null;
  const blockMessage = block ? getBlockMessage(block, { usdcDecimals: decimals, chainName: contractChain?.name ?? "the right network" }) : null;

  const soldOut = !selected || selected.remaining <= 0;
  const totalLabel = `${formatTokenAmount(purchase.total, decimals)} USDC`;

  const availability =
    contractEventId !== null && !chain.tiers
      ? null
      : {
          remaining: tiers.reduce((sum, t) => sum + t.remaining, 0),
          supply: tiers.reduce((sum, t) => sum + t.supply, 0),
        };

  // A new selection starts a new order, so clear a finished or failed one
  function startNewOrder() {
    if (purchase.state.phase !== "idle") purchase.reset();
  }

  return (
    // Bottom padding on phones keeps the fixed buy bar from covering the footer
    <div className="flex min-h-screen flex-col bg-background pb-[76px] lg:pb-0">
      <Navbar />

      <main className="page-glow flex-1 pb-12">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 py-5 md:px-8">
          <Link
            href={ROUTES.events}
            className="flex w-fit items-center gap-1 rounded-xs text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="size-3" aria-hidden="true" />
            Back to events
          </Link>

          {loading ? (
            <EventPageSkeleton />
          ) : notFound || !event ? (
            notFound ? (
              <Card className="items-center py-16 text-center">
                <h1 className="type-heading-md text-foreground">Event not found</h1>
                <p className="type-body-md text-muted-foreground">This event doesn&apos;t exist, or it was removed.</p>
                <Link href={ROUTES.events} className={buttonVariants({ variant: "secondary" })}>
                  Browse events
                </Link>
              </Card>
            ) : (
              <Alert
                tone="error"
                title={error ?? "Could not load this event."}
                action={
                  <Button size="sm" onClick={reload}>
                    Try again
                  </Button>
                }
              />
            )
          ) : (
            <>
              <EventHero event={event} availability={availability} />

              <div className="grid grid-cols-1 gap-8 pt-4 lg:grid-cols-12">
                <section aria-labelledby="tiers-title" className="flex flex-col gap-6 lg:col-span-7">
                  <div className="flex flex-col gap-2">
                    <h2 id="tiers-title" className="type-heading-md tracking-[0.025em] text-foreground">
                      Select Ticket Tier
                    </h2>
                    <p className="text-xs text-muted-foreground">Choose your tickets</p>
                  </div>

                  {chain.error && (
                    <Alert tone="error" title={chain.error} action={<Button size="sm" onClick={() => chain.refetch()}>Try again</Button>} />
                  )}

                  {tiers.length === 0 ? (
                    <Card className="dot-grid items-center py-10 text-center">
                      <p className="type-body-md text-muted-foreground">The organizer hasn&apos;t added ticket types yet.</p>
                    </Card>
                  ) : (
                    tiers.map((tier) => (
                      <TierCard
                        key={tier.key}
                        tier={tier}
                        usdcDecimals={decimals}
                        selected={tier.key === selected?.key}
                        onSelect={() => {
                          setSelectedKey(tier.key);
                          setQuantity(1);
                          startNewOrder();
                        }}
                        quantity={qty}
                        maxQuantity={maxQuantity}
                        onQuantityChange={(value) => {
                          setQuantity(value);
                          startNewOrder();
                        }}
                        disabled={purchase.isBusy}
                      />
                    ))
                  )}
                </section>

                <aside className="self-start lg:sticky lg:top-24 lg:col-span-5">
                  <OrderSummary
                    tier={selected}
                    quantity={qty}
                    total={purchase.total}
                    usdcDecimals={decimals}
                    presaleActive={chain.event?.presaleActive ?? false}
                    perWalletLimit={perWalletLimit}
                    held={held}
                    networkFee={networkFee}
                    block={block}
                    walletAddress={wallet}
                  >
                    <PurchasePanel
                      steps={purchase.steps}
                      state={purchase.state}
                      explorerUrl={purchase.explorerUrl}
                      block={block}
                      blockMessage={blockMessage}
                      ready={ready}
                      walletError={chain.walletError}
                      onRetryWallet={() => chain.refetch()}
                      isBusy={purchase.isBusy}
                      quantity={qty}
                      totalLabel={totalLabel}
                      purchased={purchase.purchased}
                      onBuy={() => purchase.buy()}
                      onStopWaiting={purchase.stopWaiting}
                      onConnect={() => openConnectModal?.()}
                      onSwitchNetwork={() => switchChain({ chainId: TICKET_NFT_CHAIN_ID })}
                      onSignIn={() => signIn()}
                      signingIn={signingIn}
                      finishAccountHref={`${ROUTES.signUp}?next=${encodeURIComponent(`/events/${id}`)}`}
                    />
                    {chain.event && (
                      <ResaleRules
                        resaleCapBps={chain.event.resaleCapBps}
                        royaltyBps={chain.event.royaltyBps}
                        contractUrl={explorer ? `${explorer}/address/${TICKET_NFT_ADDRESS}` : null}
                      />
                    )}
                  </OrderSummary>
                </aside>
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />

      {event && selected && (
        <MobileBuyBar
          tierName={selected.name}
          totalLabel={soldOut ? "—" : totalLabel}
          onReview={() => document.getElementById("order-summary")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
      )}
    </div>
  );
}

// Placeholder shapes while the event loads, so the layout doesn't jump
function EventPageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading event">
      <div className="h-[340px] animate-pulse rounded-lg bg-card md:h-[450px]" />
      <div className="grid grid-cols-1 gap-8 pt-4 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <div className="h-8 w-56 animate-pulse rounded-sm bg-card" />
          <div className="h-40 animate-pulse rounded-lg bg-card" />
          <div className="h-40 animate-pulse rounded-lg bg-card" />
        </div>
        <div className="h-[520px] animate-pulse rounded-lg bg-card lg:col-span-5" />
      </div>
    </div>
  );
}
