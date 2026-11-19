// What applies to every page (#349), part 1: who can open each page and API route, "not found",
// nothing scrolling sideways and no console errors or failed requests on any page, Back and Forward
// with links opened in a new tab, and dates in another time zone. The wallet, outages, keyboard,
// accessibility scan and long content come in the next parts.

import type { Page } from '@playwright/test';

import {
  accounts,
  ALEX_EMAIL,
  ApiError,
  ApiSession,
  apiGet,
  chain,
  createPublishedEvent,
  expect,
  newWallet,
  openMenuIfPhone,
  seededEvents,
  test,
  waitForSync,
  type Account,
  type Role,
} from '../fixtures/index.js';
import { API_URL } from '../stack/config.mjs';

// --- Helpers -------------------------------------------------------------------------------------

type Who = 'visitor' | Role;
const WHO: Who[] = ['visitor', 'attendee', 'scanner', 'organizer', 'admin'];
const LABEL: Record<Who, string> = { visitor: 'a signed-out visitor', attendee: 'an attendee', scanner: 'a scanner wallet', organizer: 'an organizer', admin: 'the admin' };
const ACCOUNT: Record<Role, Account> = { attendee: accounts.alex, scanner: accounts.scanner, organizer: accounts.organizer, admin: accounts.admin };
const GALA = seededEvents.gala;
const DAY = 24 * 60 * 60 * 1000;

// What a page shows: a heading, or a line of text
type Shows = { heading: string | RegExp } | { text: string };
const heading = (name: string | RegExp): Shows => ({ heading: name });
const text = (value: string): Shows => ({ text: value });
const everyone = (shows: Shows): Record<Who, Shows> => ({ visitor: shows, attendee: shows, scanner: shows, organizer: shows, admin: shows });
const signedIn = (visitor: Shows, others: Shows): Record<Who, Shows> => ({ visitor, attendee: others, scanner: others, organizer: others, admin: others });
const landsOn = (visitor: string, others: string): Record<Who, string> => ({ visitor, attendee: others, scanner: others, organizer: others, admin: others });

const EVENTS = heading('Upcoming events');
const CAMERA = text("Point the camera at the attendee's QR code");
const NOT_ADMIN = text('Admin access required');
const organizerGate = (organizer: Shows): Record<Who, Shows> => ({
  visitor: heading('Sign in to continue'),
  attendee: heading('Organizer access needed'),
  scanner: heading('Organizer access needed'),
  organizer,
  admin: heading('Use an organizer account'),
});

interface PageRow {
  path: string;
  shows: Record<Who, Shows>;
  lands?: Record<Who, string>; // where the page sends each of them, when it isn't `path`
}

const PAGES: PageRow[] = [
  { path: '/', shows: everyone(EVENTS) },
  { path: '/events', lands: landsOn('/', '/'), shows: everyone(EVENTS) },
  { path: `/events/${GALA.apiId}`, shows: everyone(heading(GALA.title)) },
  { path: '/marketplace', shows: everyone(heading('Marketplace')) },
  {
    path: '/my-tickets',
    shows: { visitor: heading('Connect your wallet'), attendee: heading(/^Upcoming · \d+$/), scanner: heading('No tickets yet'), organizer: heading('No tickets yet'), admin: heading('No tickets yet') },
  },
  { path: '/profile', shows: signedIn(heading('Connect your wallet'), heading('Account details')) },
  { path: '/organizer', shows: organizerGate(heading('My events')) },
  { path: '/organizer/events/new', shows: organizerGate(heading('Create event')) },
  { path: '/create-event', lands: landsOn('/organizer/events/new', '/organizer/events/new'), shows: organizerGate(heading('Create event')) },
  {
    path: '/scan',
    shows: { visitor: heading('Connect the scanner wallet'), attendee: heading("This wallet can't scan tickets"), scanner: CAMERA, organizer: CAMERA, admin: CAMERA },
  },
  {
    path: '/admin',
    shows: { visitor: heading('Connect your admin wallet'), attendee: NOT_ADMIN, scanner: NOT_ADMIN, organizer: NOT_ADMIN, admin: text('Review organizer requests, manage organizer access and see all events.') },
  },
  { path: '/signup', lands: landsOn('/signup', '/'), shows: signedIn(heading('Sign in to NFTokenPass'), EVENTS) },
  { path: '/signin', lands: landsOn('/signup', '/'), shows: signedIn(heading('Sign in to NFTokenPass'), EVENTS) },
];

