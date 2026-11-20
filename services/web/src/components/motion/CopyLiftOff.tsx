"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface CopyLiftOffProps {
  /** The text that gets copied (plain text: it is drawn a second time as the copy that lifts off) */
  children: ReactNode;
  /** How many times it was copied so far: each increase lifts one faint copy off */
  copies: number;
  className?: string;
}

// After copying, a faint copy of the text lifts off and fades, as if it left for the clipboard.
export function CopyLiftOff({ children, copies, className }: CopyLiftOffProps) {
  const [seen, setSeen] = useState(copies);
  const [lifting, setLifting] = useState<number | null>(null);

  if (copies !== seen) {
    setSeen(copies);
    if (copies > seen) setLifting(copies);
  }

  return (
    <span className={cn("relative inline-block", className)}>
      {children}
      {lifting !== null && (
        <span key={lifting} className="lift-off pointer-events-none absolute top-0 left-0 text-primary" aria-hidden="true" onAnimationEnd={() => setLifting(null)}>
          {children}
        </span>
      )}
    </span>
  );
}
