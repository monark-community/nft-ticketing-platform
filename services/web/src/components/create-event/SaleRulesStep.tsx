"use client";

import { useId } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  parseSupply,
  RESALE_CAP_OPTIONS,
  resaleExample,
  type FieldErrors,
  type SaleRulesForm,
  type TicketTypeForm,
} from "@/lib/create-event";
import { formatMultiplier } from "@/lib/event-details";
import { formatTokenAmount } from "@/lib/token-amount";

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

// Figma "Create event / 3 Sale rules": the rules card, and what buyers will see on the right
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
            checked={value.presale}
            onCheckedChange={(checked) => set("presale", checked)}
            disabled={locked}
            aria-labelledby={presaleLabelId}
            aria-describedby={presaleHintId}
            className="mt-0.5"
          />
          <div className="flex flex-col">
            <span id={presaleLabelId} className="type-body-md text-foreground">
              Start in presale
            </span>
            <span id={presaleHintId} className="type-body-sm text-muted-foreground">
              Only guest list wallets can buy at first. Add the guest list after creating the event.
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
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{limit ? `Max ${limit} per wallet` : "No wallet limit"}</Badge>
            <Badge tone="code">{value.resaleCapBps > 0 ? `Resale cap ${formatMultiplier(value.resaleCapBps).replace("×", "x")}` : "No resale cap"}</Badge>
            {value.presale && <Badge tone="highlight">Presale first</Badge>}
          </div>
          <p className="type-body-sm text-secondary-foreground">
            {resaleExample(types, value, usdcDecimals, (v) => formatTokenAmount(v, usdcDecimals))}
          </p>
        </Card>
      </div>
    </div>
  );
}
