"use client";

import { Collapsible } from "@base-ui/react/collapsible";
import { ArrowUpRight, ChevronDown, Repeat2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { formatMultiplier, formatPercent } from "@/lib/event-details";

interface ResaleRulesProps {
  resaleCapBps: number; // 0 = no cap
  royaltyBps: number;
  contractUrl: string | null; // block explorer page for the contract, when the network has one
}

// "Resale rules" at the bottom of the order summary (#148, Figma: Resale rules open).
// The numbers come from the contract, so they are the rules the platform's resale will enforce.
export function ResaleRules({ resaleCapBps, royaltyBps, contractUrl }: ResaleRulesProps) {
  const [open, setOpen] = useState(false);
  const capped = resaleCapBps > 0;
  const cap = formatMultiplier(resaleCapBps);
  const royalty = formatPercent(royaltyBps);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="mt-4 border-t border-border pt-[13px]">
      <Collapsible.Trigger className="flex w-full items-center justify-between gap-3 rounded-sm text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="flex items-center gap-2">
          {open && <Repeat2 className="size-4 text-primary" aria-hidden="true" />}
          <span className={open ? "text-foreground" : undefined}>Resale rules</span>
        </span>
        <span className="flex items-center gap-2">
          {open && (
            <Badge tone="warning" className="font-mono tracking-normal normal-case">
              {capped ? `${cap} cap` : "No cap"} · {royalty} royalty
            </Badge>
          )}
          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </span>
      </Collapsible.Trigger>

      <Collapsible.Panel className="mt-3 flex flex-col gap-3 rounded-md border border-border bg-popover p-3">
        <div className="grid grid-cols-2 gap-3">
          <Stat value={capped ? cap : "None"} label="Max resale price" />
          <Stat value={royalty} label="Organizer royalty" />
        </div>
        <p className="type-body-sm text-secondary-foreground">
          {capped
            ? `Before the event, resale on NFTokenPass is capped at ${cap} face value.`
            : "Resale on NFTokenPass has no price cap for this event."}{" "}
          The organizer gets {royalty} of every resale. Once a ticket is used or the event is over, it becomes a collectible with no cap.
        </p>
        {contractUrl && (
          <a
            href={contractUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 self-end text-xs font-medium text-primary hover:underline"
          >
            View contract <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        )}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-border bg-card p-3">
      <span className="font-mono text-2xl leading-8 font-bold text-primary">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
