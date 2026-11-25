// The admin page (#341): who can open it, organizer requests, organizers and the Events tab.
//
// Tests that need a new person use their own new wallet (Hardhat's accounts #10 and up), set up
// through the API, and tests that change an event use their own event, so no test depends on
// another one or on the order they run in.

import type { Locator, Page } from '@playwright/test';

import {
  accounts,
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
  type TestWallet,
} from '../fixtures/index.js';
import { API_URL, CHAIN_ID } from '../stack/config.mjs';

// --- Helpers -------------------------------------------------------------------------------------

type SignIn = (who: Account | Role, options?: { path?: string }) => Promise<void>;

let adminApi: Promise<ApiSession> | undefined;
/** One API session as the admin, for the checks */
function admin() {
  if (!adminApi) adminApi = ApiSession.signIn(accounts.admin);
  return adminApi;
}

/** A finished account for Hardhat's account #index, made through the API the way sign-up does */
async function createAccount(index: number, profile: { first_name: string; last_name: string; email: string }) {
  const account = newWallet(index);
  const session = await ApiSession.signIn(account);
  await session.put('/api/users/me', profile);
  return { account, session };
}

/** A new account that asks to become an organizer. `name` is what the admin page shows for it. */
async function requestOrganizer(index: number, request: { organization_name?: string; message?: string } = {}) {
  const lastName = `Lambert ${index}`;
  const { account, session } = await createAccount(index, { first_name: 'Nora', last_name: lastName, email: `nora.${index}@example.com` });
  await session.post('/api/users/me/organizer-request', request);
  return { account, name: request.organization_name ?? `Nora ${lastName}` };
}

const organizerRole = async () => (await chain.ticketNft().ORGANIZER_ROLE()) as string;
const hasOrganizerRole = async (account: Account) => (await chain.ticketNft().hasRole(await organizerRole(), account.address)) as boolean;

/** Grants or revokes ORGANIZER_ROLE from the admin's wallet without the page (what Approve and Revoke send), then waits for the API */
async function setOrganizerRole(account: Account, granted: boolean) {
  const nft = chain.ticketNft(accounts.admin);
  const role = await organizerRole();
  const tx = granted ? await nft.grantRole(role, account.address) : await nft.revokeRole(role, account.address);
  const receipt = await tx.wait();
  await waitForSync(receipt?.blockNumber);
}

/** A new account that is already an organizer, with ETH to create events */
async function createOrganizer(index: number) {
  const { account } = await createAccount(index, { first_name: 'Olivia', last_name: `Organizer ${index}`, email: `olivia.${index}@example.com` });
  await chain.setEth(account.address, 10);
  await setOrganizerRole(account, true);
  return { account, name: `Olivia Organizer ${index}` };
}

