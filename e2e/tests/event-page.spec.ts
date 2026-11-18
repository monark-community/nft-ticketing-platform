// The event page (#343): the event's details, the cover image and its fallback, "About this
// event" (#330), availability and resale rules read from the contract, sold-out and ended sales,
// IDs that don't exist or aren't public, and the phone layout.
//
// Each test publishes the event it needs (API, IPFS stand-in and contract, like the app does) and
// compares the screen with what the contract and the API say.

import type { Page } from '@playwright/test';

import { accounts, ApiSession, apiGet, chain, createPublishedEvent, expect, seededEvents, test, waitForSync, type PublishedEvent } from '../fixtures/index.js';
import { WEB_URL } from '../stack/config.mjs';

interface ApiEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  category: string | null;
  start_date: string;
  end_date: string | null;
  image_url: string | null;
  status: string;
  ticket_types: Array<{ name: string; sold: number; supply: number }>;
}

const apiEvent = (id: string) => apiGet<ApiEvent>(`/api/events/${id}`);

// The event's rules on the contract
async function chainEvent(contractId: bigint) {
  const nft = chain.ticketNft();
  const [config, royaltyBps] = await Promise.all([
    nft.eventConfigs(contractId) as Promise<[bigint, bigint, bigint, bigint, boolean, boolean, bigint]>,
    nft.royaltyPercentage(contractId) as Promise<bigint>,
  ]);
  const [endTime, resaleCapBps, typeCount, sold, configured, active, perWalletLimit] = config;
  return { endTime: Number(endTime), resaleCapBps: Number(resaleCapBps), typeCount: Number(typeCount), sold: Number(sold), configured, active, perWalletLimit: Number(perWalletLimit), royaltyBps: Number(royaltyBps) };
}

// Supply and tickets left of each ticket type on the contract
async function chainStock(contractId: bigint, typeCount: number) {
  const types = [];
  for (let typeId = 0; typeId < typeCount; typeId++) {
    const [, maxSupply, sold, issued] = (await chain.ticketNft().ticketTypes(contractId, typeId)) as [bigint, bigint, bigint, bigint, string];
    types.push({ supply: Number(maxSupply), remaining: Number(maxSupply - sold - issued) });
  }
  return { types, supply: types.reduce((sum, type) => sum + type.supply, 0), remaining: types.reduce((sum, type) => sum + type.remaining, 0) };
}

const main = (page: Page) => page.getByRole('main');
const title = (page: Page, name: string) => main(page).getByRole('heading', { level: 1, name });
const summary = (page: Page) => main(page).getByRole('region', { name: 'Order Summary' });
// A row of the order summary, such as "Wallet Limit  6 per wallet"
const summaryRow = (page: Page, label: string) => summary(page).getByText(label, { exact: true }).locator('..');
const buyButton = (page: Page) => summary(page).getByRole('button', { name: /^Buy tickets/ });
// A ticket type's card: its button holds the name, a badge, the price and how many are left
const tier = (page: Page, name: string) => main(page).getByRole('region', { name: 'Select Ticket Tier' }).getByRole('button', { name: new RegExp(`^${name}`) });
const availability = (page: Page) => main(page).getByRole('heading', { name: 'Ticket Availability Status' }).locator('..');
const bar = (page: Page) => main(page).getByRole('progressbar', { name: 'Tickets remaining' });
const about = (page: Page) => main(page).getByRole('button', { name: /^About this event/ });
const resaleRules = (page: Page) => summary(page).getByRole('button', { name: /^Resale rules/ });
const coverImage = (page: Page, cid: string) => main(page).locator(`img[src$="/ipfs/${cid}"]`);

async function openEvent(page: Page, event: { apiId: string; title: string }) {
  await page.goto(`/events/${event.apiId}`);
  await expect(title(page, event.title)).toBeVisible();
}

// The page shows "Checking availability…" until the contract has answered
async function expectAvailability(page: Page, remaining: number, supply: number) {
  await expect(availability(page)).toContainText(`${remaining.toLocaleString('en-US')} of ${supply.toLocaleString('en-US')} tickets left`);
}

