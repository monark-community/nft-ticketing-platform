// Creating and publishing an event (#342): who can open the flow, every field's rule on the four
// steps, drafts, and publishing with everything that can interrupt it.
//
// Most tests start from a draft made through the API (createDraft), so each one only goes through
// the screens it is about. The tests share the chain and the database, in order, so a test that
// takes a role or ETH away puts the stack back to the seeded state when it ends.

import type { Page } from '@playwright/test';
import { ethers } from 'ethers';

import {
  accounts,
  ApiError,
  ApiSession,
  chain,
  contractEventIdFor,
  createPublishedEvent,
  expect,
  resetStack,
  test,
  waitForSync,
  type Account,
  type TestWallet,
} from '../fixtures/index.js';
import { API_URL, SEPOLIA_CHAIN_ID, WEB_URL } from '../stack/config.mjs';

const NEW_EVENT = '/organizer/events/new';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ORGANIZER_ROLE = ethers.id('ORGANIZER_ROLE');
const VENUE = 'National Arts Centre, Ottawa, ON';

// A small PNG for the cover image (64 x 36, orange)
const COVER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAIAAAC2bqvFAAAAPElEQVR42u3PQQkAQAgAML0QFjW9v2shCFuD5XTFZS+OExAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQENj2AdjvAcrkh+esAAAAAElFTkSuQmCC',
  'base64',
);
const COVER = { name: 'cover.png', mimeType: 'image/png', buffer: COVER_PNG };

// ---------------------------------------------------------------------------------------------
// Helpers

const timeZone = () => test.info().project.use.timezoneId ?? 'America/Toronto';

// A date as a datetime-local input wants it ("2026-12-14T19:00"), in the browser's time zone
function localInput(ms: number): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: timeZone(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// The same moment, as the app writes it on the review step and the event page: "Sat, Mar 6, 2027"
const shortDate = (ms: number) => new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: timeZone() });

// A start time on the minute, like the date picker gives
const startIn = (days: number) => Math.floor((Date.now() + days * DAY) / 60_000) * 60_000;

interface TypeInput {
  name: string;
  price: number | string;
  supply: number | string;
  description?: string;
}

const GA: TypeInput = { name: 'General Admission', price: 20, supply: 100 };
const VIP: TypeInput = { name: 'VIP', price: 45.5, supply: 50 };

interface Draft {
  id: string;
  title: string;
  contractId: bigint;
  startsAt: number;
  session: ApiSession;
}

interface ApiEvent {
  id: string;
  status: 'DRAFT' | 'FROZEN' | 'PUBLISHED';
  title: string;
  description: string | null;
  category: string | null;
  location: string | null;
  start_date: string;
  end_date: string | null;
  image_url: string | null;
  contract_event_id: string | null;
  ticket_types: Array<{ name: string; price: string; supply: number; description: string | null; ipfs_hash: string | null }>;
}

// A draft or frozen event is only readable by its organizer (or an admin), so read as them
const apiEvent = async (id: string, as: Account = accounts.organizer) => (await ApiSession.signIn(as)).get<ApiEvent>(`/api/events/${id}`);

let draftCount = 0;

// A draft with its ticket types, made through the API like the form's own saves
async function createDraft(options: { organizer?: Account; title?: string; types?: TypeInput[]; startsInDays?: number } = {}): Promise<Draft> {
  const session = await ApiSession.signIn(options.organizer ?? accounts.organizer);
  draftCount += 1;
  const title = options.title ?? `Draft ${draftCount} ${Date.now().toString(36)}`;
  const startsAt = startIn(options.startsInDays ?? 30);
  const event = await session.post<{ id: string }>('/api/events', {
    title,
    description: 'Created by an end-to-end test.',
    category: 'Concerts',
    location: VENUE,
    start_date: new Date(startsAt).toISOString(),
    end_date: new Date(startsAt + 3 * HOUR).toISOString(),
  });
  for (const type of options.types ?? [GA]) {
    await session.post(`/api/events/${event.id}/ticket-types`, {
      name: type.name,
      description: type.description ?? '',
      price: String(type.price),
      supply: Number(type.supply),
    });
  }
  return { id: event.id, title, contractId: contractEventIdFor(event.id), startsAt, session };
}

const draftUrl = (id: string, step?: 'ticket-types' | 'sale-rules' | 'review') => `${NEW_EVENT}?draft=${id}${step ? `&step=${step}` : ''}`;

type SignIn = (who: Account | 'attendee' | 'organizer' | 'admin' | 'scanner', options?: { path?: string }) => Promise<void>;

const stepHeading = {
  details: (page: Page) => page.getByLabel('Event name'),
  types: (page: Page) => page.getByLabel('Ticket type 1', { exact: true }),
  rules: (page: Page) => page.getByLabel('Per-wallet limit'),
  review: (page: Page) => page.getByRole('list', { name: 'Publish steps' }),
};

async function next(page: Page, to: 'Ticket types' | 'Sale rules' | 'Review') {
  await page.getByRole('button', { name: `Next: ${to}` }).click();
  const shown = to === 'Ticket types' ? stepHeading.types : to === 'Sale rules' ? stepHeading.rules : stepHeading.review;
  await expect(shown(page)).toBeVisible();
}

// Signs in as the draft's organizer and opens it on the details step
async function openDraft(page: Page, signIn: SignIn, draft: Draft, who: Account | 'organizer' = 'organizer') {
  await signIn(who, { path: draftUrl(draft.id) });
  await expect(page.getByLabel('Event name')).toHaveValue(draft.title);
}

// The cover image only lives in the page until the event is frozen, so every run through the form
// picks it again
const pickCover = (page: Page) => page.getByLabel('Cover image').setInputFiles(COVER);

// Opens a draft and goes through the steps to "Review and publish", cover image picked
async function openAtReview(page: Page, signIn: SignIn, draft: Draft) {
  await openDraft(page, signIn, draft);
  await pickCover(page);
  await next(page, 'Ticket types');
  await next(page, 'Sale rules');
  await next(page, 'Review');
}

const ticketCard = (page: Page, n: number) => page.getByLabel(`Ticket type ${n}`, { exact: true });

async function fillTicketType(page: Page, n: number, type: Partial<TypeInput>) {
  const card = ticketCard(page, n);
  if (type.name !== undefined) await card.getByLabel('Name', { exact: true }).fill(type.name);
  if (type.price !== undefined) await card.getByLabel('Price (USDC)').fill(String(type.price));
  if (type.supply !== undefined) await card.getByLabel('Supply').fill(String(type.supply));
  if (type.description !== undefined) await card.getByLabel('Description').fill(type.description);
}

// The four rows of "What happens next", with each row's state
const publishRows = (page: Page) => page.getByRole('list', { name: 'Publish steps' }).getByRole('listitem');

type RowState = 'Ready' | 'Waiting' | 'In progress' | 'Done' | 'Failed';
async function expectRows(page: Page, states: [RowState, RowState, RowState, RowState]) {
  for (const [i, state] of states.entries()) await expect(publishRows(page).nth(i)).toContainText(state);
}

const publishButton = (page: Page) => page.getByRole('button', { name: 'Freeze and publish' });
const continueButton = (page: Page) => page.getByRole('button', { name: 'Continue publishing' });
const liveHeading = (page: Page) => page.getByRole('heading', { name: 'Your event is live' });

// Error messages on the page. Scoped to <main>: Next.js keeps an empty alert of its own outside it.
const errors = (page: Page) => page.getByRole('main').getByRole('alert');
// Notes that aren't errors ("Rules are locked", "Wrong network") are announced politely
const note = (page: Page, title: string) => page.getByRole('main').getByRole('status').filter({ hasText: title });

// A row of a summary card on the review step: its label and its value
const reviewRow = (page: Page, label: string) => page.getByRole('term').filter({ hasText: new RegExp(`^${label}$`) }).locator('..');

// How many transactions the page asked the wallet to send
const sends = (wallet: TestWallet) => wallet.requests.filter((method) => method === 'eth_sendTransaction').length;

