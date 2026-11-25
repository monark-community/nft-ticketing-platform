import { LayoutGrid, List, type LucideIcon } from "lucide-react";

import type { TicketView } from "@/lib/my-tickets";
import { cn } from "@/lib/utils";

// Grid / list toggle from the Figma "View Switcher". The orange highlight slides to the chosen view (#369).
export function TicketViewSwitcher({ view, onChange }: { view: TicketView; onChange: (view: TicketView) => void }) {
  return (
    <div className="relative flex items-center gap-2" role="group" aria-label="Ticket layout">
      {/* One button and the gap (36 + 8 px) to the right for the list view */}
      <span
        className={cn(
          "pointer-events-none absolute top-0 left-0 size-9 rounded-sm border border-primary bg-primary-tint shadow-[0_0_6px_rgb(249_115_22/15%)] transition-[translate] duration-[220ms] ease-[var(--ease-arrive)]",
          view === "list" && "translate-x-11",
        )}
        data-view-highlight
        aria-hidden="true"
      />
      <Option icon={LayoutGrid} label="Grid view" active={view === "grid"} onClick={() => onChange("grid")} />
      <Option icon={List} label="List view" active={view === "list"} onClick={() => onChange("list")} />
    </div>
  );
}

function Option({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        // Above the highlight, which shows through the chosen one
        "relative flex size-9 items-center justify-center rounded-sm border transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "border-transparent text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
    </button>
  );
}
