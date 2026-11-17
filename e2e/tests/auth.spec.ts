// Sign-up, sign-in and the session (#339): connecting a wallet, signing the message, creating an
// account, and staying signed in (or not) across refreshes, tabs, account switches and networks.
//
// Tests that create an account each use their own new wallet (Hardhat's accounts #10 and up, which
// the seeds never register), so no test depends on another one or on the order they run in.

import { createHmac } from 'node:crypto';
import type { BrowserContext, Page } from '@playwright/test';

import { accounts, ALEX_EMAIL, ApiSession, expect, JORDAN_EMAIL, newWallet, openMenuIfPhone, seededEvents, test, WALLET_NAME, type Account, type Role, type TestWallet } from '../fixtures/index.js';
import { API_URL, JWT_SECRET, SEPOLIA_CHAIN_ID, WEB_URL } from '../stack/config.mjs';

// --- Helpers -------------------------------------------------------------------------------------

const hasSession = async (context: BrowserContext) => (await context.cookies(API_URL)).some((cookie) => cookie.name === 'token');
const signatureCount = (wallet: TestWallet) => wallet.requests.filter((method) => method === 'personal_sign').length;

async function chooseTestWallet(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: WALLET_NAME }).click();
}

/** The Connect wallet button on the sign-up page */
async function connectOnSignUp(page: Page) {
  await page.getByRole('main').getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await chooseTestWallet(page);
}

/** The Connect wallet button in the navbar, from any page */
async function connectFromNavbar(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await chooseTestWallet(page);
}

const connectStep = (page: Page) => page.getByRole('heading', { name: 'Sign in to NFTokenPass' });
const confirmStep = (page: Page) => page.getByRole('heading', { name: "Confirm it's you" });
const createAccountStep = (page: Page) => page.getByRole('heading', { name: 'Create your account' });

async function fillAccountForm(page: Page, { email, firstName = 'Nora', lastName = 'Lambert', organizer = false }: { email: string; firstName?: string; lastName?: string; organizer?: boolean }) {
  await page.getByLabel('First name').fill(firstName);
  await page.getByLabel('Last name').fill(lastName);
  await page.getByLabel('Email').fill(email);
  if (organizer) await page.getByText('Create events and sell tickets').click();
}

const submitAccountForm = (page: Page) => page.getByRole('button', { name: 'Create account' }).click();

async function signOutFromNavbar(page: Page) {
  await openMenuIfPhone(page);
  await page.getByRole('banner').getByRole('button', { name: 'Disconnect wallet' }).click();
}

/** A session token like the API's, signed with the test stack's secret, that expired an hour ago */
function expiredSessionToken(account: Account, role: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ wallet_address: account.address.toLowerCase(), role, iat: now - 2 * 3600, exp: now - 3600 })}`;
  return `${unsigned}.${createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url')}`;
}

/** Signs up a new wallet from /signup?next=<next> and returns once the account is created */
async function signUpWithNext(page: Page, wallet: TestWallet, person: Account, next: string) {
  await wallet.use(person);
  await page.goto(`/signup?next=${encodeURIComponent(next)}`);
  await connectOnSignUp(page);
  await fillAccountForm(page, { email: `nora.${person.index}@example.com` });
  await submitAccountForm(page);
}

// --- Sign-up -------------------------------------------------------------------------------------

