// The ticket scanner and check-in (#346): who can scan, the event picker, camera errors, every kind
// of QR code in front of the fake camera, and checking a ticket in.
//
// Tests that check a ticket in use their own buyer and ticket (Hardhat's accounts #10 and up), so no
// test depends on another one. Read-only scans use Alex's seeded Gala ticket #0.

import type { Page } from '@playwright/test';

import {
  accounts,
  ApiSession,
  apiGet,
  chain,
  createPublishedEvent,
  entryQr,
  expect,
  newWallet,
  seededEvents,
  test,
  waitForSync,
  type Account,
  type CameraScene,
  type Role,
  type ScannerSession,
} from '../fixtures/index.js';

// --- Helpers -------------------------------------------------------------------------------------

type OpenScanner = (scenes: CameraScene[], who?: Account | Role) => Promise<ScannerSession>;

const GALA = seededEvents.gala;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const RESULT = { timeout: 30_000 }; // the fake camera and the QR reader take a few seconds
const CHECKED_IN_AT = /Checked in\s*(Today|[A-Z][a-z]{2} \d{1,2}) at \d{1,2}:\d{2}\s?[AP]M/;

/** A new wallet with a finished account and ETH for gas */
async function createAccount(index: number, name: string, { eth = 10 } = {}): Promise<Account> {
  const account = newWallet(index);
  const session = await ApiSession.signIn(account);
  await session.put('/api/users/me', { first_name: name, last_name: `E2E ${index}`, email: `${name.toLowerCase()}.${index}@example.com` });
  await chain.setEth(account.address, eth);
  return account;
}

async function createBuyer(index: number) {
  const buyer = await createAccount(index, 'Buyer');
  await chain.giveUsdc(buyer.address, 200);
  return buyer;
}

/** One General Admission ticket for the Gala, once the API has it */
async function buyGalaTicket(buyer: Account): Promise<bigint> {
  const { tokenIds: [tokenId], block } = await chain.buyTickets(buyer, { eventId: GALA.contractId });
  await waitForSync(block);
  return tokenId;
}

async function setScanner(by: Account, eventId: bigint, scanner: Account, allowed: boolean) {
  const receipt = await (await chain.ticketNft(by).setEventScanner(eventId, scanner.address, allowed)).wait();
  await waitForSync(receipt?.blockNumber);
}

/** A new wallet the Gala's organizer adds as a scanner */
async function addGalaScanner(index: number, { eth = 10 } = {}) {
  const scanner = await createAccount(index, 'Scanner', { eth });
  await setScanner(accounts.organizer, GALA.contractId, scanner, true);
  return scanner;
}

async function grantOrganizer(account: Account) {
  const nft = chain.ticketNft(accounts.admin);
  const receipt = await (await nft.grantRole(await nft.ORGANIZER_ROLE(), account.address)).wait();
  await waitForSync(receipt?.blockNumber);
}

/** A new scanner wallet for the Gala and for another organizer's event (not for the Jazz night) */
async function scannerForTwoEvents(scannerIndex: number, organizerIndex: number) {
  const organizer = await createAccount(organizerIndex, 'Olivia');
  await grantOrganizer(organizer);
  const other = await createPublishedEvent({ organizer, title: `Harbour Night ${Date.now().toString(36)}` });
  const scanner = await addGalaScanner(scannerIndex);
  await setScanner(organizer, other.contractId, scanner, true);
  return { scanner, other };
}

/** Alex's seeded Gala ticket #0, with some fields replaced (they're all checked before the signature) */
async function alexQr(changes: Record<string, unknown> = {}, timestamp?: number) {
  const qr = JSON.parse(await entryQr(accounts.alex, 0, GALA.contractId, timestamp));
  return JSON.stringify({ ...qr, ...changes });
}

/** The scanner with `qr` in front of its camera, set on the Gala (other wallets may list other events first) */
async function scan(openScanner: OpenScanner, qr: string, who: Account | Role = 'scanner') {
  const scanner = await openScanner([{ qr, seconds: 3 }], who);
  await scanner.page.getByLabel("Event you're scanning for").selectOption(String(GALA.contractId));
  return scanner;
}

async function expectRejected(page: Page, reason: string) {
  await expect(page.getByText('Do not admit')).toBeVisible(RESULT);
  await expect(page.getByText(reason)).toBeVisible();
}

const checkInButton = (page: Page) => page.getByRole('button', { name: 'Check in', exact: true });
const sends = (scanner: ScannerSession) => scanner.wallet.requests.filter((method) => method === 'eth_sendTransaction').length;

// --- Access --------------------------------------------------------------------------------------

test.describe('access', () => {
  test('no wallet connected: asked to connect the scanner wallet', async ({ page }) => {
    await page.goto('/scan');
    await expect(page.getByRole('heading', { name: 'Connect the scanner wallet' })).toBeVisible();
    await expect(page.getByText('Use the wallet the organizer added as a scanner for this event.')).toBeVisible();
    await expect(page.getByRole('main').getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible();
  });

  test("a wallet that can't scan any event: told to ask the organizer", async ({ page, signIn }) => {
    await signIn(accounts.jordan, { path: '/scan' });
    await expect(page.getByRole('heading', { name: "This wallet can't scan tickets" })).toBeVisible();
    await expect(page.getByText('Ask the event organizer to add this wallet as a scanner, then reload this page.')).toBeVisible();
    await expect(page.getByLabel("Event you're scanning for")).toBeDisabled();
  });

  const SCANNERS: Array<{ label: string; who: Role }> = [
    { label: "the event's organizer", who: 'organizer' },
    { label: 'the admin', who: 'admin' },
    { label: 'an added scanner wallet', who: 'scanner' },
  ];

  for (const { label, who } of SCANNERS) {
    test(`${label} can scan`, async ({ openScanner }) => {
      const scanner = await scan(openScanner, await alexQr(), who);
      await expect(scanner.page.getByText('Valid ticket')).toBeVisible(RESULT);
    });
  }

  test('a scanner removed while the page is open: the next check-in is refused with a clear message', async ({ openScanner }) => {
    const wallet = await addGalaScanner(10);
    const scanner = await scan(openScanner, await alexQr(), wallet);
    await expect(scanner.page.getByText('Valid ticket')).toBeVisible(RESULT);

    await setScanner(accounts.organizer, GALA.contractId, wallet, false);
    await checkInButton(scanner.page).click();
    await expect(scanner.page.getByText('Check-in failed')).toBeVisible();
    await expect(scanner.page.getByText('This wallet is not an authorized scanner for this event.')).toBeVisible();
    expect(await chain.ticketNft().isUsed(0)).toBe(false);
  });
});

// --- Event picker --------------------------------------------------------------------------------

test.describe('event picker', () => {
  test('lists only the on-chain events this wallet can scan', async ({ page, signIn }) => {
    const { scanner, other } = await scannerForTwoEvents(11, 12);
    // A draft of the Gala's organizer: not on the contract, so never listed
    const start = Date.now() + 30 * 86_400_000;
    await (await ApiSession.signIn(accounts.organizer)).post('/api/events', {
      title: `Unpublished ${Date.now().toString(36)}`,
      description: 'A draft from an end-to-end test.',
      category: 'Concerts',
      location: 'Ottawa, ON',
      start_date: new Date(start).toISOString(),
      end_date: new Date(start + 3 * 3_600_000).toISOString(),
    });

    await signIn(scanner, { path: '/scan' });
    const options = page.getByLabel("Event you're scanning for").locator('option');
    await expect(options).toHaveCount(2);
    await expect(options.filter({ hasText: GALA.title })).toHaveCount(1);
    await expect(options.filter({ hasText: other.title })).toHaveCount(1);
    await expect(options.filter({ hasText: seededEvents.jazz.title })).toHaveCount(0); // not a scanner there
  });

  test('remembers the last event; switching events works', async ({ page, signIn }) => {
    const { scanner, other } = await scannerForTwoEvents(13, 14);
    await signIn(scanner, { path: '/scan' });
    const picker = page.getByLabel("Event you're scanning for");

    await picker.selectOption(String(other.contractId));
    await page.reload();
    await expect(picker).toHaveValue(String(other.contractId));

    await picker.selectOption(String(GALA.contractId));
    await expect(picker).toHaveValue(String(GALA.contractId));
    await page.reload();
    await expect(picker).toHaveValue(String(GALA.contractId));
  });
});

// --- Camera --------------------------------------------------------------------------------------

test.describe('camera', () => {
  // How the browser fails, set before the page loads; the QR library sorts each failure out as usual
  const FAILURES = [
    { what: 'permission denied', failure: 'NotAllowedError', message: 'Camera access is blocked. Allow camera access in your browser, then reload this page.' },
    { what: 'no camera', failure: 'NotFoundError', message: 'No camera found. Connect a camera or open this page on a phone.' },
    { what: 'camera in use', failure: 'NotReadableError', message: 'The camera is in use by another app. Close it, then reload this page.' },
    { what: 'page not on https', failure: 'insecure', message: 'The camera needs a secure (https) page. Open the scanner over https, or on localhost.' },
  ];

  for (const { what, failure, message } of FAILURES) {
    test(`${what}: its own message`, async ({ page, signIn }) => {
      await page.addInitScript((name) => {
        if (name === 'insecure') Object.defineProperty(window, 'isSecureContext', { get: () => false, configurable: true });
        else navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('The camera failed', name));
      }, failure);
      await signIn('scanner', { path: '/scan' });

      await expect(page.getByText('Camera unavailable')).toBeVisible();
      await expect(page.getByText(message)).toBeVisible();
    });
  }
});

// --- Each QR shown to the fake camera ------------------------------------------------------------

test.describe('each QR shown to the fake camera', () => {
  test('a valid ticket: its details and the Check in button', async ({ openScanner }) => {
    const { page } = await scan(openScanner, await alexQr());
    await expect(page.getByText('Valid ticket')).toBeVisible(RESULT);
    await expect(page.getByText('Check in to admit')).toBeVisible();
    const details = page.locator('dl');
    await expect(details).toContainText('General Admission');
    await expect(details).toContainText('#0');
    await expect(details).toContainText(`${accounts.alex.address.slice(0, 6)}…${accounts.alex.address.slice(-4)}`);
    await expect(details).toContainText(/QR signed\s*\d+ seconds? ago/);
    await expect(checkInButton(page)).toBeVisible();
  });

  test("a QR that isn't an NFTOKENPASS ticket (a website link, random text)", async ({ openScanner }) => {
    for (const qr of ['https://example.com/tickets/42', 'hello from the door']) {
      const { page } = await scan(openScanner, qr);
      await expectRejected(page, 'This QR code is not an NFTOKENPASS ticket.');
    }
  });

  test('an invalid ticket ID', async ({ openScanner }) => {
    const { page } = await scan(openScanner, await alexQr({ tokenId: 'not-a-number' }));
    await expectRejected(page, 'This QR code has an invalid ticket ID.');
  });

  test('a time in the future', async ({ openScanner }) => {
    const { page } = await scan(openScanner, await alexQr({}, Math.floor(Date.now() / 1000) + 120));
    await expectRejected(page, 'QR code time is in the future. Ask the attendee to refresh it.');
  });

  test('older than 60 seconds', async ({ openScanner }) => {
    const { page } = await scan(openScanner, await alexQr({}, Math.floor(Date.now() / 1000) - 120));
    await expectRejected(page, 'QR code has expired. Ask the attendee to refresh it.');
  });

  test('another network, another contract', async ({ openScanner }) => {
    const network = await scan(openScanner, await alexQr({ chainId: 1 }));
    await expectRejected(network.page, 'Ticket is for a different network (chain 1).');
    const contract = await scan(openScanner, await alexQr({ contractAddress: '0x000000000000000000000000000000000000dEaD' }));
    await expectRejected(contract.page, 'Ticket is from a different contract.');
  });

  test("a ticket that doesn't exist", async ({ openScanner }) => {
    const { page } = await scan(openScanner, await entryQr(accounts.alex, 999_999, GALA.contractId));
    await expectRejected(page, 'This ticket does not exist.');
  });

  test('a ticket already checked in: when it was, even from a QR code older than 60 seconds', async ({ openScanner }) => {
    const buyer = await createBuyer(20);
    const tokenId = await buyGalaTicket(buyer);
    await waitForSync((await chain.checkIn(accounts.scanner, tokenId)).block);

    const { page } = await scan(openScanner, await entryQr(buyer, tokenId, GALA.contractId));
    await expectRejected(page, 'This ticket has already been checked in.');
    await expect(page.locator('dl')).toContainText(CHECKED_IN_AT);

    // Not "expired": a new QR code wouldn't let it in either
    const old = await scan(openScanner, await entryQr(buyer, tokenId, GALA.contractId, Math.floor(Date.now() / 1000) - 120));
    await expectRejected(old.page, 'This ticket has already been checked in.');
    await expect(old.page.locator('dl')).toContainText(CHECKED_IN_AT);
  });

  test('a ticket for another event: both events are named', async ({ openScanner }) => {
    // Alex is on the Jazz night's presale guest list
    const { tokenIds: [tokenId], block } = await chain.buyTickets(accounts.alex, { eventId: seededEvents.jazz.contractId });
    await waitForSync(block);

    const { page } = await scan(openScanner, await entryQr(accounts.alex, tokenId, seededEvents.jazz.contractId));
    await expectRejected(page, `This ticket is for ${seededEvents.jazz.title}, not ${GALA.title}.`);
  });

  test('a broken signature', async ({ openScanner }) => {
    const { page } = await scan(openScanner, await alexQr({ signature: '0x1234' }));
    await expectRejected(page, 'QR code has an invalid signature. Ask the attendee to refresh it.');
  });

  test('signed by someone who no longer owns the ticket (it was resold after the QR was made)', async ({ openScanner }) => {
    const seller = await createBuyer(21);
    const tokenId = await buyGalaTicket(seller);
    const qr = await entryQr(seller, tokenId, GALA.contractId);
    await chain.listTicket(seller, tokenId, 20);
    await waitForSync((await chain.buyListedTicket(accounts.jordan, tokenId)).block);

    const { page } = await scan(openScanner, qr);
    await expectRejected(page, 'QR code was not signed by the current ticket owner. It may have been transferred or tampered with.');
  });

  test("the chain can't be reached", async ({ openScanner }) => {
    // A blank camera first, so the chain can be cut off once the page has loaded its events
    const scanner = await openScanner([{ qr: null, seconds: 8 }, { qr: await alexQr(), seconds: 4 }]);
    await expect(scanner.page.getByText("Point the camera at the attendee's QR code")).toBeVisible();
    await scanner.page.route(/127\.0\.0\.1:8545/, (route) => route.abort());

    await expectRejected(scanner.page, 'Could not reach the blockchain to verify this ticket.');
  });
});

