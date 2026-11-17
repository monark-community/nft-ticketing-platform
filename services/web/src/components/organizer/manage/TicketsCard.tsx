"use client";

import { ExternalLink, RefreshCw, Ticket } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useEventTickets } from "@/hooks/useEventTickets";
import type { ApiTicketType } from "@/lib/event-details";
import { sortTicketTypes } from "@/lib/event-details";
import { shortAddress } from "@/lib/format";
import {
  explorerAddressUrl,
  formatTicketPrice,
  TICKETS_PAGE_SIZE,
  type ManageTicket,
} from "@/lib/organizer-manage";

interface Props {
  eventId: string;
  ticketTypes: ApiTicketType[];
  usdcDecimals: number;
  explorerUrl: string | null;
}

// Every ticket of the event with its current owner and check-in state (#190). Resales and
// check-ins are written by the listener, so the table refreshes on its own every 15 seconds.
export function TicketsCard({ eventId, ticketTypes, usdcDecimals, explorerUrl }: Props) {
  const [status, setStatus] = useState<"" | "VALID" | "USED">("");
  const [kind, setKind] = useState<"" | "sale" | "issued">("");
  const [typeId, setTypeId] = useState("");
  const [page, setPage] = useState(1);

  const tickets = useEventTickets(eventId, {
    page,
    limit: TICKETS_PAGE_SIZE,
    status: status || undefined,
    kind: kind || undefined,
    ticketTypeId: typeId || undefined,
  });

  const types = sortTicketTypes(ticketTypes);
  const pages = Math.max(1, Math.ceil(tickets.total / TICKETS_PAGE_SIZE));
  const first = tickets.total === 0 ? 0 : (page - 1) * TICKETS_PAGE_SIZE + 1;
  const last = Math.min(page * TICKETS_PAGE_SIZE, tickets.total);
  const filtered = Boolean(status || kind || typeId);

  function changeFilter(change: () => void) {
    change();
    setPage(1);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle>Tickets</CardTitle>
          <CardDescription>Who owns each ticket, whether it was bought or issued, and its check-in state.</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => tickets.reload()}
          loading={tickets.fetching && !tickets.loading}
          aria-label="Refresh tickets"
        >
          <RefreshCw aria-hidden="true" />
        </Button>
      </CardHeader>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label="Tickets" value={tickets.summary.total} />
        <Summary label="Sold" value={tickets.summary.sold} />
        <Summary label="Issued free" value={tickets.summary.issued} />
        <Summary label="Checked in" value={tickets.summary.used} />
      </dl>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <Filter label="Status">
          <Select value={status} onChange={(e) => changeFilter(() => setStatus(e.target.value as typeof status))}>
            <option value="">All statuses</option>
            <option value="VALID">Valid</option>
            <option value="USED">Checked in</option>
          </Select>
        </Filter>
        <Filter label="Source">
          <Select value={kind} onChange={(e) => changeFilter(() => setKind(e.target.value as typeof kind))}>
            <option value="">Sales and issued</option>
            <option value="sale">Bought</option>
            <option value="issued">Issued free</option>
          </Select>
        </Filter>
        <Filter label="Ticket type">
          <Select value={typeId} onChange={(e) => changeFilter(() => setTypeId(e.target.value))}>
            <option value="">All ticket types</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>
        </Filter>
      </div>

      {tickets.loading ? (
        <p className="flex items-center gap-2 type-body-md text-secondary-foreground" role="status">
          <Spinner /> Loading tickets…
        </p>
      ) : tickets.error ? (
        <Alert
          tone="error"
          title="Couldn't load tickets"
          action={
            <Button size="sm" variant="outline" onClick={() => tickets.reload()}>
              <RefreshCw aria-hidden="true" /> Try again
            </Button>
          }
        >
          {tickets.error}
        </Alert>
      ) : tickets.summary.total === 0 ? (
        <EmptyState
          title="No tickets yet"
          text="Tickets appear here after a sale or after you issue free tickets."
        />
      ) : tickets.tickets.length === 0 ? (
        <EmptyState title="No tickets match these filters" text="Clear a filter to see the event's other tickets." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[760px] text-left">
              <caption className="sr-only">Tickets of this event</caption>
              <thead className="border-b border-border bg-background/50">
                <tr>
                  <Th>Ticket</Th>
                  <Th>Type</Th>
                  <Th>Owner</Th>
                  <Th>Status</Th>
                  <Th>Source</Th>
                  <Th align="right">Price</Th>
                  <Th>Minted</Th>
                </tr>
              </thead>
              <tbody>
                {tickets.tickets.map((ticket) => (
                  <TicketRow
                    key={ticket.token_id}
                    ticket={ticket}
                    usdcDecimals={usdcDecimals}
                    explorerUrl={explorerUrl}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="type-body-sm text-muted-foreground" aria-live="polite">
              Showing {first}–{last} of {tickets.total}
              {filtered ? ` matching ${filteredLabel(status, kind, typeId, types)}` : ""}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                Previous
              </Button>
              <span className="flex items-center px-2 type-body-sm text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function TicketRow({ ticket, usdcDecimals, explorerUrl }: { ticket: ManageTicket; usdcDecimals: number; explorerUrl: string | null }) {
  const ownerUrl = explorerAddressUrl(explorerUrl, ticket.owner_wallet);

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3 type-mono-address text-foreground">#{ticket.token_id}</td>
      <td className="px-4 py-3 type-body-sm text-foreground">{ticket.ticket_type.name}</td>
      <td className="px-4 py-3">
        <span className="flex items-center gap-1.5">
          <span className="font-mono type-body-sm text-foreground" title={ticket.owner_wallet}>
            {shortAddress(ticket.owner_wallet)}
          </span>
          {ownerUrl && (
            <a
              href={ownerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
              aria-label={`View owner ${ticket.owner_wallet} on the explorer`}
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
        </span>
      </td>
      <td className="px-4 py-3">
        <Badge tone={ticket.status === "USED" ? "neutral" : "success"}>
          {ticket.status === "USED" ? "Checked in" : "Valid"}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <Badge tone={ticket.kind === "issued" ? "highlight" : "neutral"}>
          {ticket.kind === "issued" ? "Issued free" : "Bought"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-right">
        <p className="type-body-sm text-foreground">{formatTicketPrice(ticket.purchase_price, usdcDecimals)}</p>
        {ticket.listing_price !== null && (
          <p className="type-body-sm text-muted-foreground">Listed at {formatTicketPrice(ticket.listing_price, usdcDecimals)}</p>
        )}
      </td>
      <td className="px-4 py-3 type-body-sm text-secondary-foreground">
        <time dateTime={ticket.minted_at}>{formatShortDate(ticket.minted_at)}</time>
      </td>
    </tr>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background/50 px-3 py-2">
      <dt className="type-label-sm text-muted-foreground">{label}</dt>
      <dd className="type-heading-sm text-foreground">{value.toLocaleString("en-US")}</dd>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-[160px] flex-1 flex-col gap-1.5 type-label-sm text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-6 py-8 text-center">
      <Ticket className="size-7 text-muted-foreground" aria-hidden="true" />
      <p className="type-title-sm text-foreground">{title}</p>
      <p className="type-body-sm text-secondary-foreground">{text}</p>
    </div>
  );
}

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function filteredLabel(status: string, kind: string, typeId: string, types: ApiTicketType[]): string {
  const parts: string[] = [];
  if (status) parts.push(status === "USED" ? "checked-in tickets" : "valid tickets");
  if (kind) parts.push(kind === "issued" ? "issued free tickets" : "bought tickets");
  if (typeId) parts.push(types.find((type) => type.id === typeId)?.name ?? "the chosen type");
  return parts.join(", ");
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th scope="col" className={`px-4 py-3 type-label-sm text-muted-foreground ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
