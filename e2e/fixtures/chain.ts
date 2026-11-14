// Doing things on the local chain directly, without the UI: buying, listing, checking in, moving
// the clock, funding or emptying a wallet. Each helper waits for its transaction and returns the
// block it landed in, so a test can then wait for the API with waitForSync(block).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';

import { CHAIN_ID, RPC_URL } from '../stack/config.mjs';
import { accounts, type Account } from './accounts.js';

const CONTRACTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../services/web/src/contracts');

export const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true, cacheTimeout: -1 });

const USDC_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function mint(address to, uint256 amount)',
];

// Written by the stack's deploy (packages/contracts/scripts/deploy.ts)
export function addresses(): { TicketNFT: string; MockUSDC: string; deployBlock: number; chainId: number } {
  return JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'addresses.json'), 'utf8'));
}

const ticketNftAbi = () => JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'TicketNFT.json'), 'utf8'));

const signerOf = (account: Account) => new ethers.Wallet(account.privateKey, provider);

/** TicketNFT, signing as `account` (or read-only) */
export const ticketNft = (account?: Account) => new ethers.Contract(addresses().TicketNFT, ticketNftAbi(), account ? signerOf(account) : provider);

/** The test USDC, signing as `account` (or read-only) */
export const mockUsdc = (account?: Account) => new ethers.Contract(addresses().MockUSDC, USDC_ABI, account ? signerOf(account) : provider);

/** USDC has 6 decimals: usdc(15) is 15 USDC */
export const usdc = (amount: number | string) => ethers.parseUnits(String(amount), 6);

async function sent(tx: Promise<ethers.ContractTransactionResponse>): Promise<ethers.ContractTransactionReceipt> {
  const receipt = await (await tx).wait();
  if (!receipt) throw new Error('The transaction has no receipt');
  return receipt;
}

// Token IDs minted to `to` in a receipt (ERC-721 Transfer from the zero address)
function mintedTo(receipt: ethers.ContractTransactionReceipt, to: string): bigint[] {
  const iface = new ethers.Interface(ticketNftAbi());
  const ids: bigint[] = [];
  for (const log of receipt.logs) {
    let parsed: ethers.LogDescription | null = null;
    try {
      parsed = iface.parseLog(log);
    } catch {
      continue; // USDC's Transfer, for example
    }
    if (parsed?.name === 'Transfer' && parsed.args[0] === ethers.ZeroAddress && String(parsed.args[1]).toLowerCase() === to.toLowerCase()) {
      ids.push(parsed.args[2] as bigint);
    }
  }
  return ids;
}

/** Buys tickets the way the app does: approve the exact total in USDC, then buyTickets */
export async function buyTickets(buyer: Account, { eventId, typeId = 0, quantity = 1 }: { eventId: bigint | number; typeId?: number; quantity?: number }) {
  const [price] = (await ticketNft().ticketTypes(eventId, typeId)) as [bigint];
  const total = price * BigInt(quantity);
  if (total > 0n) await sent(mockUsdc(buyer).approve(addresses().TicketNFT, total));
  const receipt = await sent(ticketNft(buyer).buyTickets(eventId, typeId, quantity));
  return { tokenIds: mintedTo(receipt, buyer.address), block: receipt.blockNumber };
}

/** Lists a ticket on the Marketplace */
export async function listTicket(seller: Account, tokenId: bigint | number, priceUsdc: number | string) {
  const receipt = await sent(ticketNft(seller).listForResale(tokenId, usdc(priceUsdc)));
  return { block: receipt.blockNumber };
}

export async function cancelListing(seller: Account, tokenId: bigint | number) {
  const receipt = await sent(ticketNft(seller).cancelListing(tokenId));
  return { block: receipt.blockNumber };
}

/** Buys a listed ticket at its current price: approve the price, then buyResaleTicket */
export async function buyListedTicket(buyer: Account, tokenId: bigint | number) {
  const [, price] = (await ticketNft().listings(tokenId)) as [string, bigint, bigint];
  if (price === 0n) throw new Error(`Ticket ${tokenId} is not listed`);
  await sent(mockUsdc(buyer).approve(addresses().TicketNFT, price));
  const receipt = await sent(ticketNft(buyer).buyResaleTicket(tokenId, price));
  return { block: receipt.blockNumber };
}

/** Checks a ticket in, as the event's scanner, organizer or the admin */
export async function checkIn(by: Account, tokenId: bigint | number) {
  const receipt = await sent(ticketNft(by).checkInTicket(tokenId));
  return { block: receipt.blockNumber };
}

/** The chain's time now (the latest block's timestamp), in seconds */
export async function chainNow(): Promise<number> {
  const block = await provider.getBlock('latest');
  return block!.timestamp;
}

/**
 * Moves the chain's clock forward and mines a block, e.g. to get past an event's sales end.
 * Only the chain moves: the browser's clock doesn't (use page.clock for that).
 */
export async function increaseTime(seconds: number) {
  await provider.send('evm_increaseTime', [seconds]);
  await provider.send('evm_mine', []);
  return { block: await provider.getBlockNumber() };
}

export async function mine() {
  await provider.send('evm_mine', []);
  return { block: await provider.getBlockNumber() };
}

/** Sets a wallet's ETH (for gas) to exactly `eth` */
export async function setEth(address: string, eth: number | string) {
  await provider.send('hardhat_setBalance', [address, ethers.toQuantity(ethers.parseEther(String(eth)))]);
}

/** Mints test USDC to a wallet */
export async function giveUsdc(address: string, amount: number | string) {
  const receipt = await sent(mockUsdc(accounts.admin).mint(address, usdc(amount)));
  return { block: receipt.blockNumber };
}

/** Takes every USDC and all the ETH out of a wallet (the USDC goes to the admin) */
export async function emptyWallet(account: Account) {
  const balance = (await mockUsdc().balanceOf(account.address)) as bigint;
  if (balance > 0n) await sent(mockUsdc(account).transfer(accounts.admin.address, balance));
  await setEth(account.address, 0);
}

export const usdcBalance = async (address: string) => (await mockUsdc().balanceOf(address)) as bigint;
export const ownerOf = async (tokenId: bigint | number) => (await ticketNft().ownerOf(tokenId)) as string;
