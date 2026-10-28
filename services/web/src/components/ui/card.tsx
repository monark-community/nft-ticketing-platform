import * as React from "react"

import { cn } from "@/lib/utils"

// Card surface used across the redesign (#290): surface color, subtle border, 12px corners.
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card" className={cn("flex flex-col gap-4 rounded-lg border border-border bg-card p-6", className)} {...props} />
}

// Title row: heading on the left, optional badge or action on the right
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex items-start justify-between gap-4", className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 data-slot="card-title" className={cn("type-heading-sm text-foreground", className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="card-description" className={cn("type-body-md text-muted-foreground", className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription }
