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

On a fresh node, a local deploy leaves git clean: `services/web/src/contracts/addresses.json` already holds the local addresses. If `TicketNFT.json` changes, the contract's ABI changed: commit it with your contract change.

## Local Test Data

One command starts a fresh local environment: a new Hardhat node, the deploy, the database and API in Docker, and test data on both sides.

```bash
cd packages/contracts && npm run dev:fresh
```

Leave it running: the node keeps going in that terminal, and Ctrl+C stops it. Then, in a second terminal:

```bash
cd services/web && npm run dev
```

Every run starts from scratch: a new chain, and the database is reset and seeded again.

### One-time setup

1. `npm install` in `packages/contracts`, `services/api` and `services/web`.
2. Create the `.env` files (see the root README). In `services/api/.env`, point the API at the local node. The command checks these two values and stops if they're wrong, but never edits the file:
   ```
   RPC_URL=http://host.docker.internal:8545
   CONTRACT_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
   ```
   The address is the same on every fresh node.
3. MetaMask: add a network with RPC URL `http://127.0.0.1:8545` and chain ID `31337`, then import the test accounts' private keys, printed at the end of `npm run dev:fresh`. These keys are public: never use them on Sepolia or mainnet.

After pulling a change to `services/api/Dockerfile` or the API's dependencies, rebuild the API image once: `docker compose build api`.

### What you get

| Account | Role | Starts with |
|---------|------|-------------|
| #0 | Admin | |
| #1 | Organizer of both events | |
| #2 | Attendee | 950 test USDC, 2 General Admission and 2 Early Bird tickets for event 1, on the event 2 guest list |
| #3 | Attendee | 1,000 test USDC, no tickets, not on the guest list |
| #4 | Scanner for event 1 | |

- **Event 1, Gala Opera Concert:** public sale. General Admission 15 USDC, VIP 28 USDC, Early Bird 10 USDC (sold out). 10% royalty, 2x resale cap, 4 tickets per wallet.
- **Event 2, Jazz at the Atrium:** same tiers, presale only, so #3 sees "not on the guest list".

Each run is a new chain, so MetaMask's saved activity no longer matches. For each imported test account: Settings > Advanced > Clear activity tab data, or transactions fail with "nonce too high".

### Without Docker

1. Start the node and leave it running: `cd packages/contracts && npx hardhat node`
2. In a second terminal, deploy: `cd packages/contracts && npx hardhat run scripts/deploy.ts --network localhost`
3. In `services/api/.env`, set `RPC_URL=http://127.0.0.1:8545` and the `CONTRACT_ADDRESS` above. Then in `services/api`: `npx prisma migrate reset --force`, `npm run db:seed`, and `npm run dev`.
4. Once the API logs "Blockchain listener connected to contract", seed the chain: `cd packages/contracts && npx hardhat run scripts/seed.ts --network localhost`


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

