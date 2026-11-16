// The Profile page (#340): account details, the wallet card, asking to become an organizer, and who
// can open the page.
//
// Tests that change an account each use their own new wallet (Hardhat's accounts #10 and up, which
// the seeds never register), set up through the API, so no test depends on another one or on the
// order they run in. Tests that only read use the seeded accounts.

import type { Page } from '@playwright/test';
import { ethers } from 'ethers';

import { accounts, ApiSession, chain, expect, test, waitForSync, WALLET_NAME, type Account, type Role } from '../fixtures/index.js';
import { API_URL } from '../stack/config.mjs';

// --- Helpers -------------------------------------------------------------------------------------

const HARDHAT_MNEMONIC = 'test test test test test test test test test test test junk';

/** Hardhat's account #index (10 and up): never registered by the seeds */
function newWallet(index: number): Account {
  const wallet = ethers.HDNodeWallet.fromPhrase(HARDHAT_MNEMONIC, undefined, `m/44'/60'/0'/0/${index}`);
  return { index, name: null, address: wallet.address as `0x${string}`, privateKey: wallet.privateKey as `0x${string}` };
}

/** A finished account for Hardhat's account #index, made through the API the way sign-up does */
async function createAccount(index: number, profile: { first_name: string; last_name: string; email: string; nickname?: string }) {
  const account = newWallet(index);
  const session = await ApiSession.signIn(account);
  await session.put('/api/users/me', profile);
  return { account, session };
}

const ALEX_EMAIL = 'user@nfttickets.local'; // from the database seed
const JORDAN_EMAIL = 'user2@nfttickets.local';
const ORGANIZER_REQUEST = '/api/users/me/organizer-request';

