import { cn } from "@/lib/utils";

// A tick that draws itself when it appears (after copying, saving, switching networks).
// Decorative: the text next to it says what happened.
export function DrawnCheck({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4 shrink-0", className)}
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" className="draw-check" />
    </svg>
  );
}
