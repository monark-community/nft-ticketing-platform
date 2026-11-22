// What applies to every page (#349), part 3: the keyboard, an accessibility scan and long content.
//   Keyboard only through the main flows: every stop shows where the focus is, popups keep the
//   focus inside, Escape closes them and the focus goes back to what opened them.
//   axe on every page: no serious or critical issues.
//   Long titles, venues and ticket type names, a big supply and a 6-decimal price fit on every page
//   that shows them.
// Parts 1 and 2 are every-page.spec.ts and wallet-and-outages.spec.ts.

import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';

import { accounts, ApiSession, chain, createPublishedEvent, expect, newWallet, seededEvents, test, waitForSync, WALLET_NAME, type Account, type PublishedEvent, type Role } from '../fixtures/index.js';
import { API_URL } from '../stack/config.mjs';

// --- Helpers -------------------------------------------------------------------------------------

const GALA = seededEvents.gala;
const CAMERA = "Point the camera at the attendee's QR code";
const ADMIN_INTRO = 'Review organizer requests, manage organizer access and see all events.';

const main = (page: Page) => page.getByRole('main');
const heading = (page: Page, name: string | RegExp) =>
  main(page).getByRole('heading', typeof name === 'string' ? { name, exact: true } : { name });
const availability = (page: Page) => main(page).getByText(/^[\d,]+ of [\d,]+ tickets left$/);
const summary = (page: Page) => main(page).getByRole('region', { name: 'Order Summary' });
const summaryRow = (page: Page, label: string) => summary(page).getByText(label, { exact: true }).locator('..');
const buyButton = (page: Page) => summary(page).getByRole('button', { name: /^Buy tickets/ });
const sellDialog = (page: Page) => page.getByRole('dialog', { name: 'Sell a ticket' });

/** A new wallet with a finished account, ETH for gas and some USDC */
async function createBuyer(index: number, usdc = 200): Promise<Account> {
  const buyer = newWallet(index);
  const session = await ApiSession.signIn(buyer);
  await session.put('/api/users/me', { first_name: 'Buyer', last_name: `E2E ${index}`, email: `buyer.${index}@example.com` });
  await chain.setEth(buyer.address, 10);
  await chain.giveUsdc(buyer.address, usdc);
  return buyer;
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${new URL(page.url()).pathname} scrolls sideways`).toBeLessThanOrEqual(0);
}

// --- Focus ---------------------------------------------------------------------------------------

/**
 * Where the focus is, and whether it shows: an outline, or a ring (a box-shadow with a spread, the
 * way Tailwind draws focus-visible:ring) on the focused element or one of its two closest parents
 * (a label or card can draw it for what's inside).
 */
async function focusShows(page: Page): Promise<{ label: string; shows: boolean }> {
  return page.evaluate(async () => {
    // With reduced motion, every style change runs as a 0.01 ms transition: read once it's over
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { label: 'the page', shows: true };
    const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50);
    const label = `<${el.tagName.toLowerCase()}> "${name}"`;
    // TODO(#419): Tab stops on the calendar button inside a date field, and the field loses its ring
    if (el instanceof HTMLInputElement && ['date', 'datetime-local', 'time'].includes(el.type) && !el.matches(':focus-visible')) return { label, shows: true };
    const seen = (color: string) => color !== 'transparent' && !/^rgba\([^,]+,[^,]+,[^,]+,\s*0\)$/.test(color) && !/\/\s*0\)$/.test(color);
    const ring = /((?:rgba?|oklch|oklab|lab|lch|color)\([^)]*\))\s+0px 0px 0px (\d+(?:\.\d+)?)px/g;
    let node: HTMLElement | null = el;
    for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 && seen(style.outlineColor)) return { label, shows: true };
      for (const [, color, spread] of style.boxShadow.matchAll(ring)) {
        if (parseFloat(spread) > 0 && seen(color)) return { label, shows: true };
      }
    }
    return { label, shows: false };
  });
}

/** The focus shows within a moment (some rings fade in) */
async function expectFocusShows(page: Page) {
  await expect
    .poll(async () => {
      const focus = await focusShows(page);
      return focus.shows ? '' : `no visible focus on ${focus.label}`;
    }, { timeout: 1_000 })
    .toBe('');
}

/** Presses Tab until `target` has the focus; every stop on the way must show where the focus is */
async function tabTo(page: Page, target: Locator, { checkFocus = true, max = 80 } = {}) {
  const handle = await target.elementHandle();
  if (!handle) throw new Error(`${target} isn't on the page`);
  for (let presses = 0; presses < max; presses++) {
    await page.keyboard.press('Tab');
    if (checkFocus) await expectFocusShows(page);
    if (await handle.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`Tab didn't reach ${target} in ${max} presses`);
}

/** Tab and Shift+Tab go round inside the popup, showing where the focus is at every stop */
async function expectFocusStaysIn(page: Page, popup: Locator, { checkFocus = true, presses = 10 } = {}) {
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < presses; i++) {
      await page.keyboard.press(key);
      const focus = await focusShows(page);
      expect(await popup.evaluate((el) => el.contains(document.activeElement)), `${key} left the popup (now on ${focus.label})`).toBe(true);
      if (checkFocus) await expectFocusShows(page);
    }
  }
}

