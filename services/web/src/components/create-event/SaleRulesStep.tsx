"use client";

import { useId, type ReactNode } from "react";

import { FlapText, RollingNumber } from "@/components/motion";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  parseSupply,
  PRESALE_AVAILABLE,
  RESALE_CAP_OPTIONS,
  resaleExample,
  resalePreview,
  startsInPresale,
  type FieldErrors,
  type SaleRulesForm,
  type TicketTypeForm,
} from "@/lib/create-event";
import { formatMultiplier } from "@/lib/event-details";
import { formatTokenAmount } from "@/lib/token-amount";
import { cn } from "@/lib/utils";

interface SaleRulesStepProps {
  value: SaleRulesForm;
  errors: FieldErrors<keyof SaleRulesForm>;
  types: TicketTypeForm[];
  usdcDecimals: number;
  minSalesEnd: string;
  // Tickets already sold: the contract's rules are final (rare here: only if the event opened
  // sales and someone bought before the organizer came back to this page)
  locked: boolean;
  onChange: (value: SaleRulesForm) => void;
}

// Figma "Create event / 3 Sale rules": the rules card, and what buyers will see on the right.
// Motion (#372): what buyers will see is a small ticket with the resale cap drawn as a measure,
// like the Marketplace cards. Changing the cap slides its marker; "No cap" opens the end of the
// bar. The chips flip like a departure board and the numbers in the sentence roll.
export function SaleRulesStep({ value, errors, types, usdcDecimals, minSalesEnd, locked, onChange }: SaleRulesStepProps) {
  const presaleLabelId = useId();
  const presaleHintId = useId();
  const set = <K extends keyof SaleRulesForm>(key: K, v: SaleRulesForm[K]) => onChange({ ...value, [key]: v });

  const limit = parseSupply(value.perWalletLimit);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <Card className="gap-5">
        <CardTitle>Sale rules</CardTitle>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
          <Field label="Per-wallet limit" helper="Max tickets one wallet can buy. 0 = no limit" error={errors.perWalletLimit}>
            {(props) => (
              <Input {...props} inputMode="numeric" value={value.perWalletLimit} disabled={locked} onChange={(e) => set("perWalletLimit", e.target.value)} />
            )}
          </Field>
          <Field label="Sales end" helper="Must be in the future" error={errors.salesEnd}>
            {(props) => (
              <Input
                {...props}
                type="datetime-local"
                min={minSalesEnd}
                className="[color-scheme:dark]"
                value={value.salesEnd}
                disabled={locked}
                onChange={(e) => set("salesEnd", e.target.value)}
              />
            )}
          </Field>
          <Field label="Resale price cap" helper="Applies before the event, to unused tickets only" error={errors.resaleCapBps}>
            {(props) => (
              <Select {...props} value={String(value.resaleCapBps)} disabled={locked} onChange={(e) => set("resaleCapBps", Number(e.target.value))}>
                {RESALE_CAP_OPTIONS.map((o) => (
                  <option key={o.bps} value={o.bps}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Organizer royalty (%)" helper="Paid to you on every resale, max 100%" error={errors.royaltyPercent}>
            {(props) => (
              <Input {...props} inputMode="decimal" className="font-mono" value={value.royaltyPercent} disabled={locked} onChange={(e) => set("royaltyPercent", e.target.value)} />
            )}
          </Field>
        </div>

        <div className="flex items-start gap-3">
          <Switch
            checked={startsInPresale(value)}
            onCheckedChange={(checked) => set("presale", checked)}
            disabled={locked || !PRESALE_AVAILABLE}
            aria-labelledby={presaleLabelId}
            aria-describedby={presaleHintId}
            className="mt-0.5"
          />
          <div className="flex flex-col">
            <span id={presaleLabelId} className="type-body-md text-foreground">
              Start in presale
            </span>
            <span id={presaleHintId} className="type-body-sm text-muted-foreground">
              {PRESALE_AVAILABLE
                ? "Only guest list wallets can buy at first. Add the guest list after creating the event."
                : "Not available yet: it needs the guest list page. Tickets go on sale to everyone."}
            </span>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-6 self-start">
        {locked ? (
          <Alert tone="warning" title="Rules are locked">
            Tickets have already sold, so these are the contract&apos;s rules and they can&apos;t change anymore.
          </Alert>
        ) : (
          <Alert tone="warning" title="Rules lock at the first sale" icon={null}>
            You can change these until someone buys a ticket.
          </Alert>
        )}

        <Card className="gap-3">
          <CardTitle>What buyers will see</CardTitle>
          <CapPreview types={types} rules={value} usdcDecimals={usdcDecimals} />
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">
              <FlapText text={limit ? `Max ${limit} per wallet` : "No wallet limit"} />
            </Badge>
            <Badge tone="code">
              <FlapText text={value.resaleCapBps > 0 ? `Resale cap ${formatMultiplier(value.resaleCapBps).replace("×", "x")}` : "No resale cap"} />
            </Badge>
            {startsInPresale(value) && <Badge tone="highlight">Presale first</Badge>}
          </div>
          <p className="type-body-sm text-secondary-foreground">
            <RollingNumbers text={resaleExample(types, value, usdcDecimals, (v) => formatTokenAmount(v, usdcDecimals))} />
          </p>
        </Card>
      </div>
    </div>
  );
}

// The measure goes from 0 to 3.3x face value, so a 3x cap still has room after it
const MEASURE_MAX_BPS = 33_000;
const pct = (bps: number) => `${(bps / MEASURE_MAX_BPS) * 100}%`;

// A small ticket of the most expensive type: face value ticked on the bar, the cap as a post the
// bar runs up to. With no cap the bar runs on and fades out.
function CapPreview({ types, rules, usdcDecimals }: { types: TicketTypeForm[]; rules: SaleRulesForm; usdcDecimals: number }) {
  const ticket = resalePreview(types, rules, usdcDecimals);
  if (!ticket) return null;
  const capped = ticket.cap !== null;
  const format = (v: bigint) => formatTokenAmount(v, usdcDecimals);
  return (
    <div className="relative flex flex-col gap-2 rounded-md border border-border-accent bg-background px-4 py-3" data-cap-preview={capped ? "capped" : "open"}>
      {/* Notches cut into the ticket's sides */}
      <span className="absolute top-1/2 -left-1.5 size-3 -translate-y-1/2 rounded-full border-r border-border-accent bg-card" aria-hidden="true" />
      <span className="absolute top-1/2 -right-1.5 size-3 -translate-y-1/2 rounded-full border-l border-border-accent bg-card" aria-hidden="true" />
      <span className="type-label-sm text-muted-foreground">{ticket.name} ticket</span>
      <div className="relative h-1.5 rounded-full bg-muted" aria-hidden="true">
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/50 to-primary transition-[width] duration-[260ms] ease-[var(--ease-arrive)]",
            !capped && "[mask-image:linear-gradient(to_right,#000_75%,transparent)]",
          )}
          style={{ width: capped ? pct(rules.resaleCapBps) : "100%" }}
          data-cap-fill
        />
        {/* Face value */}
        <span className="absolute -top-1 h-3.5 w-px bg-foreground/70" style={{ left: pct(10_000) }} />
        {/* The cap: a post the bar runs up to */}
        <span
          className={cn(
            "absolute -top-1.5 h-4.5 w-0.5 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_6px_rgb(249_115_22/60%)] transition-[left,opacity] duration-[260ms] ease-[var(--ease-snap)]",
            !capped && "opacity-0",
          )}
          style={{ left: capped ? pct(rules.resaleCapBps) : "100%" }}
          data-cap-post
        />
      </div>
      <div className="flex justify-between font-mono text-[11px] leading-4 text-muted-foreground">
        <span>
          Face <RollingNumber value={format(ticket.price)} />
        </span>
        <span className={capped ? "text-primary" : undefined}>
          <RollingNumber value={capped ? `Cap ${format(ticket.cap as bigint)}` : "No cap"} align="end" />
        </span>
      </div>
    </div>
  );
}

// A sentence whose numbers roll when they change
function RollingNumbers({ text }: { text: string }): ReactNode {
  return text.split(/(\d[\d,]*(?:\.\d+)?%?)/).map((part, i) => (i % 2 === 1 ? <RollingNumber key={i} value={part} /> : part));
}
