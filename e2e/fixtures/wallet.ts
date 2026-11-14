// The test wallet: an EIP-1193 provider injected into every page and announced with EIP-6963, so
// RainbowKit lists "E2E Test Wallet" and tests connect through the app's real Connect button.
// Every request it gets is answered here, in the test process, so a test can switch the account
// or network, reject the next request or disconnect, the way a person would in MetaMask.
// It signs with the account's own key, so the same wallet also works on Sepolia later.

import type { BrowserContext } from '@playwright/test';
import { ethers } from 'ethers';

import { CHAIN_ID, RPC_URL, SEPOLIA_CHAIN_ID } from '../stack/config.mjs';
import type { Account } from './accounts.js';

export const WALLET_NAME = 'E2E Test Wallet';

interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

type Reply = { result: unknown } | { error: RpcError };

// Requests a person would see a prompt for, by kind: rejectNext() applies to the next one
const PROMPTS = {
  connect: ['eth_requestAccounts', 'wallet_requestPermissions'],
  sign: ['personal_sign', 'eth_sign', 'eth_signTypedData_v4'],
  send: ['eth_sendTransaction'],
  switchNetwork: ['wallet_switchEthereumChain', 'wallet_addEthereumChain'],
} as const;
export type PromptKind = keyof typeof PROMPTS;
const promptKind = (method: string) =>
  (Object.keys(PROMPTS) as PromptKind[]).find((kind) => (PROMPTS[kind] as readonly string[]).includes(method));

const USER_REJECTED: RpcError = { code: 4001, message: 'User rejected the request.' };
const KNOWN_CHAINS = new Set([CHAIN_ID, SEPOLIA_CHAIN_ID]);
const toHex = (n: number) => `0x${n.toString(16)}`;

// Runs inside the page. Kept free of outside variables: Playwright sends it as source code.
function pageWallet(walletName: string) {
  type Listener = (payload: unknown) => void;
  const w = window as unknown as {
    __e2eWallet: (method: string, params: unknown) => Promise<{ result?: unknown; error?: { code: number; message: string; data?: unknown } }>;
    __e2eWalletEmit: (event: string, payload: unknown) => void;
  };
  const listeners = new Map<string, Set<Listener>>();
  const provider = {
    async request({ method, params }: { method: string; params?: unknown }) {
      const reply = await w.__e2eWallet(method, params ?? []);
      if (reply.error) {
        const err = new Error(reply.error.message) as Error & { code?: number; data?: unknown };
        err.code = reply.error.code;
        if (reply.error.data !== undefined) err.data = reply.error.data;
        throw err;
      }
      return reply.result;
    },
    on(event: string, fn: Listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
      return provider;
    },
    removeListener(event: string, fn: Listener) {
      listeners.get(event)?.delete(fn);
      return provider;
    },
    off(event: string, fn: Listener) {
      return provider.removeListener(event, fn);
    },
  };
  w.__e2eWalletEmit = (event, payload) => {
    for (const fn of listeners.get(event) ?? []) fn(payload);
  };
  const icon =
    'data:image/svg+xml,' +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#f97316"/><path d="M8 11h16v10H8z" fill="#0d0e10"/></svg>');
  const info = Object.freeze({ uuid: '6c3f0a52-6d33-4f5e-9a0e-e2e000000337', name: walletName, icon, rdns: 'dev.nftokenpass.e2e' });
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
}

function rpcErrorFrom(err: unknown): RpcError {
  const e = err as { code?: unknown; message?: string; shortMessage?: string; data?: unknown; info?: { error?: RpcError }; error?: RpcError };
  // ethers wraps the node's JSON-RPC error: pass the original on, like MetaMask does
  const inner = e?.info?.error ?? e?.error;
  if (inner && typeof inner.code === 'number') return { code: inner.code, message: inner.message, data: inner.data };
  if (typeof e?.code === 'number') return { code: e.code, message: e.message ?? 'Error', data: e.data };
  return { code: -32603, message: e?.shortMessage ?? e?.message ?? String(err) };
}

