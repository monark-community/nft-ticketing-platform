"use client";

import { CalendarClock, ChevronDown, Clock, Info } from "lucide-react";
import { useId, useState } from "react";

import type { ApiEvent } from "@/lib/event-details";
import { aboutPreview, formatDuration, formatEventTime } from "@/lib/event-details";
import { cn } from "@/lib/utils";

// "About this event" as a row at the bottom of the hero card that opens in place: the full
// description, the event's length and its start time. Monark asked for a dropdown instead of the
// Figma's popup (Nov 2 meeting). Closed, the row shows the description's first line.
export function AboutEvent({ event }: { event: ApiEvent }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const preview = aboutPreview(event.description);
  const duration = formatDuration(event.start_date, event.end_date);

  return (
    <div className="border-t border-border">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-4 px-5 py-4 text-left outline-none transition-colors hover:bg-popover/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:items-center md:gap-4">
            <span className="flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground">
              <Info className="size-4 text-primary" aria-hidden="true" />
              About this event
            </span>
            {/* Only a teaser: the full text is in the panel, so screen readers skip it here */}
            {!open && (
              <span className="truncate text-sm font-normal text-muted-foreground" aria-hidden="true">
                {preview}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-normal text-muted-foreground">
            {open ? "Show less" : "Read more"}
            <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
          </span>
        </button>
      </h2>

      {/* Animates between 0 and its own height; inert keeps the closed panel out of tab order and screen readers */}
      <div
        id={panelId}
        inert={!open}
        className={cn("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-5 px-5 pt-1 pb-6 md:max-w-[880px]">
            <p className="type-body-md whitespace-pre-line text-secondary-foreground">
              {event.description?.trim() || "The organizer hasn't added a description yet."}
            </p>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {duration && <InfoTile icon={Clock} label="Event length" value={`Duration: ${duration}`} />}
              <InfoTile icon={CalendarClock} label="Start time" value={formatEventTime(event.start_date)} />
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-popover p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border-accent bg-primary-tint text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div>
        <dt className="type-label-sm text-muted-foreground">{label}</dt>
        <dd className="type-body-md-strong text-foreground">{value}</dd>
      </div>
    </div>
  );
}
