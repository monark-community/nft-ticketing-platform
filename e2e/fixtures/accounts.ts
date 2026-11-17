// The test accounts, typed. See stack/config.mjs for what each one starts with.

import { ethers } from 'ethers';

import { ACCOUNTS, SEEDED_EVENTS } from '../stack/config.mjs';

export interface Account {
  index: number;
  name: string | null; // null: not registered yet
  address: `0x${string}`;
  privateKey: `0x${string}`;
}

export type AccountName = keyof typeof ACCOUNTS;

export const accounts = ACCOUNTS as Record<AccountName, Account>;

export const seededEvents = SEEDED_EVENTS as Record<keyof typeof SEEDED_EVENTS, { apiId: string; contractId: bigint; title: string }>;

const HARDHAT_MNEMONIC = 'test test test test test test test test test test test junk';

/** Hardhat's account #index (10 and up): never registered by the seeds, for tests that need a new wallet */
export function newWallet(index: number): Account {
  const wallet = ethers.HDNodeWallet.fromPhrase(HARDHAT_MNEMONIC, undefined, `m/44'/60'/0'/0/${index}`);
  return { index, name: null, address: wallet.address as `0x${string}`, privateKey: wallet.privateKey as `0x${string}` };
}

// Emails from the database seed (services/api/prisma/seed.ts)
export const ALEX_EMAIL = 'user@nfttickets.local';
export const JORDAN_EMAIL = 'user2@nfttickets.local';
