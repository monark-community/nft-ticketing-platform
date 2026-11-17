"use client";

import { Pause, Play, Wallet } from "lucide-react";
import { useState } from "react";
import { useReadContract } from "wagmi";

import { TransactionStatus } from "@/components/TransactionStatus";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useContractNetwork } from "@/hooks/useContractNetwork";
import { useTransaction } from "@/hooks/useTransaction";
import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import { getManageTransactionErrorMessage } from "@/lib/organizer-manage-errors";
import { formatTokenAmount } from "@/lib/token-amount";

const nft = { address: TICKET_NFT_ADDRESS, abi: ticketNftAbi, chainId: TICKET_NFT_CHAIN_ID } as const;

interface Props {
  contractEventId: bigint;
  saleActive: boolean;
  usdcDecimals: number;
  onChanged: () => void | Promise<void>;
  refetchChain: () => Promise<unknown>;
}

// Pause/resume sales and withdraw the event's revenue (#187). Both are wallet calls from the
// organizer; the listener copies the new sale status back to the API.
export function SalesControlsCard({ contractEventId, saleActive, usdcDecimals, onChanged, refetchChain }: Props) {
  const network = useContractNetwork();
  const tx = useTransaction({ getErrorMessage: getManageTransactionErrorMessage });
  const [success, setSuccess] = useState<string | null>(null);

  // eventRevenue() is the exact amount not withdrawn yet; it drops to zero after withdraw()
  const revenue = useReadContract({
    ...nft,
    functionName: "eventRevenue",
    args: [contractEventId],
    query: { refetchInterval: 15_000 },
  });
  const revenueAmount = revenue.data as bigint | undefined;
  const available = revenueAmount === undefined ? null : formatTokenAmount(revenueAmount, usdcDecimals);
  const canWithdraw = revenueAmount !== undefined && revenueAmount > BigInt(0);

  async function toggleSales() {
    const next = !saleActive;
    setSuccess(next ? "Ticket sales are open again." : "Ticket sales are paused. Buyers can't buy until you resume.");
    const ok = await tx.run([
      {
        label: next ? "Resume ticket sales" : "Pause ticket sales",
        request: { ...nft, functionName: "setSaleActive", args: [contractEventId, next] },
      },
    ]);
    if (!ok) return;
    await refetchChain();
    await onChanged();
  }

  async function withdraw() {
    setSuccess("Withdrawal confirmed. The revenue is in your wallet.");
    const ok = await tx.run([
      { label: "Withdraw event revenue", request: { ...nft, functionName: "withdraw", args: [contractEventId] } },
    ]);
    if (!ok) return;
    await Promise.all([revenue.refetch(), refetchChain()]);
    await onChanged();
  }

  const busy = tx.isBusy || network.switching;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle>Sales</CardTitle>
          <CardDescription>Open or pause ticket sales, and collect what the event has earned.</CardDescription>
        </div>
        <Badge tone={saleActive ? "success" : "neutral"} dot={saleActive}>
          {saleActive ? "Sales open" : "Sales paused"}
        </Badge>
      </CardHeader>

      <div className="flex flex-col gap-4 rounded-md border border-border bg-background/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="type-body-md-strong text-foreground">Available to withdraw</p>
            <p className="type-body-sm text-muted-foreground">Sales revenue not withdrawn yet, in USDC.</p>
          </div>
          <div className="text-right">
            {available === null ? (
              <p className="type-body-sm text-muted-foreground" role="status">
                Reading revenue…
              </p>
            ) : (
              <p className="type-heading-md text-foreground">{available} USDC</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant={saleActive ? "secondary" : "default"}
            className="flex-1"
            onClick={toggleSales}
            disabled={busy || !network.onContractChain}
            loading={busy && tx.state.steps[0] === (saleActive ? "Pause ticket sales" : "Resume ticket sales")}
          >
            {saleActive ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            {saleActive ? "Pause sales" : "Resume sales"}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={withdraw}
            disabled={busy || !network.onContractChain || !canWithdraw}
            loading={busy && tx.state.steps[0] === "Withdraw event revenue"}
          >
            <Wallet aria-hidden="true" />
            Withdraw revenue
          </Button>
        </div>

        {!canWithdraw && available !== null && (
          <p className="type-body-sm text-muted-foreground">Nothing to withdraw yet. Revenue appears here as tickets sell.</p>
        )}
      </div>

      {!network.onContractChain ? (
        <Alert tone="warning" title="Switch network to make changes">
          The sales controls send transactions on {network.chainName}.
        </Alert>
      ) : (
        <TransactionStatus
          state={tx.state}
          explorerUrl={tx.explorerUrl}
          successMessage={success ?? "Sales updated."}
          onStopWaiting={tx.stopWaiting}
        />
      )}
    </Card>
  );
}
