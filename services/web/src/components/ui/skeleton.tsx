import { cn } from "@/lib/utils";

interface SkeletonProps extends React.ComponentProps<"div"> {
  /** Sweep the orange band down this shape itself: for a big block that stands alone */
  sweep?: boolean;
}

// A grey placeholder shape shown while something loads (#365). It doesn't blink: put
// `skeleton-sweep` on the box around a group of shapes (or `sweep` on a block that stands alone)
// and a soft orange band sweeps down it like the scanner line. Keep `role="status"` or
// `aria-busy` and the label on that box, and give it `placeholder-in` so it only shows when
// loading takes a moment; choose between it and the content with useHeldLoading.
export function Skeleton({ sweep = false, className, ...props }: SkeletonProps) {
  return <div data-slot="skeleton" className={cn("rounded-xs bg-muted", sweep && "skeleton-sweep", className)} {...props} />;
}
