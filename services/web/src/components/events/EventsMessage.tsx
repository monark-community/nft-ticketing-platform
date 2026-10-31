import type { ReactNode } from "react";

// Centered empty or error panel from "Events / No results" and "Events / Error" (#283)
export function EventsMessage({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="dot-grid flex flex-col items-center gap-4 rounded-lg border border-border bg-card px-6 py-14 text-center">
      <div className="flex size-16 items-center justify-center rounded-md border border-border bg-background text-primary [&_svg]:size-7">
        {icon}
      </div>
      <h2 className="type-heading-md text-foreground">{title}</h2>
      <div className="max-w-md type-body-md text-secondary-foreground">{children}</div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
