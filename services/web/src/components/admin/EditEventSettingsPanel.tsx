"use client";

import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, Info, X } from "lucide-react";
import { useState } from "react";
import { useAccount, useChains, useReadContracts, useSwitchChain } from "wagmi";

import { TransactionStatus } from "@/components/TransactionStatus";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useTransaction } from "@/hooks/useTransaction";
import {
  formToSettings,
  getSettingsErrorMessage,
  resaleCapChoices,
  salesEndHint,
  sameSettings,
  SETTINGS_ERRORS,
  settingsArgs,
  settingsFromChain,
  settingsToForm,
  validateSettings,
  type AdminEvent,
  type EventConfigResult,
  type EventSettings,
  type SettingsForm,
} from "@/lib/admin-events";
import { organizerAccountName } from "@/lib/admin-organizers";
import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import { localInputFromMs, type FieldErrors } from "@/lib/create-event";
import { shortAddress } from "@/lib/format";

const nft = { address: TICKET_NFT_ADDRESS, abi: ticketNftAbi, chainId: TICKET_NFT_CHAIN_ID } as const;

interface EditEventSettingsPanelProps {
  event: AdminEvent; // a live event: it has a contract_event_id
  hasAdminRole: boolean | undefined;
  onClose: () => void;
  onSaved: (settings: EventSettings) => void; // the transaction confirmed
}

