// npm run stack: the whole app for the end-to-end tests, in one process (#337).
//
// Postgres, a fresh Hardhat node with the contracts and the dev seed, a stand-in for Pinata, the API
// with its blockchain listener, and a production build of the web app. Playwright starts this
// (webServer in playwright.config.ts). Locally you can also keep it running in its own terminal, and
// Playwright reuses it, so each test run starts in seconds.
//
// A small control server on 127.0.0.1 puts everything back to the seeded state between test files:
//   GET  /ready  200 once everything is up
//   GET  /state  contract addresses, the snapshot block and the listener's progress
//   POST /reset  the seeded state again (chain snapshot, database copy, fresh API)
//
// Plain Node, not bash, so it behaves the same in Git Bash on Windows, macOS and Linux.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { ACCOUNTS, API_URL, CHAIN_ID, DB_NAME, DB_TEMPLATE, IPFS_URL, JWT_SECRET, PORTS, RPC_URL, WEB_URL } from './config.mjs';
import { startFakePinata } from './fake-pinata.mjs';

const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(E2E_DIR, '..');
const CONTRACTS_DIR = path.join(ROOT, 'packages', 'contracts');
const API_DIR = path.join(ROOT, 'services', 'api');
const WEB_DIR = path.join(ROOT, 'services', 'web');
const ADDRESSES_FILE = path.join(WEB_DIR, 'src', 'contracts', 'addresses.json');
const WORK_DIR = path.join(E2E_DIR, '.stack'); // logs, and the API's working directory (no .env there)
const LOG_DIR = path.join(WORK_DIR, 'logs');

const CI = Boolean(process.env.CI);

// ---------------------------------------------------------------------------------------------
// Small helpers

const started = Date.now();
const log = (message) => console.log(`[stack ${((Date.now() - started) / 1000).toFixed(1)}s] ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class StackError extends Error {}
const fail = (message) => {
  throw new StackError(message);
};

// A package's command-line script, run with this Node binary: no npx or shell, so it behaves the
// same everywhere and stopping it really stops it
function cli(fromDir, pkg, bin = pkg) {
  const require = createRequire(path.join(fromDir, 'package.json'));
  let pkgJson;
  try {
    pkgJson = require.resolve(`${pkg}/package.json`);
  } catch {
    fail(`${pkg} isn't installed in ${path.relative(ROOT, fromDir)}. Run npm ci there first (see e2e/README.md).`);
  }
  const { bin: bins } = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
  return path.join(path.dirname(pkgJson), typeof bins === 'string' ? bins : bins[bin]);
}

const children = new Set();

