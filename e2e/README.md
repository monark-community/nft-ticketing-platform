# End-to-end tests

Playwright tests that use the app the way people do: a real browser with a test wallet, against a local chain, the API and the database (#336). They run locally with one command, and on every pull request in CI.

## Run them

From the repo root in Git Bash, the first time:

```bash
npm ci --prefix packages/contracts && npm ci --prefix services/api && npm ci --prefix services/web && npm ci --prefix e2e
cd e2e && npx playwright install chromium
```

Docker Desktop must be running: the tests start a Postgres of their own (`e2e/docker-compose.yml`, port 5434, data in memory), so your dev database isn't touched. It keeps running between runs; `docker compose -f e2e/docker-compose.yml down` stops it. Stop the dev environment from `npm run dev:fresh` first (`Ctrl+C` in its terminal, then `docker compose stop api`): its Hardhat node needs port 8545, and its API would read the test chain into your dev database.

Then, from `e2e/`:

| Command | What it does |
|---------|--------------|
| `npm test` | Starts the whole stack, runs every test on desktop and phone, stops the stack |
| `npm run stack` | Starts the stack and keeps it running. In another terminal, `npm test` then reuses it, so runs take seconds instead of minutes |
| `npm run test:desktop` / `npm run test:phone` | Only one screen size |
| `npx playwright test tests/scanner.spec.ts` | One file |
| `npm run test:ui` | Playwright's UI mode, to watch and step through tests |
| `npm run report` | Opens the last run's report |

Starting the stack takes one to three minutes (longer on Windows), most of it the web app's production build. `E2E_SKIP_BUILD=1 npm run stack` reuses the last build when only tests changed. The build goes to `services/web/.next` like `npm run build` does, so run `npm run build` again before using `npm start` yourself.

## The stack

`stack/run.mjs` starts everything in one process, on ports of its own:

| What | Where |
|------|-------|
| Web app (production build) | http://localhost:3100 |
| API with the blockchain listener | http://localhost:3101 |
| Stand-in for Pinata (uploads and images) | http://localhost:3102 |
| Hardhat node (fresh, with the dev seed) | http://127.0.0.1:8545 |
| Database | `nft_ticketing_e2e` on the tests' Postgres (port 5434) |
| Control server (resets between files) | http://127.0.0.1:3199 |

Before each test file, on each screen size, everything goes back to the seeded state: the chain is reverted to a snapshot, the database is copied again and the API restarts. That takes about 5 seconds. Tests in the same file share the state, in order.

Only two settings differ from production, both for the tests: the API allows more sign-ins per minute (`AUTH_RATE_LIMIT_MAX`), and uploads go to the local stand-in for Pinata (`PINATA_UPLOAD_URL`), because the tests can't use a real Pinata key. The API code that uploads is the same.

If the stack doesn't start, its logs are in `e2e/.stack/logs/`. To use another Postgres than the tests' one, set `E2E_DATABASE_ADMIN_URL` to a user that can create databases (for example `postgresql://user:password@localhost:5432/postgres`).

## Write a test

One spec file per sub-issue, so people working in parallel only share the helpers:

| Sub-issue | File |
|-----------|------|
| #337 Setup | `tests/setup.spec.ts` |
| #338 Full demo journey | `tests/journey.spec.ts` |
| #339 Sign-up, sign-in and the session | `tests/auth.spec.ts` |
| #340 Profile and organizer requests | `tests/profile.spec.ts` |
| #341 Admin page | `tests/admin.spec.ts` |
| #342 Creating and publishing an event | `tests/create-event.spec.ts` |
| #343 Events page and event page | `tests/events.spec.ts` |
| #344 Buying tickets | `tests/buying.spec.ts` |
| #345 My Tickets and the entry QR code | `tests/my-tickets.spec.ts` |
| #346 Scanner and check-in | `tests/scanner.spec.ts` |
| #347 Marketplace | `tests/marketplace.spec.ts` |
| #348 Organizer dashboard | `tests/organizer-dashboard.spec.ts` |
| #349 Every page | `tests/every-page.spec.ts` |

```ts
import { accounts, chain, createPublishedEvent, expect, test, waitForSync } from '../fixtures/index.js';

test('Jordan sees a ticket he bought in My Tickets', async ({ page, signIn }) => {
  const event = await createPublishedEvent({ title: 'Rooftop Jazz' });
  const { block } = await chain.buyTickets(accounts.jordan, { eventId: event.contractId });
  await waitForSync(block);

  await signIn(accounts.jordan, { path: '/my-tickets' });
  await expect(page.getByText('Rooftop Jazz')).toBeVisible();
});
```

The rules from #336: find elements by role and label, never by CSS classes; check the screen, the contract and the API when a transaction is involved; no fixed waits, wait for what a person would see; every test also runs at phone size.

### Fixtures

| Fixture | What it gives you |
|---------|-------------------|
| `wallet` | The test wallet, in every page. Starts as Alex, not connected. `use(account)`, `switchAccount(account)`, `switchNetwork(chainId)`, `rejectNext()` or `rejectNext('connect' \| 'sign' \| 'send' \| 'switchNetwork')`, `disconnect()`, and `requests` (every method the page asked for) |
| `signIn(who, { path })` | Signs in through the real Connect button, as an account or a role (`'attendee'`, `'organizer'`, `'admin'`, `'scanner'`), and ends on `path` |
| `openScanner(scenes, who)` | A second browser on `/scan`, whose camera plays `scenes`, for example `[{ qr: await entryQr(accounts.alex, 0, 1), seconds: 3 }]` |

### Helpers

| Helper | What it does |
|--------|--------------|
| `createPublishedEvent(options)` | An event published through the API and the contract, without the UI. Options for dates, rules, presale guest list and ticket types |
| `ApiSession.signIn(account)`, `apiGet(path)` | The API as a signed-in account, or a public read |
| `chain.buyTickets`, `chain.listTicket`, `chain.cancelListing`, `chain.buyListedTicket`, `chain.checkIn` | Transactions as any account. Each returns the `block` it landed in |
| `chain.increaseTime(seconds)`, `chain.chainNow()` | Moves the chain's clock (the browser's clock doesn't move: use `page.clock`) |
| `chain.giveUsdc`, `chain.setEth`, `chain.emptyWallet`, `chain.usdcBalance`, `chain.ownerOf` | Funds and balances |
| `waitForSync(block)` | Waits until the API's listener has saved that block, so the API shows the change |
| `entryQr(owner, tokenId, eventId, timestamp?)` | The entry QR code a ticket's owner shows at the door, signed like My Tickets does |
| `resetStack()` | Back to the seeded state in the middle of a file, if a test needs it |

### Accounts

Hardhat's test accounts, set up by the seeds. Their keys are public: local only.

| Name | Account | Starts with |
|------|---------|-------------|
| `accounts.admin` | #0 Dev Admin | Admin |
| `accounts.organizer` | #1 Sophie Martin | Organizer of both seeded events |
| `accounts.alex` | #2 Alex Vance | 950 USDC, tickets 0-3 for the Gala, on the Jazz guest list |
| `accounts.jordan` | #3 Jordan Lee | 1,000 USDC, no tickets |
| `accounts.scanner` | #4 Sam Door | Can check in the Gala |
| `accounts.new1` to `accounts.new5` | #5 to #9 | Not registered, for sign-up tests |

The seeded events are `seededEvents.gala` (event 1, public sale, Early Bird sold out) and `seededEvents.jazz` (event 2, presale).

## When a test fails

Every failed test keeps a trace: a recording of each step, with the page, the console and the network at that moment.

- **Locally:** `npm run report`, open the failed test and click the trace. Or `npx playwright show-trace test-results/<test folder>/trace.zip`.
- **In CI:** open the failed run, scroll to **Artifacts** at the bottom of its summary page and download `e2e-results`. Unzip it and run `npx playwright show-trace <test folder>/trace.zip` from `e2e/`, or drop the zip on https://trace.playwright.dev. The stack's logs are in the same download.

In the trace, start from the red step on the left, then look at the page before and after it, and at the Console and Network tabs for errors from the app or the API.

## In CI

The `e2e` job in `.github/workflows/ci.yml` runs on every pull request to `dev` or `main` that changes the app, the API, the contracts or these tests. It uses a standard GitHub-hosted Ubuntu runner (free for public repositories), Postgres as a service container and a cached browser. A new push cancels the run before it. If the job ever takes more than 15 minutes, split it across runners with `npx playwright test --shard=1/2` and `--shard=2/2`.
