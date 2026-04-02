"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

// const SUPPORTED_CHAIN_IDS = [mainnet.id, sepolia.id];
const SUPPORTED_CHAIN_IDS = [sepolia.id];

export function NetworkGuard() {
  const { isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  if (!isConnected) return null;
  if (!chainId) return null;
  if (SUPPORTED_CHAIN_IDS.includes(chainId as typeof SUPPORTED_CHAIN_IDS[number])) return null;

  return (
    <div className="w-full bg-yellow-50 border-b border-yellow-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-yellow-800">
          Wrong network detected. Please switch to Ethereum Mainnet or Sepolia testnet.
        </p>
      </div>
      <button
        onClick={() => switchChain({ chainId: sepolia.id })}
        className="text-xs font-bold text-white bg-yellow-500 hover:bg-yellow-600 px-3 py-1.5 rounded-lg transition-colors"
      >
        Switch to Sepolia
      </button>
    </div>
  );
}