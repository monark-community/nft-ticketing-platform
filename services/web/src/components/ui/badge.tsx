import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Badge from the Figma Design System page (#290).
// selected = Gold Solid, highlight = Gold Outline (live, presale), neutral = category,
// warning = low stock, danger = almost sold out or errors, success = valid / checked in,
// code = contract terms and standards (mono).
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-xs border border-transparent px-2 py-[3px] whitespace-nowrap",
  {
    variants: {
      tone: {
        selected: "type-label-sm bg-primary text-primary-foreground",
        highlight: "type-label-sm border-primary text-primary",
        neutral: "type-label-sm border-border bg-muted text-secondary-foreground",
        warning: "type-label-sm border-border-accent bg-primary-tint text-primary-soft",
        danger: "type-label-sm border-destructive/40 bg-destructive-bg text-destructive",
        success: "type-label-sm bg-success-bg text-success",
        code: "type-mono-tag bg-muted text-muted-foreground",
      },
      // Over an image: dark blurred backing so the badge stays readable (#282)
      overlay: { true: "bg-background/70 backdrop-blur-sm", false: "" },
    },
    defaultVariants: { tone: "neutral", overlay: false },
  }
)

interface BadgeProps extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {
  dot?: boolean // pulsing status dot, for "Presale" and "Low stock" (#282)
}

function Badge({ className, tone, overlay, dot, children, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ tone, overlay }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current animate-pulse-dot" aria-hidden="true" />}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
