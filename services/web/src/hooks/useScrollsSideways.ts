"use client";

import { useCallback, useEffect, useState } from "react";

// Whether a box is narrower than what's inside it, so it scrolls sideways (#420). Give the box
// `ref={setBox}`. Follows the box and its content as they resize (a phone turned round, rows loading).
export function useScrollsSideways<T extends HTMLElement>(): [setBox: (node: T | null) => void, scrolls: boolean] {
  const [node, setNode] = useState<T | null>(null);
  const [scrolls, setScrolls] = useState(false);

  useEffect(() => {
    if (!node) return;
    const measure = () => setScrolls(node.scrollWidth > node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const child of Array.from(node.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [node]);

  const setBox = useCallback((value: T | null) => setNode(value), []);
  return [setBox, scrolls];
}
