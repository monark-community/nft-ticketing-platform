"use client";

import { useLayoutEffect, type RefObject } from "react";

import { prefersReducedMotion } from "@/lib/motion";


// When the element is removed from the page, a lifeless copy of it folds up in its place (120 ms by default),
// so the page closes the gap instead of jumping (#364). Nothing changes where the element is
// used: showing and hiding it with a condition is enough. The element must lay out as a grid with
// one row and one child that has min-h-0 and overflow-hidden (like the Alert).
export function useFoldAway(ref: RefObject<HTMLElement | null>, durationMs = 120) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    return () => {
      if (prefersReducedMotion() || typeof node.animate !== "function") return;
      const parent = node.parentNode;
      const next = node.nextSibling;
      if (!parent) return;
      const height = node.getBoundingClientRect().height;
      const style = getComputedStyle(node);
      const parentStyle = parent instanceof Element ? getComputedStyle(parent) : null;
      // In a column with a gap, the gap goes too, so the last frame doesn't jump
      const column = parentStyle && ((parentStyle.display.includes("flex") && parentStyle.flexDirection.startsWith("column")) || parentStyle.display.includes("grid"));
      const gap = column ? parseFloat(parentStyle.rowGap) || 0 : 0;
      const marginTop = parseFloat(style.marginTop) || 0;
      const marginBottom = parseFloat(style.marginBottom) || 0;
      const copy = node.cloneNode(true) as HTMLElement;

      // React removes the element right after this. Only then is it known that the element itself
      // went away, and not the whole page or section around it.
      queueMicrotask(() => {
        if (node.isConnected || !parent.isConnected || height === 0) return;
        copy.classList.add("folding-away");
        copy.setAttribute("aria-hidden", "true");
        copy.removeAttribute("role");
        copy.removeAttribute("id");
        copy.inert = true;
        copy.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
        parent.insertBefore(copy, next && next.parentNode === parent ? next : null);
        const fold = copy.animate(
          [
            { gridTemplateRows: "1fr", opacity: 1, marginTop: `${marginTop}px`, marginBottom: `${marginBottom}px` },
            { gridTemplateRows: "0fr", opacity: 0, marginTop: `${marginTop - gap}px`, marginBottom: "0px" },
          ],
          { duration: durationMs, easing: "ease-in", fill: "forwards" },
        );
        const remove = () => copy.remove();
        fold.finished.then(remove, remove);
      });
    };
  }, [ref, durationMs]);
}
