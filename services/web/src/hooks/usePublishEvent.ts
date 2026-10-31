"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { erc20Abi, keccak256, parseUnits, stringToHex, type Address, type PublicClient } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { useTransaction } from "@/hooks/useTransaction";
import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import type { ChainSettings, SaleRulesForm } from "@/lib/create-event";
import { toChainSettings } from "@/lib/create-event";
import { fetchDraft, freezeDraft, publishDraft, type DraftEvent } from "@/lib/create-event-api";
import {
  contractEventIdFor,
  getApiStepErrorMessage,
  getPublishErrorMessage,
  planPublish,
  stageForTxLabel,
  TX_LABELS,
  type ChainEventState,
  type PublishPlan,
  type PublishStage,
} from "@/lib/publish-event";
import { USDC_DECIMALS } from "@/lib/token-amount";
import type { TxStep } from "@/lib/transactions/types";

const ORGANIZER_ROLE = keccak256(stringToHex("ORGANIZER_ROLE"));
const nft = { address: TICKET_NFT_ADDRESS, abi: ticketNftAbi } as const;

type EventConfigResult = [endTime: bigint, resaleCapBps: bigint, ticketTypeCount: bigint, sold: bigint, configured: boolean, active: boolean, perWalletLimit: bigint];
type TicketTypeResult = [price: bigint, maxSupply: bigint, sold: bigint, issued: bigint, metadataURI: string];

interface ChainRead {
  event: ChainEventState;
  hasOrganizerRole: boolean;
  usdcDecimals: number;
}

// Everything the plan needs from TicketNFT, read from the contract's own network (not the
// wallet's), so it works while the wallet is on another network
async function readChain(client: PublicClient, contractEventId: bigint, wallet: Address): Promise<ChainRead> {
  const read = <T>(functionName: string, args: readonly unknown[] = []) => client.readContract({ ...nft, functionName, args }) as Promise<T>;

  const [organizer, config, royalty, presale, hasRole, usdc] = await Promise.all([
    read<Address>("eventOrganizer", [contractEventId]),
    read<EventConfigResult>("eventConfigs", [contractEventId]),
    read<bigint>("royaltyPercentage", [contractEventId]),
    read<boolean>("presaleActive", [contractEventId]),
    read<boolean>("hasRole", [ORGANIZER_ROLE, wallet]),
    read<Address>("usdcToken"),
  ]);
  const [endTime, resaleCapBps, typeCount, sold, configured, active, perWalletLimit] = config;

  const [types, decimals] = await Promise.all([
    Promise.all(Array.from({ length: Number(typeCount) }, (_, i) => read<TicketTypeResult>("ticketTypes", [contractEventId, BigInt(i)]))),
    client.readContract({ address: usdc, abi: erc20Abi, functionName: "decimals" }),
  ]);

  return {
    event: {
      organizer,
      configured,
      active,
      presale,
      sold: Number(sold),
      endTime,
      royaltyBps: royalty,
      resaleCapBps,
      perWalletLimit,
      typeUris: types.map((t) => t[4]),
    },
    hasOrganizerRole: hasRole,
    usdcDecimals: Number(decimals),
  };
}

function typeUris(event: DraftEvent): (string | null)[] {
  return event.ticket_types.map((t) => (t.ipfs_hash ? `ipfs://${t.ipfs_hash}` : null));
}

// configureEvent's arguments for these rules. Once tickets sold the contract's rules are final,
// so they're used as they are (they may not be whole minutes if an admin changed them).
function settingsFor(rules: SaleRulesForm, chain: ChainEventState | null): ChainSettings | null {
  if (chain && chain.sold > 0 && chain.configured) {
    return { endTime: chain.endTime, royaltyBps: chain.royaltyBps, resaleCapBps: chain.resaleCapBps, perWalletLimit: chain.perWalletLimit };
  }
  return toChainSettings(rules);
}

interface Options {
  event: DraftEvent | null;
  image: File | null;
  onEventChange: (event: DraftEvent) => void; // after freeze and publish
}

