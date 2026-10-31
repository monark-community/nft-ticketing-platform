import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";
import { describe, expect, it } from "vitest";

import type { ChainSettings } from "@/lib/create-event";
import {
  contractEventIdFor,
  getApiStepErrorMessage,
  getPublishErrorMessage,
  hasWorkLeft,
  planPublish,
  PUBLISH_ERRORS,
  saleRulesFromChain,
  settingsMatch,
  stageForTxLabel,
  stageStatuses,
  TX_LABELS,
  type ChainEventState,
} from "@/lib/publish-event";

// Publishing a new event (#193).

const WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ZERO = "0x0000000000000000000000000000000000000000";
const wanted: ChainSettings = { endTime: BigInt(1_899_999_960) /* whole minutes, like the form */, royaltyBps: BigInt(1000), resaleCapBps: BigInt(20_000), perWalletLimit: BigInt(4) };
const URIS = ["ipfs://ga", "ipfs://vip"];

const fresh: ChainEventState = {
  organizer: ZERO,
  configured: false,
  active: false,
  presale: false,
  sold: 0,
  endTime: BigInt(0),
  royaltyBps: BigInt(0),
  resaleCapBps: BigInt(0),
  perWalletLimit: BigInt(0),
  typeUris: [],
};
const configured: ChainEventState = { ...fresh, organizer: WALLET.toLowerCase(), configured: true, ...wanted };

const base = { status: "FROZEN" as const, wallet: WALLET, wanted, typeUris: URIS, presale: false };

describe("contractEventIdFor", () => {
  it("is the same for the same event and different across events", () => {
    const id = "5f0c1f9e-7b1a-4c55-9b1e-2f4b8f6d2a10";
    expect(contractEventIdFor(id)).toBe(contractEventIdFor(id));
    expect(contractEventIdFor(id)).not.toBe(contractEventIdFor("5f0c1f9e-7b1a-4c55-9b1e-2f4b8f6d2a11"));
  });

  it("fits in 48 bits, so the API's BigInt column and JavaScript numbers hold it", () => {
    for (const id of ["a", "b", "c", "00000000-0000-0000-0000-000000000000"]) {
      const value = contractEventIdFor(id);
      expect(value > BigInt(0)).toBe(true);
      expect(value < BigInt(2) ** BigInt(48)).toBe(true);
    }
  });
});

