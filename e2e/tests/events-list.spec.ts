// The Events page (#343): which events it lists, loading, empty and "load more", search, category
// filters, filters kept in the link, the "Want to host an event?" banner and the cards.
//
// The first test to run adds a set of events to the two seeded ones (UPCOMING and HIDDEN below) and the
// other tests in the file reuse them. Each list is checked on the screen and against GET /api/events.

import type { Locator, Page } from '@playwright/test';

import { accounts, ApiSession, apiGet, chain, contractEventIdFor, expect, openMenuIfPhone, seededEvents, test } from '../fixtures/index.js';
import { API_URL, WEB_URL } from '../stack/config.mjs';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PAGE_SIZE = 9; // EVENTS_PAGE_SIZE in services/web/src/hooks/useEvents.ts
const SUGGESTED = 6; // events under "No events found"

// A small PNG for the cover image (64 x 36, orange)
const COVER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAIAAAC2bqvFAAAAPElEQVR42u3PQQkAQAgAML0QFjW9v2shCFuD5XTFZS+OExAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQENj2AdjvAcrkh+esAAAAAElFTkSuQmCC',
  'base64',
);

interface NewEvent {
  title: string;
  category: string;
  location: string;
  startsInHours: number; // negative: already started
  lastsHours: number | null; // null: no end date
  status?: 'DRAFT' | 'FROZEN' | 'PUBLISHED'; // default PUBLISHED
  price?: number;
}

// Added to the seeded "Gala Opera Concert" (Classical & Opera, Ottawa, in 30 days) and "Jazz at the
// Atrium" (Concerts, Ottawa, in 45 days). Some titles are decoys for the search tests: "500 Voices
// Choir" would match "50%" and "Riverside Rock Night" would match "rock_n" if % and _ were wildcards.
const UPCOMING: NewEvent[] = [
  { title: 'Doors Open Now', category: 'Theater & Arts', location: 'Massey Hall, Toronto, ON', startsInHours: -1, lastsHours: 3 },
  { title: 'Started Without An End', category: 'Concerts', location: 'Bronson Centre, Ottawa, ON', startsInHours: -2, lastsHours: null },
  { title: 'Riverside Rock Night', category: 'Concerts', location: 'Bell Centre, Montreal, QC', startsInHours: 5 * 24, lastsHours: 3, price: 35 },
  { title: 'Stampede Rodeo Finals', category: 'Culture & Rodeo', location: 'Saddledome, Calgary, AB', startsInHours: 8 * 24, lastsHours: 4 },
  { title: '50% Off Comedy Gala', category: 'Theater & Arts', location: 'Massey Hall, Toronto, ON', startsInHours: 10 * 24, lastsHours: 2 },
  { title: '500 Voices Choir', category: 'Classical & Opera', location: 'Roy Thomson Hall, Toronto, ON', startsInHours: 12 * 24, lastsHours: 2 },
  { title: 'Rock_n_Roll Revival', category: 'Concerts', location: 'MTELUS, Montreal, QC', startsInHours: 14 * 24, lastsHours: 3 },
  { title: 'Web3 Builders Summit', category: 'Web3 & Tech', location: 'Shaw Centre, Ottawa, ON', startsInHours: 16 * 24, lastsHours: 8 },
  { title: 'Hockey Night Classic', category: 'Sports & Arenas', location: 'Canadian Tire Centre, Ottawa, ON', startsInHours: 18 * 24, lastsHours: 3 },
  { title: 'Electronic Sunrise', category: 'Electronic Music', location: 'New City Gas, Montreal, QC', startsInHours: 20 * 24, lastsHours: 6 },
];

// None of these belong on the Events page
const HIDDEN: NewEvent[] = [
  { title: 'Hidden Draft Show', category: 'Concerts', location: 'Bell Centre, Montreal, QC', startsInHours: 6 * 24, lastsHours: 3, status: 'DRAFT' },
  { title: 'Hidden Frozen Show', category: 'Concerts', location: 'Bell Centre, Montreal, QC', startsInHours: 7 * 24, lastsHours: 3, status: 'FROZEN' },
  { title: 'Hidden Ended Show', category: 'Concerts', location: 'Bell Centre, Montreal, QC', startsInHours: -30, lastsHours: 3 },
  // No end date: listed for 12 hours after the start, then treated as over
  { title: 'Hidden Long Started Show', category: 'Concerts', location: 'Bell Centre, Montreal, QC', startsInHours: -13, lastsHours: null },
];

