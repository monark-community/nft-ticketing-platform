"use client";

import { connectorsForWallets, darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { metaMaskWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, http, WagmiProvider } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";

const connectors = connectorsForWallets(
  [
    { groupName: "Recommended", wallets: [metaMaskWallet] },
    { groupName: "Other", wallets: [walletConnectWallet] },
  ],
  {
    appName: "NFTOKENPASS",
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
  }
);


const config = createConfig({
  connectors,
  chains: [sepolia, hardhat],
  transports: {
    [sepolia.id]: http(),
    [hardhat.id]: http("http://127.0.0.1:8545"),
  },
});



const queryClient = new QueryClient();

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          locale="en"
          // Match the design system (#225): orange accent with near-black text, 4px corners
          theme={darkTheme({ accentColor: "#f97316", accentColorForeground: "#0d0e10", borderRadius: "small" })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}