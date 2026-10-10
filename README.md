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

- 🚀 **Event Organizer Dashboard** - Create and manage events easily. Organizers can mint NFT tickets with specific details like seat numbers, dates, and prices.
- ✅ **Wallet-Based Login** - Secure authentication for everyone. Users connect their crypto wallets (MetaMask) to buy, view, and store their tickets.
- 🔄 **Fair Resale Market** - Smart contracts automatically enforce price limits and royalties on secondary sales, preventing scalping and ensuring creators get paid.
- 📱 **Secure Check-in System** - Verify tickets instantly at the venue using a QR code scanner or a cryptographic wallet signature to prevent fraud.
- 💾 **Dynamic Metadata** - Tickets are not just images; they store essential data directly on the blockchain.

---

## Team & Roles

* **Yassine Hassoune:** Lead Blockchain Developer – *Smart Contract architecture, Solidity testing, Security.*
* **Abd-Ennour Souit:** Backend & DevOps Engineer – *API (Express), Database design, Cloud deployment (Render).*
* **Dan Dushime:** Frontend Architect – *Next.js structure, Routing, State management.*
* **Zachary:** Web3 Integrator – *Wallet connection (RainbowKit/Wagmi), Blockchain-to-Frontend logic.*
* **Liam Madgett:** UI/UX Designer & Dev – *Component library (shadcn/ui), User experience flows, Responsiveness.*

---
## 🎯 Objectives & Success Criteria

**Value Proposition**
* We aim to solve the lack of control in the secondary ticketing market. By using NFTs, we guarantee authenticity for buyers and enforce royalties for organizers.

**Key Accomplishments (MVP)**
1.  **Minting:** Organizers can create verifiable digital tickets.
2.  **Trading:** A controlled marketplace where resale price limits are enforced.
3.  **Validation:** A "scan-to-enter" system that verifies ownership in < 2 seconds.

**Criteria for Success**
* Successful deployment on a Testnet (e.g., Sepolia or Tenderly).
* Zero critical security vulnerabilities in the Smart Contracts.
* Seamless user onboarding (users can buy a ticket without complex crypto knowledge).

---

## Project Structure

```
nft-ticketing-platform/
├── packages/
│   ├── shared/                   # Shared types and utilities
│   ├── smart-contracts/          # Solidity contracts + ZK circuits
│   │   ├── contracts/            # Smart contracts
│   │   ├── circuits/             # Circom ZK circuits
│   │   └── test/                 # Contract tests
│   └── subgraph/                 # The Graph indexing
├── services/
│   ├── api/                      # Backend API (Node.js + PostgreSQL)
│   │   ├── src/controllers/      # API endpoints
│   │   └── src/middlewares/      # Auth, validation
│   │   ├── src/models/           # Data Models
│   │   ├── src/routes/           # API Routes with OpenAPI documentation
│   │   ├── src/services/         # Business logic
│   └── web/                      # Frontend (Next.js + React)
│       ├── app/                  # App router pages
│       ├── components/           # UI components
│       └── services/             # API clients, blockchain
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

#### Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/monark-community/nft-ticketing-platform.git
   cd nft-ticketing-platform
   ```

2. **Create environment configuration:**
   ```bash
   # Copy the Docker environment example
   cp .env.docker.example .env
   
   # Edit .env with your specific configuration (optional for development)
   # nano .env  # or your preferred editor
   ```

3. **Build and start the services:**
   ```bash
   # Start services (development)
   docker-compose up --build
   ```

4. **Access the application:**
   - **Web Frontend:** http://localhost:3000
   - **API Server:** http://localhost:3001
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
docker-compose exec api npm run migrate
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
| Out of disk space | Run `docker system prune -a` to remove unused images |
| Changes not reflecting | Rebuild services: `docker-compose build --no-cache` |
| Permission denied | Run with `sudo` or add your user to docker group: `sudo usermod -aG docker $USER` |

---

## Available Scripts

Coming soon

## Deployment

Coming soon

## Architecture & Risks
### Expected Architecture

* Blockchain: Handles ownership, transfers, and royalties (Solidity).

* Backend: Indexes events and stores heavy metadata (images/descriptions) to save gas.

* Frontend: Next.js application interacting with API and Blockchain via RPC.

### Anticipated Risks

* Gas Fees: High transaction costs could deter users. Mitigation: Deploying on optimized L2 testnets.

* Smart Contract Bugs: Immutable code means bugs are permanent. Mitigation: Using OpenZeppelin libraries and 100% test coverage.

## Legal & Social Implications
### Legal Considerations

* GDPR Compliance: We do not store Personal Identifiable Information (PII) on the blockchain. Only wallet addresses and public ticket metadata are on-chain.

* KyC/AML: As an academic project, we bypass real-money regulations, but we acknowledge that a mainnet release would require Know Your Customer (KYC) integration.

### Social Impact

* Fairness: The system prevents scalpers from buying bulk tickets using bots, ensuring fair access for real fans.

* Environmental Impact: By choosing Proof-of-Stake networks, our carbon footprint is negligible compared to legacy Proof-of-Work chains.

## Documentation

- Docker setup and deployment guide: [DOCKER.md](./DOCKER.md)
- Additional docs: [docs/README.md](./docs/README.md)


## Contribution

See [CONTRIBUTION.md](./CONTRIBUTION.md) to learn about contributions guidelines.

## Code of Conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) to learn about the code of conduct.

## License

See the [LICENSE](./LICENSE) file to learn more about this project's licensing.
