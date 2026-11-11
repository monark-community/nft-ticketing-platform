import { cn } from "@/lib/utils";

// Table pieces shared by the admin page's tabs (#198, #296)

export function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-border bg-card">{children}</div>;
}

export function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={cn(
        "px-5 py-3 type-label-sm text-muted-foreground",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = "left", className }: { children: React.ReactNode; align?: "left" | "right"; className?: string }) {
  return <td className={cn("px-5 py-4 align-middle", align === "right" ? "text-right" : "text-left", className)}>{children}</td>;
}

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode; // e.g. a "Clear search" button
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="dot-grid flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-6 py-10 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <h3 className="type-heading-sm text-foreground">{title}</h3>
      <p className="type-body-md text-muted-foreground">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