// In the order the page lists them: by start date
const ALL_UPCOMING = [
  'Started Without An End',
  'Doors Open Now',
  'Riverside Rock Night',
  'Stampede Rodeo Finals',
  '50% Off Comedy Gala',
  '500 Voices Choir',
  'Rock_n_Roll Revival',
  'Web3 Builders Summit',
  'Hockey Night Classic',
  'Electronic Sunrise',
  seededEvents.gala.title,
  seededEvents.jazz.title,
];
const TOTAL = ALL_UPCOMING.length;

interface ApiEvents {
  events: Array<{ id: string; title: string; status?: string; start_date: string }>;
  total: number;
}

// Draft, cover image and ticket type in the API, configured on the contract, then published. These
// events only feed the list, so the contract gets just what publishing checks (configureEvent from
// the organizer's wallet); the event page tests set up the rest, in event-page.spec.ts.
async function addEvent(session: ApiSession, event: NewEvent) {
  const start = Date.now() + event.startsInHours * HOUR_MS;
  const created = await session.post<{ id: string }>('/api/events', {
    title: event.title,
    description: 'Created by an end-to-end test.',
    category: event.category,
    location: event.location,
    start_date: new Date(start).toISOString(),
    ...(event.lastsHours === null ? {} : { end_date: new Date(start + event.lastsHours * HOUR_MS).toISOString() }),
  });
  await session.post(`/api/events/${created.id}/ticket-types`, { name: 'General Admission', description: '', price: String(event.price ?? 20), supply: 100 });
  if (event.status === 'DRAFT') return created.id;

  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(COVER_PNG)], { type: 'image/png' }), 'cover.png');
  await session.post(`/api/events/${created.id}/freeze`, form);
  if (event.status === 'FROZEN') return created.id;

  // The contract wants a sales end in the future, even for the events that have already ended: the
  // list reads the dates from the API, not the contract. The chain's clock can run ahead of real time.
  const contractId = contractEventIdFor(created.id);
  const salesEnd = Math.max(Math.floor(Date.now() / 1000), await chain.chainNow()) + 60 * 24 * 60 * 60;
  const nft = chain.ticketNft(accounts.organizer);
  await (await nft.configureEvent(contractId, salesEnd, 1000, 20_000, 4)).wait();

  await session.post(`/api/events/${created.id}/publish`, { contract_event_id: contractId.toString() });
  return created.id;
}

// The stack goes back to the seeded state before the first test of this file on each project
// (desktop, phone), so the events are added once per project, by the first test that needs them.
let added: { project: string; ids: Promise<Record<string, string>> } | null = null;

test.beforeEach(async ({}, testInfo) => {
  if (added?.project !== testInfo.project.name) {
    added = {
      project: testInfo.project.name,
      ids: (async () => {
        const session = await ApiSession.signIn(accounts.organizer);
        const ids: Record<string, string> = {};
        for (const event of [...UPCOMING, ...HIDDEN]) ids[event.title] = await addEvent(session, event);
        return ids;
      })(),
    };
  }
  await added.ids;
});

const eventId = async (title: string) => (await added!.ids)[title];

// What the API lists for a search and category, in order
async function apiTitles({ q = '', category = '' } = {}) {
  const params = new URLSearchParams({ page: '1', limit: '50' });
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  const result = await apiGet<ApiEvents>(`/api/events?${params}`);
  return result.events.map((event) => event.title);
}

const main = (page: Page) => page.getByRole('main');
const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Search events, venues or cities' });
const chip = (page: Page, name: string | RegExp) => page.getByRole('region', { name: 'Find events' }).getByRole('button', { name });
const categoryList = (page: Page) => page.getByRole('combobox', { name: 'Category' });
const banner = (page: Page) => page.getByRole('complementary', { name: 'Want to host an event?' });
const loadMore = (page: Page) => main(page).getByRole('button', { name: 'Load more events' });

// The event cards of the main list (or of `within`), as links
const cards = (scope: Page | Locator) => ('goto' in scope ? main(scope) : scope).getByRole('listitem').getByRole('link');
const card = (page: Page, title: string) => cards(page).filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const cardTitles = (scope: Page | Locator) => cards(scope).getByRole('heading').allTextContents();

async function expectTitles(page: Page, titles: string[]) {
  await expect.poll(() => cardTitles(page), { message: 'the events listed on the page' }).toEqual(titles);
}

