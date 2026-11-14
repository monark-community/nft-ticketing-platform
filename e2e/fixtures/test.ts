// The `test` every spec file imports. On top of Playwright's own fixtures it adds:
//   wallet       the test wallet, in every page (see wallet.ts). Starts as Alex, not connected.
//   signIn       signs in through the app's real Connect button, as an account or a role
//   openScanner  a second browser whose camera shows the QR codes you give it
// and it puts the stack back to the seeded state before each test file.

import { chromium, expect, test as base, type Page } from '@playwright/test';

import { API_URL } from '../stack/config.mjs';
import { accounts, type Account } from './accounts.js';
import { fakeCameraArgs, writeCameraVideo, type CameraScene } from './camera.js';
import { resetStack } from './stack.js';
import { TestWallet, WALLET_NAME } from './wallet.js';

export { expect };

export type Role = 'attendee' | 'organizer' | 'admin' | 'scanner';

const ROLE_ACCOUNTS: Record<Role, Account> = {
  attendee: accounts.alex,
  organizer: accounts.organizer,
  admin: accounts.admin,
  scanner: accounts.scanner,
};

const toAccount = (who: Account | Role) => (typeof who === 'string' ? ROLE_ACCOUNTS[who] : who);

/**
 * Signs in through the UI: the sign-in page, Connect wallet, the test wallet in RainbowKit's list,
 * then the signature (the wallet signs straight away). For accounts with a profile (the seeded
 * ones); sign-up tests go through the form themselves. Ends on `path` (default: the Events page).
 */
export async function signInThroughUi(page: Page, wallet: TestWallet, who: Account | Role, { path = '/' }: { path?: string } = {}) {
  await wallet.use(toAccount(who));
  await page.goto(`/signup?next=${encodeURIComponent(path)}`);
  await page.getByRole('main').getByRole('button', { name: 'Connect wallet' }).click();
  await page.getByRole('dialog').getByRole('button', { name: WALLET_NAME }).click();
  await expect
    .poll(async () => (await page.context().cookies(API_URL)).some((cookie) => cookie.name === 'token'), {
      message: 'the API session cookie after signing in',
      timeout: 20_000,
    })
    .toBe(true);
  const wanted = new URL(path, 'http://localhost').pathname;
  await page.waitForURL((url) => url.pathname === wanted);
}

export interface ScannerSession {
  page: Page;
  wallet: TestWallet;
}

let lastReset: string | null = null; // the project and file the stack was last reset for

export const test = base.extend<{
  seededState: void;
  wallet: TestWallet;
  signIn: (who: Account | Role, options?: { path?: string }) => Promise<void>;
  openScanner: (scenes: CameraScene[], who?: Account | Role) => Promise<ScannerSession>;
}>({
  // Every test file starts from the seeded state, on each project (desktop, phone). Tests in the
  // same file share it, in order.
  seededState: [
    async ({}, use, testInfo) => {
      const key = `${testInfo.project.name}:${testInfo.file}`;
      if (lastReset !== key) {
        await resetStack();
        lastReset = key;
      }
      await use();
    },
    { auto: true },
  ],

  wallet: [
    async ({ context }, use) => {
      await use(await TestWallet.attach(context, accounts.alex));
    },
    { auto: true },
  ],

  signIn: async ({ page, wallet }, use) => {
    await use((who, options) => signInThroughUi(page, wallet, who, options));
  },

  // Opens /scan in its own browser, with a camera playing `scenes`, signed in as the scanner
  openScanner: async ({ baseURL }, use, testInfo) => {
    // Playwright records this browser's trace like the test's own (trace: 'retain-on-failure')
    const opened: Array<{ close: () => Promise<void> }> = [];
    await use(async (scenes, who = 'scanner') => {
      const video = testInfo.outputPath(`camera-${opened.length + 1}.y4m`);
      writeCameraVideo(video, scenes);
      const project = testInfo.project.use;
      const browser = await chromium.launch({ args: fakeCameraArgs(video) });
      const context = await browser.newContext({
        baseURL,
        viewport: project.viewport,
        isMobile: project.isMobile,
        hasTouch: project.hasTouch,
        deviceScaleFactor: project.deviceScaleFactor,
        timezoneId: project.timezoneId,
        locale: project.locale,
        reducedMotion: 'reduce',
        permissions: ['camera'],
      });
      const wallet = await TestWallet.attach(context, toAccount(who));
      const page = await context.newPage();
      opened.push({ close: () => browser.close() });
      await signInThroughUi(page, wallet, who, { path: '/scan' });
      return { page, wallet };
    });
    for (const scanner of opened) await scanner.close();
  },
});
