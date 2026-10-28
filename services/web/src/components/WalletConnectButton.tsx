"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function ConnectWalletButton() {
  return (
    <ConnectButton
      label="Connect wallet"
      accountStatus="address"
      chainStatus="none"
      showBalance={false}
    />
  );
}
