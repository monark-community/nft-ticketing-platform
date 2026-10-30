import { Wallet } from "lucide-react";

import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";

// Step 1 (Figma: Sign in / Connect wallet). Opens the same wallet picker as the navbar button.
export function ConnectWalletCard({ onConnect }: { onConnect: () => void }) {
  return (
    <AuthCard aria-labelledby="sign-in-title" className="items-center text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="relative flex size-16 items-center justify-center rounded-lg bg-popover shadow-[0_0_12px_var(--primary-tint)]">
          <Wallet className="size-6 text-primary" aria-hidden="true" />
          <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-primary" aria-hidden="true">
            <span className="size-1.5 rounded-full bg-background" />
          </span>
        </span>

        <h1 id="sign-in-title" className="pt-3 type-heading-md tracking-[-0.025em] text-foreground">
          Sign in to NFTokenPass
        </h1>
        <p className="max-w-[340px] pb-5 type-body-md text-secondary-foreground">
          Connect your wallet to buy tickets and manage your events.
        </p>

        <Button size="md" className="w-full" onClick={onConnect}>
          <Wallet aria-hidden="true" />
          Connect wallet
        </Button>

        <p className="pt-3 type-body-sm text-secondary-foreground">
          New to crypto wallets?{" "}
          <a
            href="https://ethereum.org/en/wallets/"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-secondary-foreground/40 underline-offset-2 hover:text-foreground"
          >
            Learn more
          </a>
        </p>
      </div>
    </AuthCard>
  );
}
