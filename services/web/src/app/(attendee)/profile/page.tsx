"use client";

import { ArrowRight, LockKeyhole, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useAccount } from "wagmi";

import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { AccountDetailsCard, OrganizerRequestCard, WalletCard } from "@/components/profile/ProfileCards";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConnectWalletButton } from "@/components/WalletConnectButton";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { ROUTES } from "@/lib/nav";
import { canRequestOrganizer } from "@/lib/profile";
import { describeAuthError } from "@/lib/sign-up";

const FINISH_ACCOUNT_HREF = `${ROUTES.signUp}?next=${encodeURIComponent(ROUTES.profile)}`;

// Profile (#285), from the Figma "Profile Page": edit name, nickname and email, see the wallet and
// its role, and ask to become an organizer.
export default function ProfilePage() {
  const hasMounted = useHasMounted();
  const { isConnected } = useAccount();
  const { user, isLoading, authError, signIn, loadProfile, logout } = useWalletAuth();
  const authProblem = describeAuthError(authError);

  let content: ReactNode;
  // The server can't know the wallet, so nothing wallet-specific renders before mount (#220)
  if (!hasMounted) {
    content = <div className="h-[560px] animate-pulse rounded-lg bg-card" aria-busy="true" aria-label="Loading" />;
  } else if (!isConnected) {
    content = (
      <Gate icon={<Wallet aria-hidden="true" />} title="Connect your wallet" action={<ConnectWalletButton />}>
        Connect your wallet and sign in to see your profile.
      </Gate>
    );
  } else if (!user) {
    content = (
      <Gate
        icon={<LockKeyhole aria-hidden="true" />}
        title={isLoading ? "Confirm the sign-in in your wallet" : "Sign in to see your profile"}
        action={
          <Button onClick={() => void signIn()} loading={isLoading}>
            Sign in
          </Button>
        }
      >
        {authProblem ? <Alert tone="error" title={authProblem.title} className="text-left">{authProblem.message}</Alert> : "Sign the message in your wallet to prove it's yours. It's free."}
      </Gate>
    );
  } else if (!user.profile_complete) {
    content = (
      <Gate
        icon={<LockKeyhole aria-hidden="true" />}
        title="Finish your account"
        action={
          <Link href={FINISH_ACCOUNT_HREF} className={buttonVariants()}>
            Finish your account <ArrowRight aria-hidden="true" />
          </Link>
        }
      >
        Add your name and email to finish creating your account.
      </Gate>
    );
  } else {
    content = (
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_384px]">
        {/* Remounted per wallet, so a wallet switch never shows the previous account's values */}
        <AccountDetailsCard key={user.wallet_address} user={user} onSaved={loadProfile} />
        <div className="flex flex-col gap-6 self-start">
          <WalletCard user={user} onDisconnect={() => void logout()} />
          {canRequestOrganizer(user.role) && <OrganizerRequestCard key={user.wallet_address} wallet={user.wallet_address} />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="page-glow flex-1">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-10 px-4 pt-10 pb-16 md:px-8 md:pt-14">
          <header className="flex flex-col gap-2">
            <h1 className="type-heading-lg text-foreground md:type-display-xl">Profile</h1>
            <p className="type-body-lg text-secondary-foreground">Manage your account details</p>
          </header>
          {content}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Gate({ icon, title, action, children }: { icon: ReactNode; title: string; action: ReactNode; children: ReactNode }) {
  return (
    <Card className="mx-auto w-full max-w-[520px] items-center py-10 text-center" aria-live="polite">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary-tint text-primary [&_svg]:size-6">{icon}</span>
      <h2 className="type-heading-md text-foreground">{title}</h2>
      <div className="w-full type-body-md text-secondary-foreground">{children}</div>
      <div className="mt-2">{action}</div>
    </Card>
  );
}
