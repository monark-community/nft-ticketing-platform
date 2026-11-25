"use client";

import { useState, type CSSProperties } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { rollDirection, type RollDirection } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface RollingNumberProps {
  /** The text to show, already formatted ("3", "36.00", "Showing 2 of 6") */
  value: string | number;
  /** Which edge the old and the new text share while they roll, when they aren't the same width:
   * the side the text is aligned to where it's shown ("end" for a right-aligned total) */
  align?: "start" | "center" | "end";
  /** Roll in from this text when it first appears ("0" makes a count roll up as it arrives) */
  from?: string | number;
  className?: string;
}

const ALIGN = { start: "justify-items-start", center: "justify-items-center", end: "justify-items-end" } as const;

// Shows a value like a counter wheel, as in the Motion Guide: when it changes, the old text rolls out
// of its line (70 ms), then the new one rolls in (130 ms), up when the number grows and down when it
// shrinks. Both stay inside the text's own line, in the same place. The new text is in the page
// straight away. With reduced motion it simply changes.
export function RollingNumber({ value, align = "start", from, className }: RollingNumberProps) {
  const text = String(value);
  const reduced = usePrefersReducedMotion();
  const [current, setCurrent] = useState(from === undefined ? text : String(from));
  const [rolls, setRolls] = useState(0); // how many times the value changed: restarts the roll-in
  const [leaving, setLeaving] = useState<string | null>(null);
  const [direction, setDirection] = useState<RollDirection>("up");

  // The value changed since the last render: remember the old text so it can roll out
  if (text !== current) {
    setCurrent(text);
    if (!reduced) {
      setRolls(rolls + 1);
      setLeaving(current);
      setDirection(rollDirection(current, text));
    }
  }

  const style = { "--roll": direction === "up" ? 1 : -1 } as CSSProperties;
  return (
    // One grid cell holds both texts, aligned to the same edge; the clip is the counter's window, the
    // height of the line (wider than the text, so nothing is cut at the sides)
    <span className={cn("inline-grid whitespace-nowrap [clip-path:inset(0_-0.5em)]", ALIGN[align], className)} style={style}>
      <span key={rolls} className={cn("[grid-area:1/1]", rolls > 0 && "roll-in")}>
        {text}
      </span>
      {leaving !== null && (
        <span key={`leaving-${rolls}`} className="roll-out pointer-events-none [grid-area:1/1]" aria-hidden="true" onAnimationEnd={() => setLeaving(null)}>
          {leaving}
        </span>
      )}
    </span>
  );
}
