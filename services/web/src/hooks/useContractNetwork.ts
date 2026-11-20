"use client";

import { useAccount, useChains, useSwitchChain } from "wagmi";

import { TICKET_NFT_CHAIN_ID } from "@/lib/contracts/ticket-nft";

// The chain TicketNFT lives on, independent of the network the wallet happens to be on. Contract
// reads use it directly; wallet writes need the wallet switched to it first.
export function useContractNetwork() {
  const { chainId } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const chain = useChains().find((candidate) => candidate.id === TICKET_NFT_CHAIN_ID);

  return {
    chainId: TICKET_NFT_CHAIN_ID,
    chainName: chain?.name ?? "the contract's network",
    explorerUrl: chain?.blockExplorers?.default.url ?? null,
    onContractChain: chainId === TICKET_NFT_CHAIN_ID,
    switchNetwork: () => switchChain({ chainId: TICKET_NFT_CHAIN_ID }),
    switching,
  };
}
