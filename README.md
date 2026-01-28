# NFTokenPass

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
![GitHub Issues](https://img.shields.io/github/issues/monark-community/{{PROJECT_NAME}})
![GitHub Issues](https://img.shields.io/github/issues-pr/monark-community/{{PROJECT_NAME}})
![GitHub Stars](https://img.shields.io/github/stars/monark-community/{{PROJECT_NAME}})
![GitHub Forks](https://img.shields.io/github/forks/monark-community/{{PROJECT_NAME}})

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
└── infra/
    └── docker-compose.yaml       # Optional global infrastructure
```

## Getting Started

Coming soon

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

Coming soon


## Contribution

See [CONTRIBUTION.md](./CONTRIBUTION.md) to learn about contributions guidelines.

## Code of Conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) to learn about the code of conduct.

## License

See the [LICENSE](./LICENSE) file to learn more about this project's licensing.
