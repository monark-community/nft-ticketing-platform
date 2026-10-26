"use client";

import { useHasMounted } from "@/hooks/useHasMounted";
import { useAccount, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

 const SUPPORTED_CHAIN_IDS = [sepolia.id, 31337];

export function NetworkGuard() {
  const { isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const hasMounted = useHasMounted();

  if (!hasMounted || !isConnected) return null;
  if (!chainId) return null;
  if (SUPPORTED_CHAIN_IDS.includes(chainId as typeof SUPPORTED_CHAIN_IDS[number])) return null;

  return (
    <div className="w-full bg-primary-tint border-b border-border-accent px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-primary-soft">
          Wrong network detected. Please switch to Sepolia testnet.
        </p>
      </div>
      <button
        onClick={() => switchChain({ chainId: sepolia.id })}
        className="text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-lg transition-colors"
      >
        Switch to Sepolia
      </button>
    </div>
  );
}