// The page waits a moment after the last key press before it searches
async function search(page: Page, text: string) {
  await searchBox(page).fill(text);
}

async function openEvents(page: Page, query = '') {
  await page.goto(`/${query}`);
  await expect(page.getByRole('status', { name: 'Loading events' })).toHaveCount(0);
}

async function showAll(page: Page) {
  await openEvents(page);
  await loadMore(page).click();
  await expect(cards(page)).toHaveCount(TOTAL);
}

test.describe('which events are listed', () => {
  test('only published events that have not ended, soonest first', async ({ page }) => {
    await showAll(page);

    await expectTitles(page, ALL_UPCOMING);
    for (const hidden of HIDDEN) await expect(main(page).getByText(hidden.title)).toHaveCount(0);
    await expect(main(page).getByText(`Showing ${TOTAL} of ${TOTAL} upcoming events`)).toBeVisible();

    // The API agrees, and the hidden ones really exist
    expect(await apiTitles()).toEqual(ALL_UPCOMING);
    const mine = await (await ApiSession.signIn(accounts.organizer)).get<Array<{ title: string; status: string }>>('/api/events/mine');
    const statusOf = (title: string) => mine.find((event) => event.title === title)?.status;
    expect(statusOf('Hidden Draft Show')).toBe('DRAFT');
    expect(statusOf('Hidden Frozen Show')).toBe('FROZEN');
    expect(statusOf('Hidden Ended Show')).toBe('PUBLISHED');
    expect(statusOf('Hidden Long Started Show')).toBe('PUBLISHED');
    // Past events are still there for the pages that ask for them (My Tickets)
    const withPast = await apiGet<ApiEvents>('/api/events?include_past=true&limit=50');
    expect(withPast.events.map((event) => event.title)).toEqual(expect.arrayContaining(['Hidden Ended Show', 'Hidden Long Started Show']));
    expect(withPast.total).toBe(TOTAL + 2);
  });

  test('a card shows the category, title, date in the viewer\'s time zone, venue and starting price', async ({ page }, testInfo) => {
    await openEvents(page);
    const rock = card(page, 'Riverside Rock Night');
    const api = (await apiGet<ApiEvents>('/api/events?q=Riverside')).events[0];
    const date = new Date(api.start_date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: testInfo.project.use.timezoneId,
    });

    await expect(rock.getByText('Concerts', { exact: true })).toBeVisible();
    await expect(rock.getByText(date)).toBeVisible();
    await expect(rock.getByText('Bell Centre, Montreal, QC')).toBeVisible();
    await expect(rock.getByText('Starting from')).toBeVisible();
    await expect(rock.getByText('35.00 USDC')).toBeVisible();
    await expect(rock.getByText('View tickets')).toBeVisible();

    // The seeded Gala's cheapest type is Early Bird at 10 USDC, even though it is sold out
    await search(page, 'gala opera');
    await expect(card(page, seededEvents.gala.title).getByText('10.00 USDC')).toBeVisible();
  });
});