interface ChainEvent {
  organizer: string;
  endTime: bigint;
  resaleCapBps: bigint;
  typeCount: bigint;
  sold: bigint;
  configured: boolean;
  active: boolean;
  perWalletLimit: bigint;
  royaltyBps: bigint;
  presale: boolean;
}

// What the contract has for an event ID
async function chainEvent(contractId: bigint): Promise<ChainEvent> {
  const nft = chain.ticketNft();
  const [config, organizer, royaltyBps, presale] = await Promise.all([
    nft.eventConfigs(contractId) as Promise<[bigint, bigint, bigint, bigint, boolean, boolean, bigint]>,
    nft.eventOrganizer(contractId) as Promise<string>,
    nft.royaltyPercentage(contractId) as Promise<bigint>,
    nft.presaleActive(contractId) as Promise<boolean>,
  ]);
  const [endTime, resaleCapBps, typeCount, sold, configured, active, perWalletLimit] = config;
  return { organizer, endTime, resaleCapBps, typeCount, sold, configured, active, perWalletLimit, royaltyBps, presale };
}

const chainTicketType = async (contractId: bigint, typeId: number) => {
  const [price, maxSupply, , , metadataURI] = (await chain.ticketNft().ticketTypes(contractId, typeId)) as [bigint, bigint, bigint, bigint, string];
  return { price, maxSupply, metadataURI };
};

const mined = async (tx: Promise<ethers.ContractTransactionResponse>) => (await (await tx).wait())!;

// An admin taking the organizer role away, the way the Admin page does: on the contract first,
// then in the API
async function revokeOrganizer(account: Account) {
  await mined(chain.ticketNft(accounts.admin).revokeRole(ORGANIZER_ROLE, account.address));
  // The API's listener can see RoleRevoked first and take the role away itself: the admin call
  // then answers 409 "User is not an organizer", which is the same outcome
  await (await ApiSession.signIn(accounts.admin)).delete(`/api/admin/organizers/${account.address}`).catch((error) => {
    if (!(error instanceof ApiError && error.status === 409)) throw error;
  });
}

// The API answering a browser request with an error. The API is on another origin than the web
// app, so the stand-in answer carries the same CORS headers the API sends.
async function failOnce(page: Page, urlPattern: string, status: number, error: string) {
  let done = false;
  await page.route(urlPattern, async (route) => {
    if (done || route.request().method() !== 'POST') return route.fallback();
    done = true;
    await route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': WEB_URL, 'access-control-allow-credentials': 'true' },
      body: JSON.stringify({ error }),
    });
  });
}

// ---------------------------------------------------------------------------------------------

test.describe('who can create events', () => {
  test('a signed-out visitor is asked to sign in, and the old link leads to the new flow', async ({ page }) => {
    await page.goto('/create-event');
    await expect(page).toHaveURL(new RegExp(`${NEW_EVENT}$`));

    await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
    await expect(page.getByText('Connect the wallet of your organizer account and sign in to open the create event form.')).toBeVisible();
    await expect(page.getByLabel('Event name')).toHaveCount(0);

    // Signing in comes back to the form
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', `/signup?next=${encodeURIComponent(NEW_EVENT)}`);
  });

  test('an attendee sees that organizer access is needed, and the API refuses them too', async ({ page, signIn }) => {
    await signIn('attendee', { path: NEW_EVENT });

    await expect(page.getByRole('heading', { name: 'Organizer access needed' })).toBeVisible();
    await expect(page.getByText('Only approved organizers can open the create event form. Ask for access and an admin will review it.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request organizer access' })).toBeVisible();
    await expect(page.getByLabel('Event name')).toHaveCount(0);

    const session = await ApiSession.signIn(accounts.alex);
    const refused = await session
      .post('/api/events', { title: 'Not allowed', category: 'Concerts', location: VENUE, start_date: new Date(startIn(30)).toISOString() })
      .catch((err: unknown) => err);
    expect(refused).toBeInstanceOf(ApiError);
    expect((refused as ApiError).status).toBe(403);
  });

  test('an admin is told to use an organizer account', async ({ page, signIn }) => {
    await signIn('admin', { path: NEW_EVENT });

    await expect(page.getByRole('heading', { name: 'Use an organizer account' })).toBeVisible();
    await expect(page.getByText("Admin accounts can't open the create event form.")).toBeVisible();
    await expect(page.getByLabel('Event name')).toHaveCount(0);
  });

  test('an organizer sees the form', async ({ page, signIn }) => {
    await signIn('organizer', { path: NEW_EVENT });

    await expect(page.getByRole('heading', { name: 'Create event' })).toBeVisible();
    await expect(page.getByLabel('Event name')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Create event steps' }).getByRole('listitem').first()).toHaveAttribute('aria-current', 'step');
  });

  test('an organizer whose role is revoked while filling the form is told why saving fails', async ({ page, signIn }) => {
    try {
      const draft = await createDraft();
      await openDraft(page, signIn, draft);
      await next(page, 'Ticket types');
      await fillTicketType(page, 1, { supply: 150 });

      await revokeOrganizer(accounts.organizer);
      await page.getByRole('button', { name: 'Next: Sale rules' }).click();

      await expect(page.getByRole('alert').filter({ hasText: "Your organizer access isn't active in this session yet. Sign out, sign in again, then save." })).toBeVisible();
      await expect(stepHeading.types(page)).toBeVisible(); // still on the step, nothing lost
      expect((await apiEvent(draft.id)).ticket_types[0].supply).toBe(100); // and nothing saved

      // Opening the form again shows the same explanation as for any attendee
      page.on('dialog', (dialog) => dialog.accept()); // "leave with unsaved changes?"
      await page.goto(NEW_EVENT);
      await expect(page.getByRole('heading', { name: 'Organizer access needed' })).toBeVisible();
    } finally {
      await resetStack();
    }
  });

  test('an organizer whose role is revoked before publishing is told why each step fails', async ({ page, signIn, wallet }) => {
    try {
      const draft = await createDraft();
      await openAtReview(page, signIn, draft);

      await revokeOrganizer(accounts.organizer);
      await publishButton(page).click();

      // Step 1 is the API's: it refuses, and says what to do
      await expect(page.getByRole('alert').filter({ hasText: "Your account isn't an organizer, or your access changed. Sign in again, then try again." })).toBeVisible();
      await expectRows(page, ['Failed', 'Waiting', 'Waiting', 'Waiting']);
      expect((await apiEvent(draft.id)).status).toBe('DRAFT');

      // The contract's role is gone as well: the page says so once it has read the contract again,
      // and nothing can be sent
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Organizer access needed' })).toBeVisible();
      expect(sends(wallet)).toBe(0);
      expect((await chainEvent(draft.contractId)).configured).toBe(false);
    } finally {
      await resetStack();
    }
  });

  test('an organizer who lost the contract role mid-way is told the wallet cannot publish', async ({ page, signIn, wallet }) => {
    try {
      const draft = await createDraft();
      await openAtReview(page, signIn, draft);

      // Stop after the first on-chain step, then lose the role on the contract only
      wallet.rejectNext('send', 1);
      await publishButton(page).click();
      await expect(page.getByRole('alert').filter({ hasText: 'The transaction was cancelled in your wallet.' })).toBeVisible();
      await mined(chain.ticketNft(accounts.admin).revokeRole(ORGANIZER_ROLE, accounts.organizer.address));

      await continueButton(page).click();
      await expect(page.getByRole('alert').filter({ hasText: "This wallet doesn't have the organizer role on the contract. An admin grants it when they approve your organizer request." })).toBeVisible();
      await expect(page.getByRole('alert').filter({ hasText: "This wallet can't publish yet" })).toBeVisible();
      await expect(continueButton(page)).toBeDisabled();
      expect((await chainEvent(draft.contractId)).typeCount).toBe(0n);
    } finally {
      await resetStack();
    }
  });
});

