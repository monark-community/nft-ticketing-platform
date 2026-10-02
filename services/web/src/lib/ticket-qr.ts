// Shared format for ticket QR codes. Used by My Tickets (generate) and the scanner (verify).
// Spec: issue #54.

export const QR_MAX_AGE_SECONDS = 60; // the attendee re-signs to refresh after this

export interface TicketQRData {
  tokenId: string;
  eventId: string;
  contractAddress: `0x${string}`;
  chainId: number;
  timestamp: number; // unix seconds when the owner signed
}

export interface SignedTicketQR extends TicketQRData {
  signature: `0x${string}`;
}

// The exact message the owner signs with wagmi signMessage. The scanner rebuilds it
// from the QR fields to recover the signer, then compares that with ownerOf(tokenId).
export function buildCheckInMessage(data: TicketQRData): string {
  return (
    `NFTicketPass check-in | contract: ${data.contractAddress}` +
    ` | chain: ${data.chainId}` +
    ` | token: ${data.tokenId}` +
    ` | event: ${data.eventId}` +
    ` | time: ${data.timestamp}`
  );
}

export function encodeTicketQR(data: TicketQRData, signature: `0x${string}`): string {
  const payload: SignedTicketQR = { ...data, signature };
  return JSON.stringify(payload);
}

// Returns null if the scanned text isn't a valid ticket QR.
export function decodeTicketQR(raw: string): SignedTicketQR | null {
  try {
    const p = JSON.parse(raw);
    if (
      typeof p?.tokenId !== "string" ||
      typeof p.eventId !== "string" ||
      typeof p.contractAddress !== "string" ||
      typeof p.chainId !== "number" ||
      typeof p.timestamp !== "number" ||
      typeof p.signature !== "string"
    ) {
      return null;
    }
    return p as SignedTicketQR;
  } catch {
    return null;
  }
}

export function isQRExpired(timestamp: number, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return nowSeconds - timestamp > QR_MAX_AGE_SECONDS;
}
