"use client";

import { ArrowRight, ClipboardClock, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useAccount } from "wagmi";

import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { ROUTES } from "@/lib/nav";
import { sendOrganizerRequest, type OrganizerRequestResult } from "@/lib/organizer-request";
import { cn } from "@/lib/utils";

// Only signed-in organizers can create events (the API's organizer routes need the ORGANIZER role
// and an email). Everyone else gets the step that gets them there.
export function OrganizerGate({ nextPath, children }: { nextPath: string; children: ReactNode }) {
  const hasMounted = useHasMounted();
  const { isConnected } = useAccount();
  const { user, isLoading, authError } = useWalletAuth();
  const [request, setRequest] = useState<OrganizerRequestResult | null>(null);
  const [requesting, setRequesting] = useState(false);

  async function ask() {
    setRequesting(true);
    setRequest(await sendOrganizerRequest());
    setRequesting(false);
  }

  const signUpHref = `${ROUTES.signUp}?next=${encodeURIComponent(nextPath)}`;

  // The server can't know the wallet, so nothing wallet-specific renders before mount (#220)
  if (!hasMounted) return <GateSkeleton />;

  // Connected, and the session check or the sign-in message is still pending
  if (isConnected && !user && !authError) {
    return (
      <GateCard icon={<Spinner className="size-6 text-primary" />} title={isLoading ? "Confirm the sign-in in your wallet" : "Checking your account…"}>
        Creating events needs a signed-in organizer account.
      </GateCard>
    );
  }

  if (!user) {
    return (
      <GateCard icon={<LockKeyhole className="size-6" aria-hidden="true" />} title="Sign in to create events">
        Connect the wallet of your organizer account and sign in. You&apos;ll come back here afterwards.
        <Link href={signUpHref} className={cn(buttonVariants({ size: "md" }), "mt-4 w-full sm:w-auto")}>
          Sign in <ArrowRight aria-hidden="true" />
        </Link>
      </GateCard>
    );
  }

  if (!user.profile_complete) {
    return (
      <GateCard icon={<LockKeyhole className="size-6" aria-hidden="true" />} title="Finish your account">
        Add your name and email before creating events.
        <Link href={signUpHref} className={cn(buttonVariants({ size: "md" }), "mt-4 w-full sm:w-auto")}>
          Finish your account <ArrowRight aria-hidden="true" />
        </Link>
      </GateCard>
    );
  }

  if (user.role === "ADMIN") {
    return (
      <GateCard icon={<LockKeyhole className="size-6" aria-hidden="true" />} title="Use an organizer account">
        Admin accounts can&apos;t create events. Switch to your organizer wallet in your wallet app.
      </GateCard>
    );
  }

  if (user.role !== "ORGANIZER") {
    return (
      <GateCard
        icon={<ClipboardClock className="size-6" aria-hidden="true" />}
        title={request === "sent" ? "Request sent" : "Organizer access needed"}
      >
        {request === "sent"
          ? "An admin will review your request. Once it's approved, sign in again and come back here."
          : "Only approved organizers can create events. Ask for access and an admin will review it."}
        {request === "failed" && <Alert tone="error" title="Your request didn't go through. Try again." className="mt-4 text-left" />}
        {request !== "sent" && (
          <Button size="md" className="mt-4 w-full sm:w-auto" onClick={ask} loading={requesting}>
            Request organizer access
          </Button>
        )}
      </GateCard>
    );
  }

  return <>{children}</>;
}

function GateCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card className="mx-auto w-full max-w-[520px] items-center py-10 text-center" aria-live="polite">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary-tint text-primary">{icon}</span>
      <h2 className="type-heading-md text-foreground">{title}</h2>
      <div className="flex w-full flex-col items-center type-body-md text-secondary-foreground">{children}</div>
    </Card>
  );
}

function GateSkeleton() {
  return <div className="h-[420px] w-full animate-pulse rounded-lg bg-card" aria-busy="true" aria-label="Loading" />;
}