// Freeze and publish (#193): freeze in the API (pins details, image and ticket types to IPFS),
// configureEvent, addTicketType for each type, the presale, setSaleActive, then publish in the
// API. Every run re-reads the API and the contract first and skips what's done, so the organizer
// can stop at any step, leave, and continue later (Figma: "You can leave this page between steps").
export function usePublishEvent({ event, image, onEventChange }: Options) {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: TICKET_NFT_CHAIN_ID });
  const tx = useTransaction({ getErrorMessage: getPublishErrorMessage });

  const contractEventId = event ? contractEventIdFor(event.id) : null;

  const chain = useQuery({
    queryKey: ["create-event-chain", TICKET_NFT_CHAIN_ID, contractEventId?.toString(), address],
    queryFn: () => readChain(client as PublicClient, contractEventId as bigint, address as Address),
    enabled: Boolean(client && contractEventId !== null && address),
    refetchOnWindowFocus: false,
  });

  // An API step that's running or failed (the contract steps report through tx.state)
  // stage is null for a failed read before any step started
  const [apiStep, setApiStep] = useState<{ stage: "freeze" | "publish" | null; error: string | null } | null>(null);
  const [running, setRunning] = useState(false);

  // What's left to do with these sale rules, from the last contract read
  function planFor(rules: SaleRulesForm): PublishPlan | null {
    const wanted = settingsFor(rules, chain.data?.event ?? null);
    if (!event || !chain.data || !wanted || !address) return null;
    return planPublish({ status: event.status, wallet: address, chain: chain.data.event, wanted, typeUris: typeUris(event), presale: rules.presale });
  }

  async function run(rules: SaleRulesForm): Promise<boolean> {
    if (!event || !address || !client || contractEventId === null || running || tx.isBusy) return false;
    if (chainId !== TICKET_NFT_CHAIN_ID) return false; // the page asks to switch networks first
    setRunning(true);
    setApiStep(null);
    tx.reset();
    try {
      // 1. Freeze: pins the details, the cover image and each ticket type to IPFS
      let current = await fetchDraft(event.id);
      if (current.status === "DRAFT") {
        if (!image) {
          setApiStep({ stage: "freeze", error: "Add a cover image in Details before publishing." });
          return false;
        }
        setApiStep({ stage: "freeze", error: null });
        try {
          await freezeDraft(event.id, image);
        } catch (err) {
          setApiStep({ stage: "freeze", error: getApiStepErrorMessage("freeze", err) });
          // It may have frozen anyway (e.g. the response was lost): show the real status
          onEventChange(await fetchDraft(event.id).catch(() => current));
          return false;
        }
        current = await fetchDraft(event.id);
        onEventChange(current);
        setApiStep(null);
      }

      // 2. The contract steps still to do, from what the contract has now
      const fresh = await readChain(client as PublicClient, contractEventId, address);
      await chain.refetch();
      const wanted = settingsFor(rules, fresh.event);
      if (!wanted) {
        setApiStep({ stage: null, error: "Check the sale rules: some values are invalid." });
        return false;
      }
      const freshPlan = planPublish({
        status: current.status,
        wallet: address,
        chain: fresh.event,
        wanted,
        typeUris: typeUris(current),
        presale: rules.presale,
      });
      if (freshPlan.blocked) return false; // the page explains the block from planFor()
      if (current.ticket_types.some((t) => !t.ipfs_hash)) {
        setApiStep({ stage: null, error: "Some ticket types weren't uploaded to IPFS when the event froze. Contact an admin." });
        return false;
      }

      const steps: TxStep[] = [];
      if (freshPlan.configure) {
        steps.push({
          label: TX_LABELS.configure,
          request: {
            ...nft,
            functionName: "configureEvent",
            args: [contractEventId, wanted.endTime, wanted.royaltyBps, wanted.resaleCapBps, wanted.perWalletLimit],
          },
        });
      }
      current.ticket_types.slice(freshPlan.addTypesFrom).forEach((type) => {
        steps.push({
          label: TX_LABELS.addType(type.name),
          request: {
            ...nft,
            functionName: "addTicketType",
            args: [contractEventId, parseUnits(type.price, fresh.usdcDecimals), BigInt(type.supply), `ipfs://${type.ipfs_hash}`],
          },
        });
      });
      // Before opening sales, so no one outside the guest list can buy in between
      if (freshPlan.setPresale !== null) {
        steps.push({
          label: freshPlan.setPresale ? TX_LABELS.presaleOn : TX_LABELS.presaleOff,
          request: { ...nft, functionName: "setPresaleActive", args: [contractEventId, freshPlan.setPresale] },
        });
      }
      if (freshPlan.openSales) {
        steps.push({ label: TX_LABELS.openSales, request: { ...nft, functionName: "setSaleActive", args: [contractEventId, true] } });
      }

      if (steps.length > 0) {
        const ok = await tx.run(steps);
        await chain.refetch();
        if (!ok) return false;
      }

      // 3. Publish: the event becomes public in the API, linked to its on-chain ID
      if (freshPlan.publish) {
        setApiStep({ stage: "publish", error: null });
        try {
          await publishDraft(event.id, contractEventId);
        } catch (err) {
          setApiStep({ stage: "publish", error: getApiStepErrorMessage("publish", err) });
          return false;
        }
        setApiStep(null);
      }
      onEventChange(await fetchDraft(event.id));
      return true;
    } catch {
      // Reading the event or the contract failed, between steps; nothing new was sent
      setApiStep({ stage: null, error: "Couldn't read the event's current state. Check your connection, then press Continue publishing." });
      return false;
    } finally {
      setRunning(false);
    }
  }

  // The row that's running or failed: an API step, or the contract step the wallet is on
  let current: { stage: PublishStage; failed: boolean } | null = null;
  if (apiStep?.stage) {
    current = { stage: apiStep.stage, failed: apiStep.error !== null };
  } else if (tx.state.phase !== "idle" && tx.state.phase !== "success" && tx.state.steps.length > 0) {
    current = { stage: stageForTxLabel(tx.state.steps[tx.state.stepIndex]), failed: tx.state.phase === "error" || tx.state.phase === "stoppedWaiting" };
  }

  return {
    contractEventId,
    chain: chain.data ?? null,
    chainLoading: chain.isPending && chain.fetchStatus !== "idle",
    chainError: chain.error ? "Could not read the contract. Check your connection and try again." : null,
    reloadChain: () => chain.refetch(),
    usdcDecimals: chain.data?.usdcDecimals ?? USDC_DECIMALS,
    onContractChain: chainId === TICKET_NFT_CHAIN_ID,
    planFor,
    run,
    running: running || tx.isBusy,
    tx,
    current,
    apiError: apiStep?.error ?? null,
    clearError: () => {
      setApiStep(null);
      tx.reset();
    },
  };
}
