"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ArrowRight, Calendar, Check, CircleUser, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { erc20Abi } from "viem";
import { useAccount, useChains, usePublicClient, useSwitchChain } from "wagmi";

import { EventImage } from "@/components/event/EventImage";
import { TxHash } from "@/components/event/TxHash";
import { CapBar } from "@/components/marketplace/CapBar";
import { MarketDialog, SummaryRow } from "@/components/marketplace/MarketDialog";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StepRow } from "@/components/ui/step-row";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useResaleOnChain } from "@/hooks/useResaleOnChain";
import { useTransaction } from "@/hooks/useTransaction";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import { formatEventDate } from "@/lib/events";
import { shortAddress } from "@/lib/format";
import {
  estimateResaleGas,
  formatBps,
  formatUsdc,
  getResaleBlockMessage,
  getResaleBuyBlock,
  royaltySplit,
  toUnits,
  walletLimitLabel,
  type Listing,
} from "@/lib/marketplace";
import { ROUTES } from "@/lib/nav";
import { APPROVE_STEP_LABEL, getPurchaseSteps, isApproving } from "@/lib/purchase-steps";
import { getResaleBuyErrorMessage } from "@/lib/resale-errors";
import { formatEth } from "@/lib/token-amount";
import type { TxStep } from "@/lib/transactions/types";
import { cn } from "@/lib/utils";

const BUY_LABEL = "Buy ticket";

// Buy popup (Figma: Marketplace / Buy open): the ticket, its price against the cap, the summary,
// then approve USDC and buyResaleTicket(). The listing is read again from the contract, so the
// buyer pays what the contract will charge, even if the seller just changed the price.
export function BuyDialog({ listing, onClose, onBought }: { listing: Listing | null; onClose: () => void; onBought: () => void }) {
  // A new flow (fresh reads and steps) for each listing opened
  return listing ? <BuyFlow key={listing.token_id} listing={listing} onClose={onClose} onBought={onBought} /> : null;
}

