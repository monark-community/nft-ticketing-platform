"use client"

import { cn } from "@/lib/utils"

// On/off toggle (Figma "Create event / 3 Sale rules": Start in presale). Off is grey, on is orange.
interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  "aria-labelledby"?: string
  "aria-describedby"?: string
  className?: string
}

function Switch({ checked, onCheckedChange, disabled, className, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      data-slot="switch"
      className={cn(
        "relative inline-flex h-5 w-10 shrink-0 items-center rounded-full border transition-colors duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-primary bg-primary" : "border-border bg-muted",
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute size-4 rounded-full transition-transform duration-200",
          checked ? "translate-x-[21px] bg-primary-foreground" : "translate-x-[2px] bg-secondary-foreground"
        )}
      />
    </button>
  )
}

export { Switch }
