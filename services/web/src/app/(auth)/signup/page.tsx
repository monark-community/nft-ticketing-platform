"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { AuthCard } from "@/components/auth/AuthCard";
import { ConfirmSignatureCard } from "@/components/auth/ConfirmSignatureCard";
import { ConnectWalletCard } from "@/components/auth/ConnectWalletCard";
import { CreateAccountForm } from "@/components/auth/CreateAccountForm";
import { OrganizerRequestCard } from "@/components/auth/OrganizerRequestCard";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { Spinner } from "@/components/ui/spinner";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { apiClient } from "@/lib/api";
import { sendOrganizerRequest, type OrganizerRequestResult } from "@/lib/organizer-request";
import { describeAuthError, mapProfileError, safeNextPath, toProfileUpdate, type SignUpForm } from "@/lib/sign-up";

// Sign in and account creation (#288), from the Figma "Sign In Page":
//   1. Connect wallet  2. Confirm signature  3. Create account (first time only)  4. Organizer request sent
// The step comes from the wallet and the session, not from page state, so a refresh lands on the
// right one. Signed-in users with a complete profile go on to ?next= (or the events list).
export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="page-glow flex flex-1 justify-center px-4 pt-12 pb-16 sm:px-8 sm:pt-20">
        <div className="w-full max-w-[440px]">
          {/* useSearchParams needs a Suspense boundary in the App Router */}
          <Suspense fallback={<CardSkeleton />}>
            <SignUpFlow />
          </Suspense>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function SignUpFlow() {
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const router = useRouter();

  const hasMounted = useHasMounted();
  const { address, isConnected } = useAccount();
  const { user, isLoading, authError, signIn, loadProfile, logout } = useWalletAuth();
  const { openConnectModal } = useConnectModal();

  // Set once an organizer finishes the form: their profile is complete, but they stay on step 4
  const [organizerRequest, setOrganizerRequest] = useState<OrganizerRequestResult | null>(null);
  const [retrying, setRetrying] = useState(false);

  const done = Boolean(user?.profile_complete) && organizerRequest === null;
  useEffect(() => {
    if (done) router.replace(nextPath);
  }, [done, nextPath, router]);

  async function createAccount(form: SignUpForm) {
    try {
      await apiClient("/api/users/me", { method: "PUT", data: toProfileUpdate(form) });
    } catch (err) {
      const { field, message } = mapProfileError(err instanceof Error ? err.message : "");
      return field ? { fieldErrors: { [field]: message } } : { error: message };
    }

    // Before loading the profile, so the completed profile doesn't redirect organizers away
    if (form.accountType === "organizer") setOrganizerRequest(await sendOrganizerRequest());
    await loadProfile();
  }

  async function retryOrganizerRequest() {
    setRetrying(true);
    setOrganizerRequest(await sendOrganizerRequest());
    setRetrying(false);
  }

  // The server can't know the wallet, so render nothing wallet-specific until mounted (#220)
  if (!hasMounted) return <CardSkeleton />;

  if (!isConnected || !address) return <ConnectWalletCard onConnect={() => openConnectModal?.()} />;

  if (organizerRequest) {
    return <OrganizerRequestCard status={organizerRequest} retrying={retrying} onRetry={retryOrganizerRequest} />;
  }

  if (!user) {
    return (
      <ConfirmSignatureCard
        address={address}
        status={authError ? "failed" : isLoading ? "waiting" : "checking"}
        error={describeAuthError(authError)}
        onSign={() => signIn()}
        onCancel={() => logout()}
      />
    );
  }

  if (!user.profile_complete) return <CreateAccountForm address={address} onSubmit={createAccount} />;

  return (
    <AuthCard className="items-center text-center" aria-live="polite">
      <div className="flex flex-col items-center gap-3 py-6">
        <Spinner className="size-6 text-primary" />
        <p className="type-body-md text-secondary-foreground">You&apos;re signed in. Taking you back…</p>
      </div>
    </AuthCard>
  );
}

// Same footprint as the cards, so the page doesn't jump while the wallet state loads
function CardSkeleton() {
  return <div className="h-[352px] w-full animate-pulse rounded-lg bg-card" aria-busy="true" aria-label="Loading" />;
}
