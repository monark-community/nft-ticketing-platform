import { ArrowLeft, ArrowRight, CircleAlert, ClipboardClock } from "lucide-react";
import Link from "next/link";

import { AuthCard } from "@/components/auth/AuthCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";

interface OrganizerRequestCardProps {
  status: "sent" | "failed";
  retrying?: boolean;
  onRetry?: () => void;
}

// Step 4 for organizers (Figma: Sign in / Organizer pending). The account already exists at this
// point, as an attendee. "failed" isn't in Figma: the account was created but the request
// didn't go through, so we say so instead of showing "Request sent".
export function OrganizerRequestCard({ status, retrying = false, onRetry }: OrganizerRequestCardProps) {
  const sent = status === "sent";

  return (
    <AuthCard aria-labelledby="organizer-request-title" className="items-center text-center">
      <div className="flex flex-col items-center gap-3">
        <span
          className={cn(
            "flex size-16 items-center justify-center rounded-full",
            sent ? "bg-primary-tint text-primary shadow-[0_0_24px_var(--primary-tint)]" : "bg-destructive-bg text-destructive",
          )}
        >
          {sent ? <ClipboardClock className="size-7" aria-hidden="true" /> : <CircleAlert className="size-7" aria-hidden="true" />}
        </span>

        <h1 id="organizer-request-title" className="pt-2 type-heading-md tracking-[-0.025em] text-foreground">
          {sent ? "Request sent" : "Account created"}
        </h1>
        <p role={sent ? undefined : "alert"} className="max-w-[320px] pb-5 type-body-md text-secondary-foreground">
          {sent
            ? "An admin will review your organizer request. You can browse and buy tickets in the meantime."
            : "Your account is ready, but your organizer request didn't go through. Try again, or browse events and ask again later."}
        </p>

        {sent ? (
          <Link href={ROUTES.events} className={cn(buttonVariants({ size: "md" }), "w-full")}>
            Browse events <ArrowRight aria-hidden="true" />
          </Link>
        ) : (
          <>
            <Button size="md" className="w-full" onClick={onRetry} loading={retrying}>
              Try again
            </Button>
            <Link href={ROUTES.events} className={cn(buttonVariants({ variant: "secondary", size: "md" }), "w-full")}>
              Browse events <ArrowRight aria-hidden="true" />
            </Link>
          </>
        )}

        <Link
          href={ROUTES.profile}
          className="mt-4 flex items-center gap-1.5 rounded-xs type-label-md tracking-[0.1em] text-secondary-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-3" aria-hidden="true" />
          View my profile
        </Link>
      </div>
    </AuthCard>
  );
}
