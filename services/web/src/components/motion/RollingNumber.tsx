"use client";

import { useState, type CSSProperties } from "react";

import { rollDirection, type RollDirection } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface RollingNumberProps {
  /** The text to show, already formatted ("3", "36.00", "Showing 2 of 6") */
  value: string | number;
  className?: string;
}

// Shows a value like a counter wheel: when it changes, the old text rolls out and the new one rolls
// in, up when the number grows and down when it shrinks. The new text is in the page straight away.
export function RollingNumber({ value, className }: RollingNumberProps) {
  const text = String(value);
  const [current, setCurrent] = useState(text);
  const [rolls, setRolls] = useState(0); // how many times the value changed: restarts the roll-in
  const [leaving, setLeaving] = useState<string | null>(null);
  const [direction, setDirection] = useState<RollDirection>("up");

  // The value changed since the last render: remember the old text so it can roll out
  if (text !== current) {
    setCurrent(text);
    setRolls(rolls + 1);
    setLeaving(current);
    setDirection(rollDirection(current, text));
  }

  const style = { "--roll": direction === "up" ? 1 : -1 } as CSSProperties;
  return (
    <span className={cn("relative inline-block whitespace-nowrap", className)} style={style}>
      <span key={rolls} className={cn("inline-block", rolls > 0 && "roll-in")}>
        {text}
      </span>
      {leaving !== null && (
        <span key={`leaving-${rolls}`} className="roll-out pointer-events-none absolute top-0 left-0" aria-hidden="true" onAnimationEnd={() => setLeaving(null)}>
          {leaving}
        </span>
      )}
    </span>
  );
}
