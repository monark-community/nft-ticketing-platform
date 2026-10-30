import { Check, XCircle } from "lucide-react"

import { Spinner } from "@/components/ui/spinner"
import type { StepStatus } from "@/lib/purchase-steps"
import { cn } from "@/lib/utils"

// Step Row from Figma (#290): one step of a multi-step transaction (approve, then buy).
// Icon, label and status follow the event page status frames (Approving, Buying, Still pending,
// Success, Failed): done is green, in progress and pending are orange, failed is red.
const STATUS: Record<StepStatus, { text: string; color: string }> = {
  notStarted: { text: "Not started", color: "text-muted-foreground" },
  waiting: { text: "Waiting", color: "text-muted-foreground" },
  inProgress: { text: "In progress", color: "text-primary" },
  pending: { text: "Pending", color: "text-primary" },
  done: { text: "Done", color: "text-success" },
  failed: { text: "Failed", color: "text-destructive" },
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") return <Check className="size-4 text-success" aria-hidden="true" />
  if (status === "failed") return <XCircle className="size-4 text-destructive" aria-hidden="true" />
  if (status === "inProgress" || status === "pending") return <Spinner className="text-primary" />
  return <span className="size-4 rounded-full border border-muted-foreground" aria-hidden="true" />
}

interface StepRowProps {
  step: number // 1-based
  label: string
  status: StepStatus
  className?: string
}

function StepRow({ step, label, status, className }: StepRowProps) {
  const { text, color } = STATUS[status]
  const muted = status === "waiting" || status === "notStarted"

  return (
    <li data-slot="step-row" className={cn("flex items-center justify-between gap-3", className)}>
      <span className="flex items-center gap-2">
        <StepIcon status={status} />
        <span className={cn("type-mono-address", muted ? "text-muted-foreground" : "text-foreground")}>
          {step}. {label}
        </span>
      </span>
      <span className={cn("font-mono text-[10px] leading-4 font-bold tracking-[0.1em] uppercase", color)}>{text}</span>
    </li>
  )
}

export { StepRow }
