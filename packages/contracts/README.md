# NFTicketPass — Smart Contracts

Solidity smart contracts for NFTicketPass, a blockchain-based NFT ticketing platform. Built with Hardhat, OpenZeppelin, and deployed on Sepolia testnet.

## What it does

A single upgradeable ERC-721 contract (`TicketNFT.sol`) that manages all events on the platform. Features include:

- **Minting** — Organizers mint NFT tickets with IPFS metadata, individually or in batches (up to 100)
- **Check-in** — Per-event scanners mark tickets as permanently used on-chain
- **Whitelist** — Presale support with per-event address whitelisting
- **Event permissions** — Whitelist, presale, scanners, ticket issuance and organizer check-in are limited to the event's own organizer or the admin. The admin can also update an event's settings after sales start.
- **Royalties** — EIP-2981 royalties configurable per event, paid on secondary sales
- **Resale** — Buyer-initiated platform resale: the seller lists within the price cap, the buyer accepts and pays in USDC; royalties split automatically
- **Upgradeable** — UUPS proxy pattern for MVP iteration, to be permanently locked before public sale

## Tech Stack


| Component       | Version  |
| --------------- | -------- |
| Solidity        | ^0.8.24  |
| Hardhat         | 2.28.6   |
| OpenZeppelin    | 5.1.0    |
| EVM Target      | Shanghai |
| Node.js         | 22 LTS   |
| Package Manager | npm      |


## Setup

```bash
cd packages/contracts
npm install
```

## Compile

```bash
npx hardhat compile
```

> The optimizer is enabled (200 runs) to keep the contract under the 24,576 byte EIP-170 size limit.

## Test

```bash
npx hardhat test
```

Test files cover:

- `AccessControl.test.ts` — Role management, minting restrictions, check-in authorization
- `ScannerRole.test.ts` — Per-event scanner assignment, revocation, cross-event isolation
- `BatchMint.test.ts` — Batch minting scenarios
- `Whitelist.test.ts` — Whitelist management, presale enforcement, public sale transitions
- `Resale.test.ts` — Listing, buying, cancelling, price cap and royalties
- `EventPermissions.test.ts` — Event-scoped organizer/admin permissions
- `AdminEventSettings.test.ts` — Admin updates to an event's settings

## Deploy (Local)

```bash
npx hardhat node
npx hardhat run scripts/deploy.ts --network localhost
```

Don't commit the files the deploy writes to `services/web/src/contracts/` after a local deploy: `git restore services/web/src/contracts/`.

## Local Test Data

Two seeds give you events you can buy, tickets to show and a scanner to test with. Run them in this order: the listener only saves what happens while the API is running, so the API must be up before the on-chain seed.

From the project root, with Docker (the default setup):

1. Start the local node in its own terminal and leave it running: `cd packages/contracts && npx hardhat node`
2. In a second terminal, deploy: `cd packages/contracts && npx hardhat run scripts/deploy.ts --network localhost`, then go back to the project root (`cd ../..`). `services/api/.env` needs `RPC_URL=http://host.docker.internal:8545` and `CONTRACT_ADDRESS` set to the TicketNFT address the deploy printed.
3. Start the API: `docker compose up -d api`
4. Seed the database: `docker compose exec -T api npm run db:seed`
5. Check the listener is connected: `docker compose logs api` should show "Blockchain listener connected to contract 0x…"
6. Seed the chain: `cd packages/contracts && npx hardhat run scripts/seed.ts --network localhost`

Without Docker, run the same steps with the API started from `services/api` (`npm run dev`, with `RPC_URL=http://127.0.0.1:8545`) and the database seed run there too (`npm run db:seed`).

What you get:

| Account | Role | Starts with |
|---------|------|-------------|
| #0 | Admin | |
| #1 | Organizer of both events | |
| #2 | Attendee | 950 test USDC, 2 General Admission and 2 Early Bird tickets for event 1, on the event 2 guest list |
| #3 | Attendee | 1,000 test USDC, no tickets, not on the guest list |
| #4 | Scanner for event 1 | |

- **Event 1, Gala Opera Concert:** public sale. General Admission 15 USDC, VIP 28 USDC, Early Bird 10 USDC (sold out). 10% royalty, 2x resale cap, 4 tickets per wallet.
- **Event 2, Jazz at the Atrium:** same tiers, presale only, so #3 sees "not on the guest list".

To use an account in MetaMask, add a network with RPC URL `http://127.0.0.1:8545` and chain ID `31337`, then import the account's private key from the `npx hardhat node` output. These keys are public: never use them on Sepolia or mainnet.

Restarting the node wipes the chain, but not the database. To start over: restart the node, deploy, reset the database (`docker compose exec -T api npx prisma migrate reset --force`, or `npx prisma migrate reset` in `services/api` without Docker), then run both seeds again. The on-chain seed refuses to run twice on the same chain. If you used the old seed before this one, reset the database first.

## Deploy (Sepolia)

Requires environment variables — create a `.env` file:

```
SEPOLIA_RPC_URL=<your_alchemy_or_infura_url>
DEPLOYER_PRIVATE_KEY=<your_wallet_private_key>
USDC_ADDRESS=<sepolia_usdc_contract_address>
```

```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

## Contract Architecture

The contract inherits from:

- `ERC721Upgradeable` + `ERC721URIStorageUpgradeable` — NFT standard with per-token metadata
- `AccessControlUpgradeable` — Role-based permissions (ADMIN, ORGANIZER)
- `ERC2981Upgradeable` — Royalty standard for marketplace compatibility
- `UUPSUpgradeable` — Gas-efficient proxy upgrade pattern
- `ReentrancyGuardUpgradeable` — Protection against reentrancy on USDC transfers

## Key Design Decisions

- **Single contract for all events** — Simpler deployment and management for MVP. Per-event contracts are post-MVP.
- **USDC for payments** — Stable pricing vs ETH volatility.
- **Per-event scanner mapping** — Scanners are authorized per event, not globally. A scanner for event 1 cannot check in tickets for event 2.
- **Used tickets remain transferable** — Maintains full ERC-721 compatibility. Tickets stay permanently marked as used.
- **Price cap enforcement on-platform only** — Off-platform transfers (OpenSea, direct transferFrom) cannot enforce price caps.

## Known Limitations

- MockUSDC uses 18 decimals; real USDC uses 6. Decimal handling must be updated before mainnet.
- Single admin wallet controls upgrade authority. Multisig governance is post-MVP.
- IPFS metadata pinned on Pinata free tier — not guaranteed long-term.
- No event cancellation or ticket burning mechanism in MVP.

