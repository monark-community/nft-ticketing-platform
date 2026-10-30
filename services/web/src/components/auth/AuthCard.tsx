import * as React from "react";

import { cn } from "@/lib/utils";

// The 440px card every sign-in step sits in (Figma "Sign In Page"), with the soft orange glow
// behind its top. The glow is decorative, so screen readers skip it.
export function AuthCard({ className, children, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn("relative flex w-full flex-col overflow-hidden rounded-lg bg-card p-6 shadow-[0_25px_50px_-12px_rgb(0_0_0/25%)] sm:p-8", className)}
      {...props}
    >
      <span className="pointer-events-none absolute -top-24 left-1/2 size-60 -translate-x-1/2 rounded-full bg-primary/10 blur-[64px]" aria-hidden="true" />
      <div className="relative flex flex-col">{children}</div>
    </section>
  );
}
