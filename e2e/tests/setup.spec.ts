// Checks the end-to-end setup itself (#337): the test wallet, signing in, the helpers and the fake
// camera. If one of these fails, the other spec files can't be trusted either.

import { accounts, ApiSession, apiGet, chain, createPublishedEvent, entryQr, expect, seededEvents, test, waitForSync } from '../fixtures/index.js';
import { API_URL } from '../stack/config.mjs';

const signedIn = async (page: import('@playwright/test').Page) =>
  (await page.context().cookies(API_URL)).some((cookie) => cookie.name === 'token');

test.describe('signing in with the test wallet', () => {
  test('an attendee connects, signs in and sees the Events page', async ({ page, signIn }) => {
    await signIn('attendee');

    await expect(page.getByRole('heading', { name: 'Upcoming events' })).toBeVisible();
    await expect(page.getByText(seededEvents.gala.title).first()).toBeVisible();
    expect(await signedIn(page)).toBe(true);
  });

  test('rejecting the connection in the wallet leaves the visitor signed out', async ({ page, wallet }) => {
    wallet.rejectNext();
    await page.goto('/signup');
    await page.getByRole('main').getByRole('button', { name: 'Connect wallet' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'E2E Test Wallet' }).click();

    // RainbowKit asks for the connection with wallet_requestPermissions
    await expect.poll(() => wallet.requests.includes('wallet_requestPermissions')).toBe(true);
    expect(wallet.connected).toBe(false);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('main').getByRole('button', { name: 'Connect wallet' })).toBeVisible();
    expect(await signedIn(page)).toBe(false);
  });

  test('rejecting the signature leaves the visitor signed out', async ({ page, wallet }) => {
    await page.goto('/signup');
    wallet.rejectNext('sign'); // the connection goes through, the sign-in signature doesn't
    await page.getByRole('main').getByRole('button', { name: 'Connect wallet' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'E2E Test Wallet' }).click();

    await expect(page.getByText('Signature cancelled')).toBeVisible();
    expect(await signedIn(page)).toBe(false);
  });
});

test.describe('the test wallet controls', () => {
  test('switching to an unsupported network shows the wrong network banner until switching back', async ({ page, signIn, wallet }) => {
    await signIn('attendee');

    await wallet.switchNetwork(1); // Ethereum mainnet
    const banner = page.getByText('Wrong network detected');
    await expect(banner).toBeVisible();

    await page.getByRole('button', { name: 'Switch to Sepolia' }).click();
    await expect(banner).toBeHidden();
    expect(wallet.chainId).toBe(11155111);
  });

  test('switching the account and disconnecting reach the app', async ({ page, signIn, wallet }) => {
    await signIn('attendee');
    await page.goto('/profile');
    await expect(page.getByText(accounts.alex.address.slice(0, 6)).first()).toBeVisible();

    await wallet.switchAccount(accounts.jordan);
    await expect(page.getByText(accounts.jordan.address.slice(0, 6)).first()).toBeVisible();

    await wallet.disconnect();
    await expect(page.getByText(accounts.jordan.address.slice(0, 6))).toHaveCount(0);
  });
});

test.describe('the fake camera', () => {
  test('the scanner reads an entry QR code from the camera', async ({ openScanner }) => {
    // Alex owns token 0 of the Gala (event 1) from the seed
    const qr = await entryQr(accounts.alex, 0, seededEvents.gala.contractId);
    const { page } = await openScanner([{ qr, seconds: 3 }]);

    await expect(page.getByText('Valid ticket')).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('helpers', () => {
  test('create an event, buy, list, buy a listed ticket and check in, with the API following', async ({ page }) => {
    const event = await createPublishedEvent({ title: 'Setup Check Night', ticketTypes: [{ name: 'General Admission', price: 12, supply: 50 }] });
    const published = await apiGet<{ status: string; contract_event_id: string }>(`/api/events/${event.apiId}`);
    expect(published.status).toBe('PUBLISHED');
    expect(published.contract_event_id).toBe(event.contractId.toString());

    await page.goto('/');
    await expect(page.getByText('Setup Check Night').first()).toBeVisible();

    // Jordan buys two, lists one, Alex buys it, the organizer checks the other in
    const bought = await chain.buyTickets(accounts.jordan, { eventId: event.contractId, quantity: 2 });
    expect(bought.tokenIds).toHaveLength(2);
    const [listed, kept] = bought.tokenIds;

    await waitForSync((await chain.listTicket(accounts.jordan, listed, 15)).block);
    const listings = await apiGet<{ listings: Array<{ token_id: string }> }>('/api/listings?limit=50');
    expect(listings.listings.map((l) => String(l.token_id))).toContain(listed.toString());

    await waitForSync((await chain.buyListedTicket(accounts.alex, listed)).block);
    expect((await chain.ownerOf(listed)).toLowerCase()).toBe(accounts.alex.address.toLowerCase());
    const alexTickets = await (await ApiSession.signIn(accounts.alex)).get<Array<{ token_id: string }> | { tickets: Array<{ token_id: string }> }>('/api/tickets');
    const alexIds = (Array.isArray(alexTickets) ? alexTickets : alexTickets.tickets).map((t) => String(t.token_id));
    expect(alexIds).toContain(listed.toString());

    await waitForSync((await chain.checkIn(accounts.organizer, kept)).block);
    expect(await chain.ticketNft().isUsed(kept)).toBe(true);
  });

  // Last in the file: it moves the chain's clock past the seeded events
  test('fund and empty a wallet, and move the chain clock', async () => {
    const wallet = accounts.new1;
    await chain.giveUsdc(wallet.address, 50);
    await chain.setEth(wallet.address, 1);
    expect(await chain.usdcBalance(wallet.address)).toBe(chain.usdc(50));
    expect(await chain.provider.getBalance(wallet.address)).toBe(10n ** 18n);

    await chain.emptyWallet(wallet);
    expect(await chain.usdcBalance(wallet.address)).toBe(0n);
    expect(await chain.provider.getBalance(wallet.address)).toBe(0n);

    // Past event 1's sales end (30 days after the seed), buying is refused
    const before = await chain.chainNow();
    await chain.increaseTime(31 * 24 * 60 * 60);
    expect((await chain.chainNow()) - before).toBeGreaterThanOrEqual(31 * 24 * 60 * 60);
    await expect(chain.buyTickets(accounts.jordan, { eventId: seededEvents.gala.contractId })).rejects.toThrow(/Event has ended/);
  });
});