async function expectShows(page: Page, shows: Shows) {
  const target =
    'heading' in shows
      ? page.getByRole('heading', typeof shows.heading === 'string' ? { name: shows.heading, exact: true } : { name: shows.heading })
      : page.getByText(shows.text, { exact: true });
  await expect(target.first()).toBeVisible();
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${new URL(page.url()).pathname} scrolls sideways`).toBeLessThanOrEqual(0);
}

// Answers that are expected, so they're not reported as problems
function expected(url: string, status?: number): boolean {
  // Outside services the test stack doesn't run (WalletConnect's remote config, for example)
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) return true;
  const { pathname } = new URL(url);
  // TODO(#400): the footer links to /terms and /privacy, which don't exist yet (Next prefetches them)
  if (pathname === '/terms' || pathname === '/privacy') return true;
  // The API answers 404 when an account hasn't asked to become an organizer
  if (status === 404 && pathname === '/api/users/me/organizer-request') return true;
  return false;
}

/** Collects console errors and failed requests on the page from now on */
function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // The resource the error is about: the first address in the message (a CORS error names the
    // blocked one there and reports the page as its source), or else where the error comes from
    const url = /'(https?:\/\/[^']+)'/.exec(text)?.[1] ?? message.location().url;
    const status = Number(/status of (\d{3})/.exec(text)?.[1]) || undefined;
    if (url && expected(url, status)) return;
    problems.push(`console error: ${text} (${message.location().url || 'no url'})`);
  });
  page.on('requestfailed', (request) => {
    // Requests cut short by going to the next page aren't failures
    if (request.failure()?.errorText === 'net::ERR_ABORTED' || expected(request.url())) return;
    problems.push(`request failed: ${request.method()} ${request.url()} (${request.failure()?.errorText})`);
  });
  page.on('response', (response) => {
    if (response.status() < 400 || expected(response.url(), response.status())) return;
    problems.push(`${response.status()}: ${response.request().method()} ${response.url()}`);
  });
  return problems;
}

type Access = 'public' | 'signed-in' | 'organizer' | 'admin';
interface ApiRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown; // invalid on purpose where the call would change something: an allowed call then answers 400
  access: Access;
}

const E = `/api/events/${GALA.apiId}`;
const API_ROUTES: ApiRoute[] = [
  { method: 'GET', path: '/api/events', access: 'public' },
  { method: 'GET', path: E, access: 'public' },
  { method: 'GET', path: `${E}/ticket-types`, access: 'public' },
  { method: 'GET', path: `/api/tickets/owner/${accounts.alex.address}`, access: 'public' },
  { method: 'GET', path: '/api/tickets/0', access: 'public' },
  { method: 'GET', path: '/api/listings', access: 'public' },
  { method: 'GET', path: `/api/auth/nonce?wallet=${accounts.jordan.address}`, access: 'public' },
  { method: 'POST', path: '/api/auth/verify', body: {}, access: 'public' },

  { method: 'GET', path: '/api/users/me', access: 'signed-in' },
  { method: 'PUT', path: '/api/users/me', body: { email: 'not-an-email' }, access: 'signed-in' },
  { method: 'GET', path: '/api/tickets', access: 'signed-in' },
  { method: 'GET', path: '/api/users/me/organizer-request', access: 'signed-in' },
  { method: 'POST', path: '/api/users/me/organizer-request', body: { organization_name: 42 }, access: 'signed-in' },
  { method: 'POST', path: '/api/auth/logout', access: 'signed-in' },

  { method: 'GET', path: '/api/events/mine', access: 'organizer' },
  { method: 'POST', path: '/api/events', body: {}, access: 'organizer' },
  { method: 'PUT', path: E, body: { title: '' }, access: 'organizer' },
  { method: 'POST', path: `${E}/freeze`, body: {}, access: 'organizer' },
  { method: 'POST', path: `${E}/publish`, body: {}, access: 'organizer' },
  { method: 'POST', path: `${E}/ticket-types`, body: {}, access: 'organizer' },
  { method: 'GET', path: `${E}/scanners`, access: 'organizer' },
  { method: 'POST', path: `${E}/scanners`, body: {}, access: 'organizer' },
  { method: 'DELETE', path: `${E}/scanners/not-a-wallet`, access: 'organizer' },
  { method: 'GET', path: `${E}/whitelist`, access: 'organizer' },
  { method: 'POST', path: `${E}/whitelist`, body: {}, access: 'organizer' },
  { method: 'DELETE', path: `${E}/whitelist/not-a-wallet`, access: 'organizer' },
  { method: 'PUT', path: '/api/ticket-types/no-such-type', body: {}, access: 'organizer' },
  { method: 'DELETE', path: '/api/ticket-types/no-such-type', access: 'organizer' },

  { method: 'GET', path: '/api/admin/organizer-requests', access: 'admin' },
  { method: 'POST', path: '/api/admin/organizer-requests/no-such-request/reject', body: {}, access: 'admin' },
  { method: 'GET', path: '/api/admin/organizers', access: 'admin' },
  { method: 'POST', path: '/api/admin/organizers/not-a-wallet', body: {}, access: 'admin' },
  { method: 'DELETE', path: '/api/admin/organizers/not-a-wallet', access: 'admin' },
  { method: 'GET', path: '/api/admin/events', access: 'admin' },
];

function expectedStatus(access: Access, who: Who): 'allowed' | 401 | 403 {
  if (access === 'public') return 'allowed';
  if (who === 'visitor') return 401;
  if (access === 'signed-in') return 'allowed';
  if (access === 'organizer') return who === 'organizer' ? 'allowed' : 403; // admins included: they use an organizer account
  return who === 'admin' ? 'allowed' : 403;
}

async function statusOf(session: ApiSession | null, { method, path, body }: ApiRoute): Promise<number> {
  if (!session) {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return res.status;
  }
  try {
    await session.request(method, path, body);
    return 200;
  } catch (err) {
    if (err instanceof ApiError) return err.status;
    throw err;
  }
}

async function navLink(page: Page, name: string) {
  await openMenuIfPhone(page);
  return page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true });
}

// --- Access --------------------------------------------------------------------------------------

test.describe('every page', () => {
  for (const who of WHO) {
    test(`for ${LABEL[who]}: the right content or gate, nothing scrolls sideways, no console errors or failed requests`, async ({ page, signIn }) => {
      if (who !== 'visitor') await signIn(who, { path: '/' });
      const problems = watchProblems(page);

      for (const row of PAGES) {
        await test.step(row.path, async () => {
          await page.goto(row.path);
          const lands = row.lands?.[who] ?? row.path;
          await expect(page).toHaveURL((url) => url.pathname === lands);
          await expectShows(page, row.shows[who]);
          // A moment for late requests and console errors to show up ("networkidle" never comes here:
          // the wallet libraries keep a connection open)
          await page.waitForTimeout(1_000);
          await expectNoSidewaysScroll(page);
        });
      }
      expect(problems, 'console errors and failed requests').toEqual([]);
    });
  }
});

test.describe('every API route', () => {
  for (const who of WHO) {
    test(`for ${LABEL[who]}: allowed, or refused with 401 when signed out and 403 with the wrong role`, async () => {
      const session = who === 'visitor' ? null : await ApiSession.signIn(ACCOUNT[who]);
      for (const route of API_ROUTES) {
        // Public routes are the same for everyone: checked once, to stay under the API's rate limit
        if (route.access === 'public' && who !== 'visitor') continue;
        const status = await statusOf(session, route);
        const name = `${route.method} ${route.path}`;
        const wanted = expectedStatus(route.access, who);
        if (wanted === 'allowed') {
          expect.soft([401, 403], `${name} should be allowed`).not.toContain(status);
          expect.soft(status, `${name} should not fail`).toBeLessThan(500);
        } else {
          expect.soft(status, name).toBe(wanted);
        }
      }
    });
  }
});

test('unknown pages show the 404 page; unknown event and ticket IDs say "not found"', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('This page could not be found.')).toBeVisible();

  await page.goto('/events/no-such-event');
  await expect(page.getByRole('heading', { name: 'Event not found' })).toBeVisible();

  for (const [path, error] of [
    ['/api/events/no-such-event', 'Event not found'],
    ['/api/tickets/999999', 'Ticket not found'],
    ['/api/no-such-route', 'Not found'],
  ] as const) {
    const res = await page.request.get(`${API_URL}${path}`);
    expect(res.status(), path).toBe(404);
    expect((await res.json()).error, path).toBe(error);
  }
});

// --- Everywhere ----------------------------------------------------------------------------------

test('Back and Forward move between pages, and a link copied into a new tab opens the same page', async ({ page, context, signIn }) => {
  await signIn('attendee', { path: '/' });
  const marketplace = page.getByRole('heading', { name: 'Marketplace', exact: true });

  await (await navLink(page, 'Marketplace')).click();
  await expect(marketplace).toBeVisible();
  await (await navLink(page, 'My Tickets')).click();
  await expect(page.getByRole('heading', { name: /^Upcoming · \d+$/ })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === '/marketplace');
  await expect(marketplace).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === '/');
  await expect(page.getByRole('heading', { name: 'Upcoming events', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL((url) => url.pathname === '/marketplace');
  await expect(marketplace).toBeVisible();

  // Links opened in a new tab: the same page, still signed in
  const tab = await context.newPage();
  await tab.goto(`/events/${GALA.apiId}`);
  await expect(tab.getByRole('heading', { level: 1, name: GALA.title })).toBeVisible();
  await tab.goto('/my-tickets');
  await expect(tab.getByRole('heading', { name: /^Upcoming · \d+$/ })).toBeVisible();
  await tab.goto('/profile');
  await expect(tab.getByLabel('Email')).toHaveValue(ALEX_EMAIL);
  await tab.close();
});

test.describe('another time zone', () => {
  test.use({ timezoneId: 'Europe/Paris' });

  test("dates and times follow the viewer's time zone (Europe/Paris)", async ({ page, signIn }) => {
    // 02:30 UTC a month from now: the evening before in Toronto, the early morning in Paris
    const inAMonth = new Date(Date.now() + 30 * DAY);
    const startsAt = Date.UTC(inAMonth.getUTCFullYear(), inAMonth.getUTCMonth(), inAMonth.getUTCDate(), 2, 30);
    const event = await createPublishedEvent({ title: `Late Show ${Date.now().toString(36)}`, startsInDays: (startsAt - Date.now()) / DAY });
    const start = (await apiGet<{ start_date: string }>(`/api/events/${event.apiId}`)).start_date;
    const day = (timeZone: string) =>
      new Date(start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone });
    const time = (timeZone: string) => new Date(start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
    expect(day('Europe/Paris')).not.toBe(day('America/Toronto'));

    // A buyer with a ticket for it
    const buyer = newWallet(10);
    const session = await ApiSession.signIn(buyer);
    await session.put('/api/users/me', { first_name: 'Nora', last_name: 'Paris', email: 'nora.paris@example.com' });
    await chain.setEth(buyer.address, 10);
    await chain.giveUsdc(buyer.address, 100);
    await waitForSync((await chain.buyTickets(buyer, { eventId: event.contractId })).block);

    // The Events page
    await page.goto(`/?q=${encodeURIComponent(event.title)}`);
    await expect(page.getByRole('link', { name: new RegExp(event.title) }).first()).toContainText(day('Europe/Paris'));

    // My Tickets: the day and the doors time
    await signIn(buyer, { path: '/my-tickets' });
    await expect(page.getByRole('article').filter({ hasText: event.title })).toContainText(`${day('Europe/Paris')} · Doors ${time('Europe/Paris')}`);

    // The scanner's event picker (an organizer can scan their own events)
    await openMenuIfPhone(page);
    await page.getByRole('banner').getByRole('button', { name: 'Disconnect wallet' }).click();
    await signIn('organizer', { path: '/scan' });
    await expect(page.getByLabel("Event you're scanning for").locator('option', { hasText: event.title })).toHaveText(`${event.title} · ${day('Europe/Paris')}`);
  });
});