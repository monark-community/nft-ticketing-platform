import { LayoutGrid, List, type LucideIcon } from "lucide-react";

import type { TicketView } from "@/lib/my-tickets";
import { cn } from "@/lib/utils";

// Grid / list toggle from the Figma "View Switcher"
export function TicketViewSwitcher({ view, onChange }: { view: TicketView; onChange: (view: TicketView) => void }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Ticket layout">
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
        "flex size-9 items-center justify-center rounded-sm border transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "border-primary bg-primary-tint text-primary shadow-[0_0_6px_rgb(249_115_22/15%)]"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
    </button>
  );
}
