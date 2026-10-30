"use client";

import { erc20Abi, type Address } from "viem";
import { useBalance, useGasPrice, useReadContract, useReadContracts } from "wagmi";
import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import type { OnChainTicketType } from "@/lib/event-details";
import { USDC_DECIMALS } from "@/lib/token-amount";

// Event rules as the contract stores them (eventConfigs, presaleActive, royaltyPercentage)
export interface OnChainEvent {
  configured: boolean;
  saleActive: boolean;
  endTime: number; // unix seconds
  resaleCapBps: number; // 0 = no cap, 20000 = 2x face value
  royaltyBps: number; // 1000 = 10%
  perWalletLimit: number; // 0 = no limit
  presaleActive: boolean;
}

// What the connected wallet can do for this event
export interface WalletOnChain {
  whitelisted: boolean;
  held: number; // tickets it already holds for the event
  usdcBalance: bigint;
  allowance: bigint; // USDC the contract may already take
  ethBalance: bigint;
}

// Supply and sales change while the page is open, so the reads refresh on their own
const REFRESH_MS = 15_000;

const nft = { address: TICKET_NFT_ADDRESS, abi: ticketNftAbi, chainId: TICKET_NFT_CHAIN_ID } as const;

// eventConfigs(id) returns the struct's fields in order
type EventConfigResult = [endTime: bigint, resaleCapBps: bigint, ticketTypeCount: bigint, sold: bigint, configured: boolean, active: boolean, perWalletLimit: bigint];
// ticketTypes(id, typeId)
type TicketTypeResult = [price: bigint, maxSupply: bigint, sold: bigint, issued: bigint, metadataURI: string];

// Reads everything the event page needs from TicketNFT and USDC (#284).
// Reads always go to the contract's own network (TICKET_NFT_CHAIN_ID), so the page works
// before a wallet is connected. Wallet values are only read once an address is known.
export function useEventOnChain(contractEventId: bigint | null, wallet: Address | undefined) {
  const id = contractEventId ?? BigInt(0);
  const hasEvent = contractEventId !== null;

  // 1. The event's rules and the USDC token address
  const eventReads = useReadContracts({
    contracts: [
      { ...nft, functionName: "eventConfigs", args: [id] },
      { ...nft, functionName: "presaleActive", args: [id] },
      { ...nft, functionName: "royaltyPercentage", args: [id] },
      { ...nft, functionName: "usdcToken" },
    ],
    allowFailure: false,
    query: { enabled: hasEvent, refetchInterval: REFRESH_MS },
  });

  const [config, presaleActive, royalty, usdcToken] = (eventReads.data ?? []) as [EventConfigResult?, boolean?, bigint?, Address?];
  const typeCount = config ? Number(config[2]) : 0;

  // 2. Each ticket type (IDs 0 .. ticketTypeCount - 1)
  const typeReads = useReadContracts({
    contracts: Array.from({ length: typeCount }, (_, typeId) => ({
      ...nft,
      functionName: "ticketTypes",
      args: [id, BigInt(typeId)],
    })),
    allowFailure: false,
    query: { enabled: hasEvent && typeCount > 0, refetchInterval: REFRESH_MS },
  });

  // 3. The connected wallet: guest list, tickets held, USDC balance and allowance, ETH balance
  const walletEnabled = hasEvent && Boolean(wallet) && Boolean(usdcToken);
  const account = wallet ?? TICKET_NFT_ADDRESS; // placeholder; reads are disabled without a wallet

  const walletReads = useReadContracts({
    contracts: [
      { ...nft, functionName: "isWhitelisted", args: [id, account] },
      { ...nft, functionName: "eventTicketsHeld", args: [id, account] },
    ],
    allowFailure: false,
    query: { enabled: walletEnabled },
  });

  const usdc = { address: usdcToken ?? TICKET_NFT_ADDRESS, abi: erc20Abi, chainId: TICKET_NFT_CHAIN_ID } as const;

  const usdcReads = useReadContracts({
    contracts: [
      { ...usdc, functionName: "balanceOf", args: [account] },
      { ...usdc, functionName: "allowance", args: [account, TICKET_NFT_ADDRESS] },
    ],
    allowFailure: false,
    query: { enabled: walletEnabled },
  });

  const decimals = useReadContract({ ...usdc, functionName: "decimals", query: { enabled: Boolean(usdcToken) } });
  const ethBalance = useBalance({ address: wallet, chainId: TICKET_NFT_CHAIN_ID, query: { enabled: Boolean(wallet) } });
  const gasPrice = useGasPrice({ chainId: TICKET_NFT_CHAIN_ID, query: { refetchInterval: REFRESH_MS } });

  const event: OnChainEvent | null =
    config && presaleActive !== undefined && royalty !== undefined
      ? {
          configured: config[4] && typeCount > 0,
          saleActive: config[5],
          endTime: Number(config[0]),
          resaleCapBps: Number(config[1]),
          royaltyBps: Number(royalty),
          perWalletLimit: Number(config[6]),
          presaleActive,
        }
      : null;

  // null while loading; [] once we know the event has no types on-chain yet
  const tiers: OnChainTicketType[] | null =
    config && typeCount === 0
      ? []
      : typeReads.data
        ? (typeReads.data as TicketTypeResult[]).map(([price, maxSupply, sold, issued], typeId) => ({
            typeId,
            price,
            maxSupply: Number(maxSupply),
            sold: Number(sold),
            issued: Number(issued),
          }))
        : null;

  const [whitelisted, held] = (walletReads.data ?? []) as [boolean?, bigint?];
  const [usdcBalance, allowance] = (usdcReads.data ?? []) as [bigint?, bigint?];

  const walletState: WalletOnChain | null =
    whitelisted !== undefined && held !== undefined && usdcBalance !== undefined && allowance !== undefined && ethBalance.data
      ? { whitelisted, held: Number(held), usdcBalance, allowance, ethBalance: ethBalance.data.value }
      : null;

  // Called after a purchase (or a failed one: the approval may still have gone through)
  async function refetch() {
    await Promise.all([eventReads.refetch(), typeReads.refetch(), walletReads.refetch(), usdcReads.refetch(), ethBalance.refetch()]);
  }

  return {
    event,
    tiers,
    wallet: walletState,
    usdcAddress: usdcToken,
    usdcDecimals: decimals.data ?? USDC_DECIMALS,
    gasPrice: gasPrice.data,
    // The event and its types are loading (the wallet reads load separately)
    loading: hasEvent && (eventReads.isPending || (typeCount > 0 && typeReads.isPending)),
    walletLoading: Boolean(wallet) && hasEvent && !walletState,
    error: eventReads.error || typeReads.error ? "Could not read this event from the blockchain. Check your connection and try again." : null,
    refetch,
  };
}
