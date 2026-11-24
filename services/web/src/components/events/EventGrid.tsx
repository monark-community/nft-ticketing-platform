"use client";

import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useState } from "react";

import { EventCard } from "@/components/events/EventCard";
import { PrintIn } from "@/components/motion/PrintIn";
import type { EventSummary } from "@/lib/events";
import { MOTION, printDelay } from "@/lib/motion";

const ARRIVE = [0.2, 0.8, 0.2, 1] as const;

type Arrival = "print" | "rise" | "none";

interface EventGridProps {
  events: EventSummary[];
  /** From useEvents: which list is on screen (a new load, or more pages of the same one) */
  batch: { load: number; page: number };
  /** The grid replaces the loading placeholders: its first cards print in */
  print: boolean;
  /** A search or category change is loading: the cards stay until the new ones arrive */
  updating?: boolean;
}

// The events grid (#366). Cards that replace the loading placeholders, and the ones "Load more"
// adds, print in from top to bottom behind a bright edge (400 ms, 80 ms apart) while their price
// counts up. When a search or category changes the list, cards that no longer match shrink away
// (200 ms); then the ones that stay slide to their new place (300 ms) and new ones rise in (300 ms),
// 80 ms apart like the print. Cards that stay wait for the others to leave, so none slides over them.
export function EventGrid({ events, batch, print, updating = false }: EventGridProps) {
  const reduced = useReducedMotion();
  // How the cards appearing now arrived, and the index the newest batch starts at
  const ids = events.map((event) => event.id);
  const [arrival, setArrival] = useState(() => ({ ...batch, count: events.length, kind: (print ? "print" : "none") as Arrival, from: 0, ids, leaving: false }));
  if (arrival.load !== batch.load || arrival.page !== batch.page) {
    const more = arrival.load === batch.load && batch.page > arrival.page;
    // Some cards on screen don't match any more: the rest wait while they leave
    const leaving = !more && arrival.ids.some((id) => !ids.includes(id));
    setArrival({ ...batch, count: events.length, kind: more ? "print" : "rise", from: more ? arrival.count : 0, ids, leaving });
  } else if (arrival.ids.join() !== ids.join()) {
    setArrival({ ...arrival, ids });
  }
  const wait = arrival.leaving ? MOTION.base : 0;

  return (
    <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy={updating || undefined}>
      <AnimatePresence initial={false} mode="popLayout">
        {events.map((event, index) => {
          // Only read when the card first appears
          const order = Math.max(0, index - arrival.from);
          const rise = arrival.kind === "rise" && !reduced;
          return (
            <m.li
              key={event.id}
              layout={!reduced}
              className="flex"
              initial={rise ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? undefined : { opacity: 0, scale: 0.95, transition: { duration: MOTION.base / 1000, ease: "easeIn" } }}
              transition={{
                layout: { duration: MOTION.slow / 1000, delay: wait / 1000, ease: ARRIVE },
                // New cards come once the ones leaving are gone, one after another
                default: { duration: MOTION.slow / 1000, delay: rise ? (wait + printDelay(order)) / 1000 : 0, ease: ARRIVE },
              }}
            >
              <PrintedCard event={event} print={arrival.kind === "print"} order={order} />
            </m.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

// A card that prints in when it appears with `print`, its price counting up while it does
function PrintedCard({ event, print, order }: { event: EventSummary; print: boolean; order: number }) {
  const [printing] = useState(print);
  const delay = printDelay(order);
  return (
    <PrintIn play={printing} delay={delay} className="w-full">
      <EventCard event={event} countFrom={printing ? 0 : undefined} countDelay={delay + 120} />
    </PrintIn>
  );
}
