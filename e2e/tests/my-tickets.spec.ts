// My Tickets and the entry QR code (#345): the page's states, how tickets are grouped, and the QR
// popup up to the scanner accepting the code.
//
// Tests that buy use their own new wallet (Hardhat's accounts #10 and up) and their own event, so no
// test depends on another one. The QR tests use Alex's seeded Gala tickets (tokens 0-1 General
// Admission, 2-3 Early Bird) without changing them.

import type { Page } from '@playwright/test';
import { ethers } from 'ethers';

import {
  accounts,
  ApiSession,
  chain,
  createPublishedEvent,
  entryQr,
  expect,
  newWallet,
  openMenuIfPhone,
  seededEvents,
  test,
  waitForSync,
  WALLET_NAME,
  type Account,
} from '../fixtures/index.js';
import { CHAIN_ID } from '../stack/config.mjs';

// --- Helpers -------------------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const THREE_TYPES = [
  { name: 'General Admission', price: 20, supply: 100 },
  { name: 'VIP', price: 50, supply: 20 },
  { name: 'Guest list', price: 30, supply: 10 },
];

const unique = (name: string) => `${name} ${Date.now().toString(36)}`;
const timeZone = () => test.info().project.use.timezoneId ?? 'America/Toronto';

/** A new wallet with a finished account, ETH for gas and 500 USDC */
async function createBuyer(index: number): Promise<Account> {
  const account = newWallet(index);
  const session = await ApiSession.signIn(account);
  await session.put('/api/users/me', { first_name: 'Nora', last_name: `Buyer ${index}`, email: `buyer.${index}@example.com` });
  await chain.setEth(account.address, 10);
  await chain.giveUsdc(account.address, 500);
  return account;
}

/** The cards of an event (one per ticket type and status), or only the one of a ticket type */
function ticketCards(page: Page, title: string, type?: string) {
  const cards = page.getByRole('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  return type ? cards.filter({ hasText: type }) : cards;
}

const section = (page: Page, name: 'Upcoming' | 'Past') => page.getByRole('region', { name: new RegExp(`^${name} · `) });
const galaCard = (page: Page, type: 'General Admission' | 'Early Bird') => ticketCards(page, seededEvents.gala.title, type);
const qrDialog = (page: Page) => page.getByRole('dialog', { name: seededEvents.gala.title });

// "Oct 10, 2026", as the card writes a check-in date
const checkInDate = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timeZone() });

/** The last message the wallet signed, with the time written in it */
function lastSigned(wallet: { signed: Array<{ message: string; signature: string }> }) {
  const { message, signature } = wallet.signed[wallet.signed.length - 1];
  return { message, signature, time: Number(/\| time: (\d+)$/.exec(message)?.[1]) };
}

/** Alex on My Tickets, with the QR popup of the Gala's General Admission tickets open and its first code ready */
async function openGalaQr(page: Page, signIn: (who: 'attendee', options: { path: string }) => Promise<void>) {
  await signIn('attendee', { path: '/my-tickets' });
  await galaCard(page, 'General Admission').getByRole('button', { name: /Show entry QR/ }).click();
  await expect(qrDialog(page).getByText('Ready to scan')).toBeVisible();
}

// --- The page ------------------------------------------------------------------------------------

