"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ArrowRight, Check, RotateCw, Ticket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAccount, useChains, useSwitchChain } from "wagmi";

import { TxHash } from "@/components/event/TxHash";
import { CapBar } from "@/components/marketplace/CapBar";
import { MarketDialog, SummaryRow } from "@/components/marketplace/MarketDialog";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useResaleOnChain } from "@/hooks/useResaleOnChain";
import { useSellableTickets } from "@/hooks/useSellableTickets";
import { useTransaction } from "@/hooks/useTransaction";
import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import { formatEventDate } from "@/lib/events";
import { formatBps, formatUsdc, isCollectible, parsePrice, priceOverCap, royaltySplit, toUnits, type SellableTicket } from "@/lib/marketplace";
import { ROUTES } from "@/lib/nav";
import { getCancelErrorMessage, getListErrorMessage } from "@/lib/resale-errors";
import { formatTokenAmount } from "@/lib/token-amount";
import { cn } from "@/lib/utils";

interface SellDialogProps {
  open: boolean;
  tokenId: string | null; // the ticket to preselect ("Sell on Marketplace" on My Tickets, Edit on a card)
  onClose: () => void;
  onChanged: () => void; // a ticket was listed, repriced or unlisted
}

// Sell popup (Figma: Marketplace / Sell open): pick one of your tickets, set a price under the cap,
// see the royalty and what you receive, then listForResale(). Listing an already listed ticket
// changes its price. Nothing moves until a buyer buys it.
export function SellDialog({ open, tokenId, onClose, onChanged }: SellDialogProps) {
  if (!open) return null;
  return <SellFlow key={tokenId ?? "new"} initialTokenId={tokenId} onClose={onClose} onChanged={onChanged} />;
}

function SellFlow({ initialTokenId, onClose, onChanged }: { initialTokenId: string | null; onClose: () => void; onChanged: () => void }) {
  const hasMounted = useHasMounted();
  const { address, isConnected: walletConnected, chainId } = useAccount();
  const isConnected = hasMounted && walletConnected;
  const wallet = isConnected ? address : undefined;
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const contractChain = useChains().find((c) => c.id === TICKET_NFT_CHAIN_ID);
  const onContractChain = chainId === TICKET_NFT_CHAIN_ID;

  const owned = useSellableTickets(wallet, true);
  const [now] = useState(() => Date.now()); // for "Collectible": events that are over
  const [chosen, setChosen] = useState<string | null>(initialTokenId);
  // The chosen ticket, else the first one that isn't listed yet
  const selected =
    owned.tickets.find((t) => t.token_id === chosen) ?? owned.tickets.find((t) => t.listing_price === null) ?? owned.tickets[0] ?? null;

  const listTx = useTransaction({ getErrorMessage: getListErrorMessage });
  const cancelTx = useTransaction({ getErrorMessage: getCancelErrorMessage });
  const busy = listTx.isBusy || cancelTx.isBusy;

  return (
    <MarketDialog open onClose={onClose} eyebrow="Resale listing" title="Sell a ticket" canClose={!busy}>
      {!isConnected ? (
        <Alert tone="info" title="Connect your wallet to sell" action={<Button onClick={() => openConnectModal?.()}>Connect wallet</Button>}>
          Connect the wallet that holds the ticket you want to sell.
        </Alert>
      ) : owned.loading ? (
        <p className="flex items-center gap-2 type-body-md text-secondary-foreground" role="status">
          <Spinner /> Loading your tickets…
        </p>
      ) : owned.error ? (
        <Alert
          tone="error"
          title="Couldn't load your tickets"
          action={
            <Button size="sm" variant="outline" onClick={() => owned.reload()}>
              <RotateCw aria-hidden="true" /> Try again
            </Button>
          }
        >
          Check your connection and try again.
        </Alert>
      ) : owned.tickets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-6 py-8 text-center">
          <Ticket className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="type-title-md text-foreground">No tickets to sell</p>
          <p className="type-body-md text-secondary-foreground">Tickets you buy show up here, ready to list.</p>
          <Link href={ROUTES.events} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Find events <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 type-body-md-strong text-foreground">Choose a ticket</legend>
            <div role="radiogroup" className="flex max-h-[260px] flex-col gap-2 overflow-y-auto pr-1">
              {owned.tickets.map((ticket) => (
                <TicketOption
                  key={ticket.token_id}
                  ticket={ticket}
                  collectible={isCollectible(ticket, now)}
                  selected={ticket.token_id === selected?.token_id}
                  disabled={busy}
                  onSelect={() => {
                    setChosen(ticket.token_id);
                    listTx.reset();
                    cancelTx.reset();
                  }}
                />
              ))}
            </div>
          </fieldset>

          {selected && (
            <PriceForm
              key={selected.token_id}
              ticket={selected}
              wallet={wallet}
              onContractChain={onContractChain}
              chainName={contractChain?.name ?? "the right network"}
              onSwitchNetwork={() => switchChain({ chainId: TICKET_NFT_CHAIN_ID })}
              listTx={listTx}
              cancelTx={cancelTx}
              onDone={onClose}
              onChanged={() => {
                onChanged();
                void owned.reload(true);
              }}
            />
          )}
        </>
      )}
    </MarketDialog>
  );
}

