"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { animate, MOTION, rowChanges, withLeavingRows, type LeftRow } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Arrival = "open" | "print";
type Change = "fold" | "shuffle";

interface MotionRowsProps<T> {
  items: T[];
  itemKey: (item: T) => string;
  /** How rows added later appear: they open (default), or open and print like a receipt line */
  arrive?: Arrival;
  /**
   * How the rows change when the list does. "fold" (default): rows that left fold away where they
   * were. "shuffle", for search and filters, like the Motion Guide's: rows that left go at once,
   * the rows that stay slide to their new place and new ones open in.
   */
  change?: Change;
  rowClassName?: string;
  /** More class and style for one row, such as its print when the table replaces its placeholders (#365) */
  rowProps?: (item: T) => { className?: string; style?: CSSProperties } | undefined;
  /** Rows that arrive even when the table itself just appeared (the first decision in an empty table) */
  arriving?: string[];
  /** One row's cells. `opening` is true while a newly added row opens. */
  children: (item: T, row: { opening: boolean }) => ReactNode;
}

// Table rows that change like the rest of the motion work (#374). By default, when the list
// changes, rows that left fold away (200 ms) where they were, new ones open in (300 ms), and the rows
// that stay move with them. With change="shuffle" (search and filters), rows that left go at once,
// the rows that stay slide from where they were to their new place (300 ms) and new ones open in
// (300 ms, from 60 ms), like the Motion Guide's shuffle. The first rows show at once. With reduced
// motion every change is instant. Each cell's content goes in a RowCell.
export function MotionRows<T>({ items, itemKey, arrive = "open", change = "fold", rowClassName, rowProps, arriving, children }: MotionRowsProps<T>) {
  const reduced = useReducedMotion();
  const [seen, setSeen] = useState(items);
  const [leaving, setLeaving] = useState<Array<LeftRow & { item: T }>>([]);
  const [opening, setOpening] = useState<string[]>(() => (reduced ? [] : (arriving ?? []).filter((key) => items.some((item) => itemKey(item) === key))));
  // The latest shuffle: the rows it added, once it reaches the page
  const [shuffle, setShuffle] = useState<{ added: string[] } | null>(null);

  if (items !== seen) {
    const keys = items.map(itemKey);
    if (!reduced) {
      const { gone, added } = rowChanges(seen.map(itemKey), keys);
      if (change === "shuffle") {
        setShuffle({ added });
      } else {
        const goneRows = gone.map((row) => ({ ...row, item: seen[row.index] }));
        setLeaving([...leaving.filter((row) => !keys.includes(row.key) && !gone.some((g) => g.key === row.key)), ...goneRows]);
      }
      setOpening([...opening.filter((key) => keys.includes(key)), ...added]);
    }
    setSeen(items);
  }

  // Each row's place in the table after the last change, so a shuffle can slide them from there.
  // A transform doesn't change offsetTop, so a row that is still sliding counts from where it lands.
  const rowEls = useRef(new Map<string, HTMLTableRowElement>());
  const placed = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    if (!shuffle) return;
    for (const [key, row] of rowEls.current) {
      const from = placed.current.get(key);
      if (shuffle.added.includes(key)) {
        const open = animate(row, [{ opacity: 0, transform: "scaleY(0.6)", transformOrigin: "top" }, { opacity: 1, transform: "none", transformOrigin: "top" }], { duration: MOTION.slow, delay: 60, fill: "backwards" });
        const done = () => setOpening((keys) => keys.filter((k) => k !== key));
        if (open) open.finished.then(done, done);
        else done();
      } else if (from !== undefined && Math.abs(from - row.offsetTop) > 1) {
        animate(row, [{ transform: `translateY(${from - row.offsetTop}px)` }, { transform: "none" }], { duration: MOTION.slow });
      }
    }
  }, [shuffle]);
  // Declared after the shuffle above, so it reads the places from before the change
  useLayoutEffect(() => {
    placed.current = new Map([...rowEls.current].map(([key, row]) => [key, row.offsetTop]));
  });
  // Rows can wrap differently when the window is resized
  useEffect(() => {
    const measure = () => (placed.current = new Map([...rowEls.current].map(([key, row]) => [key, row.offsetTop])));
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Leaving rows stay where they were, below the row they followed
  const byKey = new Map<string, { item: T; state?: "folding" | "opening" | "printing" | "arriving" }>();
  for (const item of items) {
    const key = itemKey(item);
    // A shuffle opens its new rows itself (above), so they don't take the CSS opening
    const added = change === "shuffle" ? "arriving" : arrive === "print" ? "printing" : "opening";
    byKey.set(key, { item, state: opening.includes(key) ? added : undefined });
  }
  for (const row of leaving) if (!byKey.has(row.key)) byKey.set(row.key, { item: row.item, state: "folding" });
  const rows = withLeavingRows(items.map(itemKey), leaving).map((key) => ({ key, ...byKey.get(key)! }));

  return rows.map(({ item, key, state }) => {
    const extra = rowProps?.(item);
    return (
    <tr
      key={key}
      ref={(row) => {
        if (row) rowEls.current.set(key, row);
        else rowEls.current.delete(key);
      }}
      className={cn(rowClassName, extra?.className)}
      style={extra?.style}
      data-row={state}
      inert={state === "folding" || undefined}
      onAnimationEnd={
        state && state !== "arriving"
          ? (event) => {
              // Every cell ends together: follow the first one (its content, for the print)
              const cell = event.currentTarget.firstElementChild;
              if (state === "folding") {
                if (event.target === cell && event.animationName === "cell-fold") setLeaving((rows) => rows.filter((r) => r.key !== key));
              } else if (state === "printing" ? event.target === cell?.firstElementChild?.firstElementChild && event.animationName === "print-in" : event.target === cell && event.animationName === "cell-open") {
                setOpening((keys) => keys.filter((k) => k !== key));
              }
            }
          : undefined
      }
    >
      {children(item, { opening: state === "opening" || state === "printing" || state === "arriving" })}
    </tr>
    );
  });
}

// A cell's content in MotionRows: a one-row grid, so the row can close up or open. Every cell of a
// MotionRows row has one, as its only child.
export function RowCell({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-rows-[1fr]">
      <div className="min-h-0">{children}</div>
    </div>
  );
}
