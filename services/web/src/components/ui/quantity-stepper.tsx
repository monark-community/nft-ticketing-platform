"use client"

import { Minus, Plus } from "lucide-react"

import { cn } from "@/lib/utils"

// Quantity Stepper from the Figma Design System page (#290): minus, the value in orange mono, plus.
// Used in the selected tier card, and later in organizer forms.
interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max: number
  disabled?: boolean
  label?: string // what is being counted, for screen readers
  className?: string
}

function QuantityStepper({ value, onChange, min = 1, max, disabled = false, label = "Quantity", className }: QuantityStepperProps) {
  const buttonClass =
    "flex size-8 items-center justify-center rounded-xs text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:text-disabled-foreground [&_svg]:size-4"

  return (
    <div
      data-slot="quantity-stepper"
      role="group"
      aria-label={label}
      className={cn("flex items-center gap-2 rounded-sm border border-border bg-background px-2 py-1", className)}
    >
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${label.toLowerCase()}`}
      >
        <Minus aria-hidden="true" />
      </button>
      <output aria-live="polite" className="w-8 text-center font-mono text-lg leading-7 font-bold text-primary">
        {value}
      </output>
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label={`Increase ${label.toLowerCase()}`}
      >
        <Plus aria-hidden="true" />
      </button>
    </div>
  )
}

export { QuantityStepper }
