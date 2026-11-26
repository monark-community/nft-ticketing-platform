// Buying tickets on the event page (#344): every reason a purchase can't go ahead, the two steps
// (allow USDC, then buy), what happens while the page is open, and what follows a purchase.
//
// Each test publishes the event it needs and checks the screen against the contract: tickets
// held, USDC balances and allowances, and the transactions the wallet was asked to send.

import type { Browser, Page, TestInfo } from '@playwright/test';
import { ethers } from 'ethers';

import {
  accounts,
  chain,
  createPublishedEvent,
  expect,
  seededEvents,
  signInThroughUi,
  test,
  TestWallet,
  waitForSync,
  WALLET_NAME,
  type Account,
  type PublishedEvent,
} from '../fixtures/index.js';
import { API_URL, SEPOLIA_CHAIN_ID, WEB_URL } from '../stack/config.mjs';

const PURCHASE_ERRORS = {
  // services/web/src/lib/purchase-errors.ts
  userRejected: 'The purchase was cancelled in your wallet. You were not charged.',
  notEnoughLeft: 'Someone bought the last tickets of this type while you were confirming. Lower the quantity or choose another ticket type.',
  saleNotActive: 'Ticket sales for this event were paused while you were confirming.',
  eventEnded: 'Ticket sales for this event have ended.',
};

// ---------------------------------------------------------------------------------------------
// The contract

const held = async (account: Account, event: { contractId: bigint }) =>
  Number((await chain.ticketNft().eventTicketsHeld(event.contractId, account.address)) as bigint);
const allowance = async (account: Account) => (await chain.mockUsdc().allowance(account.address, chain.addresses().TicketNFT)) as bigint;
const soldOf = async (event: { contractId: bigint }, typeId: number) => {
  const [, , sold] = (await chain.ticketNft().ticketTypes(event.contractId, typeId)) as [bigint, bigint, bigint];
  return Number(sold);
};
const ethBalance = (account: Account) => chain.provider.getBalance(account.address);

// The approval the page would make, made directly (the exact amount, like the app)
async function approve(account: Account, amount: bigint) {
  await (await chain.mockUsdc(account).approve(chain.addresses().TicketNFT, amount)).wait();
}

// Transactions the page asked the wallet to send since `from`
const sendsSince = (wallet: TestWallet, from: number) => wallet.requests.slice(from).filter((method) => method === 'eth_sendTransaction').length;

// ---------------------------------------------------------------------------------------------
// The page

const main = (page: Page) => page.getByRole('main');
const summary = (page: Page) => main(page).getByRole('region', { name: 'Order Summary' });
const summaryRow = (page: Page, label: string) => summary(page).getByText(label, { exact: true }).locator('..');
const buyButton = (page: Page) => summary(page).getByRole('button', { name: /^Buy tickets/ });
const tryAgain = (page: Page) => summary(page).getByRole('button', { name: 'Try again' });
const tier = (page: Page, name: string) =>
  main(page).getByRole('region', { name: 'Select Ticket Tier' }).getByRole('button', { name: new RegExp(`^${name}`) });
const stepper = (page: Page, tierName: string) => main(page).getByRole('group', { name: `${tierName} tickets` });
const increase = (page: Page, tierName: string) => stepper(page, tierName).getByRole('button', { name: `Increase ${tierName.toLowerCase()} tickets` });
const decrease = (page: Page, tierName: string) => stepper(page, tierName).getByRole('button', { name: `Decrease ${tierName.toLowerCase()} tickets` });
const errorAlert = (page: Page) => summary(page).getByRole('alert');
const success = (page: Page) => summary(page).getByRole('status').filter({ hasText: "You're going!" });
const steps = (page: Page) => summary(page).getByRole('list', { name: 'Purchase steps' }).getByRole('listitem');

// What the two step rows say, e.g. ['Done', 'In progress']
async function expectSteps(page: Page, approveStatus: string, buyStatus: string) {
  await expect(steps(page).nth(0)).toContainText(`1. Approve USDC${approveStatus}`);
  await expect(steps(page).nth(1)).toContainText(`2. Buy tickets${buyStatus}`);
}

// A blocked state: its title and message in the order summary, and no way to buy
async function expectBlocked(page: Page, title: string, message?: string | RegExp) {
  const alert = summary(page).getByRole('status').filter({ hasText: title });
  await expect(alert).toBeVisible();
  if (message) await expect(alert).toContainText(message);
}

async function chooseQuantity(page: Page, tierName: string, quantity: number) {
  for (let i = 1; i < quantity; i++) await increase(page, tierName).click();
  await expect(stepper(page, tierName).locator('output')).toHaveText(String(quantity));
}

async function openEvent(page: Page, event: { apiId: string; title: string }) {
  await page.goto(`/events/${event.apiId}`);
  await expect(main(page).getByRole('heading', { level: 1, name: event.title })).toBeVisible();
}

// Signs in through the app and opens the event, ready to buy
async function openSignedIn(page: Page, signIn: (who: Account, options?: { path?: string }) => Promise<void>, who: Account, event: { apiId: string; title: string }) {
  await signIn(who, { path: `/events/${event.apiId}` });
  await expect(main(page).getByRole('heading', { level: 1, name: event.title })).toBeVisible();
}