test.describe('event details', () => {
  // One event for the tests of this group, published by the first of them on each project (the
  // stack goes back to the seeded state before a file's first test on desktop and on phone)
  let published: { project: string; event: Promise<PublishedEvent> } | null = null;
  let event: PublishedEvent;
  let api: ApiEvent;

  test.beforeEach(async ({}, testInfo) => {
    if (published?.project !== testInfo.project.name) {
      published = {
        project: testInfo.project.name,
        event: createPublishedEvent({
          title: 'Northern Lights Festival',
          description: 'Three stages under the open sky.\n\nGates open one hour before the first act.',
          category: 'Electronic Music',
          location: 'Lansdowne Park, Ottawa, ON',
          startsInDays: 20,
        }),
      };
    }
    event = await published.event;
    api = await apiEvent(event.apiId);
  });

  const dateIn = (iso: string, timeZone: string) =>
    `${new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone })} • ${new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })}`;

  test('title, date and time, venue, category and cover image', async ({ page }, testInfo) => {
    await openEvent(page, event);

    await expect(main(page).getByText('Electronic Music', { exact: true })).toBeVisible();
    await expect(main(page).getByText('Lansdowne Park, Ottawa, ON')).toBeVisible();
    await expect(main(page).getByText(dateIn(api.start_date, testInfo.project.use.timezoneId!))).toBeVisible();

    // The cover image is the one pinned to IPFS when the event was frozen, and it loads
    expect(api.image_url).toMatch(/^ipfs:\/\//);
    const image = coverImage(page, api.image_url!.slice('ipfs://'.length));
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

    // What the page shows is what the API has
    expect(api).toMatchObject({ title: event.title, category: 'Electronic Music', location: 'Lansdowne Park, Ottawa, ON', status: 'PUBLISHED' });
    await main(page).getByRole('link', { name: 'Back to events' }).click();
    await expect(page).toHaveURL(`${WEB_URL}/`);
  });

  test('the date and time follow the viewer\'s time zone', async ({ browser, baseURL }, testInfo) => {
    const here = testInfo.project.use.timezoneId!;
    expect(dateIn(api.start_date, 'Asia/Tokyo')).not.toBe(dateIn(api.start_date, here));

    const { viewport, isMobile, hasTouch, deviceScaleFactor, locale } = testInfo.project.use;
    const context = await browser.newContext({ baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, locale, timezoneId: 'Asia/Tokyo' });
    const page = await context.newPage();
    await openEvent(page, event);

    await expect(main(page).getByText(dateIn(api.start_date, 'Asia/Tokyo'))).toBeVisible();
    await expect(main(page).getByText(dateIn(api.start_date, here))).toHaveCount(0);
    // "Start time" under "About this event" too
    await about(page).click();
    const startTime = new Date(api.start_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Tokyo' });
    await expect(main(page).getByText('Start time', { exact: true }).locator('..')).toContainText(startTime);
    await context.close();
  });

  test('a cover image that fails to load is replaced by the placeholder', async ({ page }) => {
    const cid = api.image_url!.slice('ipfs://'.length);
    let asked = 0;
    await page.route(`**/ipfs/${cid}`, (route) => {
      asked += 1;
      return route.abort();
    });
    await openEvent(page, event);

    await expect.poll(() => asked, { message: 'the page asked for the cover image' }).toBeGreaterThan(0);
    // No broken image is left on the page; the rest of the event is there
    await expect(main(page).locator('img')).toHaveCount(0);
    await expect(main(page).getByText('Lansdowne Park, Ottawa, ON')).toBeVisible();
    await expectAvailability(page, 100, 100);

    // The same on the Events page: the card keeps its details, without the image
    await page.goto(`/?q=${encodeURIComponent(event.title)}`);
    const card = main(page).getByRole('listitem').getByRole('link').filter({ hasText: event.title });
    await expect(card).toBeVisible();
    await expect(card.locator('img')).toHaveCount(0);
  });
});

test.describe('"About this event" (#330)', () => {
  // The row is a button that controls the panel under it; closed, the panel is inert (out of the
  // tab order and hidden from screen readers)
  async function expectOpen(page: Page, open: boolean) {
    await expect(about(page)).toHaveAttribute('aria-expanded', String(open));
    await expect(about(page)).toContainText(open ? 'Show less' : 'Read more');
    const panel = page.locator(`[id="${await about(page).getAttribute('aria-controls')}"]`);
    await expect.poll(() => panel.evaluate((el: HTMLElement) => el.inert)).toBe(!open);
  }

  test('opens and closes with the mouse and the keyboard', async ({ page }) => {
    const description = 'Three stages under the open sky.\n\nGates open one hour before the first act.';
    const event = await createPublishedEvent({ title: 'About With Words', description });
    await openEvent(page, event);

    // Closed: the first line as a teaser
    await expectOpen(page, false);
    await expect(about(page)).toContainText('Three stages under the open sky.');

    // Mouse
    await about(page).click();
    await expectOpen(page, true);
    await expect(main(page).getByText('Gates open one hour before the first act.')).toBeVisible();
    await expect(main(page).getByText('Event length', { exact: true }).locator('..')).toContainText('Duration: 3h');
    const api = await apiEvent(event.apiId);
    const startTime = new Date(api.start_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: test.info().project.use.timezoneId });
    await expect(main(page).getByText('Start time', { exact: true }).locator('..')).toContainText(startTime);
    expect(api.description).toBe(description);

    await about(page).click();
    await expectOpen(page, false);

    // Keyboard: Enter and Space on the focused row
    await about(page).focus();
    await page.keyboard.press('Enter');
    await expectOpen(page, true);
    await expect(about(page)).toBeFocused();
    await page.keyboard.press('Space');
    await expectOpen(page, false);
    await page.keyboard.press('Space');
    await expectOpen(page, true);
    await page.keyboard.press('Enter');
    await expectOpen(page, false);
  });

  test('an event with no description says so, and still shows its length and start time', async ({ page }) => {
    const event = await createPublishedEvent({ title: 'About Without Words', description: '' });
    expect((await apiEvent(event.apiId)).description ?? '').toBe('');
    await openEvent(page, event);

    await expect(about(page)).toContainText('Event length and start time');
    await about(page).click();
    await expectOpen(page, true);
    await expect(main(page).getByText("The organizer hasn't added a description yet.")).toBeVisible();
    await expect(main(page).getByText('Event length', { exact: true }).locator('..')).toContainText('Duration: 3h');
    await expect(main(page).getByText('Start time', { exact: true })).toBeVisible();
  });
});

test.describe('availability', () => {
  test('the numbers and the bar match the contract, and follow sales', async ({ page }) => {
    const event = await createPublishedEvent({
      title: 'Counted Seats',
      perWalletLimit: 0,
      ticketTypes: [
        { name: 'General Admission', price: 20, supply: 20 },
        { name: 'Balcony', price: 30, supply: 10 },
        { name: 'Backstage', price: 60, supply: 10 },
      ],
    });
    await openEvent(page, event);
    await expectAvailability(page, 40, 40);
    await expect(bar(page)).toHaveAttribute('aria-valuenow', '100');
    await expect(availability(page).locator('..')).toContainText('100% remaining');

    // 3 General Admission, 1 Balcony and 7 Backstage are bought
    await chain.buyTickets(accounts.alex, { eventId: event.contractId, typeId: 0, quantity: 3 });
    await chain.buyTickets(accounts.jordan, { eventId: event.contractId, typeId: 1, quantity: 1 });
    await chain.buyTickets(accounts.jordan, { eventId: event.contractId, typeId: 2, quantity: 7 });
    const stock = await chainStock(event.contractId, 3);
    expect(stock).toMatchObject({ supply: 40, remaining: 29, types: [{ remaining: 17 }, { remaining: 9 }, { remaining: 3 }] });
    expect((await chainEvent(event.contractId)).sold).toBe(11);

    await page.reload();
    await expectAvailability(page, stock.remaining, stock.supply);
    const percent = Math.round((stock.remaining / stock.supply) * 1000) / 10; // 72.5
    await expect(bar(page)).toHaveAttribute('aria-valuenow', String(percent));
    await expect(availability(page).locator('..')).toContainText(`${percent}% remaining`);

    // Each ticket type shows what the contract has left for it
    await expect(tier(page, 'General Admission')).toContainText('17 left');
    await expect(tier(page, 'Balcony')).toContainText('9 left');
    // 3 of 10 left is low stock (35% or less)
    await expect(tier(page, 'Backstage')).toContainText('Low stock · 3 left');
    // Prices are the contract's too
    await expect(tier(page, 'Balcony')).toContainText('30.00');
  });

  test('a sold-out ticket type can\'t be bought and points to the Marketplace', async ({ page }) => {
    // Seeded: every Early Bird ticket of the Gala is sold
    const stock = await chainStock(seededEvents.gala.contractId, 3);
    expect(stock.types[2].remaining).toBe(0);
    await openEvent(page, seededEvents.gala);
    await expectAvailability(page, stock.remaining, stock.supply);

    const earlyBird = tier(page, 'Early Bird');
    await expect(earlyBird).toContainText('Sold out');
    await expect(earlyBird).toContainText('None left');
    // The first type with tickets left is the one selected
    await expect(tier(page, 'General Admission')).toHaveAttribute('aria-pressed', 'true');
    await expect(earlyBird).toHaveAttribute('aria-pressed', 'false');

    await earlyBird.click();
    await expect(earlyBird).toHaveAttribute('aria-pressed', 'true');
    await expect(summary(page).getByText('Early Bird is sold out')).toBeVisible();
    await expect(summary(page).getByText('Choose another ticket type, or check the Marketplace for resale tickets.')).toBeVisible();
    await expect(summaryRow(page, 'Quantity')).toContainText('—');
    await expect(buyButton(page)).toBeDisabled();
    // No quantity to choose
    await expect(main(page).getByRole('group', { name: 'Early Bird tickets' })).toHaveCount(0);
    await expect(summary(page).getByRole('link', { name: 'See resale tickets' })).toHaveAttribute('href', '/marketplace');

    // Another type can still be bought
    await tier(page, 'VIP').click();
    await expect(summary(page).getByText('Early Bird is sold out')).toHaveCount(0);
    await expect(summaryRow(page, 'Selected Tier')).toContainText('VIP');
  });

  test('a fully sold-out event', async ({ page }) => {
    const event = await createPublishedEvent({
      title: 'Last Seats Gone',
      perWalletLimit: 0,
      ticketTypes: [
        { name: 'Floor', price: 20, supply: 2 },
        { name: 'Balcony', price: 30, supply: 1 },
      ],
    });
    await chain.buyTickets(accounts.alex, { eventId: event.contractId, typeId: 0, quantity: 2 });
    const last = await chain.buyTickets(accounts.jordan, { eventId: event.contractId, typeId: 1, quantity: 1 });
    expect(await chainStock(event.contractId, 2)).toMatchObject({ supply: 3, remaining: 0 });
    // The contract refuses one more
    await expect(chain.ticketNft(accounts.jordan).buyTickets.staticCall(event.contractId, 0, 1)).rejects.toThrow();

    await openEvent(page, event);
    await expectAvailability(page, 0, 3);
    await expect(bar(page)).toHaveAttribute('aria-valuenow', '0');
    await expect(availability(page).locator('..')).toContainText('Sold out');
    for (const name of ['Floor', 'Balcony']) {
      await expect(tier(page, name)).toContainText('Sold out');
      await expect(tier(page, name)).toContainText('None left');
    }
    await expect(summary(page).getByText('Floor is sold out')).toBeVisible();
    await expect(buyButton(page)).toBeDisabled();
    await expect(summary(page).getByRole('link', { name: 'See resale tickets' })).toBeVisible();

    // The Events page marks the card once the API has caught up with the chain
    await test.step('the card on the Events page', async () => {
      await waitForSync(last.block);
      await page.goto(`/?q=${encodeURIComponent(event.title)}`);
      const card = main(page).getByRole('listitem').getByRole('link').filter({ hasText: event.title });
      await expect(card.getByText('Sold out').first()).toBeVisible();
      await expect(card.getByText('View tickets')).toHaveCount(0);
    });
  });
});

test.describe('resale rules and wallet limit', () => {
  test('the cap, royalty and per-wallet limit are the contract\'s', async ({ page, signIn }) => {
    const event = await createPublishedEvent({ title: 'Capped Resale', resaleCap: 1.5, royaltyPercent: 7.5, perWalletLimit: 6 });
    expect(await chainEvent(event.contractId)).toMatchObject({ resaleCapBps: 15_000, royaltyBps: 750, perWalletLimit: 6 });

    await openEvent(page, event);
    await expect(summaryRow(page, 'Wallet Limit')).toContainText('6 per wallet');

    // Closed until asked for
    await expect(resaleRules(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(summary(page).getByText('Max resale price')).toBeHidden();
    await resaleRules(page).click();
    await expect(resaleRules(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(resaleRules(page)).toContainText('1.5× cap · 7.5% royalty');
    await expect(summary(page).getByText('Max resale price').locator('..')).toContainText('1.5×');
    await expect(summary(page).getByText('Organizer royalty').locator('..')).toContainText('7.5%');
    await expect(summary(page).getByText('Before the event, resale on NFTokenPass is capped at 1.5× face value. The organizer gets 7.5% of every resale.')).toBeVisible();
    // With the keyboard
    await resaleRules(page).focus();
    await page.keyboard.press('Enter');
    await expect(resaleRules(page)).toHaveAttribute('aria-expanded', 'false');

    // Signed in, the limit counts the tickets the wallet holds: none yet, 1 in the order
    await signIn('attendee', { path: `/events/${event.apiId}` });
    await expect(summaryRow(page, 'Wallet Limit')).toContainText('1 of 6');
    await chain.buyTickets(accounts.alex, { eventId: event.contractId, quantity: 2 });
    await page.reload();
    await expect(summaryRow(page, 'Wallet Limit')).toContainText('3 of 6');
  });

  test('no cap and no wallet limit', async ({ page }) => {
    const event = await createPublishedEvent({ title: 'Open Resale', resaleCap: 0, royaltyPercent: 0, perWalletLimit: 0 });
    expect(await chainEvent(event.contractId)).toMatchObject({ resaleCapBps: 0, royaltyBps: 0, perWalletLimit: 0 });

    await openEvent(page, event);
    await expect(summaryRow(page, 'Wallet Limit')).toContainText('No limit');
    await resaleRules(page).click();
    await expect(resaleRules(page)).toContainText('No cap · 0% royalty');
    await expect(summary(page).getByText('Max resale price').locator('..')).toContainText('None');
    await expect(summary(page).getByText('Resale on NFTokenPass has no price cap for this event.')).toBeVisible();
  });
});

test.describe('sales that ended', () => {
  test('the page says sales have ended and offers no purchase', async ({ page, signIn }) => {
    const event = await createPublishedEvent({ title: 'Doors Closed', startsInDays: 10, salesEndInDays: 60 / 86_400 });
    expect((await chainEvent(event.contractId)).endTime).toBe(event.salesEnd);

    // Before the end, tickets are on sale
    await openEvent(page, event);
    await expect(summary(page).getByRole('button', { name: 'Connect wallet' })).toBeVisible();
    await expect(summary(page).getByText('Ticket sales have ended')).toHaveCount(0);

    // Two minutes later, for the contract and for the visitor's clock. The page compares the
    // contract's end time with the visitor's clock, and the local chain's clock can run ahead of
    // the real one, so the browser's clock is set instead of waiting.
    await chain.increaseTime(120);
    expect(await chain.chainNow()).toBeGreaterThan(event.salesEnd);
    await page.clock.setFixedTime(new Date((event.salesEnd + 60) * 1000));

    await page.reload();
    await expect(title(page, event.title)).toBeVisible();
    await expect(summary(page).getByText('Ticket sales have ended')).toBeVisible();
    await expect(summary(page).getByText("This event is over, so tickets can't be bought anymore.")).toBeVisible();
    await expect(buyButton(page)).toBeDisabled();
    await expect(summary(page).getByRole('button', { name: 'Connect wallet' })).toHaveCount(0);
    // Tickets are left, they just can't be bought
    await expectAvailability(page, 100, 100);

    // Signed in with money to spend, it is the same
    await signIn('attendee', { path: `/events/${event.apiId}` });
    await expect(summaryRow(page, 'Wallet Limit')).toContainText('of 4');
    await expect(summary(page).getByText('Ticket sales have ended')).toBeVisible();
    await expect(buyButton(page)).toBeDisabled();
    // And the contract refuses the purchase
    await expect(chain.ticketNft(accounts.alex).buyTickets.staticCall(event.contractId, 0, 1)).rejects.toThrow();
  });

  test('sales that are paused offer no purchase either', async ({ page }) => {
    const event = await createPublishedEvent({ title: 'Not Open Yet', openSales: false });
    expect((await chainEvent(event.contractId)).active).toBe(false);

    await openEvent(page, event);
    await expect(summary(page).getByText('Ticket sales are closed')).toBeVisible();
    await expect(buyButton(page)).toBeDisabled();
  });
});

test.describe('events that can\'t be shown', () => {
  test('an unknown event ID shows "Event not found"', async ({ page }) => {
    await page.goto('/events/no-such-event');

    await expect(main(page).getByRole('heading', { level: 1, name: 'Event not found' })).toBeVisible();
    await expect(main(page).getByText("This event doesn't exist, or it was removed.")).toBeVisible();
    await expect(summary(page)).toHaveCount(0);
    await expect(apiGet('/api/events/no-such-event')).rejects.toMatchObject({ status: 404 });

    await main(page).getByRole('link', { name: 'Browse events' }).click();
    await expect(page).toHaveURL(`${WEB_URL}/`);
    await expect(page.getByRole('heading', { name: 'Upcoming events' })).toBeVisible();
  });

  test('a draft is only visible to its organizer', async ({ page, signIn }) => {
    const organizer = await ApiSession.signIn(accounts.organizer);
    const draft = await organizer.post<{ id: string }>('/api/events', {
      title: 'Secret Draft Show',
      description: 'Not announced yet.',
      category: 'Concerts',
      location: 'National Arts Centre, Ottawa, ON',
      start_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // The public: "Event not found", the same as for an ID that doesn't exist
    await page.goto(`/events/${draft.id}`);
    await expect(main(page).getByRole('heading', { level: 1, name: 'Event not found' })).toBeVisible();
    await expect(main(page).getByText('Secret Draft Show')).toHaveCount(0);
    await expect(apiGet(`/api/events/${draft.id}`)).rejects.toMatchObject({ status: 404 });
    // Another signed-in user too
    const jordan = await ApiSession.signIn(accounts.jordan);
    await expect(jordan.get(`/api/events/${draft.id}`)).rejects.toMatchObject({ status: 404 });

    // Its organizer still reads it (Create event loads drafts this way)
    expect((await organizer.get<{ title: string }>(`/api/events/${draft.id}`)).title).toBe('Secret Draft Show');
    await signIn('organizer', { path: `/events/${draft.id}` });
    await expect(main(page).getByRole('heading', { level: 1, name: 'Secret Draft Show' })).toBeVisible();
  });
});

test.describe('on a phone', () => {
  const buyBar = (page: Page) => page.getByRole('button', { name: 'Review & buy' });

  test('the buy bar stays at the bottom and jumps to the order summary', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'The buy bar is only on small screens');
    await openEvent(page, seededEvents.gala);
    const height = page.viewportSize()!.height;

    // At the bottom edge of the screen, with the selected type and the total
    const barBox = async () => (await buyBar(page).locator('../..').boundingBox())!;
    await expect(buyBar(page)).toBeInViewport();
    expect(Math.round((await barBox()).y + (await barBox()).height)).toBe(height);
    const barText = buyBar(page).locator('..');
    await expect(barText).toContainText('General Admission');
    await expect(barText).toContainText('15.00 USDC');

    // It stays there while the page scrolls
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(buyBar(page)).toBeInViewport();
    expect(Math.round((await barBox()).y + (await barBox()).height)).toBe(height);

    // It follows the selection
    await tier(page, 'VIP').click();
    await expect(barText).toContainText('VIP');
    await expect(barText).toContainText('28.00 USDC');
    await tier(page, 'Early Bird').click(); // sold out
    await expect(barText).toContainText('—');

    // "Review & buy" brings the order summary into view
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(summary(page).getByRole('heading', { name: 'Order Summary' })).not.toBeInViewport();
    await buyBar(page).click();
    await expect(summary(page).getByRole('heading', { name: 'Order Summary' })).toBeInViewport();
  });

  test('on a wide screen there is no buy bar', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'Wide screens only');
    await openEvent(page, seededEvents.gala);
    await expect(summary(page)).toBeVisible();
    await expect(buyBar(page)).toBeHidden();
  });

  test('nothing scrolls sideways, with everything open', async ({ page }) => {
    const event = await createPublishedEvent({
      title: 'A Very Long Event Title That Has To Wrap On A Small Screen Without Pushing The Page Wider',
      location: 'A Venue With A Rather Long Name, 1234 Some Long Street Name West, Ottawa, ON',
      description: 'Averyveryveryverylongwordwithoutanyspacesthatcouldpushthepagewiderthanthescreenifitisnotwrapped. And then some ordinary words.',
      ticketTypes: [{ name: 'General Admission With A Long Name', price: 1234.5, supply: 100_000, description: 'A longer description of what this ticket type includes.' }],
    });
    await openEvent(page, event);
    await expectAvailability(page, 100_000, 100_000);
    await about(page).click();
    await resaleRules(page).click();
    await expect(summary(page).getByText('Max resale price')).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
});