// Side panel of the admin Events tab (Figma "Admin / Events – Edit settings open", #296): royalty,
// resale cap, per-wallet limit and sales end. Saving calls adminUpdateEventSettings() (#294) from
// the admin's wallet; the listener then copies the new settings to the API.
export function EditEventSettingsPanel({ event, hasAdminRole, onClose, onSaved }: EditEventSettingsPanelProps) {
  const eventId = BigInt(event.contract_event_id ?? 0);

  // The call replaces all four settings, so start from the contract's values of this moment, not
  // from the API's copy. Nothing is kept between openings, and they don't change while editing.
  const reads = useReadContracts({
    contracts: [
      { ...nft, functionName: "eventConfigs", args: [eventId] },
      { ...nft, functionName: "royaltyPercentage", args: [eventId] },
    ],
    allowFailure: false,
    query: { gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false },
  });
  const [config, royalty] = (reads.isFetchedAfterMount ? (reads.data ?? []) : []) as [EventConfigResult?, bigint?];
  const current = config !== undefined && royalty !== undefined ? settingsFromChain(config, royalty) : undefined;

  const transaction = useTransaction({ getErrorMessage: getSettingsErrorMessage });

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        // Never hide a transaction that is still in progress
        if (!next && !transaction.isBusy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/60 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-border bg-card shadow-[-24px_0_48px_rgb(0_0_0/0.35)] outline-none transition-transform duration-200 data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full">
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-6 sm:px-8">
            <div className="flex min-w-0 flex-col gap-2">
              <Badge tone="warning" className="max-w-full type-mono-tag">
                <span className="truncate">{event.title}</span>
              </Badge>
              <Dialog.Title className="type-heading-md text-foreground">Edit event settings</Dialog.Title>
              <Dialog.Description className="type-body-md text-secondary-foreground">
                {organizerAccountName(event.organizer)} ·{" "}
                <span className="font-mono" title={event.organizer.wallet}>
                  {shortAddress(event.organizer.wallet)}
                </span>
              </Dialog.Description>
            </div>
            <Dialog.Close
              disabled={transaction.isBusy}
              className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-muted text-secondary-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
              aria-label="Close"
            >
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          {current === undefined ? (
            <div className="flex flex-1 flex-col gap-4 px-6 py-6 sm:px-8">
              {reads.isError ? (
                <Alert
                  tone="error"
                  title="Couldn't read the event's settings"
                  action={
                    <Button size="sm" variant="outline" onClick={() => void reads.refetch()}>
                      Try again
                    </Button>
                  }
                >
                  The current settings come from the contract. Check your connection and try again.
                </Alert>
              ) : (
                <p className="flex items-center gap-2 type-body-md text-secondary-foreground" role="status">
                  <Spinner /> Reading the current settings from the contract…
                </p>
              )}
            </div>
          ) : current === null ? (
            <div className="flex flex-1 flex-col gap-4 px-6 py-6 sm:px-8">
              <Alert tone="error" title="Nothing to edit yet">
                {SETTINGS_ERRORS.notConfigured}
              </Alert>
            </div>
          ) : (
            <SettingsFormBody
              event={event}
              current={current}
              hasAdminRole={hasAdminRole}
              transaction={transaction}
              onClose={onClose}
              onSaved={onSaved}
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface SettingsFormBodyProps {
  event: AdminEvent;
  current: EventSettings; // the contract's settings when the panel opened
  hasAdminRole: boolean | undefined;
  transaction: ReturnType<typeof useTransaction>;
  onClose: () => void;
  onSaved: (settings: EventSettings) => void;
}

function SettingsFormBody({ event, current, hasAdminRole, transaction, onClose, onSaved }: SettingsFormBodyProps) {
  const { chainId } = useAccount();
  const { switchChain, isPending: switchingNetwork } = useSwitchChain();
  const networkName = useChains().find((chain) => chain.id === TICKET_NFT_CHAIN_ID)?.name ?? "the contract's network";
  const onContractChain = chainId === TICKET_NFT_CHAIN_ID;

  const [form, setForm] = useState<SettingsForm>(() => settingsToForm(current));
  const [errors, setErrors] = useState<FieldErrors<keyof SettingsForm>>({});
  const [checked, setChecked] = useState(false); // after the first Save, errors follow the typing
  const [openedAt] = useState(() => Date.now());

  const busy = transaction.isBusy;
  const done = transaction.state.phase === "success";
  const locked = busy || done;
  const next = formToSettings(form, current);
  const unchanged = next !== null && sameSettings(next, current);
  const canSave = onContractChain && hasAdminRole === true && !unchanged;

  function change<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    const updated = { ...form, [key]: value };
    setForm(updated);
    if (checked) setErrors(validateSettings(updated, current, Date.now()));
    if (transaction.state.phase === "error" || transaction.state.phase === "stoppedWaiting") transaction.reset();
  }

  async function save() {
    const found = validateSettings(form, current, Date.now());
    setChecked(true);
    setErrors(found);
    const settings = formToSettings(form, current);
    if (Object.keys(found).length > 0 || settings === null || !event.contract_event_id) return;

    const confirmed = await transaction.run([
      {
        label: `Update the settings of ${event.title}`,
        request: {
          address: TICKET_NFT_ADDRESS,
          abi: ticketNftAbi,
          functionName: "adminUpdateEventSettings",
          args: settingsArgs(event.contract_event_id, settings),
        },
      },
    ]);
    if (confirmed) onSaved(settings);
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!locked && canSave) void save();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-6 *:shrink-0 sm:px-8">
        <Field label="Royalty (%)" helper="Paid to the organizer on every resale, max 100%" error={errors.royaltyPercent}>
          {(props) => (
            <WithSuffix suffix="%">
              <Input
                {...props}
                inputMode="decimal"
                className="pr-10 font-mono"
                value={form.royaltyPercent}
                disabled={locked}
                onChange={(e) => change("royaltyPercent", e.target.value)}
              />
            </WithSuffix>
          )}
        </Field>

        <Field label="Resale cap" helper="Applies before sales end, to unused tickets only" error={errors.resaleCapBps}>
          {(props) => (
            <Select {...props} value={String(form.resaleCapBps)} disabled={locked} onChange={(e) => change("resaleCapBps", Number(e.target.value))}>
              {resaleCapChoices(current.resaleCapBps).map((choice) => (
                <option key={choice.bps} value={choice.bps}>
                  {choice.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Per-wallet limit" helper="Max tickets one wallet can buy. 0 = no limit" error={errors.perWalletLimit}>
          {(props) => (
            <WithSuffix suffix="tickets">
              <Input
                {...props}
                inputMode="numeric"
                className="pr-20 font-mono"
                value={form.perWalletLimit}
                disabled={locked}
                onChange={(e) => change("perWalletLimit", e.target.value)}
              />
            </WithSuffix>
          )}
        </Field>

        <Field label="Sales end" helper={salesEndHint(form, current, openedAt)} error={errors.salesEnd}>
          {(props) => (
            <Input
              {...props}
              type="datetime-local"
              min={localInputFromMs(openedAt)}
              className="[color-scheme:dark]"
              value={form.salesEnd}
              disabled={locked}
              onChange={(e) => change("salesEnd", e.target.value)}
            />
          )}
        </Field>

        <p className="flex gap-3 rounded-sm border border-border bg-background px-4 py-3 type-body-md text-secondary-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            You&apos;re editing as admin. The organizer and ticket holders will see this change. Only change settings when
            necessary.
          </span>
        </p>

        {!onContractChain ? (
          <Alert
            tone="warning"
            title="Switch network to save"
            action={
              <Button type="button" size="sm" onClick={() => switchChain({ chainId: TICKET_NFT_CHAIN_ID })} loading={switchingNetwork}>
                Switch network
              </Button>
            }
          >
            Your wallet is on a different network. Switch to {networkName} to change the settings.
          </Alert>
        ) : (
          hasAdminRole === false && (
            <Alert tone="error" title="Admin wallet required">
              {SETTINGS_ERRORS.notAdmin}
            </Alert>
          )
        )}

        <TransactionStatus
          state={transaction.state}
          explorerUrl={transaction.explorerUrl}
          successMessage="Settings updated on-chain. The organizer and ticket holders see them now."
          onStopWaiting={transaction.stopWaiting}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-border bg-background/40 px-6 py-5 sm:px-8">
        {done ? (
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <div className="flex gap-3">
              <Button type="submit" className="flex-1" loading={busy} disabled={!canSave}>
                Save changes <ArrowRight aria-hidden="true" />
              </Button>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
            </div>
            <p className="text-center type-body-sm text-secondary-foreground">
              {onContractChain && hasAdminRole === undefined
                ? "Checking your wallet's admin role…"
                : unchanged
                  ? "Change a setting to save."
                  : "Saving sends a transaction from your wallet."}
            </p>
          </>
        )}
      </div>
    </form>
  );
}

// An input with its unit at the right edge ("%", "tickets")
function WithSuffix({ suffix, children }: { suffix: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 type-body-md text-secondary-foreground" aria-hidden="true">
        {suffix}
      </span>
    </div>
  );
}