// Starts a long-running child (node, API, web). Its output goes to .stack/logs/<name>.log.
function startProcess(name, script, args, { cwd, env = {} } = {}) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const out = fs.createWriteStream(path.join(LOG_DIR, `${name}.log`), { flags: 'a' });
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  child.name = name;
  child.output = '';
  const keep = (chunk) => {
    if (child.output.length < 200_000) child.output += chunk;
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  child.exited = new Promise((resolve) => child.once('exit', resolve));
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

// The end of a child's output, for error messages (without the Hardhat node's list of test keys)
function outputEnd(child) {
  const lines = child.output.split(/\r?\n/).filter((line) => !line.includes('Private Key'));
  const end = lines.join('\n').trim().slice(-3000);
  return `The end of its output:\n${end || '(nothing yet)'}\nFull log: e2e/.stack/logs/${child.name}.log`;
}

const hasExited = (child) => child.exitCode !== null || child.signalCode !== null;

// Runs a one-off command to the end. Fails with the end of its output if it doesn't succeed.
async function runStep(name, script, args, options) {
  const child = startProcess(name, script, args, options);
  const code = await child.exited;
  if (code !== 0) fail(`${name} failed (exit code ${code}). ${outputEnd(child)}`);
  return child.output;
}

async function stopProcess(child) {
  if (!child || hasExited(child)) return;
  child.kill('SIGTERM');
  const stopped = await Promise.race([child.exited.then(() => true), sleep(5_000).then(() => false)]);
  if (!stopped) {
    child.kill('SIGKILL');
    await child.exited;
  }
}

function portInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

// Waits until check() returns something truthy. With `child`, fails straight away if that process
// stops first, with the end of its output. Says every 30 seconds that it's still waiting, so a slow
// start doesn't look stuck.
async function waitFor(what, check, timeoutMs, { every = 250, child } = {}) {
  const begin = Date.now();
  let nextNote = begin + 30_000;
  let lastError = null;
  for (;;) {
    if (child && hasExited(child)) {
      fail(`${child.name} stopped (exit code ${child.exitCode ?? child.signalCode}) before ${what} was ready. ${outputEnd(child)}`);
    }
    try {
      const value = await check();
      if (value) return value;
    } catch (err) {
      lastError = err; // not ready yet
    }
    const waited = Date.now() - begin;
    if (waited > timeoutMs) {
      const why = lastError ? ` The last error: ${lastError.message || lastError.code || lastError}` : '';
      fail(`Timed out after ${timeoutMs / 1000}s waiting for ${what}.${why}${child ? ` ${outputEnd(child)}` : ''}`);
    }
    if (Date.now() >= nextNote) {
      log(`Still waiting for ${what} (${Math.round(waited / 1000)}s)`);
      nextNote += 30_000;
    }
    await sleep(every);
  }
}

// A request that gives up after a while, so a check never hangs
const get = (url) => fetch(url, { signal: AbortSignal.timeout(10_000) });

async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

const headBlock = async () => Number(await rpc('eth_blockNumber'));

// ---------------------------------------------------------------------------------------------
// Postgres

// A Postgres of the tests' own: e2e/docker-compose.yml locally (port 5434, data in memory), a
// service with the same settings in CI. E2E_DATABASE_ADMIN_URL points the tests at another one.
const ADMIN_URL = process.env.E2E_DATABASE_ADMIN_URL || 'postgresql://e2e_user:e2e_password@127.0.0.1:5434/postgres';
const dbUrl = (name) => {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  url.searchParams.set('schema', 'public');
  return url.toString();
};
const DATABASE_URL = dbUrl(DB_NAME);

async function sql(database, text, values) {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${database}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return await client.query(text, values);
  } finally {
    await client.end();
  }
}

async function ensurePostgres() {
  const where = `Postgres at ${new URL(ADMIN_URL).host}`;
  const reachable = () => sql('postgres', 'select 1').then(() => true);
  try {
    await reachable();
    return;
  } catch (err) {
    if (CI || process.env.E2E_DATABASE_ADMIN_URL) fail(`Can't reach ${where}: ${err.message || err.code}`);
  }
  log('Starting the test database (e2e/docker-compose.yml)');
  const docker = spawn('docker', ['compose', '-f', 'docker-compose.yml', 'up', '-d', '--wait'], { cwd: E2E_DIR, stdio: 'inherit' });
  const code = await new Promise((resolve) => {
    docker.once('error', () => resolve(-1));
    docker.once('exit', resolve);
  });
  if (code !== 0) fail('Could not start the test database. Start Docker Desktop, then try again.');
  await waitFor(where, reachable, 60_000, { every: 500 });
}