test.describe('step 1: details', () => {
  test('every field says what is wrong with it', async ({ page, signIn }) => {
    await signIn('organizer', { path: NEW_EVENT });
    const nextButton = page.getByRole('button', { name: 'Next: Ticket types' });
    const start = startIn(30);

    await test.step('empty form', async () => {
      await nextButton.click();
      await expect(page.getByText('Enter the event name.')).toBeVisible();
      await expect(page.getByText('Choose a category.')).toBeVisible();
      await expect(page.getByText('Enter the venue.')).toBeVisible();
      await expect(page.getByText('Choose when the event starts.')).toBeVisible();
      await expect(page.getByLabel('Event name')).toHaveAttribute('aria-invalid', 'true');
      await expect(page).toHaveURL(new RegExp(`${NEW_EVENT}$`)); // no draft was created
    });

    await test.step('too long', async () => {
      await page.getByLabel('Event name').fill('N'.repeat(121));
      await expect(page.getByText('Keep the name under 120 characters.')).toBeVisible();
      await page.getByLabel('Description').fill('D'.repeat(2001));
      await expect(page.getByText('Keep the description under 2,000 characters.')).toBeVisible();
      await page.getByLabel('Venue').fill('V'.repeat(201));
      await expect(page.getByText('Keep the venue under 200 characters.')).toBeVisible();
    });

    await test.step('at the limit', async () => {
      await page.getByLabel('Event name').fill('N'.repeat(120));
      await page.getByLabel('Description').fill('D'.repeat(2000));
      await page.getByLabel('Venue').fill('V'.repeat(200));
      await page.getByLabel('Category').selectOption('Web3 & Tech');
      for (const message of ['Keep the name under', 'Keep the description under', 'Keep the venue under', 'Choose a category.']) {
        await expect(page.getByText(message)).toHaveCount(0);
      }
    });

    await test.step('dates', async () => {
      await page.getByLabel('Starts').fill(localInput(Date.now() - HOUR));
      await expect(page.getByText('The start must be in the future.')).toBeVisible();

      await page.getByLabel('Starts').fill(localInput(start));
      await page.getByLabel('Ends').fill(localInput(start - HOUR));
      await expect(page.getByText('The end must be after the start.')).toBeVisible();
      await page.getByLabel('Ends').fill(localInput(start));
      await expect(page.getByText('The end must be after the start.')).toBeVisible();

      await page.getByLabel('Ends').fill(localInput(start + HOUR));
      await expect(page.getByText('The end must be after the start.')).toHaveCount(0);
    });

    await test.step('a valid form moves on and creates the draft', async () => {
      await nextButton.click();
      await expect(stepHeading.types(page)).toBeVisible();
      await expect(page).toHaveURL(/draft=[0-9a-f-]{36}&step=ticket-types$/);
    });
  });

  test('Save draft creates the draft without an end time, and a refresh keeps every value and the step', async ({ page, signIn }) => {
    await signIn('organizer', { path: NEW_EVENT });
    const title = `Saved draft ${Date.now().toString(36)}`;
    const start = startIn(45);

    await page.getByLabel('Event name').fill(`  ${title}  `);
    await page.getByLabel('Description').fill('Two sets and an intermission.');
    await page.getByLabel('Category').selectOption('Classical & Opera');
    await page.getByLabel('Venue').fill(VENUE);
    await page.getByLabel('Starts').fill(localInput(start)); // no end time
    await page.getByRole('button', { name: 'Save draft' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Draft saved' })).toBeVisible();
    await expect(page).toHaveURL(/\?draft=[0-9a-f-]{36}$/);
    const id = new URL(page.url()).searchParams.get('draft')!;

    const saved = await apiEvent(id);
    expect(saved).toMatchObject({
      status: 'DRAFT',
      title, // trimmed
      description: 'Two sets and an intermission.',
      category: 'Classical & Opera',
      location: VENUE,
      end_date: null,
    });
    expect(new Date(saved.start_date).getTime()).toBe(start);

    await test.step('refresh on the details step', async () => {
      await page.reload();
      await expect(page.getByLabel('Event name')).toHaveValue(title);
      await expect(page.getByLabel('Description')).toHaveValue('Two sets and an intermission.');
      await expect(page.getByLabel('Category')).toHaveValue('Classical & Opera');
      await expect(page.getByLabel('Venue')).toHaveValue(VENUE);
      await expect(page.getByLabel('Starts')).toHaveValue(localInput(start));
      await expect(page.getByLabel('Ends')).toHaveValue('');
    });

    await test.step('refresh on the ticket types step', async () => {
      await next(page, 'Ticket types');
      await fillTicketType(page, 1, { ...VIP, description: 'Front rows\nA drink' });
      await page.getByRole('button', { name: 'Save draft' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Draft saved' })).toBeVisible();

      await page.reload();
      await expect(page).toHaveURL(new RegExp(`draft=${id}&step=ticket-types$`));
      const card = ticketCard(page, 1);
      await expect(card.getByLabel('Name', { exact: true })).toHaveValue('VIP');
      await expect(card.getByLabel('Price (USDC)')).toHaveValue('45.5');
      await expect(card.getByLabel('Supply')).toHaveValue('50');
      await expect(card.getByLabel('Description')).toHaveValue('Front rows\nA drink');
      expect((await apiEvent(id)).ticket_types).toMatchObject([{ name: 'VIP', supply: 50, description: 'Front rows\nA drink' }]);
    });

    await test.step('refresh on the sale rules step', async () => {
      await next(page, 'Sale rules');
      await page.getByLabel('Per-wallet limit').fill('6');
      await page.getByLabel('Resale price cap').selectOption({ label: '1.5× face value' });
      await page.getByLabel('Organizer royalty (%)').fill('7.5');
      await page.getByRole('button', { name: 'Save draft' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Draft saved' })).toBeVisible();

      await page.reload();
      await expect(page).toHaveURL(new RegExp(`draft=${id}&step=sale-rules$`));
      await expect(page.getByLabel('Per-wallet limit')).toHaveValue('6');
      await expect(page.getByLabel('Resale price cap')).toHaveValue('15000');
      await expect(page.getByLabel('Organizer royalty (%)')).toHaveValue('7.5');
      await expect(page.getByLabel('Sales end')).toHaveValue(localInput(start));
    });
  });

  test('the cover image must be a PNG, JPG or WebP of 10 MB or less, and is needed to publish', async ({ page, signIn }) => {
    const draft = await createDraft();
    await openDraft(page, signIn, draft);
    const cover = page.getByLabel('Cover image');

    await test.step('wrong type', async () => {
      await cover.setInputFiles({ name: 'poster.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
      await expect(page.getByRole('alert').filter({ hasText: 'Use a PNG, JPG or WebP image.' })).toBeVisible();
      await expect(page.getByLabel('Cover image')).toHaveAttribute('aria-invalid', 'true');
    });

    await test.step('too big', async () => {
      await cover.setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
      await expect(page.getByRole('alert').filter({ hasText: 'The image must be 10 MB or smaller.' })).toBeVisible();
    });

    await test.step('each accepted type', async () => {
      for (const [name, mimeType] of [['cover.jpg', 'image/jpeg'], ['cover.webp', 'image/webp'], ['cover.png', 'image/png']] as const) {
        await cover.setInputFiles({ name, mimeType, buffer: COVER_PNG });
        await expect(page.getByText(name, { exact: true })).toBeVisible();
        await expect(page.getByRole('img', { name: 'Cover image preview' })).toBeVisible();
        await expect(page.getByText('Use a PNG, JPG or WebP image.')).toHaveCount(0);
      }
    });

    await test.step('removed: the review step asks for it and publishing is blocked', async () => {
      await page.getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(page.getByRole('img', { name: 'Cover image preview' })).toHaveCount(0);
      await next(page, 'Ticket types');
      await next(page, 'Sale rules');
      await next(page, 'Review');

      await expect(reviewRow(page, 'Cover image').getByRole('definition')).toHaveText('Missing');
      await expect(page.getByRole('alert').filter({ hasText: 'Finish these before publishing' })).toContainText('Add a cover image.');
      await expect(publishButton(page)).toBeDisabled();

      // The link in the message goes to the step to fix
      await page.getByRole('button', { name: 'Go to Details' }).click();
      await pickCover(page);
      await next(page, 'Ticket types');
      await next(page, 'Sale rules');
      await next(page, 'Review');
      await expect(reviewRow(page, 'Cover image')).toContainText('cover.png (1 KB)');
      await expect(publishButton(page)).toBeEnabled();
    });
  });
});

test.describe('step 2: ticket types', () => {
  test('up to 10 ticket types, one can be removed, and at least one stays', async ({ page, signIn }) => {
    const draft = await createDraft({ types: [] });
    await openDraft(page, signIn, draft);
    await next(page, 'Ticket types');
    const add = page.getByRole('button', { name: 'Add another ticket type' });
    const cards = page.getByLabel(/^Ticket type \d+$/);

    // A new event starts with one empty ticket type, which can't be removed or skipped
    await expect(cards).toHaveCount(1);
    await expect(ticketCard(page, 1).getByRole('button', { name: /^Remove/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Next: Sale rules' }).click();
    await expect(ticketCard(page, 1).getByText('Enter a name.')).toBeVisible();
    await expect(stepHeading.types(page)).toBeVisible();

    for (let n = 2; n <= 10; n++) await add.click();
    await expect(cards).toHaveCount(10);
    await expect(add).toBeDisabled();
    await expect(page.getByText('An event can have up to 10 ticket types.')).toBeVisible();

    for (let n = 1; n <= 10; n++) await fillTicketType(page, n, { name: `Tier ${n}`, price: n, supply: 10 });
    await expect(page.getByText('Total capacity').locator('..')).toContainText('100');
    await expect(page.getByText('Revenue if sold out').locator('..')).toContainText('550.00 USDC');

    await page.getByRole('button', { name: 'Remove Tier 4' }).click();
    await expect(cards).toHaveCount(9);
    await expect(add).toBeEnabled();
    await expect(page.getByText('An event can have up to 10 ticket types.')).toHaveCount(0);

    await next(page, 'Sale rules');
    const saved = (await apiEvent(draft.id)).ticket_types.map((t) => t.name);
    expect(saved).toHaveLength(9);
    expect(saved).not.toContain('Tier 4');
  });

  test('names, prices, supplies and descriptions are checked', async ({ page, signIn }) => {
    const draft = await createDraft({ types: [] });
    await openDraft(page, signIn, draft);
    await next(page, 'Ticket types');
    await page.getByRole('button', { name: 'Add another ticket type' }).click();
    const first = ticketCard(page, 1);
    const second = ticketCard(page, 2);
    const nextButton = page.getByRole('button', { name: 'Next: Sale rules' });

    await fillTicketType(page, 1, GA);
    await fillTicketType(page, 2, { name: 'general admission', price: 30, supply: 10 });
    await nextButton.click();

    await test.step('the same name in another letter case', async () => {
      await expect(second.getByText('Another ticket type has this name.')).toBeVisible();
      await expect(first.getByRole('alert')).toHaveCount(0);
      await second.getByLabel('Name', { exact: true }).fill(' General Admission ');
      await expect(second.getByText('Another ticket type has this name.')).toBeVisible();
      await second.getByLabel('Name', { exact: true }).fill('N'.repeat(61));
      await expect(second.getByText('Keep it under 60 characters.')).toBeVisible();
      await second.getByLabel('Name', { exact: true }).fill('');
      await expect(second.getByText('Enter a name.')).toBeVisible();
      await second.getByLabel('Name', { exact: true }).fill('N'.repeat(60));
      await expect(second.getByRole('alert')).toHaveCount(0);
    });

    await test.step('price', async () => {
      const price = second.getByLabel('Price (USDC)');
      for (const bad of ['', 'abc', '15,50', '-5', '1.1234567']) {
        await price.fill(bad);
        await expect(second.getByText('Enter a price like 15 or 15.50 (up to 6 decimals).'), `price "${bad}"`).toBeVisible();
      }
      await price.fill('1000000.01');
      await expect(second.getByText('Keep the price at 1,000,000 USDC or less.')).toBeVisible();
      for (const good of ['1000000', '0', '15.50', '0.000001']) {
        await price.fill(good);
        await expect(second.getByRole('alert'), `price "${good}"`).toHaveCount(0);
      }
    });

    await test.step('supply', async () => {
      const supply = second.getByLabel('Supply');
      for (const bad of ['', '0', '-3', '2.5', 'ten']) {
        await supply.fill(bad);
        await expect(second.getByText('Enter a whole number, 1 or more.'), `supply "${bad}"`).toBeVisible();
      }
      await supply.fill('2147483648');
      await expect(second.getByText("That's more tickets than an event can have.")).toBeVisible();
      await supply.fill('2147483647');
      await expect(second.getByRole('alert')).toHaveCount(0);
      await supply.fill('25');
    });

    await test.step('description', async () => {
      const description = second.getByLabel('Description');
      await description.fill('D'.repeat(501));
      await expect(second.getByText('Keep it under 500 characters.')).toBeVisible();
      await description.fill('D'.repeat(500));
      await expect(second.getByRole('alert')).toHaveCount(0);
    });

    await test.step('valid types are saved in order', async () => {
      await second.getByLabel('Name', { exact: true }).fill('VIP');
      await second.getByLabel('Price (USDC)').fill('45.5');
      await next(page, 'Sale rules');
      expect((await apiEvent(draft.id)).ticket_types).toMatchObject([
        { name: 'General Admission', supply: 100 },
        { name: 'VIP', supply: 25 },
      ]);
    });
  });
});

test.describe('step 3: sale rules', () => {
  test('defaults are filled in, and every rule is checked', async ({ page, signIn }) => {
    const draft = await createDraft({ types: [GA, VIP] });
    await openDraft(page, signIn, draft);
    await next(page, 'Ticket types');
    await next(page, 'Sale rules');

    const limit = page.getByLabel('Per-wallet limit');
    const salesEnd = page.getByLabel('Sales end');
    const cap = page.getByLabel('Resale price cap');
    const royalty = page.getByLabel('Organizer royalty (%)');
    const preview = page.getByText('What buyers will see').locator('..');
    const nextButton = page.getByRole('button', { name: 'Next: Review' });

    await test.step('defaults', async () => {
      await expect(limit).toHaveValue('4');
      await expect(salesEnd).toHaveValue(localInput(draft.startsAt)); // sales end when the event starts
      await expect(cap).toHaveValue('20000');
      await expect(royalty).toHaveValue('10');
      await expect(page.getByRole('switch', { name: 'Start in presale' })).not.toBeChecked();
      await expect(page.getByRole('switch', { name: 'Start in presale' })).toBeDisabled(); // until the guest list page exists
      await expect(preview).toContainText('Max 4 per wallet');
      await expect(preview).toContainText('Resale cap 2x');
      await expect(preview).toContainText('A VIP ticket (45.50 USDC) can be resold for up to 91.00 USDC before the event. You receive 10% of each resale.');
    });

    await test.step('per-wallet limit', async () => {
      await limit.fill('');
      await nextButton.click();
      await expect(page.getByText('Enter a whole number. 0 means no limit.')).toBeVisible();
      await expect(stepHeading.rules(page)).toBeVisible();
      for (const bad of ['2.5', '-1', 'two']) {
        await limit.fill(bad);
        await expect(page.getByText('Enter a whole number. 0 means no limit.'), `limit "${bad}"`).toBeVisible();
      }
      await limit.fill('10001');
      await expect(page.getByText('Keep it at 10,000 or less.')).toBeVisible();
      await limit.fill('10000');
      await expect(page.getByText('Keep it at 10,000 or less.')).toHaveCount(0);
      await limit.fill('0');
      await expect(errors(page)).toHaveCount(0);
      await expect(preview).toContainText('No wallet limit');
    });

    await test.step('sales end', async () => {
      await salesEnd.fill('');
      await expect(page.getByText('Choose when ticket sales end.')).toBeVisible();
      await salesEnd.fill(localInput(Date.now() - HOUR));
      await expect(page.getByText('Sales must end in the future.')).toBeVisible();
      await salesEnd.fill(localInput(draft.startsAt + 3 * HOUR + 60_000)); // a minute after the event ends
      await expect(page.getByText('Sales must end by the time the event ends.')).toBeVisible();
      await salesEnd.fill(localInput(draft.startsAt + 3 * HOUR)); // when it ends
      await expect(errors(page)).toHaveCount(0);
    });

    await test.step('royalty', async () => {
      for (const bad of ['', '100.01', '101', '-1', '1.234', 'ten']) {
        await royalty.fill(bad);
        await expect(page.getByText('Enter a percentage from 0 to 100 (up to 2 decimals).'), `royalty "${bad}"`).toBeVisible();
      }
      for (const good of ['0', '100', '12.34', '2.5']) {
        await royalty.fill(good);
        await expect(errors(page), `royalty "${good}"`).toHaveCount(0);
      }
      await royalty.fill('0');
      await expect(preview).toContainText("You don't receive a royalty on resales.");
    });

    await test.step('every resale cap choice', async () => {
      await expect(cap.getByRole('option')).toHaveText(['No cap', '1× face value', '1.5× face value', '2× face value', '3× face value']);
      for (const [label, badge, example] of [
        ['1× face value', 'Resale cap 1x', 'resold for up to 45.50 USDC'],
        ['1.5× face value', 'Resale cap 1.5x', 'resold for up to 68.25 USDC'],
        ['2× face value', 'Resale cap 2x', 'resold for up to 91.00 USDC'],
        ['3× face value', 'Resale cap 3x', 'resold for up to 136.50 USDC'],
        ['No cap', 'No resale cap', 'can be resold at any price'],
      ]) {
        await cap.selectOption({ label });
        await expect(preview, label).toContainText(badge);
        await expect(preview, label).toContainText(example);
      }
    });

    await test.step('valid rules move on to the review', async () => {
      await next(page, 'Review');
      await expect(reviewRow(page, 'Per-wallet limit')).toContainText('No limit');
      await expect(reviewRow(page, 'Resale price cap')).toContainText('No cap');
      await expect(reviewRow(page, 'Organizer royalty')).toContainText('0%');
    });
  });
});

test.describe('review and drafts', () => {
  test('the review shows everything entered, and editing one step keeps the others', async ({ page, signIn }) => {
    await signIn('organizer', { path: NEW_EVENT });
    const title = `Reviewed ${Date.now().toString(36)}`;
    const start = startIn(20);

    await page.getByLabel('Event name').fill(title);
    await page.getByLabel('Description').fill('Doors at six.');
    await page.getByLabel('Category').selectOption('Electronic Music');
    await page.getByLabel('Venue').fill('Parc Jean-Drapeau, Montreal, QC');
    await page.getByLabel('Starts').fill(localInput(start));
    await page.getByLabel('Ends').fill(localInput(start + 4 * HOUR));
    await pickCover(page);
    await next(page, 'Ticket types');
    await fillTicketType(page, 1, GA);
    await page.getByRole('button', { name: 'Add another ticket type' }).click();
    await fillTicketType(page, 2, VIP);
    await next(page, 'Sale rules');
    await page.getByLabel('Per-wallet limit').fill('2');
    await page.getByLabel('Resale price cap').selectOption({ label: '3× face value' });
    await page.getByLabel('Organizer royalty (%)').fill('12.5');
    await page.getByLabel('Sales end').fill(localInput(start - 2 * DAY));
    await next(page, 'Review');

    const expectReview = async (venue: string) => {
      await expect(reviewRow(page, 'Name')).toContainText(title);
      await expect(reviewRow(page, 'When')).toContainText(shortDate(start));
      await expect(reviewRow(page, 'Venue')).toContainText(venue);
      await expect(reviewRow(page, 'Category')).toContainText('Electronic Music');
      await expect(reviewRow(page, 'Cover image')).toContainText('cover.png (1 KB)');
      await expect(reviewRow(page, 'General Admission')).toContainText('20.00 USDC × 100');
      await expect(reviewRow(page, 'VIP')).toContainText('45.50 USDC × 50');
      await expect(reviewRow(page, 'Per-wallet limit').getByRole('definition')).toHaveText('2');
      await expect(reviewRow(page, 'Resale price cap')).toContainText('3× face value');
      await expect(reviewRow(page, 'Organizer royalty')).toContainText('12.5%');
      await expect(reviewRow(page, 'Sales end')).toContainText(shortDate(start - 2 * DAY));
      await expect(reviewRow(page, 'Start in presale').getByRole('definition')).toHaveText('No');
    };
    await expectReview('Parc Jean-Drapeau, Montreal, QC');
    await expectRows(page, ['Ready', 'Waiting', 'Waiting', 'Waiting']);

    // Edit goes back to that step; the other steps keep what was entered
    await page.getByRole('button', { name: 'Edit details' }).click();
    await expect(page.getByLabel('Event name')).toHaveValue(title);
    await expect(page.getByText('cover.png', { exact: true })).toBeVisible();
    await page.getByLabel('Venue').fill('MTELUS, Montreal, QC');
    await next(page, 'Ticket types');
    await expect(ticketCard(page, 2).getByLabel('Price (USDC)')).toHaveValue('45.5');
    await next(page, 'Sale rules');
    await expect(page.getByLabel('Organizer royalty (%)')).toHaveValue('12.5');
    await expect(page.getByLabel('Sales end')).toHaveValue(localInput(start - 2 * DAY));
    await next(page, 'Review');
    await expectReview('MTELUS, Montreal, QC');

    // The steps above the form go back too
    await page.getByRole('button', { name: /^Sale rules \(done\)/ }).click();
    await expect(page.getByLabel('Per-wallet limit')).toHaveValue('2');
    await page.getByRole('button', { name: /^Ticket types \(done\)/ }).click();
    await expect(ticketCard(page, 1).getByLabel('Supply')).toHaveValue('100');
  });

  test('starting a new event offers to continue the unfinished draft', async ({ page, signIn }) => {
    await signIn('organizer', { path: NEW_EVENT });
    await expect(page.getByText('You have an unfinished draft')).toHaveCount(0);
    const title = `Unfinished ${Date.now().toString(36)}`;

    await page.getByLabel('Event name').fill(title);
    await page.getByLabel('Category').selectOption('Concerts');
    await page.getByLabel('Venue').fill(VENUE);
    await page.getByLabel('Starts').fill(localInput(startIn(10)));
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page).toHaveURL(/\?draft=[0-9a-f-]{36}$/);
    const id = new URL(page.url()).searchParams.get('draft')!;

    await page.goto(NEW_EVENT);
    await expect(page.getByText(`You have an unfinished draft: ${title}`)).toBeVisible();
    await expect(page.getByLabel('Event name')).toHaveValue(''); // or start a new one below

    await page.getByRole('link', { name: 'Continue the draft' }).click();
    await expect(page).toHaveURL(new RegExp(`draft=${id}$`));
    await expect(page.getByLabel('Event name')).toHaveValue(title);
    await expect(page.getByText('You have an unfinished draft')).toHaveCount(0);
  });

  test("another organizer's draft, a missing draft and a published event can't be edited", async ({ page, signIn }) => {
    try {
      // A second organizer, approved the way the Admin page does it
      await mined(chain.ticketNft(accounts.admin).grantRole(ORGANIZER_ROLE, accounts.jordan.address));
      await (await ApiSession.signIn(accounts.admin)).post(`/api/admin/organizers/${accounts.jordan.address}`);
      const theirs = await createDraft({ organizer: accounts.jordan, title: "Jordan's draft" });
      const published = await createPublishedEvent({ title: `Already live ${Date.now().toString(36)}` });

      await test.step("another organizer's draft", async () => {
        // Another organizer can't read the draft at all, so it's "not found" to them
        await signIn('organizer', { path: draftUrl(theirs.id) });
        await expect(page.getByRole('heading', { name: 'Draft not found' })).toBeVisible();
        await expect(page.getByText("This draft doesn't exist, or the link is wrong.")).toBeVisible();
        await expect(page.getByText("Jordan's draft")).toHaveCount(0);
        await expect(page.getByLabel('Event name')).toHaveCount(0);

        // The API refuses the change as well
        const sophie = await ApiSession.signIn(accounts.organizer);
        const refused = await sophie.put(`/api/events/${theirs.id}`, { title: 'Taken over' }).catch((err: unknown) => err);
        expect((refused as ApiError).status).toBe(403);
        expect((await apiEvent(theirs.id, accounts.jordan)).title).toBe("Jordan's draft");

        await page.getByRole('link', { name: 'Start a new event' }).click();
        await expect(page.getByLabel('Event name')).toHaveValue('');
      });

      await test.step("a draft that doesn't exist", async () => {
        for (const draft of ['00000000-0000-4000-8000-000000000000', 'not-a-draft']) {
          await page.goto(`${NEW_EVENT}?draft=${draft}`);
          await expect(page.getByRole('heading', { name: 'Draft not found' }), draft).toBeVisible();
          await expect(page.getByText("This draft doesn't exist, or the link is wrong.")).toBeVisible();
          await expect(page.getByLabel('Event name')).toHaveCount(0);
        }
      });

      await test.step('an event that is already published', async () => {
        await page.goto(draftUrl(published.apiId, 'ticket-types'));
        await expect(liveHeading(page)).toBeVisible();
        await expect(page.getByText('is published and its tickets are on the blockchain.')).toContainText(published.title);
        await expect(page.getByLabel('Event name')).toHaveCount(0);
        await expect(ticketCard(page, 1)).toHaveCount(0);

        const sophie = await ApiSession.signIn(accounts.organizer);
        const refused = await sophie.put(`/api/events/${published.apiId}`, { title: 'Changed after publishing' }).catch((err: unknown) => err);
        expect(refused).toBeInstanceOf(ApiError);
        expect((await apiEvent(published.apiId)).title).toBe(published.title);
      });
    } finally {
      await resetStack();
    }
  });

  test("the browser's back and forward buttons move between steps", async ({ page, signIn }) => {
    const draft = await createDraft({ types: [GA, VIP] });
    await openDraft(page, signIn, draft);
    await next(page, 'Ticket types');
    await next(page, 'Sale rules');
    await page.getByLabel('Per-wallet limit').fill('3');
    await next(page, 'Review');

    await page.goBack();
    await expect(page).toHaveURL(/step=sale-rules$/);
    await expect(page.getByLabel('Per-wallet limit')).toHaveValue('3');
    await page.goBack();
    await expect(page).toHaveURL(/step=ticket-types$/);
    await expect(ticketCard(page, 2).getByLabel('Name', { exact: true })).toHaveValue('VIP');
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`draft=${draft.id}$`));
    await expect(page.getByLabel('Event name')).toHaveValue(draft.title);

    await page.goForward();
    await expect(ticketCard(page, 1).getByLabel('Name', { exact: true })).toHaveValue('General Admission');
    await page.goForward();
    await page.goForward();
    await expect(page).toHaveURL(/step=review$/);
    await expectRows(page, ['Ready', 'Waiting', 'Waiting', 'Waiting']);
    await expect(reviewRow(page, 'Per-wallet limit').getByRole('definition')).toHaveText('3');
  });
});

test.describe('publishing', () => {
  test('the four steps run in order with a wallet confirmation each, and the event is live everywhere', async ({ page, signIn, wallet }) => {
    await signIn('organizer', { path: NEW_EVENT });
    const title = `Harvest Moon Gala ${Date.now().toString(36)}`;
    const start = startIn(30);
    const salesEnd = start - DAY;

    await page.getByLabel('Event name').fill(title);
    await page.getByLabel('Description').fill('An evening of opera under the harvest moon.\nDoors open an hour before.');
    await page.getByLabel('Category').selectOption('Classical & Opera');
    await page.getByLabel('Venue').fill(VENUE);
    await page.getByLabel('Starts').fill(localInput(start));
    await page.getByLabel('Ends').fill(localInput(start + 3 * HOUR));
    await pickCover(page);
    await next(page, 'Ticket types');
    await fillTicketType(page, 1, { ...GA, description: 'Open seating' });
    await page.getByRole('button', { name: 'Add another ticket type' }).click();
    await fillTicketType(page, 2, VIP);
    await next(page, 'Sale rules');
    await page.getByLabel('Per-wallet limit').fill('6');
    await page.getByLabel('Sales end').fill(localInput(salesEnd));
    await page.getByLabel('Resale price cap').selectOption({ label: '1.5× face value' });
    await page.getByLabel('Organizer royalty (%)').fill('7.5');
    await next(page, 'Review');
    const id = new URL(page.url()).searchParams.get('draft')!;
    const contractId = contractEventIdFor(id);

    await test.step('before: a draft, nothing on the contract', async () => {
      await expectRows(page, ['Ready', 'Waiting', 'Waiting', 'Waiting']);
      await expect(publishRows(page)).toHaveText([/1\. Freeze details \(upload to IPFS\)/, /2\. Create the event on-chain/, /3\. Add ticket types on-chain/, /4\. Publish/]);
      expect((await apiEvent(id)).status).toBe('DRAFT');
      expect((await chainEvent(contractId)).configured).toBe(false);
    });

    await test.step('publish: four wallet confirmations (the event, two ticket types, opening sales)', async () => {
      await publishButton(page).click();
      await expect(liveHeading(page)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('is published and its tickets are on the blockchain.')).toContainText(title);
      expect(sends(wallet)).toBe(4);
    });

    const event = await apiEvent(id);
    await test.step('the API has it published, frozen on IPFS', async () => {
      expect(event).toMatchObject({ status: 'PUBLISHED', title, category: 'Classical & Opera', location: VENUE, contract_event_id: contractId.toString() });
      expect(event.image_url).toMatch(/^ipfs:\/\//);
      expect(event.ticket_types).toMatchObject([
        { name: 'General Admission', supply: 100, description: 'Open seating' },
        { name: 'VIP', supply: 50 },
      ]);
      expect(event.ticket_types.every((t) => t.ipfs_hash)).toBe(true);
    });

    await test.step('the contract has the same rules and ticket types as the form', async () => {
      const onChain = await chainEvent(contractId);
      expect(onChain).toMatchObject({
        organizer: accounts.organizer.address,
        configured: true,
        active: true,
        presale: false,
        endTime: BigInt(salesEnd / 1000),
        perWalletLimit: 6n,
        resaleCapBps: 15_000n,
        royaltyBps: 750n,
        typeCount: 2n,
        sold: 0n,
      });
      expect(await chainTicketType(contractId, 0)).toEqual({ price: chain.usdc(20), maxSupply: 100n, metadataURI: `ipfs://${event.ticket_types[0].ipfs_hash}` });
      expect(await chainTicketType(contractId, 1)).toEqual({ price: chain.usdc('45.5'), maxSupply: 50n, metadataURI: `ipfs://${event.ticket_types[1].ipfs_hash}` });
    });

    await test.step('the event page shows every detail, the image, prices, supply and rules', async () => {
      await page.getByRole('link', { name: 'View the event page' }).click();
      await expect(page).toHaveURL(new RegExp(`/events/${id}$`));
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
      const main = page.getByRole('main');
      await expect(main).toContainText(shortDate(start));
      await expect(main).toContainText(VENUE);
      await expect(main).toContainText('Classical & Opera');
      await expect(main).toContainText('150 of 150 tickets left');
      await expect(main).toContainText('General Admission');
      await expect(main).toContainText('20.00');
      await expect(main).toContainText('100 left');
      await expect(main).toContainText('VIP');
      await expect(main).toContainText('45.50');
      await expect(main).toContainText('50 left');
      await expect(main).toContainText('1 of 6'); // the per-wallet limit
      await main.getByRole('button', { name: 'Resale rules' }).click();
      await expect(main).toContainText('1.5× cap · 7.5% royalty');
      await expect(main).toContainText('Before the event, resale on NFTokenPass is capped at 1.5× face value.');

      // The cover image that was pinned, loaded from the IPFS gateway. It is decorative (no alt
      // text), and the page swaps it for a placeholder if it fails to load, so it is found by its
      // address and checked to have real pixels.
      const cid = event.image_url!.slice('ipfs://'.length);
      const image = main.locator(`img[src$="/ipfs/${cid}"]`);
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(64);

      await page.getByRole('button', { name: /About this event/ }).click();
      await expect(main).toContainText('An evening of opera under the harvest moon.');
    });

    await test.step('it is on the Events page', async () => {
      await page.goto('/');
      await page.getByLabel('Search events').fill(title);
      const card = page.getByRole('link', { name: new RegExp(title) });
      await expect(card).toBeVisible();
      await expect(card).toContainText('20.00 USDC'); // the cheapest ticket type
      await card.click();
      await expect(page).toHaveURL(new RegExp(`/events/${id}$`));
    });

    await test.step('the draft is no longer offered, and the event cannot be edited from the create flow', async () => {
      await page.goto(NEW_EVENT);
      await expect(page.getByLabel('Event name')).toHaveValue('');
      await expect(page.getByText('You have an unfinished draft')).toHaveCount(0);

      await page.goto(draftUrl(id));
      await expect(liveHeading(page)).toBeVisible();
      await expect(page.getByLabel('Event name')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Create another event' })).toHaveAttribute('href', NEW_EVENT);
    });
  });

  test('rejecting at each step, then publishing again, skips the finished steps', async ({ page, signIn, wallet }) => {
    const draft = await createDraft({ types: [GA, VIP] });
    await openAtReview(page, signIn, draft);
    const cancelled = page.getByRole('alert').filter({ hasText: 'The transaction was cancelled in your wallet. Nothing else changed: press Continue publishing to pick up from this step.' });

    await test.step('reject creating the event', async () => {
      wallet.rejectNext('send');
      await publishButton(page).click();
      await expect(cancelled).toBeVisible();
      await expectRows(page, ['Done', 'Failed', 'Waiting', 'Waiting']);
      expect((await apiEvent(draft.id)).status).toBe('FROZEN'); // step 1 is done and stays done
      expect((await chainEvent(draft.contractId)).configured).toBe(false);
    });

    await test.step('reject the second ticket type', async () => {
      wallet.rejectNext('send', 2); // the event and the first type go through
      await continueButton(page).click();
      await expect(cancelled).toBeVisible();
      await expectRows(page, ['Done', 'Done', 'Failed', 'Waiting']);
      expect(await chainEvent(draft.contractId)).toMatchObject({ configured: true, typeCount: 1n, active: false });
    });

    await test.step('reject opening sales', async () => {
      wallet.rejectNext('send', 1); // the second type goes through
      await continueButton(page).click();
      await expect(cancelled).toBeVisible();
      await expectRows(page, ['Done', 'Done', 'Done', 'Failed']);
      expect(await chainEvent(draft.contractId)).toMatchObject({ typeCount: 2n, active: false });
      expect((await apiEvent(draft.id)).status).toBe('FROZEN');
    });

    await test.step('publish again: only the last step is left', async () => {
      const before = sends(wallet);
      await continueButton(page).click();
      await expect(liveHeading(page)).toBeVisible({ timeout: 60_000 });
      expect(sends(wallet) - before).toBe(1);
    });

    // Three rejected and four confirmed: nothing was sent twice
    expect(sends(wallet)).toBe(7);
    expect(await chainEvent(draft.contractId)).toMatchObject({ typeCount: 2n, active: true });
    expect((await apiEvent(draft.id)).status).toBe('PUBLISHED');
  });

  test('leaving the page between steps and coming back picks up where it stopped', async ({ page, signIn, wallet }) => {
    const draft = await createDraft({ types: [GA, VIP] });
    await openAtReview(page, signIn, draft);

    wallet.rejectNext('send', 2); // stop after the event and the first ticket type
    await publishButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'The transaction was cancelled in your wallet.' })).toBeVisible();
    const sentBefore = sends(wallet);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Upcoming events' })).toBeVisible();
    await expect(page.getByText(draft.title)).toHaveCount(0); // not public yet

    // Back through "Create event": the draft is offered, and the review knows what is done
    await page.goto(NEW_EVENT);
    await expect(page.getByText(`You have an unfinished draft: ${draft.title}`)).toBeVisible();
    await page.getByRole('link', { name: 'Continue the draft' }).click();
    await expect(note(page, 'These details are frozen')).toBeVisible();
    await expect(page.getByLabel('Event name')).toBeDisabled();
    await expect(page.getByText('Uploaded to IPFS', { exact: true })).toBeVisible(); // no need to pick the image again
    await next(page, 'Ticket types');
    await expect(ticketCard(page, 1).getByLabel('Name', { exact: true })).toBeDisabled();
    await next(page, 'Sale rules');
    await next(page, 'Review');
    await expectRows(page, ['Done', 'Done', 'Ready', 'Waiting']);

    await continueButton(page).click();
    await expect(liveHeading(page)).toBeVisible({ timeout: 60_000 });
    expect(sends(wallet) - sentBefore).toBe(2); // the second ticket type and opening sales
    expect(await chainEvent(draft.contractId)).toMatchObject({ typeCount: 2n, active: true });
    expect((await apiEvent(draft.id)).status).toBe('PUBLISHED');
  });

  test('refreshing while a transaction is pending does not send it twice', async ({ page, signIn, wallet }) => {
    const draft = await createDraft();
    await openAtReview(page, signIn, draft);
    page.on('dialog', (dialog) => dialog.accept()); // "leave while publishing?"

    try {
      // Blocks only when asked, so the first transaction stays pending
      await chain.provider.send('evm_setAutomine', [false]);
      await publishButton(page).click();
      await expect(page.getByRole('button', { name: 'Waiting for confirmation…' })).toBeDisabled();
      await expectRows(page, ['Done', 'In progress', 'Waiting', 'Waiting']);
      expect(sends(wallet)).toBe(1);

      await page.reload();
      await expectRows(page, ['Done', 'Ready', 'Waiting', 'Waiting']); // not confirmed yet
      expect((await chainEvent(draft.contractId)).configured).toBe(false);
    } finally {
      await chain.provider.send('evm_setAutomine', [true]);
      await chain.mine();
    }

    // Once it confirms, continuing starts from the next step
    expect((await chainEvent(draft.contractId)).configured).toBe(true);
    await continueButton(page).click();
    await expect(liveHeading(page)).toBeVisible({ timeout: 60_000 });
    expect(sends(wallet)).toBe(3); // the event once, the ticket type, opening sales
    expect(await chainEvent(draft.contractId)).toMatchObject({ typeCount: 1n, active: true });
  });

  test('a failed upload to IPFS says so, and trying again works', async ({ page, signIn, wallet }) => {
    const draft = await createDraft();
    await openAtReview(page, signIn, draft);

    // The API's answer when Pinata is down
    await failOnce(page, `${API_URL}/api/events/${draft.id}/freeze`, 502, 'Failed to pin metadata to IPFS, please try again later');
    await publishButton(page).click();

    await expect(page.getByRole('alert').filter({ hasText: 'The upload to IPFS failed. Nothing was frozen. Try again in a moment.' })).toBeVisible();
    await expectRows(page, ['Failed', 'Waiting', 'Waiting', 'Waiting']);
    expect((await apiEvent(draft.id)).status).toBe('DRAFT');
    expect(sends(wallet)).toBe(0);

    await continueButton(page).click();
    await expect(liveHeading(page)).toBeVisible({ timeout: 60_000 });
    const event = await apiEvent(draft.id);
    expect(event.status).toBe('PUBLISHED');
    expect(event.image_url).toMatch(/^ipfs:\/\//);
  });

  test('an event ID already taken by another wallet blocks publishing', async ({ page, signIn, wallet }) => {
    try {
      const draft = await createDraft();
      // Another organizer's wallet set up the same event ID on the contract
      await mined(chain.ticketNft(accounts.admin).grantRole(ORGANIZER_ROLE, accounts.jordan.address));
      await mined(chain.ticketNft(accounts.jordan).configureEvent(draft.contractId, Math.floor(draft.startsAt / 1000), 1000, 20_000, 4));

      await openAtReview(page, signIn, draft);
      await expect(page.getByRole('alert').filter({ hasText: 'This event belongs to another wallet on-chain' })).toContainText('Connect the wallet that started publishing this event.');
      await expect(publishButton(page)).toBeDisabled();
      expect(sends(wallet)).toBe(0);
      expect((await apiEvent(draft.id)).status).toBe('DRAFT');
      expect((await chainEvent(draft.contractId)).organizer).toBe(accounts.jordan.address);
    } finally {
      await resetStack();
    }
  });

  test("ticket types on the contract that don't match the event block publishing", async ({ page, signIn, wallet }) => {
    const draft = await createDraft(); // one ticket type
    // The contract already has two for this event ID
    const nft = chain.ticketNft(accounts.organizer);
    await mined(nft.configureEvent(draft.contractId, Math.floor(draft.startsAt / 1000), 1000, 20_000, 4));
    await mined(nft.addTicketType(draft.contractId, chain.usdc(20), 100, 'ipfs://another-type-1'));
    await mined(nft.addTicketType(draft.contractId, chain.usdc(30), 100, 'ipfs://another-type-2'));

    await openAtReview(page, signIn, draft);
    await expect(page.getByRole('alert').filter({ hasText: "The on-chain ticket types don't match this event" })).toContainText('Contact an admin before publishing.');
    await expect(publishButton(page)).toBeDisabled();
    expect(sends(wallet)).toBe(0);
    expect((await apiEvent(draft.id)).status).toBe('DRAFT');
  });

  test('once a ticket has sold, the sale rules are locked to what the contract has', async ({ page, signIn }) => {
    const draft = await createDraft();
    await openAtReview(page, signIn, draft);

    // Everything goes on-chain, but the last step (the API's) fails
    await failOnce(page, `${API_URL}/api/events/${draft.id}/publish`, 500, 'Failed to publish event');
    await publishButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Publishing failed on the server. The event is set up on-chain; press Continue publishing to try again.' })).toBeVisible();
    await expectRows(page, ['Done', 'Done', 'Done', 'Failed']);
    expect(await chainEvent(draft.contractId)).toMatchObject({ active: true, perWalletLimit: 4n });
    expect((await apiEvent(draft.id)).status).toBe('FROZEN');

    // Sales are open on the contract, and someone buys before the organizer comes back
    await chain.buyTickets(accounts.jordan, { eventId: draft.contractId });
    await page.reload();
    await page.getByRole('button', { name: /^Sale rules \(done\)/ }).click();

    await expect(note(page, 'Rules are locked')).toContainText("Tickets have already sold, so these are the contract's rules and they can't change anymore.");
    for (const label of ['Per-wallet limit', 'Sales end', 'Resale price cap', 'Organizer royalty (%)']) await expect(page.getByLabel(label)).toBeDisabled();
    await expect(page.getByLabel('Per-wallet limit')).toHaveValue('4');
    await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);

    // Publishing still finishes, with the contract's rules untouched
    await next(page, 'Review');
    await expect(page.getByRole('button', { name: 'Edit sale rules' })).toHaveCount(0);
    await continueButton(page).click();
    await expect(liveHeading(page)).toBeVisible({ timeout: 60_000 });
    expect(await chainEvent(draft.contractId)).toMatchObject({ perWalletLimit: 4n, sold: 1n });
    expect((await apiEvent(draft.id)).status).toBe('PUBLISHED');
  });

  test('not enough ETH for gas says so, and publishing continues once the wallet has some', async ({ page, signIn }) => {
    try {
      const draft = await createDraft();
      await openAtReview(page, signIn, draft);

      await chain.setEth(accounts.organizer.address, 0);
      await publishButton(page).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Your wallet does not have enough ETH to pay for gas.' })).toBeVisible();
      await expectRows(page, ['Done', 'Failed', 'Waiting', 'Waiting']);
      expect((await chainEvent(draft.contractId)).configured).toBe(false);

      await chain.setEth(accounts.organizer.address, 100);
      await continueButton(page).click();
      await expect(liveHeading(page)).toBeVisible({ timeout: 60_000 });
      expect((await chainEvent(draft.contractId)).active).toBe(true);
    } finally {
      await chain.setEth(accounts.organizer.address, 10_000);
    }
  });

  test('on the wrong network the page asks to switch before anything is sent', async ({ page, signIn, wallet }) => {
    const draft = await createDraft();
    await openAtReview(page, signIn, draft);

    await wallet.switchNetwork(SEPOLIA_CHAIN_ID); // a network the app knows, but not the contract's here
    await expect(note(page, 'Wrong network')).toContainText('Switch your wallet to the network the ticket contract is on to publish.');
    await expect(publishButton(page)).toHaveCount(0);
    expect((await apiEvent(draft.id)).status).toBe('DRAFT');

    await page.getByRole('button', { name: 'Switch network' }).click();
    await expect(note(page, 'Wrong network')).toHaveCount(0);
    expect(wallet.requests).toContain('wallet_switchEthereumChain');
    expect(sends(wallet)).toBe(0);

    await publishButton(page).click();
    await expect(liveHeading(page)).toBeVisible({ timeout: 60_000 });
    expect((await chainEvent(draft.contractId)).active).toBe(true);
  });

  test('switching account or disconnecting between steps sends nothing from the wrong wallet, and the organizer can resume', async ({ page, signIn, wallet }) => {
    const draft = await createDraft({ types: [GA, VIP] });
    await openAtReview(page, signIn, draft);

    wallet.rejectNext('send', 1); // stop after the event is created
    await publishButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'The transaction was cancelled in your wallet.' })).toBeVisible();
    const sentBefore = sends(wallet);
    const stateBefore = await chainEvent(draft.contractId);

    await test.step('another account in the wallet', async () => {
      await wallet.switchAccount(accounts.jordan);
      await expect(continueButton(page)).toHaveCount(0);
      await expect(publishRows(page)).toHaveCount(0); // the form is gone for this account
      expect(sends(wallet)).toBe(sentBefore);
    });

    await test.step('disconnected', async () => {
      await wallet.disconnect();
      await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
      expect(sends(wallet)).toBe(sentBefore);
      expect(await chainEvent(draft.contractId)).toEqual(stateBefore);
    });

    await test.step('the organizer signs in again and resumes', async () => {
      await signIn('organizer', { path: draftUrl(draft.id, 'review') });
      await expectRows(page, ['Done', 'Done', 'Ready', 'Waiting']);
      await continueButton(page).click();
      await expect(liveHeading(page)).toBeVisible({ timeout: 60_000 });
      expect(sends(wallet) - sentBefore).toBe(3); // two ticket types and opening sales
      expect(await chainEvent(draft.contractId)).toMatchObject({ organizer: accounts.organizer.address, typeCount: 2n, active: true });
    });
  });

  test('double-clicking the publish button sends each transaction once', async ({ page, signIn, wallet }) => {
    const draft = await createDraft({ types: [GA, VIP] });
    await openAtReview(page, signIn, draft);

    await publishButton(page).dblclick();
    await expect(liveHeading(page)).toBeVisible({ timeout: 60_000 });

    expect(sends(wallet)).toBe(4); // the event, two ticket types, opening sales
    expect(await chainEvent(draft.contractId)).toMatchObject({ typeCount: 2n, active: true });
    await waitForSync();
    expect((await apiEvent(draft.id)).ticket_types).toHaveLength(2);
  });
});
