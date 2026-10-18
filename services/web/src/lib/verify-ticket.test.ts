import type { PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCheckInMessage, encodeTicketQR, type TicketQRData } from "@/lib/ticket-qr";
import { verifyTicketQR } from "@/lib/verify-ticket";

// Every reason the scanner can reject a ticket, with the contract reads faked (#270).

// Hardhat's well-known test accounts (never used with real funds)
const owner = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const someoneElse = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const CHAIN_ID = 31337;
const EVENT_ID = BigInt(7);
const NOW = 1760000000; // unix seconds

interface ChainState {
  isValidTicket: boolean;
  isUsed: boolean;
  tokenEventId: bigint;
  ownerOf: `0x${string}`;
}

// Answers readContract by function name, like the TicketNFT contract would
function fakeClient(overrides: Partial<ChainState> = {}): PublicClient {
  const chain: ChainState = {
    isValidTicket: true,
    isUsed: false,
    tokenEventId: EVENT_ID,
    ownerOf: owner.address,
    ...overrides,
  };
  return {
    readContract: async ({ functionName }: { functionName: keyof ChainState }) =>
      chain[functionName],
  } as unknown as PublicClient;
}

// Builds the QR text the attendee's app would show, signed by `signer`
async function makeQR(
  fields: Partial<TicketQRData> = {},
  signer = owner,
): Promise<string> {
  const data: TicketQRData = {
    tokenId: "42",
    eventId: EVENT_ID.toString(),
    contractAddress: CONTRACT,
    chainId: CHAIN_ID,
    timestamp: NOW,
    ...fields,
  };
  const signature = await signer.signMessage({ message: buildCheckInMessage(data) });
  return encodeTicketQR(data, signature);
}

function verify(raw: string, client = fakeClient()) {
  return verifyTicketQR({
    raw,
    publicClient: client,
    expectedChainId: CHAIN_ID,
    expectedContract: CONTRACT,
    expectedEventId: EVENT_ID,
  });
}

beforeEach(() => {
  // Freeze the clock so QR expiry is predictable
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW * 1000);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("verifyTicketQR", () => {
  it("accepts a valid ticket signed by its owner", async () => {
    const result = await verify(await makeQR());

    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.owner).toBe(owner.address);
    expect(result.eventId).toBe(EVENT_ID);
  });

  it("rejects text that is not one of our QR codes", async () => {
    const result = await verify("https://example.com/not-a-ticket");

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("This QR code is not an NFTOKENPASS ticket.");
    expect(result.qr).toBeUndefined();
  });

  it("rejects a QR code with an invalid ticket ID", async () => {
    const result = await verify(await makeQR({ tokenId: "not-a-number" }));

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("This QR code has an invalid ticket ID.");
  });

  it("rejects a QR code whose time is in the future", async () => {
    // More than the 30 seconds of clock difference allowed between the two phones
    const result = await verify(await makeQR({ timestamp: NOW + 31 }));

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("QR code time is in the future. Ask the attendee to refresh it.");
  });

  it("rejects a ticket from a different contract", async () => {
    const raw = await makeQR({ contractAddress: "0x0000000000000000000000000000000000000001" });
    const result = await verify(raw);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Ticket is from a different contract.");
  });

  it("rejects a ticket for a different chain", async () => {
    const result = await verify(await makeQR({ chainId: 11155111 }));

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Ticket is for a different network (chain 11155111).");
  });

  it("rejects a ticket for a different event, using the event from the contract", async () => {
    // The QR claims the right event, but the contract says the ticket belongs to event 3
    const result = await verify(await makeQR(), fakeClient({ tokenEventId: BigInt(3) }));

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("This ticket is for event #3, not event #7.");
    expect(result.eventId).toBe(BigInt(3));
  });

  it("rejects an expired QR code", async () => {
    const result = await verify(await makeQR({ timestamp: NOW - 61 }));

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("QR code has expired. Ask the attendee to refresh it.");
  });

  it("still accepts a QR code that is exactly 60 seconds old", async () => {
    const result = await verify(await makeQR({ timestamp: NOW - 60 }));

    expect(result.ok).toBe(true);
  });

  it("rejects a malformed signature", async () => {
    const raw = encodeTicketQR(
      {
        tokenId: "42",
        eventId: EVENT_ID.toString(),
        contractAddress: CONTRACT,
        chainId: CHAIN_ID,
        timestamp: NOW,
      },
      "0x1234",
    );
    const result = await verify(raw);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe(
      "QR code has an invalid signature. Ask the attendee to refresh it.",
    );
  });

  it("rejects a QR code signed by someone other than the owner", async () => {
    const result = await verify(await makeQR({}, someoneElse));

    expect(result.ok).toBe(false);
    expect(result.reason).toBe(
      "QR code was not signed by the current ticket owner. It may have been transferred or tampered with.",
    );
  });

  it("rejects a ticket that has already been used", async () => {
    const client = fakeClient({ isValidTicket: false, isUsed: true });
    const result = await verify(await makeQR(), client);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("This ticket has already been used.");
  });

  it("rejects a ticket that does not exist", async () => {
    const client = fakeClient({ isValidTicket: false, isUsed: false });
    const result = await verify(await makeQR(), client);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("This ticket does not exist.");
  });

  it("reports when the blockchain cannot be reached", async () => {
    // The failure is logged on purpose; keep the test output clean
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = {
      readContract: async () => {
        throw new Error("fetch failed");
      },
    } as unknown as PublicClient;
    const result = await verify(await makeQR(), client);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Could not reach the blockchain to verify this ticket.");
  });
});