async function recreateDatabase(name, template) {
  await sql('postgres', `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await sql('postgres', template ? `CREATE DATABASE "${name}" TEMPLATE "${template}"` : `CREATE DATABASE "${name}"`);
}

// ---------------------------------------------------------------------------------------------
// The pieces

let hardhatCli;
let addresses;
let hardhatNode = null;
let api = null;
let web = null;
let snapshotId = null;
let snapshotBlock = null;

async function startNode() {
  if (await portInUse(PORTS.chain)) {
    fail(
      `Port ${PORTS.chain} is already in use. The tests need a fresh Hardhat node there (the web app always ` +
        'reads the local chain at 127.0.0.1:8545). Stop npm run dev:fresh or any other node first.',
    );
  }
  log('Starting a fresh Hardhat node');
  hardhatNode = startProcess('hardhat-node', hardhatCli, ['node', '--hostname', '127.0.0.1', '--port', String(PORTS.chain)], {
    cwd: CONTRACTS_DIR,
  });
  // Slow the first time on Windows (it loads the Hardhat config and its plugins), so up to 3 minutes
  await waitFor('the Hardhat node', async () => Number(await rpc('eth_chainId')) === CHAIN_ID, 180_000, { child: hardhatNode });
}

async function deployContracts() {
  log('Deploying the contracts');
  await runStep('deploy', hardhatCli, ['run', 'scripts/deploy.ts', '--network', 'localhost'], { cwd: CONTRACTS_DIR });
  addresses = JSON.parse(fs.readFileSync(ADDRESSES_FILE, 'utf8'));
}

async function prepareDatabase() {
  await ensurePostgres();
  log(`Creating the ${DB_NAME} database`);
  await sql('postgres', `DROP DATABASE IF EXISTS "${DB_TEMPLATE}" WITH (FORCE)`);
  await recreateDatabase(DB_NAME);
  const prisma = cli(API_DIR, 'prisma');
  const env = { DATABASE_URL };
  await runStep('prisma-generate', prisma, ['generate'], { cwd: API_DIR, env });
  await runStep('prisma-migrate', prisma, ['migrate', 'deploy'], { cwd: API_DIR, env });
  await runStep('db-seed', cli(API_DIR, 'ts-node'), ['prisma/seed.ts'], { cwd: API_DIR, env });
}

async function buildApi() {
  log('Building the API');
  await runStep('api-build', cli(API_DIR, 'typescript', 'tsc'), ['-p', 'tsconfig.json'], { cwd: API_DIR });
}

const WEB_ENV = {
  NEXT_PUBLIC_API_URL: API_URL,
  NEXT_PUBLIC_IPFS_GATEWAY: IPFS_URL,
  // RainbowKit needs a project ID to render; WalletConnect itself isn't used by the tests
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: 'e2e-placeholder',
  NEXT_TELEMETRY_DISABLED: '1',
};

// The production build. E2E_SKIP_BUILD=1 reuses the last one if it was made for the tests.
async function buildWeb() {
  const marker = path.join(WEB_DIR, '.next', 'e2e-build.json');
  const wanted = JSON.stringify(WEB_ENV);
  if (process.env.E2E_SKIP_BUILD && fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === wanted) {
    log('Reusing the last web build (E2E_SKIP_BUILD)');
    return;
  }
  log('Building the web app (production build, takes a minute or two)');
  fs.rmSync(marker, { force: true }); // a build stopped halfway can't be reused
  await runStep('web-build', cli(WEB_DIR, 'next'), ['build'], { cwd: WEB_DIR, env: WEB_ENV });
  fs.writeFileSync(marker, wanted);
}

function apiEnv() {
  return {
    NODE_ENV: 'development',
    API_PORT: String(PORTS.api),
    DATABASE_URL,
    JWT_SECRET,
    JWT_EXPIRES_IN: '1h',
    RPC_URL,
    CONTRACT_ADDRESS: addresses.TicketNFT,
    CONTRACT_DEPLOY_BLOCK: String(addresses.deployBlock ?? ''),
    CHAIN_ID: String(CHAIN_ID),
    ADMIN_WALLET: ACCOUNTS.admin.address,
    FRONTEND_URL: WEB_URL,
    // Test-only settings: many sign-ins from one machine, and the stand-in for Pinata
    AUTH_RATE_LIMIT_MAX: '1000',
    PINATA_JWT: 'e2e-fake-pinata-jwt',
    PINATA_UPLOAD_URL: IPFS_URL,
    PINATA_GATEWAY: `localhost:${PORTS.ipfs}`,
  };
}

const cursorId = () => `${CHAIN_ID}:${addresses.TicketNFT.toLowerCase()}`;

async function listenerBlock() {
  const { rows } = await sql(DB_NAME, 'SELECT last_block FROM "SyncState" WHERE id = $1', [cursorId()]);
  return rows[0]?.last_block ?? null;
}

// Starts the API and waits until its listener has saved every block up to the chain's head. The
// listener of a local chain always reads from block 0 when it starts, and the database copy has no
// listener cursor, so the cursor appearing again means it has caught up.
async function startApi() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  // Run from .stack, so the API's dotenv finds no .env file: only the settings above apply
  api = startProcess('api', path.join(API_DIR, 'dist', 'index.js'), [], { cwd: WORK_DIR, env: apiEnv() });
  api.once('exit', (code) => {
    if (!stopping && !restartingApi) log(`The API stopped unexpectedly (exit code ${code}). See e2e/.stack/logs/api.log`);
  });
  await waitFor('the API', async () => (await get(`${API_URL}/health`)).ok, 120_000, { child: api });
  await waitForListener();
}

async function waitForListener() {
  const head = await headBlock();
  await waitFor(`the API's listener to read block ${head}`, async () => {
    const block = await listenerBlock();
    return block !== null && block >= head;
  }, 120_000, { every: 200, child: api });
}

let restartingApi = false;
async function restartApi(between) {
  restartingApi = true;
  try {
    await stopProcess(api);
    await between();
    await startApi();
  } finally {
    restartingApi = false;
  }
}

