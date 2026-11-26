"use client";

import { CalendarDays, CalendarX2, Camera, ChevronDown, Lock, QrCode, ScanLine, Volume2, VolumeX } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import type { ApiEvent } from "@/lib/event-details";
import { shortAddress } from "@/lib/format";
import { animate, EASE } from "@/lib/motion";
import { scannerEventLabel, type FrameInsets } from "@/lib/scanner";
import { cn } from "@/lib/utils";

// Compact header for the door: logo and the scanner wallet, no navigation (Figma "Scanner Page")
export function ScannerHeader({ address }: { address?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-md items-center justify-between px-4">
        <Logo />
        {address && (
          <span className="flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            <span className="type-mono-address text-foreground">{shortAddress(address)}</span>
          </span>
        )}
      </div>
    </header>
  );
}

// "Event you're scanning for". A native select, so phones open their own picker.
export function EventPicker({
  events,
  value,
  loading,
  onChange,
}: {
  events: ApiEvent[];
  value: string | null;
  loading: boolean;
  onChange: (contractEventId: string) => void;
}) {
  const empty = !loading && events.length === 0;
  const Icon = empty ? CalendarX2 : CalendarDays;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="scanner-event" className="type-body-md text-secondary-foreground">
        Event you&apos;re scanning for
      </label>
      <div className="relative">
        <Icon className={cn("pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2", empty ? "text-muted-foreground" : "text-primary")} aria-hidden="true" />
        <select
          id="scanner-event"
          value={value ?? ""}
          disabled={loading || empty}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-full appearance-none truncate rounded-md border border-border bg-card pr-10 pl-11 type-body-md text-foreground outline-none transition-colors focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:text-muted-foreground"
        >
          {loading && <option value="">Loading events...</option>}
          {empty && <option value="">No events</option>}
          {events.map((event) => (
            <option key={event.id} value={event.contract_event_id ?? ""}>
              {scannerEventLabel(event)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      </div>
    </div>
  );
}

/** The corners' place around a found code, and where the sweeping line was and goes (px from the top) */
export interface CameraLock extends FrameInsets {
  lineFrom: number;
  lineTo: number;
}

// Each corner starts 24 px inside the box (top-6 and so on); it moves by this much to frame the code
const CORNERS: { place: string; move: (f: FrameInsets) => [number, number] }[] = [
  { place: "top-6 left-6 rounded-tl-xs border-t-3 border-l-3", move: (f) => [f.left - 24, f.top - 24] },
  { place: "top-6 right-6 rounded-tr-xs border-t-3 border-r-3", move: (f) => [24 - f.right, f.top - 24] },
  { place: "bottom-6 left-6 rounded-bl-xs border-b-3 border-l-3", move: (f) => [f.left - 24, 24 - f.bottom] },
  { place: "right-6 bottom-6 rounded-br-xs border-r-3 border-b-3", move: (f) => [24 - f.right, 24 - f.bottom] },
];

// Orange corner brackets and a sweeping line over the camera (Figma "Camera ready").
// Motion (#373): the line is moved with transform, so it stays smooth on cheap phones. When a code
// is found (`lock`), the line stops on it and the corners snap in around it (120 ms) and flash once.
export function CameraFrame({ lock }: { lock?: CameraLock | null }) {
  const line = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (lock) animate(line.current, [{ transform: `translateY(${lock.lineFrom}px)` }, { transform: `translateY(${lock.lineTo}px)` }], { duration: 120, easing: EASE.snap });
  }, [lock]);

  const corner = "absolute size-8 border-primary transition-[translate] duration-[120ms] ease-[var(--ease-snap)]";
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true" data-camera-lock={lock ? "true" : undefined}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgb(13_14_16/55%)_100%)]" />
      {CORNERS.map(({ place, move }) => {
        const [x, y] = lock ? move(lock) : [0, 0];
        return (
          <span
            key={place}
            className={cn(corner, place, lock && "motion-safe:animate-[corner-flash_220ms_ease-out_120ms]")}
            style={{ translate: `${x}px ${y}px` }}
            data-frame-corner
          />
        );
      })}
      <QrCode
        className={cn("absolute top-1/2 left-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/60 transition-opacity duration-fast", lock && "opacity-0")}
        strokeWidth={1.5}
      />
      {/* A box as tall as the camera, whose top edge is the line: moving the box moves the line */}
      <span
        ref={line}
        className={cn("absolute inset-x-8 inset-y-0", !lock && "animate-scan-line")}
        style={lock ? { transform: `translateY(${lock.lineTo}px)` } : undefined}
        data-scan-line
      >
        <span className="absolute inset-x-0 top-0 h-0.5 bg-primary shadow-[0_0_12px_2px_rgb(249_115_22/60%)]" />
      </span>
    </div>
  );
}

// Turns the scanner's beeps off (#373). Vibration stays. Remembered on this device.
export function SoundToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const Icon = on ? Volume2 : VolumeX;
  return (
    <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-pressed={on} aria-label="Sound" title={on ? "Turn the sound off" : "Turn the sound on"}>
      <Icon aria-hidden="true" />
    </Button>
  );
}

// Shown instead of the camera while a scan result is on screen
export function CameraPausedBar({ canResume, onResume }: { canResume: boolean; onResume: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <span className="relative flex size-10 items-center justify-center rounded-full bg-muted text-secondary-foreground">
          <Camera className="size-4" aria-hidden="true" />
          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" aria-hidden="true" />
        </span>
        <div>
          <p className="type-mono-tag text-muted-foreground">Camera</p>
          <p className="type-body-md text-foreground">Paused for review</p>
        </div>
      </div>
      <Button variant="secondary" size="sm" onClick={onResume} disabled={!canResume} className="rounded-full">
        <ScanLine aria-hidden="true" />
        Resume
      </Button>
    </div>
  );
}

// Centered panel: "This wallet can't scan tickets", connect prompt, or load errors
export function ScannerPanel({
  icon = <Lock aria-hidden="true" />,
  title,
  children,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-14 text-center">
      <span className="mb-2 flex size-14 items-center justify-center rounded-full border border-border bg-muted text-secondary-foreground [&_svg]:size-5">
        {icon}
      </span>
      <h2 className="type-heading-sm text-foreground">{title}</h2>
      <div className="max-w-xs type-body-md text-secondary-foreground">{children}</div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