test.describe('loading, empty and "load more"', () => {
  test('placeholders show while the events load', async ({ page }) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(`${API_URL}/api/events?*`, async (route) => {
      await held;
      await route.fallback();
    });

    await page.goto('/');
    await expect(page.getByRole('status', { name: 'Loading events' })).toBeVisible();
    await expect(cards(page)).toHaveCount(0);

    release();
    await expect(page.getByRole('status', { name: 'Loading events' })).toHaveCount(0);
    await expect(cards(page)).toHaveCount(PAGE_SIZE);
  });

  // The seeded state always has events, so the API's answer is replaced with an empty list here
  test('with no upcoming events the page says so', async ({ page }) => {
    await page.route(`${API_URL}/api/events?*`, (route) =>
      route.fulfill({
        json: { events: [], total: 0, page: 1, limit: PAGE_SIZE },
        headers: { 'access-control-allow-origin': WEB_URL, 'access-control-allow-credentials': 'true' },
      }),
    );
    await openEvents(page);

    await expect(main(page).getByRole('heading', { name: 'No upcoming events' })).toBeVisible();
    await expect(main(page).getByText('There are no events on sale right now. Check back soon.')).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expect(loadMore(page)).toHaveCount(0);
  });

  test('the events can\'t be loaded: an error with "Try again"', async ({ page }) => {
    let failing = true;
    await page.route(`${API_URL}/api/events?*`, (route) => (failing ? route.abort() : route.fallback()));
    await page.goto('/');

    await expect(main(page).getByRole('heading', { name: "Couldn't load events" })).toBeVisible();
    await expect(main(page).getByRole('alert')).toHaveText('Something went wrong while loading events. Check your connection and try again.');

    failing = false;
    await main(page).getByRole('button', { name: 'Try again' }).click();
    await expect(cards(page)).toHaveCount(PAGE_SIZE);
  });

  test('"Load more events" adds the next events and goes away at the end', async ({ page }) => {
    await openEvents(page);

    await expectTitles(page, ALL_UPCOMING.slice(0, PAGE_SIZE));
    await expect(main(page).getByText(`Showing ${PAGE_SIZE} of ${TOTAL} upcoming events`)).toBeVisible();

    await loadMore(page).click();
    await expectTitles(page, ALL_UPCOMING);
    await expect(main(page).getByText(`Showing ${TOTAL} of ${TOTAL} upcoming events`)).toBeVisible();
    await expect(loadMore(page)).toHaveCount(0);
  });

  test('loading more fails: the events shown stay and it can be tried again', async ({ page }) => {
    await openEvents(page);
    let failing = true;
    await page.route(`${API_URL}/api/events?*`, (route) => (failing ? route.abort() : route.fallback()));

    await loadMore(page).click();
    await expect(main(page).getByText("Couldn't load more events")).toBeVisible();
    await expect(cards(page)).toHaveCount(PAGE_SIZE);

    failing = false;
    await main(page).getByRole('button', { name: 'Try again' }).click();
    await expect(cards(page)).toHaveCount(TOTAL);
    await expect(main(page).getByText("Couldn't load more events")).toHaveCount(0);
  });
});

test.describe('search (#320)', () => {
  test('by title, venue and city, in any letter case', async ({ page }) => {
    await openEvents(page);

    await search(page, 'rodeo finals'); // title
    await expectTitles(page, ['Stampede Rodeo Finals']);
    await expect(main(page).getByText('Showing 1 of 1 matching event')).toBeVisible();

    await search(page, 'SADDLEDOME'); // venue
    await expectTitles(page, ['Stampede Rodeo Finals']);

    await search(page, 'mOnTrEaL'); // city
    const montreal = ['Riverside Rock Night', 'Rock_n_Roll Revival', 'Electronic Sunrise'];
    await expectTitles(page, montreal);
    await expect(main(page).getByText('Showing 3 of 3 matching events')).toBeVisible();
    expect(await apiTitles({ q: 'mOnTrEaL' })).toEqual(montreal);
    // The hidden events are in Montreal too, and stay hidden
    expect(HIDDEN.every((event) => event.location.includes('Montreal'))).toBe(true);

    // Spaces around the text don't matter
    await search(page, '   calgary  ');
    await expectTitles(page, ['Stampede Rodeo Finals']);
  });

  test('% and _ are searched as typed, not as wildcards', async ({ page }) => {
    await openEvents(page);

    await search(page, '50%');
    await expectTitles(page, ['50% Off Comedy Gala']); // not "500 Voices Choir"
    expect(await apiTitles({ q: '50%' })).toEqual(['50% Off Comedy Gala']);

    await search(page, 'rock_n');
    await expectTitles(page, ['Rock_n_Roll Revival']); // not "Riverside Rock Night"
    expect(await apiTitles({ q: 'rock_n' })).toEqual(['Rock_n_Roll Revival']);

    await search(page, '%');
    await expectTitles(page, ['50% Off Comedy Gala']);
    await search(page, '_');
    await expectTitles(page, ['Rock_n_Roll Revival']);
  });

  test('no results: a message, other upcoming events, and a way back to everything', async ({ page }) => {
    await openEvents(page);
    await search(page, 'no such event anywhere');

    const message = main(page).getByRole('status').filter({ hasText: 'No events found' });
    await expect(message.getByRole('heading', { name: 'No events found' })).toBeVisible();
    await expect(message).toContainText('We couldn\'t find any events matching your search "no such event anywhere".');
    expect(await apiTitles({ q: 'no such event anywhere' })).toEqual([]);

    // Something to browse instead: the next upcoming events
    const others = main(page).getByRole('region', { name: 'Other upcoming events' });
    await expect.poll(() => cardTitles(others)).toEqual(ALL_UPCOMING.slice(0, SUGGESTED));

    await message.getByRole('button', { name: 'Clear filters & view all' }).click();
    await expect(searchBox(page)).toHaveValue('');
    await expectTitles(page, ALL_UPCOMING.slice(0, PAGE_SIZE));
    await expect(page).toHaveURL(`${WEB_URL}/`);
    await expect(main(page).getByRole('heading', { name: 'No events found' })).toHaveCount(0);
  });

  test('clearing the search box brings every event back', async ({ page }) => {
    await openEvents(page);
    await search(page, 'calgary');
    await expectTitles(page, ['Stampede Rodeo Finals']);
    await expect(page).toHaveURL(`${WEB_URL}/?q=calgary`);

    await search(page, '');
    await expectTitles(page, ALL_UPCOMING.slice(0, PAGE_SIZE));
    await expect(page).toHaveURL(`${WEB_URL}/`);
    await expect(main(page).getByText(`Showing ${PAGE_SIZE} of ${TOTAL} upcoming events`)).toBeVisible();
  });

  test('the search box takes 100 characters at most', async ({ page }) => {
    await openEvents(page);
    await expect(searchBox(page)).toHaveAttribute('maxlength', '100');
    // A longer search in a link is cut to what the API accepts
    await openEvents(page, `?q=${'a'.repeat(150)}`);
    await expect(searchBox(page)).toHaveValue('a'.repeat(100));
    await expect(main(page).getByRole('heading', { name: 'No events found' })).toBeVisible();
  });
});

