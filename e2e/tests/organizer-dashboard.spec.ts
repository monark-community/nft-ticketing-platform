// The organizer dashboard (#348): "My events", sales (pause, resume, withdraw), the event's
// contract details and sold tickets, the guest list and presale, free tickets, scanners, and who
// can open it.
//
// Every write on the manage page is a transaction from the organizer's wallet, and most lists come
// from the API once the listener has saved the block. So each test checks the screen against the
// contract (eventConfigs, eventRevenue, ticketTypes, the guest list and scanners) and the API.

import type { Locator, Page } from '@playwright/test';
import { ethers } from 'ethers';

import {
  accounts,
  ApiError,
  ApiSession,
  apiGet,
  chain,
  contractEventIdFor,
  createPublishedEvent,
  expect,
  newWallet,
  signInThroughUi,
  test,
  TestWallet,
  waitForSync,
  type Account,
  type PublishedEvent,
} from '../fixtures/index.js';
import { WEB_URL } from '../stack/config.mjs';

const ORGANIZER_ROLE = ethers.id('ORGANIZER_ROLE');
const DAY_MS = 24 * 60 * 60 * 1000;

// A small PNG for cover images (64 x 36)
const COVER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAIAAAC2bqvFAAAAPElEQVR42u3PQQkAQAgAML0QFjW9v2shCFuD5XTFZS+OExAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQENj2AdjvAcrkh+esAAAAAElFTkSuQmCC',
  'base64',
);

// services/web/src/lib/organizer-manage-errors.ts and organizer-manage.ts
const MANAGE_ERRORS = {
  notOrganizerRole: "This wallet doesn't have the organizer role on the contract. An admin grants it when they approve your organizer request.",
  notEnoughTickets: "There aren't enough tickets left of this type for that many recipients. Lower the number and try again.",
  forbidden: "Only this event's organizer can do that. Sign in with the wallet that created the event.",
  noAccount: 'Every wallet needs a finished platform account (name and email) before it can be added. Nothing was sent on-chain.',
};

// ---------------------------------------------------------------------------------------------
// Accounts, events and the contract

