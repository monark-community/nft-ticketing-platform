"use client";

import { RotateCw, Search } from "lucide-react";
import { useState } from "react";

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
// Motion (#366): the search icon turns orange with the box's ring, Refresh turns its icon once per
// refresh, and the chosen chip gets a hole punched into it.
export function EventFilters({ search, onSearchChange, category, onCategoryChange, totalEvents, onRefresh, refreshing }: EventFiltersProps) {
  const [turns, setTurns] = useState(0); // a new turn of the Refresh icon per refresh
  return (
    <section aria-label="Find events" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="group/search relative w-full md:max-w-xl">
          <span className="sr-only">Search events, venues or cities</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground transition-colors duration-[140ms] group-focus-within/search:text-primary"
            aria-hidden="true"
          />
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
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setTurns((n) => n + 1);
              onRefresh();
            }}
            disabled={refreshing}
            aria-busy={refreshing || undefined}
            aria-label="Refresh events"
          >
            <RotateCw key={turns} className={turns > 0 ? "turn-once" : undefined} aria-hidden="true" />
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
        "relative shrink-0 rounded-sm border py-1.5 type-mono-tag whitespace-nowrap transition-[color,background-color,border-color,padding] duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        // The hole punched into the chosen chip (#366): it pops in with a small overshoot, and the
        // label moves over to make room
        "before:absolute before:top-1/2 before:left-2.5 before:-mt-1 before:size-2 before:scale-0 before:rounded-full before:bg-card before:shadow-[0_0_0_1.5px_var(--primary)] before:transition-transform before:duration-[180ms] before:ease-[var(--ease-snap)]",
        selected
          ? "border-primary bg-primary-tint pr-3 pl-[27px] text-primary before:scale-100"
          : "border-border bg-background px-3 text-secondary-foreground hover:border-border-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