interface TicketOptionProps {
  ticket: SellableTicket;
  collectible: boolean;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}

function TicketOption({ ticket, collectible, selected, disabled, onSelect }: TicketOptionProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-md border px-4 py-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed",
        selected ? "border-primary bg-primary-tint" : "border-border hover:border-border-accent",
      )}
    >
      <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary" : "border-muted-foreground")} aria-hidden="true">
        {selected && <span className="size-2 rounded-full bg-primary" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="type-body-md-strong text-foreground">
          {ticket.event.title} · {ticket.ticket_type.name} · <span className="font-mono">Ticket #{ticket.token_id}</span>
        </span>
        <span className="type-body-sm text-secondary-foreground">
          {formatEventDate(ticket.event.start_date)}
          {ticket.event.location ? ` · ${ticket.event.location}` : ""}
        </span>
        {(collectible || ticket.listing_price !== null) && (
          <span className="flex flex-wrap gap-2 pt-0.5">
            {collectible && <span className="rounded-full border border-primary/60 px-2 py-0.5 type-mono-address text-primary">Collectible · no price cap</span>}
            {ticket.listing_price !== null && (
              <span className="rounded-full bg-muted px-2 py-0.5 type-mono-address text-secondary-foreground">
                Listed · {formatTokenAmount(toUnits(ticket.listing_price, 6), 6)} USDC
              </span>
            )}
          </span>
        )}
      </span>
      {selected && <span className="shrink-0 rounded-xs bg-primary-tint px-2 py-0.5 type-mono-address text-primary">Selected</span>}
    </button>
  );
}

interface PriceFormProps {
  ticket: SellableTicket;
  wallet: `0x${string}` | undefined;
  onContractChain: boolean;
  chainName: string;
  onSwitchNetwork: () => void;
  listTx: ReturnType<typeof useTransaction>;
  cancelTx: ReturnType<typeof useTransaction>;
  onDone: () => void;
  onChanged: () => void;
}