const sendsSince = (wallet: TestWallet, from: number) => wallet.requests.slice(from).filter((method) => method === 'eth_sendTransaction').length;
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`.toLowerCase();
const revenueOf = async (event: { contractId: bigint }) => (await chain.ticketNft().eventRevenue(event.contractId)) as bigint;
const onGuestList = async (event: { contractId: bigint }, account: Account) => (await chain.ticketNft().isWhitelisted(event.contractId, account.address)) as boolean;
const isScanner = async (event: { contractId: bigint }, account: Account) => (await chain.ticketNft().eventScanners(event.contractId, account.address)) as boolean;
async function chainEvent(event: { contractId: bigint }) {
  const [, , , sold, configured, active] = (await chain.ticketNft().eventConfigs(event.contractId)) as [bigint, bigint, bigint, bigint, boolean, boolean, bigint];
  return { sold: Number(sold), configured, active, presale: (await chain.ticketNft().presaleActive(event.contractId)) as boolean };
}
async function chainType(event: { contractId: bigint }, typeId = 0) {
  const [, maxSupply, sold, issued] = (await chain.ticketNft().ticketTypes(event.contractId, typeId)) as [bigint, bigint, bigint, bigint, string];
  return { supply: Number(maxSupply), sold: Number(sold), issued: Number(issued) };
}

// Free tickets issued from the organizer's wallet, and their token IDs (from the Transfer events)
async function issueFree(event: { contractId: bigint }, typeId: number, recipients: Account[]) {
  const nft = chain.ticketNft(accounts.organizer);
  const receipt = (await (await nft.issueTickets(event.contractId, typeId, recipients.map((r) => r.address))).wait()) as ethers.ContractTransactionReceipt;
  return receipt.logs
    .map((log: ethers.Log) => {
      try {
        return nft.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .filter((parsed: ethers.LogDescription | null) => parsed?.name === 'Transfer')
    .map((parsed: ethers.LogDescription | null) => parsed!.args.tokenId as bigint);
}

// A finished account for Hardhat's account #index, made through the API like sign-up does
async function finishedAccount(index: number, firstName: string) {
  const account = newWallet(index);
  const session = await ApiSession.signIn(account);
  await session.put('/api/users/me', { first_name: firstName, last_name: `Tester ${index}`, email: `${firstName.toLowerCase()}.${index}@example.com` });
  return account;
}

// Makes an account an organizer, on the contract and in the API, like the admin page does
async function promote(account: Account) {
  const nft = chain.ticketNft();
  if (!((await nft.hasRole(ORGANIZER_ROLE, account.address)) as boolean)) {
    await (await chain.ticketNft(accounts.admin).grantRole(ORGANIZER_ROLE, account.address)).wait();
  }
  await (await ApiSession.signIn(accounts.admin)).post(`/api/admin/organizers/${account.address}`).catch((error) => {
    if (!(error instanceof ApiError && error.status === 409)) throw error; // already an organizer
  });
}

// A draft (and optionally its frozen version) in the API, with one ticket type
async function apiEvent(organizer: Account, title: string, { freeze = false } = {}) {
  const session = await ApiSession.signIn(organizer);
  const start = Date.now() + 25 * DAY_MS;
  const { id } = await session.post<{ id: string }>('/api/events', {
    title,
    description: 'Created by an end-to-end test.',
    category: 'Concerts',
    location: 'Bronson Centre, Ottawa, ON',
    start_date: new Date(start).toISOString(),
    end_date: new Date(start + 3 * 60 * 60 * 1000).toISOString(),
  });
  await session.post(`/api/events/${id}/ticket-types`, { name: 'General Admission', description: '', price: '20', supply: 100 });
  if (freeze) {
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(COVER_PNG)], { type: 'image/png' }), 'cover.png');
    await session.post(`/api/events/${id}/freeze`, form);
  }
  return { id, session };
}

// One event shared by the tests of a group, published by the first test that needs it on each
// project (the stack goes back to the seeded state before each file, on each project). Creating
// an event takes several transactions, so tests share one unless they need their own.
function sharedEvent(options: Parameters<typeof createPublishedEvent>[0]) {
  let made: { project: string; event: Promise<PublishedEvent> } | null = null;
  return () => {
    const project = test.info().project.name;
    if (made?.project !== project) made = { project, event: createPublishedEvent(options) };
    return made.event;
  };
}
// Guest list, free tickets and scanners all work on this one
const operationsEvent = sharedEvent({
  title: 'Dashboard Operations Night',
  perWalletLimit: 0,
  ticketTypes: [
    { name: 'General Admission', price: 20, supply: 200 },
    { name: 'VIP', price: 45, supply: 5 },
  ],
});

// ---------------------------------------------------------------------------------------------
// The page

const main = (page: Page) => page.getByRole('main');
const manageUrl = (event: { apiId: string }) => `/organizer/events/${event.apiId}`;
// A card of the manage page, by its title
const card = (page: Page, title: string) => main(page).locator('[data-slot="card"]').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
// A row of "My events" (the table turns into cards on phones, so rows are found as <tr>)
const eventRow = (page: Page, title: string) => main(page).locator('tbody tr').filter({ has: page.getByRole('link', { name: title, exact: true }) });
const rowTitles = (page: Page) => main(page).locator('tbody tr td:first-child a').allTextContents();

type SignIn = (who: Account | 'organizer' | 'attendee' | 'admin' | 'scanner', options?: { path?: string }) => Promise<void>;

async function openDashboard(page: Page, signIn: SignIn, who: Account | 'organizer' = 'organizer') {
  await signIn(who, { path: '/organizer' });
  await expect(main(page).getByRole('heading', { level: 1, name: 'My events' })).toBeVisible();
  await expect(main(page).getByRole('status', { name: 'Loading your events' })).toHaveCount(0);
}

// The manage page of an event, once it has read the event from the chain
async function openManage(page: Page, signIn: SignIn, event: { apiId: string; title: string }, who: Account | 'organizer' = 'organizer') {
  await signIn(who, { path: manageUrl(event) });
  await expect(main(page).getByRole('heading', { level: 1, name: event.title })).toBeVisible();
  await expect(card(page, 'Sales')).toBeVisible();
  await expect(card(page, 'Sales').getByText('Reading revenue…')).toHaveCount(0);
}

// A second person in their own browser, signed in with their own wallet
async function asSomeoneElse(page: Page, who: Account, path: string) {
  const { viewport, isMobile, hasTouch, deviceScaleFactor, timezoneId, locale } = test.info().project.use;
  const context = await page.context().browser()!.newContext({ baseURL: WEB_URL, viewport, isMobile, hasTouch, deviceScaleFactor, timezoneId, locale });
  const theirWallet = await TestWallet.attach(context, who);
  const theirPage = await context.newPage();
  await signInThroughUi(theirPage, theirWallet, who, { path });
  return { page: theirPage, close: () => context.close() };
}

// A transaction's outcome in a card
const done = (scope: Locator, message: string) => expect(scope.getByText(message)).toBeVisible();

// ---------------------------------------------------------------------------------------------

test.describe('My events', () => {
  test('every event of this organizer in every status, with its counts; nothing from other organizers', async ({ page, signIn }) => {
    // Sophie's: a draft, an event waiting to publish, a live event with 3 sales, plus the seeded
    // Gala (live) and Jazz (presale)
    await apiEvent(accounts.organizer, 'Dashboard Draft Show');
    await apiEvent(accounts.organizer, 'Dashboard Frozen Show', { freeze: true });
    const live = await createPublishedEvent({ title: 'Dashboard Live Show', perWalletLimit: 0, ticketTypes: [{ name: 'General Admission', price: 20, supply: 100 }] });
    await chain.buyTickets(accounts.alex, { eventId: live.contractId, quantity: 3 });
    // Another organizer's event
    await promote(accounts.jordan);
    await createPublishedEvent({ organizer: accounts.jordan, title: 'Someone Else Show' });
    await waitForSync();

    await openDashboard(page, signIn);
    const mine = await (await ApiSession.signIn(accounts.organizer)).get<Array<{ title: string }>>('/api/events/mine');
    await expect.poll(async () => (await rowTitles(page)).sort()).toEqual(mine.map((event) => event.title).sort());
    await expect(eventRow(page, 'Someone Else Show')).toHaveCount(0);

    await expect(eventRow(page, 'Dashboard Draft Show')).toContainText('Draft');
    await expect(eventRow(page, 'Dashboard Frozen Show')).toContainText('Ready to publish');
    await expect(eventRow(page, 'Dashboard Live Show')).toContainText('Live');
    await expect(eventRow(page, 'Jazz at the Atrium')).toContainText('Presale');
    // Sold and revenue follow the contract's sales
    expect((await chainType(live)).sold).toBe(3);
    await expect(eventRow(page, 'Dashboard Live Show')).toContainText('3 / 100');
    await expect(eventRow(page, 'Dashboard Live Show')).toContainText('60.00 USDC');

    // The tabs count the same events
    await expect(main(page).getByRole('tab', { name: new RegExp(`^All events ${mine.length}$`) })).toHaveAttribute('aria-selected', 'true');
    await main(page).getByRole('tab', { name: /^Unpublished/ }).click();
    await expect.poll(async () => (await rowTitles(page)).sort()).toEqual(['Dashboard Draft Show', 'Dashboard Frozen Show']);
    await main(page).getByRole('tab', { name: /^Live/ }).click();
    await expect.poll(async () => rowTitles(page)).not.toContain('Dashboard Draft Show');
    await expect(eventRow(page, 'Dashboard Live Show')).toBeVisible();
  });

  test('continue a draft, finish publishing a frozen event, and open a published one', async ({ page, signIn }) => {
    const draft = await apiEvent(accounts.organizer, 'Dashboard Draft To Continue');
    const frozen = await apiEvent(accounts.organizer, 'Dashboard Frozen To Publish', { freeze: true });
    const live = await operationsEvent();
    await openDashboard(page, signIn);

    await eventRow(page, 'Dashboard Draft To Continue').getByRole('link', { name: 'Continue setup' }).click();
    await expect(page).toHaveURL(`${WEB_URL}/organizer/events/new?draft=${draft.id}`);
    await expect(main(page).getByLabel('Event name')).toHaveValue('Dashboard Draft To Continue');

    await page.goBack();
    await eventRow(page, 'Dashboard Frozen To Publish').getByRole('link', { name: 'Publish', exact: true }).click();
    await expect(page).toHaveURL(`${WEB_URL}/organizer/events/new?draft=${frozen.id}&step=review`);

    await page.goBack();
    await eventRow(page, live.title).getByRole('link', { name: 'Manage' }).click();
    await expect(page).toHaveURL(`${WEB_URL}${manageUrl(live)}`);
    await expect(main(page).getByRole('heading', { level: 1, name: live.title })).toBeVisible();
    await expect(main(page).getByRole('link', { name: 'View public page' })).toHaveAttribute('href', `/events/${live.apiId}`);
  });

  test('a new organizer sees the empty state', async ({ page, signIn }) => {
    const fresh = await finishedAccount(30, 'Robin');
    await promote(fresh);
    await openDashboard(page, signIn, fresh);

    await expect(main(page).getByRole('heading', { name: 'No events yet' })).toBeVisible();
    await expect(main(page).getByText('Create your first event and it will appear here.')).toBeVisible();
    await expect(main(page).getByRole('link', { name: 'Create event' })).toHaveAttribute('href', '/organizer/events/new');
  });
});

test.describe('sales', () => {
  test('pausing sales refuses buyers with a clear message; resuming lets them buy again', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({ title: 'Dashboard Pause Night', perWalletLimit: 0 });
    await openManage(page, signIn, event);
    const sales = card(page, 'Sales');
    await expect(sales).toContainText('Sales open');

    let sent = wallet.requests.length;
    await sales.getByRole('button', { name: 'Pause sales' }).click();
    await done(sales, "Ticket sales are paused. Buyers can't buy until you resume.");
    expect(sendsSince(wallet, sent)).toBe(1);
    expect((await chainEvent(event)).active).toBe(false);
    await expect(sales.getByRole('button', { name: 'Resume sales' })).toBeVisible();
    await expect(main(page).getByText('Sales paused').first()).toBeVisible();

    // A buyer is refused, on the event page and by the contract
    const buyer = await page.context().newPage();
    await buyer.goto(`/events/${event.apiId}`);
    await expect(buyer.getByRole('main').getByText('Ticket sales are closed')).toBeVisible();
    await expect(chain.ticketNft(accounts.jordan).buyTickets.staticCall(event.contractId, 0, 1)).rejects.toThrow('Sale is not active');

    sent = wallet.requests.length;
    await sales.getByRole('button', { name: 'Resume sales' }).click();
    await done(sales, 'Ticket sales are open again.');
    expect(sendsSince(wallet, sent)).toBe(1);
    expect((await chainEvent(event)).active).toBe(true);
    await chain.buyTickets(accounts.jordan, { eventId: event.contractId });
    await buyer.reload();
    await expect(buyer.getByRole('main').getByText('Ticket sales are closed')).toHaveCount(0);
    await expect(buyer.getByRole('main').getByText('99 of 100 tickets left')).toBeVisible();
  });

  test('withdraw takes exactly the unwithdrawn sales revenue; the numbers follow sales, resales and withdrawals', async ({ page, signIn }) => {
    const event = await createPublishedEvent({ title: 'Dashboard Revenue Night', perWalletLimit: 0, royaltyPercent: 10, ticketTypes: [{ name: 'General Admission', price: 20, supply: 100 }] });
    // Nothing sold yet
    await openManage(page, signIn, event);
    const sales = card(page, 'Sales');
    await expect(sales).toContainText('0.00 USDC');
    await expect(sales.getByText('Nothing to withdraw yet. Revenue appears here as tickets sell.')).toBeVisible();
    await expect(sales.getByRole('button', { name: 'Withdraw revenue' })).toBeDisabled();
    await expect(chain.ticketNft(accounts.organizer).withdraw.staticCall(event.contractId)).rejects.toThrow('No revenue to withdraw');

    // 3 tickets sold, and one resold: the royalty goes straight to the organizer, not to the
    // revenue waiting to be withdrawn
    const { tokenIds } = await chain.buyTickets(accounts.alex, { eventId: event.contractId, quantity: 3 });
    await chain.listTicket(accounts.alex, tokenIds[0], 30);
    const before = await chain.usdcBalance(accounts.organizer.address);
    await chain.buyListedTicket(accounts.jordan, tokenIds[0]);
    expect((await chain.usdcBalance(accounts.organizer.address)) - before).toBe(chain.usdc(3));
    expect(await revenueOf(event)).toBe(chain.usdc(60));

    await page.reload();
    await expect(sales).toContainText('60.00 USDC', { timeout: 20_000 });
    const balance = await chain.usdcBalance(accounts.organizer.address);
    await sales.getByRole('button', { name: 'Withdraw revenue' }).click();
    await done(sales, 'Withdrawal confirmed. The revenue is in your wallet.');
    expect((await chain.usdcBalance(accounts.organizer.address)) - balance).toBe(chain.usdc(60));
    expect(await revenueOf(event)).toBe(0n);
    await expect(sales.getByText('Nothing to withdraw yet. Revenue appears here as tickets sell.')).toBeVisible();
    await expect(sales.getByRole('button', { name: 'Withdraw revenue' })).toBeDisabled();

    // Another sale after the withdrawal: only that is available
    await chain.buyTickets(accounts.jordan, { eventId: event.contractId });
    expect(await revenueOf(event)).toBe(chain.usdc(20));
    await page.reload();
    await expect(sales).toContainText('20.00 USDC', { timeout: 20_000 });

    // "My events" shows the event's sales (4 sold, 80 USDC in total), not what's left to withdraw
    await waitForSync();
    expect((await chainType(event)).sold).toBe(4);
    await page.goto('/organizer');
    await expect(eventRow(page, event.title)).toContainText('4 / 100');
    await expect(eventRow(page, event.title)).toContainText('80.00 USDC');
  });
});

test.describe('event details', () => {
  test('contract address, network and event ID', async ({ page, signIn }) => {
    const event = await operationsEvent();
    await openManage(page, signIn, event);
    const info = card(page, 'Contract & network');

    await expect(info).toContainText(chain.addresses().TicketNFT);
    await expect(info).toContainText(/chain 31337/);
    await expect(info).toContainText(event.contractId.toString());
    await expect(info).toContainText(short(accounts.organizer.address));
    // The local chain has no block explorer, so there are no explorer links to follow here; on
    // Sepolia the address and the organizer link to Etherscan
    await expect(info.getByText('This local network has no block explorer.')).toBeVisible();
    await expect(info.getByRole('link')).toHaveCount(0);
    expect(await chain.ticketNft().eventOrganizer(event.contractId)).toBe(accounts.organizer.address);
  });

  test('sold tickets and who owns them, following resales and check-ins', async ({ page, signIn }) => {
    const event = await createPublishedEvent({ title: 'Dashboard Owners Night', perWalletLimit: 0, ticketTypes: [{ name: 'General Admission', price: 20, supply: 100 }] });
    const { tokenIds: [resold, checked] } = await chain.buyTickets(accounts.alex, { eventId: event.contractId, quantity: 2 });
    const { tokenIds: [listed] } = await chain.buyTickets(accounts.jordan, { eventId: event.contractId });
    const [free] = await issueFree(event, 0, [accounts.scanner]);
    await chain.listTicket(accounts.alex, resold, 25);
    await chain.buyListedTicket(accounts.jordan, resold);
    await chain.checkIn(accounts.organizer, checked);
    await chain.listTicket(accounts.jordan, listed, 22);
    await waitForSync();

    await openManage(page, signIn, event);
    const tickets = card(page, 'Tickets');
    const row = (token: bigint) => tickets.locator('tbody tr').filter({ has: page.getByText(`#${token}`, { exact: true }) });
    await expect(tickets.locator('tbody tr')).toHaveCount(4);
    for (const [label, value] of [['Tickets', '4'], ['Sold', '3'], ['Issued free', '1'], ['Checked in', '1']]) {
      await expect(tickets.getByRole('term').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]')).toHaveText(value);
    }

    // The resold ticket is Jordan's now
    await expect(row(resold)).toContainText(short(accounts.jordan.address));
    expect(await chain.ownerOf(resold)).toBe(accounts.jordan.address);
    await expect(row(checked)).toContainText(short(accounts.alex.address));
    await expect(row(checked)).toContainText('Checked in');
    await expect(row(listed)).toContainText('Listed at 22.00 USDC');
    await expect(row(free)).toContainText('Issued free');
    await expect(row(free)).toContainText('Free');
    await expect(row(free)).toContainText(short(accounts.scanner.address));

    // Filters
    await tickets.getByLabel('Status').selectOption('USED');
    await expect(tickets.locator('tbody tr')).toHaveCount(1);
    await expect(row(checked)).toBeVisible();
    await tickets.getByLabel('Status').selectOption('');
    await tickets.getByLabel('Source').selectOption('issued');
    await expect(tickets.locator('tbody tr')).toHaveCount(1);
    await expect(row(free)).toBeVisible();
  });

  test('publishing checks the event is set up on-chain by this organizer', async () => {
    await promote(accounts.jordan);
    // Not set up on-chain at all
    const unset = await apiEvent(accounts.organizer, 'Dashboard Not On Chain', { freeze: true });
    const id = contractEventIdFor(unset.id);
    await expect(unset.session.post(`/api/events/${unset.id}/publish`, { contract_event_id: id.toString() })).rejects.toMatchObject({ status: 409 });

    // Set up on-chain, but by another organizer's wallet
    const theirs = await apiEvent(accounts.organizer, 'Dashboard Wrong Wallet', { freeze: true });
    const theirsId = contractEventIdFor(theirs.id);
    const end = Math.max(Math.floor(Date.now() / 1000), await chain.chainNow()) + 30 * 24 * 60 * 60;
    await (await chain.ticketNft(accounts.jordan).configureEvent(theirsId, end, 1000, 20_000, 4)).wait();
    await expect(theirs.session.post(`/api/events/${theirs.id}/publish`, { contract_event_id: theirsId.toString() })).rejects.toMatchObject({ status: 403 });

    // Set up by this organizer: published
    await (await chain.ticketNft(accounts.organizer).configureEvent(id, end, 1000, 20_000, 4)).wait();
    await unset.session.post(`/api/events/${unset.id}/publish`, { contract_event_id: id.toString() });
    expect((await apiGet<{ status: string }>(`/api/events/${unset.id}`)).status).toBe('PUBLISHED');
    expect((await (await ApiSession.signIn(accounts.organizer)).get<{ status: string }>(`/api/events/${theirs.id}`)).status).toBe('FROZEN');
  });
});

