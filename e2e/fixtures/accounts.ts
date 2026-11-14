// The test accounts, typed. See stack/config.mjs for what each one starts with.

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
