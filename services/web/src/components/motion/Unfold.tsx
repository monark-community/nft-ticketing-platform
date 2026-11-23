"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface UnfoldProps {
  open: boolean;
  children: ReactNode;
  id?: string;
  className?: string;
}

// Opens and closes a block between nothing and its own height (180 ms open, 120 ms close).
// While closed it is inert: out of the tab order and hidden from screen readers. Once it has
// opened, its content isn't clipped any more, so a button's focus ring shows in full (#368).
export function Unfold({ open, children, id, className }: UnfoldProps) {
  const [opened, setOpened] = useState(open);
  if (!open && opened) setOpened(false);

  return (
    <div
      id={id}
      inert={!open}
      onTransitionEnd={(event) => {
        if (open && event.target === event.currentTarget) setOpened(true);
      }}
      className={cn(
        "grid transition-[grid-template-rows,opacity]",
        open ? "grid-rows-[1fr] opacity-100 duration-[180ms] ease-arrive" : "grid-rows-[0fr] opacity-0 duration-fast ease-in",
        className,
      )}
    >
      <div className={cn("min-h-0", opened ? "overflow-visible" : "overflow-hidden")}>{children}</div>
    </div>
  );
}