// A second buyer in their own browser, with their own wallet
async function secondBuyer(browser: Browser, testInfo: TestInfo, who: Account, event: { apiId: string; title: string }) {
  const { viewport, isMobile, hasTouch, deviceScaleFactor, timezoneId, locale, baseURL } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, timezoneId, locale });
  const wallet = await TestWallet.attach(context, who);
  const page = await context.newPage();
  await signInThroughUi(page, wallet, who, { path: `/events/${event.apiId}` });
  await expect(main(page).getByRole('heading', { level: 1, name: event.title })).toBeVisible();
  return { page, wallet, close: () => context.close() };
}

// Turns the local chain's automatic mining off, so a sent transaction stays pending
async function holdBlocks<T>(run: () => Promise<T>): Promise<T> {
  await chain.provider.send('evm_setAutomine', [false]);
  try {
    return await run();
  } finally {
    await chain.provider.send('evm_setAutomine', [true]);
    await chain.mine();
  }
}

// ---------------------------------------------------------------------------------------------

// Tests in a file share the chain: an allowance a test leaves behind (a purchase that stopped
// after the approve step) would change which steps the next one runs
test.beforeEach(async () => {
  for (const account of [accounts.jordan, accounts.alex]) {
    if ((await allowance(account)) > 0n) await approve(account, 0n);
  }
});

