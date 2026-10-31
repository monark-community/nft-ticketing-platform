// npm run dev:fresh (#300): a fresh local environment in one command.
// Starts a new Hardhat node, deploys, starts the database and API in Docker, resets and seeds
// the database, then seeds the chain. The node keeps running in this terminal; Ctrl+C stops it.
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

// Hardhat accounts #0-#4, as the seeds set them up (scripts/seed.ts, services/api/prisma/seed.ts)
const ROLES = [
  "Admin",
  "Organizer of both events",
  "Attendee: 950 USDC, 4 tickets for event 1, on the event 2 guest list",
  "Attendee: 1,000 USDC, no tickets, not on the guest list",
  "Scanner for event 1",
];

const TOTAL_STEPS = 8;
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

async function readChainId() {
  try {
    const res = await fetch(`http://${NODE_HOST}:${NODE_PORT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    const { result } = await res.json();
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

  node = spawn(process.execPath, [HARDHAT_CLI, "node"], { cwd: CONTRACTS_DIR, stdio: ["ignore", "pipe", "pipe"] });
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

// 5-6. Database and API in Docker, then wait for the listener
async function apiLogs() {
  return (await compose(["logs", "--no-color", "api"], { capture: true })).output;
}

function countListenerLines(logs) {
  return logs.split(LISTENER_LINE).length - 1;
}

async function startApi() {
  step("Starting the database and the API in Docker");
  if ((await compose(["up", "-d", "db", "api"])).code !== 0) fail("docker compose up failed (see above).");
  // The logs keep earlier runs, so count the listener's start lines first: only a new one
  // means this start is ready
  const before = countListenerLines(await apiLogs());
  // Restart so the listener starts fresh against the new chain
  if ((await compose(["restart", "api"])).code !== 0) fail("docker compose restart api failed (see above).");
  return before;
}

async function waitForListener(linesBefore) {
  step("Waiting for the API's blockchain listener");
  const deadline = Date.now() + LISTENER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (countListenerLines(await apiLogs()) > linesBefore) return;
    await sleep(2000);
  }
  fail(`The API didn't log "${LISTENER_LINE.trim()}" within ${LISTENER_TIMEOUT_MS / 1000}s. Check: docker compose logs api`);
}

// 7. Database (after the API is up, so the reset doesn't run alongside its startup migrations)
async function resetDatabase() {
  step("Resetting and seeding the database");
  if ((await compose(["exec", "-T", "api", "npx", "prisma", "migrate", "reset", "--force"])).code !== 0) {
    fail("The database reset failed (see above).");
  }
  if ((await compose(["exec", "-T", "api", "npm", "run", "db:seed"])).code !== 0) {
    fail("The database seed failed (see above).");
  }
}

// 8. Chain (last: the listener saves what the seed does into the database)
async function seedChain() {
  step("Seeding the chain");
  if ((await hardhat(["run", "scripts/seed.ts", "--network", "localhost"])).code !== 0) {
    fail("The chain seed failed (see above).");
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
    "\nMetaMask: this is a new chain, so clear the activity of each imported test account\n" +
      '(Settings > Advanced > Clear activity tab data), or transactions fail with "nonce too high".',
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
  const listenerLines = await startApi();
  await waitForListener(listenerLines);
  await resetDatabase();
  await seedChain();
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
