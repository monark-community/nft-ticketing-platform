"use client";

import { AnimatePresence, useIsPresent, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useState, type CSSProperties, type ReactNode } from "react";

import { MOTION, printDelay } from "@/lib/motion";
import { cn } from "@/lib/utils";

const ARRIVE = [0.2, 0.8, 0.2, 1] as const;
// Picked up and put down: slow to start and to stop, for the cards that lift while they slide
const LIFT = [0.4, 0, 0.2, 1] as const;

type Arrival = "print" | "rise" | "none";

interface ShuffleGridProps<T> {
  items: T[];
  itemKey: (item: T) => string;
  /** From the list's hook: which list is on screen (a new load, or more pages of the same one) */
  batch: { load: number; page: number };
  /** The grid replaces loading placeholders: its first items print in */
  print: boolean;
  /** A filter change is loading: the items stay until the new ones arrive */
  updating?: boolean;
  /** How long staying items take to slide to their new place, in ms */
  slideMs?: number;
  /** Items rise slightly, with a shadow, while they slide, as if picked up and put down (the Marketplace, #368) */
  lift?: boolean;
  className?: string;
  /** One item. `print` and `order` say whether it prints in, and its place in the printed batch. */
  children: (item: T, arrival: { print: boolean; order: number }) => ReactNode;
}

// A grid of cards that arrive and move like tickets (#366, #368). Items that replace the loading
// placeholders, and the ones "Load more" adds, print in one after another (the item renders the
// print, see `children`). When a filter changes the list, items that no longer match shrink away
// (200 ms); then the ones that stay slide to their new place (300 ms) and new ones rise in (300 ms),
// 80 ms apart like the print. Items that stay wait for the others to leave, so none slides over
// them. With reduced motion everything changes at once.
export function ShuffleGrid<T>({ items, itemKey, batch, print, updating = false, slideMs = MOTION.slow, lift = false, className, children }: ShuffleGridProps<T>) {
  const reduced = useReducedMotion();
  // How the items appearing now arrived, and the index the newest batch starts at
  const keys = items.map(itemKey);
  const [arrival, setArrival] = useState(() => ({ ...batch, count: items.length, kind: (print ? "print" : "none") as Arrival, from: 0, keys, leaving: false }));
  if (arrival.load !== batch.load || arrival.page !== batch.page) {
    const more = arrival.load === batch.load && batch.page > arrival.page;
    // Some items on screen don't match any more: the rest wait while they leave
    const leaving = !more && arrival.keys.some((key) => !keys.includes(key));
    setArrival({ ...batch, count: items.length, kind: more ? "print" : "rise", from: more ? arrival.count : 0, keys, leaving });
  } else if (arrival.keys.join() !== keys.join()) {
    // The same list, changed on the page (a listing you cancelled or bought): the same wait
    setArrival({ ...arrival, keys, leaving: arrival.keys.some((key) => !keys.includes(key)) });
  }
  const wait = arrival.leaving ? MOTION.base : 0;

  return (
    <ul className={className} aria-busy={updating || undefined}>
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((item, index) => {
          // Only read when the item first appears
          const order = Math.max(0, index - arrival.from);
          const rise = arrival.kind === "rise" && !reduced;
          return (
            <ShuffleItem
              key={itemKey(item)}
              reduced={Boolean(reduced)}
              rise={rise}
              order={order}
              wait={wait}
              slideMs={slideMs}
              lift={lift}
            >
              {children(item, { print: arrival.kind === "print", order })}
            </ShuffleItem>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

interface ShuffleItemProps {
  reduced: boolean;
  rise: boolean;
  order: number;
  wait: number; // ms before staying items move and new ones start rising
  slideMs: number;
  lift: boolean;
  children: ReactNode;
  ref?: React.Ref<HTMLLIElement>; // AnimatePresence measures the item when it leaves
}

function ShuffleItem({ reduced, rise, order, wait, slideMs, lift, children, ref }: ShuffleItemProps) {
  const [moving, setMoving] = useState(false);
  const leaving = !useIsPresent(); // shrinking away: it doesn't lift
  // Lifting: the item rises 3% with a shadow on its way and settles as it lands (shuffle-lift),
  // over the same time as the slide, which starts after the wait
  const liftTiming = { "--slide-ms": `${slideMs}ms`, "--slide-wait": `${wait}ms` } as CSSProperties;
  return (
    <m.li
      ref={ref}
      layout={!reduced}
      data-moving={lift && moving && !leaving ? "" : undefined}
      className={cn("flex", lift && "relative data-[moving]:z-10 data-[moving]:animate-[shuffle-lift_var(--slide-ms)_cubic-bezier(0.4,0,0.2,1)_var(--slide-wait)]")}
      style={lift ? liftTiming : undefined}
      initial={rise ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? undefined : { opacity: 0, scale: 0.95, transition: { duration: MOTION.base / 1000, ease: "easeIn" } }}
      transition={{
        layout: { duration: slideMs / 1000, delay: wait / 1000, ease: lift ? LIFT : ARRIVE },
        // New items come once the ones leaving are gone, one after another
        default: { duration: MOTION.slow / 1000, delay: rise ? (wait + printDelay(order)) / 1000 : 0, ease: ARRIVE },
      }}
      onLayoutAnimationStart={lift ? () => setMoving(true) : undefined}
      onLayoutAnimationComplete={lift ? () => setMoving(false) : undefined}
    >
      {children}
    </m.li>
  );
}
