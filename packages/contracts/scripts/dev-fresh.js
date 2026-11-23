// npm run dev:fresh (#300): a fresh local environment in one command.
// Starts a new Hardhat node, deploys, starts the database and API in Docker, resets and seeds
// the database, seeds the chain, then adds the mock data (services/api/prisma/mock-data.ts).
// Last, it moves the test accounts' nonces ahead, so MetaMask works without clearing its activity.
// The node keeps running in this terminal; Ctrl+C stops it.
// `npm run dev:fresh -- --bare` leaves the mock data out: only the dev seed, as in the end-to-end tests.
// Plain Node, not bash, so it works the same in Git Bash on Windows, macOS and Linux.

const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");

const CONTRACTS_DIR = path.resolve(__dirname, "..");
const ROOT_DIR = path.resolve(CONTRACTS_DIR, "..", "..");
const API_ENV_FILE = path.join(ROOT_DIR, "services", "api", ".env");
const ADDRESSES_FILE = path.join(ROOT_DIR, "services", "web", "src", "contracts", "addresses.json");

const NODE_HOST = "127.0.0.1";
const NODE_PORT = 8545;
// On Linux, the API container reaches the host through the Docker network, not its loopback, so
// the node listens on all interfaces there. Docker Desktop (Windows, macOS) forwards to loopback.
const NODE_LISTEN_HOST = process.platform === "linux" ? "0.0.0.0" : NODE_HOST;
const CHAIN_ID = 31337;
// The API runs in Docker, where the node on the host is reached through host.docker.internal
const API_RPC_URL = `http://host.docker.internal:${NODE_PORT}`;
const LISTENER_LINE = "Blockchain listener connected to contract ";

const NODE_TIMEOUT_MS = 60_000;
const LISTENER_TIMEOUT_MS = 180_000; // the API's start also runs prisma generate and migrations

// Hardhat's own CLI, run with this Node binary: no npx or shell, so it behaves the same on every
// OS and stopping it really stops the node
const hardhatPackage = require.resolve("hardhat/package.json", { paths: [CONTRACTS_DIR] });
const HARDHAT_CLI = path.join(path.dirname(hardhatPackage), require(hardhatPackage).bin.hardhat);

// Without the mock data: only the dev seed, as in the end-to-end tests
const BARE = process.argv.includes("--bare");

// Hardhat accounts #0-#4, as the seeds set them up (scripts/seed.ts, services/api/prisma/seed.ts)
const BARE_ROLES = [
  "Admin",
  "Organizer of both events",
  "Attendee: 950 USDC, 4 tickets for event 1, on the event 2 guest list",
  "Attendee: 1,000 USDC, no tickets, not on the guest list",
  "Scanner for event 1",
];
// With the mock data (services/api/prisma/mock-data.ts)
const MOCK_ROLES = [
  "Admin, with organizer requests to review",
  "Organizer Sophie: 10 events, a draft and one waiting to publish",
  "Attendee Alex: tickets for 8 events, 2 of them past, a ticket on the Marketplace",
  "Attendee Jordan: no tickets (empty My Tickets), not on the guest list",
  "Scanner Sam: checks in the dev seed's event 1 and the open mic happening now",
  "Organizer Marcus: 6 events and a draft",
  "Attendee Priya: tickets, 3 resale listings",
  "Attendee Noah: tickets, 2 resale listings, an organizer request waiting",
  "Attendee Chloé: tickets, an organizer request waiting",
  "Attendee Ethan: tickets, a resale listing, an organizer request turned down",
];
const ROLES = BARE ? BARE_ROLES : MOCK_ROLES;

const TOTAL_STEPS = BARE ? 10 : 11;
let currentStep = 0;

let node = null; // the Hardhat node
let nodeLog = ""; // the start of its output, where it lists the accounts
let streamNodeOutput = false; // its output is shown once everything is set up

class StepError extends Error {}

function step(title) {
  currentStep += 1;
  console.log(`\n[${currentStep}/${TOTAL_STEPS}] ${title}`);
}

function fail(message) {
  throw new StepError(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Runs a command and resolves with its exit code (and output when captured). Async on purpose:
// the node's output must keep being read meanwhile, or its pipe fills up and the node stalls.
function run(command, args, { cwd = ROOT_DIR, capture = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
    let output = "";
    if (capture) {
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (output += chunk));
    }
    child.on("error", () => resolve({ code: -1, output }));
    child.on("close", (code) => resolve({ code, output }));
  });
}

const hardhat = (args) => run(process.execPath, [HARDHAT_CLI, ...args], { cwd: CONTRACTS_DIR });
const compose = (args, options) => run("docker", ["compose", ...args], options);

// 1. Docker
async function checkDocker() {
  step("Checking that Docker is running");
  const { code } = await run("docker", ["info"], { capture: true });
  if (code !== 0) fail("Docker isn't running. Start Docker Desktop first, then run this again.");
}

// 2. Hardhat node
function portInUse() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: NODE_HOST, port: NODE_PORT });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

