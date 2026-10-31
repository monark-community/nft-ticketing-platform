import { Check, XCircle } from "lucide-react";

import { Card, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { PUBLISH_STAGES, type PublishStage, type StageStatus } from "@/lib/publish-event";
import { cn } from "@/lib/utils";

const STATUS: Record<StageStatus, { text: string; color: string }> = {
  ready: { text: "Ready", color: "text-primary" },
  waiting: { text: "Waiting", color: "text-muted-foreground" },
  active: { text: "In progress", color: "text-primary" },
  done: { text: "Done", color: "text-success" },
  failed: { text: "Failed", color: "text-destructive" },
};

interface PublishStepsProps {
  statuses: Record<PublishStage, StageStatus>;
  // "Add ticket types on-chain" shows "2 of 3" while it runs
  detail?: Partial<Record<PublishStage, string>>;
}

// "What happens next" (Figma): the four publish steps. The next one to run is highlighted
// and marked READY; finished steps are green.
export function PublishSteps({ statuses, detail }: PublishStepsProps) {
  return (
    <Card className="gap-4">
      <div className="flex flex-col gap-2">
        <CardTitle>What happens next</CardTitle>
        <p className="type-body-sm text-muted-foreground">
          Your wallet confirms each on-chain step. You can leave this page between steps; progress is saved.
        </p>
      </div>
      <ol className="flex flex-col gap-1" aria-label="Publish steps">
        {PUBLISH_STAGES.map(({ key, label }, index) => {
          const status = statuses[key];
          const { text, color } = STATUS[status];
          const highlighted = status === "ready" || status === "active";
          return (
            <li
              key={key}
              className={cn("flex items-center justify-between gap-3 rounded-sm px-3 py-3", highlighted && "bg-primary-tint", status === "failed" && "bg-destructive-bg")}
            >
              <span className="flex min-w-0 items-center gap-3">
                <StageIcon status={status} />
                <span className={cn("type-body-sm", status === "waiting" ? "text-muted-foreground" : "text-foreground")}>
                  {index + 1}. {label}
                  {detail?.[key] && <span className="text-muted-foreground"> ({detail[key]})</span>}
                </span>
              </span>
              <span className={cn("shrink-0 font-mono text-[11px] leading-4 font-bold tracking-[0.15em] uppercase", color)}>{text}</span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function StageIcon({ status }: { status: StageStatus }) {
  if (status === "done") return <Check className="size-4 shrink-0 text-success" aria-hidden="true" />;
  if (status === "failed") return <XCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />;
  if (status === "active") return <Spinner className="text-primary" />;
  return <span className={cn("size-4 shrink-0 rounded-full border", status === "ready" ? "border-primary" : "border-muted-foreground")} aria-hidden="true" />;
}
