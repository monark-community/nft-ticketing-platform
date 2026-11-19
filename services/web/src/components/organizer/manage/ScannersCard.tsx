"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { TransactionStatus } from "@/components/TransactionStatus";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useContractNetwork } from "@/hooks/useContractNetwork";
import { useTransaction } from "@/hooks/useTransaction";
import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import { shortAddress } from "@/lib/format";
import {
  addScanner as addScannerApi,
  manageApiErrorMessage,
  parseWalletList,
  removeScanner as removeScannerApi,
  type ScannerEntry,
} from "@/lib/organizer-manage";
import { getManageTransactionErrorMessage } from "@/lib/organizer-manage-errors";

const nft = { address: TICKET_NFT_ADDRESS, abi: ticketNftAbi, chainId: TICKET_NFT_CHAIN_ID } as const;

interface Props {
  eventId: string;
  contractEventId: bigint;
  entries: ScannerEntry[];
  loading: boolean;
  onChanged: () => void | Promise<void>;
  reloadOperations: () => Promise<void>;
}

// Scanner wallets (#194): the people allowed to check tickets in at the door. As with the guest
// list, the API row is written first so the wallet's account can be checked, then
// setEventScanner() runs from the organizer's wallet. If nothing was sent the row is removed
// again; after Stop waiting it stays Pending for the listener.
export function ScannersCard({ eventId, contractEventId, entries, loading, onChanged, reloadOperations }: Props) {
  const network = useContractNetwork();
  const tx = useTransaction({ getErrorMessage: getManageTransactionErrorMessage });
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const busy = tx.isBusy || removing !== null;
  const locked = busy || !network.onContractChain;

  async function addScanner() {
    setError(null);
    setInfo(null);
    tx.reset();

    const parsed = parseWalletList(text, 1);
    if (parsed.error) {
      setError(
        parsed.wallets.length > 1
          ? "Add one scanner at a time."
          : parsed.error,
      );
      return;
    }

    const wallet = parsed.wallets[0];
    if (entries.some((entry) => entry.wallet.toLowerCase() === wallet)) {
      setInfo("That wallet is already a scanner for this event.");
      return;
    }

    try {
      await addScannerApi(eventId, wallet);
    } catch (err) {
      setError(manageApiErrorMessage(err));
      return;
    }

    setSuccess(`${shortAddress(wallet)} can now check in tickets.`);
    const outcome = await tx.run([
      {
        label: "Allow the wallet to check in tickets",
        request: { ...nft, functionName: "setEventScanner", args: [contractEventId, wallet, true] },
      },
    ]);

    if (outcome === "success") {
      setText("");
      await Promise.all([reloadOperations(), onChanged()]);
    } else if (outcome === "stoppedWaiting") {
      // The transaction was sent and may still confirm; keep the Pending row for the listener
      setText("");
      await reloadOperations();
    } else {
      // Nothing was sent (rejected in the wallet or the check before sending failed)
      await removeScannerApi(eventId, wallet).catch(() => undefined);
      await reloadOperations();
    }
  }

  async function removeScanner(wallet: string) {
    setError(null);
    setInfo(null);
    tx.reset();
    setRemoving(wallet);
    setSuccess(`${shortAddress(wallet)} can no longer check in tickets.`);

    const outcome = await tx.run([
      {
        label: "Remove the scanner",
        request: { ...nft, functionName: "setEventScanner", args: [contractEventId, wallet, false] },
      },
    ]);

    if (outcome === "success") {
      // The listener removes the row when it sees the chain event; a 404 here is expected
      try {
        await removeScannerApi(eventId, wallet);
      } catch {
        // The chain is the source of truth and the row refreshes from the listener
      }
      await Promise.all([reloadOperations(), onChanged()]);
    } else if (outcome === "stoppedWaiting") {
      // The removal was sent and may still confirm; the listener will drop the row
      await reloadOperations();
    }
    setRemoving(null);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle>Scanners</CardTitle>
          <CardDescription>Choose who can check tickets in at the door. Scanners are saved here and on-chain.</CardDescription>
        </div>
        <Badge tone="neutral">
          {entries.length.toLocaleString("en-US")} {entries.length === 1 ? "scanner" : "scanners"}
        </Badge>
      </CardHeader>

      <Field
        label="Add a scanner"
        helper="The wallet needs a platform account. You can add one scanner at a time."
        error={error}
      >
        {(props) => (
          <Input
            {...props}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (error) setError(null);
            }}
            disabled={locked}
            placeholder="0x1234…"
            className="font-mono"
          />
        )}
      </Field>

      <div>
        <Button
          onClick={addScanner}
          loading={tx.isBusy && tx.state.steps.some((step) => step.includes("check in"))}
          disabled={locked || text.trim() === ""}
        >
          <Plus aria-hidden="true" />
          Add scanner
        </Button>
      </div>

      {info && <Alert tone="info" title="Already a scanner">{info}</Alert>}

      {loading ? (
        <p className="type-body-sm text-muted-foreground" role="status">
          Loading scanners…
        </p>
      ) : entries.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center type-body-sm text-secondary-foreground">
          No scanners yet. Add the first one above.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="font-mono type-body-sm text-foreground" title={entry.wallet}>
                  {shortAddress(entry.wallet)}
                </span>
                <Badge tone={entry.synced_to_chain ? "success" : "warning"}>{entry.synced_to_chain ? "On-chain" : "Pending"}</Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeScanner(entry.wallet)}
                disabled={locked}
                loading={removing === entry.wallet}
              >
                <Trash2 aria-hidden="true" />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <TransactionStatus
        state={tx.state}
        explorerUrl={tx.explorerUrl}
        successMessage={success ?? "Scanners updated."}
        onStopWaiting={tx.stopWaiting}
      />
    </Card>
  );
}
