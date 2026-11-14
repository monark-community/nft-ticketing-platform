// Talking to the stack's control server (stack/run.mjs)

import { CONTROL_URL } from '../stack/config.mjs';

export interface StackState {
  addresses: { TicketNFT: `0x${string}`; MockUSDC: `0x${string}`; deployBlock: number; chainId: number };
  rpcUrl: string;
  snapshotBlock: number;
  head: number;
  listenerBlock: number | null; // the last block the API's listener has saved
}

async function control<T>(method: 'GET' | 'POST', path: string): Promise<T> {
  const res = await fetch(`${CONTROL_URL}${path}`, { method });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(`The test stack answered ${res.status} to ${method} ${path}: ${body.error ?? 'no details'}`);
  return body;
}

export const stackState = () => control<StackState>('GET', '/state');

/** Puts the chain, the database and the API back to the seeded state (about 5 seconds) */
export const resetStack = () => control<{ ms: number }>('POST', '/reset');

/**
 * Waits until the API's listener has saved every block up to `block` (default: the chain's head
 * now), so the API shows what happened on-chain. Pass a transaction receipt's blockNumber.
 */
export async function waitForSync(block?: number, timeoutMs = 30_000) {
  const target = block ?? (await stackState()).head;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { listenerBlock } = await stackState();
    if (listenerBlock !== null && listenerBlock >= target) return;
    if (Date.now() > deadline) throw new Error(`The API's listener didn't reach block ${target} within ${timeoutMs / 1000}s (it is at ${listenerBlock}).`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
