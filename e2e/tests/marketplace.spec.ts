// The Marketplace (#347): browsing resale listings, selling (listing, changing the price,
// cancelling), buying a resold ticket, and what happens when the listing changes while the Buy
// popup is open.
//
// Listings live on the contract; the page shows the API's copy (the listener saves each listing a
// few seconds after its block), and the Buy and Sell popups read the contract again. So each test
// checks the screen against the contract: listings(), ownerOf(), USDC balances and the
// transactions the wallet was asked to send.

import type { Locator, Page } from '@playwright/test';
import { ethers } from 'ethers';

import {
  accounts,
  apiGet,
  chain,
  createPublishedEvent,
  expect,
  test,
  waitForSync,
  WALLET_NAME,
  type Account,
  type PublishedEvent,
  type TestWallet,
} from '../fixtures/index.js';
import { SEPOLIA_CHAIN_ID, WEB_URL } from '../stack/config.mjs';

const PAGE_SIZE = 9; // LISTINGS_PAGE_SIZE in services/web/src/hooks/useListings.ts
const ZERO = ethers.ZeroAddress;

// services/web/src/lib/resale-errors.ts
const RESALE_ERRORS = {
  buyRejected: 'The purchase was cancelled in your wallet. You were not charged.',
  listRejected: 'Listing was cancelled in your wallet. Nothing changed.',
  cancelRejected: 'Cancelling was stopped in your wallet. The ticket is still listed.',
};

// ---------------------------------------------------------------------------------------------
// The contract and the API

interface ApiListing {
  token_id: string;
  seller_wallet: string;
  price: string;
  collectible: boolean;
  max_price: string | null;
  event: { id: string; title: string };
}

