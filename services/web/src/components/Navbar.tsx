"use client";

import { LogOut, Menu, X } from "lucide-react";
import * as m from "motion/react-m";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { Logo } from "@/components/Logo";
import { CopyLiftOff } from "@/components/motion/CopyLiftOff";
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
// On mobile: logo, wallet pill and a menu button that opens a sheet over the page (#282, #362).
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
  // The phone menu stays in the page while it slides away ("closing"), then it is removed
  const [menu, setMenu] = useState<"closed" | "open" | "closing">("closed");
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuOpen = menu === "open";
  const links = navLinksFor(role, pathname);
  const signedIn = role !== "signed-out" && role !== "connected";

  // Closing from the page (dimmed area, Escape) puts focus back on the menu button
  function closeMenu() {
    setMenu((state) => (state === "open" ? "closing" : state));
    menuButtonRef.current?.focus();
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenu("closing");
      menuButtonRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const walletPill = address && <NavWalletPill address={address} />;

  const profileChip = (
    <Link
      href={ROUTES.profile}
      className="group/profile flex items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1 transition-colors hover:border-border-accent"
    >
      {/* A thin orange ring on hover */}
      <span className="flex size-7 items-center justify-center rounded-full bg-primary type-label-md text-primary-foreground tracking-normal transition-shadow duration-fast group-hover/profile:shadow-[0_0_0_2px_var(--background),0_0_0_3px_var(--primary)]">
        {avatarInitial(user)}
      </span>
      <span className="type-body-md-strong text-secondary-foreground">Profile</span>
    </Link>
  );

  return (
    <header
      className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur"
      // Focus leaving the navbar (Tab past the last menu link) closes the phone menu, so it never
      // stays open over the page that now has the focus
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (menu === "open" && next instanceof Node && !event.currentTarget.contains(next)) setMenu("closing");
      }}
    >
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
                  "relative border-b-2 border-transparent py-1.5 type-body-md-strong transition-colors",
                  active ? "text-primary" : "text-secondary-foreground hover:text-foreground"
                )}
              >
                {link.label}
                {/* One underline shared by all the links: it glides from the old page's link to the new one */}
                {active && (
                  <m.span
                    layoutId="navbar-underline"
                    className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-primary"
                    transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
                  />
                )}
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
                  {/* The arrow nudges towards the door on hover */}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onLogout}
                    aria-label="Disconnect wallet"
                    title="Disconnect wallet"
                    className="[&_svg]:transition-transform [&_svg]:duration-fast hover:[&_svg]:translate-x-0.5"
                  >
                    <LogOut />
                  </Button>
                </span>
              )}
            </>
          )}
          <Button
            ref={menuButtonRef}
            variant="outline"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setMenu((state) => (state === "open" ? "closing" : "open"))}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {menu !== "closed" && (
        <>
          {/* The page behind the menu dims; tapping it closes the menu. Nothing on the page moves. */}
          <div
            className={cn("absolute inset-x-0 top-full h-dvh bg-black/60 md:hidden", menu === "closing" ? "dim-out" : "dim-in")}
            onClick={closeMenu}
            aria-hidden="true"
          />
          {/* The sheet drops from under the navbar (220 ms) and slides back up (140 ms) */}
          <div className="absolute inset-x-0 top-full overflow-hidden md:hidden">
            <div
              id="mobile-menu"
              className={cn("border-t border-border bg-background px-4 pb-6 shadow-[0_12px_24px_rgb(0_0_0/50%)]", menu === "closing" ? "sheet-out" : "sheet-in")}
              onAnimationEnd={(event) => {
                if (menu === "closing" && event.target === event.currentTarget) setMenu("closed");
              }}
            >
          <nav aria-label="Main" className="flex flex-col py-2">
            {links.map((link) => {
              const active = isActiveLink(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMenu("closed")}
                  className={cn("border-b border-border py-3 type-title-md", active ? "text-primary" : "text-secondary-foreground")}
                >
                  {link.label}
                </Link>
              );
            })}
            {signedIn && (
              <Link href={ROUTES.profile} onClick={() => setMenu("closed")} className="border-b border-border py-3 type-title-md text-secondary-foreground">
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
          </div>
        </>
      )}
    </header>
  );
}

// The connected wallet in the navbar. Hovering pings its orange dot once; clicking copies the
// address, and a faint copy of it lifts off (#362).
function NavWalletPill({ address }: { address: string }) {
  const [copies, setCopies] = useState(0);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopies((count) => count + 1);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the address is still visible
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied" : "Copy wallet address"}
      aria-label={copied ? "Wallet address copied" : `Copy wallet address ${shortAddress(address)}`}
      className="group/pill flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 outline-none transition-colors hover:border-border-accent focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="size-1.5 rounded-full bg-primary group-hover/pill:punch-ring" aria-hidden="true" />
      <CopyLiftOff copies={copies} className="type-mono-address text-foreground">
        {shortAddress(address)}
      </CopyLiftOff>
    </button>
  );
}
