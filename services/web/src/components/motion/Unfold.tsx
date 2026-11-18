import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface UnfoldProps {
  open: boolean;
  children: ReactNode;
  id?: string;
  className?: string;
}

// Opens and closes a block between nothing and its own height (180 ms open, 120 ms close).
// While closed it is inert: out of the tab order and hidden from screen readers.
export function Unfold({ open, children, id, className }: UnfoldProps) {
  return (
    <div
      id={id}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity]",
        open ? "grid-rows-[1fr] opacity-100 duration-[180ms] ease-arrive" : "grid-rows-[0fr] opacity-0 duration-fast ease-in",
        className,
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
