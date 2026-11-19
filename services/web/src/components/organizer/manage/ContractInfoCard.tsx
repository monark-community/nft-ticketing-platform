"use client";

import { ExternalLink, Network } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useContractNetwork } from "@/hooks/useContractNetwork";
import { TICKET_NFT_ADDRESS } from "@/lib/contracts/ticket-nft";
import { shortAddress } from "@/lib/format";
import { explorerAddressUrl } from "@/lib/organizer-manage";
import type { OrganizerEvent } from "@/lib/organizer-events";

// Contract address, network and on-chain event ID (#189). The address and network link to the
// block explorer, so an organizer can check the event on-chain.
export function ContractInfoCard({ event }: { event: OrganizerEvent }) {
  const network = useContractNetwork();
  const contractUrl = explorerAddressUrl(network.explorerUrl, TICKET_NFT_ADDRESS);
  const organizerUrl = event.organizer_wallet
    ? explorerAddressUrl(network.explorerUrl, event.organizer_wallet)
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle>Contract & network</CardTitle>
          <CardDescription>Where this event and its tickets live on-chain.</CardDescription>
        </div>
        <Badge tone="code">ERC-721</Badge>
      </CardHeader>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="type-label-sm text-muted-foreground">Contract address</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="break-all rounded-xs bg-muted px-2 py-1 type-mono-address text-foreground">{TICKET_NFT_ADDRESS}</span>
            {contractUrl ? (
              <a
                href={contractUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 type-body-sm text-primary hover:underline"
              >
                View on explorer <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            ) : (
              <span className="type-body-sm text-muted-foreground">This local network has no block explorer.</span>
            )}
          </dd>
        </div>

        <div className="flex flex-col gap-1">
          <dt className="type-label-sm text-muted-foreground">Network</dt>
          <dd className="flex items-center gap-2 type-body-md text-foreground">
            <Network className="size-4 text-primary" aria-hidden="true" />
            <span>{network.chainName}</span>
            <span className="type-mono-tag text-muted-foreground">chain {network.chainId}</span>
          </dd>
        </div>

        <div className="flex flex-col gap-1">
          <dt className="type-label-sm text-muted-foreground">Contract event ID</dt>
          <dd className="type-mono-address text-foreground">{event.contract_event_id ?? "Not linked yet"}</dd>
        </div>

        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="type-label-sm text-muted-foreground">Organizer wallet</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-mono type-body-md text-foreground" title={event.organizer_wallet}>
              {shortAddress(event.organizer_wallet)}
            </span>
            {organizerUrl && (
              <a
                href={organizerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 type-body-sm text-primary hover:underline"
              >
                Explorer <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            )}
          </dd>
        </div>
      </dl>

      <p className="type-body-sm text-muted-foreground">
        The same contract holds every event&apos;s tickets. The event ID tells the contract which
        event a ticket belongs to.
      </p>
    </Card>
  );
}
