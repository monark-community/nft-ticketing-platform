"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { animate, finished, MOTION, prefersReducedMotion, TEAR_BOTTOM, TEAR_TOP } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface TearOffProps {
  children: ReactNode;
  /** Set to true to tear the block off */
  torn: boolean;
  /** Called once the pieces are gone and the gap has closed: remove the item from the list here */
  onTorn?: () => void;
  className?: string;
}

// The space starts closing this long after the block tears
const CLOSE_AFTER_MS = 60;

// Removes an item like a ticket torn in two: it splits along a jagged line and both halves fall away
// (200 ms) while the space it took closes (300 ms, from 60 ms in), with the gap after it in a column.
// With reduced motion, onTorn is called at once.
export function TearOff({ children, torn, onTorn, className }: TearOffProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onTornRef = useRef(onTorn);
  useEffect(() => {
    onTornRef.current = onTorn;
  });

  useEffect(() => {
    const host = hostRef.current;
    const content = host?.firstElementChild as HTMLElement | null | undefined;
    if (!torn || !host || !content) return;

    let cancelled = false;
    const pieces: HTMLElement[] = [];

    (async () => {
      if (!prefersReducedMotion() && typeof host.animate === "function") {
        // Two copies of the block, each showing one side of the tear, drawn over the real one
        for (const clipPath of [TEAR_TOP, TEAR_BOTTOM]) {
          const piece = content.cloneNode(true) as HTMLElement;
          piece.removeAttribute("id");
          piece.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
          piece.setAttribute("aria-hidden", "true");
          piece.inert = true;
          piece.classList.add("tear-piece");
          piece.style.clipPath = clipPath;
          // As tall as the block, also while its space closes under the falling halves
          piece.style.bottom = "auto";
          piece.style.height = `${host.offsetHeight}px`;
          host.append(piece);
          pieces.push(piece);
        }
        content.style.visibility = "hidden";

        const fall = { duration: 200, easing: "ease-in", fill: "forwards" } as const;
        animate(pieces[0], [{ transform: "none", opacity: 1 }, { transform: "translate(-8px, -6px) rotate(-2.5deg)", opacity: 0 }], fall);
        const falling = finished(animate(pieces[1], [{ transform: "none", opacity: 1 }, { transform: "translate(8px, 14px) rotate(2.5deg)", opacity: 0 }], fall));

        // The space closes while they fall. In a column, the gap after it closes too, so nothing
        // jumps when the item is removed.
        await new Promise((resolve) => setTimeout(resolve, CLOSE_AFTER_MS));
        if (cancelled) return;
        const column = host.parentElement ? getComputedStyle(host.parentElement) : null;
        const gap = column && column.display.includes("flex") && column.flexDirection.startsWith("column") ? parseFloat(column.rowGap) || 0 : 0;
        const closing = animate(host, [{ height: `${host.offsetHeight}px`, marginTop: "0px" }, { height: "0px", marginTop: `${-gap}px` }], { duration: MOTION.slow, fill: "forwards" });
        await Promise.all([falling, finished(closing)]);
        if (cancelled) return;
      }
      onTornRef.current?.();
    })();

    return () => {
      // Torn was switched back, or the item is gone: put everything back as it was
      cancelled = true;
      pieces.forEach((piece) => piece.remove());
      host.getAnimations?.().forEach((animation) => animation.cancel());
      content.style.visibility = "";
    };
  }, [torn]);

  return (
    <div ref={hostRef} className={cn("relative", className)}>
      <div>{children}</div>
    </div>
  );
}