test.describe('guest list and presale', () => {
  test('add and remove one wallet; a batch with a duplicate; invalid addresses; wallets without an account', async ({ page, signIn, wallet }) => {
    const event = await operationsEvent();
    const extra = await finishedAccount(31, 'Casey');
    await openManage(page, signIn, event);
    const list = card(page, 'Guest list & presale');
    const box = list.getByLabel('Add wallets');
    const add = list.getByRole('button', { name: 'Add to guest list' });
    // The list's rows (the transaction's progress steps are list items too)
    const entries = list.getByRole('listitem').filter({ hasText: /^0x[0-9a-f]{4}…/ });
    const entry = (account: Account) => entries.filter({ hasText: short(account.address) });

    // One wallet
    let sent = wallet.requests.length;
    await box.fill(accounts.alex.address);
    await add.click();
    await done(list, '1 wallet added to the guest list.');
    expect(sendsSince(wallet, sent)).toBe(1);
    expect(await onGuestList(event, accounts.alex)).toBe(true);
    await expect(entry(accounts.alex)).toBeVisible();
    await expect(entry(accounts.alex)).toContainText('On-chain', { timeout: 20_000 });

    // A batch, with one address twice (in another letter case) and one already on the list
    sent = wallet.requests.length;
    await box.fill([accounts.jordan.address, extra.address.toLowerCase(), accounts.jordan.address.toUpperCase().replace('0X', '0x'), accounts.alex.address].join('\n'));
    await add.click();
    await done(list, '2 wallets added to the guest list. 1 duplicate entry was ignored.');
    expect(sendsSince(wallet, sent)).toBe(1);
    expect(await onGuestList(event, accounts.jordan)).toBe(true);
    expect(await onGuestList(event, extra)).toBe(true);
    await expect(entries).toHaveCount(3);
    await expect(list).toContainText('3 wallets');

    // All of them already on the list: nothing to send
    sent = wallet.requests.length;
    await box.fill(accounts.jordan.address);
    await add.click();
    await expect(list.getByText('Those wallets are already on the guest list.')).toBeVisible();
    expect(sendsSince(wallet, sent)).toBe(0);

    // Invalid addresses, the zero address and more than 100: nothing is sent
    for (const [text, message] of [
      ['0x1234', '"0x1234" is not a valid wallet address.'],
      [`${accounts.alex.address}, not-an-address`, '"not-an-address" is not a valid wallet address.'],
      [ethers.ZeroAddress, "The zero address can't receive tickets or be added to the guest list."],
      [Array.from({ length: 101 }, (_, i) => newWallet(100 + i).address).join('\n'), 'Add at most 100 wallets at a time.'],
    ]) {
      await box.fill(text);
      await add.click();
      await expect(list.getByText(message)).toBeVisible();
    }
    expect(sendsSince(wallet, sent)).toBe(0);

    // A wallet without a platform account: the API refuses, nothing goes on-chain
    await box.fill(accounts.new4.address);
    await add.click();
    await expect(list.getByText(MANAGE_ERRORS.noAccount)).toBeVisible();
    expect(sendsSince(wallet, sent)).toBe(0);
    expect(await onGuestList(event, accounts.new4)).toBe(false);

    // Removing one
    sent = wallet.requests.length;
    await entry(extra).getByRole('button', { name: 'Remove' }).click();
    await done(list, `${short(extra.address)} removed from the guest list.`);
    expect(sendsSince(wallet, sent)).toBe(1);
    expect(await onGuestList(event, extra)).toBe(false);
    await expect(entry(extra)).toHaveCount(0);
  });

  test('presale on: only wallets on the list can buy; presale off: everyone can', async ({ page, signIn }) => {
    const event = await operationsEvent();
    await openManage(page, signIn, event);
    const list = card(page, 'Guest list & presale');
    const presale = list.getByRole('switch', { name: 'Presale' });
    // Alex is on the list from the test above (or added here if this one runs alone)
    if (!(await onGuestList(event, accounts.alex))) {
      await list.getByLabel('Add wallets').fill(accounts.alex.address);
      await list.getByRole('button', { name: 'Add to guest list' }).click();
      await done(list, '1 wallet added to the guest list.');
    }
    const outsider = accounts.scanner;
    expect(await onGuestList(event, outsider)).toBe(false);
    await chain.giveUsdc(outsider.address, 100);

    await presale.click();
    await done(list, 'Presale is on. Only guest-list wallets can buy.');
    await expect(presale).toHaveAttribute('aria-checked', 'true');
    expect((await chainEvent(event)).presale).toBe(true);
    await expect(list.getByText('On — only wallets on this list can buy.')).toBeVisible();
    await expect(chain.ticketNft(outsider).buyTickets.staticCall(event.contractId, 0, 1)).rejects.toThrow('Address not whitelisted for presale');
    await chain.buyTickets(accounts.alex, { eventId: event.contractId });

    await presale.click();
    await done(list, 'Presale is off. Anyone can buy while sales are open.');
    await expect(presale).toHaveAttribute('aria-checked', 'false');
    expect((await chainEvent(event)).presale).toBe(false);
    await chain.buyTickets(outsider, { eventId: event.contractId });
  });
});

