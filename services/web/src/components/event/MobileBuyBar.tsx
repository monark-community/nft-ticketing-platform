import { RollingNumber } from "@/components/motion/RollingNumber";
import { Button } from "@/components/ui/button";

interface MobileBuyBarProps {
  tierName: string;
  totalLabel: string; // "30.00 USDC", or "—" for a sold-out type
  onReview: () => void; // scrolls to the order summary
}

// Phones only (#282): on small screens the order summary sits below the ticket types, so a bar at
// the bottom keeps the total in view and jumps to the summary, where the steps and alerts are.
// It slides up from the bottom when it appears, and its total rolls like a counter (#367).
export function MobileBuyBar({ tierName, totalLabel, onReview }: MobileBuyBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 animate-[slide-up_300ms_var(--ease-arrive)_backwards] border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate type-body-sm text-muted-foreground">{tierName}</p>
          <p className="font-mono text-lg leading-6 font-bold text-primary">
            <RollingNumber value={totalLabel} />
          </p>
        </div>
        <Button onClick={onReview}>Review &amp; buy</Button>
      </div>
    </div>
  );
}
