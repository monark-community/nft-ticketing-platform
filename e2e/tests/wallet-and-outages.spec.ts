// What applies to every page (#349), part 2: the wallet and outages, on every page they apply to.
//   Wrong network: read-only pages still load, and every page that sends a transaction asks to
//   switch first, with a switch that works.
//   Switching account, then disconnecting: pages with wallet data show the new wallet's, and the
//   previous wallet's never comes back.
//   API down, chain unreachable, listener behind.
// Each flow's own mid-transaction cases (switching or disconnecting while the wallet asks, double
// clicks) are in its spec file. Part 1 is every-page.spec.ts; part 3 adds the keyboard, the
// accessibility scan and long content.

import type { Locator, Page } from '@playwright/test';

import { accounts, ApiSession, chain, createPublishedEvent, entryQr, expect, newWallet, seededEvents, test, waitForSync, type Account, type TestWallet, WALLET_NAME } from '../fixtures/index.js';
import { API_URL, CHAIN_ID, SEPOLIA_CHAIN_ID } from '../stack/config.mjs';

// --- Helpers -------------------------------------------------------------------------------------

const GALA = seededEvents.gala;
const MAINNET = 1; // a network the app doesn't use
const API = `${API_URL}/**`;
const CHAIN = /127\.0\.0\.1:8545/; // the local chain, as the web app reads it
const CAMERA = "Point the camera at the attendee's QR code";
const ADMIN_INTRO = 'Review organizer requests, manage organizer access and see all events.';

const main = (page: Page) => page.getByRole('main');
const navbar = (page: Page) => page.locator('[data-site-header]');
const heading = (page: Page, name: string | RegExp) =>
  main(page).getByRole('heading', typeof name === 'string' ? { name, exact: true } : { name });
const alertWith = (page: Page, text: string) => main(page).getByRole('alert').filter({ hasText: text });
const banner = (page: Page) => page.getByText('Wrong network detected. Please switch to Sepolia testnet.');
const short = (account: Account) => `${account.address.slice(0, 6)}…${account.address.slice(-4)}`;

// The event page: its availability (read from the chain) and its Order Summary
const availability = (page: Page) => main(page).getByText(/^[\d,]+ of [\d,]+ tickets left$/);
const summary = (page: Page) => main(page).getByRole('region', { name: 'Order Summary' });
const summaryRow = (page: Page, label: string) => summary(page).getByText(label, { exact: true }).locator('..');
const buyButton = (page: Page) => summary(page).getByRole('button', { name: /^Buy tickets/ });

// The Marketplace's Sell popup, with one of the account's tickets chosen
const sellDialog = (page: Page) => page.getByRole('dialog', { name: 'Sell a ticket' });
async function openSell(page: Page, tokenId: number) {
  await main(page).getByRole('button', { name: 'Sell a ticket' }).first().click();
  const option = sellDialog(page).getByRole('radio', { name: new RegExp(`Ticket #${tokenId}(?!\\d)`) });
  await option.click();
  await expect(option).toHaveAttribute('aria-checked', 'true');
  await expect(sellDialog(page).getByText("Reading this ticket's resale terms…")).toHaveCount(0);
}

/** A new wallet with a finished account, ETH for gas and 200 USDC */
async function createBuyer(index: number): Promise<Account> {
  const buyer = newWallet(index);
  const session = await ApiSession.signIn(buyer);
  await session.put('/api/users/me', { first_name: 'Buyer', last_name: `E2E ${index}`, email: `buyer.${index}@example.com` });
  await chain.setEth(buyer.address, 10);
  await chain.giveUsdc(buyer.address, 200);
  return buyer;
}

/** A wallet that has never signed in, connected on the sign-up page: it gets to Create your account */
async function connectNewWallet(page: Page, wallet: TestWallet) {
  await wallet.use(newWallet(32));
  await page.goto('/signup');
  await main(page).getByRole('button', { name: 'Connect wallet' }).click();
  await page.getByRole('dialog').getByRole('button', { name: WALLET_NAME }).click();
}

/**
 * Watches the page for `text`: whether it went, and whether it came back afterwards, like the
 * previous wallet's data showing again because its slower request finished late. Returns the check
 * for the end.
 */
