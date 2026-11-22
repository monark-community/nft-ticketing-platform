"use client";

import { useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { countUpValue, motionDuration } from "@/lib/motion";

interface CountUpProps {
  value: number;
  /** Turns the number into text, for example (n) => n.toFixed(2). Whole numbers by default. */
  format?: (value: number) => string;
  /** How long the count takes, in ms */
  ms?: number;
  /** Start counting from this number when it first appears. Without it, it appears on its value. */
  from?: number;
  /** Wait before counting, in ms: lets a card print in first */
  delay?: number;
  className?: string;
}

const wholeNumber = (value: number) => Math.round(value).toString();

// Counts from the old number to the new one (prices, sold counts), fast at first, then settling.
export function CountUp({ value, format = wholeNumber, ms = 400, from, delay = 0, className }: CountUpProps) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(from ?? value);
  const shownRef = useRef(shown);

  useEffect(() => {
    const start = shownRef.current;
    if (start === value) return;
    const duration = motionDuration(ms, reduced);
    const wait = reduced ? 0 : delay;
    let frame = 0;
    const timer = setTimeout(() => {
      const began = performance.now();
      frame = requestAnimationFrame(function step(now) {
        const next = countUpValue(start, value, (now - began) / duration);
        shownRef.current = next;
        setShown(next);
        if (next !== value) frame = requestAnimationFrame(step);
      });
    }, wait);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [value, ms, delay, reduced]);

  // With reduced motion the value shows at once, without waiting for the next frame
  return <span className={className}>{format(reduced ? value : shown)}</span>;
}
