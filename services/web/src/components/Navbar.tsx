"use client";

import { ConnectWalletButton } from "@/components/WalletConnectButton";
import { useAccount } from "wagmi";
import { useWalletAuth } from "@/hooks/useWalletAuth";

export function Navbar() {
  const { address, isConnected } = useAccount();
  const { logout, user } = useWalletAuth();

  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  return (
    <nav className="bg-[#3a7bd5] px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-white/20 rounded flex items-center justify-center text-white text-sm font-bold">
          🎟
        </div>
        <span className="text-white font-bold text-lg tracking-wide">NFTOKENPASS</span>
      </div>
      <div className="flex items-center gap-8">
        <a href="#" className="text-white text-sm font-medium hover:underline">Event Listing</a>
        <a href="#" className="text-white text-sm font-medium hover:underline">My Events</a>
        <a href="#" className="text-white text-sm font-medium hover:underline">Create Event</a>
        {isConnected && shortAddress ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white/20 rounded-full px-3 py-1">
              <span className="text-white text-sm font-mono">{shortAddress}</span>
              {user?.role && (
                <span className="text-[10px] font-bold bg-yellow-400 text-black px-1.5 py-0.5 rounded-full uppercase">
                  {user.role}
                </span>
              )}
            </div>
            <button
              onClick={() => logout()}
              className="text-xs text-white/80 hover:text-white underline cursor-pointer"
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