test.describe('why a purchase can\'t go ahead', () => {
  test('sales not set up on the contract yet', async ({ page }) => {
    const event = await createPublishedEvent({ title: 'Not Set Up Yet' });
    // The event as the API would have it before the organizer finished the on-chain setup: its
    // contract ID points at an event the contract doesn't know. (Once #383 is merged, publishing
    // checks the setup, so an event like this can only come from before that.)
    const unknownId = 9_000_000_000n + BigInt(Date.now() % 1_000_000);
    expect((await chain.ticketNft().eventConfigs(unknownId))[4]).toBe(false);
    await page.route(`${API_URL}/api/events/${event.apiId}`, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, contract_event_id: unknownId.toString() } });
    });

    await openEvent(page, event);
    await expectBlocked(page, "Tickets aren't on sale yet", "The organizer hasn't set up ticket sales for this event yet. Check back soon.");
  });

  test('sales paused by the organizer', async ({ page, signIn }) => {
    const event = await createPublishedEvent({ title: 'Sales Paused', openSales: false });
    expect((await chain.ticketNft().eventConfigs(event.contractId))[5]).toBe(false);

    await openSignedIn(page, signIn, accounts.jordan, event);
    await expectBlocked(page, 'Ticket sales are closed', "Ticket sales for this event haven't opened yet, or are paused. Check back soon.");
    await expect(buyButton(page)).toBeDisabled();
  });

  test('sales ended', async ({ page, signIn }) => {
    const event = await createPublishedEvent({ title: 'Sales Over', startsInDays: 10, salesEndInDays: 60 / 86_400 });
    // Past the sales end on the chain, and on the visitor's clock (the page compares the
    // contract's end time with it; the local chain's clock can run ahead of the real one)
    await chain.increaseTime(120);
    expect(await chain.chainNow()).toBeGreaterThan(event.salesEnd);
    await page.clock.setFixedTime(new Date((event.salesEnd + 60) * 1000));

    await openSignedIn(page, signIn, accounts.jordan, event);
    await expectBlocked(page, 'Ticket sales have ended', "This event is over, so tickets can't be bought anymore.");
    await expect(buyButton(page)).toBeDisabled();
    await expect(chain.ticketNft(accounts.jordan).buyTickets.staticCall(event.contractId, 0, 1)).rejects.toThrow('Event has ended');
  });

  test('a sold-out ticket type, and fewer tickets left than the quantity chosen', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({
      title: 'Few Left',
      perWalletLimit: 0,
      ticketTypes: [
        { name: 'Floor', price: 20, supply: 3 },
        { name: 'Gone', price: 30, supply: 1 },
      ],
    });
    await chain.buyTickets(accounts.alex, { eventId: event.contractId, typeId: 1 });
    await approve(accounts.jordan, chain.usdc(60)); // so the buy is the only step
    await openSignedIn(page, signIn, accounts.jordan, event);

    // Sold out
    await tier(page, 'Gone').click();
    await expectBlocked(page, 'Gone is sold out', 'Choose another ticket type, or check the Marketplace for resale tickets.');
    await expect(buyButton(page)).toBeDisabled();

    // 3 chosen, then someone else buys 2 before this page has caught up
    await tier(page, 'Floor').click();
    await chooseQuantity(page, 'Floor', 3);
    await expectSteps(page, 'Done', 'Not started');
    await chain.buyTickets(accounts.alex, { eventId: event.contractId, typeId: 0, quantity: 2 });
    const usdcBefore = await chain.usdcBalance(accounts.jordan.address);
    const sent = wallet.requests.length;

    await buyButton(page).click();
    // The contract refuses before the wallet opens
    await expect(errorAlert(page)).toHaveText(PURCHASE_ERRORS.notEnoughLeft);
    expect(sendsSince(wallet, sent)).toBe(0);
    expect(await chain.usdcBalance(accounts.jordan.address)).toBe(usdcBefore);
    // The page then lowers the quantity to what's left
    await expect(stepper(page, 'Floor').locator('output')).toHaveText('1');
    await expect(tier(page, 'Floor')).toContainText('1 left');
  });

  test('wallet not connected, then connecting from the page', async ({ page, wallet }) => {
    const event = await createPublishedEvent({ title: 'Connect First' });
    await wallet.use(accounts.jordan);
    await openEvent(page, event);

    await expectBlocked(page, 'Connect your wallet to buy', 'Your tickets are minted as NFTs to the wallet you connect.');
    await summary(page).getByRole('button', { name: 'Connect wallet' }).click();
    await page.getByRole('dialog').getByRole('button', { name: WALLET_NAME }).click();

    // Connecting signs in (Jordan has an account), then the purchase can go ahead
    await expect(buyButton(page)).toBeEnabled({ timeout: 20_000 });
    await expect(summaryRow(page, 'Wallet Limit')).toContainText('1 of 4');
  });

  test('wrong network, and the switch works', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({ title: 'Wrong Network' });
    await openSignedIn(page, signIn, accounts.jordan, event);
    await expect(buyButton(page)).toBeEnabled();

    await wallet.switchNetwork(SEPOLIA_CHAIN_ID);
    await expectBlocked(page, 'Wrong network', /Switch your wallet to .+ to buy tickets\./);
    await summary(page).getByRole('button', { name: 'Switch network' }).click();

    await expect(buyButton(page)).toBeEnabled();
    expect(wallet.chainId).not.toBe(SEPOLIA_CHAIN_ID);
    expect(wallet.requests).toContain('wallet_switchEthereumChain');
  });

  test('connected but not signed in', async ({ page, wallet }) => {
    const event = await createPublishedEvent({ title: 'Sign In First' });
    await wallet.use(accounts.jordan);
    await openEvent(page, event);
    // The sign-in message is rejected when connecting
    wallet.rejectNext('sign');
    await summary(page).getByRole('button', { name: 'Connect wallet' }).click();
    await page.getByRole('dialog').getByRole('button', { name: WALLET_NAME }).click();

    await expectBlocked(page, 'Sign in to buy', 'Sign a free message in your wallet to log in. Tickets are linked to your account.');
    await summary(page).getByRole('button', { name: 'Sign in to buy' }).click();
    await expect(buyButton(page)).toBeEnabled({ timeout: 20_000 });
  });

  // The navbar sends a signed-in account without a name and email to the create account step
  // straight away (useProfileCompletionRedirect), so the order summary's "Finish your account"
  // message only shows for a moment; what the visitor sees is the redirect and the way back
  test('an account that isn\'t finished is sent to finish it, and comes back', async ({ page, wallet }) => {
    const event = await createPublishedEvent({ title: 'Finish Account First' });
    await chain.giveUsdc(accounts.new1.address, 100);
    await wallet.use(accounts.new1);
    await openEvent(page, event);
    await summary(page).getByRole('button', { name: 'Connect wallet' }).click();
    await page.getByRole('dialog').getByRole('button', { name: WALLET_NAME }).click();

    await page.waitForURL(`${WEB_URL}/signup?next=${encodeURIComponent(`/events/${event.apiId}`)}`);
    await page.getByLabel('First name').fill('Riley');
    await page.getByLabel('Last name').fill('Park');
    await page.getByLabel('Email').fill('riley.park@example.com');
    await page.getByRole('button', { name: 'Create account' }).click();

    await page.waitForURL(`${WEB_URL}/events/${event.apiId}`);
    await expect(buyButton(page)).toBeEnabled({ timeout: 20_000 });
    await buyButton(page).click();
    await expect(success(page)).toBeVisible();
    expect(await held(accounts.new1, event)).toBe(1);
  });

  test('presale: a wallet on the guest list can buy, one that isn\'t can\'t', async ({ page, signIn, browser }, testInfo) => {
    // Seeded: Jazz at the Atrium is in presale, with only Alex on the guest list
    const jazz = seededEvents.jazz;
    expect(await chain.ticketNft().presaleActive(jazz.contractId)).toBe(true);
    expect(await chain.ticketNft().isWhitelisted(jazz.contractId, accounts.jordan.address)).toBe(false);

    await openSignedIn(page, signIn, accounts.jordan, jazz);
    await expectBlocked(page, 'Not on the guest list', "Presale is open to the guest list only, and this wallet isn't on it.");
    await expect(buyButton(page)).toBeDisabled();
    await expect(chain.ticketNft(accounts.jordan).buyTickets.staticCall(jazz.contractId, 0, 1)).rejects.toThrow('Address not whitelisted for presale');

    const alex = await secondBuyer(browser, testInfo, accounts.alex, jazz);
    const before = await held(accounts.alex, jazz);
    await expect(summary(alex.page).getByText('Not on the guest list')).toHaveCount(0);
    await buyButton(alex.page).click();
    await expect(success(alex.page)).toBeVisible();
    expect(await held(accounts.alex, jazz)).toBe(before + 1);
    await alex.close();
  });

  test('the per-wallet limit counts Marketplace tickets, and giving one away frees it', async ({ page, signIn }) => {
    const event = await createPublishedEvent({ title: 'Limit Of Three', perWalletLimit: 3, ticketTypes: [{ name: 'General Admission', price: 20, supply: 50 }] });
    // Jordan buys 2, and 1 more from Alex on the Marketplace
    const { tokenIds: jordanTokens } = await chain.buyTickets(accounts.jordan, { eventId: event.contractId, quantity: 2 });
    const { tokenIds: [alexToken] } = await chain.buyTickets(accounts.alex, { eventId: event.contractId });
    await chain.listTicket(accounts.alex, alexToken, 25);
    await chain.buyListedTicket(accounts.jordan, alexToken);
    expect(await held(accounts.jordan, event)).toBe(3);

    await openSignedIn(page, signIn, accounts.jordan, event);
    await expectBlocked(page, 'Wallet limit reached', 'You can hold up to 3 tickets for this event, and you already have 3.');
    await expect(buyButton(page)).toBeDisabled();
    await expect(chain.ticketNft(accounts.jordan).buyTickets.staticCall(event.contractId, 0, 1)).rejects.toThrow('Per-wallet limit reached');

    // Jordan gives one ticket to someone else
    await (await chain.ticketNft(accounts.jordan).transferFrom(accounts.jordan.address, accounts.new2.address, jordanTokens[0])).wait();
    expect(await held(accounts.jordan, event)).toBe(2);
    await page.reload();
    await expect(buyButton(page)).toBeEnabled();
    await expect(summaryRow(page, 'Wallet Limit')).toContainText('3 of 3');
    // and can't choose more than the one ticket left under the limit
    await expect(increase(page, 'General Admission')).toBeDisabled();
  });

  test('not enough USDC, then not enough ETH for gas', async ({ page, signIn }) => {
    const event = await createPublishedEvent({ title: 'Short Of Funds', ticketTypes: [{ name: 'General Admission', price: 20, supply: 50 }] });
    const usdcBefore = await chain.usdcBalance(accounts.jordan.address);
    const ethBefore = await ethBalance(accounts.jordan);
    // Leave Jordan 5 USDC
    await (await chain.mockUsdc(accounts.jordan).transfer(accounts.admin.address, usdcBefore - chain.usdc(5))).wait();

    try {
      await openSignedIn(page, signIn, accounts.jordan, event);
      await expectBlocked(page, 'Not enough USDC', 'This order costs 20.00 USDC and your wallet has 5.00 USDC. Add 15.00 USDC or lower the quantity.');
      await expect(summaryRow(page, 'Your USDC balance')).toContainText('5.00 USDC');
      await expect(buyButton(page)).toBeDisabled();

      // Enough USDC again, but no ETH for the network fee
      await chain.giveUsdc(accounts.jordan.address, 95);
      await chain.setEth(accounts.jordan.address, 0);
      await page.reload();
      await expectBlocked(page, 'Not enough ETH for the network fee', /Add about [\d.]+ ETH to this wallet, then try again\./);
      await expect(summaryRow(page, 'Your ETH balance')).toContainText('0');
      await expect(buyButton(page)).toBeDisabled();
    } finally {
      await chain.setEth(accounts.jordan.address, ethers.formatEther(ethBefore));
      await chain.giveUsdc(accounts.jordan.address, 1000);
    }
  });
});