test.describe('sign-up', () => {
  test('a new wallet connects, signs, creates its account and lands back on the page it came from', async ({ page, wallet }) => {
    const person = newWallet(10);
    await wallet.use(person);
    await page.goto('/marketplace');
    await connectFromNavbar(page);

    // A first sign-in from any page goes to the create account step, then back
    await expect(page).toHaveURL(/\/signup\?next=%2Fmarketplace$/);
    await expect(createAccountStep(page)).toBeVisible();
    await fillAccountForm(page, { email: 'nora.10@example.com' });
    await submitAccountForm(page);

    await expect(page).toHaveURL(/\/marketplace$/);
    await expect(page.getByRole('banner').getByRole('button', { name: 'Connect wallet', exact: true })).toHaveCount(0);
    expect(await hasSession(page.context())).toBe(true);
    const me = await (await ApiSession.signIn(person)).get<Record<string, unknown>>('/api/users/me');
    expect(me).toMatchObject({ first_name: 'Nora', last_name: 'Lambert', email: 'nora.10@example.com', profile_complete: true });
  });

  test('choosing "Organizer" sends the request and shows the "Request sent" card', async ({ page, wallet }) => {
    const person = newWallet(11);
    await wallet.use(person);
    await page.goto('/signup');
    await connectOnSignUp(page);
    await fillAccountForm(page, { email: 'nora.11@example.com', organizer: true });
    await expect(page.getByRole('radio', { name: /Organizer/ })).toBeChecked();
    await submitAccountForm(page);

    await expect(page.getByRole('heading', { name: 'Request sent' })).toBeVisible();
    await expect(page.getByText('An admin will review your organizer request.')).toBeVisible();
    const session = await ApiSession.signIn(person);
    expect((await session.get<{ status: string }>('/api/users/me/organizer-request')).status).toBe('PENDING');
  });

  test('when the organizer request fails, the card offers a retry, and the retry works', async ({ page, wallet }) => {
    const person = newWallet(12);
    await wallet.use(person);
    await page.goto('/signup');
    await connectOnSignUp(page);

    // The request can't reach the API the first time
    const requestUrl = '**/api/users/me/organizer-request';
    await page.route(requestUrl, (route) => route.abort());
    await fillAccountForm(page, { email: 'nora.12@example.com', organizer: true });
    await submitAccountForm(page);

    await expect(page.getByRole('heading', { name: 'Account created' })).toBeVisible();
    await expect(page.getByText(/your organizer request didn't go through/)).toBeVisible();
    const session = await ApiSession.signIn(person);
    await expect(session.get('/api/users/me/organizer-request')).rejects.toMatchObject({ status: 404 });

    await page.unroute(requestUrl);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Request sent' })).toBeVisible();
    expect((await session.get<{ status: string }>('/api/users/me/organizer-request')).status).toBe('PENDING');
  });

  test('an existing account goes straight through connect and sign, with no form', async ({ page, wallet }) => {
    await wallet.use(accounts.alex);
    await page.goto('/signup?next=%2Fprofile');
    await connectOnSignUp(page);

    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByLabel('Email')).toHaveValue(ALEX_EMAIL);
    await expect(createAccountStep(page)).toHaveCount(0);
    expect(signatureCount(wallet)).toBe(1);
  });

  test('refreshing on each step lands on the same step', async ({ page, wallet }) => {
    const person = newWallet(13);
    await wallet.use(person);

    // 1. Connect
    await page.goto('/signup');
    await expect(connectStep(page)).toBeVisible();
    await page.reload();
    await expect(connectStep(page)).toBeVisible();

    // 2. Confirm it's you: the wallet signs right away (a refresh on this step has its own test below)
    await connectOnSignUp(page);

    // 3. Create your account: the refresh reuses the session, with no new signature
    await expect(createAccountStep(page)).toBeVisible();
    await page.reload();
    await expect(createAccountStep(page)).toBeVisible();
    expect(signatureCount(wallet)).toBe(1);

    // 4. Request sent ends sign-up: after a refresh the account is done and the request stays pending
    await fillAccountForm(page, { email: 'nora.13@example.com', organizer: true });
    await submitAccountForm(page);
    await expect(page.getByRole('heading', { name: 'Request sent' })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await page.goto('/profile');
    await expect(page.getByText('Pending review')).toBeVisible();
  });

  // TODO(#382): after a refresh, the automatic sign-in starts while wagmi is still reconnecting the
  // wallet, fails before reaching it and shows "We couldn't sign you in". Turn on once that is fixed.
  test.fixme("refreshing on Confirm it's you asks the wallet to sign again and stays on that step", async ({ page, wallet }) => {
    const person = newWallet(21);
    await wallet.use(person);
    await page.goto('/signup');
    wallet.rejectNext('sign');
    await connectOnSignUp(page);
    await expect(page.getByText('Signature cancelled')).toBeVisible();

    const signatures = signatureCount(wallet);
    wallet.rejectNext('sign'); // the sign-in after the refresh is cancelled too
    await page.reload();

    await expect.poll(() => signatureCount(wallet), { message: 'the refresh asks for the signature again' }).toBe(signatures + 1);
    await expect(confirmStep(page)).toBeVisible();
    await expect(page.getByText('Signature cancelled')).toBeVisible();
    expect(await hasSession(page.context())).toBe(false);

    await page.getByRole('button', { name: 'Sign message' }).click();
    await expect(createAccountStep(page)).toBeVisible();
  });

  test('rejecting the signature shows a clear message, and trying again works', async ({ page, wallet }) => {
    const person = newWallet(14);
    await wallet.use(person);
    await page.goto('/signup');
    wallet.rejectNext('sign');
    await connectOnSignUp(page);

    await expect(page.getByText('Signature cancelled')).toBeVisible();
    await expect(page.getByText('You cancelled the request in your wallet. Sign the message to log in.')).toBeVisible();
    expect(await hasSession(page.context())).toBe(false);

    await page.getByRole('button', { name: 'Sign message' }).click();
    await expect(createAccountStep(page)).toBeVisible();
    expect(await hasSession(page.context())).toBe(true);
  });

  test('disconnecting the wallet in the middle of sign-up goes back to the first step, with no account created', async ({ page, wallet }) => {
    const person = newWallet(15);
    await wallet.use(person);
    await page.goto('/signup');
    await connectOnSignUp(page);
    await expect(createAccountStep(page)).toBeVisible();
    await page.getByLabel('First name').fill('Nora');

    await wallet.disconnect();

    await expect(connectStep(page)).toBeVisible();
    await expect(createAccountStep(page)).toHaveCount(0);
    const me = await (await ApiSession.signIn(person)).get<{ profile_complete: boolean }>('/api/users/me');
    expect(me.profile_complete).toBe(false);
  });

  test('form errors: empty fields, too long, invalid email, email taken; typed values stay', async ({ page, wallet }) => {
    const person = newWallet(16);
    await wallet.use(person);
    await page.goto('/signup');
    await connectOnSignUp(page);
    await expect(createAccountStep(page)).toBeVisible();

    // Every required field empty
    await submitAccountForm(page);
    await expect(page.getByText('Enter your first name.')).toBeVisible();
    await expect(page.getByText('Enter your last name.')).toBeVisible();
    await expect(page.getByText('Enter your email.')).toBeVisible();
    await expect(page.getByLabel('First name')).toBeFocused();

    // Too long: the fields stop at their limit (50 for names, 254 for the email)
    await page.getByLabel('First name').fill('N'.repeat(60));
    await expect(page.getByLabel('First name')).toHaveValue('N'.repeat(50));
    await page.getByLabel('Last name').fill('L'.repeat(60));
    await expect(page.getByLabel('Last name')).toHaveValue('L'.repeat(50));
    const longEmail = `${'a'.repeat(260)}@example.com`;
    await page.getByLabel('Email').fill(longEmail);
    await expect(page.getByLabel('Email')).toHaveValue(longEmail.slice(0, 254));

    // Invalid email
    await fillAccountForm(page, { email: 'nora@example' });
    await submitAccountForm(page);
    await expect(page.getByText('Enter a valid email.')).toBeVisible();

    // An email another account already uses (the API refuses it)
    await page.getByLabel('Email').fill(ALEX_EMAIL);
    await submitAccountForm(page);
    await expect(page.getByText('This email is already used by another account.')).toBeVisible();

    // What was typed is still there
    await expect(page.getByLabel('First name')).toHaveValue('Nora');
    await expect(page.getByLabel('Last name')).toHaveValue('Lambert');
    await expect(page.getByLabel('Email')).toHaveValue(ALEX_EMAIL);
    const me = await (await ApiSession.signIn(person)).get<{ profile_complete: boolean }>('/api/users/me');
    expect(me.profile_complete).toBe(false);
  });

  test('after sign-up, a "next" page on this site is where the person lands', async ({ page, wallet }) => {
    await signUpWithNext(page, wallet, newWallet(17), '/marketplace');
    await expect(page).toHaveURL((url) => url.origin === WEB_URL && url.pathname === '/marketplace');
  });

  test('after sign-up, a "next" link to another site goes to the home page instead', async ({ page, wallet }) => {
    await signUpWithNext(page, wallet, newWallet(18), 'https://evil.example.com');
    await expect(page).toHaveURL((url) => url.origin === WEB_URL && url.pathname === '/');
  });

  test('old /signin links go to sign-up', async ({ page }) => {
    await page.goto('/signin');
    await expect(page).toHaveURL((url) => url.pathname === '/signup');
    await expect(connectStep(page)).toBeVisible();
  });

  // TODO(#328): write once "don't send an organizer request for organizers and the admin" is merged
});

// --- Session -------------------------------------------------------------------------------------

test.describe('session', () => {
  test('stays signed in after a refresh and in a new tab', async ({ page, context, wallet, signIn }) => {
    await signIn('attendee', { path: '/profile' });
    await expect(page.getByLabel('Email')).toHaveValue(ALEX_EMAIL);
    const signatures = signatureCount(wallet);

    await page.reload();
    await expect(page.getByLabel('Email')).toHaveValue(ALEX_EMAIL);

    const tab = await context.newPage();
    await tab.goto('/profile');
    await expect(tab.getByLabel('Email')).toHaveValue(ALEX_EMAIL);

    expect(signatureCount(wallet)).toBe(signatures); // no new signature was needed
  });

  test('signing out from the navbar clears the session; protected pages then ask to sign in', async ({ page, context, signIn }) => {
    await signIn('attendee', { path: '/profile' });
    await signOutFromNavbar(page);

    await expect(page.getByRole('banner').getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Connect your wallet' })).toBeVisible();
    expect(await hasSession(context)).toBe(false);
    expect((await page.request.get(`${API_URL}/api/users/me`)).status()).toBe(401);

    await page.goto('/my-tickets');
    await expect(page.getByRole('heading', { name: 'Connect your wallet' })).toBeVisible();
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Connect your admin wallet' })).toBeVisible();
  });

  test('an expired session asks to sign in again at the next action, never a silent failure', async ({ page, context, signIn }) => {
    await signIn('attendee', { path: '/profile' });
    await expect(page.getByLabel('Email')).toHaveValue(ALEX_EMAIL);
    // Wait until the page has loaded everything, so only the action below meets the expired session
    await expect(page.getByRole('button', { name: 'Request access' })).toBeEnabled();

    // The session cookie, replaced with the same one expired an hour ago
    const [session] = (await context.cookies(API_URL)).filter((cookie) => cookie.name === 'token');
    await context.addCookies([{ ...session, value: expiredSessionToken(accounts.alex, 'USER') }]);

    // The next action (saving the profile) meets the expired session: the page asks to sign in again
    await page.getByLabel('First name').fill('Alexandra');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in to see your profile' })).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveCount(0); // nothing of the old session is shown

    // Signing in again brings the profile back, and nothing was saved with the expired session
    await page.getByRole('main').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByLabel('Email')).toHaveValue(ALEX_EMAIL);
    await expect(page.getByLabel('First name')).not.toHaveValue('Alexandra');
    expect((await page.request.get(`${API_URL}/api/users/me`)).status()).toBe(200);
  });

  test('switching the account in the wallet: the app never shows or acts as the previous wallet', async ({ page, wallet, signIn }) => {
    await signIn('attendee', { path: '/profile' });
    await expect(page.getByLabel('Email')).toHaveValue(ALEX_EMAIL);

    await wallet.switchAccount(accounts.jordan);

    await expect(page.getByLabel('Email')).toHaveValue(JORDAN_EMAIL);
    const me = (await (await page.request.get(`${API_URL}/api/users/me`)).json()) as { wallet_address: string };
    expect(me.wallet_address).toBe(accounts.jordan.address.toLowerCase());

    // Jordan has no tickets: none of Alex's show
    await page.goto('/my-tickets');
    await expect(page.getByRole('heading', { name: 'No tickets yet' })).toBeVisible();
    await expect(page.getByText(seededEvents.gala.title)).toHaveCount(0);
  });

  test('disconnecting from inside the wallet while signed in shows the app signed out', async ({ page, wallet, signIn }) => {
    await signIn('attendee', { path: '/profile' });
    await expect(page.getByLabel('Email')).toHaveValue(ALEX_EMAIL);

    await wallet.disconnect();

    await expect(page.getByRole('heading', { name: 'Connect your wallet' })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveCount(0);
  });

  test('signing in while the wallet is on the wrong network works, and the app moves the wallet to a network it supports', async ({ page, context, wallet, signIn }) => {
    await wallet.switchNetwork(1); // Ethereum mainnet, which the app doesn't use
    await signIn('attendee', { path: '/profile' });

    await expect(page.getByLabel('Email')).toHaveValue(ALEX_EMAIL);
    expect(await hasSession(context)).toBe(true);
    // Connecting asks the wallet to switch to the app's first network (Sepolia), so no warning is left
    expect(wallet.requests).toContain('wallet_switchEthereumChain');
    expect(wallet.chainId).toBe(SEPOLIA_CHAIN_ID);
    await expect(page.getByText('Wrong network detected')).toBeHidden();
  });

  test('signing in from two tabs at the same time ends with both signed in', async ({ page, context, signIn }) => {
    // The wallet stays connected but the session is gone, so both tabs sign in as they open
    await signIn('attendee', { path: '/' });
    await context.clearCookies({ name: 'token' });
    const second = await context.newPage();
    await Promise.all([page.goto('/signup?next=%2Fprofile'), second.goto('/signup?next=%2Fprofile')]);

    // Each sign-in replaces the wallet's nonce, so one tab can lose the race: it must say so and recover
    for (const tab of [page, second]) {
      await expect(async () => {
        const retry = tab.getByRole('button', { name: 'Sign message' });
        if (await retry.isVisible()) await retry.click();
        await expect(tab).toHaveURL(/\/profile$/, { timeout: 3_000 });
      }).toPass({ timeout: 30_000 });
      await expect(tab.getByLabel('Email')).toHaveValue(ALEX_EMAIL);
    }
    expect(await hasSession(context)).toBe(true);
  });

  const BASE_LINKS = ['Search Events', 'Marketplace'];
  const NAVBARS: Array<{ who: string; role: Role | null; links: string[] }> = [
    { who: 'a visitor who is signed out', role: null, links: BASE_LINKS },
    { who: 'an attendee', role: 'attendee', links: [...BASE_LINKS, 'My Tickets'] },
    { who: 'a scanner', role: 'scanner', links: [...BASE_LINKS, 'My Tickets'] },
    { who: 'an organizer', role: 'organizer', links: [...BASE_LINKS, 'My Tickets', 'Organizer'] },
    { who: 'the admin', role: 'admin', links: [...BASE_LINKS, 'My Tickets', 'Admin'] },
  ];

  for (const { who, role, links } of NAVBARS) {
    test(`the navbar shows the right links for ${who}`, async ({ page, signIn }, testInfo) => {
      if (role) await signIn(role, { path: '/' });
      else await page.goto('/');

      await openMenuIfPhone(page);
      // On a phone, the menu also has the Profile link once signed in
      const expected = testInfo.project.name === 'phone' && role ? [...links, 'Profile'] : links;
      await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText(expected);
    });
  }

  test('an account without an email is sent to finish it from My Tickets, then back there', async ({ page, wallet }) => {
    await wallet.use(newWallet(19));
    await page.goto('/my-tickets');
    await connectFromNavbar(page);

    await expect(page).toHaveURL(/\/signup\?next=%2Fmy-tickets$/);
    await fillAccountForm(page, { email: 'nora.19@example.com' });
    await submitAccountForm(page);

    await expect(page).toHaveURL(/\/my-tickets$/);
    await expect(page.getByRole('heading', { name: 'My Tickets' })).toBeVisible();
  });

  test('an account without an email is sent to finish it from an event page, then back to buy', async ({ page, wallet }) => {
    await wallet.use(newWallet(20)); // signs messages only: it needs no ETH
    await page.goto(`/events/${seededEvents.gala.apiId}`);
    await connectFromNavbar(page);

    await expect(page).toHaveURL(new RegExp(`/signup\\?next=%2Fevents%2F${seededEvents.gala.apiId}$`));
    await fillAccountForm(page, { email: 'nora.20@example.com' });
    await submitAccountForm(page);

    await expect(page).toHaveURL(new RegExp(`/events/${seededEvents.gala.apiId}$`));
    await expect(page.getByRole('heading', { level: 1, name: seededEvents.gala.title })).toBeVisible();
    await expect(page.getByRole('link', { name: /Finish your account/ })).toHaveCount(0);
  });
});
