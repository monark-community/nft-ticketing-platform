"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

// Button from the Figma Design System page (#290).
// Variants: Primary (one main action per screen), Secondary (orange outline), Ghost (low emphasis).
// Disabled buttons are grey, never faded orange.
const filledDisabled =
  "disabled:border-transparent disabled:bg-disabled disabled:text-disabled-foreground disabled:shadow-none"
const textDisabled = "disabled:bg-transparent disabled:text-disabled-foreground"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-sm border border-transparent bg-clip-padding whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-200 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: cn("type-label-button bg-primary text-primary-foreground glow-primary hover:bg-primary/90", filledDisabled),
        primary: cn("type-label-button bg-primary text-primary-foreground glow-primary hover:bg-primary/90", filledDisabled),
        secondary: cn("type-label-button border-border-accent bg-transparent text-primary hover:border-primary hover:bg-primary-tint", filledDisabled),
        ghost: cn("type-label-button bg-transparent text-secondary-foreground hover:bg-muted hover:text-foreground", textDisabled),
        outline: cn("type-label-button border-border bg-transparent text-foreground hover:bg-muted", filledDisabled),
        destructive: cn("type-label-button border-destructive/40 bg-destructive-bg text-destructive hover:bg-destructive/20", filledDisabled),
        link: cn("text-sm font-medium text-primary underline-offset-4 hover:underline", textDisabled),
      },
      size: {
        default: "h-11 px-6", // MD in Figma
        md: "h-11 px-6",
        lg: "h-13 px-8",
        sm: "h-9 px-4 text-xs",
        icon: "size-11",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean // shows a spinner and disables the button while a step is pending
  }

function Button({ className, variant = "default", size = "default", loading = false, disabled, children, ...props }: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
export type { ButtonProps }