test.describe('buying', () => {
  test('two steps, allow USDC then buy, each showing its state', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({ title: 'Two Steps', ticketTypes: [{ name: 'General Admission', price: 20, supply: 50 }] });
    await openSignedIn(page, signIn, accounts.jordan, event);
    await chooseQuantity(page, 'General Admission', 2);
    await expectSteps(page, 'Not started', 'Not started');
    await expect(buyButton(page)).toHaveText(/Buy tickets — 40\.00 USDC/);
    const usdcBefore = await chain.usdcBalance(accounts.jordan.address);
    const sent = wallet.requests.length;

    // Step 1: the wallet asks to allow 40 USDC
    const approveHold = wallet.holdNext('send');
    await buyButton(page).click();
    await approveHold.reached;
    await expectSteps(page, 'In progress', 'Waiting');
    await expect(summary(page).getByRole('button', { name: 'Confirm in your wallet…' })).toBeDisabled();
    await expect(summary(page)).toContainText('Step 1 of 2: allow 40.00 USDC to be used for this purchase.');
    // The quantity can't change mid-purchase
    await expect(increase(page, 'General Admission')).toBeDisabled();

    // Step 2: the purchase itself
    const buyHold = wallet.holdNext('send');
    approveHold.release();
    await buyHold.reached;
    await expectSteps(page, 'Done', 'In progress');
    expect(await allowance(accounts.jordan)).toBe(chain.usdc(40));
    await expect(summary(page)).toContainText('Step 2 of 2: buy 2 tickets for 40.00 USDC.');
    buyHold.release();

    await expect(success(page)).toBeVisible();
    await expect(success(page)).toContainText('2 tickets were sent to your wallet.');
    await expectSteps(page, 'Done', 'Done');
    expect(sendsSince(wallet, sent)).toBe(2);
    expect(await held(accounts.jordan, event)).toBe(2);
    expect(usdcBefore - (await chain.usdcBalance(accounts.jordan.address))).toBe(chain.usdc(40));
    // Exactly the total was allowed, so nothing is left over
    expect(await allowance(accounts.jordan)).toBe(0n);
  });

  test('USDC already allowed: only the buy step runs', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({ title: 'Already Allowed', ticketTypes: [{ name: 'General Admission', price: 20, supply: 50 }] });
    await approve(accounts.jordan, chain.usdc(40));
    await openSignedIn(page, signIn, accounts.jordan, event);
    await chooseQuantity(page, 'General Admission', 2);
    await expectSteps(page, 'Done', 'Not started');
    const sent = wallet.requests.length;

    const buyHold = wallet.holdNext('send');
    await buyButton(page).click();
    await buyHold.reached;
    await expect(summary(page)).toContainText('Confirm the purchase of 2 tickets in your wallet.');
    buyHold.release();

    await expect(success(page)).toBeVisible();
    expect(sendsSince(wallet, sent)).toBe(1);
    expect(await held(accounts.jordan, event)).toBe(2);
  });

  test('an earlier allowance smaller than the total asks again', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({ title: 'Small Allowance', ticketTypes: [{ name: 'General Admission', price: 20, supply: 50 }] });
    await approve(accounts.jordan, chain.usdc(10));
    await openSignedIn(page, signIn, accounts.jordan, event);
    await chooseQuantity(page, 'General Admission', 2);
    await expectSteps(page, 'Not started', 'Not started');
    const sent = wallet.requests.length;

    await buyButton(page).click();
    await expect(success(page)).toBeVisible();
    expect(sendsSince(wallet, sent)).toBe(2);
    expect(await held(accounts.jordan, event)).toBe(2);
  });

  test('rejecting the allow step, then the buy step: trying again only runs what\'s left', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({ title: 'Changed My Mind', ticketTypes: [{ name: 'General Admission', price: 20, supply: 50 }] });
    await openSignedIn(page, signIn, accounts.jordan, event);
    const usdcBefore = await chain.usdcBalance(accounts.jordan.address);

    // Reject the allow step
    wallet.rejectNext('send');
    await buyButton(page).click();
    await expect(errorAlert(page)).toHaveText(PURCHASE_ERRORS.userRejected);
    await expectSteps(page, 'Failed', 'Not started');
    expect(await allowance(accounts.jordan)).toBe(0n);

    // Try again: allow this time, reject the buy
    let sent = wallet.requests.length;
    wallet.rejectNext('send', 1);
    await tryAgain(page).click();
    await expect(errorAlert(page)).toHaveText(PURCHASE_ERRORS.userRejected);
    await expectSteps(page, 'Done', 'Failed');
    await expect(summary(page)).toContainText('USDC is already approved, so only the purchase runs again.');
    expect(sendsSince(wallet, sent)).toBe(2);
    expect(await allowance(accounts.jordan)).toBe(chain.usdc(20));
    expect(await held(accounts.jordan, event)).toBe(0);
    expect(await chain.usdcBalance(accounts.jordan.address)).toBe(usdcBefore);

    // Try again: only the buy runs
    sent = wallet.requests.length;
    await tryAgain(page).click();
    await expect(success(page)).toBeVisible();
    expect(sendsSince(wallet, sent)).toBe(1);
    expect(await held(accounts.jordan, event)).toBe(1);
    expect(usdcBefore - (await chain.usdcBalance(accounts.jordan.address))).toBe(chain.usdc(20));
  });

  test('quantity: from 1 up to the lowest of tickets left, the wallet limit and 100', async ({ page, signIn }) => {
    const event = await createPublishedEvent({
      title: 'How Many',
      perWalletLimit: 0,
      ticketTypes: [
        { name: 'Plenty', price: 1, supply: 150 },
        { name: 'Few', price: 1, supply: 3 },
      ],
    });
    await openSignedIn(page, signIn, accounts.jordan, event);

    // Starts at 1, and can't go lower
    await expect(stepper(page, 'Plenty').locator('output')).toHaveText('1');
    await expect(decrease(page, 'Plenty')).toBeDisabled();

    // 150 left and no wallet limit: 100, the most one purchase can buy
    await chooseQuantity(page, 'Plenty', 100);
    await expect(increase(page, 'Plenty')).toBeDisabled();
    await expect(buyButton(page)).toHaveText(/Buy tickets — 100\.00 USDC/);
    await expect(buyButton(page)).toBeEnabled();
    await expect(chain.ticketNft(accounts.jordan).buyTickets.staticCall(event.contractId, 0, 101)).rejects.toThrow('Quantity must be between 1 and 100');

    // 3 left: 3
    await tier(page, 'Few').click();
    await expect(stepper(page, 'Few').locator('output')).toHaveText('1');
    await chooseQuantity(page, 'Few', 3);
    await expect(increase(page, 'Few')).toBeDisabled();

    // A wallet limit of 4 with 1 already held: 3, even with more left
    const limited = await createPublishedEvent({ title: 'How Many Limited', perWalletLimit: 4, ticketTypes: [{ name: 'Plenty', price: 1, supply: 150 }] });
    await chain.buyTickets(accounts.jordan, { eventId: limited.contractId });
    await openEvent(page, limited);
    await chooseQuantity(page, 'Plenty', 3);
    await expect(increase(page, 'Plenty')).toBeDisabled();
    await expect(summaryRow(page, 'Wallet Limit')).toContainText('4 of 4');
  });

  test('each ticket type of an event with several, with prices in cents: the total is exactly what leaves the wallet', async ({ page, signIn }) => {
    const event = await createPublishedEvent({
      title: 'Prices In Cents',
      perWalletLimit: 0,
      ticketTypes: [
        { name: 'Balcony', price: 12.5, supply: 10 },
        { name: 'Standing', price: 7.25, supply: 10 },
        { name: 'Student', price: 0.99, supply: 10 },
      ],
    });
    await openSignedIn(page, signIn, accounts.jordan, event);

    const orders = [
      { name: 'Balcony', typeId: 0, quantity: 1, total: '12.50' },
      { name: 'Standing', typeId: 1, quantity: 3, total: '21.75' },
      { name: 'Student', typeId: 2, quantity: 2, total: '1.98' },
    ];
    for (const order of orders) {
      await tier(page, order.name).click();
      await chooseQuantity(page, order.name, order.quantity);
      await expect(summaryRow(page, 'Selected Tier')).toContainText(order.name);
      await expect(buyButton(page)).toHaveText(new RegExp(`Buy tickets — ${order.total.replace('.', '\\.')} USDC`));
      const before = await chain.usdcBalance(accounts.jordan.address);

      await buyButton(page).click();
      await expect(success(page)).toBeVisible();
      expect(before - (await chain.usdcBalance(accounts.jordan.address)), order.name).toBe(chain.usdc(order.total));
      expect(await soldOf(event, order.typeId), order.name).toBe(order.quantity);
    }
    expect(await held(accounts.jordan, event)).toBe(6);
  });

  test('a slow transaction: the waiting state, then "Stop waiting"', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({ title: 'Slow Network', ticketTypes: [{ name: 'General Admission', price: 20, supply: 50 }] });
    await approve(accounts.jordan, chain.usdc(20)); // only the buy step, so one transaction to hold
    // The page waits 2 minutes before calling a transaction slow: its clock is moved forward
    await page.clock.install();
    await openSignedIn(page, signIn, accounts.jordan, event);
    await expect(buyButton(page)).toBeEnabled();

    await holdBlocks(async () => {
      await buyButton(page).click();
      await expect(summary(page).getByRole('button', { name: 'Buying…' })).toBeVisible();
      await expect(summary(page)).toContainText('Transaction sent. Waiting for confirmation.');

      await page.clock.fastForward('02:05');
      const slow = summary(page).getByRole('status').filter({ hasText: 'This is taking longer than usual' });
      await expect(slow).toContainText("Your purchase may still confirm, so don't buy again yet.");
      await expect(summary(page).getByRole('button', { name: 'Waiting for confirmation…' })).toBeDisabled();
      await expectSteps(page, 'Done', 'Pending');

      await summary(page).getByRole('button', { name: 'Stop waiting' }).click();
      await expect(summary(page).getByText('Stopped waiting for the transaction')).toBeVisible();
      await expect(summary(page)).toContainText("Your transaction may still go through. Check your wallet's activity before trying again.");
      expect(await held(accounts.jordan, event)).toBe(0);
    });

    // The transaction was still on its way: once mined, the tickets are there, bought once
    expect(await held(accounts.jordan, event)).toBe(1);
    expect(sendsSince(wallet, 0)).toBe(1);
  });

  test('refreshing the page while the purchase is pending', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({ title: 'Refresh Mid Purchase', ticketTypes: [{ name: 'General Admission', price: 20, supply: 50 }] });
    await approve(accounts.jordan, chain.usdc(20));
    await openSignedIn(page, signIn, accounts.jordan, event);
    const usdcBefore = await chain.usdcBalance(accounts.jordan.address);

    await holdBlocks(async () => {
      await buyButton(page).click();
      await expect(summary(page)).toContainText('Transaction sent. Waiting for confirmation.');
      await page.reload();
      await expect(main(page).getByRole('heading', { level: 1, name: event.title })).toBeVisible();
    });

    // The transaction confirms on its own after the refresh, once
    expect(await held(accounts.jordan, event)).toBe(1);
    expect(usdcBefore - (await chain.usdcBalance(accounts.jordan.address))).toBe(chain.usdc(20));
    expect(sendsSince(wallet, 0)).toBe(1);
    // and the page catches up without another refresh (it reads the contract every 15 seconds)
    await expect(main(page).getByText('49 of 50 tickets left')).toBeVisible({ timeout: 20_000 });
  });

  test('double-clicking Buy sends one purchase', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({ title: 'Double Click', ticketTypes: [{ name: 'General Admission', price: 20, supply: 50 }] });
    await openSignedIn(page, signIn, accounts.jordan, event);
    await chooseQuantity(page, 'General Admission', 2);
    const sent = wallet.requests.length;

    await buyButton(page).dblclick();
    await expect(success(page)).toBeVisible();
    // One approval and one purchase, for 2 tickets
    expect(sendsSince(wallet, sent)).toBe(2);
    expect(await held(accounts.jordan, event)).toBe(2);
    expect(await soldOf(event, 0)).toBe(2);
  });

  test('switching account mid-purchase: nothing is sent, the page says why, and Try again buys with the new account', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({ title: 'Switched Mid Purchase', ticketTypes: [{ name: 'General Admission', price: 20, supply: 50 }] });
    // Jordan has approved this order already; Alex hasn't approved anything
    await approve(accounts.jordan, chain.usdc(20));
    await approve(accounts.alex, 0n);
    await openSignedIn(page, signIn, accounts.jordan, event);
    const before = { jordan: await chain.usdcBalance(accounts.jordan.address), alex: await chain.usdcBalance(accounts.alex.address) };
    const alexHeld = await held(accounts.alex, event);

    // While Jordan's wallet shows the purchase, the wallet switches to Alex
    const hold = wallet.holdNext('send');
    await buyButton(page).click();
    await hold.reached;
    await wallet.switchAccount(accounts.alex);
    hold.release();

    // The wallet refuses to send for an account that is no longer selected. The page says the
    // account switched, and its steps are Alex's: Jordan's approval doesn't count for Alex (#396).
    await expect(errorAlert(page)).toHaveText(
      'Your wallet switched to another account before the purchase went through, so no tickets were bought and no USDC was taken. Try again to buy with this account.',
    );
    await expectSteps(page, 'Not started', 'Not started');
    await expect(summary(page).getByText('USDC is already approved')).toHaveCount(0);
    await chain.mine();
    expect(await held(accounts.jordan, event)).toBe(0);
    expect(await held(accounts.alex, event)).toBe(alexHeld);
    expect(await chain.usdcBalance(accounts.jordan.address)).toBe(before.jordan);
    expect(await chain.usdcBalance(accounts.alex.address)).toBe(before.alex);

    // Try again approves and buys from Alex's wallet
    await summary(page).getByRole('button', { name: 'Try again' }).click();
    await expect(success(page)).toBeVisible();
    expect(await held(accounts.alex, event)).toBe(alexHeld + 1);
    expect(await held(accounts.jordan, event)).toBe(0);
  });

  test('switching account after a purchase: the page shows a new order for the new account', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({ title: 'Switched After Purchase', ticketTypes: [{ name: 'General Admission', price: 20, supply: 50 }] });
    await approve(accounts.jordan, chain.usdc(20));
    await approve(accounts.alex, 0n);
    await openSignedIn(page, signIn, accounts.jordan, event);

    await buyButton(page).click();
    await expect(success(page)).toBeVisible();

    // Jordan's tickets aren't Alex's: Alex gets the order form, with nothing approved yet (#396)
    await wallet.switchAccount(accounts.alex);
    await expect(success(page)).toHaveCount(0);
    await expect(buyButton(page)).toBeEnabled();
    await expectSteps(page, 'Not started', 'Not started');

    // Back on Jordan's account, the purchase it made shows again
    await wallet.switchAccount(accounts.jordan);
    await expect(success(page)).toBeVisible();
  });

  test('switching account after a failed purchase: its error stays with the account that had it', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({ title: 'Switched After Cancel', ticketTypes: [{ name: 'General Admission', price: 20, supply: 50 }] });
    await approve(accounts.jordan, chain.usdc(20));
    await approve(accounts.alex, 0n);
    await openSignedIn(page, signIn, accounts.jordan, event);

    wallet.rejectNext('send');
    await buyButton(page).click();
    await expect(errorAlert(page)).toHaveText('The purchase was cancelled in your wallet. You were not charged.');

    // Jordan's cancelled purchase isn't Alex's: Alex gets the order form, with no error (#396)
    await wallet.switchAccount(accounts.alex);
    await expect(errorAlert(page)).toHaveCount(0);
    await expect(buyButton(page)).toBeEnabled();
    await expectSteps(page, 'Not started', 'Not started');

    // Back on Jordan's account, its error shows again
    await wallet.switchAccount(accounts.jordan);
    await expect(errorAlert(page)).toHaveText('The purchase was cancelled in your wallet. You were not charged.');
  });

  test('disconnecting mid-purchase: nothing is sent', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({ title: 'Disconnected Mid Purchase', ticketTypes: [{ name: 'General Admission', price: 20, supply: 50 }] });
    await openSignedIn(page, signIn, accounts.jordan, event);
    const usdcBefore = await chain.usdcBalance(accounts.jordan.address);

    const hold = wallet.holdNext('send');
    await buyButton(page).click();
    await hold.reached;
    await wallet.disconnect();
    hold.release();

    await expectBlocked(page, 'Connect your wallet to buy');
    await chain.mine();
    // Not even the USDC allowance went through
    expect(await allowance(accounts.jordan)).toBe(0n);
    expect(await held(accounts.jordan, event)).toBe(0);
    expect(await chain.usdcBalance(accounts.jordan.address)).toBe(usdcBefore);
  });
});

