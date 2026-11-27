// The full demo journey (#338), from an organizer request to the check-in, in one long test.
// If only one end-to-end test runs, it's this one, and it's the base of the Sepolia smoke test.
//
// Each person has their own browser context and test wallet, like separate people on separate
// devices. Each step is checked on the screen, on the contract and in the API. The API is read
// through its public routes (never the test stack's control server), so the journey only depends on
// settings to run against another network.

import type { BrowserContext, Page } from '@playwright/test';
import { ethers } from 'ethers';

import {
  accounts,
  ApiSession,
  apiGet,
  chain,
  contractEventIdFor,
  entryQr,
  expect,
  signInThroughUi,
  test as base,
  TestWallet,
  WALLET_NAME,
  type Account,
  type ScannerSession,
} from '../fixtures/index.js';

interface Person {
  page: Page;
  wallet: TestWallet;
}

// openAs(account, path): a new browser context for one person, signed in through the real Connect
// button and ending on `path` (or not signed in when `path` is left out). Closed after the test.
const test = base.extend<{ openAs: (account: Account, path?: string) => Promise<Person> }>({
  openAs: async ({ browser, baseURL }, use, testInfo) => {
    const opened: BrowserContext[] = [];
    await use(async (account, path) => {
      const project = testInfo.project.use;
      const context = await browser.newContext({
        baseURL,
        viewport: project.viewport,
        isMobile: project.isMobile,
        hasTouch: project.hasTouch,
        deviceScaleFactor: project.deviceScaleFactor,
        timezoneId: project.timezoneId,
        locale: project.locale,
        reducedMotion: 'reduce',
      });
      opened.push(context);
      const wallet = await TestWallet.attach(context, account);
      const page = await context.newPage();
      if (path !== undefined) await signInThroughUi(page, wallet, account, { path });
      return { page, wallet };
    });
    for (const context of opened) await context.close();
  },
});

const ORGANIZER_ROLE = ethers.id('ORGANIZER_ROLE');
const DAY_MS = 24 * 60 * 60 * 1000;

// The event the new organizer creates through the UI
const GA = { name: 'General Admission', price: 20, supply: 100 };
const VIP = { name: 'VIP', price: 45, supply: 50 };
const RESALE_PRICE = 30; // within the 2x cap on a 20 USDC ticket
const ROYALTY_PERCENT = 10;

// A small PNG for the cover image (64 x 36, orange)
const COVER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAIAAAC2bqvFAAAAPElEQVR42u3PQQkAQAgAML0QFjW9v2shCFuD5XTFZS+OExAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQENj2AdjvAcrkh+esAAAAAElFTkSuQmCC',
  'base64',
);

// A date as a datetime-local input wants it ("2026-12-14T19:00"), in the browser's time zone
function localInput(ms: number, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// A link of the main navigation. On a phone it's in the menu, so the menu is opened first.
async function navLink(page: Page, name: string) {
  if (test.info().project.name === 'phone') await page.getByRole('button', { name: 'Open menu' }).click();
  return page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true });
}

interface OwnedTicket {
  token_id: string;
  status: 'VALID' | 'USED';
  event: { id: string };
}

// A wallet's tickets for one event, from the API's public owner route, lowest token ID first
async function ticketsOf(account: Account, apiEventId: string): Promise<OwnedTicket[]> {
  const { tickets } = await apiGet<{ tickets: OwnedTicket[] }>(`/api/tickets/owner/${account.address}`);
  return tickets.filter((t) => t.event.id === apiEventId).sort((a, b) => Number(BigInt(a.token_id) - BigInt(b.token_id)));
}

const tokenIdsOf = async (account: Account, apiEventId: string) => (await ticketsOf(account, apiEventId)).map((t) => t.token_id);
const statusOf = async (account: Account, apiEventId: string, tokenId: bigint) =>
  (await ticketsOf(account, apiEventId)).find((t) => t.token_id === tokenId.toString())?.status ?? null;

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// The organizer dashboard: an event's row in "My events" (on phones the table turns into cards,
// still built from <tr>), a card of the event's manage page, and a wallet as it shortens them
const myEventsRow = (page: Page, title: string) =>
  page.getByRole('main').locator('tbody tr').filter({ has: page.getByRole('link', { name: title, exact: true }) });
