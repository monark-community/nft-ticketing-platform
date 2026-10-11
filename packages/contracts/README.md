# NFTicketPass — Smart Contracts

Solidity smart contracts for NFTicketPass, a blockchain-based NFT ticketing platform. Built with Hardhat, OpenZeppelin, and deployed on Sepolia testnet.

## What it does

A single upgradeable ERC-721 contract (`TicketNFT.sol`) that manages all events on the platform. Features include:

- **Minting** — Organizers mint NFT tickets with IPFS metadata, individually or in batches (up to 100)
- **Check-in** — Per-event scanners mark tickets as permanently used on-chain
- **Whitelist** — Presale support with per-event address whitelisting
- **Royalties** — EIP-2981 royalties configurable per event, paid on secondary sales
- **Resale** — Platform resell function with USDC payments, price cap enforcement, and automatic royalty splitting
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
- `Resale.test.ts` — Resell flow, royalty payments, price cap enforcement

## Deploy (Local)

```bash
npx hardhat node
npx hardhat run scripts/deploy.ts --network localhost
```

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

