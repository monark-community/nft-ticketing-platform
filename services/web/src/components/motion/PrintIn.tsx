"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

import { PRINT_MS } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface PrintInProps {
  children: ReactNode;
  /** How long the print takes, in ms */
  ms?: number;
  /** Wait before printing, in ms: give each card of a list `printDelay(index)`, so they print one after another */
  delay?: number;
  /** false shows the children at once, in the same wrapper. Read when it appears only. */
  play?: boolean;
  className?: string;
}

// Shows its children from top to bottom behind a bright orange scan line, like a ticket coming out
// of a printer. It plays once when it appears; give it a new `key` to print again. With
// `play={sawLoading}` (useSawLoading), content prints only when it replaces a loading placeholder.
// Wrap each card of a list, not the whole list: every card gets its own line (a table row: `print-row`).
export function PrintIn({ children, ms = PRINT_MS, delay = 0, play = true, className }: PrintInProps) {
  // Decided once: turning `play` on later doesn't start a print halfway through the page's life.
  // Off again once printed, so moving the element (a list reordering) doesn't print it again.
  const [printing, setPrinting] = useState(play);
  const style = printing ? ({ "--print-ms": `${ms}ms`, "--print-delay": `${delay}ms` } as CSSProperties) : undefined;
  return (
    <div className={cn("relative", className)} style={style}>
      <div
        className={cn("h-full", printing && "print-in")}
        onAnimationEnd={printing ? (event) => event.target === event.currentTarget && event.animationName === "print-in" && setPrinting(false) : undefined}
      >
        {children}
      </div>
      {/* Outside the printed part, so the line stays visible on its edge */}
      {printing && <span className="print-in-line" aria-hidden="true" />}
    </div>
  );
}
