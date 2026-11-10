"use client";

import { ChevronLeft, ChevronRight, Clock, Info, Search, SearchX, Ticket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EmptyState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { EditEventSettingsPanel } from "@/components/admin/EditEventSettingsPanel";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { AdminEvents } from "@/hooks/useAdminEvents";
import {
  ADMIN_EVENT_SEARCH_MAX,
  adminEventStatus,
  canEditSettings,
  pageCount,
  resaleCapText,
  royaltyText,
  soldSummary,
  STATUS_FILTER_OPTIONS,
  type AdminEvent,
  type AdminEventStatusFilter,
} from "@/lib/admin-events";
import { organizerAccountName } from "@/lib/admin-organizers";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AdminEventsTabProps {
  events: AdminEvents;
  // The connected wallet has the contract's admin role (undefined while it is being read)
  hasAdminRole: boolean | undefined;
}

// Admin page, Events tab (Figma "Admin/Events"): every event in every status with its sale
// settings, and "Edit settings" on the ones that are live (#296).
export function AdminEventsTab({ events, hasAdminRole }: AdminEventsTabProps) {
  const [editing, setEditing] = useState<AdminEvent | null>(null);
  const pages = pageCount(events.total);

  function clearFilters() {
    events.setSearch("");
    events.setStatus("all");
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="type-heading-sm text-foreground">All events</h2>
          {events.loaded && (
            <Badge tone="warning" dot className="type-mono-tag normal-case" aria-live="polite">
              {events.filtered ? `${events.total} of ${events.allTotal}` : `${events.total} total`}
            </Badge>
          )}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Search event or organizer"
              placeholder="Search event or organizer..."
              maxLength={ADMIN_EVENT_SEARCH_MAX}
              className="h-10 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
              value={events.search}
              onChange={(e) => events.setSearch(e.target.value)}
            />
          </div>
          <Select
            aria-label="Filter by status"
            className="sm:w-40 [&>select]:h-10"
            value={events.status}
            onChange={(e) => events.setStatus(e.target.value as AdminEventStatusFilter)}
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {events.error ? (
        <Alert
          tone="error"
          title="Could not load the events"
          action={
            <Button size="sm" variant="outline" onClick={() => void events.reload()}>
              Try again
            </Button>
          }
        >
          {events.error}
        </Alert>
      ) : !events.loaded ? (
        <div className="flex justify-center rounded-lg border border-border bg-card py-12">
          <Spinner className="size-6 text-primary" label="Loading events" />
        </div>
      ) : events.events.length === 0 ? (
        events.filtered ? (
          <EmptyState
            icon={<SearchX className="size-8" aria-hidden="true" />}
            title="No events match"
            description="Try another event title or organizer name, or a different status."
            action={
              <Button size="sm" variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Ticket className="size-8" aria-hidden="true" />}
            title="No events yet"
            description="Events appear here as soon as an organizer creates one."
          />
        )
      ) : (
        <TableShell>
          <table
            className={cn("w-full min-w-[920px] text-left transition-opacity", events.loading && "opacity-60")}
            aria-busy={events.loading}
          >
            <caption className="sr-only">All events</caption>
            <thead>
              <tr className="border-b border-border">
                <Th>Event</Th>
                <Th>Organizer</Th>
                <Th>Status</Th>
                <Th>Sold</Th>
                <Th>Royalty</Th>
                <Th>Resale cap</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {events.events.map((event) => (
                <EventRow key={event.id} event={event} onEdit={() => setEditing(event)} />
              ))}
            </tbody>
          </table>
        </TableShell>
      )}

      {events.loaded && !events.error && pages > 1 && (
        <nav aria-label="Events pages" className="flex items-center justify-end gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => events.setPage(events.page - 1)}
            disabled={events.page <= 1 || events.loading}
          >
            <ChevronLeft aria-hidden="true" /> Previous
          </Button>
          <span className="type-body-sm text-secondary-foreground" aria-live="polite">
            Page {events.page} of {pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => events.setPage(events.page + 1)}
            disabled={events.page >= pages || events.loading}
          >
            Next <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      )}

      <p className="flex items-start gap-2 px-1 type-body-md text-secondary-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        Organizers can&apos;t change settings after the first sale. Admins can, but only when necessary.
      </p>

      {editing && (
        <EditEventSettingsPanel
          key={editing.id}
          event={editing}
          hasAdminRole={hasAdminRole}
          onClose={() => setEditing(null)}
          onSaved={(settings) => events.applySaved(editing.id, settings)}
        />
      )}
    </section>
  );
}

function EventRow({ event, onEdit }: { event: AdminEvent; onEdit: () => void }) {
  const status = adminEventStatus(event);
  const live = canEditSettings(event);
  const sold = soldSummary(event);

  return (
    <tr className="border-b border-border last:border-0">
      <Td>
        <div className="flex max-w-[260px] flex-col gap-0.5">
          {live ? (
            <Link href={`/events/${event.id}`} className="truncate type-body-md-strong text-foreground hover:text-primary">
              {event.title}
            </Link>
          ) : (
            <span className="truncate type-body-md-strong text-foreground">{event.title}</span>
          )}
          {event.location && <span className="truncate type-body-sm text-muted-foreground">{event.location}</span>}
        </div>
      </Td>
      <Td>
        <div className="flex max-w-[200px] flex-col gap-0.5">
          <span className="truncate type-body-md text-foreground">{organizerAccountName(event.organizer)}</span>
          <span className="type-mono-address text-secondary-foreground" title={event.organizer.wallet}>
            {shortAddress(event.organizer.wallet)}
          </span>
        </div>
      </Td>
      <Td>
        <Badge tone={status.tone} dot className="type-mono-tag normal-case">
          {status.label}
        </Badge>
      </Td>
      <Td>
        {live ? (
          <div className="flex w-28 flex-col gap-1.5">
            <span className="type-body-md text-secondary-foreground">{sold.text}</span>
            <span className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${sold.percent}%` }} />
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground" aria-label="No sales yet">
            —
          </span>
        )}
      </Td>
      <Td className="type-mono-value text-foreground">{royaltyText(event.royalty_bps)}</Td>
      <Td className="type-mono-value text-foreground">{resaleCapText(event.resale_cap_bps)}</Td>
      <Td align="right">
        {live ? (
          <Button variant="secondary" size="sm" onClick={onEdit} aria-label={`Edit settings of ${event.title}`}>
            Edit settings
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 type-mono-address text-secondary-foreground">
            <Clock className="size-3.5" aria-hidden="true" /> Not live yet
          </span>
        )}
      </Td>
    </tr>
  );
}