const onChainListing = async (tokenId: bigint) => {
  const [seller, price, royaltyBps] = (await chain.ticketNft().listings(tokenId)) as [string, bigint, bigint];
  return { seller, price, royaltyBps: Number(royaltyBps) };
};
const allowance = async (account: Account) => (await chain.mockUsdc().allowance(account.address, chain.addresses().TicketNFT)) as bigint;
const sendsSince = (wallet: TestWallet, from: number) => wallet.requests.slice(from).filter((method) => method === 'eth_sendTransaction').length;
// shortAddress() in services/web/src/lib/format.ts: the API keeps wallets in lower case
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`.toLowerCase();

async function apiListings(params: Record<string, string> = {}) {
  const query = new URLSearchParams({ page: '1', limit: '50', sort: 'price_asc', ...params });
  return apiGet<{ listings: ApiListing[]; total: number }>(`/api/listings?${query}`);
}

// Tickets bought on the contract, once the API has them (the Sell popup lists the API's copy)
async function ticketsFor(buyer: Account, event: PublishedEvent, quantity = 1, typeId = 0) {
  const { tokenIds, block } = await chain.buyTickets(buyer, { eventId: event.contractId, typeId, quantity });
  await waitForSync(block);
  return tokenIds;
}

// A listing on the contract, once the API has it
async function listed(seller: Account, tokenId: bigint, price: number | string) {
  const { block } = await chain.listTicket(seller, tokenId, price);
  await waitForSync(block);
}

// A ticket bought and listed by `seller`, waiting for the API once (each wait can take up to the
// listener's 4-second poll, so the tests wait as little as they can)
async function boughtAndListed(seller: Account, event: PublishedEvent, price: number | string) {
  const { tokenIds } = await chain.buyTickets(seller, { eventId: event.contractId });
  const { block } = await chain.listTicket(seller, tokenIds[0], price);
  await waitForSync(block);
  return tokenIds[0];
}

// One event shared by the tests of a group, published by the first test that needs it on each
// project (the stack goes back to the seeded state before each file, on each project). Creating
// an event takes several transactions, so tests share one unless they need their own settings.
function sharedEvent(options: Parameters<typeof createPublishedEvent>[0]) {
  let made: { project: string; event: Promise<PublishedEvent> } | null = null;
  return () => {
    const project = test.info().project.name;
    if (made?.project !== project) made = { project, event: createPublishedEvent(options) };
    return made.event;
  };
}
// Selling: 20 USDC tickets, a 1.5x cap (30 USDC) and a 7.5% royalty
const sellingEvent = sharedEvent({ title: 'Resale Selling', resaleCap: 1.5, royaltyPercent: 7.5, perWalletLimit: 0, ticketTypes: [{ name: 'General Admission', price: 20, supply: 500 }] });
// Buying: 20 USDC tickets, a 2x cap and a 10% royalty
const marketEvent = sharedEvent({ title: 'Resale Market', perWalletLimit: 0, ticketTypes: [{ name: 'General Admission', price: 20, supply: 500 }] });

// The approval a test leaves behind (a purchase that stopped after the approve step) would change
// the steps of the next one
test.beforeEach(async () => {
  for (const account of [accounts.alex, accounts.jordan]) {
    if ((await allowance(account)) > 0n) await (await chain.mockUsdc(account).approve(chain.addresses().TicketNFT, 0n)).wait();
  }
});

// ---------------------------------------------------------------------------------------------
// The page

const main = (page: Page) => page.getByRole('main');
// A Marketplace card (the cards are articles; "Your listings" rows are list items)
const card = (page: Page, tokenId: bigint) => main(page).getByRole('article').filter({ has: page.getByText(`Ticket #${tokenId}`, { exact: true }) });
const cardTokens = async (page: Page) =>
  (await main(page).getByRole('article').getByText(/^Ticket #\d+$/).allTextContents()).map((text) => text.replace('Ticket #', ''));
const buyOn = (page: Page, tokenId: bigint) => card(page, tokenId).getByRole('button', { name: new RegExp(`^Buy ticket #${tokenId} `) });
const searchBox = (page: Page) => main(page).getByRole('searchbox', { name: 'Search by event or seller wallet' });
const select = (page: Page, name: 'Event' | 'Category' | 'Sort') => main(page).getByRole('combobox', { name });
const yourListings = (page: Page) => main(page).getByRole('region', { name: 'Your listings' });
const yourRow = (page: Page, tokenId: bigint) => yourListings(page).getByRole('listitem').filter({ has: page.getByText(`Ticket #${tokenId}`, { exact: true }) });

const buyDialog = (page: Page) => page.getByRole('dialog', { name: 'Buy resale ticket' });
const sellDialog = (page: Page) => page.getByRole('dialog', { name: 'Sell a ticket' });
const buyButton = (page: Page) => buyDialog(page).getByRole('button', { name: /^Buy ticket · / });
const priceInput = (page: Page) => sellDialog(page).getByLabel('Set your price');
const listButton = (page: Page) => sellDialog(page).getByRole('button', { name: /^(List ticket|Update price)$/ });
const ticketOption = (page: Page, tokenId: bigint) => sellDialog(page).getByRole('radio', { name: new RegExp(`Ticket #${tokenId}(?!\\d)`) });
const steps = (page: Page) => buyDialog(page).getByRole('list', { name: 'Purchase steps' }).getByRole('listitem');

// Types a search and waits until the page has loaded its results (it searches after a short pause)
async function searchFor(page: Page, text: string) {
  const loaded = page.waitForResponse((r) => r.url().includes('/api/listings?') && new URL(r.url()).searchParams.get('q') === text.trim() && !new URL(r.url()).searchParams.has('seller'));
  await searchBox(page).fill(text);
  await loaded;
}

async function openMarketplace(page: Page) {
  await page.goto('/marketplace');
  await expect(main(page).getByRole('heading', { level: 1, name: 'Marketplace' })).toBeVisible();
  await expect(main(page).getByRole('status', { name: 'Loading listings' })).toHaveCount(0);
}

type SignIn = (who: Account, options?: { path?: string }) => Promise<void>;
async function openSignedIn(page: Page, signIn: SignIn, who: Account) {
  await signIn(who, { path: '/marketplace' });
  await expect(main(page).getByRole('heading', { level: 1, name: 'Marketplace' })).toBeVisible();
  await expect(main(page).getByRole('status', { name: 'Loading listings' })).toHaveCount(0);
}

// The Buy popup for a listing, once it has read the contract
async function openBuy(page: Page, tokenId: bigint) {
  await buyOn(page, tokenId).click();
  await expect(buyDialog(page)).toBeVisible();
  await expect(buyDialog(page).getByText('Checking the listing on the blockchain…')).toHaveCount(0);
}

// The Sell popup with a ticket chosen, once it has read the contract
async function openSell(page: Page, tokenId: bigint) {
  await main(page).getByRole('button', { name: 'Sell a ticket' }).first().click();
  await expect(sellDialog(page)).toBeVisible();
  await ticketOption(page, tokenId).click();
  await expect(ticketOption(page, tokenId)).toHaveAttribute('aria-checked', 'true');
  await expect(sellDialog(page).getByText("Reading this ticket's resale terms…")).toHaveCount(0);
  await expect(priceInput(page)).toBeVisible();
}

async function expectBlocked(page: Page, title: string, message?: string | RegExp) {
  const alert = buyDialog(page).getByRole('status').filter({ hasText: title });
  await expect(alert).toBeVisible();
  if (message) await expect(alert).toContainText(message);
}

// A row of a popup's summary, such as "Ticket price  25.00 USDC"
const summaryRow = (dialog: Locator, label: string | RegExp) => dialog.getByRole('term').filter({ hasText: label }).locator('..');

// ---------------------------------------------------------------------------------------------

test.describe('browsing', () => {
  test('an empty Marketplace says so, and offers to sell', async ({ page }) => {
    expect((await apiListings()).total).toBe(0);
    await openMarketplace(page);

    await expect(main(page).getByRole('heading', { name: 'No resale tickets yet' })).toBeVisible();
    await expect(main(page).getByText('When fans list their tickets, they show up here.')).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Sell a ticket' })).toHaveCount(2);
  });

  test('signed out, the cards match the contract: price, face value, cap and bar', async ({ page }) => {
    const capped = await createPublishedEvent({ title: 'Capped Resale Night', resaleCap: 1.5, perWalletLimit: 0, ticketTypes: [{ name: 'Floor', price: 20, supply: 50 }] });
    const open = await createPublishedEvent({ title: 'Open Resale Night', resaleCap: 0, perWalletLimit: 0, ticketTypes: [{ name: 'Floor', price: 20, supply: 50 }] });
    const [cappedToken] = (await chain.buyTickets(accounts.alex, { eventId: capped.contractId })).tokenIds;
    const [openToken] = (await chain.buyTickets(accounts.alex, { eventId: open.contractId })).tokenIds;
    await chain.listTicket(accounts.alex, cappedToken, 24);
    await waitForSync((await chain.listTicket(accounts.alex, openToken, 95)).block);
    expect(await onChainListing(cappedToken)).toMatchObject({ seller: accounts.alex.address, price: chain.usdc(24) });
    expect(await chain.ticketNft().maxResalePriceOf(cappedToken)).toBe(chain.usdc(30));

    await openMarketplace(page);
    const one = card(page, cappedToken);
    await expect(one.getByRole('heading', { name: 'Capped Resale Night' })).toBeVisible();
    await expect(one).toContainText('Floor');
    await expect(one).toContainText('24.00 USDC');
    await expect(one).toContainText('Face value 20.00');
    await expect(one).toContainText('Max cap: 30.00');
    await expect(one).toContainText(short(accounts.alex.address));
    // 24 of a 30 cap: the bar is 80% full
    await expect(one.locator('[style*="width"]')).toHaveAttribute('style', /width: 80%/);
    // Signed out, every card can still be opened to buy
    await expect(buyOn(page, cappedToken)).toBeVisible();

    // An event without a cap: no bar
    const other = card(page, openToken);
    await expect(other).toContainText('95.00 USDC');
    await expect(other).toContainText('No price cap');
    await expect(other.locator('[style*="width"]')).toHaveCount(0);
  });

  test('a used ticket shows "no price cap"', async ({ page }) => {
    const event = await createPublishedEvent({ title: 'Checked In Already', resaleCap: 1.5, perWalletLimit: 0 });
    const [used] = (await chain.buyTickets(accounts.alex, { eventId: event.contractId })).tokenIds;

    // A used ticket can be listed above the cap: it's a collectible now
    await chain.checkIn(accounts.organizer, used);
    expect(await chain.ticketNft().resaleCapApplies(used)).toBe(false);
    await listed(accounts.alex, used, 500);

    await openMarketplace(page);
    await expect(card(page, used)).toContainText('500.00 USDC');
    await expect(card(page, used)).toContainText('Collectible · no price cap');
    await expect(card(page, used).locator('[style*="width"]')).toHaveCount(0);
    const api = (await apiListings()).listings.find((l) => l.token_id === String(used));
    expect(api).toMatchObject({ collectible: true, max_price: null });
  });

  // The Marketplace's cards take "sales ended" from the API, which compares the sales end with real
  // time; the local chain's clock can be far ahead of it (tests move it forward), so a card can't
  // be made to flip within a test. The Sell popup reads the contract, which is where the cap is
  // enforced, so that's where this is checked.
  test('a ticket whose sales ended is sold with "no price cap"', async ({ page, signIn }) => {
    // A block first, so the helper reads the chain's real time (the latest block can lag behind
    // it after the chain's clock was moved)
    await chain.mine();
    const event = await createPublishedEvent({ title: 'Sales Over Resale', resaleCap: 1.5, perWalletLimit: 0, startsInDays: 5, salesEndInDays: 60 / 86_400 });
    const [token] = await ticketsFor(accounts.jordan, event);
    await chain.increaseTime(120);
    expect(await chain.chainNow()).toBeGreaterThan(event.salesEnd);
    expect(await chain.ticketNft().resaleCapApplies(token)).toBe(false);

    // Past the sales end on the visitor's clock too
    await page.clock.setFixedTime(new Date((event.salesEnd + 60) * 1000));
    await openSignedIn(page, signIn, accounts.jordan);
    await openSell(page, token);
    await expect(ticketOption(page, token)).toContainText('Collectible · no price cap');
    await priceInput(page).fill('900');
    await expect(sellDialog(page)).toContainText('Collectible, no price cap');
    await listButton(page).click();
    await expect(sellDialog(page).getByRole('status')).toContainText('Listed for 900.00 USDC');
    expect((await onChainListing(token)).price).toBe(chain.usdc(900));
  });
});

test.describe('search, filters and sorting', () => {
  // Eleven listings across three events and two sellers, added once per project by the first test
  // that needs them (the stack goes back to the seeded state before each file, on each project)
  let made: { project: string; data: Promise<Dataset> } | null = null;

  interface Dataset {
    rock: PublishedEvent; // Concerts, in 10 days
    hockey: PublishedEvent; // Sports & Arenas, in 20 days
    gala: PublishedEvent; // Classical & Opera, in 40 days
    listings: Array<{ token: bigint; seller: Account; price: number; event: PublishedEvent }>;
  }

  async function dataset(projectName: string): Promise<Dataset> {
    if (made?.project !== projectName) {
      made = {
        project: projectName,
        data: (async () => {
          const types = [{ name: 'General Admission', price: 40, supply: 100 }];
          const rock = await createPublishedEvent({ title: 'Browse Rock Arena', category: 'Concerts', startsInDays: 10, perWalletLimit: 0, ticketTypes: types });
          const hockey = await createPublishedEvent({ title: 'Browse Hockey Final', category: 'Sports & Arenas', startsInDays: 20, perWalletLimit: 0, ticketTypes: types });
          const gala = await createPublishedEvent({ title: 'Browse Opera Gala', category: 'Classical & Opera', startsInDays: 40, perWalletLimit: 0, ticketTypes: types });
          // [event, seller, price], in the order they're listed
          const plan: Array<[PublishedEvent, Account, number]> = [
            [rock, accounts.alex, 45],
            [rock, accounts.alex, 52],
            [rock, accounts.jordan, 41],
            [rock, accounts.jordan, 60],
            [hockey, accounts.alex, 70],
            [hockey, accounts.jordan, 48],
            [hockey, accounts.jordan, 55],
            [gala, accounts.alex, 42],
            [gala, accounts.alex, 66],
            [gala, accounts.jordan, 50],
            [gala, accounts.jordan, 79],
          ];
          const listings: Dataset['listings'] = [];
          let last = 0;
          for (const [event, seller, price] of plan) {
            const { tokenIds } = await chain.buyTickets(seller, { eventId: event.contractId });
            ({ block: last } = await chain.listTicket(seller, tokenIds[0], price));
            listings.push({ token: tokenIds[0], seller, price, event });
          }
          // "Newest" sorts by when the API saved each listing: blocks are saved in order
          await waitForSync(last);
          return { rock, hockey, gala, listings };
        })(),
      };
    }
    return made.data;
  }

  const tokensOf = (rows: Dataset['listings']) => rows.map((row) => String(row.token));
  const byPrice = (rows: Dataset['listings']) => [...rows].sort((a, b) => a.price - b.price);

  test('search by event and by seller wallet, in any letter case', async ({ page }, testInfo) => {
    const data = await dataset(testInfo.project.name);
    await openMarketplace(page);

    await searchFor(page, 'hockey FINAL');
    await expect.poll(() => cardTokens(page)).toEqual(tokensOf(byPrice(data.listings.filter((l) => l.event === data.hockey))));

    // A wallet, whole or in part, and in upper case. Other tests in this file list Jordan's tickets
    // too, so the page is compared with the API, and every result must be Jordan's.
    for (const text of [accounts.jordan.address.toUpperCase().replace('0X', '0x'), accounts.jordan.address.slice(2, 12)]) {
      const api = (await apiListings({ q: text })).listings;
      expect(api.every((l) => l.seller_wallet === accounts.jordan.address.toLowerCase())).toBe(true);
      expect(api.map((l) => l.token_id)).toEqual(expect.arrayContaining(tokensOf(data.listings.filter((l) => l.seller === accounts.jordan))));
      await searchFor(page, text);
      await expect.poll(() => cardTokens(page)).toEqual(api.map((l) => l.token_id).slice(0, PAGE_SIZE));
    }
  });

  test('event and category filters, together with a search', async ({ page }, testInfo) => {
    const data = await dataset(testInfo.project.name);
    await openMarketplace(page);

    await select(page, 'Event').selectOption({ label: 'Browse Opera Gala' });
    await expect.poll(() => cardTokens(page)).toEqual(tokensOf(byPrice(data.listings.filter((l) => l.event === data.gala))));

    // A category (other tests' events are Concerts too: compare with the API)
    await select(page, 'Event').selectOption({ label: 'All events' });
    await select(page, 'Category').selectOption('Concerts');
    const concerts = (await apiListings({ category: 'Concerts' })).listings;
    expect(concerts.map((l) => l.token_id)).toEqual(expect.arrayContaining(tokensOf(data.listings.filter((l) => l.event === data.rock))));
    expect(concerts.map((l) => l.event.id)).not.toContain(data.hockey.apiId);
    await expect.poll(() => cardTokens(page)).toEqual(concerts.map((l) => l.token_id).slice(0, PAGE_SIZE));

    // A category and a search together
    const both = (await apiListings({ category: 'Concerts', q: 'Browse' })).listings;
    expect(both.map((l) => l.token_id)).toEqual(tokensOf(byPrice(data.listings.filter((l) => l.event === data.rock))));
    await searchFor(page, 'Browse');
    await expect.poll(() => cardTokens(page)).toEqual(both.map((l) => l.token_id));
  });

  test('all four sorts', async ({ page }, testInfo) => {
    const data = await dataset(testInfo.project.name);
    await openMarketplace(page);
    await searchFor(page, 'Browse');
    const rows = data.listings;

    // Lowest price (the default)
    await expect(select(page, 'Sort')).toHaveValue('price_asc');
    await expect.poll(() => cardTokens(page)).toEqual(tokensOf(byPrice(rows)).slice(0, PAGE_SIZE));

    await select(page, 'Sort').selectOption({ label: 'Highest price' });
    await expect.poll(() => cardTokens(page)).toEqual(tokensOf(byPrice(rows).reverse()).slice(0, PAGE_SIZE));

    await select(page, 'Sort').selectOption({ label: 'Newest' });
    await expect.poll(() => cardTokens(page)).toEqual(tokensOf([...rows].reverse()).slice(0, PAGE_SIZE));

    // Event date, then price within an event
    const order = [data.rock, data.hockey, data.gala];
    const byDate = [...rows].sort((a, b) => order.indexOf(a.event) - order.indexOf(b.event) || a.price - b.price);
    await select(page, 'Sort').selectOption({ label: 'Event date' });
    await expect.poll(() => cardTokens(page)).toEqual(tokensOf(byDate).slice(0, PAGE_SIZE));
  });

  test('"Load more listings", and Refresh shows a new listing', async ({ page }, testInfo) => {
    const data = await dataset(testInfo.project.name);
    await openMarketplace(page);
    await searchFor(page, 'Browse');
    const total = data.listings.length;

    await expect(main(page).getByText(`Showing ${PAGE_SIZE} of ${total} listings`)).toBeVisible();
    await main(page).getByRole('button', { name: 'Load more listings' }).click();
    await expect.poll(() => cardTokens(page)).toEqual(tokensOf(byPrice(data.listings)));
    await expect(main(page).getByText(`Showing ${total} of ${total} listings`)).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Load more listings' })).toHaveCount(0);

    // Someone lists a ticket while the page is open: Refresh shows it, cheapest first
    const token = await boughtAndListed(accounts.alex, data.rock, 40);
    await expect(card(page, token)).toHaveCount(0);
    await main(page).getByRole('button', { name: 'Refresh listings' }).click();
    await expect.poll(async () => (await cardTokens(page))[0]).toBe(String(token));
  });

  test('a search with no results, and clearing it', async ({ page }, testInfo) => {
    await dataset(testInfo.project.name);
    await openMarketplace(page);

    await searchBox(page).fill('no such event anywhere');
    await expect(main(page).getByRole('heading', { name: 'No listings match' })).toBeVisible();
    await expect(main(page).getByText('No resale tickets match your search. Try another event or category.')).toBeVisible();
    expect((await apiListings({ q: 'no such event anywhere' })).total).toBe(0);

    await main(page).getByRole('button', { name: 'Clear filters' }).click();
    await expect(searchBox(page)).toHaveValue('');
    await expect(main(page).getByRole('article')).toHaveCount(PAGE_SIZE);
  });
});

test.describe('selling', () => {
  test('signed out, "Sell a ticket" asks to connect a wallet', async ({ page }) => {
    await openMarketplace(page);
    await main(page).getByRole('button', { name: 'Sell a ticket' }).first().click();

    await expect(sellDialog(page).getByText('Connect your wallet to sell')).toBeVisible();
    await expect(sellDialog(page).getByText('Connect the wallet that holds the ticket you want to sell.')).toBeVisible();
    await sellDialog(page).getByRole('button', { name: 'Connect wallet' }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: WALLET_NAME })).toBeVisible();
  });

  test('only the wallet\'s own tickets are offered, and listed ones are marked', async ({ page, signIn }) => {
    const event = await sellingEvent();
    const [mine1, mine2] = await ticketsFor(accounts.jordan, event, 2);
    const [alexs] = await ticketsFor(accounts.alex, event);
    await listed(accounts.jordan, mine2, 22);

    await openSignedIn(page, signIn, accounts.jordan);
    await main(page).getByRole('button', { name: 'Sell a ticket' }).first().click();

    // Jordan's tickets, as the API has them for the wallet; not Alex's
    const owned = await apiGet<{ tickets: Array<{ token_id: string }> }>(`/api/tickets/owner/${accounts.jordan.address}`);
    await expect(sellDialog(page).getByRole('radio')).toHaveCount(owned.tickets.length);
    await expect(ticketOption(page, mine1)).toBeVisible();
    await expect(ticketOption(page, alexs)).toHaveCount(0);
    // The listed one says so, and isn't the one picked first
    await expect(ticketOption(page, mine2)).toContainText('Listed · 22.00 USDC');
    await expect(ticketOption(page, mine2)).toHaveAttribute('aria-checked', 'false');
  });

  test('the price: empty, 0, too many decimals, over the cap; no cap for a collectible', async ({ page, signIn }) => {
    const event = await sellingEvent();
    const [token, used] = await ticketsFor(accounts.jordan, event, 2);
    const { block } = await chain.checkIn(accounts.organizer, used);
    await waitForSync(block);
    await openSignedIn(page, signIn, accounts.jordan);
    await openSell(page, token);
    const error = sellDialog(page).locator('#resale-price-help').locator('p');

    // Empty: nothing to list, nothing to complain about
    await expect(listButton(page)).toBeDisabled();
    await expect(error).toHaveCount(0);
    await expect(sellDialog(page)).toContainText('Face value 20.00 · Max 30.00 before the event');

    await priceInput(page).fill('0');
    await expect(error).toHaveText('The price must be more than 0.');
    await expect(listButton(page)).toBeDisabled();

    await priceInput(page).fill('12.1234567');
    await expect(error).toHaveText('Enter a price in USDC, with up to 6 decimals.');
    await expect(listButton(page)).toBeDisabled();

    await priceInput(page).fill('30.01');
    await expect(error).toHaveText('The most you can ask for this ticket is 30.00 USDC.');
    await expect(priceInput(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(listButton(page)).toBeDisabled();
    await expect(chain.ticketNft(accounts.jordan).listForResale.staticCall(token, chain.usdc('30.01'))).rejects.toThrow('Sale price exceeds maximum resale price');

    // Exactly the cap is fine
    await priceInput(page).fill('30');
    await expect(error).toHaveCount(0);
    await expect(listButton(page)).toBeEnabled();

    // A used ticket is a collectible: no cap
    await ticketOption(page, used).click();
    await expect(ticketOption(page, used)).toContainText('Collectible · no price cap');
    await expect(priceInput(page)).toBeVisible();
    await priceInput(page).fill('900');
    await expect(sellDialog(page)).toContainText('Collectible, no price cap');
    await expect(listButton(page)).toBeEnabled();
  });

  test('the royalty and "you receive" add up to the price', async ({ page, signIn }) => {
    const event = await sellingEvent();
    const [token] = await ticketsFor(accounts.jordan, event);
    await openSignedIn(page, signIn, accounts.jordan);
    await openSell(page, token);

    await priceInput(page).fill('19.99');
    const dialog = sellDialog(page);
    // 7.5% of 19.99 is 1.49925 USDC on the contract; the popup shows cents, and the two lines still
    // add up to the price
    const [, royalty] = (await chain.ticketNft().royaltyInfo(token, chain.usdc('19.99'))) as [string, bigint];
    expect(royalty).toBe(1_499_250n);
    await expect(summaryRow(dialog, 'Buyer pays')).toContainText('19.99 USDC');
    await expect(summaryRow(dialog, 'Organizer royalty (7.5%)')).toContainText('-1.50 USDC');
    await expect(summaryRow(dialog, 'You receive')).toContainText('18.49 USDC');
  });

  test('listing: a wallet transaction, then it shows on the Marketplace and in Your listings', async ({ page, signIn, wallet }) => {
    const event = await sellingEvent();
    const [token] = await ticketsFor(accounts.jordan, event);
    await openSignedIn(page, signIn, accounts.jordan);
    await openSell(page, token);
    const sent = wallet.requests.length;

    await priceInput(page).fill('25');
    await listButton(page).click();
    await expect(sellDialog(page).getByRole('status')).toContainText('Listed for 25.00 USDC');
    expect(sendsSince(wallet, sent)).toBe(1);
    expect(await onChainListing(token)).toMatchObject({ seller: accounts.jordan.address, price: chain.usdc(25), royaltyBps: 750 });

    await sellDialog(page).getByRole('button', { name: 'Done' }).click();
    // The page reads the listings again as the listener catches up
    await expect(card(page, token)).toContainText('25.00 USDC', { timeout: 20_000 });
    await expect(card(page, token)).toContainText('You');
    await expect(card(page, token).getByRole('button', { name: `Change the price of your ticket #${token}` })).toBeVisible();
    await expect(yourRow(page, token)).toContainText('Listed for 25.00 USDC');
  });

  test('rejecting in the wallet lists nothing', async ({ page, signIn, wallet }) => {
    const event = await sellingEvent();
    const [token] = await ticketsFor(accounts.jordan, event);
    await openSignedIn(page, signIn, accounts.jordan);
    await openSell(page, token);

    await priceInput(page).fill('25');
    wallet.rejectNext('send');
    await listButton(page).click();
    await expect(sellDialog(page).getByRole('alert')).toHaveText(RESALE_ERRORS.listRejected);
    expect((await onChainListing(token)).seller).toBe(ZERO);
    // Trying again works
    await listButton(page).click();
    await expect(sellDialog(page).getByRole('status')).toContainText('Listed for 25.00 USDC');
  });

  test('changing the price: the new price shows, and the cap still applies', async ({ page, signIn }) => {
    const event = await sellingEvent();
    const [token] = await ticketsFor(accounts.jordan, event);
    await listed(accounts.jordan, token, 25);
    await openSignedIn(page, signIn, accounts.jordan);

    await yourRow(page, token).getByRole('button', { name: 'Edit price' }).click();
    await expect(ticketOption(page, token)).toHaveAttribute('aria-checked', 'true');
    await expect(sellDialog(page).getByRole('status').filter({ hasText: 'Listed for 25.00 USDC' })).toBeVisible();
    await expect(priceInput(page)).toHaveValue('25.00');
    // The same price isn't a change
    await expect(listButton(page)).toBeDisabled();

    await priceInput(page).fill('31');
    await expect(sellDialog(page)).toContainText('The most you can ask for this ticket is 30.00 USDC.');
    await expect(listButton(page)).toBeDisabled();

    await priceInput(page).fill('28');
    await expect(listButton(page)).toHaveText('Update price');
    await listButton(page).click();
    await expect(sellDialog(page).getByRole('status')).toContainText('Listed for 28.00 USDC');
    expect((await onChainListing(token)).price).toBe(chain.usdc(28));
    await sellDialog(page).getByRole('button', { name: 'Done' }).click();
    await expect(card(page, token)).toContainText('28.00 USDC', { timeout: 20_000 });
    await expect(yourRow(page, token)).toContainText('Listed for 28.00 USDC');
  });

  test('cancelling: a transaction, then the listing leaves the Marketplace', async ({ page, signIn, wallet }) => {
    const event = await sellingEvent();
    const [first, second] = await ticketsFor(accounts.jordan, event, 2);
    await listed(accounts.jordan, first, 25);
    await listed(accounts.jordan, second, 26);
    await openSignedIn(page, signIn, accounts.jordan);
    await expect(card(page, first)).toBeVisible();

    // From Your listings
    let sent = wallet.requests.length;
    await yourRow(page, first).getByRole('button', { name: 'Cancel' }).click();
    await expect(yourRow(page, first).getByRole('status')).toHaveText('Cancelled. It leaves the Marketplace in a few seconds.');
    expect(sendsSince(wallet, sent)).toBe(1);
    expect((await onChainListing(first)).seller).toBe(ZERO);
    await expect(card(page, first)).toHaveCount(0, { timeout: 20_000 });

    // From the Sell popup, and rejecting it first
    await openSell(page, second);
    wallet.rejectNext('send');
    await sellDialog(page).getByRole('button', { name: 'Cancel listing' }).click();
    await expect(sellDialog(page).getByRole('alert')).toHaveText(RESALE_ERRORS.cancelRejected);
    expect((await onChainListing(second)).seller).toBe(accounts.jordan.address);
    sent = wallet.requests.length;
    await sellDialog(page).getByRole('button', { name: 'Cancel listing' }).click();
    await expect(sellDialog(page).getByRole('status')).toContainText('Listing cancelled');
    expect(sendsSince(wallet, sent)).toBe(1);
    expect((await onChainListing(second)).seller).toBe(ZERO);
    await sellDialog(page).getByRole('button', { name: 'Done' }).click();
    await expect(card(page, second)).toHaveCount(0, { timeout: 20_000 });
  });

  test('double-clicking List, Update price or Cancel sends one transaction', async ({ page, signIn, wallet }) => {
    const event = await sellingEvent();
    const [token] = await ticketsFor(accounts.jordan, event);
    await openSignedIn(page, signIn, accounts.jordan);

    await openSell(page, token);
    await priceInput(page).fill('25');
    let sent = wallet.requests.length;
    await listButton(page).dblclick();
    await expect(sellDialog(page).getByRole('status')).toContainText('Listed for 25.00 USDC');
    expect(sendsSince(wallet, sent)).toBe(1);
    await sellDialog(page).getByRole('button', { name: 'Done' }).click();

    await openSell(page, token);
    await priceInput(page).fill('27');
    sent = wallet.requests.length;
    await listButton(page).dblclick();
    await expect(sellDialog(page).getByRole('status')).toContainText('Listed for 27.00 USDC');
    expect(sendsSince(wallet, sent)).toBe(1);
    await sellDialog(page).getByRole('button', { name: 'Done' }).click();

    await expect(yourRow(page, token)).toContainText('27.00 USDC', { timeout: 20_000 });
    sent = wallet.requests.length;
    await yourRow(page, token).getByRole('button', { name: 'Cancel' }).dblclick();
    await expect(yourRow(page, token).getByRole('status')).toBeVisible();
    expect(sendsSince(wallet, sent)).toBe(1);
    expect((await onChainListing(token)).seller).toBe(ZERO);
  });

  test('switching account or disconnecting mid-listing: nothing is sent', async ({ page, signIn, wallet }) => {
    const event = await sellingEvent();
    const [token] = await ticketsFor(accounts.jordan, event);
    await openSignedIn(page, signIn, accounts.jordan);
    await openSell(page, token);
    await priceInput(page).fill('25');

    const hold = wallet.holdNext('send');
    await listButton(page).click();
    await hold.reached;
    await wallet.switchAccount(accounts.alex);
    hold.release();
    await expect(sellDialog(page).getByRole('status').filter({ hasText: 'Listed for' })).toHaveCount(0);
    await chain.mine();
    expect((await onChainListing(token)).seller).toBe(ZERO);

    // Back to Jordan, then disconnecting while the wallet asks
    await wallet.switchAccount(accounts.jordan);
    await page.goto('/marketplace');
    await openSell(page, token);
    await priceInput(page).fill('25');
    const second = wallet.holdNext('send');
    await listButton(page).click();
    await second.reached;
    await wallet.disconnect();
    second.release();
    await expect(sellDialog(page).getByText('Connect your wallet to sell')).toBeVisible();
    await chain.mine();
    expect((await onChainListing(token)).seller).toBe(ZERO);
  });
});

test.describe('buying', () => {
  // A listing by Alex, ready to be bought: on the shared event, or on its own when a test needs
  // other settings
  async function alexListing(price = 25, options?: Parameters<typeof createPublishedEvent>[0]) {
    const event = options ? await createPublishedEvent({ perWalletLimit: 0, ...options }) : await marketEvent();
    const token = await boughtAndListed(accounts.alex, event, price);
    return { event, token };
  }

  test('signed out: connect a wallet; then sign in', async ({ page, wallet }) => {
    const { token } = await alexListing();
    await wallet.use(accounts.jordan);
    await openMarketplace(page);
    await openBuy(page, token);

    await expectBlocked(page, 'Connect your wallet to buy', 'The ticket is sent to the wallet you connect.');
    // Rejecting the sign-in message after connecting
    wallet.rejectNext('sign');
    await buyDialog(page).getByRole('button', { name: 'Connect wallet' }).click();
    await page.getByRole('dialog').getByRole('button', { name: WALLET_NAME }).click();
    await expectBlocked(page, 'Sign in to buy');
    await buyDialog(page).getByRole('button', { name: 'Sign in to buy' }).click();
    await expect(buyButton(page)).toBeEnabled({ timeout: 20_000 });
  });

  test('wrong network, and the switch works', async ({ page, signIn, wallet }) => {
    const { token } = await alexListing();
    await openSignedIn(page, signIn, accounts.jordan);
    await openBuy(page, token);
    await expect(buyButton(page)).toBeEnabled();

    await wallet.switchNetwork(SEPOLIA_CHAIN_ID);
    await expectBlocked(page, 'Wrong network', /Switch your wallet to .+ to buy this ticket\./);
    await buyDialog(page).getByRole('button', { name: 'Switch network' }).click();
    await expect(buyButton(page)).toBeEnabled();
  });

  // The navbar sends a signed-in account without a name and email to the create account step
  // straight away, so the Buy popup's "Finish your account" only shows for a moment
  test('an account that isn\'t finished is sent to finish it', async ({ page, wallet }) => {
    const { token } = await alexListing();
    await wallet.use(accounts.new1);
    await openMarketplace(page);
    await openBuy(page, token);
    await buyDialog(page).getByRole('button', { name: 'Connect wallet' }).click();
    await page.getByRole('dialog').getByRole('button', { name: WALLET_NAME }).click();
    await page.waitForURL(`${WEB_URL}/signup?next=${encodeURIComponent('/marketplace')}`);
  });

  test('allow USDC, then buy: each step shows its state; the money splits as the contract says', async ({ page, signIn, wallet }) => {
    const { event, token } = await alexListing(25);
    const before = {
      jordan: await chain.usdcBalance(accounts.jordan.address),
      alex: await chain.usdcBalance(accounts.alex.address),
      organizer: await chain.usdcBalance(accounts.organizer.address),
    };
    await openSignedIn(page, signIn, accounts.jordan);
    await openBuy(page, token);

    const dialog = buyDialog(page);
    await expect(summaryRow(dialog, 'Ticket price')).toContainText('25.00 USDC');
    await expect(summaryRow(dialog, 'Total')).toContainText('25.00 USDC');
    await expect(dialog).toContainText('The seller receives 22.50 USDC and the organizer 2.50 USDC (10% royalty).');
    await expect(steps(page).nth(0)).toContainText('Approve USDC');
    await expect(steps(page).nth(1)).toContainText('Buy ticket');
    const sent = wallet.requests.length;

    const approveHold = wallet.holdNext('send');
    await buyButton(page).click();
    await approveHold.reached;
    await expect(steps(page).nth(0)).toContainText('In progress');
    await expect(dialog).toContainText('Step 1 of 2: allow 25.00 USDC to be used for this purchase.');
    // The popup can't be closed mid-purchase
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeDisabled();
    const buyHold = wallet.holdNext('send');
    approveHold.release();
    await buyHold.reached;
    await expect(steps(page).nth(0)).toContainText('Done');
    await expect(steps(page).nth(1)).toContainText('In progress');
    await expect(dialog).toContainText(`Confirm the purchase of ticket #${token} in your wallet.`);
    buyHold.release();

    await expect(dialog.getByRole('status').filter({ hasText: "It's yours!" })).toContainText(`Ticket #${token} was sent to your wallet.`);
    expect(sendsSince(wallet, sent)).toBe(2);
    expect(await chain.ownerOf(token)).toBe(accounts.jordan.address);
    expect((await onChainListing(token)).seller).toBe(ZERO);
    // The buyer pays the price, the organizer gets the royalty, the seller the rest
    expect(before.jordan - (await chain.usdcBalance(accounts.jordan.address))).toBe(chain.usdc(25));
    expect((await chain.usdcBalance(accounts.organizer.address)) - before.organizer).toBe(chain.usdc('2.5'));
    expect((await chain.usdcBalance(accounts.alex.address)) - before.alex).toBe(chain.usdc('22.5'));
    expect(await allowance(accounts.jordan)).toBe(0n);

    // The ticket is in Jordan's My Tickets once the API has caught up, and the listing is gone
    await dialog.getByRole('link', { name: 'View my tickets' }).click();
    await expect(page).toHaveURL(`${WEB_URL}/my-tickets`);
    await expect(main(page).getByRole('heading', { name: event.title })).toBeVisible({ timeout: 20_000 });
    const api = await apiListings();
    expect(api.listings.map((l) => l.token_id)).not.toContain(String(token));
  });

  test('USDC already allowed: only the buy runs', async ({ page, signIn, wallet }) => {
    const { token } = await alexListing();
    await (await chain.mockUsdc(accounts.jordan).approve(chain.addresses().TicketNFT, chain.usdc(25))).wait();
    await openSignedIn(page, signIn, accounts.jordan);
    await openBuy(page, token);
    await expect(steps(page).nth(0)).toContainText('Done');
    const sent = wallet.requests.length;

    await buyButton(page).click();
    await expect(buyDialog(page).getByRole('status').filter({ hasText: "It's yours!" })).toBeVisible();
    expect(sendsSince(wallet, sent)).toBe(1);
    expect(await chain.ownerOf(token)).toBe(accounts.jordan.address);
  });

  test('rejecting the purchase in the wallet charges nothing', async ({ page, signIn, wallet }) => {
    const { token } = await alexListing();
    await openSignedIn(page, signIn, accounts.jordan);
    await openBuy(page, token);
    const before = await chain.usdcBalance(accounts.jordan.address);

    wallet.rejectNext('send');
    await buyButton(page).click();
    await expect(buyDialog(page).getByRole('alert')).toHaveText(RESALE_ERRORS.buyRejected);
    expect(await chain.ownerOf(token)).toBe(accounts.alex.address);
    expect(await chain.usdcBalance(accounts.jordan.address)).toBe(before);
  });

  test('not enough USDC, then not enough ETH for gas', async ({ page, signIn }) => {
    const { token } = await alexListing(25);
    const usdcBefore = await chain.usdcBalance(accounts.jordan.address);
    const ethBefore = await chain.provider.getBalance(accounts.jordan.address);
    await (await chain.mockUsdc(accounts.jordan).transfer(accounts.admin.address, usdcBefore - chain.usdc(5))).wait();
    try {
      await openSignedIn(page, signIn, accounts.jordan);
      await openBuy(page, token);
      await expectBlocked(page, 'Not enough USDC', 'This ticket costs 25.00 USDC and your wallet has 5.00 USDC. Add 20.00 USDC to buy it.');
      await expect(buyButton(page)).toBeDisabled();

      await chain.giveUsdc(accounts.jordan.address, 95);
      await chain.setEth(accounts.jordan.address, 0);
      await page.reload();
      await openBuy(page, token);
      await expectBlocked(page, 'Not enough ETH for the network fee', /Add about [\d.]+ ETH to this wallet, then try again\./);
      await expect(buyButton(page)).toBeDisabled();
    } finally {
      await chain.setEth(accounts.jordan.address, ethers.formatEther(ethBefore));
      await chain.giveUsdc(accounts.jordan.address, 1000);
    }
  });

  test('your own listing can\'t be bought', async ({ page, signIn }) => {
    const { token } = await alexListing();
    await openSignedIn(page, signIn, accounts.alex);

    await expect(card(page, token)).toContainText('You');
    await expect(buyOn(page, token)).toHaveCount(0);
    await expect(card(page, token).getByRole('button', { name: `Change the price of your ticket #${token}` })).toBeVisible();
    await expect(chain.ticketNft(accounts.alex).buyResaleTicket.staticCall(token, chain.usdc(25))).rejects.toThrow('Cannot buy your own ticket');
  });

  test('the per-wallet limit counts tickets already held', async ({ page, signIn }) => {
    const { event, token } = await alexListing(25, { title: 'Buy Over The Limit', perWalletLimit: 2 });
    await ticketsFor(accounts.jordan, event, 2);
    await openSignedIn(page, signIn, accounts.jordan);
    await openBuy(page, token);

    await expectBlocked(page, 'Wallet limit reached', 'You can hold up to 2 tickets for this event, and you already have 2.');
    await expect(summaryRow(buyDialog(page), 'Wallet limit')).toContainText('2 of 2');
    await expect(buyButton(page)).toBeDisabled();
    await expect(chain.ticketNft(accounts.jordan).buyResaleTicket.staticCall(token, chain.usdc(25))).rejects.toThrow('Per-wallet limit reached');
  });

  test('switching account mid-purchase: nothing is sent from either wallet', async ({ page, signIn, wallet }) => {
    const { token } = await alexListing();
    await (await chain.mockUsdc(accounts.jordan).approve(chain.addresses().TicketNFT, chain.usdc(25))).wait();
    const before = { jordan: await chain.usdcBalance(accounts.jordan.address), scanner: await chain.usdcBalance(accounts.scanner.address) };
    await openSignedIn(page, signIn, accounts.jordan);
    await openBuy(page, token);

    const hold = wallet.holdNext('send');
    await buyButton(page).click();
    await hold.reached;
    await wallet.switchAccount(accounts.scanner);
    hold.release();
    await expect(buyDialog(page).getByRole('status').filter({ hasText: "It's yours!" })).toHaveCount(0);
    await chain.mine();
    expect(await chain.ownerOf(token)).toBe(accounts.alex.address);
    expect(await chain.usdcBalance(accounts.jordan.address)).toBe(before.jordan);
    expect(await chain.usdcBalance(accounts.scanner.address)).toBe(before.scanner);
  });

  test('disconnecting mid-purchase: nothing is sent', async ({ page, signIn, wallet }) => {
    const { token } = await alexListing();
    await (await chain.mockUsdc(accounts.jordan).approve(chain.addresses().TicketNFT, chain.usdc(25))).wait();
    const before = await chain.usdcBalance(accounts.jordan.address);
    await openSignedIn(page, signIn, accounts.jordan);
    await openBuy(page, token);

    const hold = wallet.holdNext('send');
    await buyButton(page).click();
    await hold.reached;
    await wallet.disconnect();
    hold.release();
    await expectBlocked(page, 'Connect your wallet to buy');
    await chain.mine();
    expect(await chain.ownerOf(token)).toBe(accounts.alex.address);
    expect(await chain.usdcBalance(accounts.jordan.address)).toBe(before);
  });

  test('double-clicking Buy sends one purchase', async ({ page, signIn, wallet }) => {
    const { token } = await alexListing();
    await openSignedIn(page, signIn, accounts.jordan);
    await openBuy(page, token);
    const before = await chain.usdcBalance(accounts.jordan.address);
    const sent = wallet.requests.length;

    await buyButton(page).dblclick();
    await expect(buyDialog(page).getByRole('status').filter({ hasText: "It's yours!" })).toBeVisible();
    // One approval and one purchase
    expect(sendsSince(wallet, sent)).toBe(2);
    expect(before - (await chain.usdcBalance(accounts.jordan.address))).toBe(chain.usdc(25));
  });

  test('refreshing while the purchase is pending: it goes through once', async ({ page, signIn, wallet }) => {
    const { token } = await alexListing();
    await (await chain.mockUsdc(accounts.jordan).approve(chain.addresses().TicketNFT, chain.usdc(25))).wait();
    await openSignedIn(page, signIn, accounts.jordan);
    await openBuy(page, token);
    const before = await chain.usdcBalance(accounts.jordan.address);

    await chain.provider.send('evm_setAutomine', [false]);
    try {
      await buyButton(page).click();
      await expect(buyDialog(page).getByRole('button', { name: 'Buying…' })).toBeVisible();
      await page.reload();
      await expect(main(page).getByRole('heading', { level: 1, name: 'Marketplace' })).toBeVisible();
    } finally {
      await chain.provider.send('evm_setAutomine', [true]);
      await chain.mine();
    }
    expect(await chain.ownerOf(token)).toBe(accounts.jordan.address);
    expect(before - (await chain.usdcBalance(accounts.jordan.address))).toBe(chain.usdc(25));
    expect(sendsSince(wallet, 0)).toBe(1);
    // The listing leaves the page once the listener has the sale
    await waitForSync();
    await page.reload();
    await expect(card(page, token)).toHaveCount(0);
  });
});

test.describe('while the Buy popup is open', () => {
  // On the shared event, except for the royalty test, which changes its event's settings
  async function alexListing(price = 25, ownEvent?: string) {
    const event = ownEvent ? await createPublishedEvent({ title: ownEvent, perWalletLimit: 0 }) : await marketEvent();
    const token = await boughtAndListed(accounts.alex, event, price);
    return { event, token };
  }

  test('the seller changes the price: the first click shows it, the second buys at it', async ({ page, signIn, wallet }) => {
    const { token } = await alexListing(25);
    await openSignedIn(page, signIn, accounts.jordan);
    await openBuy(page, token);
    const before = await chain.usdcBalance(accounts.jordan.address);

    await chain.listTicket(accounts.alex, token, 27);
    const sent = wallet.requests.length;
    await buyButton(page).click();
    await expect(buyDialog(page).getByRole('status').filter({ hasText: 'The seller changed the price' })).toContainText('It was 25.00 USDC when the page loaded.');
    await expect(buyButton(page)).toHaveText(/27\.00 USDC/);
    expect(sendsSince(wallet, sent)).toBe(0);

    await buyButton(page).click();
    await expect(buyDialog(page).getByRole('status').filter({ hasText: "It's yours!" })).toBeVisible();
    expect(before - (await chain.usdcBalance(accounts.jordan.address))).toBe(chain.usdc(27));
  });

  const gone: Array<{ name: string; happen: (token: bigint) => Promise<unknown> }> = [
    { name: 'the seller cancels', happen: (token) => chain.cancelListing(accounts.alex, token) },
    { name: 'someone else buys it first', happen: (token) => chain.buyListedTicket(accounts.scanner, token) },
    { name: 'the ticket is checked in', happen: (token) => chain.checkIn(accounts.organizer, token) },
    {
      name: 'the seller sends the ticket to another wallet',
      happen: async (token) => (await chain.ticketNft(accounts.alex).transferFrom(accounts.alex.address, accounts.new2.address, token)).wait(),
    },
  ];

  for (const { name, happen } of gone) {
    test(`${name}: told it's no longer for sale, nothing charged`, async ({ page, signIn, wallet }) => {
      const { token } = await alexListing();
      if (name.startsWith('someone')) await chain.giveUsdc(accounts.scanner.address, 100);
      await openSignedIn(page, signIn, accounts.jordan);
      await openBuy(page, token);
      const before = await chain.usdcBalance(accounts.jordan.address);

      await happen(token);
      expect((await onChainListing(token)).seller).toBe(ZERO);
      const sent = wallet.requests.length;
      await buyButton(page).click();
      await expectBlocked(page, 'This ticket is no longer for sale', 'It was just bought or the seller took it off the Marketplace. Pick another listing.');
      expect(sendsSince(wallet, sent)).toBe(0);
      expect(await chain.usdcBalance(accounts.jordan.address)).toBe(before);

      // The card leaves the Marketplace once the API has caught up
      await buyDialog(page).getByRole('button', { name: 'Close' }).click();
      await waitForSync();
      await main(page).getByRole('button', { name: 'Refresh listings' }).click();
      await expect(card(page, token)).toHaveCount(0);
    });
  }

  // The admin changes the royalty while the popup is open
  async function royaltyChangedUnderBuyer(page: Page, signIn: SignIn, title: string) {
    const { event, token } = await alexListing(25, title);
    await openSignedIn(page, signIn, accounts.jordan);
    await openBuy(page, token);
    const [endTime, resaleCapBps, , , , , perWalletLimit] = (await chain.ticketNft().eventConfigs(event.contractId)) as [bigint, bigint, bigint, bigint, boolean, boolean, bigint];
    await (await chain.ticketNft(accounts.admin).adminUpdateEventSettings(event.contractId, endTime, 500, resaleCapBps, perWalletLimit)).wait();
    return token;
  }

  test('the admin changes the event\'s royalty: told why it can\'t be bought', async ({ page, signIn }) => {
    const token = await royaltyChangedUnderBuyer(page, signIn, 'Royalty Changed Under Me');
    const before = await chain.usdcBalance(accounts.jordan.address);

    await buyButton(page).click();
    await expectBlocked(page, 'The royalty changed after this ticket was listed', "It can't be bought until the seller lists it again with the new terms. Pick another listing.");
    await expect(buyButton(page)).toBeDisabled();
    expect(await chain.ownerOf(token)).toBe(accounts.alex.address);
    expect(await chain.usdcBalance(accounts.jordan.address)).toBe(before);
    await expect(chain.ticketNft(accounts.jordan).buyResaleTicket.staticCall(token, chain.usdc(25))).rejects.toThrow('Royalty changed since listing');
  });

  // The popup's last check before the wallet opens reads the royalty too (#418)
  test('the admin changes the event\'s royalty: nothing is sent', async ({ page, signIn, wallet }) => {
    await royaltyChangedUnderBuyer(page, signIn, 'Royalty Changed Nothing Sent');
    const sent = wallet.requests.length;

    await buyButton(page).click();
    await expectBlocked(page, 'The royalty changed after this ticket was listed');
    expect(sendsSince(wallet, sent)).toBe(0);
  });
});
