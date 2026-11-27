"use client";

import { useRef, type ComponentProps } from "react";

import { useFoldAway } from "@/components/motion/useFoldAway";

// A block that folds up when it's taken off the page (useFoldAway, 120 ms like the notices), so
// what's under it moves up instead of jumping. Show and hide it with a condition, such as a
// transaction's receipt that has been cleared (#374). Other props, like event handlers, go on the block.
export function FoldAway({ children, ...props }: Omit<ComponentProps<"div">, "ref" | "className">) {
  const ref = useRef<HTMLDivElement>(null);
  useFoldAway(ref);

  return (
    <div {...props} ref={ref} className="grid grid-rows-[1fr]">
      {/* Not clipped while it's shown, so the receipt can shake; its folding copy is (globals.css) */}
      <div className="min-h-0">{children}</div>
    </div>
  );
}
