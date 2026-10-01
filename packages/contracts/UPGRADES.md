# Upgrading the TicketNFT Contract

TicketNFT uses the **UUPS proxy pattern** (OpenZeppelin). Users, the frontend and
the backend always talk to one permanent address: the **proxy**, which holds all the
data (ticket owners, used flags, roles, royalties). The proxy forwards every call to
an **implementation** contract that holds the logic. Upgrading means deploying a new
implementation and pointing the proxy at it: same address, same data, new logic.

## Who can upgrade

Only the wallet with `DEFAULT_ADMIN_ROLE`. This is enforced in `_authorizeUpgrade`.
Any other account's upgrade attempt reverts.

## How to upgrade

1. Make the change in `contracts/TicketNFT.sol` (follow the storage rules below).
2. Run all tests: `npx hardhat test`
3. Run the upgrade script against the deployed proxy (it validates storage first):
   - macOS/Linux: `PROXY_ADDRESS=0x... npx hardhat run scripts/upgrade.ts --network <network>`
   - PowerShell: `$env:PROXY_ADDRESS="0x..."; npx hardhat run scripts/upgrade.ts --network <network>`
4. Note the new implementation address printed by the script.

## Storage rules (important)

The proxy's data is laid out in the order the state variables are declared. Breaking
that order corrupts existing data. When changing the contract:

- **Only add** new state variables **at the end**, after all existing ones.
- **Never** remove, reorder, rename-with-a-different-type, or change the type of an
  existing state variable.
- **Never** add a constructor that sets state. Use an initializer instead. For setup
  in a new version, use `reinitializer(2)` (then `3`, etc.).
- Keep inheriting the same OpenZeppelin parent contracts in the same order.

The upgrade script and the tests run OpenZeppelin's `validateUpgrade`, which catches
most of these mistakes automatically.

## The `.openzeppelin` folder

The upgrades plugin records deployments in `packages/contracts/.openzeppelin/`.
Commit the files for public networks (e.g. Sepolia, chain 11155111): they're needed
for future upgrades. Local Hardhat files (`unknown-31337.json`) can be ignored.

## Locking upgrades before a public sale

Monark's decision: the contract stays upgradeable during the MVP and is **permanently
locked before any public sale**, so purchased tickets have fixed conditions.

`lockUpgrades()` (admin only) sets `upgradesLocked = true`. After that, every upgrade
attempt reverts with "Upgrades are locked". **There is no unlock function: this is
irreversible.** The admin keeps its other powers (granting roles, setting royalties).

To lock (requires `CONFIRM=yes` as a safety check):
- macOS/Linux: `PROXY_ADDRESS=0x... CONFIRM=yes npx hardhat run scripts/lock-upgrades.ts --network <network>`
- PowerShell: `$env:PROXY_ADDRESS="0x..."; $env:CONFIRM="yes"; npx hardhat run scripts/lock-upgrades.ts --network <network>`

## Tests

`test/Upgrade.test.ts` proves that:
- the proxy address and existing data (owners, token URIs, event IDs, roles) survive an upgrade,
- non-admin accounts cannot upgrade,
- the upgrade passes OpenZeppelin's storage layout check,
- after `lockUpgrades()`, upgrades are blocked; only the admin can lock; locking twice fails; the admin keeps its other powers.