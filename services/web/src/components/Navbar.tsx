"use client";

import { ConnectWalletButton } from "@/components/WalletConnectButton";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useAccount } from "wagmi";
import { useWalletAuth } from "@/hooks/useWalletAuth";

export function Navbar() {
  const { address, isConnected } = useAccount();
  const { logout, user, signIn, isLoading } = useWalletAuth();
  const hasMounted = useHasMounted();

  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  return (
    <nav className="bg-card border-b border-border px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-primary-tint rounded flex items-center justify-center text-foreground text-sm font-bold">
          🎟
        </div>
        <span className="text-foreground font-bold text-lg tracking-wide">NFTOKENPASS</span>
      </div>
      <div className="flex items-center gap-8">
        <a href="#" className="text-foreground text-sm font-medium hover:underline">Event Listing</a>
        <a href="#" className="text-foreground text-sm font-medium hover:underline">My Events</a>
        <a href="#" className="text-foreground text-sm font-medium hover:underline">Create Event</a>
        {/* The server can't know the wallet state, so render this part only after mount (#220) */}
        {!hasMounted ? (
          <div className="h-9 w-40" aria-hidden="true" />
        ) : isConnected && shortAddress ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-primary-tint rounded-full px-3 py-1">
              <span className="text-foreground text-sm font-mono">{shortAddress}</span>
              {user?.role && (
                <span className="text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full uppercase">
                  {user.role}
                </span>
              )}
            </div>
            {!user && (
              <button
                onClick={() => signIn()}
                disabled={isLoading}
                className="text-xs text-foreground font-semibold underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Signing..." : "Sign in"}
              </button>
            )}
            <button
              onClick={() => logout()}
              className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer"
            >
              Disconnect
            </button> 
          </div>
        ) : (
          <ConnectWalletButton />
        )}
      </div>
    </nav>
  );
}
