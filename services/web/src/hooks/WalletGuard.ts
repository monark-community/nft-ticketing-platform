import { useAccount } from "wagmi";

export function useWalletGuard() {
  const { isConnected, address } = useAccount();

  function requireWallet(action: () => void) {
    if (!isConnected) {
      alert("Please connect your wallet to continue.");
      return;
    }
    action();
  }

  return { isConnected, address, requireWallet };
}
