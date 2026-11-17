"use client";

import { Gift, Ticket } from "lucide-react";
import { useMemo, useState } from "react";

import { TransactionStatus } from "@/components/TransactionStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/input";
import { useContractNetwork } from "@/hooks/useContractNetwork";
import { useTransaction } from "@/hooks/useTransaction";
import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import { buildTiers, type ApiTicketType, type OnChainTicketType } from "@/lib/event-details";
import { formatTokenAmount } from "@/lib/token-amount";
import {
  MANAGE_ERRORS,
  getManageTransactionErrorMessage,
} from "@/lib/organizer-manage-errors";
import { MAX_BATCH_SIZE, parseWalletList } from "@/lib/organizer-manage";

const nft = { address: TICKET_NFT_ADDRESS, abi: ticketNftAbi, chainId: TICKET_NFT_CHAIN_ID } as const;

interface Props {
  contractEventId: bigint;
  ticketTypes: ApiTicketType[];
  chainTiers: OnChainTicketType[] | null;
  usdcDecimals: number;
  onChanged: () => void | Promise<void>;
  onIssued: () => void | Promise<void>;
  refetchChain: () => Promise<unknown>;
}

// Free tickets (#192): issueTickets() mints tickets of one type to a batch of wallets from the
// organizer's wallet. Issued tickets count toward the type's supply, skip the guest list, and
// appear in the recipients' My Tickets once the listener saves them.
export function IssueTicketsCard({
  contractEventId,
  ticketTypes,
  chainTiers,
  usdcDecimals,
  onChanged,
  onIssued,
  refetchChain,
}: Props) {
  const network = useContractNetwork();
  const tx = useTransaction({ getErrorMessage: getManageTransactionErrorMessage });
  const tiers = useMemo(
    () => buildTiers(ticketTypes, chainTiers, usdcDecimals),
    [ticketTypes, chainTiers, usdcDecimals],
  );

  const [typeKey, setTypeKey] = useState("");
  const selected = tiers.find((tier) => tier.key === typeKey) ?? tiers.find((tier) => tier.remaining > 0) ?? tiers[0] ?? null;
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const locked = tx.isBusy || !network.onContractChain;
  const parsed = text.trim() === "" ? null : parseWalletList(text);
  const recipients = parsed && !parsed.error ? parsed.wallets : [];
  const left = selected ? selected.remaining : 0;

  async function issue() {
    setError(null);
    tx.reset();

    const result = parseWalletList(text);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (!selected) {
      setError(MANAGE_ERRORS.noTicketTypes);
      return;
    }
    if (result.wallets.length > left) {
      setError(MANAGE_ERRORS.notEnoughTickets);
      return;
    }

    setSuccess(
      `${result.wallets.length} free ${result.wallets.length === 1 ? "ticket" : "tickets"} of ${selected.name} issued.`,
    );
    const outcome = await tx.run([
      {
        label: result.wallets.length === 1 ? "Issue a free ticket" : "Issue free tickets",
        request: {
          ...nft,
          functionName: "issueTickets",
          args: [contractEventId, BigInt(selected.typeId), result.wallets],
        },
      },
    ]);
    if (outcome !== "success") return;

    setText("");
    // The listener needs a few seconds to save the minted tickets; ask the table to keep refreshing
    await Promise.all([refetchChain(), onChanged(), onIssued()]);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle>Free tickets</CardTitle>
          <CardDescription>
            Issue complimentary tickets to one wallet or a batch. They count toward the ticket type&apos;s supply.
          </CardDescription>
        </div>
        <Badge tone="highlight">Comps</Badge>
      </CardHeader>

      {chainTiers === null ? (
        <p className="flex items-center gap-2 type-body-md text-secondary-foreground" role="status">
          <Ticket className="size-4 text-muted-foreground" aria-hidden="true" />
          Reading this event&apos;s ticket types…
        </p>
      ) : tiers.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center type-body-sm text-secondary-foreground">
          This event has no ticket types yet. Publish it before issuing free tickets.
        </p>
      ) : (
        <>
          <Field label="Ticket type" helper={selected ? `${left.toLocaleString("en-US")} of ${selected.supply.toLocaleString("en-US")} tickets left · ${formatTokenAmount(selected.price, usdcDecimals)} USDC face value` : undefined}>
            {(props) => (
              <Select
                {...props}
                value={selected?.key ?? ""}
                onChange={(event) => {
                  setTypeKey(event.target.value);
                  setError(null);
                }}
                disabled={locked}
              >
                {tiers.map((tier) => (
                  <option key={tier.key} value={tier.key}>
                    {tier.name} — {tier.remaining.toLocaleString("en-US")} left
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="Recipients"
            helper={`One address per line, or separated by commas. Up to ${MAX_BATCH_SIZE} at a time. Each wallet gets one ticket.`}
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

          {parsed && !parsed.error && (
            <p className="type-body-sm text-muted-foreground" aria-live="polite">
              {recipients.length} {recipients.length === 1 ? "ticket" : "tickets"} will be issued
              {parsed.duplicates > 0
                ? ` · ${parsed.duplicates} duplicate ${parsed.duplicates === 1 ? "entry" : "entries"} ignored`
                : ""}
              .
            </p>
          )}

          <div>
            <Button
              onClick={issue}
              loading={tx.isBusy && tx.state.steps.some((step) => step.includes("ticket"))}
              disabled={locked || recipients.length === 0}
            >
              <Gift aria-hidden="true" />
              Issue free tickets
            </Button>
          </div>

        </>
      )}

      <TransactionStatus
        state={tx.state}
        explorerUrl={tx.explorerUrl}
        successMessage={success ?? "Free tickets issued."}
        onStopWaiting={tx.stopWaiting}
      />
    </Card>
  );
}