test.describe('free tickets', () => {
  test('issue to one and to many: they count toward supply, skip the guest list, and show in My Tickets', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({
      title: 'Dashboard Free Tickets',
      perWalletLimit: 0,
      // Presale on with an empty guest list: nobody can buy, but free tickets still go out
      presaleGuestList: [],
      ticketTypes: [
        { name: 'General Admission', price: 20, supply: 100 },
        { name: 'VIP', price: 45, supply: 5 },
      ],
    });
    expect((await chainEvent(event)).presale).toBe(true);
    await openManage(page, signIn, event);
    const free = card(page, 'Free tickets');
    const type = free.getByLabel('Ticket type');
    const recipients = free.getByLabel('Recipients');
    const issue = free.getByRole('button', { name: 'Issue free tickets' });
    const vip = (await type.getByRole('option').filter({ hasText: /^VIP/ }).getAttribute('value'))!;
    await type.selectOption(vip);
    await expect(free).toContainText('5 of 5 tickets left · 45.00 USDC face value');

    // One
    let sent = wallet.requests.length;
    await recipients.fill(accounts.jordan.address);
    await expect(free.getByText('1 ticket will be issued.')).toBeVisible();
    await issue.click();
    await done(free, '1 free ticket of VIP issued.');
    expect(sendsSince(wallet, sent)).toBe(1);

    // Many, with a duplicate
    sent = wallet.requests.length;
    await recipients.fill([accounts.alex.address, accounts.scanner.address, accounts.alex.address].join('\n'));
    await expect(free.getByText('2 tickets will be issued · 1 duplicate entry ignored.')).toBeVisible();
    await issue.click();
    await done(free, '2 free tickets of VIP issued.');
    expect(sendsSince(wallet, sent)).toBe(1);

    // They count toward the supply: 2 left
    expect(await chainType(event, 1)).toMatchObject({ supply: 5, sold: 0, issued: 3 });
    await expect(free).toContainText('2 of 5 tickets left');
    await expect(type.getByRole('option').filter({ hasText: /^VIP/ })).toHaveText('VIP — 2 left');

    // More than what's left is refused before anything is sent, and by the contract
    sent = wallet.requests.length;
    await recipients.fill([accounts.new1.address, accounts.new2.address, accounts.new3.address].join('\n'));
    await issue.click();
    await expect(free.getByText(MANAGE_ERRORS.notEnoughTickets)).toBeVisible();
    expect(sendsSince(wallet, sent)).toBe(0);
    await expect(
      chain.ticketNft(accounts.organizer).issueTickets.staticCall(event.contractId, 1, [accounts.new1.address, accounts.new2.address, accounts.new3.address]),
    ).rejects.toThrow();

    // An invalid address: nothing can be issued (the button stays off; no message says why)
    await recipients.fill(`${accounts.new1.address}\nnot-an-address`);
    await expect(issue).toBeDisabled();
    await expect(free.getByText(/will be issued/)).toHaveCount(0);

    // Jordan never was on the guest list, and has the ticket in My Tickets
    expect(await onGuestList(event, accounts.jordan)).toBe(false);
    await waitForSync();
    const jordan = await asSomeoneElse(page, accounts.jordan, '/my-tickets');
    await expect(jordan.page.getByRole('main').getByRole('heading', { name: event.title })).toBeVisible({ timeout: 20_000 });
    await jordan.close();
  });
});

