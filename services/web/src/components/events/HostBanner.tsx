"use client";

import { ArrowRight, Armchair } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { buttonVariants } from "@/components/ui/button";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { hostBannerLink } from "@/lib/events";
import { ROUTES } from "@/lib/nav";
import { fetchOrganizerRequest, type OrganizerRequestStatus } from "@/lib/organizer-request";
import { cn } from "@/lib/utils";

// "Want to host an event?" under the events list (Figma "Events / Default", #320). Who sees it and
// where "Request access" goes is decided by hostBannerLink.
export function HostBanner() {
  const hasMounted = useHasMounted(); // the wallet is only known once mounted (#220)
  const { status } = useAccount();
  const { user, isLoading, authError } = useWalletAuth();
  // Only attendees with an account can have an organizer request
  const wallet = user?.role === "USER" && user.profile_complete ? user.wallet_address : null;

  // The attendee's latest request, kept with the wallet it belongs to. null status = couldn't be read
  const [request, setRequest] = useState<{ wallet: string; status: OrganizerRequestStatus | null } | null>(null);
  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    void fetchOrganizerRequest().then((found) => {
      if (!cancelled) setRequest({ wallet, status: found?.status ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  const link = hostBannerLink({
    walletReady: hasMounted && status !== "connecting" && status !== "reconnecting",
    isConnected: status === "connected",
    user,
    signInFailed: !isLoading && authError !== null,
    request: request && request.wallet === wallet ? request.status : undefined,
  });
  if (!link) return null;

  return (
    <aside
      aria-labelledby="host-banner-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-background text-primary">
          <Armchair className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="host-banner-title" className="font-serif text-sm font-semibold tracking-[0.05em] text-foreground uppercase">
            Want to host an event?
          </h2>
          <p className="type-body-sm text-secondary-foreground">
            Request organizer access to list your events and manage ticket sales with zero hassle.
          </p>
        </div>
      </div>
      <Link href={link === "signup" ? ROUTES.signUp : ROUTES.profile} className={cn(buttonVariants({ size: "md" }), "shrink-0")}>
        Request access
        <ArrowRight aria-hidden="true" />
      </Link>
    </aside>
  );
}
