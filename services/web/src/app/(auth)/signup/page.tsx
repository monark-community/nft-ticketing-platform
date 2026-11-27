"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useReducedMotion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { AuthCard, AuthStage } from "@/components/auth/AuthCard";
import { ConfirmSignatureCard } from "@/components/auth/ConfirmSignatureCard";
import { ConnectWalletCard } from "@/components/auth/ConnectWalletCard";
import { CreateAccountForm } from "@/components/auth/CreateAccountForm";
import { OrganizerRequestCard } from "@/components/auth/OrganizerRequestCard";
import { Footer } from "@/components/Footer";
import { DrawnCheck } from "@/components/motion";
import { Navbar } from "@/components/Navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useWalletAuth, type UserProfile } from "@/hooks/useWalletAuth";
import { apiClient } from "@/lib/api";
import { sendOrganizerRequest, type OrganizerRequestResult } from "@/lib/organizer-request";
import {
  describeAuthError,
  mapProfileError,
  needsOrganizerRequest,
  safeNextPath,
  toProfileUpdate,
  type SignUpForm,
} from "@/lib/sign-up";

// Sign in and account creation (#288), from the Figma "Sign In Page":
//   1. Connect wallet  2. Confirm signature  3. Create account (first time only)  4. Organizer request sent
// The step comes from the wallet and the session, not from page state, so a refresh lands on the
// right one. Signed-in users with a complete profile go on to ?next= (or the events list).
// Motion (#371): the steps share one card (AuthStage) that glides between them. Redirects are never
// held back by an animation; only a new account waits a moment to show its signature went through.
export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="page-glow flex flex-1 justify-center px-4 pt-12 pb-16 sm:px-8 sm:pt-20">
        <div className="w-full max-w-[440px]">
          {/* useSearchParams needs a Suspense boundary in the App Router */}
          <Suspense fallback={<CardSkeleton />}>
            <AuthStage>
              <SignUpFlow />
            </AuthStage>
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
  const reduced = useReducedMotion();

  // Set once an organizer finishes the form: their profile is complete, but they stay on step 4
  const [organizerRequest, setOrganizerRequest] = useState<OrganizerRequestResult | null>(null);
  const [retrying, setRetrying] = useState(false);
  // The organizer's name for the pass on "Request sent", and whether the form has torn off yet
  const [passName, setPassName] = useState("");
  const [torn, setTorn] = useState(false);

  // A new wallet's signature just went through: the line joins in green for a moment (0.7 s) before
  // Create account (an existing account is redirected at once instead)
  const waitingForSignature = !user && isLoading && !authError;
  const [wasWaiting, setWasWaiting] = useState(false);
  const [showSigned, setShowSigned] = useState(false);
  if (waitingForSignature !== wasWaiting) {
    setWasWaiting(waitingForSignature);
    if (wasWaiting && user && !user.profile_complete && !reduced) setShowSigned(true);
  }
  useEffect(() => {
    if (!showSigned) return;
    const timer = setTimeout(() => setShowSigned(false), 700);
    return () => clearTimeout(timer);
  }, [showSigned]);

  const done = Boolean(user?.profile_complete) && organizerRequest === null;
  useEffect(() => {
    if (done) router.replace(nextPath);
  }, [done, nextPath, router]);

  async function createAccount(form: SignUpForm) {
    let saved: Pick<UserProfile, "role">;
    try {
      saved = await apiClient<UserProfile>("/api/users/me", { method: "PUT", data: toProfileUpdate(form) });
    } catch (err) {
      const { field, message } = mapProfileError(err instanceof Error ? err.message : "");
      return field ? { fieldErrors: { [field]: message } } : { error: message };
    }

    // Before loading the profile, so the completed profile doesn't redirect organizers away.
    // Wallets that are already organizers or the admin skip the request and go on (#328).
    if (needsOrganizerRequest(form.accountType, saved.role)) {
      setPassName(`${form.firstName.trim()} ${form.lastName.trim()}`);
      setOrganizerRequest(await sendOrganizerRequest());
    }
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

  if (organizerRequest && (torn || reduced)) {
    return (
      <OrganizerRequestCard
        status={organizerRequest}
        retrying={retrying}
        onRetry={retryOrganizerRequest}
        pass={passName ? { name: passName, address } : undefined}
      />
    );
  }

  // The request is sent: the form tears off first, then "Request sent" takes its place
  if (organizerRequest) return <CreateAccountForm address={address} onSubmit={createAccount} tearing onTorn={() => setTorn(true)} />;

  if (!user || (showSigned && !user.profile_complete)) {
    return (
      <ConfirmSignatureCard
        address={address}
        status={user ? "signed" : authError ? "failed" : isLoading ? "waiting" : "checking"}
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
        <DrawnCheck className="size-6 text-success" />
        <p className="type-body-md text-secondary-foreground">You&apos;re signed in. Taking you back…</p>
      </div>
    </AuthCard>
  );
}

// Same footprint as the cards, so the page doesn't jump while the wallet state loads
function CardSkeleton() {
  return <Skeleton sweep className="placeholder-in h-[352px] w-full rounded-lg bg-card" aria-busy="true" aria-label="Loading" />;
}
