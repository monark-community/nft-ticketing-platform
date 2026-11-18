import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const TONES = {
  orange: "text-primary",
  green: "text-success",
  red: "text-destructive",
} as const;

interface StampProps {
  children: ReactNode;
  tone?: keyof typeof TONES;
  /** Where it lands: the stamp doesn't place itself (for example "absolute right-4 top-4") */
  className?: string;
}

// A rubber stamp (APPROVED, SAVED, VOID...) that lands at a slight angle when it appears.
// It only repeats what the page already says in words, so screen readers skip it.
export function Stamp({ children, tone = "orange", className }: StampProps) {
  return (
    <span className={cn("stamp", TONES[tone], className)} aria-hidden="true">
      {children}
    </span>
  );
}