test.describe('category filters (#320)', () => {
  const concerts = ['Started Without An End', 'Riverside Rock Night', 'Rock_n_Roll Revival', seededEvents.jazz.title];

  test('the chips and the category list set the same filter', async ({ page }) => {
    await openEvents(page);
    await expect(chip(page, `All events (${TOTAL})`)).toHaveAttribute('aria-pressed', 'true');
    // The chips are the first four categories; the list has all seven
    for (const name of ['Concerts', 'Theater & Arts', 'Sports & Arenas', 'Web3 & Tech']) await expect(chip(page, name)).toBeVisible();
    await expect(categoryList(page).getByRole('option')).toHaveText([
      'All categories',
      'Concerts',
      'Theater & Arts',
      'Sports & Arenas',
      'Web3 & Tech',
      'Classical & Opera',
      'Electronic Music',
      'Culture & Rodeo',
    ]);

    // A chip
    await chip(page, 'Concerts').click();
    await expectTitles(page, concerts);
    expect(await apiTitles({ category: 'Concerts' })).toEqual(concerts);
    await expect(chip(page, 'Concerts')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, /^All events/)).toHaveAttribute('aria-pressed', 'false');
    await expect(categoryList(page)).toHaveValue('Concerts');
    await expect(main(page).getByText('Showing 4 of 4 matching events')).toBeVisible();

    // The list, with a category that has no chip
    await categoryList(page).selectOption('Culture & Rodeo');
    await expectTitles(page, ['Stampede Rodeo Finals']);
    await expect(chip(page, 'Concerts')).toHaveAttribute('aria-pressed', 'false');
    await expect(chip(page, /^All events/)).toHaveAttribute('aria-pressed', 'false');

    // The list, with a category that has a chip
    await categoryList(page).selectOption('Web3 & Tech');
    await expectTitles(page, ['Web3 Builders Summit']);
    await expect(chip(page, 'Web3 & Tech')).toHaveAttribute('aria-pressed', 'true');

    // Back to everything, from the chip and from the list
    await chip(page, /^All events/).click();
    await expect(categoryList(page)).toHaveValue('');
    await expectTitles(page, ALL_UPCOMING.slice(0, PAGE_SIZE));
    await chip(page, 'Concerts').click();
    await categoryList(page).selectOption('');
    await expect(chip(page, /^All events/)).toHaveAttribute('aria-pressed', 'true');
    await expectTitles(page, ALL_UPCOMING.slice(0, PAGE_SIZE));
  });

  test('a category and a search narrow the list together', async ({ page }) => {
    await openEvents(page);
    await chip(page, 'Concerts').click();
    await search(page, 'montreal');

    const both = ['Riverside Rock Night', 'Rock_n_Roll Revival'];
    await expectTitles(page, both);
    expect(await apiTitles({ q: 'montreal', category: 'Concerts' })).toEqual(both);
    // "All events" counts the search in every category
    await expect(chip(page, 'All events (3)')).toBeVisible();

    // Changing the category keeps the search
    await categoryList(page).selectOption('Electronic Music');
    await expectTitles(page, ['Electronic Sunrise']);
    await expect(searchBox(page)).toHaveValue('montreal');

    // Nothing in this category for this search
    await chip(page, 'Sports & Arenas').click();
    const message = main(page).getByRole('status').filter({ hasText: 'No events found' });
    await expect(message).toContainText('We couldn\'t find any Sports & Arenas events matching your search "montreal".');

    // Dropping the category keeps the search
    await chip(page, 'All events (3)').click();
    await expectTitles(page, ['Riverside Rock Night', 'Rock_n_Roll Revival', 'Electronic Sunrise']);
  });
});

