"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { TransactionStatus } from "@/components/TransactionStatus";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useContractNetwork } from "@/hooks/useContractNetwork";
import { useTransaction } from "@/hooks/useTransaction";
import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import { shortAddress } from "@/lib/format";
import {
  addToWhitelist as addWhitelistApi,
  manageApiErrorMessage,
  parseWalletList,
  removeFromWhitelist as removeWhitelistApi,
  walletsMissingFrom,
  type WhitelistEntry,
} from "@/lib/organizer-manage";
import { getManageTransactionErrorMessage } from "@/lib/organizer-manage-errors";

const nft = { address: TICKET_NFT_ADDRESS, abi: ticketNftAbi, chainId: TICKET_NFT_CHAIN_ID } as const;

interface Props {
  eventId: string;
  contractEventId: bigint;
  entries: WhitelistEntry[];
  loading: boolean;
  presaleActive: boolean;
  onChanged: () => void | Promise<void>;
  reloadOperations: () => Promise<void>;
  refetchChain: () => Promise<unknown>;
}

// Guest list and presale (#191): wallets are saved in the API first (it checks they have a
// platform account), then batchAddToWhitelist() runs from the organizer's wallet. If nothing was
// sent, the new database rows are removed again. If the organizer stops waiting, they stay
// Pending because the transaction may still confirm and the listener will mark them.
export function WhitelistCard({
  eventId,
  contractEventId,
  entries,
  loading,
  presaleActive,
  onChanged,
  reloadOperations,
  refetchChain,
}: Props) {
  const network = useContractNetwork();
  const tx = useTransaction({ getErrorMessage: getManageTransactionErrorMessage });
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [apiBusy, setApiBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const busy = tx.isBusy || apiBusy || removing !== null;
  const locked = busy || !network.onContractChain;

  async function addWallets() {
    setError(null);
    setInfo(null);
    tx.reset();
    const parsed = parseWalletList(text);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }

    const fresh = walletsMissingFrom(entries, parsed.wallets);
    if (fresh.length === 0) {
      setInfo("Those wallets are already on the guest list.");
      return;
    }

    setApiBusy(true);
    try {
      await addWhitelistApi(eventId, fresh);
    } catch (err) {
      setError(manageApiErrorMessage(err));
      setApiBusy(false);
      return;
    }

    const ignored =
      parsed.duplicates > 0
        ? ` ${parsed.duplicates} duplicate ${parsed.duplicates === 1 ? "entry was" : "entries were"} ignored.`
        : "";
    setSuccess(`${fresh.length} ${fresh.length === 1 ? "wallet" : "wallets"} added to the guest list.${ignored}`);

    const outcome = await tx.run([
      {
        label: fresh.length === 1 ? "Add wallet to the guest list" : "Add wallets to the guest list",
        request: { ...nft, functionName: "batchAddToWhitelist", args: [contractEventId, fresh] },
      },
    ]);

    if (outcome === "success") {
      setText("");
      await Promise.all([reloadOperations(), onChanged()]);
    } else if (outcome === "stoppedWaiting") {
      // The transaction was sent and may still confirm; keep the Pending rows for the listener
      setText("");
      await reloadOperations();
    } else {
      // Nothing was sent (rejected in the wallet or the check before sending failed)
      await Promise.allSettled(fresh.map((wallet) => removeWhitelistApi(eventId, wallet)));
      await reloadOperations();
    }
    setApiBusy(false);
  }

  async function removeWallet(wallet: string) {
    setError(null);
    setInfo(null);
    tx.reset();
    setRemoving(wallet);
    setSuccess(`${shortAddress(wallet)} removed from the guest list.`);

    const outcome = await tx.run([
      {
        label: "Remove wallet from the guest list",
        request: { ...nft, functionName: "removeFromWhitelist", args: [contractEventId, wallet] },
      },
    ]);

    if (outcome === "success") {
      // The listener also removes the row when it sees the event; a 404 here is expected
      try {
        await removeWhitelistApi(eventId, wallet);
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

  async function togglePresale(next: boolean) {
    setError(null);
    setInfo(null);
    tx.reset();
    setSuccess(next ? "Presale is on. Only guest-list wallets can buy." : "Presale is off. Anyone can buy while sales are open.");

    const outcome = await tx.run([
      {
        label: next ? "Turn on the presale" : "Turn off the presale",
        request: { ...nft, functionName: "setPresaleActive", args: [contractEventId, next] },
      },
    ]);
    if (outcome !== "success") return;
    await Promise.all([refetchChain(), onChanged()]);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle>Guest list & presale</CardTitle>
          <CardDescription>Choose who can buy during the presale. The list is saved here and on-chain.</CardDescription>
        </div>
        <Badge tone="neutral">
          {entries.length.toLocaleString("en-US")} {entries.length === 1 ? "wallet" : "wallets"}
        </Badge>
      </CardHeader>

      <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-background/50 p-4">
        <div className="flex flex-col gap-0.5">
          <p id="presale-label" className="type-body-md-strong text-foreground">
            Presale
          </p>
          <p className="type-body-sm text-secondary-foreground">
            {presaleActive ? "On — only wallets on this list can buy." : "Off — anyone can buy while sales are open."}
          </p>
        </div>
        <Switch
          checked={presaleActive}
          onCheckedChange={togglePresale}
          disabled={locked}
          aria-labelledby="presale-label"
        />
      </div>

      <Field
        label="Add wallets"
        helper="One address per line, or separated by commas. Up to 100 at a time. Each wallet needs a platform account."
        error={error}
      >
        {(props) => (
          <Textarea
            {...props}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (error) setError(null);
            }}
            disabled={locked}
            placeholder={"0x1234…\n0xabcd…"}
            className="font-mono text-sm"
          />
        )}
      </Field>

      <div>
        <Button onClick={addWallets} loading={apiBusy || (tx.isBusy && tx.state.steps.some((step) => step.includes("guest list")))} disabled={locked || text.trim() === ""}>
          <Plus aria-hidden="true" />
          Add to guest list
        </Button>
      </div>

      {info && <Alert tone="info" title="Already on the guest list">{info}</Alert>}

      {loading ? (
        <p className="type-body-sm text-muted-foreground" role="status">
          Loading the guest list…
        </p>
      ) : entries.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center type-body-sm text-secondary-foreground">
          No wallets yet. Add the first one above.
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
                onClick={() => removeWallet(entry.wallet)}
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
        successMessage={success ?? "Guest list updated."}
        onStopWaiting={tx.stopWaiting}
      />
    </Card>
  );
}