function BuyFlow({ listing, onClose, onBought }: { listing: Listing; onClose: () => void; onBought: () => void }) {
  const hasMounted = useHasMounted();
  const { address, isConnected: walletConnected, chainId } = useAccount();
  const isConnected = hasMounted && walletConnected;
  const wallet = isConnected ? address : undefined;
  const { user, signIn, isLoading: signingIn } = useWalletAuth();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const contractChain = useChains().find((c) => c.id === TICKET_NFT_CHAIN_ID);

  const tokenId = BigInt(listing.token_id);
  const contractEventId = listing.event.contract_event_id ? BigInt(listing.event.contract_event_id) : null;
  const chain = useResaleOnChain(tokenId, contractEventId, wallet);
  const tx = useTransaction({ getErrorMessage: getResaleBuyErrorMessage });
  const publicClient = usePublicClient({ chainId: TICKET_NFT_CHAIN_ID });
  const decimals = chain.usdcDecimals;
  const usdc = (value: bigint) => formatUsdc(value, decimals);

  const terms = chain.terms;
  // What the contract will charge; the API's copy only until the contract answers
  const price = terms?.listing.price ?? toUnits(listing.price, decimals);
  const apiPrice = toUnits(listing.price, decimals);
  const priceChanged = terms !== null && terms.listing.price > BigInt(0) && terms.listing.price !== apiPrice;
  const approvalNeeded = (chain.wallet?.allowance ?? BigInt(0)) < price;
  const networkFee = chain.gasPrice !== undefined ? estimateResaleGas(approvalNeeded) * chain.gasPrice : null;
  const split = royaltySplit(price, terms?.listing.royaltyBps ?? listing.event.royalty_bps ?? 0);
  const royaltyBps = terms?.listing.royaltyBps ?? listing.event.royalty_bps ?? 0;

  const ready = terms !== null && (!isConnected || (!chain.walletLoading && !chain.walletError));
  const block =
    terms && ready
      ? getResaleBuyBlock({
          listing: terms.listing,
          currentRoyaltyBps: terms.royaltyBps,
          capApplies: terms.capApplies,
          maxPrice: terms.maxPrice,
          isConnected,
          onContractChain: chainId === TICKET_NFT_CHAIN_ID,
          wallet,
          signedIn: Boolean(user),
          profileComplete: Boolean(user?.profile_complete),
          perWalletLimit: terms.perWalletLimit,
          held: chain.wallet?.held ?? 0,
          usdcBalance: chain.wallet?.usdcBalance ?? BigInt(0),
          ethBalance: chain.wallet?.ethBalance ?? BigInt(0),
          ethNeeded: networkFee ?? BigInt(0),
        })
      : null;
  const blockMessage = block ? getResaleBlockMessage(block, { usdcDecimals: decimals, chainName: contractChain?.name ?? "the right network" }) : null;

  const steps = getPurchaseSteps(tx.state, approvalNeeded, BUY_LABEL);
  const approving = isApproving(tx.state);

  async function buy() {
    if (!terms || !chain.usdcAddress) return;
    // Read the listing once more right before the wallet opens: if the seller changed the price or
    // took it down since this popup opened, show that instead of asking for an approval first
    try {
      const [seller, current] = (await publicClient!.readContract({
        address: TICKET_NFT_ADDRESS,
        abi: ticketNftAbi,
        functionName: "listings",
        args: [tokenId],
      })) as [string, bigint, bigint];
      if (current !== price || seller.toLowerCase() !== terms.listing.seller.toLowerCase()) {
        await chain.refetch();
        return;
      }
    } catch {
      // Couldn't check: the contract still refuses a changed price (expectedPrice)
    }
    const run: TxStep[] = [];
    // Approve exactly this ticket's price, not an unlimited amount
    if (approvalNeeded) {
      run.push({
        label: APPROVE_STEP_LABEL,
        request: { address: chain.usdcAddress, abi: erc20Abi, functionName: "approve", args: [TICKET_NFT_ADDRESS, price] },
      });
    }
    // The price the buyer saw: the contract refuses it if the seller changed it in the meantime
    run.push({
      label: BUY_LABEL,
      request: { address: TICKET_NFT_ADDRESS, abi: ticketNftAbi, functionName: "buyResaleTicket", args: [tokenId, price] },
    });
    const ok = await tx.run(run);
    await chain.refetch();
    if (ok) onBought();
  }

  // A failed or finished run is cleared if the listing changes under it (another tab, the listener)
  useEffect(() => {
    if (tx.state.phase === "error" && priceChanged) tx.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceChanged]);

  const succeeded = tx.state.phase === "success";
  const { event } = listing;

  return (
    <MarketDialog open onClose={onClose} eyebrow="Resale purchase" title="Buy resale ticket" canClose={!tx.isBusy}>
      <div className="flex gap-4 rounded-md border border-border p-4">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-sm">
          <EventImage src={event.image_url} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="font-serif text-base font-semibold text-foreground">{event.title}</p>
            <span className="flex items-center gap-2">
              <span className="type-mono-tag text-primary">{listing.ticket_type.name}</span>
              <span className="rounded-xs bg-muted px-2 py-0.5 type-mono-address text-secondary-foreground">Ticket #{listing.token_id}</span>
            </span>
          </div>
          <p className="flex items-center gap-1.5 type-body-sm text-secondary-foreground">
            <Calendar className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            {formatEventDate(event.start_date)}
            {event.location ? ` · ${event.location}` : ""}
          </p>
          <p className="flex items-center gap-1.5 type-body-sm text-secondary-foreground">
            <CircleUser className="size-3.5 shrink-0" aria-hidden="true" />
            Seller: <span className="type-mono-address">{shortAddress(listing.seller_wallet)}</span>
          </p>
        </div>
      </div>

      {chain.loading ? (
        <p className="flex items-center gap-2 type-body-md text-secondary-foreground" role="status">
          <Spinner /> Checking the listing on the blockchain…
        </p>
      ) : chain.error ? (
        <Alert
          tone="error"
          title={chain.error}
          action={
            <Button size="sm" variant="outline" onClick={() => chain.refetch()}>
              <RotateCw aria-hidden="true" /> Try again
            </Button>
          }
        />
      ) : terms ? (
        <>
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[28px] leading-9 font-bold text-primary">{usdc(price)}</p>
            <CapBar price={price} faceValue={terms.faceValue} maxPrice={terms.capApplies ? terms.maxPrice : null} decimals={decimals} collectible={listing.collectible || !terms.capApplies} />
          </div>

          {priceChanged && !succeeded && block?.reason !== "notListed" && (
            <Alert tone="warning" title="The seller changed the price">
              It was {usdc(apiPrice)} when the page loaded. The price above is what you would pay now.
            </Alert>
          )}

          <dl className="flex flex-col gap-2.5 rounded-md bg-background px-4 py-4">
            <SummaryRow label="Ticket price" value={usdc(price)} />
            <SummaryRow
              label="Network fee (est.)"
              value={networkFee !== null ? `~${formatEth(networkFee)} ETH` : "—"}
              valueClassName="type-mono-value text-primary"
            />
            <SummaryRow
              label="Wallet limit"
              value={walletLimitLabel(terms.perWalletLimit, chain.wallet?.held ?? null)}
              valueClassName={cn("type-mono-value", block?.reason === "walletLimit" ? "text-destructive" : "text-foreground")}
            />
            <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-3">
              <dt className="type-body-md-strong text-foreground">Total</dt>
              <dd className="font-mono text-xl font-bold text-primary">{usdc(price)}</dd>
            </div>
          </dl>

          <p className="type-body-sm text-secondary-foreground">
            The seller receives <span className="font-mono">{usdc(split.sellerReceives)}</span> and the organizer{" "}
            <span className="font-mono">{usdc(split.royalty)}</span> ({formatBps(royaltyBps)} royalty).
          </p>

          {succeeded ? (
            <div role="status" className="flex flex-col items-center gap-3 rounded-md border border-success/60 bg-success-bg/30 px-4 py-5 text-center">
              <span className="flex size-9 items-center justify-center rounded-full border border-success/60 bg-success-bg text-success">
                <Check className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-serif text-[28px] leading-9 font-semibold text-foreground">It&apos;s yours!</p>
                <p className="type-body-sm text-secondary-foreground">Ticket #{listing.token_id} was sent to your wallet.</p>
              </div>
              <Link href={ROUTES.myTickets} className={cn(buttonVariants({ size: "md" }), "w-full")}>
                View my tickets <ArrowRight aria-hidden="true" />
              </Link>
              {tx.state.hash && <TxHash hash={tx.state.hash} explorerUrl={tx.explorerUrl} />}
            </div>
          ) : (
            <>
              <ol className="flex flex-col gap-2" aria-label="Purchase steps">
                {steps.map((step, index) => (
                  <StepRow key={step.label} step={index + 1} label={step.label} status={step.status} className="rounded-sm border border-border px-3 py-2.5" />
                ))}
              </ol>

              {tx.state.phase === "error" && tx.state.error && <Alert tone="error" title={tx.state.error} />}
              {chain.walletError && !tx.isBusy && (
                <Alert
                  tone="error"
                  title={chain.walletError}
                  action={
                    <Button size="sm" variant="outline" onClick={() => chain.refetch()}>
                      <RotateCw aria-hidden="true" /> Try again
                    </Button>
                  }
                />
              )}
              {tx.state.phase === "stillPending" && (
                <Alert
                  tone="warning"
                  title="This is taking longer than usual. Your purchase may still confirm, so don't buy again yet."
                  action={
                    <Button variant="outline" size="sm" onClick={tx.stopWaiting}>
                      Stop waiting
                    </Button>
                  }
                >
                  {tx.state.hash && <TxHash hash={tx.state.hash} explorerUrl={tx.explorerUrl} className="justify-start" />}
                </Alert>
              )}
              {tx.state.phase === "stoppedWaiting" && (
                <Alert tone="warning" title="Stopped waiting for the transaction">
                  {tx.state.note}
                  {tx.state.hash && <TxHash hash={tx.state.hash} explorerUrl={tx.explorerUrl} className="mt-1 justify-start" />}
                </Alert>
              )}
              {!tx.isBusy && block && blockMessage && (
                <Alert tone={blockMessage.tone} title={blockMessage.title}>
                  {blockMessage.message}
                </Alert>
              )}

              <BuyButton
                busy={tx.isBusy}
                phase={tx.state.phase}
                approving={approving}
                block={block?.reason ?? null}
                ready={ready}
                priceLabel={usdc(price)}
                signingIn={signingIn}
                onBuy={buy}
                onConnect={() => openConnectModal?.()}
                onSwitchNetwork={() => switchChain({ chainId: TICKET_NFT_CHAIN_ID })}
                onSignIn={() => void signIn()}
              />
              {tx.state.phase === "awaitingWallet" && (
                <p className="text-center text-[11px] leading-[16.5px] text-muted-foreground">
                  {approving ? `Step 1 of 2: allow ${usdc(price)} to be used for this purchase.` : `Confirm the purchase of ticket #${listing.token_id} in your wallet.`}
                </p>
              )}
              {tx.state.phase === "confirming" && tx.state.hash && <TxHash hash={tx.state.hash} explorerUrl={tx.explorerUrl} />}
            </>
          )}
        </>
      ) : null}
    </MarketDialog>
  );
}

