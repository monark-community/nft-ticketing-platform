"use client";

import { RotateCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EVENT_CATEGORIES } from "@/lib/create-event";
import { LISTING_SORTS, type ListingFilters, type ListingSort } from "@/lib/marketplace";

interface MarketplaceFiltersProps {
  search: string; // what's typed; the page sends it to the API after a short pause
  onSearchChange: (value: string) => void;
  filters: ListingFilters;
  onChange: (next: ListingFilters) => void;
  events: { id: string; title: string }[];
  onRefresh: () => void;
  refreshing: boolean;
}

// Search, event, category and sort above the grid (Figma: Marketplace / Default)
export function MarketplaceFilters({ search, onSearchChange, filters, onChange, events, onRefresh, refreshing }: MarketplaceFiltersProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <label className="relative w-full lg:max-w-sm">
        <span className="sr-only">Search by event or seller wallet</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search event or seller wallet..."
          className="pl-11"
        />
      </label>

      <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
        <Select
          aria-label="Event"
          value={filters.eventId}
          onChange={(e) => onChange({ ...filters, eventId: e.target.value })}
          className="col-span-2 sm:w-56"
        >
          <option value="">All events</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </Select>
        <Select aria-label="Category" value={filters.category} onChange={(e) => onChange({ ...filters, category: e.target.value })} className="col-span-2 sm:w-44">
          <option value="">All categories</option>
          {EVENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </Select>
        <div className="col-span-2 flex gap-3">
          <Select aria-label="Sort" value={filters.sort} onChange={(e) => onChange({ ...filters, sort: e.target.value as ListingSort })} className="min-w-0 flex-1 sm:w-40">
            {LISTING_SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </Select>
          <Button variant="outline" size="icon" onClick={onRefresh} loading={refreshing} aria-label="Refresh listings">
            {!refreshing && <RotateCw aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
