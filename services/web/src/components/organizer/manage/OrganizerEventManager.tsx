"use client";

import { ArrowLeft, ArrowRight, CalendarDays, ExternalLink, MapPin, RotateCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useAccount } from "wagmi";

import { ContractInfoCard } from "@/components/organizer/manage/ContractInfoCard";
import { IssueTicketsCard } from "@/components/organizer/manage/IssueTicketsCard";
import { ManageNetworkNotice } from "@/components/organizer/manage/ManageNetworkNotice";
import { SalesControlsCard } from "@/components/organizer/manage/SalesControlsCard";
import { ScannersCard } from "@/components/organizer/manage/ScannersCard";
import { TicketsCard } from "@/components/organizer/manage/TicketsCard";
import { WhitelistCard } from "@/components/organizer/manage/WhitelistCard";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useContractNetwork } from "@/hooks/useContractNetwork";
import { useEventOnChain } from "@/hooks/useEventOnChain";
import { useEventOperations } from "@/hooks/useEventOperations";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useOrganizerEvent } from "@/hooks/useOrganizerEvent";
import { formatEventDate } from "@/lib/event-details";
import { eventEditorHref, publicEventHref } from "@/lib/organizer-events";
import { ROUTES } from "@/lib/nav";

// One published event's management page (#189-#194): contract details, sales, sold tickets,
// guest list, free tickets and scanners. Every write is a wallet transaction from the organizer,
// and every organizer-only API call checks the signed-in wallet again.
export function OrganizerEventManager({ eventId }: { eventId: string }) {
  const { event, loading, notFound, error, reload } = useOrganizerEvent(eventId);
  const hasMounted = useHasMounted();
  const { address, isConnected } = useAccount();
  const wallet = hasMounted && isConnected ? address : undefined;

  const contractEventId = event ? parseContractEventId(event.contract_event_id) : null;
  const chain = useEventOnChain(contractEventId, wallet);
  // Only this event's organizer can read the guest list and scanners; skip the calls otherwise
  const canManage =
    event !== null &&
    event.status === "PUBLISHED" &&
    wallet !== undefined &&
    wallet.toLowerCase() === event.organizer_wallet.toLowerCase();
  const operations = useEventOperations(eventId, canManage);
  const network = useContractNetwork();

  async function reloadAll() {
    await Promise.all([reload(), chain.refetch()]);
  }

  if (loading) return <ManageSkeleton />;

  if (notFound) {
    return (
      <Card className="items-center py-16 text-center">
        <h1 className="type-heading-md text-foreground">Event not found</h1>
        <p className="type-body-md text-muted-foreground">This event doesn&apos;t exist, or it was removed.</p>
        <Link href={ROUTES.organizer} className={buttonVariants({ variant: "secondary" })}>
          Back to my events
        </Link>
      </Card>
    );
  }

  if (error || !event) {
    return (
      <Alert
        tone="error"
        title={error ?? "Could not load this event."}
        action={
          <Button size="sm" onClick={() => reload()}>
            <RotateCw aria-hidden="true" />
            Try again
          </Button>
        }
      />
    );
  }

  // Drafts and events waiting to publish are finished in the create-event flow, not here
  if (event.status !== "PUBLISHED") {
    return (
      <Card className="items-center py-16 text-center">
        <h1 className="type-heading-md text-foreground">{event.title} isn&apos;t published yet</h1>
        <p className="max-w-[520px] type-body-md text-muted-foreground">
          Finish the event setup and publish it before managing sales, the guest list or scanners.
        </p>
        <Link
          href={eventEditorHref(event)}
          className={buttonVariants({ size: "md" })}
        >
          {event.status === "FROZEN" ? "Finish publishing" : "Continue setup"}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Card>
    );
  }

  // The API enforces this on every manage call; the page shows it before any button is pressed
  const ownsEvent =
    wallet !== undefined && wallet.toLowerCase() === event.organizer_wallet.toLowerCase();

  if (!ownsEvent) {
    return (
      <Card className="items-center py-16 text-center">
        <h1 className="type-heading-md text-foreground">This event belongs to another organizer</h1>
        <p className="max-w-[520px] type-body-md text-muted-foreground">
          Connect the wallet that created this event to manage its sales, tickets and guest list.
        </p>
        <Link href={ROUTES.organizer} className={buttonVariants({ variant: "secondary" })}>
          Back to my events
        </Link>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="type-body-sm text-muted-foreground">
        <Link href={ROUTES.organizer} className="transition-colors hover:text-foreground">
          My events
        </Link>{" "}
        <span aria-hidden="true">/</span> <span className="text-secondary-foreground">Manage event</span>
      </nav>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success" dot>
              Published
            </Badge>
            {chain.event?.saleActive ? (
              <Badge tone="highlight">Sales open</Badge>
            ) : chain.event ? (
              <Badge tone="neutral">Sales paused</Badge>
            ) : null}
            {chain.event?.presaleActive && <Badge tone="highlight">Presale</Badge>}
          </div>
          <h1 className="type-heading-lg text-foreground md:type-display-xl">{event.title}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 type-body-sm text-secondary-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
              <time dateTime={event.start_date}>{formatEventDate(event.start_date)}</time>
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
                {event.location}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href={ROUTES.organizer} className={buttonVariants({ variant: "ghost", size: "md" })}>
            <ArrowLeft aria-hidden="true" />
            My events
          </Link>
          <Link
            href={publicEventHref(event)}
            className={buttonVariants({ variant: "secondary", size: "md" })}
            target="_blank"
            rel="noreferrer"
          >
            View public page
            <ExternalLink aria-hidden="true" />
          </Link>
        </div>
      </header>

      <ManageNetworkNotice />

      <div className="grid gap-6 lg:grid-cols-2">
        <ContractInfoCard event={event} />
        <div className="lg:col-span-1">
          {chain.error ? (
            <Alert
              tone="error"
              title="Couldn't read this event from the blockchain"
              action={
                <Button size="sm" onClick={() => chain.refetch()}>
                  <RotateCw aria-hidden="true" />
                  Try again
                </Button>
              }
            >
              The contract details below come from the chain. Check your connection and try again.
            </Alert>
          ) : contractEventId === null ? (
            <Alert tone="warning" title="This event isn't linked on-chain yet">
              Finish publishing the event before managing sales, tickets or scanners.{" "}
              <Link href={eventEditorHref(event)} className="underline">
                Finish publishing
              </Link>
            </Alert>
          ) : !chain.event ? (
            <Card className="items-center justify-center py-12 text-center">
              <p className="flex items-center gap-2 type-body-md text-secondary-foreground" role="status">
                <TriangleAlert className="size-4 text-muted-foreground" aria-hidden="true" />
                Reading the event from the blockchain…
              </p>
            </Card>
          ) : (
            <SalesControlsCard
              contractEventId={contractEventId}
              saleActive={chain.event.saleActive}
              usdcDecimals={chain.usdcDecimals}
              onChanged={reloadAll}
              refetchChain={chain.refetch}
            />
          )}
        </div>
      </div>

      <TicketsCard
        eventId={eventId}
        ticketTypes={event.ticket_types}
        usdcDecimals={chain.usdcDecimals}
        explorerUrl={network.explorerUrl}
      />

      {contractEventId !== null && chain.event ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="flex flex-col gap-6">
            <WhitelistCard
              eventId={eventId}
              contractEventId={contractEventId}
              entries={operations.whitelist}
              loading={operations.loading}
              presaleActive={chain.event.presaleActive}
              onChanged={reloadAll}
              reloadOperations={operations.reload}
              refetchChain={chain.refetch}
            />
            <ScannersCard
              eventId={eventId}
              contractEventId={contractEventId}
              entries={operations.scanners}
              loading={operations.loading}
              onChanged={reloadAll}
              reloadOperations={operations.reload}
            />
          </div>
          <IssueTicketsCard
            contractEventId={contractEventId}
            ticketTypes={event.ticket_types}
            chainTiers={chain.tiers}
            usdcDecimals={chain.usdcDecimals}
            onChanged={reloadAll}
            refetchChain={chain.refetch}
          />
        </div>
      ) : (
        contractEventId !== null &&
        !chain.error && (
          <p className="type-body-sm text-muted-foreground" role="status">
            The guest list, free tickets and scanners load once the event is read from the blockchain.
          </p>
        )
      )}

      {operations.error && <Alert tone="error" title="Couldn't load the guest list or scanners">{operations.error}</Alert>}
    </div>
  );
}

function parseContractEventId(value: string | null): bigint | null {
  if (value === null || value.trim() === "") return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function ManageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading event management">
      <div className="h-4 w-48 animate-pulse rounded-xs bg-card" />
      <div className="h-10 w-2/3 animate-pulse rounded-sm bg-card" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-lg bg-card" />
        <div className="h-72 animate-pulse rounded-lg bg-card" />
      </div>
      <div className="h-96 animate-pulse rounded-lg bg-card" />
    </div>
  );
}