test.describe('the page', () => {
  test('signed out: asked to connect; account not finished: asked to finish it', async ({ page, wallet }) => {
    await page.goto('/my-tickets');
    await expect(page.getByRole('heading', { name: 'Connect your wallet' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();

    // A new wallet connects from here: it is sent to finish its account first, then comes back
    await wallet.use(newWallet(10));
    await page.getByRole('main').getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: WALLET_NAME }).click();
    await expect(page).toHaveURL(/\/signup\?next=%2Fmy-tickets$/);
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  });

  test('no tickets: the empty state with "How it works"', async ({ page, signIn }) => {
    await signIn(accounts.jordan, { path: '/my-tickets' });

    await expect(page.getByRole('heading', { name: 'No tickets yet' })).toBeVisible();
    await expect(page.getByText('Tickets you buy show up here.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse events' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
    for (const step of ['1. Buy with USDC', '2. Your ticket lands in your wallet', '3. Show your QR code at the door']) {
      await expect(page.getByRole('heading', { name: step })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Grid view' })).toHaveCount(0); // nothing to lay out
  });

  test('tickets grouped by event, upcoming and past, with the right counts and ticket type labels', async ({ page, signIn }) => {
    const buyer = await createBuyer(11);
    const soon = await createPublishedEvent({ title: unique('Soon'), startsInDays: 30, ticketTypes: THREE_TYPES });
    const later = await createPublishedEvent({ title: unique('Later'), startsInDays: 60 });
    await chain.buyTickets(buyer, { eventId: soon.contractId, typeId: 0, quantity: 2 });
    await chain.buyTickets(buyer, { eventId: soon.contractId, typeId: 1 });
    await waitForSync((await chain.buyTickets(buyer, { eventId: later.contractId })).block);

    await signIn(buyer, { path: '/my-tickets' });
    // One card per event and ticket type, the soonest first
    await expect(page.getByRole('heading', { name: 'Upcoming · 3' })).toBeVisible();
    const upcoming = section(page, 'Upcoming').getByRole('article');
    await expect(upcoming).toHaveCount(3);
    await expect(upcoming.nth(0)).toContainText(soon.title);
    await expect(upcoming.nth(0)).toContainText('General Admission');
    await expect(upcoming.nth(0)).toContainText('2 tickets');
    await expect(upcoming.nth(1)).toContainText('VIP');
    await expect(upcoming.nth(1)).toContainText(/Ticket #\d+/);
    await expect(upcoming.nth(2)).toContainText(later.title);
    await expect(page.getByRole('region', { name: /^Past · / })).toHaveCount(0);

    // Forty days on, the first event is over: its cards move to Past
    await page.clock.setFixedTime(Date.now() + 40 * DAY);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Upcoming · 1' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Past · 2' })).toBeVisible();
    const past = section(page, 'Past').getByRole('article');
    await expect(past).toHaveCount(2);
    for (const card of [past.nth(0), past.nth(1)]) {
      await expect(card).toContainText(soon.title);
      await expect(card).toContainText('Expired');
      await expect(card).toContainText('This event has ended');
    }
  });

  test('several tickets for one event, a ticket bought on the Marketplace and a free issued ticket', async ({ page, signIn }) => {
    const buyer = await createBuyer(12);
    const event = await createPublishedEvent({ title: unique('Harbour Lights'), ticketTypes: THREE_TYPES });
    // Three bought at once
    await chain.buyTickets(buyer, { eventId: event.contractId, typeId: 0, quantity: 3 });
    // One bought from another wallet's listing
    const { tokenIds: [resold] } = await chain.buyTickets(accounts.jordan, { eventId: event.contractId, typeId: 1 });
    await chain.listTicket(accounts.jordan, resold, 60);
    await chain.buyListedTicket(buyer, resold);
    // One the organizer issues for free (the organizer page's controls come with #192)
    const issued = await (await chain.ticketNft(accounts.organizer).issueTickets(event.contractId, 2, [buyer.address])).wait();
    await waitForSync(issued?.blockNumber);

    await signIn(buyer, { path: '/my-tickets' });
    await expect(ticketCards(page, event.title)).toHaveCount(3);
    await expect(ticketCards(page, event.title, 'General Admission')).toContainText('3 tickets');
    await expect(ticketCards(page, event.title, 'VIP')).toContainText(`Ticket #${resold}`);
    await expect(ticketCards(page, event.title, 'Guest list')).toContainText(/Ticket #\d+/);
  });

  test('a checked-in ticket shows the date, and becomes a collectible after the event', async ({ page, signIn }) => {
    const buyer = await createBuyer(13);
    const event = await createPublishedEvent({ title: unique('Opera Night') });
    const { tokenIds: [used] } = await chain.buyTickets(buyer, { eventId: event.contractId, quantity: 2 });
    const { block } = await chain.checkIn(accounts.organizer, used);
    await waitForSync(block);
    const checkedInAt = (await chain.provider.getBlock(block))!.timestamp;

    await signIn(buyer, { path: '/my-tickets' });
    // The checked-in ticket: in Past, used and a collectible, with its check-in date
    const usedCard = section(page, 'Past').getByRole('article').filter({ hasText: event.title });
    await expect(usedCard).toContainText('Used');
    await expect(usedCard).toContainText('Collectible');
    await expect(usedCard).toContainText(`Checked in on ${checkInDate(checkedInAt)}`);
    // The other one is still upcoming
    await expect(section(page, 'Upcoming').getByRole('article').filter({ hasText: event.title })).toContainText('Valid');

    // After the event: the used one stays a collectible, the unused one has expired
    await page.clock.setFixedTime(Date.now() + 40 * DAY);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Past · 2' })).toBeVisible();
    await expect(ticketCards(page, event.title).filter({ hasText: 'Collectible' })).toContainText(`Checked in on ${checkInDate(checkedInAt)}`);
    await expect(ticketCards(page, event.title).filter({ hasText: 'Expired' })).toContainText('This event has ended');
  });

  // TODO(#393): My Tickets doesn't show yet that a ticket is listed on the Marketplace
  test.fixme('a listed ticket shows that it is listed', async ({ page, signIn }) => {
    const buyer = await createBuyer(14);
    const event = await createPublishedEvent({ title: unique('Listed Night') });
    const { tokenIds: [tokenId] } = await chain.buyTickets(buyer, { eventId: event.contractId });
    await waitForSync((await chain.listTicket(buyer, tokenId, 25)).block);

    await signIn(buyer, { path: '/my-tickets' });
    await expect(ticketCards(page, event.title)).toContainText('Listed');
  });

  test('a ticket just bought appears once the API catches up, without a manual refresh', async ({ page, signIn }) => {
    const buyer = await createBuyer(15);
    const event = await createPublishedEvent({ title: unique('Fresh Ticket') });
    await signIn(buyer, { path: '/my-tickets' });
    await expect(page.getByRole('heading', { name: 'No tickets yet' })).toBeVisible();

    await chain.buyTickets(buyer, { eventId: event.contractId });
    // The page reads the list again 5 and 10 seconds after it opens: no reload here
    await expect(ticketCards(page, event.title)).toBeVisible({ timeout: 20_000 });
  });

  test("a ticket sold on the Marketplace leaves the seller's page and shows on the buyer's", async ({ page, signIn }) => {
    const seller = await createBuyer(16);
    const buyer = await createBuyer(17);
    const event = await createPublishedEvent({ title: unique('Resale Night') });
    const { tokenIds: [tokenId] } = await chain.buyTickets(seller, { eventId: event.contractId });
    await waitForSync((await chain.listTicket(seller, tokenId, 25)).block);

    await signIn(seller, { path: '/my-tickets' });
    await expect(ticketCards(page, event.title)).toContainText(`Ticket #${tokenId}`);

    await waitForSync((await chain.buyListedTicket(buyer, tokenId)).block);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'No tickets yet' })).toBeVisible();

    await openMenuIfPhone(page);
    await page.getByRole('banner').getByRole('button', { name: 'Disconnect wallet' }).click();
    await signIn(buyer, { path: '/my-tickets' });
    await expect(ticketCards(page, event.title)).toContainText(`Ticket #${tokenId}`);
  });

  test('grid and list views', async ({ page, signIn, isMobile }) => {
    await signIn('attendee', { path: '/my-tickets' });
    const grid = page.getByRole('button', { name: 'Grid view' });
    const list = page.getByRole('button', { name: 'List view' });
    const cards = ticketCards(page, seededEvents.gala.title);
    await expect(cards).toHaveCount(2);
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
    if (!isMobile) {
      // Grid on a wide screen: side by side
      const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
      expect(a!.y).toBe(b!.y);
    }

    await list.click();
    await expect(list).toHaveAttribute('aria-pressed', 'true');
    const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
    expect(b!.y).toBeGreaterThan(a!.y); // one under the other
    await expect(cards.nth(0).getByRole('button', { name: /Show entry QR/ })).toBeVisible();

    // The choice is remembered
    await page.reload();
    await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
  });
});

// --- Entry QR ------------------------------------------------------------------------------------

test.describe('entry QR', () => {
  test('opening it asks the wallet to sign; the QR holds the right ticket, event, contract and network', async ({ page, wallet, signIn }) => {
    await signIn('attendee', { path: '/my-tickets' });
    const before = wallet.signed.length;
    await galaCard(page, 'General Admission').getByRole('button', { name: /Show entry QR/ }).click();

    const dialog = qrDialog(page);
    await expect(dialog.getByText('Ready to scan')).toBeVisible();
    await expect(dialog.getByRole('img', { name: 'Entry QR code', exact: true })).toBeVisible();
    // The code's drawing isn't a second, unnamed picture inside it (#429)
    await expect(dialog.getByRole('img')).toHaveCount(1);
    await expect(dialog).toContainText('Ticket 1 of 2 · #0');
    expect(wallet.signed).toHaveLength(before + 1);

    // What was signed (and is in the QR): this ticket and event, on this contract and network, now
    const { message, signature, time } = lastSigned(wallet);
    expect(message).toBe(
      `NFTOKENPASS check-in | contract: ${chain.addresses().TicketNFT} | chain: ${CHAIN_ID} | token: 0 | event: ${seededEvents.gala.contractId} | time: ${time}`,
    );
    expect(Math.abs(time - Date.now() / 1000)).toBeLessThan(60);
    expect(ethers.verifyMessage(message, signature)).toBe(accounts.alex.address);
  });

  test('rejecting the signature: a clear message, and trying again works', async ({ page, wallet, signIn }) => {
    await signIn('attendee', { path: '/my-tickets' });
    wallet.rejectNext('sign');
    await galaCard(page, 'General Admission').getByRole('button', { name: /Show entry QR/ }).click();

    const dialog = qrDialog(page);
    await expect(dialog.getByText("Signature cancelled. Sign the message in your wallet to show this ticket's QR code.")).toBeVisible();
    await expect(dialog.getByRole('img', { name: 'Entry QR code', exact: true })).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Sign to show QR' }).click();
    await expect(dialog.getByText('Ready to scan')).toBeVisible();
  });

  test('moving between several tickets of the same event', async ({ page, wallet, signIn }) => {
    await openGalaQr(page, signIn);
    const dialog = qrDialog(page);
    await expect(dialog).toContainText('Ticket 1 of 2 · #0');
    await expect(dialog.getByRole('button', { name: 'Previous ticket' })).toBeDisabled();

    // The second ticket gets its own code
    await dialog.getByRole('button', { name: 'Next ticket' }).click();
    await expect(dialog).toContainText('Ticket 2 of 2 · #1');
    await expect(dialog.getByText('Ready to scan')).toBeVisible();
    expect(lastSigned(wallet).message).toContain('| token: 1 |');
    await expect(dialog.getByRole('button', { name: 'Next ticket' })).toBeDisabled();

    // Back to the first: its code is still there, nothing to sign again
    const signed = wallet.signed.length;
    await dialog.getByRole('button', { name: 'Previous ticket' }).click();
    await expect(dialog).toContainText('Ticket 1 of 2 · #0');
    await expect(dialog.getByText('Ready to scan')).toBeVisible();
    expect(wallet.signed).toHaveLength(signed);
  });

  test('the code expires after 60 seconds, and a new one can be made', async ({ page, wallet, signIn }) => {
    await page.clock.install();
    await openGalaQr(page, signIn);
    const dialog = qrDialog(page);

    await page.clock.fastForward(61_000);
    await expect(dialog.getByRole('img', { name: 'Expired entry QR code' })).toBeVisible();
    await expect(dialog.getByText('This code expired. Tap Regenerate code to sign a new one.')).toBeVisible();

    const signed = wallet.signed.length;
    await dialog.getByRole('button', { name: 'Regenerate code' }).click();
    await expect(dialog.getByText('Ready to scan')).toBeVisible();
    await expect(dialog.getByRole('img', { name: 'Entry QR code', exact: true })).toBeVisible();
    expect(wallet.signed).toHaveLength(signed + 1);
  });

  test("switching the wallet's account while the QR is open: the old code is no longer shown", async ({ page, wallet, signIn }) => {
    await openGalaQr(page, signIn);

    await wallet.switchAccount(accounts.jordan);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('img', { name: /Entry QR code/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'No tickets yet' })).toBeVisible(); // Jordan's (empty) tickets
  });

  test('checked-in tickets offer no QR', async ({ page, signIn }) => {
    const buyer = await createBuyer(18);
    const event = await createPublishedEvent({ title: unique('Door Check') });
    const { tokenIds: [used] } = await chain.buyTickets(buyer, { eventId: event.contractId, quantity: 2 });
    await waitForSync((await chain.checkIn(accounts.organizer, used)).block);

    await signIn(buyer, { path: '/my-tickets' });
    const usedCard = section(page, 'Past').getByRole('article').filter({ hasText: event.title });
    await expect(usedCard).toContainText('Checked in on');
    await expect(usedCard.getByRole('button', { name: /Show entry QR/ })).toHaveCount(0);
    await expect(section(page, 'Upcoming').getByRole('article').filter({ hasText: event.title }).getByRole('button', { name: /Show entry QR/ })).toBeVisible();
  });

  test('the QR is accepted by the scanner', async ({ page, wallet, signIn, openScanner }) => {
    await openGalaQr(page, signIn);

    // The same code the page shows: Alex's signature over token 0 of the Gala, at the time it signed
    const { signature, time } = lastSigned(wallet);
    const qr = await entryQr(accounts.alex, 0, seededEvents.gala.contractId, time);
    expect(JSON.parse(qr).signature).toBe(signature);

    // The seeded scanner, with that code in front of its camera
    const scanner = await openScanner([{ qr, seconds: 3 }]);
    await expect(scanner.page.getByText('Valid ticket')).toBeVisible({ timeout: 30_000 });
  });
});