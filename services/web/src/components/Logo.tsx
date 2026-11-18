import Link from "next/link";

import { cn } from "@/lib/utils";

// NFTokenPass logo: dark tile with a small orange square, plus the wordmark (navbar and footer).
// On hover the square turns into a punched hole (#362).
export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("group/logo flex items-center gap-3 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}>
      <span className="flex size-8 items-center justify-center rounded-sm border border-border-accent bg-card" aria-hidden="true">
        <span className="size-3 rounded-[2px] bg-primary transition-[scale,rotate,border-radius] duration-[180ms] ease-snap group-hover/logo:scale-[0.62] group-hover/logo:rotate-45 group-hover/logo:rounded-full" />
      </span>
      <span className="type-label-md text-foreground">NFTokenPass</span>
    </Link>
  );
}
