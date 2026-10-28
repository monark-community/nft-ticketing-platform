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
    <div data-slot="field" className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": hint ? hintId : undefined })}
      {hint && (
        <p id={hintId} className={cn("type-body-sm", error ? "text-destructive" : "text-muted-foreground")} role={error ? "alert" : undefined}>
          {hint}
        </p>
      )}
    </div>
  )
}

export { Field }
