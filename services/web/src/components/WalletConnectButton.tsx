"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function ConnectWalletButton() {
  return (
    <ConnectButton
      label="Link Your Account to a Wallet"
      accountStatus="address"
      chainStatus="none"
      showBalance={false}
    />
  );
}