import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

// Dropdown in the Input style (Figma "Create event": Category, Resale price cap). A native select,
// so it works with the keyboard, screen readers and the phone's own picker.
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div data-slot="select" className={cn("relative", className)}>
      <select
        // The empty "Choose…" option shows as a placeholder
        data-empty={props.value === "" || undefined}
        className="h-11 w-full min-w-0 appearance-none rounded-sm border border-input bg-background pr-10 pl-4 type-body-md text-foreground transition-[color,border-color,box-shadow] duration-200 outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[empty]:text-muted-foreground [&>option]:bg-popover [&>option]:text-foreground"
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-secondary-foreground" aria-hidden="true" />
    </div>
  )
}

export { Select }