async function startWeb() {
  log('Starting the web app');
  web = startProcess('web', cli(WEB_DIR, 'next'), ['start', '-p', String(PORTS.web)], { cwd: WEB_DIR, env: WEB_ENV });
  await waitFor('the web app', async () => (await get(WEB_URL)).ok, 120_000, { every: 500, child: web });
}

// The seeded state every test file starts from: a database copy and a chain snapshot
async function saveSeededState() {
  await restartApi(async () => {
    await sql(DB_NAME, 'DELETE FROM "SyncState"');
    await sql('postgres', `CREATE DATABASE "${DB_TEMPLATE}" TEMPLATE "${DB_NAME}"`);
    snapshotId = await rpc('evm_snapshot');
    snapshotBlock = await headBlock();
  });
}

// About 5 seconds: most of it is the fresh API's listener waiting its first poll interval
async function resetToSeededState() {
  const begin = Date.now();
  await restartApi(async () => {
    // evm_revert uses the snapshot up, so take it again straight away
    const reverted = await rpc('evm_revert', [snapshotId]);
    if (!reverted) fail('The chain snapshot could not be restored. Restart the stack.');
    snapshotId = await rpc('evm_snapshot');
    await recreateDatabase(DB_NAME, DB_TEMPLATE);
  });
  return Date.now() - begin;
}

// ---------------------------------------------------------------------------------------------
// Control server

let ready = false;
let resetQueue = Promise.resolve();

function startControlServer() {
  const server = http.createServer(async (req, res) => {
    const send = (status, body) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    try {
      if (req.method === 'GET' && req.url === '/ready') return send(ready ? 200 : 503, { ready });
      if (!ready) return send(503, { error: 'The stack is still starting' });
      if (req.method === 'GET' && req.url === '/state') {
        return send(200, {
          addresses,
          rpcUrl: RPC_URL,
          snapshotBlock,
          head: await headBlock(),
          listenerBlock: await listenerBlock(),
        });
      }
      if (req.method === 'POST' && req.url === '/reset') {
        // One reset at a time, in the order asked
        const run = resetQueue.then(resetToSeededState);
        resetQueue = run.catch(() => {});
        const ms = await run;
        log(`Back to the seeded state (${(ms / 1000).toFixed(1)}s)`);
        return send(200, { ok: true, ms });
      }
      send(404, { error: 'Not found' });
    } catch (err) {
      send(500, { error: err instanceof Error ? err.message : String(err) });
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORTS.control, '127.0.0.1', () => resolve(server));
  });
}

// ---------------------------------------------------------------------------------------------
// Start and stop

let stopping = false;
let pinata = null;
let control = null;

async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  ready = false;
  await Promise.all([...children].map((child) => stopProcess(child)));
  pinata?.server.close();
  control?.close();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  fs.rmSync(LOG_DIR, { recursive: true, force: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });

  for (const [name, port] of [['web app', PORTS.web], ['API', PORTS.api], ['Pinata stand-in', PORTS.ipfs], ['control server', PORTS.control]]) {
    if (await portInUse(port)) fail(`Port ${port} (the ${name}) is already in use. Is another test stack running?`);
  }
  control = await startControlServer();
  hardhatCli = cli(CONTRACTS_DIR, 'hardhat');

  await startNode();
  await deployContracts();

  // The web build is the slow part, so the database and the API are built at the same time. Nothing
  // talks to the Hardhat node during the build: on a slower machine, the node and the Hardhat
  // scripts competing with it can take minutes or drop connections. The build also starts after the
  // deploy, which rewrites the contract files it reads.
  await Promise.all([
    buildWeb(),
    (async () => {
      await prepareDatabase();
      await buildApi();
    })(),
  ]);

  pinata = await startFakePinata(PORTS.ipfs);
  log('Starting the API');
  await startApi();
  log('Seeding the chain (the listener saves it into the database)');
  await runStep('chain-seed', hardhatCli, ['run', 'scripts/seed.ts', '--network', 'localhost'], { cwd: CONTRACTS_DIR });
  await waitForListener();
  log('Saving the seeded state');
  await saveSeededState();

  await startWeb();

  ready = true;
  log(`Ready: web ${WEB_URL}, API ${API_URL}, chain ${RPC_URL}`);
}

main().catch(async (err) => {
  console.error(`\n[stack] ${err instanceof StackError ? err.message : err?.stack ?? err}\n`);
  await shutdown(1);
});