interface BuyButtonProps {
  busy: boolean;
  phase: string;
  approving: boolean;
  block: string | null;
  ready: boolean;
  priceLabel: string;
  signingIn: boolean;
  onBuy: () => void;
  onConnect: () => void;
  onSwitchNetwork: () => void;
  onSignIn: () => void;
}

function BuyButton({ busy, phase, approving, block, ready, priceLabel, signingIn, onBuy, onConnect, onSwitchNetwork, onSignIn }: BuyButtonProps) {
  const base = "w-full normal-case tracking-normal";
  if (busy) {
    const label: Record<string, string> = {
      preparing: "Preparing…",
      awaitingWallet: "Confirm in your wallet…",
      confirming: approving ? "Approving…" : "Buying…",
      stillPending: "Waiting for confirmation…",
    };
    return (
      <Button size="lg" loading className={base}>
        {label[phase]}
      </Button>
    );
  }
  if (block === "notConnected") {
    return (
      <Button size="lg" className={base} onClick={onConnect}>
        Connect wallet
      </Button>
    );
  }
  if (block === "wrongNetwork") {
    return (
      <Button size="lg" className={base} onClick={onSwitchNetwork}>
        Switch network
      </Button>
    );
  }
  if (block === "notSignedIn") {
    return (
      <Button size="lg" className={base} onClick={onSignIn} loading={signingIn}>
        {signingIn ? "Confirm in your wallet…" : "Sign in to buy"}
      </Button>
    );
  }
  if (block === "profileIncomplete") {
    return (
      <Link href={`${ROUTES.signUp}?next=${encodeURIComponent(ROUTES.marketplace)}`} className={cn(buttonVariants({ size: "lg" }), base)}>
        Finish your account <ArrowRight aria-hidden="true" />
      </Link>
    );
  }
  if (phase === "error" && !block) {
    return (
      <Button size="lg" className={base} onClick={onBuy}>
        <RotateCw aria-hidden="true" /> Try again
      </Button>
    );
  }
  return (
    <Button size="lg" className={base} onClick={onBuy} disabled={!ready || Boolean(block)}>
      Buy ticket · <span className="font-mono">{priceLabel}</span>
    </Button>
  );
}
