// What the stack and the tests share: ports, URLs, database names and the test accounts.
// The stack runs on its own ports, so it can run next to npm run dev (except the Hardhat node: the
// web app always reads the local chain at 127.0.0.1:8545).

export const PORTS = { web: 3100, api: 3101, ipfs: 3102, control: 3199, chain: 8545 };

export const WEB_URL = `http://localhost:${PORTS.web}`;
export const API_URL = `http://localhost:${PORTS.api}`;
export const IPFS_URL = `http://localhost:${PORTS.ipfs}`; // the stand-in for Pinata
export const CONTROL_URL = `http://127.0.0.1:${PORTS.control}`; // resets the stack between test files
export const RPC_URL = `http://127.0.0.1:${PORTS.chain}`;

export const CHAIN_ID = 31337;
export const SEPOLIA_CHAIN_ID = 11155111;

// A database of its own, next to the dev one, so the tests never touch your local data
export const DB_NAME = 'nft_ticketing_e2e';
export const DB_TEMPLATE = 'nft_ticketing_e2e_base'; // the seeded state every test file starts from

export const JWT_SECRET = 'e2e-only-jwt-secret';

// Hardhat's default accounts (mnemonic "test test test ... junk"). These keys are public and only
// for the local chain: never send anything of value to them.
// #0-#4 are set up by the seeds (packages/contracts/scripts/seed.ts, services/api/prisma/seed.ts).
// #5-#9 are not registered, for sign-up tests.
export const ACCOUNTS = {
  admin: { index: 0, name: 'Dev Admin', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' },
  organizer: { index: 1, name: 'Sophie Martin', address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' },
  // 1,000 USDC minted, then 4 tickets for event 1 bought (tokens 0-3); on event 2's guest list
  alex: { index: 2, name: 'Alex Vance', address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' },
  // 1,000 USDC, no tickets, not on the guest list
  jordan: { index: 3, name: 'Jordan Lee', address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6' },
  // Can check in event 1
  scanner: { index: 4, name: 'Sam Door', address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', privateKey: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a' },
  new1: { index: 5, name: null, address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', privateKey: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' },
  new2: { index: 6, name: null, address: '0x976EA74026E726554dB657fA54763abd0C3a0aa9', privateKey: '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e' },
  new3: { index: 7, name: null, address: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955', privateKey: '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356' },
  new4: { index: 8, name: null, address: '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f', privateKey: '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97' },
  new5: { index: 9, name: null, address: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720', privateKey: '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6' },
};

// The two seeded events (contract event IDs 1 and 2, API ids event-1 and event-2)
export const SEEDED_EVENTS = {
  gala: { apiId: 'event-1', contractId: 1n, title: 'Gala Opera Concert' }, // public sale, Early Bird sold out
  jazz: { apiId: 'event-2', contractId: 2n, title: 'Jazz at the Atrium' }, // presale, only Alex on the guest list
};
