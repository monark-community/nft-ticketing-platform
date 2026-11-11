"use client";

import { RotateCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EVENT_CATEGORIES } from "@/lib/create-event";
import { EVENT_SEARCH_MAX, QUICK_CATEGORIES } from "@/lib/events";
import { cn } from "@/lib/utils";

interface EventFiltersProps {
  search: string; // what's typed; the page searches after a short pause
  onSearchChange: (value: string) => void;
  category: string; // "" = all categories
  onCategoryChange: (category: string) => void;
  totalEvents: number | null; // events matching the search in every category, for "All events (24)"; null while unknown
  onRefresh: () => void;
  refreshing: boolean;
}

// Search, category dropdown and quick-select chips above the events grid (Figma "Events / Default",
// #320). The dropdown and the chips are two ways to set the same category.
export function EventFilters({ search, onSearchChange, category, onCategoryChange, totalEvents, onRefresh, refreshing }: EventFiltersProps) {
  return (
    <section aria-label="Find events" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="relative w-full md:max-w-xl">
          <span className="sr-only">Search events, venues or cities</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            maxLength={EVENT_SEARCH_MAX}
            placeholder="Search events, venues or cities..."
            className="h-12 pl-11 font-mono text-sm placeholder:font-mono"
          />
        </label>

        <div className="flex gap-3">
          <Select aria-label="Category" value={category} onChange={(e) => onCategoryChange(e.target.value)} className="min-w-0 flex-1 md:w-52 md:flex-none">
            <option value="">All categories</option>
            {EVENT_CATEGORIES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <Button variant="outline" size="icon" onClick={onRefresh} loading={refreshing} aria-label="Refresh events">
            {!refreshing && <RotateCw aria-hidden="true" />}
          </Button>
        </div>
      </div>

      {/* One row that scrolls sideways on phones, like the Figma "Events / Mobile" frame */}
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0 md:pb-0">
        <span className="hidden shrink-0 pr-1 type-mono-tag text-muted-foreground md:inline" aria-hidden="true">
          Quick select:
        </span>
        <Chip selected={category === ""} onClick={() => onCategoryChange("")}>
          All events{totalEvents === null ? "" : ` (${totalEvents})`}
        </Chip>
        {QUICK_CATEGORIES.map((name) => (
          <Chip key={name} selected={category === name} onClick={() => onCategoryChange(name)}>
            {name}
          </Chip>
        ))}
      </div>
    </section>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-sm border px-3 py-1.5 type-mono-tag whitespace-nowrap transition-colors duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected
          ? "border-primary bg-primary-tint text-primary"
          : "border-border bg-background text-secondary-foreground hover:border-border-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