test.describe('while the page is open', () => {
  test('two buyers go for the last tickets: one gets them, the other is told and not charged', async ({ page, signIn, browser }, testInfo) => {
    const event = await createPublishedEvent({ title: 'Last Two', perWalletLimit: 0, ticketTypes: [{ name: 'General Admission', price: 20, supply: 2 }] });
    await openSignedIn(page, signIn, accounts.jordan, event);
    await chooseQuantity(page, 'General Admission', 2);
    const alex = await secondBuyer(browser, testInfo, accounts.alex, event);
    await chooseQuantity(alex.page, 'General Admission', 2);
    const alexUsdc = await chain.usdcBalance(accounts.alex.address);

    // Alex starts first and is still confirming the USDC allowance when Jordan buys
    const alexHold = alex.wallet.holdNext('send');
    await buyButton(alex.page).click();
    await alexHold.reached;
    await buyButton(page).click();
    await expect(success(page)).toBeVisible();
    expect(await held(accounts.jordan, event)).toBe(2);

    alexHold.release();
    await expect(errorAlert(alex.page)).toHaveText(PURCHASE_ERRORS.notEnoughLeft);
    expect(await held(accounts.alex, event)).toBe(0);
    expect(await chain.usdcBalance(accounts.alex.address)).toBe(alexUsdc);
    // Then Alex's page shows the type as sold out
    await expectBlocked(alex.page, 'General Admission is sold out');
    await alex.close();
  });

  test('the organizer pauses sales: the next purchase is refused with a clear message', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({ title: 'Paused Mid Purchase' });
    await openSignedIn(page, signIn, accounts.jordan, event);
    const usdcBefore = await chain.usdcBalance(accounts.jordan.address);

    const hold = wallet.holdNext('send');
    await buyButton(page).click();
    await hold.reached;
    await (await chain.ticketNft(accounts.organizer).setSaleActive(event.contractId, false)).wait();
    hold.release();

    await expect(errorAlert(page)).toHaveText(PURCHASE_ERRORS.saleNotActive);
    expect(await held(accounts.jordan, event)).toBe(0);
    expect(await chain.usdcBalance(accounts.jordan.address)).toBe(usdcBefore);
    await expectBlocked(page, 'Ticket sales are closed');
  });

  test('the admin changes the per-wallet limit: the page follows', async ({ page, signIn }) => {
    const event = await createPublishedEvent({ title: 'Limit Changes', perWalletLimit: 4 });
    await openSignedIn(page, signIn, accounts.jordan, event);
    await expect(summaryRow(page, 'Wallet Limit')).toContainText('1 of 4');
    await chooseQuantity(page, 'General Admission', 3);

    const [endTime] = (await chain.ticketNft().eventConfigs(event.contractId)) as [bigint];
    await (await chain.ticketNft(accounts.admin).adminUpdateEventSettings(event.contractId, endTime, 1000, 20_000, 2)).wait();

    // The page reads the contract every 15 seconds
    await expect(summaryRow(page, 'Wallet Limit')).toContainText('2 of 2', { timeout: 20_000 });
    await expect(stepper(page, 'General Admission').locator('output')).toHaveText('2');
    await expect(increase(page, 'General Admission')).toBeDisabled();
  });

  test('sales end while confirming: refused with a clear message', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({ title: 'Ends Mid Purchase', startsInDays: 10, salesEndInDays: 1 });
    await openSignedIn(page, signIn, accounts.jordan, event);
    const usdcBefore = await chain.usdcBalance(accounts.jordan.address);

    const hold = wallet.holdNext('send');
    await buyButton(page).click();
    await hold.reached;
    await chain.increaseTime(event.salesEnd - (await chain.chainNow()) + 60);
    hold.release();

    await expect(errorAlert(page)).toHaveText(PURCHASE_ERRORS.eventEnded);
    expect(await held(accounts.jordan, event)).toBe(0);
    expect(await chain.usdcBalance(accounts.jordan.address)).toBe(usdcBefore);
  });
});

