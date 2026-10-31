import { CheckLine, ScanQrCode, Ticket, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";

// Figma "My Tickets / Empty" and "My Tickets / Not connected".
// The "Upcoming events" row from those frames is added once the events list cards exist (#283).

const CTA = "h-10 px-6 text-sm font-semibold tracking-normal normal-case";

export function NoTicketsCard() {
  return (
    <div className="mx-auto flex w-full max-w-[448px] flex-col items-center rounded-lg border border-border bg-card p-8 text-center shadow-[0_4px_12px_rgb(0_0_0/40%)]">
      <IconCircle icon={Ticket} size="md" />
      <h2 className="font-serif text-2xl leading-8 font-medium text-foreground">No tickets yet</h2>
      <p className="pt-2 text-sm leading-5 text-muted-foreground">Tickets you buy show up here.</p>
      <Link href={ROUTES.events} className={cn(buttonVariants(), CTA, "mt-5 rounded-md")}>
        Browse events
      </Link>
    </div>
  );
}

export function ConnectWalletPrompt({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-[512px] flex-col items-center rounded-lg border border-border bg-card px-6 py-12 text-center shadow-[0_4px_12px_rgb(0_0_0/40%)] sm:px-12">
      <IconCircle icon={Wallet} size="lg" />
      <h2 className="pb-3 font-serif text-2xl leading-8 font-semibold text-foreground">Connect your wallet</h2>
      <p className="max-w-[384px] pb-8 text-sm leading-5 text-muted-foreground">
        Connect the wallet you bought your tickets with to see them here.
      </p>
      <Button onClick={onConnect} className={cn(CTA, "h-12 rounded-md text-base")}>
        Connect wallet
      </Button>
    </div>
  );
}

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Wallet, title: "1. Buy with USDC", text: "Pick your tickets and pay with USDC from your wallet." },
  { icon: CheckLine, title: "2. Your ticket lands in your wallet", text: "Each ticket is added to your wallet. You own it." },
  { icon: ScanQrCode, title: "3. Show your QR code at the door", text: "Open My Tickets at the venue and show your entry QR." },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works" className="flex flex-col gap-4">
      <h2 id="how-it-works" className="font-serif text-xl leading-7 font-medium text-foreground">
        How it works
      </h2>
      <ol className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-6">
            <span className="flex size-9 items-center justify-center rounded-sm bg-primary-tint text-primary shadow-[0_0_6px_rgb(249_115_22/15%)]">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <h3 className="pt-1 font-serif text-base leading-6 font-semibold text-foreground">{title}</h3>
            <p className="text-xs leading-4 text-muted-foreground">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function IconCircle({ icon: Icon, size }: { icon: LucideIcon; size: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full bg-primary-tint text-primary shadow-[0_0_8px_rgb(249_115_22/15%)]",
        size === "md" ? "mb-3 size-12" : "mb-6 size-16 border border-primary/30",
      )}
      aria-hidden="true"
    >
      <Icon className={size === "md" ? "size-5" : "size-6"} />
    </span>
  );
}
