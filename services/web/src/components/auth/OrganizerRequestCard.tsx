import { ArrowLeft, ArrowRight, CircleAlert, ClipboardClock } from "lucide-react";
import Link from "next/link";

import { AuthCard } from "@/components/auth/AuthCard";
import { PrintIn, Stamp } from "@/components/motion";
import { Button, buttonVariants } from "@/components/ui/button";
import { shortAddress } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";

interface OrganizerRequestCardProps {
  status: "sent" | "failed";
  retrying?: boolean;
  onRetry?: () => void;
  /** The pass printed on "Request sent": the name from the form and the wallet */
  pass?: { name: string; address: string };
}

// Step 4 for organizers (Figma: Sign in / Organizer pending). The account already exists at this
// point, as an attendee. "failed" isn't in Figma: the account was created but the request
// didn't go through, so we say so instead of showing "Request sent".
// Motion (#371): on "Request sent", a small organizer pass with their name prints out and a PENDING
// stamp lands on it.
export function OrganizerRequestCard({ status, retrying = false, onRetry, pass }: OrganizerRequestCardProps) {
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

        {sent && pass && (
          <PrintIn delay={150} className="mb-5">
            <div className="relative flex w-[260px] flex-col items-start gap-0.5 rounded-md border border-border-accent bg-gradient-to-br from-popover to-background py-3 pr-3.5 pl-[34px] text-left" data-organizer-pass>
              <span className="absolute top-1/2 left-3 -mt-[5px] size-2.5 rounded-full bg-card shadow-[inset_0_1px_2px_rgb(0_0_0/60%)]" aria-hidden="true" />
              <span className="type-label-sm text-muted-foreground">Organizer pass</span>
              <span className="font-serif text-base leading-6 font-semibold text-foreground">{pass.name}</span>
              <span className="font-mono text-[11px] leading-4 text-muted-foreground">{shortAddress(pass.address)}</span>
              <Stamp className="absolute right-2.5 bottom-2.5 [animation-delay:600ms]">PENDING</Stamp>
            </div>
          </PrintIn>
        )}

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
