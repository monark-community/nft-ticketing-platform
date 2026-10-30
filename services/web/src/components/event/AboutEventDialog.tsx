"use client";

import { Dialog } from "@base-ui/react/dialog";
import { CalendarClock, Clock, Info, X } from "lucide-react";

import { EventImage } from "@/components/event/EventImage";
import type { ApiEvent } from "@/lib/event-details";
import { formatDuration, formatEventTime } from "@/lib/event-details";

// "About this event" pill on the hero and the dialog it opens (Figma: Event detail / About open).
export function AboutEventDialog({ event }: { event: ApiEvent }) {
  const duration = formatDuration(event.start_date, event.end_date);

  return (
    <Dialog.Root>
      <Dialog.Trigger className="flex items-center gap-1.5 rounded-full border border-border bg-black/60 px-[13px] py-[7px] text-xs text-foreground backdrop-blur-md transition-colors outline-none hover:border-border-accent focus-visible:ring-3 focus-visible:ring-ring/50">
        <Info className="size-3" aria-hidden="true" />
        About this event
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[720px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-primary/70 bg-card shadow-[0_0_40px_var(--primary-tint)] outline-none transition-[opacity,scale] duration-200 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          <div className="relative h-44 overflow-hidden md:h-52">
            <EventImage src={event.image_url} />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-black/40" aria-hidden="true" />
            <Dialog.Close
              className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full border border-border bg-black/60 text-foreground backdrop-blur-md outline-none hover:border-border-accent focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="Close"
            >
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
            <div className="absolute inset-x-6 bottom-5 flex flex-col gap-1">
              {event.category && <p className="type-label-md text-primary">{event.category}</p>}
              <Dialog.Title className="type-heading-md text-foreground md:type-heading-lg">{event.title}</Dialog.Title>
            </div>
          </div>

          <div className="flex flex-col gap-6 p-6">
            <Dialog.Description className="type-body-md whitespace-pre-line text-secondary-foreground">
              {event.description || "The organizer hasn't added a description yet."}
            </Dialog.Description>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {duration && <InfoTile icon={Clock} label="Event length" value={`Duration: ${duration}`} />}
              <InfoTile icon={CalendarClock} label="Start time" value={formatEventTime(event.start_date)} />
            </dl>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
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
