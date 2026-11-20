"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { animate, finished, prefersReducedMotion, TEAR_BOTTOM, TEAR_TOP } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface TearOffProps {
  children: ReactNode;
  /** Set to true to tear the block off */
  torn: boolean;
  /** Called once the pieces are gone and the gap has closed: remove the item from the list here */
  onTorn?: () => void;
  className?: string;
}

// Removes an item like a ticket torn in two: it splits along a jagged line, both halves fall away
// (200 ms), then the space it took closes (160 ms). With reduced motion, onTorn is called at once.
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
          host.append(piece);
          pieces.push(piece);
        }
        content.style.visibility = "hidden";

        const fall = { duration: 200, easing: "ease-in", fill: "forwards" } as const;
        animate(pieces[0], [{ transform: "none", opacity: 1 }, { transform: "translate(-8px, -6px) rotate(-2.5deg)", opacity: 0 }], fall);
        await finished(animate(pieces[1], [{ transform: "none", opacity: 1 }, { transform: "translate(8px, 14px) rotate(2.5deg)", opacity: 0 }], fall));
        if (cancelled) return;

        host.style.overflow = "hidden";
        await finished(animate(host, [{ height: `${host.offsetHeight}px` }, { height: "0px" }], { duration: 160, easing: "ease-in", fill: "forwards" }));
        if (cancelled) return;
      }
      onTornRef.current?.();
    })();

    return () => {
      // Torn was switched back, or the item is gone: put everything back as it was
      cancelled = true;
      pieces.forEach((piece) => piece.remove());
      host.getAnimations?.().forEach((animation) => animation.cancel());
      host.style.overflow = "";
      content.style.visibility = "";
    };
  }, [torn]);

  return (
    <div ref={hostRef} className={cn("relative", className)}>
      <div>{children}</div>
    </div>
  );
}