test.describe('scanners', () => {
  test('add and remove a scanner wallet; the scanner page follows', async ({ page, signIn, wallet }) => {
    const event = await operationsEvent();
    await openManage(page, signIn, event);
    const scanners = card(page, 'Scanners');
    const box = scanners.getByLabel('Add a scanner');
    const add = scanners.getByRole('button', { name: 'Add scanner' });
    const entry = scanners.getByRole('listitem').filter({ hasText: short(accounts.scanner.address) });

    // One at a time
    await box.fill(`${accounts.scanner.address}\n${accounts.alex.address}`);
    await add.click();
    await expect(scanners.getByText('Add one scanner at a time.')).toBeVisible();

    let sent = wallet.requests.length;
    await box.fill(accounts.scanner.address);
    await add.click();
    await done(scanners, `${short(accounts.scanner.address)} can now check in tickets.`);
    expect(sendsSince(wallet, sent)).toBe(1);
    expect(await isScanner(event, accounts.scanner)).toBe(true);
    await expect(entry).toContainText('On-chain', { timeout: 20_000 });

    // The scanner's page offers the event
    const staff = await asSomeoneElse(page, accounts.scanner, '/scan');
    const picker = staff.page.getByLabel("Event you're scanning for");
    await expect(picker.getByRole('option', { name: new RegExp(`^${event.title} · `) })).toHaveCount(1, { timeout: 20_000 });

    // Already a scanner
    sent = wallet.requests.length;
    await box.fill(accounts.scanner.address);
    await add.click();
    await expect(scanners.getByText('That wallet is already a scanner for this event.')).toBeVisible();
    expect(sendsSince(wallet, sent)).toBe(0);

    // Removed: the scanner page no longer offers it
    await entry.getByRole('button', { name: 'Remove' }).click();
    await done(scanners, `${short(accounts.scanner.address)} can no longer check in tickets.`);
    expect(await isScanner(event, accounts.scanner)).toBe(false);
    await expect(entry).toHaveCount(0);
    await staff.page.reload();
    await expect(picker.getByRole('option').first()).not.toHaveText('Loading events...', { timeout: 20_000 });
    await expect(picker.getByRole('option', { name: new RegExp(`^${event.title} · `) })).toHaveCount(0);
    await staff.close();
  });
});

