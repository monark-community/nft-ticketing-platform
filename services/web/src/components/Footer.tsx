import Link from "next/link";

import { Logo } from "@/components/Logo";

// Shared footer from Figma (#290): logo and copyright on the left, legal links on the right.
export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-7 sm:flex-row sm:items-center sm:justify-between md:px-10">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="type-body-sm text-muted-foreground">© {new Date().getFullYear()} NFTOKENPASS. All rights reserved.</p>
        </div>
        <nav aria-label="Legal" className="flex gap-6">
          <Link href="/terms" className="type-mono-address text-muted-foreground transition-colors hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="type-mono-address text-muted-foreground transition-colors hover:text-foreground">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