interface OrganizerRequestRow {
  id: string;
  wallet: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

/** A wallet's organizer requests, oldest first, as the admin sees them */
async function requestsOf(account: Account): Promise<OrganizerRequestRow[]> {
  const admin = await ApiSession.signIn(accounts.admin);
  const all = await admin.get<OrganizerRequestRow[]>('/api/admin/organizer-requests');
  return all.filter((request) => request.wallet === account.address.toLowerCase());
}

/** The admin rejects the wallet's pending request with a reason, like the admin page's Reject */
async function rejectAsAdmin(account: Account, reason: string) {
  const admin = await ApiSession.signIn(accounts.admin);
  const pending = await admin.get<OrganizerRequestRow[]>('/api/admin/organizer-requests?status=PENDING');
  const request = pending.find((row) => row.wallet === account.address.toLowerCase());
  if (!request) throw new Error(`${account.address} has no pending organizer request`);
  await admin.post(`/api/admin/organizer-requests/${request.id}/reject`, { reason });
}

/** The admin approves: grantRole from the admin's wallet, as the admin page sends it; the API's listener saves it */
async function approveAsAdmin(account: Account) {
  const nft = chain.ticketNft(accounts.admin);
  const receipt = await (await nft.grantRole(await nft.ORGANIZER_ROLE(), account.address)).wait();
  await waitForSync(receipt?.blockNumber);
}

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** On a phone the navbar's links are in the menu */
async function openMenuIfPhone(page: Page) {
  const menu = page.getByRole('button', { name: 'Open menu' });
  if (await menu.isVisible()) await menu.click();
}

const saveButton = (page: Page) => page.getByRole('button', { name: 'Save changes' });
const activeRole = (page: Page) => page.locator('dl', { hasText: 'Active role' }).locator('dd');
const becomeOrganizerCard = (page: Page) => page.getByRole('heading', { name: 'Become an organizer' });
const requestSentCard = (page: Page) => page.getByRole('heading', { name: 'Organizer request sent' });
const requestAccessButton = (page: Page) => page.getByRole('button', { name: 'Request access' });

// --- Account details -----------------------------------------------------------------------------

test.describe('account details', () => {
  test('shows the saved name, nickname and email', async ({ page, signIn }) => {
    const { account } = await createAccount(10, { first_name: 'Nora', last_name: 'Lambert', nickname: 'nora_l', email: 'nora.10@example.com' });
    await signIn(account, { path: '/profile' });

    await expect(page.getByRole('heading', { name: 'Account details' })).toBeVisible();
    await expect(page.getByLabel('First name')).toHaveValue('Nora');
    await expect(page.getByLabel('Last name')).toHaveValue('Lambert');
    await expect(page.getByLabel('Nickname')).toHaveValue('nora_l'); // the field shows the @ itself
    await expect(page.getByLabel('Email')).toHaveValue('nora.10@example.com');
  });

  test('Save stays disabled until something changes', async ({ page, signIn }) => {
    await signIn('attendee', { path: '/profile' });
    await expect(page.getByLabel('Email')).toHaveValue(ALEX_EMAIL);
    await expect(saveButton(page)).toBeDisabled();

    await page.getByLabel('First name').fill('Alexa');
    await expect(saveButton(page)).toBeEnabled();

    // Back to the saved value, with only spaces or capitals added: nothing the API would store differently
    await page.getByLabel('First name').fill(' Alex ');
    await expect(saveButton(page)).toBeDisabled();
    await page.getByLabel('Email').fill(ALEX_EMAIL.toUpperCase());
    await expect(saveButton(page)).toBeDisabled();
  });

  test('saving updates the page and the navbar, and survives a refresh', async ({ page, signIn, isMobile }) => {
    const { account, session } = await createAccount(11, { first_name: 'Nora', last_name: 'Lambert', email: 'nora.11@example.com' });
    await signIn(account, { path: '/profile' });
    // The navbar's avatar shows the nickname's or first name's first letter (on a phone the menu has no avatar)
    const profileChip = page.getByRole('banner').getByRole('link', { name: /Profile$/ });
    if (!isMobile) await expect(profileChip).toHaveAccessibleName(/^N\s*Profile$/);

    await page.getByLabel('First name').fill('Morgan');
    await page.getByLabel('Nickname').fill('@mo_lambert');
    await page.getByLabel('Email').fill('Morgan.Lambert@Example.com');
    await saveButton(page).click();

    // The page shows what the API stored: the nickname without its @, the email in lowercase
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await expect(saveButton(page)).toBeDisabled();
    await expect(page.getByLabel('First name')).toHaveValue('Morgan');
    await expect(page.getByLabel('Nickname')).toHaveValue('mo_lambert');
    await expect(page.getByLabel('Email')).toHaveValue('morgan.lambert@example.com');
    if (!isMobile) await expect(profileChip).toHaveAccessibleName(/^M\s*Profile$/);

    await page.reload();
    await expect(page.getByLabel('First name')).toHaveValue('Morgan');
    await expect(page.getByLabel('Nickname')).toHaveValue('mo_lambert');
    await expect(page.getByLabel('Email')).toHaveValue('morgan.lambert@example.com');
    expect(await session.get('/api/users/me')).toMatchObject({ first_name: 'Morgan', last_name: 'Lambert', nickname: 'mo_lambert', email: 'morgan.lambert@example.com' });
  });

  test('errors: first or last name empty, fields too long, invalid email, email used by another account', async ({ page, signIn }) => {
    await signIn('attendee', { path: '/profile' });
    const firstName = page.getByLabel('First name');
    const lastName = page.getByLabel('Last name');
    const nickname = page.getByLabel('Nickname');
    const email = page.getByLabel('Email');
    await expect(email).toHaveValue(ALEX_EMAIL);

    // First and last name empty
    await firstName.fill('');
    await lastName.fill('');
    await saveButton(page).click();
    await expect(firstName).toHaveAccessibleDescription('Enter your first name.');
    await expect(lastName).toHaveAccessibleDescription('Enter your last name.');

    // Too long: the names stop at 50 characters and the email at 254; a nickname over 50 is refused
    await firstName.fill('N'.repeat(60));
    await expect(firstName).toHaveValue('N'.repeat(50));
    await lastName.fill('L'.repeat(60));
    await expect(lastName).toHaveValue('L'.repeat(50));
    const longEmail = `${'a'.repeat(260)}@example.com`;
    await email.fill(longEmail);
    await expect(email).toHaveValue(longEmail.slice(0, 254));
    await nickname.fill('n'.repeat(60));
    await saveButton(page).click();
    await expect(nickname).toHaveAccessibleDescription('Use 50 characters or fewer.');
    await expect(email).toHaveAccessibleDescription('Enter a valid email.'); // cut at 254, it lost its @

    // Invalid email
    await firstName.fill('Alexandra');
    await lastName.fill('Vance');
    await nickname.fill('');
    await email.fill('alex@example');
    await saveButton(page).click();
    await expect(email).toHaveAccessibleDescription('Enter a valid email.');

    // An email another account already uses: the API refuses it
    await email.fill(JORDAN_EMAIL);
    await saveButton(page).click();
    await expect(email).toHaveAccessibleDescription('This email is already used by another account.');

    // What was typed is still there, and nothing was saved
    await expect(firstName).toHaveValue('Alexandra');
    await expect(lastName).toHaveValue('Vance');
    await expect(email).toHaveValue(JORDAN_EMAIL);
    const me = await (await page.request.get(`${API_URL}/api/users/me`)).json();
    expect(me).toMatchObject({ first_name: 'Alex', last_name: 'Vance', email: ALEX_EMAIL });
  });

  test('the API fails while saving: a clear message, and the typed values stay', async ({ page, signIn }) => {
    await signIn('attendee', { path: '/profile' });
    await expect(page.getByLabel('Email')).toHaveValue(ALEX_EMAIL);

    // Saving can't reach the API (loading the profile still can)
    await page.route('**/api/users/me', (route) => (route.request().method() === 'PUT' ? route.abort() : route.continue()));
    await page.getByLabel('First name').fill('Alexandra');
    await page.getByLabel('Email').fill('alexandra@example.com');
    await saveButton(page).click();

    await expect(page.getByText("We couldn't save your changes. Check your connection and try again.")).toBeVisible();
    await expect(page.getByLabel('First name')).toHaveValue('Alexandra');
    await expect(page.getByLabel('Email')).toHaveValue('alexandra@example.com');
    await expect(saveButton(page)).toBeEnabled(); // the person can try again
  });
});

// --- Wallet card ---------------------------------------------------------------------------------

test.describe('wallet card', () => {
  test('shows the connected address, and copy puts the full address on the clipboard', async ({ page, context, signIn }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signIn('attendee', { path: '/profile' });

    const address = accounts.alex.address; // checksummed, the way the card shows it
    await expect(page.getByTitle(address)).toHaveText(shortAddress(address));
    await page.getByRole('main').getByRole('button', { name: 'Copy wallet address' }).click();
    await expect(page.getByRole('main').getByRole('button', { name: 'Address copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(address);
  });

  const ROLES: Array<{ who: string; role: Role; label: string }> = [
    { who: 'an attendee', role: 'attendee', label: 'Attendee' },
    { who: 'an organizer', role: 'organizer', label: 'Organizer' },
    { who: 'the admin', role: 'admin', label: 'Admin' },
  ];

  for (const { who, role, label } of ROLES) {
    test(`shows the right role for ${who}`, async ({ page, signIn }) => {
      await signIn(role, { path: '/profile' });
      await expect(activeRole(page)).toHaveText(label);
    });
  }

  test('Disconnect signs out and leaves the page in a signed-out state', async ({ page, context, signIn }) => {
    await signIn('attendee', { path: '/profile' });
    await page.getByRole('main').getByRole('button', { name: 'Disconnect wallet' }).click();

    await expect(page.getByRole('heading', { name: 'Connect your wallet' })).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveCount(0);
    await expect(page.getByRole('banner').getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible();
    expect((await context.cookies(API_URL)).some((cookie) => cookie.name === 'token')).toBe(false);
    expect((await page.request.get(`${API_URL}/api/users/me`)).status()).toBe(401);
  });
});

// --- Organizer request ---------------------------------------------------------------------------

test.describe('organizer request', () => {
  test('Request access: the card changes to "request sent", and stays so after a refresh', async ({ page, signIn }) => {
    const { account, session } = await createAccount(12, { first_name: 'Nora', last_name: 'Lambert', email: 'nora.12@example.com' });
    await signIn(account, { path: '/profile' });
    await expect(becomeOrganizerCard(page)).toBeVisible();

    await requestAccessButton(page).click();
    await expect(requestSentCard(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pending review' })).toBeDisabled();

    await page.reload();
    await expect(requestSentCard(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pending review' })).toBeDisabled();
    expect((await session.get<{ status: string }>(ORGANIZER_REQUEST)).status).toBe('PENDING');
  });

  test('clicking twice quickly sends one request only', async ({ page, signIn }) => {
    const { account } = await createAccount(13, { first_name: 'Nora', last_name: 'Lambert', email: 'nora.13@example.com' });
    await signIn(account, { path: '/profile' });
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith(ORGANIZER_REQUEST)) posts.push(request.url());
    });

    await requestAccessButton(page).dblclick();

    await expect(requestSentCard(page)).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(await requestsOf(account)).toHaveLength(1);
  });

  test('the request fails: a clear message, and a working retry', async ({ page, signIn }) => {
    const { account, session } = await createAccount(14, { first_name: 'Nora', last_name: 'Lambert', email: 'nora.14@example.com' });
    await signIn(account, { path: '/profile' });
    await expect(requestAccessButton(page)).toBeEnabled(); // the card has loaded

    // Sending the request can't reach the API the first time (reading it still can)
    const url = `**${ORGANIZER_REQUEST}`;
    await page.route(url, (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
    await requestAccessButton(page).click();
    await expect(page.getByText("Your request didn't go through. Try again.")).toBeVisible();
    await expect(requestSentCard(page)).toHaveCount(0);
    await expect(session.get(ORGANIZER_REQUEST)).rejects.toMatchObject({ status: 404 });

    await page.unroute(url);
    await requestAccessButton(page).click();
    await expect(requestSentCard(page)).toBeVisible();
    expect((await session.get<{ status: string }>(ORGANIZER_REQUEST)).status).toBe('PENDING');
  });

  test('the admin approves: the card says to sign in again; after signing in, the role is Organizer and the Organizer link shows', async ({ page, signIn }) => {
    const { account, session } = await createAccount(15, { first_name: 'Nora', last_name: 'Lambert', email: 'nora.15@example.com' });
    await session.post(ORGANIZER_REQUEST, {});
    await signIn(account, { path: '/profile' });
    await expect(requestSentCard(page)).toBeVisible();

    await approveAsAdmin(account);
    // The person comes back to the tab: the page checks the request again
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByRole('heading', { name: 'Organizer request approved' })).toBeVisible();
    await expect(page.getByText('Disconnect and sign in again to start creating events.')).toBeVisible();

    // Doing what the card says
    await page.getByRole('main').getByRole('button', { name: 'Disconnect wallet' }).click();
    await expect(page.getByRole('heading', { name: 'Connect your wallet' })).toBeVisible();
    await signIn(account, { path: '/profile' });

    await expect(activeRole(page)).toHaveText('Organizer');
    await expect(becomeOrganizerCard(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Organizer request approved' })).toHaveCount(0);
    await openMenuIfPhone(page);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Organizer', exact: true })).toBeVisible();
    expect((await session.get<{ status: string }>(ORGANIZER_REQUEST)).status).toBe('APPROVED');
  });

  test('the admin rejects with a reason: the card shows it, and asking again creates a new pending request', async ({ page, signIn }) => {
    const { account, session } = await createAccount(16, { first_name: 'Nora', last_name: 'Lambert', email: 'nora.16@example.com' });
    await session.post(ORGANIZER_REQUEST, {});
    await rejectAsAdmin(account, 'Add the name of your venue or company.');
    await signIn(account, { path: '/profile' });

    await expect(becomeOrganizerCard(page)).toBeVisible();
    await expect(page.getByText("Your last request wasn't approved")).toBeVisible();
    await expect(page.getByText('Reason: Add the name of your venue or company. You can ask again.')).toBeVisible();

    await requestAccessButton(page).click();
    await expect(requestSentCard(page)).toBeVisible();
    await page.reload();
    await expect(requestSentCard(page)).toBeVisible();
    expect((await requestsOf(account)).map((request) => request.status)).toEqual(['REJECTED', 'PENDING']);
  });

  const NOT_ATTENDEES: Array<{ who: string; role: Role; account: Account }> = [
    { who: 'an organizer', role: 'organizer', account: accounts.organizer },
    { who: 'the admin', role: 'admin', account: accounts.admin },
  ];

  for (const { who, role, account } of NOT_ATTENDEES) {
    test(`${who} sees no "Become an organizer" card, and the API refuses a request`, async ({ page, signIn }) => {
      await signIn(role, { path: '/profile' });
      await expect(page.getByRole('heading', { name: 'Wallet', exact: true })).toBeVisible(); // the page has loaded
      await expect(becomeOrganizerCard(page)).toHaveCount(0);
      await expect(requestAccessButton(page)).toHaveCount(0);

      const session = await ApiSession.signIn(account);
      await expect(session.post(ORGANIZER_REQUEST, {})).rejects.toMatchObject({ status: 409 });
    });
  }
});

// --- Access --------------------------------------------------------------------------------------

test.describe('access', () => {
  test('signed-out visitors opening /profile are asked to sign in, then see their profile', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Connect your wallet' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Account details' })).toHaveCount(0);

    // The test wallet starts as Alex
    await page.getByRole('main').getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: WALLET_NAME }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByLabel('Email')).toHaveValue(ALEX_EMAIL);
  });
});
