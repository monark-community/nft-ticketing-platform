import { describe, expect, it } from "vitest";
import {
  buildCheckInMessage,
  decodeTicketQR,
  encodeTicketQR,
  type TicketQRData,
} from "@/lib/ticket-qr";

// The attendee signs this message and the scanner rebuilds it to check the signature,
// so the format must never change by accident (#269).

const data: TicketQRData = {
  tokenId: "42",
  eventId: "7",
  contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  chainId: 31337,
  timestamp: 1760000000,
};

describe("buildCheckInMessage", () => {
  it("builds the message in the documented format", () => {
    expect(buildCheckInMessage(data)).toBe(
      "NFTOKENPASS check-in | contract: 0x5FbDB2315678afecb367f032d93F642f64180aa3" +
        " | chain: 31337 | token: 42 | event: 7 | time: 1760000000",
    );
  });

  it("includes every field, so changing any of them changes the message", () => {
    const original = buildCheckInMessage(data);
    const changed: TicketQRData[] = [
      { ...data, tokenId: "43" },
      { ...data, eventId: "8" },
      { ...data, contractAddress: "0x0000000000000000000000000000000000000001" },
      { ...data, chainId: 11155111 },
      { ...data, timestamp: data.timestamp + 1 },
    ];
    for (const variant of changed) {
      expect(buildCheckInMessage(variant)).not.toBe(original);
    }
  });

  it("is rebuilt identically by the scanner from the decoded QR", () => {
    const raw = encodeTicketQR(data, "0xabc123");
    const decoded = decodeTicketQR(raw);

    expect(decoded).not.toBeNull();
    expect(buildCheckInMessage(decoded!)).toBe(buildCheckInMessage(data));
  });
});