test.describe('access', () => {
  test('signed-out visitors and attendees can\'t open the dashboard', async ({ page, signIn }) => {
    await page.goto('/organizer');
    await expect(main(page).getByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
    await expect(main(page).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', `/signup?next=${encodeURIComponent('/organizer')}`);
    await expect(main(page).getByRole('heading', { name: 'My events' })).toHaveCount(0);

    await signIn('attendee', { path: '/organizer' });
    await expect(main(page).getByRole('heading', { name: 'Organizer access needed' })).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Request organizer access' })).toBeVisible();
    await expect(main(page).getByRole('heading', { name: 'My events' })).toHaveCount(0);
    // The API refuses too
    await expect((await ApiSession.signIn(accounts.alex)).get('/api/events/mine')).rejects.toMatchObject({ status: 403 });
  });

  test('the admin is asked to use an organizer account', async ({ page, signIn }) => {
    await signIn('admin', { path: '/organizer' });
    await expect(main(page).getByRole('heading', { name: 'Use an organizer account' })).toBeVisible();
    await expect(main(page).getByText("Admin accounts can't open the organizer dashboard. Switch to your organizer wallet in your wallet app.")).toBeVisible();
    await expect(main(page).getByRole('heading', { name: 'My events' })).toHaveCount(0);
  });

  test('another organizer can\'t manage this organizer\'s event', async ({ page, signIn }) => {
    const event = await operationsEvent();
    await promote(accounts.jordan);
    await signIn(accounts.jordan, { path: manageUrl(event) });
    await expect(main(page).getByRole('heading', { name: 'This event belongs to another organizer' })).toBeVisible();
    await expect(card(page, 'Sales')).toHaveCount(0);
    await expect((await ApiSession.signIn(accounts.jordan)).get(`/api/events/${event.apiId}/whitelist`)).rejects.toMatchObject({ status: 403 });
  });

  test('a revoked organizer can still withdraw, and gets clear messages for what they can\'t do', async ({ page, signIn }) => {
    // Robin's own event, with a sale
    const robin = await finishedAccount(32, 'Robin');
    await promote(robin);
    await chain.setEth(robin.address, 100);
    const event = await createPublishedEvent({ organizer: robin, title: 'Dashboard Revoked Organizer', perWalletLimit: 0 });
    await chain.buyTickets(accounts.alex, { eventId: event.contractId });
    await openManage(page, signIn, event, robin);

    // The admin takes the role away, on the contract and in the API
    await (await chain.ticketNft(accounts.admin).revokeRole(ORGANIZER_ROLE, robin.address)).wait();
    await (await ApiSession.signIn(accounts.admin)).delete(`/api/admin/organizers/${robin.address}`).catch((error) => {
      if (!(error instanceof ApiError && error.status === 409)) throw error;
    });

    // The page is still open. Pausing needs the role: refused with the reason
    const sales = card(page, 'Sales');
    await sales.getByRole('button', { name: 'Pause sales' }).click();
    await expect(sales.getByText(MANAGE_ERRORS.notOrganizerRole)).toBeVisible();
    expect((await chainEvent(event)).active).toBe(true);
    // The guest list goes through the API's organizer routes: refused
    const list = card(page, 'Guest list & presale');
    await list.getByLabel('Add wallets').fill(accounts.jordan.address);
    await list.getByRole('button', { name: 'Add to guest list' }).click();
    await expect(list.getByText(MANAGE_ERRORS.forbidden)).toBeVisible();

    // Withdrawing only needs to be the event's organizer: the revenue still comes out
    const before = await chain.usdcBalance(robin.address);
    await sales.getByRole('button', { name: 'Withdraw revenue' }).click();
    await done(sales, 'Withdrawal confirmed. The revenue is in your wallet.');
    expect((await chain.usdcBalance(robin.address)) - before).toBe(chain.usdc(20));

    // Opening the dashboard again: organizer access is needed
    await page.goto('/organizer');
    await expect(main(page).getByRole('heading', { name: 'Organizer access needed' })).toBeVisible();
    // The event itself stays public
    expect((await apiGet<{ status: string }>(`/api/events/${event.apiId}`)).status).toBe('PUBLISHED');
  });
});
