import * as React from "react"
import { AlertCircle, CheckCircle2, Info, TriangleAlert, type LucideIcon } from "lucide-react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Alert from the Figma Design System page (#290). Always say what to do next in the message.
// error = blocked action, warning = restriction (presale, wallet limit),
// info = neutral state (sold out), success = confirmation.
type AlertTone = "error" | "warning" | "info" | "success"

const alertVariants = cva("relative flex gap-3 overflow-hidden rounded-sm border py-3 pr-4 pl-5", {
  variants: {
    tone: {
      error: "border-destructive/40 bg-destructive-bg",
      warning: "border-border-accent bg-primary-tint",
      info: "border-border bg-muted",
      success: "border-success/40 bg-success-bg",
    },
  },
})

const ACCENT: Record<AlertTone, string> = {
  error: "bg-destructive",
  warning: "bg-primary",
  info: "bg-border",
  success: "bg-success",
}

const TITLE: Record<AlertTone, string> = {
  error: "text-destructive",
  warning: "text-primary",
  info: "text-foreground",
  success: "text-success",
}

const ICON: Record<AlertTone, LucideIcon> = {
  error: AlertCircle,
  warning: TriangleAlert,
  info: Info,
  success: CheckCircle2,
}

interface AlertProps extends Omit<React.ComponentProps<"div">, "title"> {
  tone?: AlertTone
  title: React.ReactNode
  icon?: LucideIcon | null // override the tone's icon, or null for none
  action?: React.ReactNode // e.g. a "Try again" button under the message
}

function Alert({ tone = "info", title, icon, action, className, children, ...props }: AlertProps) {
  const Icon = icon === null ? null : (icon ?? ICON[tone])
  // Errors interrupt (role="alert"); the others are announced politely
  const role = tone === "error" ? "alert" : "status"

  return (
    <div data-slot="alert" role={role} className={cn(alertVariants({ tone }), className)} {...props}>
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", ACCENT[tone])} aria-hidden="true" />
      {Icon && <Icon className={cn("mt-0.5 size-4 shrink-0", TITLE[tone])} aria-hidden="true" />}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn("type-body-md-strong", TITLE[tone])}>{title}</p>
        {children && <div className="type-body-sm text-secondary-foreground">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  )
}

export { Alert }
export type { AlertTone }
