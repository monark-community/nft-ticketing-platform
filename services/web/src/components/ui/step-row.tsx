import { XCircle } from "lucide-react"

import { DrawnCheck } from "@/components/motion/DrawnCheck"
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
  // Stamped on when the step finishes, and the tick draws itself (#367, as in the Motion Guide)
  if (status === "done") return <DrawnCheck className="animate-[stamp-on_200ms_var(--ease-snap)_backwards] text-success [&_path]:[animation-delay:60ms]" />
  if (status === "failed") return <XCircle className="size-4 text-destructive" aria-hidden="true" />
  if (status === "inProgress" || status === "pending") return <Spinner className="text-primary" />
  return <span className="size-4 rounded-full border border-muted-foreground" aria-hidden="true" />
}

interface StepRowProps {
  step: number // 1-based
  label: string
  status: StepStatus
  // A dashed line down to the next step, under the icon; it draws itself in orange once this
  // step is done (#367). For lists whose rows are spaced apart (gap-4).
  linkToNext?: boolean
  className?: string
}

function StepRow({ step, label, status, linkToNext = false, className }: StepRowProps) {
  const { text, color } = STATUS[status]
  const muted = status === "waiting" || status === "notStarted"

  return (
    <li data-slot="step-row" className={cn("relative flex items-center justify-between gap-3", className)}>
      {linkToNext && (
        <span
          className={cn(
            "absolute top-full left-[7px] mt-0.5 h-3 border-l-2 border-dashed border-border",
            "after:absolute after:-left-[2px] after:top-0 after:h-full after:origin-top after:scale-y-0 after:border-l-2 after:border-dashed after:border-success after:transition-transform after:duration-[220ms] after:ease-out",
            status === "done" && "after:scale-y-100",
          )}
          aria-hidden="true"
        />
      )}
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