describe("planPublish", () => {
  it("does everything for a new draft", () => {
    const plan = planPublish({ ...base, status: "DRAFT", chain: fresh, typeUris: [null, null] });
    expect(plan).toEqual({ blocked: null, freeze: true, configure: true, addTypesFrom: 0, setPresale: null, openSales: true, publish: true });
  });

  it("turns the presale on before opening sales when asked", () => {
    expect(planPublish({ ...base, chain: fresh, presale: true }).setPresale).toBe(true);
  });

  it("skips what the contract already has", () => {
    const plan = planPublish({ ...base, chain: { ...configured, typeUris: ["ipfs://ga"] } });
    expect(plan).toMatchObject({ blocked: null, freeze: false, configure: false, addTypesFrom: 1, openSales: true, publish: true });
  });

  it("only publishes in the API when the contract is done", () => {
    const plan = planPublish({ ...base, chain: { ...configured, typeUris: URIS, active: true } });
    expect(plan).toMatchObject({ configure: false, addTypesFrom: 2, setPresale: null, openSales: false, publish: true });
    expect(hasWorkLeft(plan, 2)).toBe(true);
    expect(hasWorkLeft({ ...plan, publish: false }, 2)).toBe(false);
  });

  it("configures again when the sale rules changed and nothing sold", () => {
    const plan = planPublish({ ...base, chain: { ...configured, perWalletLimit: BigInt(2) } });
    expect(plan.configure).toBe(true);
    expect(plan.blocked).toBeNull();
  });

  it("is blocked when the rules changed after tickets sold", () => {
    expect(planPublish({ ...base, chain: { ...configured, sold: 1, perWalletLimit: BigInt(2) } }).blocked).toBe("rulesLocked");
    // Same rules: nothing to change, so not blocked
    expect(planPublish({ ...base, chain: { ...configured, sold: 1, typeUris: URIS, active: true } }).blocked).toBeNull();
  });

  it("is blocked when another wallet owns the event ID, whatever the address case", () => {
    expect(planPublish({ ...base, chain: { ...configured, organizer: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" } }).blocked).toBe("idTaken");
    expect(planPublish({ ...base, chain: { ...configured, organizer: WALLET.toUpperCase().replace("0X", "0x") } }).blocked).toBeNull();
  });

  it("is blocked when the contract's ticket types aren't the frozen ones", () => {
    expect(planPublish({ ...base, chain: { ...configured, typeUris: ["ipfs://other"] } }).blocked).toBe("typesMismatch");
    expect(planPublish({ ...base, chain: { ...configured, typeUris: [...URIS, "ipfs://extra"] } }).blocked).toBe("typesMismatch");
  });

  it("turns the presale off again if it was unticked after being set", () => {
    expect(planPublish({ ...base, chain: { ...configured, presale: true } }).setPresale).toBe(false);
  });

  it("has nothing left once published and open", () => {
    const plan = planPublish({ ...base, status: "PUBLISHED", chain: { ...configured, typeUris: URIS, active: true } });
    expect(hasWorkLeft(plan, 2)).toBe(false);
  });
});

describe("saleRulesFromChain", () => {
  it("reads the contract's rules back into the form, and they match again", async () => {
    const { toChainSettings } = await import("@/lib/create-event");
    const rules = saleRulesFromChain({ ...configured, presale: true });
    expect(rules).toMatchObject({ perWalletLimit: "4", resaleCapBps: 20_000, royaltyPercent: "10", presale: true });
    expect(toChainSettings(rules)).toEqual(wanted);
  });
});

describe("settingsMatch", () => {
  it("needs the event configured with the same values", () => {
    expect(settingsMatch(configured, wanted)).toBe(true);
    expect(settingsMatch({ ...configured, configured: false }, wanted)).toBe(false);
    expect(settingsMatch(configured, { ...wanted, endTime: wanted.endTime + BigInt(60) })).toBe(false);
  });
});

describe("stageStatuses", () => {
  it("marks the first row ready before anything runs (Figma)", () => {
    const plan = planPublish({ ...base, status: "DRAFT", chain: fresh, typeUris: [null, null] });
    expect(stageStatuses(plan, 2, null)).toEqual({ freeze: "ready", configure: "waiting", ticketTypes: "waiting", publish: "waiting" });
  });

  it("marks finished rows done and the running row active", () => {
    const plan = planPublish({ ...base, chain: { ...configured, typeUris: ["ipfs://ga"] } });
    expect(stageStatuses(plan, 2, null)).toEqual({ freeze: "done", configure: "done", ticketTypes: "ready", publish: "waiting" });
    expect(stageStatuses(plan, 2, { stage: "ticketTypes", failed: false }).ticketTypes).toBe("active");
    expect(stageStatuses(plan, 2, { stage: "ticketTypes", failed: true }).ticketTypes).toBe("failed");
  });

  it("marks every row done once published", () => {
    const plan = planPublish({ ...base, status: "PUBLISHED", chain: { ...configured, typeUris: URIS, active: true } });
    expect(stageStatuses(plan, 2, null)).toEqual({ freeze: "done", configure: "done", ticketTypes: "done", publish: "done" });
  });
});

describe("stageForTxLabel", () => {
  it("maps wallet steps to the Figma rows", () => {
    expect(stageForTxLabel(TX_LABELS.configure)).toBe("configure");
    expect(stageForTxLabel(TX_LABELS.addType("VIP"))).toBe("ticketTypes");
    expect(stageForTxLabel(TX_LABELS.presaleOn)).toBe("publish");
    expect(stageForTxLabel(TX_LABELS.openSales)).toBe("publish");
  });
});

describe("error messages", () => {
  function revert(reason: string) {
    const inner = new ContractFunctionRevertedError({ abi: [], functionName: "configureEvent" });
    (inner as { reason?: string }).reason = reason;
    return new BaseError("reverted", { cause: inner });
  }

  it("maps the contract's revert reasons", () => {
    expect(getPublishErrorMessage(revert("Not the event organizer"))).toBe(PUBLISH_ERRORS.notEventOrganizer);
    expect(getPublishErrorMessage(revert("End time must be in the future"))).toBe(PUBLISH_ERRORS.endInPast);
    expect(getPublishErrorMessage(revert("Event terms locked: tickets already sold"))).toBe(PUBLISH_ERRORS.rulesLocked);
  });

  it("maps a missing organizer role", () => {
    const inner = new ContractFunctionRevertedError({ abi: [], functionName: "configureEvent" });
    (inner as { data?: unknown }).data = { errorName: "AccessControlUnauthorizedAccount", args: [] };
    expect(getPublishErrorMessage(new BaseError("reverted", { cause: inner }))).toBe(PUBLISH_ERRORS.notOrganizerRole);
  });

  it("says a cancelled wallet step can be picked up again", () => {
    expect(getPublishErrorMessage(new UserRejectedRequestError(new Error("rejected")))).toBe(PUBLISH_ERRORS.userRejected);
  });

  it("explains the API's freeze errors without showing raw text", () => {
    expect(getApiStepErrorMessage("freeze", new Error("PINATA_JWT is not configured"))).toMatch(/Pinata key/);
    expect(getApiStepErrorMessage("freeze", new Error("Failed to pin metadata to IPFS, please try again later"))).toMatch(/upload to IPFS failed/);
    expect(getApiStepErrorMessage("freeze", new Error("Unsupported file type. Allowed: PNG, JPG, WebP"))).toMatch(/cover image was rejected/);
    expect(getApiStepErrorMessage("freeze", new Error("Something else"))).toBe("Freezing the event failed. Nothing was locked. Try again.");
    expect(getApiStepErrorMessage("publish", new Error("Something else"))).toMatch(/set up on-chain/);
  });
});
