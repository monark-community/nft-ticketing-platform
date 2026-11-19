"use client"

import * as React from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface FieldProps {
  label: string
  helper?: string // hint shown under the input
  error?: string | null // replaces the helper and marks the input invalid
  className?: string
  // Receives the props to spread on the input so the label, hint and error are linked for screen readers
  children: (props: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => React.ReactNode
}

// Label + input + helper or error, like the Input component on the Figma Design System page (#290).
function Field({ label, helper, error, className, children }: FieldProps) {
  const id = React.useId()
  const hintId = `${id}-hint`
  const hint = error || helper

  return (
    // group/field: the label turns orange while its box has the focus (#364)
    <div data-slot="field" className={cn("group/field flex flex-col gap-2", className)}>
      <Label htmlFor={id} className="transition-colors duration-fast group-focus-within/field:text-primary">
        {label}
      </Label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": hint ? hintId : undefined })}
      {hint && (
        // The key makes an error fade in when it replaces the hint
        <p
          key={error ? "error" : "hint"}
          id={hintId}
          className={cn("type-body-sm", error ? "fade-in text-destructive" : "text-muted-foreground")}
          role={error ? "alert" : undefined}
        >
          {hint}
        </p>
      )}
    </div>
  )
}

export { Field }