const manageCard = (page: Page, title: string) =>
  page.getByRole('main').locator('[data-slot="card"]').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`.toLowerCase();

test('the demo journey: organizer request, approval, event, sale, check-in, resale and withdrawal', async ({ openAs, openScanner }, testInfo) => {
  test.setTimeout(10 * 60_000);

  const organizer = accounts.new1; // not registered yet: signs up during the test
  const attendeeA = accounts.alex;
  const attendeeB = accounts.jordan;
  const door = accounts.scanner;
  const timeZone = testInfo.project.use.timezoneId ?? 'America/Toronto';
  const title = 'Harbour Lights Festival';
  const nft = chain.ticketNft();

  // Opens the scanner in its own browser, picks this event, and shows `qr` to the camera. The camera
  // starts on an empty picture, so the event is picked before the code appears.
  async function showAtTheDoor(qr: string, contractId: bigint): Promise<ScannerSession> {
    const scanner = await openScanner([{ qr: null, seconds: 8 }, { qr, seconds: 4 }], door);
    await scanner.page.getByLabel("Event you're scanning for").selectOption(contractId.toString());
    return scanner;
  }

  async function checkInAtTheDoor(qr: string, contractId: bigint) {
    const { page } = await showAtTheDoor(qr, contractId);
    await expect(page.getByText('Valid ticket')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Check in', exact: true }).click();
    await expect(page.getByText('Checked in', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Admit attendee')).toBeVisible();
  }

  // --- 1 ---------------------------------------------------------------------------------------
  await test.step('a new wallet signs up as an attendee and asks for organizer access', async () => {
    const { page } = await openAs(organizer);
    await page.goto('/signup');
    await page.getByRole('main').getByRole('button', { name: 'Connect wallet' }).click();
    await page.getByRole('dialog').getByRole('button', { name: WALLET_NAME }).click();

    await page.getByLabel('First name').fill('Nora');
    await page.getByLabel('Last name').fill('Lambert');
    await page.getByLabel('Email').fill('nora.lambert@example.com');
    await page.getByText('Create events and sell tickets').click();
    await expect(page.getByRole('radio', { name: /Organizer/ })).toBeChecked();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'Request sent' })).toBeVisible();

    const session = await ApiSession.signIn(organizer);
    expect((await session.get<{ status: string }>('/api/users/me/organizer-request')).status).toBe('PENDING');
    expect(await nft.hasRole(ORGANIZER_ROLE, organizer.address)).toBe(false);
  });

  // --- 2 ---------------------------------------------------------------------------------------
  const admin = await openAs(accounts.admin, '/admin');
  await test.step('the admin approves the request: role granted on-chain, request marked approved in the API', async () => {
    await admin.page.getByRole('row', { name: /Nora Lambert/ }).getByRole('button', { name: 'Approve' }).click();
    await expect(admin.page.getByText('Organizer approved')).toBeVisible({ timeout: 30_000 });

    expect(await nft.hasRole(ORGANIZER_ROLE, organizer.address)).toBe(true);
    const requests = await (await ApiSession.signIn(accounts.admin)).get<Array<{ wallet: string; status: string }>>('/api/admin/organizer-requests');
    expect(requests.find((r) => sameAddress(r.wallet, organizer.address))?.status).toBe('APPROVED');
  });

  // --- 3 ---------------------------------------------------------------------------------------
  // A new sign-in, so the session carries the new role
  const org = await openAs(organizer, '/');
  await test.step('the new organizer signs in again and sees the Organizer link', async () => {
    await (await navLink(org.page, 'Organizer')).click();
    await expect(org.page.getByRole('heading', { name: 'My events' })).toBeVisible();
  });

  // --- 4 ---------------------------------------------------------------------------------------
  let apiId = '';
  let contractId = 0n;
  await test.step('the organizer creates an event: details, cover image, two ticket types, sale rules', async () => {
    const { page } = org;
    await page.getByRole('link', { name: 'Create event' }).click();
    await expect(page.getByRole('heading', { name: 'Create event' })).toBeVisible();

    const startsAt = Date.now() + 30 * DAY_MS;
    await page.getByLabel('Event name').fill(title);
    await page.getByLabel('Description').fill('An evening of live music on the waterfront.');
    await page.getByLabel('Category').selectOption('Concerts');
    await page.getByLabel('Venue').fill('Harbourfront Centre, Toronto, ON');
    await page.getByLabel('Starts').fill(localInput(startsAt, timeZone));
    await page.getByLabel('Ends').fill(localInput(startsAt + 3 * 60 * 60 * 1000, timeZone));
    await page.getByLabel('Cover image').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: COVER_PNG });
    await page.getByRole('button', { name: /^Next: Ticket types/ }).click();

    for (const [index, type] of [GA, VIP].entries()) {
      if (index > 0) await page.getByRole('button', { name: 'Add another ticket type' }).click();
      const card = page.getByLabel(`Ticket type ${index + 1}`, { exact: true });
      await card.getByLabel('Name', { exact: true }).fill(type.name);
      await card.getByLabel('Price (USDC)').fill(String(type.price));
      await card.getByLabel('Supply').fill(String(type.supply));
    }
    await page.getByRole('button', { name: /^Next: Sale rules/ }).click();

    // Sales end keeps its default: when the event starts
    await page.getByLabel('Per-wallet limit').fill('4');
    await page.getByLabel('Resale price cap').selectOption({ label: '2× face value' });
    await page.getByLabel('Organizer royalty (%)').fill(String(ROYALTY_PERCENT));
    await page.getByRole('button', { name: /^Next: Review/ }).click();
    await expect(page.getByRole('list', { name: 'Publish steps' }).getByRole('listitem')).toHaveCount(4);
  });

  // --- 5 ---------------------------------------------------------------------------------------
  await test.step('publishes it through all four steps; it appears on the Events page', async () => {
    const { page } = org;
    await page.getByRole('button', { name: 'Freeze and publish' }).click();
    await expect(page.getByRole('heading', { name: 'Your event is live' })).toBeVisible({ timeout: 90_000 });

    const href = await page.getByRole('link', { name: /View the event page/ }).getAttribute('href');
    apiId = decodeURIComponent(href!.split('/').pop()!);
    contractId = contractEventIdFor(apiId);

    // Contract: set up with the rules from the form, its two types, sales open
    const config = await nft.eventConfigs(contractId);
    expect(config.configured).toBe(true);
    expect(config.active).toBe(true);
    expect(config.ticketTypeCount).toBe(2n);
    expect(config.resaleCapBps).toBe(20_000n);
    expect(config.perWalletLimit).toBe(4n);
    expect(await nft.royaltyPercentage(contractId)).toBe(BigInt(ROYALTY_PERCENT * 100));
    expect(sameAddress(await nft.eventOrganizer(contractId), organizer.address)).toBe(true);

    // API: published, linked to the contract, with both types
    const event = await apiGet<{ status: string; contract_event_id: string; ticket_types: Array<{ name: string; contract_type_id: number | null }> }>(`/api/events/${apiId}`);
    expect(event.status).toBe('PUBLISHED');
    expect(event.contract_event_id).toBe(contractId.toString());
    expect(event.ticket_types.map((t) => [t.name, t.contract_type_id]).sort()).toEqual([
      [GA.name, 0],
      [VIP.name, 1],
    ]);

    await page.goto('/');
    await expect(page.getByText(title).first()).toBeVisible();
  });

  // --- 6 ---------------------------------------------------------------------------------------
  const a = await openAs(attendeeA, `/events/${apiId}`);
  let ticket1 = 0n;
  let ticket2 = 0n;
  await test.step('attendee A buys 2 tickets (allow USDC, then buy); USDC balance drops by exactly the total', async () => {
    const { page } = a;
    const before = await chain.usdcBalance(attendeeA.address);

    await page.getByRole('button', { name: `Increase ${GA.name.toLowerCase()} tickets` }).click();
    await page.getByRole('button', { name: `Buy tickets — ${(GA.price * 2).toFixed(2)} USDC` }).click();
    await expect(page.getByText("You're going!")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('2 tickets were sent to your wallet.')).toBeVisible();

    expect(before - (await chain.usdcBalance(attendeeA.address))).toBe(chain.usdc(GA.price * 2));
    const gaType = await nft.ticketTypes(contractId, 0);
    expect(gaType.price).toBe(chain.usdc(GA.price));
    expect(gaType.sold).toBe(2n);

    await expect.poll(() => tokenIdsOf(attendeeA, apiId), { message: 'A has 2 tickets in the API' }).toHaveLength(2);
    [ticket1, ticket2] = (await tokenIdsOf(attendeeA, apiId)).map(BigInt);
    for (const tokenId of [ticket1, ticket2]) expect(sameAddress(await chain.ownerOf(tokenId), attendeeA.address)).toBe(true);
  });

  // --- 7 ---------------------------------------------------------------------------------------
  await test.step("both tickets show in A's My Tickets", async () => {
    await a.page.getByRole('link', { name: /View my tickets/ }).click();
    await expect(a.page.getByRole('button', { name: `Show entry QR codes for 2 tickets to ${title}` })).toBeVisible();
  });

  // --- 8 ---------------------------------------------------------------------------------------
  await test.step('the organizer adds a scanner wallet from the dashboard; it is saved in the API and on-chain', async () => {
    const { page } = org;
    await page.goto('/organizer');
    await myEventsRow(page, title).getByRole('link', { name: 'Manage' }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

    // The card saves the API's row first, then sends setEventScanner() from the organizer's wallet
    const scanners = manageCard(page, 'Scanners');
    await scanners.getByLabel('Add a scanner').fill(door.address);
    await scanners.getByRole('button', { name: 'Add scanner' }).click();
    await expect(scanners.getByText(`${short(door.address)} can now check in tickets.`)).toBeVisible({ timeout: 30_000 });
    // The listener marks the row synced once the on-chain change arrives
    await expect(scanners.getByRole('listitem').filter({ hasText: short(door.address) })).toContainText('On-chain', { timeout: 20_000 });

    expect(await nft.eventScanners(contractId, door.address)).toBe(true);
    const saved = await (await ApiSession.signIn(organizer)).get<Array<{ wallet: string; synced_to_chain: boolean }>>(`/api/events/${apiId}/scanners`);
    expect(saved.find((s) => sameAddress(s.wallet, door.address))?.synced_to_chain).toBe(true);
  });

  // --- 9 ---------------------------------------------------------------------------------------
  await test.step('A opens the entry QR for ticket 1; the scanner checks it in; My Tickets shows it as checked in', async () => {
    await a.page.getByRole('button', { name: `Show entry QR codes for 2 tickets to ${title}` }).click();
    const qrDialog = a.page.getByRole('dialog');
    await expect(qrDialog.getByText('Ready to scan')).toBeVisible();
    await expect(qrDialog.getByText(`#${ticket1}`)).toBeVisible();
    await qrDialog.getByRole('button', { name: 'Close' }).click();

    // The camera shows the same code My Tickets does: the owner's signature over the ticket and the time
    await checkInAtTheDoor(await entryQr(attendeeA, ticket1, contractId), contractId);

    expect(await nft.isUsed(ticket1)).toBe(true);
    await expect.poll(() => statusOf(attendeeA, apiId, ticket1), { message: 'ticket 1 is USED in the API' }).toBe('USED');
    await a.page.reload();
    await expect(a.page.getByText(/^Checked in on /)).toBeVisible();
  });

  // --- 10 --------------------------------------------------------------------------------------
  await test.step('A lists ticket 2 on the Marketplace', async () => {
    await a.page.getByRole('link', { name: `Sell on Marketplace: ticket #${ticket2}, ${title}` }).click();
    const sell = a.page.getByRole('dialog', { name: 'Sell a ticket' });
    await sell.getByLabel('Set your price').fill(String(RESALE_PRICE));
    await sell.getByRole('button', { name: 'List ticket' }).click();
    await expect(sell.getByText(`Listed for ${RESALE_PRICE.toFixed(2)} USDC`)).toBeVisible({ timeout: 30_000 });

    const listing = await nft.listings(ticket2);
    expect(sameAddress(listing.seller, attendeeA.address)).toBe(true);
    expect(listing.price).toBe(chain.usdc(RESALE_PRICE));
    await expect
      .poll(async () => (await apiGet<{ listings: Array<{ token_id: string }> }>('/api/listings?limit=50')).listings.map((l) => String(l.token_id)), {
        message: 'the listing is in the API',
      })
      .toContain(ticket2.toString());
  });

  // --- 11 --------------------------------------------------------------------------------------
  const b = await openAs(attendeeB, '/marketplace');
  await test.step('attendee B buys it: B pays the price, the organizer gets the royalty, A gets the rest', async () => {
    const before = {
      a: await chain.usdcBalance(attendeeA.address),
      b: await chain.usdcBalance(attendeeB.address),
      organizer: await chain.usdcBalance(organizer.address),
    };

    await b.page.getByRole('button', { name: new RegExp(`^Buy ticket #${ticket2} to ${title}`) }).click();
    const buy = b.page.getByRole('dialog', { name: 'Buy resale ticket' });
    await buy.getByRole('button', { name: /^Buy ticket ·/ }).click();
    await expect(buy.getByText(`Ticket #${ticket2} was sent to your wallet.`)).toBeVisible({ timeout: 60_000 });

    const royalty = (chain.usdc(RESALE_PRICE) * BigInt(ROYALTY_PERCENT)) / 100n;
    expect(before.b - (await chain.usdcBalance(attendeeB.address))).toBe(chain.usdc(RESALE_PRICE));
    expect((await chain.usdcBalance(organizer.address)) - before.organizer).toBe(royalty);
    expect((await chain.usdcBalance(attendeeA.address)) - before.a).toBe(chain.usdc(RESALE_PRICE) - royalty);
    expect(sameAddress(await chain.ownerOf(ticket2), attendeeB.address)).toBe(true);
  });

  // --- 12 --------------------------------------------------------------------------------------
  await test.step("ticket 2 moves from A's My Tickets to B's", async () => {
    await expect.poll(() => tokenIdsOf(attendeeB, apiId), { message: "ticket 2 is B's in the API" }).toEqual([ticket2.toString()]);
    expect(await tokenIdsOf(attendeeA, apiId)).toEqual([ticket1.toString()]);

    await a.page.goto('/my-tickets');
    await expect(a.page.getByText(/^Checked in on /)).toBeVisible(); // ticket 1 stays, as a collectible
    await expect(a.page.getByRole('link', { name: `Sell on Marketplace: ticket #${ticket2}, ${title}` })).toHaveCount(0);

    await b.page.goto('/my-tickets');
    await expect(b.page.getByRole('button', { name: `Show entry QR for ${title}` })).toBeVisible();
  });

  // --- 13 --------------------------------------------------------------------------------------
  await test.step("A's old QR for ticket 2 is refused at the scanner; B's QR is accepted and checked in", async () => {
    const refused = await showAtTheDoor(await entryQr(attendeeA, ticket2, contractId), contractId);
    await expect(refused.page.getByText('Do not admit')).toBeVisible({ timeout: 30_000 });
    expect(await nft.isUsed(ticket2)).toBe(false);

    await checkInAtTheDoor(await entryQr(attendeeB, ticket2, contractId), contractId);
    expect(await nft.isUsed(ticket2)).toBe(true);
    await expect.poll(() => statusOf(attendeeB, apiId, ticket2), { message: 'ticket 2 is USED in the API' }).toBe('USED');
  });

  // --- 14 --------------------------------------------------------------------------------------
  await test.step('the organizer withdraws the sales revenue from the dashboard', async () => {
    const { page } = org;
    // "My events" shows the two paid tickets' sales
    await page.goto('/organizer');
    const row = myEventsRow(page, title);
    await expect(row).toContainText(`${(GA.price * 2).toFixed(2)} USDC`);

    const revenue = (await nft.eventRevenue(contractId)) as bigint;
    expect(revenue).toBe(chain.usdc(GA.price * 2)); // primary sales only: the resale royalty was paid out at the resale
    const before = await chain.usdcBalance(organizer.address);

    await row.getByRole('link', { name: 'Manage' }).click();
    const sales = manageCard(page, 'Sales');
    await expect(sales).toContainText(`${(GA.price * 2).toFixed(2)} USDC`, { timeout: 20_000 });
    await sales.getByRole('button', { name: 'Withdraw revenue' }).click();
    await expect(sales.getByText('Withdrawal confirmed. The revenue is in your wallet.')).toBeVisible({ timeout: 30_000 });
    await expect(sales.getByText('Nothing to withdraw yet. Revenue appears here as tickets sell.')).toBeVisible();
    await expect(sales.getByRole('button', { name: 'Withdraw revenue' })).toBeDisabled();

    expect((await chain.usdcBalance(organizer.address)) - before).toBe(revenue);
    expect(await nft.eventRevenue(contractId)).toBe(0n);
  });

  // --- 15 --------------------------------------------------------------------------------------
  await test.step('the admin sees the event with its sales on the Events tab', async () => {
    await admin.page.goto('/admin');
    await admin.page.getByRole('tab', { name: /Events/ }).click();
    const row = admin.page.getByRole('row', { name: new RegExp(title) });
    await expect(row).toContainText(`2 of ${GA.supply + VIP.supply}`);
  });
});
