"use client";

import { useState } from "react";

import { EventCard } from "@/components/events/EventCard";
import { PrintIn } from "@/components/motion/PrintIn";
import { ShuffleGrid } from "@/components/motion/ShuffleGrid";
import type { EventSummary } from "@/lib/events";
import { printDelay } from "@/lib/motion";

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
// (200 ms), the ones that stay slide to their new place (300 ms) and new ones rise in (300 ms),
// 80 ms apart like the print.
export function EventGrid({ events, batch, print, updating = false }: EventGridProps) {
  return (
    <ShuffleGrid
      items={events}
      itemKey={(event) => event.id}
      batch={batch}
      print={print}
      updating={updating}
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      {(event, arrival) => <PrintedCard event={event} print={arrival.print} order={arrival.order} />}
    </ShuffleGrid>
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