// --- Keyboard only -------------------------------------------------------------------------------

test.describe('keyboard only', () => {
  test('signing in: the wallet list keeps the focus inside, Escape closes it, and the test wallet signs in', async ({ page, wallet }) => {
    await wallet.use(accounts.alex);
    await page.goto('/signup');
    const connect = main(page).getByRole('button', { name: 'Connect wallet' });
    await tabTo(page, connect);
    await page.keyboard.press('Enter');
    const walletList = page.getByRole('dialog');
    await expect(walletList).toBeVisible();
    // RainbowKit's wallet list draws its own focus
    await expectFocusStaysIn(page, walletList, { checkFocus: false });
    await page.keyboard.press('Escape');
    await expect(walletList).toBeHidden();

    if (!(await connect.evaluate((el) => el === document.activeElement))) await tabTo(page, connect);
    await page.keyboard.press('Enter');
    await tabTo(page, walletList.getByRole('button', { name: WALLET_NAME }), { checkFocus: false });
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await page.context().cookies(API_URL)).some((cookie) => cookie.name === 'token'), { timeout: 20_000 })
      .toBe(true);
    await expect(heading(page, 'Upcoming events')).toBeVisible();
  });

  test('buying tickets', async ({ page, signIn }) => {
    const event = await createPublishedEvent({ title: 'Keyboard Purchase' }); // General Admission, 20 USDC
    // A fresh page load, so the first Tab doesn't land while the page is still arriving
    await signIn(accounts.jordan);
    await page.goto(`/events/${event.apiId}`);
    await expect(buyButton(page)).toBeEnabled();

    await tabTo(page, main(page).getByRole('button', { name: 'Increase general admission tickets' }));
    await page.keyboard.press('Enter');
    await tabTo(page, buyButton(page));
    await expect(buyButton(page)).toContainText('40.00 USDC');
    await page.keyboard.press('Enter');

    await expect(summary(page).getByRole('status').filter({ hasText: "You're going!" })).toBeVisible({ timeout: 60_000 });
    const [, , sold] = (await chain.ticketNft().ticketTypes(event.contractId, 0)) as [bigint, bigint, bigint];
    expect(sold).toBe(2n);
  });

  test('selling a ticket: the Sell popup keeps the focus inside, lists it, and Escape closes it', async ({ page, signIn }) => {
    await signIn(accounts.alex, { path: '/marketplace' });
    const opener = main(page).getByRole('button', { name: 'Sell a ticket' }).first();
    await tabTo(page, opener);
    await page.keyboard.press('Enter');
    await expect(sellDialog(page)).toBeVisible();
    await expectFocusStaysIn(page, sellDialog(page));

    // Alex's General Admission ticket #1 (15 USDC face value)
    const option = sellDialog(page).getByRole('radio', { name: /Ticket #1(?!\d)/ });
    await tabTo(page, option);
    await page.keyboard.press('Space');
    await expect(option).toHaveAttribute('aria-checked', 'true');
    await expect(sellDialog(page).getByText("Reading this ticket's resale terms…")).toHaveCount(0);
    await tabTo(page, sellDialog(page).getByLabel('Set your price'));
    await page.keyboard.type('20');
    await tabTo(page, sellDialog(page).getByRole('button', { name: 'List ticket' }));
    await page.keyboard.press('Enter');
    await expect(sellDialog(page).getByRole('status').filter({ hasText: 'Listed for' })).toBeVisible({ timeout: 30_000 });

    await page.keyboard.press('Escape');
    await expect(sellDialog(page)).toBeHidden();
    await expect(opener).toBeFocused();
  });

  interface Popup {
    name: string;
    who: Account;
    path: string;
    setup?: () => Promise<void>;
    before?: (page: Page) => Promise<void>; // getting there with the mouse: not what's checked here
    opener: (page: Page) => Locator;
    popup: (page: Page) => Locator;
  }
  const POPUPS: Popup[] = [
    {
      name: 'the entry QR code',
      who: accounts.alex,
      path: '/my-tickets',
      opener: (page) => main(page).getByRole('button', { name: /Show entry QR/ }).first(),
      popup: (page) => page.getByRole('dialog'),
    },
    {
      name: 'Buy resale ticket',
      who: accounts.jordan,
      path: '/marketplace',
      // Alex lists his Early Bird ticket #2 (10 USDC face value)
      setup: async () => waitForSync((await chain.listTicket(accounts.alex, 2, 15)).block),
      opener: (page) => main(page).getByRole('button', { name: /^Buy ticket #2 to / }),
      popup: (page) => page.getByRole('dialog', { name: 'Buy resale ticket' }),
    },
    {
      name: 'Edit event settings',
      who: accounts.admin,
      path: '/admin',
      before: (page) => page.getByRole('tab', { name: /^Events\s*\d+$/ }).click(),
      opener: (page) => page.getByRole('button', { name: `Edit settings of ${GALA.title}`, exact: true }),
      popup: (page) => page.getByRole('dialog', { name: 'Edit event settings' }),
    },
  ];

  for (const row of POPUPS) {
    test(`${row.name}: opens with the keyboard, keeps the focus inside, and Escape closes it`, async ({ page, signIn }) => {
      await row.setup?.();
      await signIn(row.who, { path: row.path });
      await row.before?.(page);
      await tabTo(page, row.opener(page));
      await page.keyboard.press('Enter');
      await expect(row.popup(page)).toBeVisible();
      await expectFocusStaysIn(page, row.popup(page));

      await page.keyboard.press('Escape');
      await expect(row.popup(page)).toBeHidden();
      await expect(row.opener(page)).toBeFocused();
    });
  }

  test('the phone menu: opens with the keyboard, and Escape closes it with the focus back on its button', async ({ page }) => {
    test.skip(test.info().project.name !== 'phone', 'The menu is only on phones');
    await page.goto('/');
    await tabTo(page, page.getByRole('button', { name: 'Open menu' }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
  });
});

// --- Accessibility scan --------------------------------------------------------------------------

// Known issues, left out of the scan until they're fixed: the rule, the elements (their selector or
// HTML), the page when it's only on one, the issue
const KNOWN_AXE: Array<{ rule: string; target: RegExp; path?: string; issue: string }> = [
  // A sold-out ticket tier is dimmed with opacity, but it can still be selected
  { rule: 'color-contrast', target: /opacity-55|border-destructive/, issue: '#416' },
  // My Tickets' "Sell on Marketplace" link is named "Sell ticket #N to … on the Marketplace"
  { rule: 'label-content-name-mismatch', target: /marketplace\?sell=/, issue: '#417' },
  // Your own listing's "Edit" button is named "Change the price of your ticket #N" (same issue).
  // axe cuts long attributes to 20 characters, so only the start of the name is there
  { rule: 'label-content-name-mismatch', target: /Change the price of/, issue: '#417' },
  // On phones the tickets table scrolls sideways, but nothing in it can take the focus
  { rule: 'scrollable-region-focusable', target: /overflow-x-auto/, path: `/organizer/events/${GALA.apiId}`, issue: '#420' },
];

const AXE_PAGES: Array<{ path: string; who?: Role; shows: (page: Page) => Locator }> = [
  { path: '/', shows: (page) => heading(page, 'Upcoming events') },
  { path: `/events/${GALA.apiId}`, shows: (page) => availability(page) },
  { path: `/events/${GALA.apiId}`, who: 'attendee', shows: (page) => summaryRow(page, 'Wallet Limit').getByText('4 of 4', { exact: true }) },
  { path: '/marketplace', who: 'attendee', shows: (page) => heading(page, 'Marketplace') },
  { path: '/my-tickets', shows: (page) => heading(page, 'Connect your wallet') },
  { path: '/my-tickets', who: 'attendee', shows: (page) => heading(page, /^Upcoming · \d+$/) },
  { path: '/profile', who: 'attendee', shows: (page) => heading(page, 'Account details') },
  { path: '/organizer', who: 'attendee', shows: (page) => heading(page, 'Organizer access needed') },
  { path: '/organizer', who: 'organizer', shows: (page) => heading(page, 'My events') },
  { path: '/organizer/events/new', who: 'organizer', shows: (page) => heading(page, 'Create event') },
  { path: `/organizer/events/${GALA.apiId}`, who: 'organizer', shows: (page) => heading(page, GALA.title) },
  { path: '/scan', who: 'scanner', shows: (page) => main(page).getByText(CAMERA) },
  { path: '/admin', who: 'admin', shows: (page) => page.getByText(ADMIN_INTRO) },
  { path: '/signup', shows: (page) => heading(page, 'Sign in to NFTokenPass') },
  { path: '/no-such-page', shows: (page) => page.getByText('This page could not be found.') },
];

test.describe('accessibility scan (axe)', () => {
  for (const row of AXE_PAGES) {
    test(`${row.path} (${row.who ?? 'signed out'}): no serious or critical issues`, async ({ page, signIn }) => {
      if (row.who) await signIn(row.who, { path: row.path });
      else await page.goto(row.path);
      await expect(row.shows(page)).toBeVisible();

      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      const serious = violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        // Known issues are left out until they're fixed
        .map((v) => ({
          ...v,
          nodes: v.nodes.filter(
            (node) => !KNOWN_AXE.some((known) => known.rule === v.id && (!known.path || known.path === row.path) && known.target.test(`${node.target.join(' ')} ${node.html}`)),
          ),
        }))
        .filter((v) => v.nodes.length > 0);
      const described = serious.map((v) => {
        const where = v.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' | ');
        const more = v.nodes.length > 3 ? ` and ${v.nodes.length - 3} more` : '';
        return `${v.impact} · ${v.id}: ${v.help} (${where}${more})`;
      });
      expect(described).toEqual([]);
    });
  }
});

// --- Long content --------------------------------------------------------------------------------

const LONG = {
  title: 'The Extraordinarily Long International Festival of Chamber Music, Jazz Standards and Spoken Word #NFTokenPassLive2027', // 117 of 120 characters
  venue: 'Théâtre Maisonneuve, Place des Arts, 175 Rue Sainte-Catherine Ouest, Montréal, QC H2X 1Z8, Canada (entrance on Jeanne-Mance)',
  type: 'Platinum Patron Package with Backstage Access and Vinyl', // 55 of 60
  price: '12345.678901', // 6 decimals, like USDC
  supply: 1_000_000,
};

// Set up by the first test that needs it, after the stack's reset for this file (a beforeAll would
// run before the reset). A buyer holds one ticket and lists it at face value.
let longSetup: Promise<{ event: PublishedEvent; buyer: Account }> | undefined;
function longEvent() {
  longSetup ??= (async () => {
    const event = await createPublishedEvent({ title: LONG.title, location: LONG.venue, ticketTypes: [{ name: LONG.type, price: LONG.price, supply: LONG.supply }] });
    const buyer = await createBuyer(31, 20_000);
    const { tokenIds: [tokenId] } = await chain.buyTickets(buyer, { eventId: event.contractId });
    await waitForSync((await chain.listTicket(buyer, tokenId, LONG.price)).block);
    return { event, buyer };
  })();
  return longSetup;
}

/**
 * Every visible place `text` is shown fits: inside the screen (unless it's in a box that scrolls
 * sideways, like a table), inside its card, list item, row or popup, and not cut off without an
 * ellipsis. With `required`, it must be shown at least once.
 */
async function expectFits(page: Page, text: string | RegExp, { required = true } = {}) {
  const shown = page.getByText(text);
  if (required) await expect(shown.filter({ visible: true }).first(), `${text} isn't shown`).toBeVisible();
  const problems = await shown.evaluateAll((elements) =>
    elements.flatMap((el) => {
      const box = el.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) return []; // hidden, or only for screen readers
      const style = getComputedStyle(el);
      const what = `<${el.tagName.toLowerCase()}> "${(el.textContent ?? '').trim().slice(0, 40)}…"`;
      const found: string[] = [];
      let scrolls = false;
      for (let node = el.parentElement; node; node = node.parentElement) {
        if (['auto', 'scroll'].includes(getComputedStyle(node).overflowX)) scrolls = true;
      }
      if (!scrolls && (box.left < -1 || box.right > window.innerWidth + 1)) found.push(`${what} goes past the edge of the screen`);
      const card = el.parentElement?.closest('article, li, tr, [role="dialog"]');
      if (card) {
        const outer = card.getBoundingClientRect();
        if (box.left < outer.left - 1 || box.right > outer.right + 1) found.push(`${what} sticks out of its <${card.tagName.toLowerCase()}>`);
      }
      if (style.display !== 'inline' && style.overflowX !== 'visible' && style.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
        found.push(`${what} is cut off`);
      }
      return found;
    }),
  );
  expect(problems, `where "${text}" is shown`).toEqual([]);
}

type Viewer = 'visitor' | 'buyer' | 'organizer' | 'admin';
const LONG_PAGES: Array<{ name: string; path: (event: PublishedEvent) => string; who: Viewer; open?: (page: Page) => Promise<void> }> = [
  { name: 'the Events page', path: () => '/', who: 'visitor' },
  { name: 'the event page', path: (event) => `/events/${event.apiId}`, who: 'buyer' },
  { name: 'the Marketplace', path: () => '/marketplace', who: 'visitor' },
  {
    name: 'the Sell popup',
    path: () => '/marketplace',
    who: 'buyer',
    open: async (page) => {
      await main(page).getByRole('button', { name: 'Sell a ticket' }).first().click();
      await expect(sellDialog(page)).toBeVisible();
    },
  },
  { name: 'My Tickets', path: () => '/my-tickets', who: 'buyer' },
  {
    name: 'the entry QR code',
    path: () => '/my-tickets',
    who: 'buyer',
    open: async (page) => {
      await main(page).getByRole('article').filter({ hasText: LONG.title }).getByRole('button', { name: /Show entry QR/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
    },
  },
  { name: 'the organizer dashboard', path: () => '/organizer', who: 'organizer' },
  { name: "the organizer's event page", path: (event) => `/organizer/events/${event.apiId}`, who: 'organizer' },
  { name: "Admin's events", path: () => '/admin', who: 'admin', open: (page) => page.getByRole('tab', { name: /^Events\s*\d+$/ }).click() },
];

test.describe('long content', () => {
  for (const row of LONG_PAGES) {
    test(`${row.name}: long titles, venues and names, a big supply and a 6-decimal price fit`, async ({ page, signIn }) => {
      const { event, buyer } = await longEvent();
      const path = row.path(event);
      if (row.who === 'visitor') await page.goto(path);
      else await signIn(row.who === 'buyer' ? buyer : row.who === 'organizer' ? accounts.organizer : accounts.admin, { path });
      await row.open?.(page);

      await expectFits(page, LONG.title);
      for (const text of [LONG.venue, LONG.type, /12,345\.\d+/, '1,000,000']) await expectFits(page, text, { required: false });
      await expectNoSidewaysScroll(page);
    });
  }
});