// --- Check-in ------------------------------------------------------------------------------------

test.describe('check-in', () => {
  test('success shows how it was recorded; the contract marks the ticket used; My Tickets shows it checked in', async ({ page, signIn, openScanner }) => {
    const buyer = await createBuyer(22);
    const tokenId = await buyGalaTicket(buyer);
    const scanner = await scan(openScanner, await entryQr(buyer, tokenId, GALA.contractId));
    await expect(scanner.page.getByText('Valid ticket')).toBeVisible(RESULT);

    await checkInButton(scanner.page).click();
    await expect(scanner.page.getByText('Admit attendee')).toBeVisible();
    await expect(scanner.page.locator('dl')).toContainText('Transaction');
    await expect(scanner.page.locator('dl')).toContainText(/QR signed\s*\d+ seconds? ago/);
    expect(await chain.ticketNft().isUsed(tokenId)).toBe(true);

    // Shown again: refused, with the time it was checked in
    await scanner.page.getByRole('button', { name: 'Scan next ticket' }).click();
    await expectRejected(scanner.page, 'This ticket has already been checked in.');
    await expect(scanner.page.locator('dl')).toContainText(CHECKED_IN_AT);

    // The owner's My Tickets
    await waitForSync();
    await signIn(buyer, { path: '/my-tickets' });
    await expect(page.getByRole('article').filter({ hasText: GALA.title })).toContainText('Checked in on');
  });

  test('rejecting in the scanner wallet, then trying again', async ({ openScanner }) => {
    const buyer = await createBuyer(23);
    const tokenId = await buyGalaTicket(buyer);
    const scanner = await scan(openScanner, await entryQr(buyer, tokenId, GALA.contractId));
    await expect(scanner.page.getByText('Valid ticket')).toBeVisible(RESULT);

    scanner.wallet.rejectNext('send');
    await checkInButton(scanner.page).click();
    await expect(scanner.page.getByText('Check-in failed')).toBeVisible();
    await expect(scanner.page.getByText('The check-in was cancelled in the wallet.')).toBeVisible();
    expect(await chain.ticketNft().isUsed(tokenId)).toBe(false);

    await scanner.page.getByRole('button', { name: 'Try again' }).click();
    await expect(scanner.page.getByText('Admit attendee')).toBeVisible();
  });

  test('a scanner wallet without ETH for gas', async ({ openScanner }) => {
    const buyer = await createBuyer(24);
    const tokenId = await buyGalaTicket(buyer);
    const wallet = await addGalaScanner(15, { eth: 0 });
    const scanner = await scan(openScanner, await entryQr(buyer, tokenId, GALA.contractId), wallet);
    await expect(scanner.page.getByText('Valid ticket')).toBeVisible(RESULT);

    await checkInButton(scanner.page).click();
    await expect(scanner.page.getByText('Check-in failed')).toBeVisible();
    await expect(scanner.page.getByText('The scanner wallet does not have enough ETH to pay for gas.')).toBeVisible();

    await chain.setEth(wallet.address, 1);
    await scanner.page.getByRole('button', { name: 'Try again' }).click();
    await expect(scanner.page.getByText('Admit attendee')).toBeVisible();
  });

  test('two scanners checking in the same ticket at once: the second gets "already checked in"', async ({ openScanner }) => {
    const buyer = await createBuyer(25);
    const tokenId = await buyGalaTicket(buyer);
    const qr = await entryQr(buyer, tokenId, GALA.contractId);
    const first = await scan(openScanner, qr, 'scanner');
    const second = await scan(openScanner, qr, 'organizer');
    await expect(first.page.getByText('Valid ticket')).toBeVisible(RESULT);
    await expect(second.page.getByText('Valid ticket')).toBeVisible(RESULT);

    await checkInButton(first.page).click();
    await expect(first.page.getByText('Admit attendee')).toBeVisible();
    await checkInButton(second.page).click();
    await expect(second.page.getByText('Check-in failed')).toBeVisible();
    await expect(second.page.getByText('This ticket has already been checked in.')).toBeVisible();
  });

  test('a slow transaction: the waiting state, then "Stop waiting"', async ({ openScanner }) => {
    const buyer = await createBuyer(26);
    const tokenId = await buyGalaTicket(buyer);
    const scanner = await scan(openScanner, await entryQr(buyer, tokenId, GALA.contractId));
    await expect(scanner.page.getByText('Valid ticket')).toBeVisible(RESULT);

    // No blocks are mined, so the check-in stays pending
    await chain.provider.send('evm_setAutomine', [false]);
    try {
      await scanner.page.clock.install();
      await checkInButton(scanner.page).click();
      await expect(scanner.page.getByText('Checking in...')).toBeVisible();
      await expect(scanner.page.getByRole('button', { name: /Waiting for confirmation/ })).toBeVisible();

      // Two minutes later: still pending, and staff can stop waiting
      await scanner.page.clock.fastForward(121_000);
      await expect(scanner.page.getByText('Check-in pending')).toBeVisible();
      await expect(scanner.page.getByText("This is taking longer than usual. The check-in may still confirm, so don't scan this ticket again yet.")).toBeVisible();
      await scanner.page.getByRole('button', { name: 'Stop waiting' }).click();
      await expect(scanner.page.getByText(/^Stopped waiting\./)).toBeVisible();
      await expect(scanner.page.getByRole('button', { name: 'Scan next ticket' })).toBeVisible();
    } finally {
      await chain.provider.send('evm_setAutomine', [true]);
      await chain.mine();
    }
  });

  test('"Scan next" restarts the camera', async ({ openScanner }) => {
    // The QR, then a blank camera for a while, over and over
    const scanner = await openScanner([{ qr: 'hello from the door', seconds: 2 }, { qr: null, seconds: 6 }]);
    const { page } = scanner;
    await expectRejected(page, 'This QR code is not an NFTOKENPASS ticket.');
    await expect(page.getByText('Paused for review')).toBeVisible();

    // Wait until the camera shows the blank part, so the restart can be seen before the next read
    await page.waitForTimeout(2_500);
    await page.getByRole('button', { name: 'Scan next ticket' }).click();
    await expect(page.getByText("Point the camera at the attendee's QR code")).toBeVisible();
    await expect(page.getByText('Paused for review')).toHaveCount(0);
    await expectRejected(page, 'This QR code is not an NFTOKENPASS ticket.'); // read again when the QR comes back
  });

  test('double-clicking Check in sends one transaction', async ({ openScanner }) => {
    const buyer = await createBuyer(27);
    const tokenId = await buyGalaTicket(buyer);
    const scanner = await scan(openScanner, await entryQr(buyer, tokenId, GALA.contractId));
    await expect(scanner.page.getByText('Valid ticket')).toBeVisible(RESULT);

    const before = sends(scanner);
    await checkInButton(scanner.page).dblclick();
    await expect(scanner.page.getByText('Admit attendee')).toBeVisible();
    expect(sends(scanner)).toBe(before + 1);
  });

  test('checking in a listed ticket removes it from the Marketplace', async ({ openScanner }) => {
    const seller = await createBuyer(28);
    const tokenId = await buyGalaTicket(seller);
    await waitForSync((await chain.listTicket(seller, tokenId, 20)).block);
    const listed = async () =>
      (await apiGet<{ listings: Array<{ token_id: string | number }> }>('/api/listings?limit=50')).listings.map((l) => String(l.token_id));
    expect(await listed()).toContain(tokenId.toString());

    const scanner = await scan(openScanner, await entryQr(seller, tokenId, GALA.contractId));
    await expect(scanner.page.getByText('Valid ticket')).toBeVisible(RESULT);
    await checkInButton(scanner.page).click();
    await expect(scanner.page.getByText('Admit attendee')).toBeVisible();

    const [seller_] = await chain.ticketNft().listings(tokenId);
    expect(seller_).toBe(ZERO_ADDRESS);
    await waitForSync();
    expect(await listed()).not.toContain(tokenId.toString());
  });
});
