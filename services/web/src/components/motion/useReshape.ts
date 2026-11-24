"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

import { MOTION, prefersReducedMotion } from "@/lib/motion";

// When `shape` changes, the new content fades in (300 ms) and the element grows or shrinks from its
// old height to its new one (300 ms by default) instead of jumping (#370). Use it on a card whose content
// is swapped for another state, with the state's name as `shape`.
export function useReshape(ref: RefObject<HTMLElement | null>, shape: string, durationMs: number = MOTION.slow) {
  // The element's height as last drawn, kept up to date while nothing reshapes
  const height = useRef<number | null>(null);
  const shown = useRef(shape);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    height.current = node.offsetHeight;
    const observer = new ResizeObserver(() => {
      if (!node.getAnimations().some((a) => a.id === "reshape")) height.current = node.offsetHeight;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  useLayoutEffect(() => {
    const node = ref.current;
    if (shown.current === shape) return;
    shown.current = shape;
    const from = height.current;
    if (!node || from === null || prefersReducedMotion() || typeof node.animate !== "function") return;
    for (const child of Array.from(node.children)) {
      child.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.slow, delay: 60, easing: "ease-out", fill: "backwards" });
    }
    const to = node.offsetHeight;
    if (from === to) return;
    const overflow = node.style.overflow;
    node.style.overflow = "hidden";
    const grow = node.animate([{ height: `${from}px` }, { height: `${to}px` }], { id: "reshape", duration: durationMs, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
    const done = () => {
      node.style.overflow = overflow;
      height.current = node.offsetHeight;
    };
    grow.finished.then(done, done);
  }, [ref, shape, durationMs]);
}