function PriceForm({ ticket, wallet, onContractChain, chainName, onSwitchNetwork, listTx, cancelTx, onDone, onChanged }: PriceFormProps) {
  const tokenId = BigInt(ticket.token_id);
  const eventId = ticket.event.contract_event_id ? BigInt(ticket.event.contract_event_id) : null;
  // The cap, face value and royalty as the contract has them now. No wallet reads needed to list.
  const chain = useResaleOnChain(tokenId, eventId, undefined);
  const decimals = chain.usdcDecimals;
  const terms = chain.terms;
  const usdc = (value: bigint) => formatUsdc(value, decimals);

  const listedOnChain = terms !== null && terms.listing.seller.toLowerCase() === wallet?.toLowerCase();
  const listedPrice = listedOnChain ? terms!.listing.price : null;
  const [text, setText] = useState(ticket.listing_price !== null ? formatTokenAmount(toUnits(ticket.listing_price, decimals), decimals).replace(/,/g, "") : "");

  const parsed = parsePrice(text, decimals);
  const price = parsed.ok ? parsed.value : BigInt(0);
  const overCap = terms !== null && parsed.ok && priceOverCap(price, terms.capApplies, terms.maxPrice);
  const samePrice = listedPrice !== null && parsed.ok && price === listedPrice;
  const split = royaltySplit(price, terms?.royaltyBps ?? 0);
  const inputError = !parsed.ok ? parsed.error : overCap ? `The most you can ask for this ticket is ${usdc(terms!.maxPrice)}.` : null;

  const listed = listTx.state.phase === "success";
  const cancelled = cancelTx.state.phase === "success";
  const canList = terms !== null && parsed.ok && !overCap && !samePrice && onContractChain;

  async function list() {
    if (!canList) return;
    const ok = await listTx.run([
      { label: "List ticket", request: { address: TICKET_NFT_ADDRESS, abi: ticketNftAbi, functionName: "listForResale", args: [tokenId, price] } },
    ]);
    await chain.refetch();
    if (ok) onChanged();
  }

  async function cancel() {
    const ok = await cancelTx.run([
      { label: "Cancel listing", request: { address: TICKET_NFT_ADDRESS, abi: ticketNftAbi, functionName: "cancelListing", args: [tokenId] } },
    ]);
    await chain.refetch();
    if (ok) onChanged();
  }

  if (listed || cancelled) {
    const tx = listed ? listTx : cancelTx;
    return (
      <div role="status" className="flex flex-col items-center gap-3 rounded-md border border-success/60 bg-success-bg/30 px-4 py-5 text-center">
        <span className="flex size-9 items-center justify-center rounded-full border border-success/60 bg-success-bg text-success">
          <Check className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-serif text-2xl font-semibold text-foreground">{listed ? `Listed for ${usdc(price)}` : "Listing cancelled"}</p>
          <p className="type-body-sm text-secondary-foreground">
            {listed
              ? "It shows on the Marketplace in a few seconds. You can change the price or cancel it anytime."
              : "The ticket is off the Marketplace and stays in your wallet."}
          </p>
        </div>
        <Button className="w-full" onClick={onDone}>
          Done
        </Button>
        {tx.state.hash && <TxHash hash={tx.state.hash} explorerUrl={tx.explorerUrl} />}
      </div>
    );
  }

  if (chain.loading) {
    return (
      <p className="flex items-center gap-2 type-body-md text-secondary-foreground" role="status">
        <Spinner /> Reading this ticket&apos;s resale terms…
      </p>
    );
  }
  if (chain.error || !terms) {
    return (
      <Alert
        tone="error"
        title={chain.error ?? "Couldn't read this ticket from the blockchain."}
        action={
          <Button size="sm" variant="outline" onClick={() => chain.refetch()}>
            <RotateCw aria-hidden="true" /> Try again
          </Button>
        }
      />
    );
  }

  const busy = listTx.isBusy || cancelTx.isBusy;
  const error = listTx.state.phase === "error" ? listTx.state.error : cancelTx.state.phase === "error" ? cancelTx.state.error : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="resale-price" className="type-body-md-strong text-foreground">
          Set your price
        </label>
        <div className="relative">
          <input
            id="resale-price"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (listTx.state.phase === "error") listTx.reset();
            }}
            disabled={busy}
            placeholder={formatTokenAmount(terms.faceValue, decimals).replace(/,/g, "")}
            aria-invalid={Boolean(inputError) || undefined}
            aria-describedby="resale-price-help"
            className="h-14 w-full rounded-md border border-input bg-background pr-20 pl-4 font-mono text-xl font-bold text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20 aria-invalid:border-destructive"
          />
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 type-mono-address text-secondary-foreground">USDC</span>
        </div>
        <div id="resale-price-help">
          <CapBar
            price={price}
            faceValue={terms.faceValue}
            maxPrice={terms.capApplies ? terms.maxPrice : null}
            decimals={decimals}
            collectible={!terms.capApplies}
            beforeEvent
          />
          {inputError && <p className="pt-2 type-body-sm text-destructive">{inputError}</p>}
        </div>
      </div>

      <dl className="flex flex-col gap-2.5 rounded-md bg-background px-4 py-4">
        <SummaryRow label="Buyer pays" value={usdc(price)} />
        <SummaryRow label={`Organizer royalty (${formatBps(terms.royaltyBps)})`} value={`-${usdc(split.royalty)}`} />
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-3">
          <dt className="type-body-md-strong text-foreground">You receive</dt>
          <dd className="font-mono text-xl font-bold text-primary">{usdc(split.sellerReceives)}</dd>
        </div>
      </dl>

      {error && <Alert tone="error" title={error} />}
      {listedPrice !== null && !error && (
        <Alert tone="info" title={`Listed for ${usdc(listedPrice)}`}>
          Enter a new price to change it, or cancel the listing.
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        {!onContractChain ? (
          <Button size="lg" className="w-full normal-case tracking-normal" onClick={onSwitchNetwork}>
            Switch to {chainName}
          </Button>
        ) : (
          <Button size="lg" className="w-full normal-case tracking-normal" onClick={list} disabled={!canList || cancelTx.isBusy} loading={listTx.isBusy}>
            {listTx.isBusy ? busyLabel(listTx.state.phase) : listedPrice !== null ? "Update price" : "List ticket"}
          </Button>
        )}
        {listedPrice !== null && onContractChain && (
          <Button variant="ghost" className="w-full normal-case tracking-normal" onClick={cancel} disabled={listTx.isBusy} loading={cancelTx.isBusy}>
            {cancelTx.isBusy ? busyLabel(cancelTx.state.phase) : "Cancel listing"}
          </Button>
        )}
        <p className="text-center type-body-sm text-muted-foreground">Your wallet will ask you to confirm. You can cancel the listing anytime.</p>
        {(listTx.state.phase === "confirming" || cancelTx.state.phase === "confirming") && (listTx.state.hash ?? cancelTx.state.hash) && (
          <TxHash hash={(listTx.state.hash ?? cancelTx.state.hash)!} explorerUrl={listTx.explorerUrl} />
        )}
      </div>
    </div>
  );
}

function busyLabel(phase: string): string {
  if (phase === "awaitingWallet") return "Confirm in your wallet…";
  if (phase === "confirming") return "Confirming…";
  if (phase === "stillPending") return "Waiting for confirmation…";
  return "Preparing…";
}
