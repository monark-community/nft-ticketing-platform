"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useContractNetwork } from "@/hooks/useContractNetwork";

// Wallet writes (sales, guest list, scanners, free tickets) only work on TicketNFT's network
export function ManageNetworkNotice() {
  const network = useContractNetwork();
  if (network.onContractChain) return null;

  return (
    <Alert
      tone="warning"
      title={`Switch to ${network.chainName} to make changes`}
      action={
        <Button size="sm" variant="outline" onClick={network.switchNetwork} loading={network.switching}>
          Switch network
        </Button>
      }
    >
      Your wallet is on another network. The event details below still load; transactions need {network.chainName}.
    </Alert>
  );
}