// One JSON-RPC call to the node
async function rpc(method, params = []) {
  const res = await fetch(`http://${NODE_HOST}:${NODE_PORT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const { result, error } = await res.json();
  if (error) throw new Error(`${method}: ${error.message}`);
  return result;
}

async function readChainId() {
  try {
    const result = await rpc("eth_chainId");
    return typeof result === "string" ? Number(result) : null;
  } catch {
    return null; // not answering yet
  }
}

function nodeStopped() {
  return node.exitCode !== null || node.signalCode !== null;
}

async function startNode() {
  step(`Starting a new Hardhat node on ${NODE_HOST}:${NODE_PORT}`);
  if (await portInUse()) {
    fail(`Port ${NODE_PORT} is already in use: another node is running. Close it first (Ctrl+C in its terminal), then run this again.`);
  }

  node = spawn(process.execPath, [HARDHAT_CLI, "node", "--hostname", NODE_LISTEN_HOST], {
    cwd: CONTRACTS_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const onOutput = (chunk) => {
    if (streamNodeOutput) process.stdout.write(chunk);
    else if (nodeLog.length < 100_000) nodeLog += chunk;
  };
  node.stdout.on("data", onOutput);
  node.stderr.on("data", onOutput);

  const deadline = Date.now() + NODE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (nodeStopped()) fail(`The Hardhat node stopped while starting:\n${nodeLog.trim()}`);
    const chainId = await readChainId();
    if (chainId === CHAIN_ID) return;
    if (chainId !== null) fail(`The node on port ${NODE_PORT} answered with chain ID ${chainId}, expected ${CHAIN_ID}.`);
    await sleep(500);
  }
  fail(`The Hardhat node didn't answer on port ${NODE_PORT} within ${NODE_TIMEOUT_MS / 1000}s.`);
}

// 3. Deploy
async function deploy() {
  step("Deploying the contracts");
  const { code } = await hardhat(["run", "scripts/deploy.ts", "--network", "localhost"]);
  if (code !== 0) fail("The deploy failed (see the error above).");
  return JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8")).TicketNFT;
}

// 4. services/api/.env (checked, never edited)
function readEnvFile(file) {
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue; // blank lines and comments
    let value = match[2];
    if (/^["']/.test(value)) value = value.replace(/^(["'])(.*)\1$/, "$2");
    else value = value.replace(/\s+#.*$/, ""); // inline comment
    values[match[1]] = value;
  }
  return values;
}

function checkApiEnv(ticketNft) {
  step("Checking services/api/.env");
  if (!fs.existsSync(API_ENV_FILE)) {
    fail("services/api/.env is missing. Copy services/api/.env.example to services/api/.env first (see the contracts README).");
  }
  const env = readEnvFile(API_ENV_FILE);
  const rpcOk = env.RPC_URL === API_RPC_URL;
  const addressOk = (env.CONTRACT_ADDRESS ?? "").toLowerCase() === ticketNft.toLowerCase();
  if (!rpcOk || !addressOk) {
    fail(
      "services/api/.env doesn't point the API at this node. Set these lines, then run this again:\n" +
        `  RPC_URL=${API_RPC_URL}\n` +
        `  CONTRACT_ADDRESS=${ticketNft}`,
    );
  }
}

// 5-6. Database and a new API container in Docker, then wait for the listener
async function startApi() {
  step("Starting the database and a new API container in Docker");
  if ((await compose(["up", "-d", "--wait", "db"])).code !== 0) fail("docker compose up db failed (see above).");

  // A new API container every run: --build picks up Dockerfile and dependency changes, and
  // --renew-anon-volumes replaces node_modules, which Compose otherwise keeps from the previous
  // container. Being new, its listener also starts fresh against the new chain.
  const { code } = await compose(["up", "-d", "--build", "--force-recreate", "--renew-anon-volumes", "--no-deps", "api"]);
  if (code !== 0) fail("docker compose up api failed (see above).");
}

async function waitForListener() {
  step("Waiting for the API's blockchain listener");
  const deadline = Date.now() + LISTENER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // The container is new, so its logs only cover this start
    const { output } = await compose(["logs", "--no-color", "api"], { capture: true });
    if (output.includes(LISTENER_LINE)) return;
    await sleep(2000);
  }
  fail(`The API didn't log "${LISTENER_LINE.trim()}" within ${LISTENER_TIMEOUT_MS / 1000}s. Check: docker compose logs api`);
}

// 7. The listener logs "connected" before it talks to the node, so ask the node for its chain ID
// from inside the API container, at the address the listener uses
async function checkApiReachesNode() {
  step(`Checking that the API container can reach the node at ${API_RPC_URL}`);
  const probe =
    `fetch('${API_RPC_URL}', { method: 'POST', headers: { 'Content-Type': 'application/json' },` +
    ` body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(5000) })` +
    `.then((res) => res.json()).then((body) => process.exit(Number(body.result) === ${CHAIN_ID} ? 0 : 1))` +
    `.catch(() => process.exit(1))`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    if ((await compose(["exec", "-T", "api", "node", "-e", probe], { capture: true })).code === 0) return;
    await sleep(2000);
  }
  fail(
    `The API container can't reach the Hardhat node at ${API_RPC_URL}, so the listener wouldn't save anything.\n` +
      "Check that Docker can reach this machine (on Linux, docker-compose.yml maps host.docker.internal with extra_hosts).",
  );
}


// 8. Database (after the API is up, so the reset doesn't run alongside its startup migrations)
async function resetDatabase() {
  step("Resetting and seeding the database");
  if ((await compose(["exec", "-T", "api", "npx", "prisma", "migrate", "reset", "--force"])).code !== 0) {
    fail("The database reset failed (see above).");
  }
  if ((await compose(["exec", "-T", "api", "npm", "run", "db:seed"])).code !== 0) {
    fail("The database seed failed (see above).");
  }
}

// 9. Chain (after the database: the listener saves what the seed does into it)
async function seedChain() {
  step("Seeding the chain");
  if ((await hardhat(["run", "scripts/seed.ts", "--network", "localhost"])).code !== 0) {
    fail("The chain seed failed (see above).");
  }
}

// 10. Mock data: the database side, then the chain's (which the listener saves), then the dates of
// what the chain did
async function addMockData() {
  step("Adding the mock data (more events, past events, resale listings, organizer requests)");
  if ((await compose(["exec", "-T", "api", "npm", "run", "db:seed:mock"])).code !== 0) {
    fail("The mock data failed on the database side (see above). Run with --bare to skip it.");
  }
  if ((await hardhat(["run", "scripts/seed-mock.ts", "--network", "localhost"])).code !== 0) {
    fail("The mock data failed on the chain (see above). Run with --bare to skip it.");
  }
  if ((await compose(["exec", "-T", "api", "npm", "run", "db:seed:mock", "--", "--finish"])).code !== 0) {
    fail("The mock data failed while dating the purchases (see above). Run with --bare to skip it.");
  }
}

// 10 (11 with the mock data). MetaMask sends each transaction with the higher of two nonces: the
// chain's, and the next one after those it saved for the account. Every run starts a new chain
// at 0, so an account used in an earlier run fails with "nonce too high" until its activity is
// deleted in MetaMask (per account and per network). Moving every test account to the number of
// seconds since 2026 puts the chain ahead of anything saved, as long as an account sent fewer
// transactions than seconds passed between two runs. Done last, so the deploy (its addresses
// come from the deployer's nonce) and the seeds run as before.
const NONCE_START = Date.UTC(2026, 0, 1);

async function moveNoncesAhead() {
  step("Moving the test accounts' nonces past the ones MetaMask saved in earlier runs");
  const nonce = Math.floor((Date.now() - NONCE_START) / 1000);
  for (const address of await rpc("eth_accounts")) {
    const current = Number(await rpc("eth_getTransactionCount", [address, "latest"]));
    if (current < nonce) await rpc("hardhat_setNonce", [address, `0x${nonce.toString(16)}`]);
  }
}

function printSummary() {
  const accounts = [...nodeLog.matchAll(/Account #(\d+):\s+(0x[0-9a-fA-F]{40}).*\r?\n\s*Private Key:\s+(0x[0-9a-fA-F]{64})/g)]
    .map(([, index, address, key]) => ({ index: Number(index), address, key }))
    .filter(({ index }) => index < ROLES.length);

  console.log("\nLocal environment ready.\n");
  console.log("Test accounts (Hardhat's public keys: local use only, never on Sepolia or mainnet):");
  for (const { index, address, key } of accounts) {
    console.log(`  #${index}  ${address}  ${ROLES[index]}`);
    console.log(`      private key ${key}`);
  }
  console.log(
    "\nMetaMask: no need to clear its activity; the nonces start past the ones it saved. If a transaction\n" +
      'still fails with "nonce too high": select that account and this network, then Settings > Developer tools\n' +
      "> Delete activity and nonce data.",
  );
  console.log("\nNext, in a second terminal: cd services/web && npm run dev");
  console.log("\nHardhat node output follows. Ctrl+C stops the node.\n");
}

function stopNode() {
  if (node && !nodeStopped()) node.kill();
}

async function main() {
  await checkDocker();
  await startNode();
  const ticketNft = await deploy();
  checkApiEnv(ticketNft);
  await startApi();
  await waitForListener();
  await checkApiReachesNode();
  await resetDatabase();
  await seedChain();
  if (!BARE) await addMockData();
  await moveNoncesAhead();
  printSummary();
  streamNodeOutput = true;
}

// Ctrl+C reaches the node too; stop it here as well in case it didn't
process.on("SIGINT", () => {
  stopNode();
  process.exit(130);
});

main()
  .then(() => {
    // Keep running with the node, and stop when it stops
    node.on("exit", (code) => process.exit(code ?? 0));
  })
  .catch((err) => {
    console.error(`\nError: ${err instanceof StepError ? err.message : err.stack}`);
    stopNode();
    process.exit(1);
  });