async function watchComesBack(page: Page, text: string): Promise<() => Promise<{ gone: boolean; cameBack: boolean }>> {
  await page.evaluate((watched) => {
    const seen = { gone: false, cameBack: false };
    (window as unknown as { __watched?: typeof seen }).__watched = seen;
    new MutationObserver(() => {
      const shown = document.body.innerText.includes(watched);
      if (!shown) seen.gone = true;
      else if (seen.gone) seen.cameBack = true;
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }, text);
  // A reload drops the observer: then nothing was watched, and `gone` stays false
  return () => page.evaluate(() => (window as unknown as { __watched?: { gone: boolean; cameBack: boolean } }).__watched ?? { gone: false, cameBack: false });
}

/**
 * Makes the API answer `url` as if its listener hadn't saved the latest blocks yet, until release().
 * With `leaveOut`, each answer goes through it; without, the first answer is given again each time,
 * so set it up before the page first asks.
 */
async function listenerBehind<T>(page: Page, url: string, leaveOut?: (body: T) => T) {
  let released = false;
  let staleAnswers = 0;
  let first: string | undefined;
  await page.route(url, async (route) => {
    if (released) return route.fallback();
    const response = await route.fetch();
    const body = leaveOut ? JSON.stringify(leaveOut((await response.json()) as T)) : (first ??= await response.text());
    // The body is given as text: the original's length and compression no longer apply
    const headers = response.headers();
    delete headers['content-length'];
    delete headers['content-encoding'];
    staleAnswers += 1;
    await route.fulfill({ status: response.status(), headers, body });
  });
  return {
    staleAnswers: () => staleAnswers,
    release: () => {
      released = true;
    },
  };
}

// --- Wrong network -------------------------------------------------------------------------------

test.describe('wrong network', () => {
  // What these pages show doesn't depend on the wallet's network
  const READ_ONLY: Array<{ path: string; shows: (page: Page) => Locator }> = [
    { path: '/', shows: (page) => heading(page, 'Upcoming events') },
    { path: `/events/${GALA.apiId}`, shows: (page) => availability(page) }, // read from the chain, not through the wallet
    { path: '/marketplace', shows: (page) => heading(page, 'Marketplace') },
    { path: '/my-tickets', shows: (page) => heading(page, /^Upcoming · \d+$/) },
    { path: '/profile', shows: (page) => heading(page, 'Account details') },
  ];

  test('read-only pages still load, with the banner on each, and its switch works', async ({ page, signIn, wallet }) => {
    await signIn('attendee');
    await wallet.switchNetwork(MAINNET);
    for (const { path, shows } of READ_ONLY) {
      await page.goto(path);
      await expect(shows(page), path).toBeVisible();
      await expect(banner(page), `the banner on ${path}`).toBeVisible();
    }

    await page.getByRole('button', { name: 'Switch to Sepolia' }).click();
    await expect(banner(page)).toBeHidden();
    expect(wallet.chainId).toBe(SEPOLIA_CHAIN_ID);
  });

  // Pages that send a transaction: the action stays off until the wallet is back on the contract's
  // network. Publishing is checked in create-event.spec.ts, resale buying in marketplace.spec.ts and
  // Admin's actions in admin.spec.ts.
  interface TxPage {
    name: string;
    who: Account;
    path: string;
    open?: (page: Page) => Promise<void>; // to where the transaction is sent from
    action: (page: Page) => Locator; // the button that sends it, while it can be pressed
    prompt: (page: Page) => Locator; // the page's own prompt to switch
    switchButton: (page: Page) => Locator;
  }
  const manageNotice = (page: Page) => page.locator('[data-slot="alert"]').filter({ hasText: /Switch to .+ to make changes/ });
  const TX_PAGES: TxPage[] = [
    {
      name: 'the event page (buying tickets)',
      who: accounts.jordan,
      path: `/events/${GALA.apiId}`,
      action: (page) => summary(page).getByRole('button', { name: /^Buy tickets/, disabled: false }),
      prompt: (page) => summary(page).getByText(/^Switch your wallet to .+ to buy tickets\.$/),
      switchButton: (page) => summary(page).getByRole('button', { name: 'Switch network' }),
    },
    {
      name: 'the Sell popup',
      who: accounts.alex,
      path: '/marketplace',
      open: async (page) => {
        await openSell(page, 0);
        await sellDialog(page).getByLabel('Set your price').fill('20'); // under the cap (30)
      },
      action: (page) => sellDialog(page).getByRole('button', { name: 'List ticket', disabled: false }),
      prompt: (page) => sellDialog(page).getByRole('button', { name: /^Switch to / }),
      switchButton: (page) => sellDialog(page).getByRole('button', { name: /^Switch to / }),
    },
    {
      name: "the organizer's event page",
      who: accounts.organizer,
      path: `/organizer/events/${GALA.apiId}`,
      action: (page) => main(page).getByRole('button', { name: 'Pause sales', disabled: false }),
      prompt: manageNotice,
      switchButton: (page) => manageNotice(page).getByRole('button', { name: 'Switch network' }),
    },
  ];

  for (const row of TX_PAGES) {
    test(`${row.name} keeps its action off and asks to switch, and the switch works`, async ({ page, signIn, wallet }) => {
      await signIn(row.who, { path: row.path });
      await row.open?.(page);
      await expect(row.action(page)).toBeVisible();
      const requests = wallet.requests.length;

      await wallet.switchNetwork(MAINNET);
      await expect(banner(page)).toBeVisible();
      await expect(row.prompt(page)).toBeVisible();
      await expect(row.action(page)).toHaveCount(0);
      await row.switchButton(page).click();

      await expect(row.prompt(page)).toHaveCount(0);
      await expect(row.action(page)).toBeVisible();
      expect(wallet.chainId).toBe(CHAIN_ID);
      expect(wallet.requests.slice(requests)).toContain('wallet_switchEthereumChain');
    });
  }

  test('the scanner asks to switch instead of checking in, and the switch works', async ({ openScanner }) => {
    // One of Alex's Gala tickets from the seed
    const scanner = await openScanner([{ qr: await entryQr(accounts.alex, 0, GALA.contractId), seconds: 3 }]);
    const checkIn = scanner.page.getByRole('button', { name: 'Check in', exact: true });
    await expect(checkIn).toBeVisible({ timeout: 30_000 });

    await scanner.wallet.switchNetwork(MAINNET);
    await expect(banner(scanner.page)).toBeVisible();
    await expect(checkIn).toHaveCount(0);
    await expect(scanner.page.getByText(/^This wallet is on another network\. Switch to .+ to check in\.$/)).toBeVisible();
    await scanner.page.getByRole('button', { name: 'Switch network' }).click();

    await expect(checkIn).toBeVisible();
    expect(scanner.wallet.chainId).toBe(CHAIN_ID);
  });
});

// --- Switching account, then disconnecting -------------------------------------------------------

interface WalletDataRow {
  name: string;
  path: string;
  first: Account;
  second: Account;
  setup?: () => Promise<void>;
  firstData: (page: Page) => Locator; // what the page shows of the first wallet
  marker: string; // the first wallet's text that must not come back once gone
  secondData: (page: Page) => Locator;
  signedOut: (page: Page) => Locator;
}

const WALLET_DATA: WalletDataRow[] = [
  {
    name: 'the navbar',
    path: '/',
    first: accounts.alex,
    second: accounts.jordan,
    firstData: (page) => navbar(page).getByText(short(accounts.alex), { exact: true }),
    marker: short(accounts.alex),
    secondData: (page) => navbar(page).getByText(short(accounts.jordan), { exact: true }),
    signedOut: (page) => navbar(page).getByRole('button', { name: 'Connect wallet' }),
  },
  {
    name: 'My Tickets',
    path: '/my-tickets',
    first: accounts.alex,
    second: accounts.jordan, // no tickets
    firstData: (page) => main(page).getByRole('article').filter({ hasText: GALA.title }).first(), // Alex has two: General Admission and Early Bird
    marker: GALA.title,
    secondData: (page) => heading(page, 'No tickets yet'),
    signedOut: (page) => heading(page, 'Connect your wallet'),
  },
  {
    name: 'Profile',
    path: '/profile',
    first: accounts.alex,
    second: accounts.jordan,
    firstData: (page) => main(page).getByText(short(accounts.alex), { exact: true }),
    marker: short(accounts.alex),
    secondData: (page) => main(page).getByText(short(accounts.jordan), { exact: true }),
    signedOut: (page) => heading(page, 'Connect your wallet'),
  },
  {
    name: 'Your listings on the Marketplace',
    path: '/marketplace',
    first: accounts.alex,
    second: accounts.jordan,
    // Alex lists his last Gala ticket (Early Bird, 10 USDC face value)
    setup: async () => waitForSync((await chain.listTicket(accounts.alex, 3, 15)).block),
    firstData: (page) => main(page).getByRole('region', { name: 'Your listings' }),
    marker: 'Your listings',
    // Alex's listing, which the others can buy
    secondData: (page) => main(page).getByRole('button', { name: /^Buy ticket #3 to / }),
    signedOut: (page) => main(page).getByRole('button', { name: /^Buy ticket #3 to / }),
  },
  {
    name: "the event page's wallet limit",
    path: `/events/${GALA.apiId}`,
    first: accounts.alex, // holds 4 Gala tickets, the limit
    second: accounts.jordan,
    firstData: (page) => summaryRow(page, 'Wallet Limit').getByText('4 of 4', { exact: true }),
    marker: '4 of 4',
    secondData: (page) => summaryRow(page, 'Wallet Limit').getByText('1 of 4', { exact: true }),
    signedOut: (page) => summaryRow(page, 'Wallet Limit').getByText('4 per wallet', { exact: true }),
  },
];

test.describe('switching account, then disconnecting', () => {
  for (const row of WALLET_DATA) {
    test(`${row.name} shows the new wallet's data, never the previous one's`, async ({ page, signIn, wallet }) => {
      await row.setup?.();
      await signIn(row.first, { path: row.path });
      await expect(row.firstData(page)).toBeVisible();
      const watched = await watchComesBack(page, row.marker);

      await wallet.switchAccount(row.second);
      await expect(row.secondData(page)).toBeVisible();
      await expect(row.firstData(page)).toHaveCount(0);

      await wallet.disconnect();
      await expect(row.signedOut(page)).toBeVisible();
      await expect(row.firstData(page)).toHaveCount(0);
      expect(await watched(), `"${row.marker}" after the switch`).toEqual({ gone: true, cameBack: false });
    });
  }
});

// --- Outages -------------------------------------------------------------------------------------

interface ApiDownRow {
  path: string;
  who?: Account | 'new wallet'; // signed in as, a wallet that never signed in, or a signed-out visitor
  error: string; // what the page says
  retry: string; // the button (or link) that tries again
  shows: (page: Page) => Locator; // the page, loaded
  bug?: string; // the issue, while the page doesn't say it yet
}

const SIGN_IN_ERROR = "We couldn't sign you in";
const API_DOWN: ApiDownRow[] = [
  { path: '/', error: 'Something went wrong while loading events.', retry: 'Try again', shows: (page) => heading(page, 'Upcoming events') },
  { path: `/events/${GALA.apiId}`, error: 'Could not load this event.', retry: 'Try again', shows: (page) => heading(page, GALA.title) },
  { path: '/marketplace', error: 'Something went wrong while loading the Marketplace.', retry: 'Try again', shows: (page) => heading(page, 'Marketplace') },
  { path: '/my-tickets', who: accounts.alex, error: "Couldn't load your tickets", retry: 'Try again', shows: (page) => heading(page, /^Upcoming · \d+$/) },
  // The session can't be checked either, so the page asks to sign in again
  { path: '/profile', who: accounts.alex, error: SIGN_IN_ERROR, retry: 'Sign in', shows: (page) => heading(page, 'Account details') },
  { path: '/signup', who: 'new wallet', error: SIGN_IN_ERROR, retry: 'Sign message', shows: (page) => main(page).getByText('Create your account', { exact: true }) },
  { path: '/scan', who: accounts.scanner, error: "Couldn't load your events", retry: 'Try again', shows: (page) => main(page).getByText(CAMERA) },
  { path: '/organizer', who: accounts.organizer, error: SIGN_IN_ERROR, retry: 'Sign in', shows: (page) => heading(page, 'My events'), bug: '#413' },
  { path: '/organizer/events/new', who: accounts.organizer, error: SIGN_IN_ERROR, retry: 'Sign in', shows: (page) => heading(page, 'Create event'), bug: '#413' },
  { path: `/organizer/events/${GALA.apiId}`, who: accounts.organizer, error: SIGN_IN_ERROR, retry: 'Sign in', shows: (page) => heading(page, GALA.title), bug: '#413' },
  { path: '/admin', who: accounts.admin, error: SIGN_IN_ERROR, retry: 'Sign in', shows: (page) => page.getByText(ADMIN_INTRO), bug: '#413' },
];

test.describe('outages', () => {
  for (const row of API_DOWN) {
    test(`API down: ${row.path} shows an error with a retry, and the retry works once the API is back`, async ({ page, signIn, wallet }) => {
      test.fixme(row.bug !== undefined, `It shows "Sign in to continue" without an error (${row.bug})`);
      if (row.who === 'new wallet') await connectNewWallet(page, wallet);
      else if (row.who) await signIn(row.who, { path: row.path });
      else await page.goto(row.path);
      await expect(row.shows(page)).toBeVisible();

      await page.route(API, (route) => route.abort());
      await page.reload();
      const error = alertWith(page, row.error);
      await expect(error).toBeVisible({ timeout: 30_000 });

      await page.unroute(API);
      const retry = main(page).getByRole('button', { name: row.retry, exact: true }).or(main(page).getByRole('link', { name: row.retry, exact: true }));
      await retry.first().click();
      await expect(error).toHaveCount(0);
      await expect(row.shows(page)).toBeVisible();
    });
  }

  // The scanner's own case is in scanner.spec.ts
  test("chain unreachable: the event page says it can't read the chain, shows no availability it can't check, and Try again works", async ({ page, signIn }) => {
    await signIn(accounts.jordan, { path: `/events/${GALA.apiId}` });
    await expect(availability(page)).toBeVisible();
    const before = (await availability(page).textContent()) ?? '';

    await page.route(CHAIN, (route) => route.abort());
    await page.reload();
    const chainError = main(page).getByRole('region', { name: 'Select Ticket Tier' }).getByRole('alert').filter({ hasText: 'Could not read this event from the blockchain.' });
    await expect(chainError).toBeVisible({ timeout: 30_000 });
    await expect(main(page).getByText('Checking availability…')).toBeVisible();
    await expect(availability(page)).toHaveCount(0);
    await expect(summary(page).getByRole('alert').filter({ hasText: "Could not read your wallet's balance and tickets." })).toBeVisible();
    await expect(summary(page).getByRole('button', { name: /^Buy tickets/, disabled: false })).toHaveCount(0);

    await page.unroute(CHAIN);
    await chainError.getByRole('button', { name: 'Try again' }).click();
    await expect(availability(page)).toHaveText(before);
    await expect(chainError).toHaveCount(0);
  });

  // Without the chain the wallet limit is unknown, not "No limit" (#414)
  test('chain unreachable: the wallet limit shows as unknown, not "No limit", until Try again reads it', async ({ page, signIn }) => {
    await signIn(accounts.jordan, { path: `/events/${GALA.apiId}` });
    const limit = summaryRow(page, 'Wallet Limit');
    await expect(limit).toContainText('of 4');

    await page.route(CHAIN, (route) => route.abort());
    await page.reload();
    const chainError = alertWith(page, 'Could not read this event from the blockchain.');
    await expect(chainError).toBeVisible({ timeout: 30_000 });
    await expect(limit).toContainText('—');
    await expect(limit).not.toContainText('No limit');

    await page.unroute(CHAIN);
    await chainError.getByRole('button', { name: 'Try again' }).click();
    await expect(limit).toContainText('of 4');
  });

  test("chain unreachable: the organizer's event page says it can't read the chain, and Try again works", async ({ page, signIn }) => {
    await signIn(accounts.organizer, { path: `/organizer/events/${GALA.apiId}` });
    const sales = main(page).getByText('Sales', { exact: true });
    await expect(sales).toBeVisible();

    await page.route(CHAIN, (route) => route.abort());
    await page.reload();
    const chainError = alertWith(page, "Couldn't read this event from the blockchain");
    await expect(chainError).toBeVisible({ timeout: 30_000 });
    await expect(sales).toHaveCount(0);

    await page.unroute(CHAIN);
    await chainError.getByRole('button', { name: 'Try again' }).click();
    await expect(sales).toBeVisible();
  });

  // Popups that read the chain when they open
  interface ChainPopup {
    name: string;
    who: Account;
    path: string;
    setup?: () => Promise<void>;
    before?: (page: Page) => Promise<void>; // with the chain still there
    open: (page: Page) => Promise<void>;
    error: string;
    shows: (page: Page) => Locator; // once it can read the chain
  }
  const CHAIN_POPUPS: ChainPopup[] = [
    {
      name: 'the Sell popup',
      who: accounts.alex,
      path: '/marketplace',
      open: async (page) => {
        await main(page).getByRole('button', { name: 'Sell a ticket' }).first().click();
        await sellDialog(page).getByRole('radio', { name: /Ticket #0(?!\d)/ }).click();
      },
      error: "Couldn't read this ticket from the blockchain.",
      shows: (page) => sellDialog(page).getByLabel('Set your price'),
    },
    {
      name: 'the Buy popup',
      who: accounts.jordan,
      path: '/marketplace',
      // Alex lists his Early Bird ticket #2 (10 USDC face value)
      setup: async () => waitForSync((await chain.listTicket(accounts.alex, 2, 15)).block),
      open: (page) => main(page).getByRole('button', { name: /^Buy ticket #2 to / }).click(),
      error: "Couldn't read this ticket from the blockchain.",
      shows: (page) => page.getByRole('dialog', { name: 'Buy resale ticket' }).getByRole('button', { name: /^Buy ticket · / }),
    },
    {
      name: "Admin's Edit settings",
      who: accounts.admin,
      path: '/admin',
      before: (page) => page.getByRole('tab', { name: /^Events\s*\d+$/ }).click(),
      open: (page) => page.getByRole('button', { name: `Edit settings of ${GALA.title}`, exact: true }).click(),
      error: "Couldn't read the event's settings",
      shows: (page) => page.getByRole('dialog', { name: 'Edit event settings' }).getByLabel('Royalty (%)'),
    },
  ];

  for (const row of CHAIN_POPUPS) {
    test(`chain unreachable: ${row.name} says it can't read the chain, shows nothing it can't check, and Try again works`, async ({ page, signIn }) => {
      await row.setup?.();
      await signIn(row.who, { path: row.path });
      await row.before?.(page);

      await page.route(CHAIN, (route) => route.abort());
      await row.open(page);
      const chainError = page.getByRole('dialog').getByRole('alert').filter({ hasText: row.error });
      await expect(chainError).toBeVisible({ timeout: 30_000 });
      await expect(row.shows(page)).toHaveCount(0);

      await page.unroute(CHAIN);
      await chainError.getByRole('button', { name: 'Try again' }).click();
      await expect(row.shows(page)).toBeVisible();
    });
  }

  test('listener behind: a purchase shows on the event page at once, and My Tickets catches up on its own', async ({ page, signIn }) => {
    const buyer = await createBuyer(30);
    const event = await createPublishedEvent({ title: 'Listener Behind' }); // 100 General Admission tickets at 20 USDC
    const left = (count: number) => main(page).getByText(`${count} of 100 tickets left`, { exact: true });

    // The API keeps the event as it was before the purchase
    const eventApi = await listenerBehind(page, `${API_URL}/api/events/${event.apiId}`);
    await signIn(buyer, { path: `/events/${event.apiId}` });
    await expect(left(100)).toBeVisible();
    await buyButton(page).click();
    await expect(summary(page).getByRole('status').filter({ hasText: "You're going!" })).toBeVisible({ timeout: 60_000 });
    await expect(left(99)).toBeVisible(); // from the chain, right away

    // The API leaves the new ticket out of the buyer's tickets
    type Owned = { tickets: Array<{ event: { contract_event_id: string | null } }> };
    const ticketsApi = await listenerBehind<Owned>(page, `${API_URL}/api/tickets/owner/*`, (body) => ({
      ...body,
      tickets: body.tickets.filter((ticket) => ticket.event.contract_event_id !== event.contractId.toString()),
    }));
    await summary(page).getByRole('link', { name: 'View my tickets' }).click();
    await expect(heading(page, 'No tickets yet')).toBeVisible();
    // My Tickets reads them again 5 s after opening, still without it...
    await expect.poll(ticketsApi.staleAnswers, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    eventApi.release();
    ticketsApi.release();
    // ...and 10 s after opening, once the listener has caught up
    await expect(main(page).getByRole('article').filter({ hasText: event.title })).toBeVisible({ timeout: 15_000 });
  });
});