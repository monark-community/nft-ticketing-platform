// TicketNFT contract details for the frontend.
// Single source of truth: both JSON files are written by packages/contracts/scripts/deploy.ts (#174),
// so redeploying the contract updates the ABI and address here automatically (#218).

import ticketNftAbiJson from "@/contracts/TicketNFT.json";
import addresses from "@/contracts/addresses.json";
import type { Abi } from "viem";
import type { hardhat, sepolia } from "wagmi/chains";

// JSON imports lose the exact ABI types, so viem can't infer return types from this ABI.
// Callers cast each readContract result to the Solidity return type instead.
export const ticketNftAbi = ticketNftAbiJson as Abi;

export const TICKET_NFT_ADDRESS = addresses.TicketNFT as `0x${string}`;

// The chain the contract was deployed to (31337 = local Hardhat node, 11155111 = Sepolia).
// Contract reads pass it, so they work before a wallet is connected or while it's on another network.
export const TICKET_NFT_CHAIN_ID = addresses.chainId as typeof hardhat.id | typeof sepolia.id;
