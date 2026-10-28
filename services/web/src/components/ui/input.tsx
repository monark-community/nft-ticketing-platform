import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

// Input and Textarea from the Figma Design System page (#290).
// Focus = orange border, error (aria-invalid) = red border, disabled = 50% opacity.
const fieldClasses =
  "w-full min-w-0 rounded-sm border border-input bg-background px-4 type-body-md text-foreground transition-[color,border-color,box-shadow] duration-200 outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        fieldClasses,
        className
      )}
      {...props}
    />
  )
}

function Textarea({ className, rows = 3, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" rows={rows} className={cn("min-h-20 resize-y py-3", fieldClasses, className)} {...props} />
}

export { Input, Textarea }