export class TestWallet {
  readonly provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true, cacheTimeout: -1 });
  /** Every method the page asked for, in order: handy when a test needs to know what was requested */
  readonly requests: string[] = [];
  account: Account;
  chainId = CHAIN_ID;
  connected = false;
  private rejecting: PromptKind | true | null = null; // a kind of prompt, or true for any
  private sending: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly context: BrowserContext,
    account: Account,
  ) {
    this.account = account;
  }

  /** Adds the wallet to every page of the context. Call before the first page.goto(). */
  static async attach(context: BrowserContext, account: Account): Promise<TestWallet> {
    const wallet = new TestWallet(context, account);
    await context.exposeBinding('__e2eWallet', (_source, method: string, params: unknown) => wallet.handle(method, params));
    await context.addInitScript(pageWallet, WALLET_NAME);
    return wallet;
  }

  get address() {
    return this.account.address;
  }

  /** The account the app gets when it connects. Once connected, the same as switchAccount(). */
  async use(account: Account) {
    if (this.connected && account.address !== this.account.address) await this.switchAccount(account);
    else this.account = account;
  }

  /** Switches to another account, like picking another account in MetaMask */
  async switchAccount(account: Account) {
    this.account = account;
    if (this.connected) await this.emit('accountsChanged', [account.address]);
  }

  /** Switches the wallet's network, like picking another network in MetaMask */
  async switchNetwork(chainId: number) {
    this.chainId = chainId;
    await this.emit('chainChanged', toHex(chainId));
  }

  /**
   * The next prompt is rejected, as if the person clicked Reject in their wallet. Pass a kind to
   * reject only the next prompt of that kind: rejectNext('sign') lets the connection through and
   * rejects the sign-in signature right after it.
   */
  rejectNext(kind?: PromptKind) {
    this.rejecting = kind ?? true;
  }

  /** Disconnects the site from the wallet, as if the person did it in MetaMask */
  async disconnect() {
    this.connected = false;
    await this.emit('accountsChanged', []);
  }

  private async emit(event: string, payload: unknown) {
    await Promise.all(
      this.context.pages().map((page) =>
        page
          .evaluate(([e, p]) => (window as unknown as { __e2eWalletEmit?: (e: string, p: unknown) => void }).__e2eWalletEmit?.(e, p), [event, payload] as const)
          .catch(() => {}),
      ),
    );
  }

  private signer() {
    return new ethers.Wallet(this.account.privateKey, this.provider);
  }

  private async handle(method: string, params: unknown): Promise<Reply> {
    this.requests.push(method);
    try {
      const kind = promptKind(method);
      if (kind && (this.rejecting === true || this.rejecting === kind)) {
        this.rejecting = null;
        return { error: USER_REJECTED };
      }
      return { result: await this.answer(method, Array.isArray(params) ? params : [params]) };
    } catch (err) {
      return { error: rpcErrorFrom(err) };
    }
  }

  private checkAccount(address: unknown) {
    if (typeof address !== 'string' || address.toLowerCase() !== this.address.toLowerCase()) {
      throw { code: 4100, message: 'The requested account is not connected.' } satisfies RpcError;
    }
  }

  private async answer(method: string, params: unknown[]): Promise<unknown> {
    switch (method) {
      case 'eth_requestAccounts':
        this.connected = true;
        return [this.address];
      case 'eth_accounts':
        return this.connected ? [this.address] : [];
      case 'wallet_requestPermissions':
        this.connected = true;
        return [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: [this.address] }] }];
      case 'wallet_getPermissions':
        return this.connected ? [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: [this.address] }] }] : [];
      case 'wallet_revokePermissions':
        this.connected = false;
        return null;
      case 'eth_chainId':
        return toHex(this.chainId);
      case 'net_version':
        return String(this.chainId);
      case 'wallet_switchEthereumChain': {
        const chainId = Number((params[0] as { chainId?: string })?.chainId);
        if (!KNOWN_CHAINS.has(chainId)) throw { code: 4902, message: 'Unrecognized chain ID.' } satisfies RpcError;
        if (chainId !== this.chainId) {
          this.chainId = chainId;
          void this.emit('chainChanged', toHex(chainId));
        }
        return null;
      }
      case 'wallet_addEthereumChain':
        return null;
      case 'personal_sign': {
        const [data, address] = params as [string, string];
        this.checkAccount(address);
        return this.signer().signMessage(ethers.isHexString(data) ? ethers.getBytes(data) : data);
      }
      case 'eth_sign': {
        const [address, data] = params as [string, string];
        this.checkAccount(address);
        return this.signer().signMessage(ethers.getBytes(data));
      }
      case 'eth_signTypedData_v4': {
        const [address, json] = params as [string, string];
        this.checkAccount(address);
        const { domain, types, message } = typeof json === 'string' ? JSON.parse(json) : json;
        const { EIP712Domain: _domain, ...rest } = types;
        return this.signer().signTypedData(domain, rest, message);
      }
      case 'eth_sendTransaction':
        return this.send(params[0] as Record<string, string | undefined>);
      default:
        return this.forward(method, params);
    }
  }

  // One transaction at a time, so two quick sends never pick the same nonce
  private send(tx: Record<string, string | undefined>): Promise<string> {
    const run = this.sending.then(async () => {
      if (tx.from) this.checkAccount(tx.from);
      if (this.chainId !== CHAIN_ID) {
        throw { code: -32000, message: `The test wallet only sends transactions on the local chain (it is on chain ${this.chainId}).` } satisfies RpcError;
      }
      const signer = this.signer();
      const populated = await signer.populateTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value ? BigInt(tx.value) : undefined,
        gasLimit: tx.gas ? BigInt(tx.gas) : undefined,
      });
      const raw = await signer.signTransaction(populated);
      return (await this.forward('eth_sendRawTransaction', [raw])) as string;
    });
    this.sending = run.catch(() => {});
    return run;
  }

  // Everything else (reads, gas estimates, receipts) goes straight to the node, errors included
  private async forward(method: string, params: unknown[]): Promise<unknown> {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const body = (await res.json()) as { result?: unknown; error?: RpcError };
    if (body.error) throw body.error;
    return body.result;
  }
}
