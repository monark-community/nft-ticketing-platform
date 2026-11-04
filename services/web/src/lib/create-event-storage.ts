// What the create event flow keeps in the browser (#187):
// - the wallet's unfinished draft, so /organizer/events/new can offer to continue it
// - each draft's sale rules, which the API has no columns for yet; they go on-chain when the
//   event is published
// Storage can be missing or throw (private windows, blocked site data), so every call is guarded
// and the flow still works without it.

import { parseStoredSaleRules, type SaleRulesForm } from "@/lib/create-event";

const DRAFT_KEY = (wallet: string) => `nftokenpass:create-event:draft:${wallet.toLowerCase()}`;
const RULES_KEY = (eventId: string) => `nftokenpass:create-event:rules:${eventId}`;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    const s = storage();
    if (!s) return;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // Full or blocked: the draft is still saved in the API, only this shortcut is lost
  }
}

// API event ids are UUIDs; anything else in storage is ignored
const EVENT_ID = /^[0-9a-f-]{36}$/i;

export function getDraftPointer(wallet: string): string | null {
  const id = read(DRAFT_KEY(wallet));
  return id && EVENT_ID.test(id) ? id : null;
}

export function setDraftPointer(wallet: string, eventId: string | null) {
  write(DRAFT_KEY(wallet), eventId);
}

export function getStoredSaleRules(eventId: string): SaleRulesForm | null {
  return parseStoredSaleRules(read(RULES_KEY(eventId)));
}

export function setStoredSaleRules(eventId: string, rules: SaleRulesForm | null) {
  write(RULES_KEY(eventId), rules ? JSON.stringify(rules) : null);
}

export function isEventId(value: string | null): value is string {
  return Boolean(value && EVENT_ID.test(value));
}
