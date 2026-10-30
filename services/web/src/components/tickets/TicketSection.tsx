import type { ReactNode } from "react";

import type { TicketView } from "@/lib/my-tickets";
import { cn } from "@/lib/utils";

// "UPCOMING · 2" / "PAST · 1" with the fading divider, and the cards under it
export function TicketSection({
  title,
  count,
  tone,
  view,
  children,
}: {
  title: string;
  count: number;
  tone: "upcoming" | "past";
  view: TicketView;
  children: ReactNode;
}) {
  const upcoming = tone === "upcoming";
  const headingId = `tickets-${tone}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <h2
          id={headingId}
          className={cn("font-mono text-xs leading-4 font-semibold tracking-[0.6px] uppercase", upcoming ? "text-primary" : "text-muted-foreground")}
        >
          {title} · {count}
        </h2>
        <div
          className={cn(
            "h-px min-w-px flex-1",
            upcoming
              ? "bg-gradient-to-r from-primary/80 via-primary/20 via-60% to-transparent shadow-[0_0_8px_rgb(249_115_22/35%)]"
              : "bg-gradient-to-r from-muted-foreground to-transparent",
          )}
          aria-hidden="true"
        />
      </div>
      {/* Cards in a grid row share one height, so a longer name never pushes one card out of line */}
      <div className={view === "grid" ? "grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-4"}>
        {children}
      </div>
    </section>
  );
}

// Same footprint as the cards, so the page doesn't jump when the tickets arrive
export function TicketsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading your tickets">
      <div className="h-4 w-28 animate-pulse rounded-xs bg-card" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[400px] animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}
