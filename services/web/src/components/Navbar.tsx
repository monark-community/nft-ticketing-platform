"use client";

import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAccount } from "wagmi";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { ConnectWalletButton } from "@/components/WalletConnectButton";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useProfileCompletionRedirect } from "@/hooks/useProfileCompletionRedirect";
import { useWalletAuth, type UserProfile } from "@/hooks/useWalletAuth";
import { shortAddress } from "@/lib/format";
import { avatarInitial, getNavRole, isActiveLink, navLinksFor, ROUTES, type NavRole } from "@/lib/nav";
import { cn } from "@/lib/utils";

// Top navigation from the Figma Navbar variants (#290).
// Links depend on the role: Organizer only for organizers, Admin only for admins.
// On mobile: logo, wallet pill and a menu button that opens a simple drawer (#282).
export function Navbar() {
  const { address, isConnected } = useAccount();
  const { user, signIn, logout, isLoading } = useWalletAuth();
  const hasMounted = useHasMounted();
  const pathname = usePathname() ?? "";
  // A first sign-in from any page goes to the create account step (#288)
  useProfileCompletionRedirect();

  return (
    <NavbarView
      // The server can't know the wallet state, so treat the first render as signed out (#220)
      role={getNavRole(hasMounted && isConnected, user?.role)}
      ready={hasMounted}
      address={address}
      user={user}
      pathname={pathname}
      signingIn={isLoading}
      onSignIn={() => signIn()}
      onLogout={() => logout()}
    />
  );
}

interface NavbarViewProps {
  role: NavRole;
  ready: boolean; // false during the server render, before the wallet state is known
  address?: string;
  user: UserProfile | null;
  pathname: string;
  signingIn?: boolean;
  onSignIn: () => void;
  onLogout: () => void;
}

// Presentational navbar: renders one Figma variant from the role, with no wallet hooks.
export function NavbarView({ role, ready, address, user, pathname, signingIn = false, onSignIn, onLogout }: NavbarViewProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = navLinksFor(role, pathname);
  const signedIn = role !== "signed-out" && role !== "connected";

  const walletPill = address && (
    <span className="flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5">
      <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
      <span className="type-mono-address text-foreground">{shortAddress(address)}</span>
    </span>
  );

  const profileChip = (
    <Link
      href={ROUTES.profile}
      className="flex items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1 transition-colors hover:border-border-accent"
    >
      <span className="flex size-7 items-center justify-center rounded-full bg-primary type-label-md text-primary-foreground tracking-normal">
        {avatarInitial(user)}
      </span>
      <span className="type-body-md-strong text-secondary-foreground">Profile</span>
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-4 md:h-[72px] md:px-10">
        <Logo className="md:w-[280px]" />

        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {links.map((link) => {
            const active = isActiveLink(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "border-b-2 py-1.5 type-body-md-strong transition-colors",
                  active ? "border-primary text-primary" : "border-transparent text-secondary-foreground hover:text-foreground"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center justify-end gap-3 md:w-[280px]">
          {!ready ? (
            <span className="h-9 w-40" aria-hidden="true" />
          ) : role === "signed-out" ? (
            <ConnectWalletButton />
          ) : (
            <>
              {walletPill}
              {role === "connected" ? (
                <Button size="sm" onClick={onSignIn} loading={signingIn} className="hidden md:inline-flex">
                  Sign in
                </Button>
              ) : (
                <span className="hidden items-center gap-2 md:flex">
                  {profileChip}
                  <Button variant="ghost" size="icon-sm" onClick={onLogout} aria-label="Disconnect wallet" title="Disconnect wallet">
                    <LogOut />
                  </Button>
                </span>
              )}
            </>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {menuOpen && (
        <div id="mobile-menu" className="border-t border-border bg-background px-4 pb-6 md:hidden">
          <nav aria-label="Main" className="flex flex-col py-2">
            {links.map((link) => {
              const active = isActiveLink(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={cn("border-b border-border py-3 type-title-md", active ? "text-primary" : "text-secondary-foreground")}
                >
                  {link.label}
                </Link>
              );
            })}
            {signedIn && (
              <Link href={ROUTES.profile} onClick={() => setMenuOpen(false)} className="border-b border-border py-3 type-title-md text-secondary-foreground">
                Profile
              </Link>
            )}
          </nav>
          <div className="flex flex-col gap-3 pt-2">
            {role === "connected" && (
              <Button size="lg" onClick={onSignIn} loading={signingIn} className="w-full">
                Sign in
              </Button>
            )}
            {signedIn && (
              <Button variant="ghost" onClick={onLogout} className="w-full">
                <LogOut /> Disconnect wallet
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
