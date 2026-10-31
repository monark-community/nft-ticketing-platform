"use client";

import type { ReactNode } from "react";

import { formatFileSize } from "@/components/create-event/CoverImageField";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatEventWhen,
  fromLocalInput,
  parsePrice,
  parseRoyaltyBps,
  parseSupply,
  resaleCapLabel,
  type DetailsForm,
  type FormStep,
  type SaleRulesForm,
  type TicketTypeForm,
} from "@/lib/create-event";
import { formatEventDate } from "@/lib/event-details";
import { formatTokenAmount } from "@/lib/token-amount";
import { cn } from "@/lib/utils";

interface ReviewStepProps {
  details: DetailsForm;
  types: TicketTypeForm[];
  rules: SaleRulesForm;
  image: File | null;
  uploadedImageUrl: string | null;
  usdcDecimals: number;
  frozen: boolean;
  rulesLocked: boolean;
  disabled: boolean; // while publishing
  onEdit: (step: FormStep) => void;
  aside: ReactNode; // "What happens next" and the alerts
}

// Figma "Create event / 4 Review and publish": a summary card per step with EDIT, and the
// publish steps on the right
export function ReviewStep({ details, types, rules, image, uploadedImageUrl, usdcDecimals, frozen, rulesLocked, disabled, onEdit, aside }: ReviewStepProps) {
  const start = fromLocalInput(details.start);
  const salesEnd = fromLocalInput(rules.salesEnd);
  const limit = parseSupply(rules.perWalletLimit);
  const royalty = parseRoyaltyBps(rules.royaltyPercent);

  const cover = image ? `${image.name} (${formatFileSize(image.size)})` : uploadedImageUrl ? "Uploaded to IPFS" : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex flex-col gap-6">
        <SummaryCard title="Details" onEdit={frozen ? undefined : () => onEdit("details")} disabled={disabled}>
          <Row label="Name" value={details.title.trim() || null} />
          <Row label="When" value={start === null ? null : formatEventWhen(start, fromLocalInput(details.end))} />
          <Row label="Venue" value={details.location.trim() || null} />
          <Row label="Category" value={details.category || null} />
          <Row label="Cover image" value={cover} missing="Missing" />
        </SummaryCard>

        <SummaryCard title="Ticket types" onEdit={frozen ? undefined : () => onEdit("ticket-types")} disabled={disabled}>
          {types.length === 0 ? (
            <Row label="Ticket types" value={null} />
          ) : (
            types.map((type, i) => {
              const price = parsePrice(type.price, usdcDecimals);
              const supply = parseSupply(type.supply);
              return (
                <Row
                  key={type.key}
                  label={type.name.trim() || `Ticket type ${i + 1}`}
                  value={price === null || supply === null ? null : `${formatTokenAmount(price, usdcDecimals)} USDC × ${supply.toLocaleString("en-US")}`}
                />
              );
            })
          )}
        </SummaryCard>

        <SummaryCard title="Sale rules" onEdit={rulesLocked ? undefined : () => onEdit("sale-rules")} disabled={disabled}>
          <Row label="Per-wallet limit" value={limit === null ? null : limit === 0 ? "No limit" : String(limit)} />
          <Row label="Resale price cap" value={resaleCapLabel(rules.resaleCapBps)} />
          <Row label="Organizer royalty" value={royalty === null ? null : `${Number((royalty / 100).toFixed(2))}%`} />
          <Row label="Sales end" value={salesEnd === null ? null : formatEventDate(new Date(salesEnd).toISOString())} />
          <Row label="Start in presale" value={rules.presale ? "Yes" : "No"} />
        </SummaryCard>
      </div>

      <div className="flex flex-col gap-6 self-start">{aside}</div>
    </div>
  );
}

function SummaryCard({ title, onEdit, disabled, children }: { title: string; onEdit?: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <Card className="gap-4">
      <CardHeader className="items-center">
        <CardTitle>{title}</CardTitle>
        {onEdit && (
          <Button type="button" variant="ghost" size="sm" onClick={onEdit} disabled={disabled} aria-label={`Edit ${title.toLowerCase()}`}>
            Edit
          </Button>
        )}
      </CardHeader>
      <dl className="flex flex-col gap-3">{children}</dl>
    </Card>
  );
}

// Label on the left, value on the right in mono (Figma). A missing value shows in red.
function Row({ label, value, missing = "Not set" }: { label: string; value: string | null; missing?: string }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <dt className="min-w-0 type-body-md break-words text-muted-foreground">{label}</dt>
      <dd className={cn("max-w-[65%] min-w-0 shrink-0 type-mono-value text-right break-words", value ? "text-foreground" : "text-destructive")}>{value ?? missing}</dd>
    </div>
  );
}
