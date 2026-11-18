"use client";

import { useEffect, useState, type CSSProperties } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { flapCells, motionDuration, type FlapCell } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface FlapTextProps {
  text: string;
  /** Flip in from this text when it first appears ("" flips every character in) */
  from?: string;
  /** ms between two flipping characters, so they go one after another. 0: all together. */
  stagger?: number;
  className?: string;
}

interface Flip {
  cells: FlapCell[];
  id: number;
}

const FLIP_MS = 200; // one character: 80 ms out, 120 ms in (flap-out and flap-in in globals.css)

// Changes text like a departure board: only the characters that changed flip over. Meant for text
// in the mono font (prices, counts), where every character is as wide as the next. While nothing is
// flipping, it is plain text.
export function FlapText({ text, from, stagger = 0, className }: FlapTextProps) {
  const [current, setCurrent] = useState(text);
  const [flip, setFlip] = useState<Flip | null>(() => (from !== undefined && from !== text ? { cells: flapCells(from, text), id: 1 } : null));

  // The text changed since the last render: flip from the old one
  if (text !== current) {
    setCurrent(text);
    setFlip({ cells: flapCells(current, text), id: (flip?.id ?? 0) + 1 });
  }

  // Back to plain text once the last character has landed. A timer, not animationend: a flip that
  // starts in the server-rendered page can be over before React is listening.
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (!flip) return;
    const flipping = flip.cells.filter((cell) => cell.changed).length;
    const timer = setTimeout(() => setFlip(null), motionDuration(FLIP_MS + Math.max(0, flipping - 1) * stagger, reduced));
    return () => clearTimeout(timer);
  }, [flip, stagger, reduced]);

  if (!flip) return <span className={className}>{text}</span>;

  let order = 0;
  return (
    <span key={flip.id} className={cn("whitespace-pre", className)}>
      {flip.cells.map((cell, i) => {
        if (!cell.changed) return cell.char;
        const style = { "--flap-delay": `${order++ * stagger}ms` } as CSSProperties;
        return (
          <span key={i} className="relative inline-block" style={style}>
            {cell.was && (
              <span className="flap-out pointer-events-none absolute top-0 left-0" aria-hidden="true">
                {cell.was}
              </span>
            )}
            <span className="flap-in inline-block">{cell.char}</span>
          </span>
        );
      })}
    </span>
  );
}
