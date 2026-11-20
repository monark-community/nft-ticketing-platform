import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PrintInProps {
  children: ReactNode;
  /** How long the print takes, in ms */
  ms?: number;
  /** Wait before printing, in ms: give a list of cards 60 ms steps so they print one after another */
  delay?: number;
  className?: string;
}

// Shows its children from top to bottom behind a bright orange scan line, like a ticket coming out
// of a printer. It plays once when it appears; give it a new `key` to print again.
export function PrintIn({ children, ms = 260, delay = 0, className }: PrintInProps) {
  const style = { "--print-ms": `${ms}ms`, "--print-delay": `${delay}ms` } as CSSProperties;
  return (
    <div className={cn("relative", className)} style={style}>
      <div className="print-in h-full">{children}</div>
      {/* Outside the printed part, so the line stays visible on its edge */}
      <span className="print-in-line" aria-hidden="true" />
    </div>
  );
}