interface RequestRow {
  id: string;
  wallet: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

async function allRequests() {
  return (await admin()).get<RequestRow[]>('/api/admin/organizer-requests');
}

async function latestRequest(account: Account) {
  return (await allRequests()).filter((row) => row.wallet === account.address.toLowerCase()).pop();
}

async function organizerWallets() {
  return (await (await admin()).get<Array<{ wallet: string }>>('/api/admin/organizers')).map((row) => row.wallet);
}

interface AdminEventRow {
  title: string;
  status: 'DRAFT' | 'FROZEN' | 'PUBLISHED';
  presale_active: boolean;
  contract_event_id: string | null;
  sold: number;
  supply: number;
  royalty_bps: number | null;
  resale_cap_bps: number | null;
  per_wallet_limit: number | null;
  organizer: { wallet: string; first_name: string | null; last_name: string | null; nickname: string | null; organization_name: string | null };
}

/** The Events tab's list from the API, as the admin */
async function adminEvents(params: { q?: string; live?: boolean; page?: number } = {}) {
  const query = new URLSearchParams({ page: String(params.page ?? 1), limit: '20' });
  if (params.q) query.set('q', params.q);
  if (params.live !== undefined) query.set('live', String(params.live));
  return (await admin()).get<{ events: AdminEventRow[]; total: number }>(`/api/admin/events?${query}`);
}

/** A draft event of the seeded organizer (not published, so not on the contract) */
async function createDraft(title: string) {
  const start = Date.now() + 30 * 86_400_000;
  const organizer = await ApiSession.signIn(accounts.organizer);
  await organizer.post('/api/events', {
    title,
    description: 'A draft from an end-to-end test.',
    category: 'Concerts',
    location: 'Ottawa, ON',
    start_date: new Date(start).toISOString(),
    end_date: new Date(start + 3 * 3_600_000).toISOString(),
  });
}

// The page's own formatting, to compare with the API's values
const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const percentText = (bps: number | null) => (bps === null ? '—' : `${Number((bps / 100).toFixed(2))}%`);
const capText = (bps: number | null) => (bps === null ? '—' : bps === 0 ? 'No cap' : `${Number((bps / 10_000).toFixed(2))}×`);
const statusText = (event: AdminEventRow) => (event.status !== 'PUBLISHED' ? 'Draft' : event.presale_active ? 'Presale' : 'Published');
const soldText = (event: AdminEventRow) =>
  event.status === 'PUBLISHED' && event.contract_event_id !== null ? `${event.sold.toLocaleString('en-US')} of ${event.supply.toLocaleString('en-US')}` : '—';
const organizerName = (o: AdminEventRow['organizer']) =>
  o.organization_name?.trim() || o.nickname?.trim() || [o.first_name, o.last_name].filter(Boolean).join(' ') || shortAddress(o.wallet);

/** A time as a datetime-local input shows it in the browser's time zone ("2026-12-14T19:00") */
function localInput(ms: number): string {
  const timeZone = test.info().project.use.timezoneId ?? 'America/Toronto';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

const sentTransactions = (wallet: TestWallet) => wallet.requests.filter((method) => method === 'eth_sendTransaction').length;
const SETTINGS_SAVED = 'Settings updated on-chain. The organizer and ticket holders see them now.';

/** Signs in as the admin on /admin and waits until the contract has confirmed the admin role */
async function openAdmin(page: Page, signIn: SignIn, tabName?: 'Organizers' | 'Events') {
  await signIn('admin', { path: '/admin' });
  await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
  await expect(page.getByText('Checking your admin wallet')).toHaveCount(0);
  if (tabName) await tab(page, tabName).click();
}

const tab = (page: Page, name: 'Organizer requests' | 'Organizers' | 'Events') => page.getByRole('tab', { name: new RegExp(`^${name}\\s*\\d+$`) });
const pendingSection = (page: Page) => page.locator('section').filter({ has: page.getByRole('heading', { name: 'Pending requests' }) });
const decisionsSection = (page: Page) => page.locator('section').filter({ has: page.getByRole('heading', { name: 'Recent decisions' }) });
const organizersSection = (page: Page) => page.locator('section').filter({ has: page.getByRole('heading', { name: 'Organizers', exact: true }) });

/** A wallet's row in a table, found by its wallet chip */
const rowOf = (scope: Locator, account: Account) =>
  scope.getByRole('row').filter({ has: scope.page().getByRole('button', { name: `Copy wallet address ${account.address.toLowerCase()}`, exact: true }) });

/** Answers the next window.confirm, and gives its text */
function answerConfirm(page: Page, accept: boolean): Promise<string> {
  return new Promise((resolve) => {
    page.once('dialog', (dialog) => {
      resolve(dialog.message());
      void (accept ? dialog.accept() : dialog.dismiss());
    });
  });
}

const eventRows = (page: Page) => page.getByRole('table', { name: 'All events' }).locator('tbody').getByRole('row');
const eventRow = (page: Page, title: string) => eventRows(page).filter({ hasText: title });

/** Opens "Edit event settings" for an event and waits for the contract's values */
async function openSettings(page: Page, title: string) {
  await page.getByLabel('Search event or organizer').fill(title);
  await page.getByRole('button', { name: `Edit settings of ${title}`, exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Edit event settings' });
  await expect(panel.getByLabel('Royalty (%)')).toBeVisible();
  return panel;
}

// --- Access --------------------------------------------------------------------------------------

test.describe('access', () => {
  test('the admin sees the Admin link and the page', async ({ page, signIn }) => {
    await signIn('admin', { path: '/' });
    await openMenuIfPhone(page);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Admin', exact: true }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
    await expect(tab(page, 'Organizer requests')).toBeVisible();
    await expect(page.getByText('Checking your admin wallet')).toHaveCount(0);
    await expect(page.getByText('This wallet cannot make changes')).toHaveCount(0);
  });

  const OTHERS: Array<{ who: string; role: Role | null }> = [
    { who: 'signed-out visitors', role: null },
    { who: 'attendees', role: 'attendee' },
    { who: 'organizers', role: 'organizer' },
  ];

  for (const { who, role } of OTHERS) {
    test(`${who} don't see the link, can't use the page, and the admin API refuses them`, async ({ page, signIn }) => {
      if (role) {
        await signIn(role, { path: '/admin' });
        await expect(page.getByText('Admin access required')).toBeVisible();
      } else {
        await page.goto('/admin');
        await expect(page.getByRole('heading', { name: 'Connect your admin wallet' })).toBeVisible();
      }
      await expect(page.getByRole('tablist', { name: 'Admin sections' })).toHaveCount(0);
      await openMenuIfPhone(page);
      await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);

      // With this page's session (or none): 401 signed out, 403 without the admin role
      const calls = [
        ['GET', '/api/admin/organizer-requests'],
        ['POST', '/api/admin/organizer-requests/any-id/reject'],
        ['GET', '/api/admin/organizers'],
        ['POST', `/api/admin/organizers/${accounts.jordan.address}`],
        ['DELETE', `/api/admin/organizers/${accounts.organizer.address}`],
        ['GET', '/api/admin/events'],
      ] as const;
      for (const [method, path] of calls) {
        const res = await page.request.fetch(`${API_URL}${path}`, { method, data: method === 'POST' ? {} : undefined });
        expect(res.status(), `${method} ${path}`).toBe(role ? 403 : 401);
      }
    });
  }

  test("an admin account whose wallet lacks the contract's admin role sees the notice and can't make changes", async ({ page, signIn }) => {
    const { account: requester } = await requestOrganizer(10);
    const adminRole = (await chain.ticketNft().DEFAULT_ADMIN_ROLE()) as string;
    // Another wallet takes the contract's admin role, as if the contract had a new admin
    const other = newWallet(11);
    await chain.setEth(other.address, 10);
    await (await chain.ticketNft(accounts.admin).grantRole(adminRole, other.address)).wait();
    await (await chain.ticketNft(other).revokeRole(adminRole, accounts.admin.address)).wait();

    try {
      await openAdmin(page, signIn);
      await expect(page.getByText('This wallet cannot make changes')).toBeVisible();
      await expect(rowOf(pendingSection(page), requester).getByRole('button', { name: 'Approve' })).toBeDisabled();

      await tab(page, 'Organizers').click();
      await expect(rowOf(organizersSection(page), accounts.organizer).getByRole('button', { name: 'Revoke' })).toBeDisabled();

      await tab(page, 'Events').click();
      const panel = await openSettings(page, seededEvents.gala.title);
      await panel.getByLabel('Royalty (%)').fill('11');
      await expect(panel.getByText('Admin wallet required')).toBeVisible();
      await expect(panel.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    } finally {
      // Give the role back to the platform's admin wallet
      await (await chain.ticketNft(other).grantRole(adminRole, accounts.admin.address)).wait();
      await (await chain.ticketNft(other).renounceRole(adminRole, other.address)).wait();
    }
  });

  test('wrong network: the switch prompt works, then actions work', async ({ page, wallet, signIn }) => {
    const { account } = await requestOrganizer(12);
    await openAdmin(page, signIn);
    await wallet.switchNetwork(1);

    const prompt = page.locator('[data-slot="alert"]', { hasText: 'Switch network to make changes' });
    await expect(prompt).toBeVisible();
    await expect(rowOf(pendingSection(page), account).getByRole('button', { name: 'Approve' })).toBeDisabled();

    await prompt.getByRole('button', { name: 'Switch network', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    expect(wallet.chainId).toBe(CHAIN_ID);

    await rowOf(pendingSection(page), account).getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Organizer approved', { exact: true })).toBeVisible();
    expect(await hasOrganizerRole(account)).toBe(true);
  });
});

// --- Organizer requests --------------------------------------------------------------------------

test.describe('organizer requests', () => {
  test('pending requests show name, organization and wallet', async ({ page, signIn }) => {
    const withOrganization = await requestOrganizer(13, { organization_name: 'Lambert Events', message: 'Jazz nights in Ottawa' });
    const withoutOrganization = await requestOrganizer(14);
    await openAdmin(page, signIn);

    // The organization comes first when there is one, otherwise the person's name
    const first = rowOf(pendingSection(page), withOrganization.account);
    await expect(first).toContainText('Lambert Events');
    await expect(first).toContainText('Jazz nights in Ottawa');
    await expect(first).toContainText('nora.13@example.com');
    await expect(first).toContainText(shortAddress(withOrganization.account.address.toLowerCase()));
    const second = rowOf(pendingSection(page), withoutOrganization.account);
    await expect(second).toContainText('Nora Lambert 14');
    await expect(second).toContainText(shortAddress(withoutOrganization.account.address.toLowerCase()));

    const pending = (await allRequests()).filter((row) => row.status === 'PENDING').length;
    await expect(tab(page, 'Organizer requests')).toHaveAccessibleName(new RegExp(`^Organizer requests\\s*${pending}$`));
  });

  test('approve: wallet transaction, role granted on-chain, request marked approved, the person appears under Organizers', async ({ page, wallet, signIn }) => {
    const { account, name } = await requestOrganizer(15, { organization_name: 'Northern Lights Live' });
    await openAdmin(page, signIn);
    const sent = sentTransactions(wallet);

    await rowOf(pendingSection(page), account).getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Organizer approved', { exact: true })).toBeVisible();
    await expect(page.getByText(`${name} can now create events.`)).toBeVisible();

    expect(sentTransactions(wallet)).toBe(sent + 1);
    expect(await hasOrganizerRole(account)).toBe(true);
    expect((await latestRequest(account))?.status).toBe('APPROVED');
    await expect(rowOf(pendingSection(page), account)).toHaveCount(0);
    await expect(rowOf(decisionsSection(page), account)).toContainText('Approved');

    await tab(page, 'Organizers').click();
    await expect(rowOf(organizersSection(page), account)).toContainText(name);
  });

  // The page has no field for a reason yet, so the request is rejected without one
  test('reject: confirm, then the request is marked rejected', async ({ page, wallet, signIn }) => {
    const { account, name } = await requestOrganizer(16);
    await openAdmin(page, signIn);
    const sent = sentTransactions(wallet);

    const confirm = answerConfirm(page, true);
    await rowOf(pendingSection(page), account).getByRole('button', { name: 'Reject' }).click();
    expect(await confirm).toBe(`Reject ${name}'s organizer request?`);
    await expect(page.getByText('Request rejected', { exact: true })).toBeVisible();

    expect(sentTransactions(wallet)).toBe(sent); // rejecting is database only
    expect((await latestRequest(account))?.status).toBe('REJECTED');
    await expect(rowOf(pendingSection(page), account)).toHaveCount(0);
    await expect(rowOf(decisionsSection(page), account)).toContainText('Rejected');
  });

  test('cancelling the confirm changes nothing', async ({ page, signIn }) => {
    const { account } = await requestOrganizer(17);
    await openAdmin(page, signIn);

    const confirm = answerConfirm(page, false);
    await rowOf(pendingSection(page), account).getByRole('button', { name: 'Reject' }).click();
    await confirm;

    await expect(rowOf(pendingSection(page), account).getByRole('button', { name: 'Reject' })).toBeEnabled();
    await expect(page.getByText('Request rejected', { exact: true })).toHaveCount(0);
    expect((await latestRequest(account))?.status).toBe('PENDING');
  });

  test('rejecting the transaction in the wallet changes nothing', async ({ page, wallet, signIn }) => {
    const { account } = await requestOrganizer(18);
    await openAdmin(page, signIn);

    wallet.rejectNext('send');
    await rowOf(pendingSection(page), account).getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('The transaction was cancelled in your wallet.')).toBeVisible();

    await expect(rowOf(pendingSection(page), account).getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(await hasOrganizerRole(account)).toBe(false);
    expect((await latestRequest(account))?.status).toBe('PENDING');
  });

  test('the API fails after the on-chain approval: the warning, and refreshing fixes it', async ({ page, signIn }) => {
    const { account, name } = await requestOrganizer(19);
    await openAdmin(page, signIn);

    // Saving the approval can't reach the API
    const url = `**/api/admin/organizers/${account.address.toLowerCase()}`;
    await page.route(url, (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
    await rowOf(pendingSection(page), account).getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Approved on-chain, but the database was not updated')).toBeVisible();
    expect(await hasOrganizerRole(account)).toBe(true);

    // What the warning says: refresh in a moment, the listener has saved the approval
    await page.unroute(url);
    await waitForSync();
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(rowOf(pendingSection(page), account)).toHaveCount(0);
    await tab(page, 'Organizers').click();
    await expect(rowOf(organizersSection(page), account)).toContainText(name);
    expect((await latestRequest(account))?.status).toBe('APPROVED');
  });

  test('approving a wallet that already has the organizer role', async ({ page, wallet, signIn }) => {
    const { account, name } = await requestOrganizer(20);
    await openAdmin(page, signIn);
    await expect(rowOf(pendingSection(page), account)).toBeVisible();

    // Meanwhile the role is granted from elsewhere: this page still shows the request as pending
    await setOrganizerRole(account, true);
    const sent = sentTransactions(wallet);
    await rowOf(pendingSection(page), account).getByRole('button', { name: 'Approve' }).click();

    await expect(page.getByText('Organizer approved', { exact: true })).toBeVisible();
    expect(sentTransactions(wallet)).toBe(sent + 1);
    expect(await hasOrganizerRole(account)).toBe(true);
    await tab(page, 'Organizers').click();
    await expect(rowOf(organizersSection(page), account)).toHaveCount(1);
    await expect(rowOf(organizersSection(page), account)).toContainText(name);
  });

  test('a long list of requests stays usable', async ({ page, signIn }) => {
    const requests: Array<Awaited<ReturnType<typeof requestOrganizer>>> = [];
    for (let index = 40; index < 60; index++) requests.push(await requestOrganizer(index));
    await openAdmin(page, signIn);

    for (const { account } of requests) await expect(rowOf(pendingSection(page), account)).toHaveCount(1);
    const pending = (await allRequests()).filter((row) => row.status === 'PENDING').length;
    await expect(tab(page, 'Organizer requests')).toHaveAccessibleName(new RegExp(`^Organizer requests\\s*${pending}$`));

    // The last one, far down the list (and to the side on a phone), can still be handled
    const last = requests[requests.length - 1];
    const confirm = answerConfirm(page, true);
    await rowOf(pendingSection(page), last.account).getByRole('button', { name: 'Reject' }).click();
    await confirm;
    await expect(page.getByText('Request rejected', { exact: true })).toBeVisible();
    await expect(rowOf(pendingSection(page), last.account)).toHaveCount(0);
    await expect(rowOf(pendingSection(page), requests[0].account)).toHaveCount(1);
  });
});

// --- Organizers ----------------------------------------------------------------------------------

test.describe('organizers', () => {
  test('the list matches the wallets with the organizer role', async ({ page, signIn }) => {
    await createOrganizer(21);
    await openAdmin(page, signIn, 'Organizers');

    const wallets = await organizerWallets();
    await expect(tab(page, 'Organizers')).toHaveAccessibleName(new RegExp(`^Organizers\\s*${wallets.length}$`));
    await expect(organizersSection(page).locator('tbody').getByRole('row')).toHaveCount(wallets.length);
    for (const wallet of wallets) {
      await expect(organizersSection(page).getByRole('button', { name: `Copy wallet address ${wallet}`, exact: true })).toBeVisible();
      expect(await chain.ticketNft().hasRole(await organizerRole(), wallet), wallet).toBe(true);
    }
    // An attendee has neither
    expect(wallets).not.toContain(accounts.alex.address.toLowerCase());
    expect(await hasOrganizerRole(accounts.alex)).toBe(false);
  });

  test('revoke: confirm, transaction, role removed on-chain and in the API', async ({ page, wallet, signIn }) => {
    const { account, name } = await createOrganizer(22);
    await openAdmin(page, signIn, 'Organizers');
    const sent = sentTransactions(wallet);

    const confirm = answerConfirm(page, true);
    await rowOf(organizersSection(page), account).getByRole('button', { name: 'Revoke' }).click();
    expect(await confirm).toBe(`Revoke organizer access for ${name}?`);
    const notice = page.getByText('Organizer access revoked', { exact: true });
    await expect(notice).toBeVisible();

    // The notice and the receipt belong to this tab: moving to another one clears them
    const receipt = page.locator('[data-slot="transaction-status"]');
    await expect(receipt).toContainText('Confirmed');
    await tab(page, 'Events').click();
    await expect(notice).toHaveCount(0);
    await expect(receipt).toHaveCount(0);
    await tab(page, 'Organizers').click();

    expect(sentTransactions(wallet)).toBe(sent + 1);
    expect(await hasOrganizerRole(account)).toBe(false);
    await expect(rowOf(organizersSection(page), account)).toHaveCount(0);
    expect(await organizerWallets()).not.toContain(account.address.toLowerCase());
    expect((await (await ApiSession.signIn(account)).get<{ role: string }>('/api/users/me')).role).toBe('USER');
  });

  test('a revoked organizer loses the Organizer link after signing in again', async ({ page, signIn }) => {
    const { account } = await createOrganizer(23);
    const organizerLink = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Organizer', exact: true });
    await signIn(account, { path: '/' });
    await openMenuIfPhone(page);
    await expect(organizerLink).toBeVisible();

    await setOrganizerRole(account, false);
    await page.getByRole('banner').getByRole('button', { name: 'Disconnect wallet' }).click();
    await expect(page.getByRole('banner').getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible();

    await signIn(account, { path: '/' });
    await openMenuIfPhone(page);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My Tickets', exact: true })).toBeVisible();
    await expect(organizerLink).toHaveCount(0);
  });

  test("a revoked organizer's published events stay public, and their tickets still work", async ({ page }) => {
    const { account } = await createOrganizer(24);
    const event = await createPublishedEvent({ organizer: account });
    const { tokenIds } = await chain.buyTickets(accounts.jordan, { eventId: event.contractId });

    await setOrganizerRole(account, false);

    await page.goto(`/events/${event.apiId}`);
    await expect(page.getByRole('heading', { level: 1, name: event.title })).toBeVisible();
    expect((await apiGet<{ status: string }>(`/api/events/${event.apiId}`)).status).toBe('PUBLISHED');
    // Tickets can still be bought, and the ones sold can still be checked in
    await chain.buyTickets(accounts.alex, { eventId: event.contractId });
    await chain.checkIn(accounts.admin, tokenIds[0]);
    expect(await chain.ticketNft().isUsed(tokenIds[0])).toBe(true);
  });

  test('cancelling the confirm or rejecting in the wallet changes nothing', async ({ page, wallet, signIn }) => {
    const { account } = await createOrganizer(25);
    await openAdmin(page, signIn, 'Organizers');
    const revoke = rowOf(organizersSection(page), account).getByRole('button', { name: 'Revoke' });
    const sent = sentTransactions(wallet);

    const cancelled = answerConfirm(page, false);
    await revoke.click();
    await cancelled;
    expect(sentTransactions(wallet)).toBe(sent);

    wallet.rejectNext('send');
    const confirmed = answerConfirm(page, true);
    await revoke.click();
    await confirmed;
    await expect(page.getByText('The transaction was cancelled in your wallet.')).toBeVisible();

    await expect(revoke).toBeEnabled();
    expect(await hasOrganizerRole(account)).toBe(true);
    expect(await organizerWallets()).toContain(account.address.toLowerCase());
  });

  test('adding an organizer by wallet through the API: invalid address, already an organizer, a wallet without an account', async () => {
    const api = await admin();
    await expect(api.post('/api/admin/organizers/not-a-wallet', {})).rejects.toMatchObject({ status: 400 });

    // Already an organizer: nothing changes, still listed once
    await api.post(`/api/admin/organizers/${accounts.organizer.address}`, {});
    expect((await organizerWallets()).filter((wallet) => wallet === accounts.organizer.address.toLowerCase())).toHaveLength(1);

    // A wallet that never signed in: refused until it has the role on-chain; then the listener creates its account
    const stranger = newWallet(26);
    await expect(api.post(`/api/admin/organizers/${stranger.address}`, {})).rejects.toMatchObject({ status: 409 });
    await setOrganizerRole(stranger, true);
    await api.post(`/api/admin/organizers/${stranger.address}`, {});
    expect(await organizerWallets()).toContain(stranger.address.toLowerCase());
  });
});

// --- Events tab (#296, #297) ---------------------------------------------------------------------

test.describe('events tab', () => {
  test('every event in every status, newest first, with organizer, status, sold, royalty and resale cap', async ({ page, signIn }) => {
    const draft = `E2E draft ${Date.now().toString(36)}`;
    await createDraft(draft);
    await openAdmin(page, signIn, 'Events');

    const { events } = await adminEvents();
    expect(events[0].title).toBe(draft); // the newest first
    await expect(eventRows(page)).toHaveCount(events.length);
    for (const [i, event] of events.entries()) {
      const cells = eventRows(page).nth(i).getByRole('cell');
      await expect(cells.nth(0)).toContainText(event.title);
      await expect(cells.nth(1)).toContainText(organizerName(event.organizer));
      await expect(cells.nth(2)).toHaveText(statusText(event));
      await expect(cells.nth(3)).toHaveText(soldText(event));
      await expect(cells.nth(4)).toHaveText(percentText(event.royalty_bps));
      await expect(cells.nth(5)).toHaveText(capText(event.resale_cap_bps));
    }
  });

  test('search by event title, organizer name, organization and wallet; no results; clearing the search', async ({ page, signIn }) => {
    // An organizer whose approved request has an organization name, with one event
    const { account } = await requestOrganizer(27, { organization_name: 'Aurora Presents' });
    await chain.setEth(account.address, 10);
    await setOrganizerRole(account, true);
    const event = await createPublishedEvent({ organizer: account, title: `Night Market ${Date.now().toString(36)}` });
    await openAdmin(page, signIn, 'Events');
    const search = page.getByLabel('Search event or organizer');

    await search.fill('Gala Opera');
    await expect(eventRow(page, seededEvents.gala.title)).toBeVisible();
    await expect(eventRows(page)).toHaveCount(1);

    await search.fill('Aurora'); // the organization
    await expect(eventRow(page, event.title)).toBeVisible();
    await expect(eventRows(page)).toHaveCount(1);

    await search.fill('Sophie Martin'); // the organizer's name
    const sophie = await adminEvents({ q: 'Sophie Martin' });
    await expect(eventRows(page)).toHaveCount(sophie.events.length);
    await expect(eventRow(page, event.title)).toHaveCount(0);

    await search.fill(account.address); // the organizer's wallet
    await expect(eventRows(page)).toHaveCount(1);
    await expect(eventRow(page, event.title)).toBeVisible();

    await search.fill('zzqx');
    await expect(page.getByText('No events match')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(search).toHaveValue('');
    await expect(eventRows(page)).toHaveCount((await adminEvents()).events.length);
  });

  test('status filter together with the search, pagination and the tab count', async ({ page, signIn }) => {
    const stamp = Date.now().toString(36);
    for (let i = 1; i <= 21; i++) await createDraft(`Paging draft ${stamp} ${String(i).padStart(2, '0')}`);
    await openAdmin(page, signIn, 'Events');

    // The tab and the badge count every event, 20 a page
    const all = await adminEvents();
    await expect(tab(page, 'Events')).toHaveAccessibleName(new RegExp(`^Events\\s*${all.total}$`));
    await expect(page.getByText(`${all.total} total`, { exact: true })).toBeVisible();
    const pages = Math.ceil(all.total / 20);
    const pager = page.getByRole('navigation', { name: 'Events pages' });
    await expect(pager.getByText(`Page 1 of ${pages}`)).toBeVisible();
    await pager.getByRole('button', { name: 'Next' }).click();
    await expect(pager.getByText(`Page 2 of ${pages}`)).toBeVisible();
    await expect(eventRows(page).first()).toContainText((await adminEvents({ page: 2 })).events[0].title);
    await pager.getByRole('button', { name: 'Previous' }).click();
    await expect(pager.getByText(`Page 1 of ${pages}`)).toBeVisible();

    // Drafts only
    const status = page.getByLabel('Filter by status');
    await status.selectOption('draft');
    const drafts = await adminEvents({ live: false });
    await expect(page.getByText(`${drafts.total} of ${all.total}`, { exact: true })).toBeVisible();
    await expect(eventRows(page)).toHaveCount(drafts.events.length);
    await expect(eventRows(page).filter({ hasNotText: 'Not live yet' })).toHaveCount(0);

    // Published, with a search; then drafts with the same search: nothing
    await status.selectOption('live');
    await page.getByLabel('Search event or organizer').fill('Jazz');
    await expect(eventRows(page)).toHaveCount(1);
    await expect(eventRow(page, seededEvents.jazz.title)).toContainText('Presale');
    await status.selectOption('draft');
    await expect(page.getByText('No events match')).toBeVisible();
  });

  test('drafts show "Not live yet" and can\'t be edited', async ({ page, signIn }) => {
    const title = `Unpublished ${Date.now().toString(36)}`;
    await createDraft(title);
    await openAdmin(page, signIn, 'Events');
    await page.getByLabel('Search event or organizer').fill(title);

    const row = eventRow(page, title);
    await expect(row).toContainText('Draft');
    await expect(row).toContainText('Not live yet');
    await expect(row.getByRole('button', { name: /Edit settings/ })).toHaveCount(0);
    await expect(row.getByRole('link', { name: title })).toHaveCount(0);
  });

  test("Edit settings starts from the contract's current values; Save is disabled until something changes", async ({ page, signIn }) => {
    const event = await createPublishedEvent();
    // Changed on the contract directly: the panel must show these values
    await (await chain.ticketNft(accounts.admin).adminUpdateEventSettings(event.contractId, event.salesEnd, 750, 15_000, 3)).wait();
    await openAdmin(page, signIn, 'Events');
    const panel = await openSettings(page, event.title);

    await expect(panel.getByLabel('Royalty (%)')).toHaveValue('7.5');
    await expect(panel.getByLabel('Resale cap')).toHaveValue('15000');
    await expect(panel.getByLabel('Per-wallet limit')).toHaveValue('3');
    await expect(panel.getByLabel('Sales end')).toHaveValue(localInput(event.salesEnd * 1000));

    const save = panel.getByRole('button', { name: 'Save changes' });
    await expect(save).toBeDisabled();
    await expect(panel.getByText('Change a setting to save.')).toBeVisible();
    await panel.getByLabel('Royalty (%)').fill('8');
    await expect(save).toBeEnabled();
    await panel.getByLabel('Royalty (%)').fill('7.5');
    await expect(save).toBeDisabled();
  });

  test('errors: royalty over 100% or with more than 2 decimals, per-wallet limit not whole or too big, sales end empty or in the past', async ({ page, wallet, signIn }) => {
    const event = await createPublishedEvent();
    await openAdmin(page, signIn, 'Events');
    const panel = await openSettings(page, event.title);
    const royalty = panel.getByLabel('Royalty (%)');
    const limit = panel.getByLabel('Per-wallet limit');
    const salesEnd = panel.getByLabel('Sales end');
    const sent = sentTransactions(wallet);

    await royalty.fill('100.01');
    await panel.getByRole('button', { name: 'Save changes' }).click();
    await expect(royalty).toHaveAccessibleDescription('Enter a percentage from 0 to 100 (up to 2 decimals).');
    // After the first Save, the errors follow the typing
    await royalty.fill('12');
    await expect(royalty).toHaveAccessibleDescription('Paid to the organizer on every resale, max 100%');
    await royalty.fill('12.345');
    await expect(royalty).toHaveAccessibleDescription('Enter a percentage from 0 to 100 (up to 2 decimals).');
    await royalty.fill('12');

    await limit.fill('2.5');
    await expect(limit).toHaveAccessibleDescription('Enter a whole number. 0 means no limit.');
    await limit.fill('10001');
    await expect(limit).toHaveAccessibleDescription('Keep it at 10,000 or less.');
    await limit.fill('4');

    await salesEnd.fill('');
    await expect(salesEnd).toHaveAccessibleDescription('Choose when ticket sales end.');
    await salesEnd.fill(localInput(Date.now() - 86_400_000));
    await expect(salesEnd).toHaveAccessibleDescription('A new sales end must be in the future.');

    expect(sentTransactions(wallet)).toBe(sent); // nothing was sent
  });

  test('saving changes the contract, then the API and the event page; reopening shows the new values', async ({ page, signIn }) => {
    const event = await createPublishedEvent(); // 10% royalty, 2× cap, 4 a wallet
    await openAdmin(page, signIn, 'Events');
    let panel = await openSettings(page, event.title);

    await panel.getByLabel('Royalty (%)').fill('12.5');
    await panel.getByLabel('Resale cap').selectOption('15000');
    await panel.getByLabel('Per-wallet limit').fill('6');
    await panel.getByRole('button', { name: 'Save changes' }).click();
    await expect(panel.getByText(SETTINGS_SAVED)).toBeVisible();
    await panel.getByRole('button', { name: 'Done' }).click();
    await expect(panel).toHaveCount(0);

    expect(await chain.ticketNft().royaltyPercentage(event.contractId)).toBe(1250n);
    const config = await chain.ticketNft().eventConfigs(event.contractId);
    expect(config[1]).toBe(15_000n);
    expect(config[6]).toBe(6n);
    await expect(eventRow(page, event.title)).toContainText('12.5%');
    await expect(eventRow(page, event.title)).toContainText('1.5×');

    // Reopening starts from the new values
    panel = await openSettings(page, event.title);
    await expect(panel.getByLabel('Royalty (%)')).toHaveValue('12.5');
    await expect(panel.getByLabel('Resale cap')).toHaveValue('15000');
    await expect(panel.getByLabel('Per-wallet limit')).toHaveValue('6');
    await panel.getByRole('button', { name: 'Cancel' }).click();

    // The API (through the listener), then the event page
    await waitForSync();
    expect((await adminEvents({ q: event.title })).events[0]).toMatchObject({ royalty_bps: 1250, resale_cap_bps: 15_000, per_wallet_limit: 6 });
    await page.goto(`/events/${event.apiId}`);
    await page.getByRole('button', { name: /Resale rules/ }).click();
    await expect(page.getByText('1.5× cap · 12.5% royalty')).toBeVisible();
  });

  test('rejecting in the wallet, then trying again', async ({ page, wallet, signIn }) => {
    const event = await createPublishedEvent();
    await openAdmin(page, signIn, 'Events');
    const panel = await openSettings(page, event.title);
    const save = panel.getByRole('button', { name: 'Save changes' });

    await panel.getByLabel('Royalty (%)').fill('9');
    wallet.rejectNext('send');
    await save.click();
    await expect(panel.getByText('The transaction was cancelled in your wallet.')).toBeVisible();
    expect(await chain.ticketNft().royaltyPercentage(event.contractId)).toBe(1000n);

    await save.click();
    await expect(panel.getByText(SETTINGS_SAVED)).toBeVisible();
    expect(await chain.ticketNft().royaltyPercentage(event.contractId)).toBe(900n);
  });

  test('editing after sales ended needs a new future sales end, and sales reopen until then', async ({ page, signIn }) => {
    const event = await createPublishedEvent({ salesEndInDays: 60 / 86_400 }); // sales end a minute after the chain's now
    // Past the sales end on the chain, with the browser's clock on the chain's, so both agree sales have ended
    await chain.increaseTime(120);
    const now = (await chain.chainNow()) * 1000;
    await page.clock.setFixedTime(now);
    await expect(chain.buyTickets(accounts.jordan, { eventId: event.contractId })).rejects.toThrow();

    await openAdmin(page, signIn, 'Events');
    const panel = await openSettings(page, event.title);
    const salesEnd = panel.getByLabel('Sales end');
    await expect(salesEnd).toHaveAccessibleDescription(/Keep this date to leave them closed, or pick a later one to reopen them\.$/);

    // Another date in the past is refused
    await salesEnd.fill(localInput(now - 86_400_000));
    await panel.getByRole('button', { name: 'Save changes' }).click();
    await expect(salesEnd).toHaveAccessibleDescription('A new sales end must be in the future.');

    // A future date reopens sales until then
    const reopenUntil = Math.floor((now + 10 * 86_400_000) / 60_000) * 60_000;
    await salesEnd.fill(localInput(reopenUntil));
    await expect(salesEnd).toHaveAccessibleDescription('Sales reopen until this date: tickets can be bought again and the resale cap applies.');
    await panel.getByRole('button', { name: 'Save changes' }).click();
    await expect(panel.getByText(SETTINGS_SAVED)).toBeVisible();

    expect((await chain.ticketNft().eventConfigs(event.contractId))[0]).toBe(BigInt(reopenUntil / 1000));
    await chain.buyTickets(accounts.jordan, { eventId: event.contractId });
  });

  test("a resale cap that isn't one of the usual choices is shown and kept", async ({ page, signIn }) => {
    const event = await createPublishedEvent({ resaleCap: 1.25 });
    await openAdmin(page, signIn, 'Events');
    await page.getByLabel('Search event or organizer').fill(event.title);
    await expect(eventRow(page, event.title)).toContainText('1.25×');

    const panel = await openSettings(page, event.title);
    const cap = panel.getByLabel('Resale cap');
    await expect(cap).toHaveValue('12500');
    await expect(cap.locator('option:checked')).toHaveText('1.25× face value');
    await panel.getByLabel('Royalty (%)').fill('11');
    await panel.getByRole('button', { name: 'Save changes' }).click();
    await expect(panel.getByText(SETTINGS_SAVED)).toBeVisible();
    expect((await chain.ticketNft().eventConfigs(event.contractId))[1]).toBe(12_500n);
  });

  test('changing the royalty while a ticket is listed saves normally', async ({ page, signIn }) => {
    const event = await createPublishedEvent();
    const { tokenIds: [tokenId] } = await chain.buyTickets(accounts.jordan, { eventId: event.contractId });
    await chain.listTicket(accounts.jordan, tokenId, 25);
    await openAdmin(page, signIn, 'Events');
    const panel = await openSettings(page, event.title);

    await panel.getByLabel('Royalty (%)').fill('15');
    await panel.getByRole('button', { name: 'Save changes' }).click();
    await expect(panel.getByText(SETTINGS_SAVED)).toBeVisible();
    expect(await chain.ticketNft().royaltyPercentage(event.contractId)).toBe(1500n);
    const [seller] = await chain.ticketNft().listings(tokenId);
    expect(seller).toBe(accounts.jordan.address); // still listed
  });

  test('double-clicking Approve, Revoke or Save sends one transaction', async ({ page, wallet, signIn }) => {
    const { account } = await requestOrganizer(28);
    const event = await createPublishedEvent();
    await openAdmin(page, signIn);

    await test.step('Approve', async () => {
      const sent = sentTransactions(wallet);
      await rowOf(pendingSection(page), account).getByRole('button', { name: 'Approve' }).dblclick();
      await expect(page.getByText('Organizer approved', { exact: true })).toBeVisible();
      expect(sentTransactions(wallet)).toBe(sent + 1);
    });

    await test.step('Revoke', async () => {
      await tab(page, 'Organizers').click();
      page.on('dialog', (dialog) => void dialog.accept());
      const sent = sentTransactions(wallet);
      await rowOf(organizersSection(page), account).getByRole('button', { name: 'Revoke' }).dblclick();
      await expect(page.getByText('Organizer access revoked', { exact: true })).toBeVisible();
      expect(sentTransactions(wallet)).toBe(sent + 1);
    });

    await test.step('Save', async () => {
      await tab(page, 'Events').click();
      const panel = await openSettings(page, event.title);
      await panel.getByLabel('Royalty (%)').fill('14');
      const sent = sentTransactions(wallet);
      await panel.getByRole('button', { name: 'Save changes' }).dblclick();
      await expect(panel.getByText(SETTINGS_SAVED)).toBeVisible();
      expect(sentTransactions(wallet)).toBe(sent + 1);
    });
  });
});
