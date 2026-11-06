"use client";

import { erc20Abi, type Address } from "viem";
import { useBalance, useGasPrice, useReadContract, useReadContracts } from "wagmi";

import { TICKET_NFT_ADDRESS, TICKET_NFT_CHAIN_ID, ticketNftAbi } from "@/lib/contracts/ticket-nft";
import type { OnChainListing } from "@/lib/marketplace";
import { USDC_DECIMALS } from "@/lib/token-amount";

// The resale terms of one ticket as TicketNFT has them now
export interface ResaleTerms {
  listing: OnChainListing; // listings(tokenId): seller is the zero address when not listed
  capApplies: boolean; // resaleCapApplies(tokenId): false once used or after the event
  maxPrice: bigint; // maxResalePriceOf(tokenId): face value x cap
  faceValue: bigint; // tokenFaceValue(tokenId)
  royaltyBps: number; // royaltyPercentage(event) now
  perWalletLimit: number; // 0 = no limit
}

// What the connected wallet has, for buying
export interface ResaleWallet {
  held: number; // tickets it already holds for the event
  usdcBalance: bigint;
  allowance: bigint;
  ethBalance: bigint;
}

const nft = { address: TICKET_NFT_ADDRESS, abi: ticketNftAbi, chainId: TICKET_NFT_CHAIN_ID } as const;
type EventConfigResult = [bigint, bigint, bigint, bigint, boolean, boolean, bigint]; // eventConfigs(): perWalletLimit is last

// Reads a ticket's resale terms from the contract (#295). The Marketplace shows the API's copy of
// the listings; the Buy and Sell popups read the contract again, since the seller or the organizer
// may have changed something the API hasn't caught up with yet. Reads go to the contract's own
// network, so they work before a wallet is connected.
export function useResaleOnChain(tokenId: bigint | null, contractEventId: bigint | null, wallet: Address | undefined) {
  const token = tokenId ?? BigInt(0);
  const eventId = contractEventId ?? BigInt(0);
  const enabled = tokenId !== null && contractEventId !== null;

  const termsReads = useReadContracts({
    contracts: [
      { ...nft, functionName: "listings", args: [token] },
      { ...nft, functionName: "resaleCapApplies", args: [token] },
      { ...nft, functionName: "maxResalePriceOf", args: [token] },
      { ...nft, functionName: "tokenFaceValue", args: [token] },
      { ...nft, functionName: "royaltyPercentage", args: [eventId] },
      { ...nft, functionName: "eventConfigs", args: [eventId] },
      { ...nft, functionName: "usdcToken" },
    ],
    allowFailure: false,
    query: { enabled },
  });

  const [listing, capApplies, maxPrice, faceValue, royalty, config, usdcToken] = (termsReads.data ?? []) as [
    [Address, bigint, bigint]?,
    boolean?,
    bigint?,
    bigint?,
    bigint?,
    EventConfigResult?,
    Address?,
  ];

  const walletEnabled = enabled && Boolean(wallet) && Boolean(usdcToken);
  const account = wallet ?? TICKET_NFT_ADDRESS; // placeholder; reads are disabled without a wallet
  const usdc = { address: usdcToken ?? TICKET_NFT_ADDRESS, abi: erc20Abi, chainId: TICKET_NFT_CHAIN_ID } as const;

  const walletReads = useReadContracts({
    contracts: [
      { ...nft, functionName: "eventTicketsHeld", args: [eventId, account] },
      { ...usdc, functionName: "balanceOf", args: [account] },
      { ...usdc, functionName: "allowance", args: [account, TICKET_NFT_ADDRESS] },
    ],
    allowFailure: false,
    query: { enabled: walletEnabled },
  });
  const ethBalance = useBalance({ address: wallet, chainId: TICKET_NFT_CHAIN_ID, query: { enabled: walletEnabled } });
  const decimals = useReadContract({ ...usdc, functionName: "decimals", query: { enabled: Boolean(usdcToken) } });
  const gasPrice = useGasPrice({ chainId: TICKET_NFT_CHAIN_ID, query: { enabled } });

  const terms: ResaleTerms | null =
    listing && capApplies !== undefined && maxPrice !== undefined && faceValue !== undefined && royalty !== undefined && config
      ? {
          listing: { seller: listing[0], price: listing[1], royaltyBps: Number(listing[2]) },
          capApplies,
          maxPrice,
          faceValue,
          royaltyBps: Number(royalty),
          perWalletLimit: Number(config[6]),
        }
      : null;

  const [held, usdcBalance, allowance] = (walletReads.data ?? []) as [bigint?, bigint?, bigint?];
  const walletState: ResaleWallet | null =
    held !== undefined && usdcBalance !== undefined && allowance !== undefined && ethBalance.data
      ? { held: Number(held), usdcBalance, allowance, ethBalance: ethBalance.data.value }
      : null;

  async function refetch() {
    await Promise.all([termsReads.refetch(), walletReads.refetch(), ethBalance.refetch()]);
  }

  return {
    terms,
    wallet: walletState,
    usdcAddress: usdcToken,
    usdcDecimals: decimals.data ?? USDC_DECIMALS,
    gasPrice: gasPrice.data,
    loading: enabled && termsReads.isPending,
    error: termsReads.error ? "Couldn't read this ticket from the blockchain. Check your connection and try again." : null,
    walletLoading: walletEnabled && (walletReads.isPending || ethBalance.isPending),
    walletError: walletReads.error || ethBalance.error ? "Couldn't read your wallet's balances. Check your connection and try again." : null,
    refetch,
  };
}
