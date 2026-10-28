import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

// Spinner for pending steps (approve, buy, check-in, signature), per the #282 notes.
// Decorative by default: the surrounding text says what is happening.
function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <Loader2
      data-slot="spinner"
      className={cn("size-4 shrink-0 animate-spin", className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "status" : undefined}
    />
  )
}

export { Spinner }
