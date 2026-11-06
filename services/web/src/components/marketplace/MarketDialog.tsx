"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

interface MarketDialogProps {
  open: boolean;
  onClose: () => void;
  eyebrow: string; // "Resale listing", "Resale purchase"
  title: string;
  canClose?: boolean; // false while a transaction runs, so it isn't hidden mid-way
  children: React.ReactNode;
}

// The Sell and Buy popups' frame (Figma: Marketplace / Sell open, Buy open): orange outline and
// glow, the small orange eyebrow over a serif title, and a round close button.
// *:shrink-0: when the popup is taller than the screen it scrolls instead of squashing its
// sections (an Alert has overflow-hidden, so as a flex item it could shrink to one line).
export function MarketDialog({ open, onClose, eyebrow, title, canClose = true, children }: MarketDialogProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && canClose) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[640px] -translate-x-1/2 -translate-y-1/2 flex-col gap-6 overflow-y-auto rounded-lg *:shrink-0 border border-primary/60 bg-card p-6 shadow-[0_0_40px_var(--primary-tint)] outline-none transition-[opacity,scale] duration-200 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="type-mono-tag text-primary">{eyebrow}</p>
              <Dialog.Title className="type-heading-md text-foreground">{title}</Dialog.Title>
            </div>
            <Dialog.Close
              disabled={!canClose}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-secondary-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
              aria-label="Close"
            >
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// "Label ............ value" row of the summary boxes
export function SummaryRow({ label, value, valueClassName }: { label: string; value: React.ReactNode; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="type-body-md text-secondary-foreground">{label}</dt>
      <dd className={valueClassName ?? "type-mono-value text-foreground"}>{value}</dd>
    </div>
  );
}
