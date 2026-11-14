// Talking to the API without the UI: signing in as an account, and setting up a published event
// through the API and the contract, for tests that only need one to exist.

import { ethers } from 'ethers';

import { API_URL } from '../stack/config.mjs';
import { accounts, type Account } from './accounts.js';
import { chainNow, ticketNft, usdc } from './chain.js';
import { waitForSync } from './stack.js';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** A signed-in API session for one account, the same as the web app gets (the token cookie) */
export class ApiSession {
  private constructor(
    readonly account: Account,
    private readonly cookie: string,
  ) {}

  static async signIn(account: Account): Promise<ApiSession> {
    const { nonce } = await apiRequest<{ nonce: string }>('GET', `/api/auth/nonce?wallet=${account.address}`);
    const message = `Sign this message to authenticate with NFTokenPass.\n\nNonce: ${nonce}`;
    const signature = await new ethers.Wallet(account.privateKey).signMessage(message);
    const res = await fetch(`${API_URL}/api/auth/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet: account.address, signature }),
    });
    if (!res.ok) throw new ApiError(`Signing in as ${account.address} failed (${res.status})`, res.status);
    const token = /token=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
    if (!token) throw new Error('The API set no session cookie');
    return new ApiSession(account, `token=${token}`);
  }

  request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return apiRequest<T>(method, path, body, this.cookie);
  }

  get<T>(path: string) {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, body);
  }

  delete<T>(path: string) {
    return this.request<T>('DELETE', path);
  }
}

/** One API request. A FormData body is sent as multipart, anything else as JSON. */
export async function apiRequest<T>(method: string, path: string, body?: unknown, cookie?: string): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { ...(isForm || body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (!res.ok) {
    const error = ((await res.json().catch(() => ({}))) as { error?: string }).error;
    throw new ApiError(`${method} ${path} answered ${res.status}: ${error ?? 'no details'}`, res.status);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Public reads, like the Events page does */
export const apiGet = <T>(path: string) => apiRequest<T>('GET', path);

// The same on-chain event ID the web app derives (contractEventIdFor in services/web/src/lib/publish-event.ts)
export function contractEventIdFor(apiEventId: string): bigint {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(`nftokenpass:event:${apiEventId}`));
  const id = BigInt(`0x${hash.slice(2, 14)}`);
  return id === 0n ? 1n : id;
}

// A small PNG for the cover image (64 x 36, orange)
const COVER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAIAAAC2bqvFAAAAPElEQVR42u3PQQkAQAgAML0QFjW9v2shCFuD5XTFZS+OExAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQENj2AdjvAcrkh+esAAAAAElFTkSuQmCC',
  'base64',
);

export interface NewTicketType {
  name: string;
  price: number | string; // USDC
  supply: number;
  description?: string;
}

export interface NewEventOptions {
  organizer?: Account;
  title?: string;
  description?: string;
  category?: string;
  location?: string;
  /** Days from now until the event starts (default 30) */
  startsInDays?: number;
  /** Days from now until ticket sales end (default: when the event starts) */
  salesEndInDays?: number;
  royaltyPercent?: number; // default 10
  /** Resale cap as a multiple of face value: 0 = no cap, 1, 1.5, 2 (default) or 3 */
  resaleCap?: number;
  perWalletLimit?: number; // 0 = no limit, default 4
  /** Start in presale, open only to these wallets */
  presaleGuestList?: string[];
  /** Open ticket sales (default true) */
  openSales?: boolean;
  ticketTypes?: NewTicketType[];
  coverImage?: Buffer; // PNG
}

export interface PublishedEvent {
  apiId: string;
  contractId: bigint;
  title: string;
  salesEnd: number; // unix seconds (the contract's endTime)
  ticketTypes: Array<NewTicketType & { apiId: string; typeId: number }>;
}

const DAY = 24 * 60 * 60;

/**
 * Creates an event and publishes it the way the app does, without the UI: draft and ticket types in
 * the API, freeze (IPFS), configureEvent and addTicketType on the contract, open sales, publish in
 * the API. Waits until the API shows it.
 */
export async function createPublishedEvent(options: NewEventOptions = {}): Promise<PublishedEvent> {
  const organizer = options.organizer ?? accounts.organizer;
  const session = await ApiSession.signIn(organizer);
  const title = options.title ?? `E2E event ${Date.now().toString(36)}`;
  const types = options.ticketTypes ?? [{ name: 'General Admission', price: 20, supply: 100 }];

  // Dates are checked against real time by the API and chain time by the contract: use the later
  const now = Math.max(Math.floor(Date.now() / 1000), await chainNow());
  const startsAt = now + (options.startsInDays ?? 30) * DAY;
  const salesEnd = now + Math.round((options.salesEndInDays ?? options.startsInDays ?? 30) * DAY);

  const event = await session.post<{ id: string }>('/api/events', {
    title,
    description: options.description ?? 'Created by an end-to-end test.',
    category: options.category ?? 'Concerts',
    location: options.location ?? 'National Arts Centre, Ottawa, ON',
    start_date: new Date(startsAt * 1000).toISOString(),
    end_date: new Date((startsAt + 3 * 60 * 60) * 1000).toISOString(),
  });

  const created: Array<{ id: string }> = [];
  for (const type of types) {
    created.push(
      await session.post<{ id: string }>(`/api/events/${event.id}/ticket-types`, {
        name: type.name,
        description: type.description ?? '',
        price: String(type.price),
        supply: type.supply,
      }),
    );
  }

  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(options.coverImage ?? COVER_PNG)], { type: 'image/png' }), 'cover.png');
  await session.post(`/api/events/${event.id}/freeze`, form);
  const frozen = await session.get<{ ticket_types: Array<{ id: string; ipfs_hash: string | null }> }>(`/api/events/${event.id}`);

  const contractId = contractEventIdFor(event.id);
  const nft = ticketNft(organizer);
  const resaleCapBps = Math.round((options.resaleCap ?? 2) * 10_000);
  await (await nft.configureEvent(contractId, salesEnd, Math.round((options.royaltyPercent ?? 10) * 100), resaleCapBps, options.perWalletLimit ?? 4)).wait();
  for (const [i, type] of types.entries()) {
    const hash = frozen.ticket_types.find((t) => t.id === created[i].id)?.ipfs_hash;
    if (!hash) throw new Error(`Ticket type ${type.name} has no IPFS hash after freezing`);
    await (await nft.addTicketType(contractId, usdc(type.price), type.supply, `ipfs://${hash}`)).wait();
  }
  if (options.presaleGuestList) {
    for (const wallet of options.presaleGuestList) await (await nft.addToWhitelist(contractId, wallet)).wait();
    await (await nft.setPresaleActive(contractId, true)).wait();
  }
  let last: ethers.TransactionReceipt | null = null;
  if (options.openSales ?? true) last = await (await nft.setSaleActive(contractId, true)).wait();

  await session.post(`/api/events/${event.id}/publish`, { contract_event_id: contractId.toString() });
  await waitForSync(last?.blockNumber);

  return {
    apiId: event.id,
    contractId,
    title,
    salesEnd,
    ticketTypes: types.map((type, typeId) => ({ ...type, apiId: created[typeId].id, typeId })),
  };
}