test.describe('filters stay in the link (#320)', () => {
  const link = `${WEB_URL}/?q=montreal&category=Concerts`;
  const filtered = ['Riverside Rock Night', 'Rock_n_Roll Revival'];

  async function expectFiltered(page: Page) {
    await expectTitles(page, filtered);
    await expect(searchBox(page)).toHaveValue('montreal');
    await expect(categoryList(page)).toHaveValue('Concerts');
    await expect(chip(page, 'Concerts')).toHaveAttribute('aria-pressed', 'true');
  }

  test('the link follows the filters, and a refresh keeps them', async ({ page }) => {
    await openEvents(page);
    await search(page, 'montreal');
    await expect(page).toHaveURL(`${WEB_URL}/?q=montreal`);
    await chip(page, 'Concerts').click();
    await expect(page).toHaveURL(link);

    await page.reload();
    await expectFiltered(page);
    await expect(page).toHaveURL(link);
  });

  test('a shared link opens with its filters', async ({ browser, baseURL }, testInfo) => {
    // Someone else, in their own browser
    const { viewport, isMobile, hasTouch, deviceScaleFactor, timezoneId, locale } = testInfo.project.use;
    const context = await browser.newContext({ baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, timezoneId, locale });
    const page = await context.newPage();
    await page.goto(link);
    await expectFiltered(page);
    // "All events" still knows how many events match the search in every category
    await expect(chip(page, 'All events (3)')).toBeVisible();

    // A category that doesn't exist is ignored
    await page.goto(`${WEB_URL}/?category=Karaoke&q=calgary`);
    await expectTitles(page, ['Stampede Rodeo Finals']);
    await expect(categoryList(page)).toHaveValue('');
    await context.close();
  });

  test('Back from an event returns to the filtered list, and Forward to the event', async ({ page }) => {
    await openEvents(page);
    await search(page, 'montreal');
    await chip(page, 'Concerts').click();
    await expectFiltered(page);

    await card(page, 'Rock_n_Roll Revival').click();
    await expect(page).toHaveURL(`${WEB_URL}/events/${await eventId('Rock_n_Roll Revival')}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Rock_n_Roll Revival' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(link);
    await expectFiltered(page);

    await page.goForward();
    await expect(page.getByRole('heading', { level: 1, name: 'Rock_n_Roll Revival' })).toBeVisible();
  });

  // The search reaches the link after a short pause. A link clicked during it, in the list or not,
  // must still open its page, and Back must bring the search back (#387). Both links are on screen
  // when the page opens, so the click doesn't wait for a scroll.
  const LINKS: Array<{ name: string; click: (page: Page) => Promise<void>; opens: string; shows: (page: Page) => Locator }> = [
    {
      name: 'an event card',
      click: async (page) => card(page, 'Started Without An End').click(),
      opens: 'Started Without An End',
      shows: (page) => page.getByRole('heading', { level: 1, name: 'Started Without An End' }),
    },
    {
      name: "the navbar's Marketplace link",
      click: async (page) => {
        await openMenuIfPhone(page);
        await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Marketplace', exact: true }).click();
      },
      opens: '/marketplace',
      shows: (page) => page.getByRole('heading', { level: 1, name: 'Marketplace' }),
    },
  ];

  for (const { name, click, opens, shows } of LINKS) {
    test(`${name} clicked right after typing opens its page, and Back returns to the search`, async ({ page }) => {
      // Like on a slow connection: links aren't prefetched and the next page answers slowly, so the
      // click is still on its way when the search's pause ends
      await page.route(`${WEB_URL}/**`, async (route) => {
        const headers = route.request().headers();
        if (headers['next-router-prefetch']) return route.abort();
        if (headers['rsc']) await new Promise((resolve) => setTimeout(resolve, 800));
        await route.continue();
      });
      await openEvents(page);

      await search(page, 'ottawa');
      await click(page);
      const path = opens.startsWith('/') ? opens : `/events/${await eventId(opens)}`;
      await expect(page).toHaveURL(`${WEB_URL}${path}`);
      await expect(shows(page)).toBeVisible();

      await page.goBack();
      await expect(page).toHaveURL(`${WEB_URL}/?q=ottawa`);
      await expect(searchBox(page)).toHaveValue('ottawa');
    });
  }
});

test.describe('"Want to host an event?" banner (#320)', () => {
  const requestAccess = (page: Page) => banner(page).getByRole('link', { name: 'Request access' });

  // The attendee's organizer request, as the banner reads it
  const requestRead = (page: Page) =>
    page.waitForResponse((r) => new URL(r.url()).pathname === '/api/users/me/organizer-request' && r.request().method() === 'GET');

  // The banner waits for the signed-in user (loaded when signIn returns) and, for an attendee, their
  // organizer request. Pass `loaded` (from requestRead) to check once that request has been read.
  async function expectNoBanner(page: Page, loaded?: Promise<unknown>) {
    await expect(cards(page).first()).toBeVisible();
    if (loaded) {
      await loaded;
      // two frames: the page has drawn what the answer changed
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    }
    await expect(banner(page)).toHaveCount(0);
  }

  test('a signed-out visitor is sent to sign up', async ({ page }) => {
    await openEvents(page);
    await expect(banner(page).getByText('Request organizer access to list your events')).toBeVisible();
    await expect(requestAccess(page)).toHaveAttribute('href', '/signup');

    await requestAccess(page).click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test('an attendee is sent to the organizer request on their profile', async ({ page, signIn }) => {
    await signIn('attendee');
    await expect(requestAccess(page)).toHaveAttribute('href', '/profile');

    await requestAccess(page).click();
    await expect(page).toHaveURL(`${WEB_URL}/profile`);
  });

  test('an attendee whose request is pending doesn\'t see it; after a rejection it is back', async ({ page, signIn }) => {
    const jordan = await ApiSession.signIn(accounts.jordan);
    const request = await jordan.post<{ id: string }>('/api/users/me/organizer-request', { organization_name: 'Jordan Presents', message: 'Small shows.' });

    const loaded = requestRead(page);
    await signIn(accounts.jordan);
    await expectNoBanner(page, loaded);

    const admin = await ApiSession.signIn(accounts.admin);
    await admin.post(`/api/admin/organizer-requests/${request.id}/reject`, { reason: 'Not enough details.' });
    await page.reload();
    await expect(requestAccess(page)).toHaveAttribute('href', '/profile');
  });

  for (const role of ['organizer', 'admin', 'scanner'] as const) {
    test(`${role === 'admin' ? 'an admin' : `${role === 'organizer' ? 'an' : 'a'} ${role}`} doesn't see it`, async ({ page, signIn }) => {
      await signIn(role);
      await expectNoBanner(page);
    });
  }
});

test.describe('event cards', () => {
  test('every card links to its own event', async ({ page }) => {
    await showAll(page);
    const listed = (await apiGet<ApiEvents>('/api/events?limit=50')).events;

    for (const event of listed) {
      await expect(card(page, event.title), event.title).toHaveAttribute('href', `/events/${event.id}`);
    }
  });

  test('clicking a card, or opening it with the keyboard, shows that event', async ({ page }) => {
    await showAll(page);
    await card(page, seededEvents.gala.title).click();
    await expect(page).toHaveURL(`${WEB_URL}/events/${seededEvents.gala.apiId}`);
    await expect(page.getByRole('heading', { level: 1, name: seededEvents.gala.title })).toBeVisible();

    // "Back to events", then the keyboard
    await main(page).getByRole('link', { name: 'Back to events' }).click();
    await expect(page).toHaveURL(`${WEB_URL}/`);
    await card(page, 'Stampede Rodeo Finals').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`${WEB_URL}/events/${await eventId('Stampede Rodeo Finals')}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Stampede Rodeo Finals' })).toBeVisible();
  });

  test('nothing on the page scrolls sideways', async ({ page }) => {
    await showAll(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
});
