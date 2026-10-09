# NFTokenPass

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
![GitHub Issues](https://img.shields.io/github/issues/monark-community/nft-ticketing-platform)
![GitHub Issues](https://img.shields.io/github/issues-pr/monark-community/nft-ticketing-platform)
![GitHub Stars](https://img.shields.io/github/stars/monark-community/nft-ticketing-platform)
![GitHub Forks](https://img.shields.io/github/forks/monark-community/nft-ticketing-platform)

NFTokenPass is a decentralized NFT ticketing platform developed as a Capstone project in collaboration with **Monark**. The platform solves the issues of scalping and fraud by minting tickets as unique, verifiable NFTs.

## Overview

NFTokenPass is an NFT ticketing platform designed to fix common issues like scalping and fake tickets. By using blockchain technology, we turn every ticket into a secure digital asset. This gives event organizers control over the secondary market, allowing them to set price limits and earn royalties on resales. Our goal is to build a system that is fair for fans and secure for creators, bridging the gap between standard ticketing and Web3.

## Key Features

- 🎟️ **Ticket Types & Purchases** - Organizers set up events with multiple ticket types (e.g. General Admission, VIP). Tickets are minted as NFTs at the moment of purchase, paid in USDC.
- ✅ **Wallet-Based Login** - Users sign in with their crypto wallet (MetaMask or WalletConnect). No passwords.
- 🔄 **Fair Resale** - Resales on the platform respect the organizer's price cap and pay the organizer a royalty. Once a ticket is used or the event is over, it becomes a collectible with no price cap.
- 🛡️ **Anti-Scalping Rules** - Per-wallet ticket limits and presale whitelists for each event.
- 📱 **Secure Check-in** - Attendees show a time-limited QR code signed by their wallet. Scanners verify it on-chain at the door, so screenshots can't be reused.
- 💾 **Permanent Metadata** - Event images and ticket metadata are stored on IPFS.

---

## Team & Roles

* **Abd-Ennour Souit:** Smart Contract Developer 
* **Yassine Hassoune:** Smart Contract Developer 
* **Liam Madgett:** Backend & Database Developer 
* **Dan Dushime:** Frontend Developer 
* **Zach Shewan:** DevOps & Database Developer

---
## 🎯 Objectives & Success Criteria

**Value Proposition**
* We aim to solve the lack of control in the secondary ticketing market. By using NFTs, we guarantee authenticity for buyers and enforce royalties for organizers.

**Key Accomplishments (MVP)**
1.  **Minting:** Organizers can create verifiable digital tickets.
2.  **Trading:** A controlled marketplace where resale price limits are enforced.
3.  **Validation:** A "scan-to-enter" system that verifies ownership in < 2 seconds.

**Criteria for Success**
* Successful deployment on the Sepolia testnet.
* Zero critical security vulnerabilities in the Smart Contracts.
* Seamless user onboarding (users can buy a ticket without complex crypto knowledge).

---

## Project Structure

```
nft-ticketing-platform/
├── packages/
│   └── contracts/                # Smart contracts (Hardhat + Solidity)
│       ├── contracts/            # TicketNFT.sol, MockUSDC.sol
│       ├── scripts/              # Deploy, upgrade and lock scripts
│       ├── test/                 # Contract tests
│       ├── README.md             # Contract setup and deployment
│       └── UPGRADES.md           # Upgrade and lock process
├── services/
│   ├── api/                      # Backend API (Express + PostgreSQL via Prisma)
│   │   ├── prisma/               # Database schema, migrations, seed
│   │   └── src/
│   │       ├── controllers/      # Request handlers
│   │       ├── middlewares/      # Auth, roles, rate limiting
│   │       ├── routes/           # API routes
│   │       ├── services/         # Business logic
│   │       └── workers/          # Blockchain event listener
│   └── web/                      # Frontend (Next.js + React)
│       └── src/
│           ├── app/              # App router pages
│           ├── components/       # UI components
│           ├── contracts/        # Contract ABI and addresses (exported by the deploy script)
│           ├── hooks/            # React hooks
│           └── lib/              # Wallet setup, helpers
├── docker-compose.yml            # Local Docker setup (api + web + db)
└── DOCKER.md                     # Docker usage and deployment guide
```

---
## Getting Started

### Quick Start with Docker

The easiest way to run the NFTokenPass platform is using Docker and Docker Compose. This ensures consistent environments across all systems.

#### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (version 20.10 or higher)
- [Docker Compose](https://docs.docker.com/compose/install/) (version 1.29 or higher)
- [Git](https://git-scm.com/)
- A free WalletConnect project ID from [cloud.reown.com](https://cloud.reown.com)

#### Setup Instructions

1. **Clone the repository:**
```bash
   git clone https://github.com/monark-community/nft-ticketing-platform.git
   cd nft-ticketing-platform
```

2. **Create environment configuration:**
```bash
   # Docker settings
   cp .env.docker.example .env

   # API settings: set at least JWT_SECRET (any string for local development)
   cp services/api/.env.example services/api/.env
```
   Then create `services/web/.env.local` containing:
```
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<your_project_id>
```
   Without it, the web app returns a 500 error.

3. **Build and start the services:**
```bash
   docker-compose up --build
```
   Database migrations run automatically when the API starts. If you ran the project before the database setup changed, reset your local database first with `docker-compose down -v`.

4. **Access the application:**
   - **Web Frontend:** http://localhost:3000
   - **API Server:** http://localhost:3001 (health check: `/health`, database check: `/db-health`)
   - **Database:** localhost:5432 (PostgreSQL)

#### Common Docker Commands

```bash
# View logs for all services
docker-compose logs -f

# View logs for specific service
docker-compose logs -f api
docker-compose logs -f web
docker-compose logs -f db

# Stop all services
docker-compose down

# Stop and remove all data (including database)
docker-compose down -v

# Rebuild services after code changes
docker-compose build

# Run a command in a container
docker-compose exec api npm run db:migrate:deploy
docker-compose exec web npm run build

# Access a service shell
docker-compose exec api sh
docker-compose exec web sh
```

#### Building Individual Services

If you want to build only specific services:

```bash
# Build only the API
docker build -f services/api/Dockerfile -t nft-ticketing-api ./services/api

# Build only the web frontend
docker build -f services/web/Dockerfile -t nft-ticketing-web ./services/web

# Run individual services
docker run -p 3001:3001 nft-ticketing-api
docker run -p 3000:3000 nft-ticketing-web
```

#### Environment Variables

All services use environment variables for configuration:

- **Global:** See [.env.example](./.env.example)
- **Docker-specific:** See [.env.docker.example](./.env.docker.example)
- **API service:** See [services/api/.env.example](./services/api/.env.example)
- **Web service:** See [services/web/.env.example](./services/web/.env.example)

#### Troubleshooting

| Issue | Solution |
|-------|----------|
| Port already in use | Change ports in docker-compose.yml or stop other services using those ports |
| Database connection errors | Ensure `db` service is running: `docker-compose ps` and check logs with `docker-compose logs db` |
| Web app returns a 500 error | Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in `services/web/.env.local` |
| Migration errors after pulling | Reset the local database: `docker-compose down -v`, then `docker-compose up --build` |
| Out of disk space | Run `docker system prune -a` to remove unused images |
| Changes not reflecting | Rebuild services: `docker-compose build --no-cache` |
| Permission denied | Run with `sudo` or add your user to docker group: `sudo usermod -aG docker $USER` |

### Local Blockchain Development

To run the smart contracts on a local blockchain, deploy them, and connect MetaMask, see the [contracts README](./packages/contracts/README.md). For upgrading or locking the deployed contract, see [UPGRADES.md](./packages/contracts/UPGRADES.md).

### Running Without Docker

Requires Node.js 20.9 or higher and a running PostgreSQL database.

```bash
# API (http://localhost:3001)
cd services/api
npm install
cp .env.example .env          # then set DATABASE_URL and JWT_SECRET
npm run db:generate
npm run db:migrate:deploy
npm run dev

# Web (http://localhost:3000), in a second terminal
cd services/web
npm install
npm run dev                   # needs services/web/.env.local (see above)
```

---

## Available Scripts

**Smart contracts** (`packages/contracts`)

| Command | Description |
|---------|-------------|
| `npx hardhat test` | Run all contract tests |
| `npx hardhat node` | Start a local blockchain |
| `npx hardhat run scripts/deploy.ts --network localhost` | Deploy locally and export the ABI to the frontend |

**API** (`services/api`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the API with auto-reload |
| `npm run build` / `npm start` | Build and run the compiled API |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:migrate` | Create and apply a migration (development) |
| `npm run db:migrate:deploy` | Apply existing migrations |
| `npm run db:seed` | Seed the database |
| `npm run db:studio` | Open Prisma Studio |

**Web** (`services/web`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` / `npm start` | Build and run the production app |
| `npm run lint` | Run ESLint |

## Deployment

Coming soon

## Architecture & Risks
### Expected Architecture

* Blockchain: Handles ownership, sales, check-in, transfers and royalties (Solidity, Sepolia testnet).

* Backend: Stores user accounts, event details and a cache of on-chain data, kept in sync by a blockchain event listener.

* IPFS: Stores event images and ticket metadata permanently.

* Frontend: Next.js application interacting with the API and the blockchain via RPC.

### Anticipated Risks

* Gas Fees: High transaction costs could deter users. Mitigation: deploying on low-cost networks.

* Smart Contract Bugs: Immutable code means bugs are permanent. Mitigation: Using OpenZeppelin libraries, extensive automated tests, and keeping the contract upgradeable until it is locked before the public sale.

## Legal & Social Implications
### Legal Considerations

* GDPR Compliance: We do not store Personal Identifiable Information (PII) on the blockchain. Only wallet addresses and public ticket metadata are on-chain.

* KyC/AML: As an academic project, we bypass real-money regulations, but we acknowledge that a mainnet release would require Know Your Customer (KYC) integration.

### Social Impact

* Fairness: Per-wallet limits and resale price caps make it harder for scalpers to buy tickets in bulk, ensuring fairer access for real fans.

* Environmental Impact: By choosing Proof-of-Stake networks, our carbon footprint is negligible compared to legacy Proof-of-Work chains.

## Documentation

- Docker setup and deployment guide: [DOCKER.md](./DOCKER.md)
- Smart contracts: [packages/contracts/README.md](./packages/contracts/README.md)
- Additional docs: [docs/README.md](./docs/README.md)


## Contribution

See [CONTRIBUTING.md](./CONTRIBUTING.md) to learn about contributions guidelines.

## Code of Conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) to learn about the code of conduct.

## License

See the [LICENSE](./LICENSE) file to learn more about this project's licensing.