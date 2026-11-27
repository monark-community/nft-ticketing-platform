"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { PrintIn, RollingNumber, TearOff } from "@/components/motion";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { MAX_TICKET_TYPES, newTicketType, ticketTotals, TYPE_NAME_MAX, type TicketTypeErrors, type TicketTypeForm } from "@/lib/create-event";
import { formatTokenAmount } from "@/lib/token-amount";
import { cn } from "@/lib/utils";

interface TicketTypesStepProps {
  types: TicketTypeForm[];
  rowErrors: Record<string, TicketTypeErrors>;
  listError: string | null;
  frozen: boolean;
  usdcDecimals: number;
  onChange: (types: TicketTypeForm[]) => void;
}

// Figma "Create event / 2 Ticket types": one card per type, "Add another ticket type", and the
// totals on the right. Rows are added at the end only: their order is their on-chain type ID.
// Motion (#372): a new ticket type prints in under a scan line (400 ms) as its card opens (300 ms),
// then its number is punched; Remove tears the card in two and the cards below close up; the totals roll.
export function TicketTypesStep({ types, rowErrors, listError, frozen, usdcDecimals, onChange }: TicketTypesStepProps) {
  const totals = ticketTotals(types, usdcDecimals);
  // Rows on screen when the step opened don't print; rows added here do (saved rows keep their id)
  const [shownAtStart] = useState(() => new Set(types.map((t) => t.key)));
  const [removing, setRemoving] = useState<string | null>(null);

  function update(key: string, patch: Partial<TicketTypeForm>) {
    onChange(types.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex flex-col gap-6">
        {listError && <Alert tone="error" title={listError} />}

        {types.map((type, index) => {
          const errors = rowErrors[type.key] ?? {};
          const added = type.key.startsWith("new-") && !shownAtStart.has(type.key);
          return (
            <TearOff
              key={type.key}
              torn={removing === type.key}
              onTorn={() => {
                setRemoving(null);
                onChange(types.filter((t) => t.key !== type.key));
              }}
            >
              <div className={cn(added && "grid animate-[unfold-in_300ms_var(--ease-arrive)_backwards] grid-rows-[1fr] [&>*]:min-h-0 [&>*]:overflow-hidden")}>
                <PrintIn play={added}>
                  <Card className="gap-5" aria-label={`Ticket type ${index + 1}`}>
                    <CardHeader className="items-center">
                      <h3 className="flex min-w-0 items-center gap-2.5 type-title-lg text-foreground">
                        <span
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary-tint font-mono text-[11px] font-bold text-primary",
                            added && "punch-ring [animation-delay:400ms] after:[animation-delay:400ms]",
                          )}
                          aria-hidden="true"
                        >
                          {/* Rolls down when a card above is removed */}
                          <RollingNumber value={index + 1} align="center" />
                        </span>
                        <span className="min-w-0 truncate">{type.name.trim() || `Ticket type ${index + 1}`}</span>
                      </h3>
                      {!frozen && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={types.length === 1 || removing !== null}
                          onClick={() => setRemoving(type.key)}
                          aria-label={`Remove ${type.name.trim() || `ticket type ${index + 1}`}`}
                        >
                          Remove
                        </Button>
                      )}
                    </CardHeader>

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-4">
                      <Field label="Name" helper="Shown to buyers" error={errors.name}>
                        {(props) => (
                          <Input {...props} value={type.name} maxLength={TYPE_NAME_MAX + 20} disabled={frozen} onChange={(e) => update(type.key, { name: e.target.value })} />
                        )}
                      </Field>
                      <Field label="Price (USDC)" helper="Per ticket" error={errors.price}>
                        {(props) => (
                          <Input {...props} inputMode="decimal" className="font-mono" value={type.price} disabled={frozen} onChange={(e) => update(type.key, { price: e.target.value })} />
                        )}
                      </Field>
                      <Field label="Supply" helper="Max tickets" error={errors.supply}>
                        {(props) => (
                          <Input {...props} inputMode="numeric" className="font-mono" value={type.supply} disabled={frozen} onChange={(e) => update(type.key, { supply: e.target.value })} />
                        )}
                      </Field>
                    </div>

                    <Field label="Description" helper="Perks, one per line" error={errors.description}>
                      {(props) => (
                        <Textarea {...props} rows={3} value={type.description} disabled={frozen} onChange={(e) => update(type.key, { description: e.target.value })} />
                      )}
                    </Field>
                  </Card>
                </PrintIn>
              </div>
            </TearOff>
          );
        })}

        {!frozen && (
          <div className="flex flex-col items-start gap-2">
            <Button type="button" variant="secondary" disabled={types.length >= MAX_TICKET_TYPES} onClick={() => onChange([...types, newTicketType()])}>
              <Plus aria-hidden="true" /> Add another ticket type
            </Button>
            {types.length >= MAX_TICKET_TYPES && <p className="type-body-sm text-muted-foreground">An event can have up to {MAX_TICKET_TYPES} ticket types.</p>}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6 self-start">
        <Card className="gap-3">
          <CardTitle className="pb-1">Totals</CardTitle>
          <dl className="flex flex-col gap-3">
            {/* They roll like counter wheels as you type */}
            <TotalRow label="Ticket types" value={totals.count.toLocaleString("en-US")} />
            <TotalRow label="Total capacity" value={totals.capacity.toLocaleString("en-US")} />
            <TotalRow label="Revenue if sold out" value={`${formatTokenAmount(totals.revenue, usdcDecimals)} USDC`} />
          </dl>
        </Card>
        {frozen ? (
          <Alert tone="info" title="Ticket types are frozen">
            They were uploaded to IPFS when you froze the event, so they can&apos;t change here anymore.
          </Alert>
        ) : (
          <Alert tone="info" title="Prices are in USDC" icon={null}>
            Buyers approve USDC, then buy. Ticket types lock when you freeze the event.
          </Alert>
        )}
      </div>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="type-body-md text-muted-foreground">{label}</dt>
      <dd className="type-mono-value text-right text-foreground">
        <RollingNumber value={value} align="end" />
      </dd>
    </div>
  );
}