test.describe('after buying', () => {
  test('the success state links to My Tickets, where the tickets show once the API catches up', async ({ page, signIn }) => {
    const event = await createPublishedEvent({ title: 'Going To My Tickets', perWalletLimit: 0, ticketTypes: [{ name: 'General Admission', price: 20, supply: 4 }] });
    await openSignedIn(page, signIn, accounts.jordan, event);
    await expect(main(page).getByText('4 of 4 tickets left')).toBeVisible();
    await chooseQuantity(page, 'General Admission', 3);
    await buyButton(page).click();
    await expect(success(page)).toBeVisible();

    // Availability on the page
    await expect(main(page).getByText('1 of 4 tickets left')).toBeVisible();
    await expect(tier(page, 'General Admission')).toContainText('1 left');

    // My Tickets
    await success(page).getByRole('link', { name: 'View my tickets' }).click();
    await expect(page).toHaveURL(`${WEB_URL}/my-tickets`);
    await expect(main(page).getByRole('button', { name: `Show entry QR codes for 3 tickets to ${event.title}` })).toBeVisible({ timeout: 20_000 });

    // The Events page marks it as low on tickets once the API has the sale
    await waitForSync();
    await page.goto(`/?q=${encodeURIComponent(event.title)}`);
    const card = main(page).getByRole('listitem').getByRole('link').filter({ hasText: event.title });
    await expect(card.getByText('Low stock')).toBeVisible();
  });

  test('the organizer can buy tickets to their own event', async ({ page, signIn }) => {
    const event = await createPublishedEvent({ title: 'Own Event' });
    await chain.giveUsdc(accounts.organizer.address, 100);
    await openSignedIn(page, signIn, accounts.organizer, event);

    await buyButton(page).click();
    await expect(success(page)).toBeVisible();
    expect(await held(accounts.organizer, event)).toBe(1);
  });

  test('a free ticket type is bought without an allow step', async ({ page, signIn, wallet }) => {
    const event = await createPublishedEvent({ title: 'Free Entry', ticketTypes: [{ name: 'Free Admission', price: 0, supply: 50 }] });
    await openSignedIn(page, signIn, accounts.jordan, event);
    await expect(buyButton(page)).toHaveText(/Buy tickets — 0\.00 USDC/);
    await expectSteps(page, 'Done', 'Not started');
    const usdcBefore = await chain.usdcBalance(accounts.jordan.address);
    const sent = wallet.requests.length;

    await buyButton(page).click();
    await expect(success(page)).toBeVisible();
    expect(sendsSince(wallet, sent)).toBe(1);
    expect(await held(accounts.jordan, event)).toBe(1);
    expect(await chain.usdcBalance(accounts.jordan.address)).toBe(usdcBefore);
  });
});
