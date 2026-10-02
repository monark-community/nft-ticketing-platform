// // Verifies a scanned ticket QR code. Read-only: nothing is sent on-chain here.
// // The actual check-in transaction happens separately (#57).

// import { ticketNftAbi } from "@/lib/contracts/ticket-nft";
// import {
//   decodeTicketQR,
//   isQRExpired,
//   type SignedTicketQR,
// } from "@/lib/ticket-qr";
// import type { PublicClient } from "viem";

// // Allow a little difference between the attendee's and the scanner's clocks
// const CLOCK_SKEW_SECONDS = 30;

// export interface TicketVerification {
//   ok: boolean;
//   reason?: string; // shown to venue staff when ok is false
//   qr?: SignedTicketQR; // decoded QR data, when it could be parsed
//   eventId?: bigint; // the ticket's event according to the contract (never the QR)
// }

// interface VerifyParams {
//   raw: string; // the text read from the QR code
//   publicClient: PublicClient;
//   expectedChainId: number;
//   expectedContract: `0x${string}`;
//   expectedEventId: bigint; // the event the scanner is checking people into
// }

// export async function verifyTicketQR({
//   raw,
//   publicClient,
//   expectedChainId,
//   expectedContract,
//   expectedEventId,
// }: VerifyParams): Promise<TicketVerification> {
//   // 1. Is it one of our QR codes?
//   const qr = decodeTicketQR(raw);
//   if (!qr) {
//     return { ok: false, reason: "This QR code is not an NFTicketPass ticket." };
//   }

//   let tokenId: bigint;
//   try {
//     tokenId = BigInt(qr.tokenId);
//   } catch {
//     return { ok: false, reason: "This QR code has an invalid ticket ID.", qr };
//   }

//   // 2. Is it fresh? Stops screenshots from being reused.
//   const now = Math.floor(Date.now() / 1000);
//   if (qr.timestamp > now + CLOCK_SKEW_SECONDS) {
//     return {
//       ok: false,
//       reason: "QR code time is in the future. Ask the attendee to refresh it.",
//       qr,
//     };
//   }
//   if (isQRExpired(qr.timestamp, now)) {
//     return {
//       ok: false,
//       reason: "QR code has expired. Ask the attendee to refresh it.",
//       qr,
//     };
//   }

//   // 3. Is it for this network and this contract?
//   if (qr.chainId !== expectedChainId) {
//     return {
//       ok: false,
//       reason: `Ticket is for a different network (chain ${qr.chainId}).`,
//       qr,
//     };
//   }
//   if (qr.contractAddress.toLowerCase() !== expectedContract.toLowerCase()) {
//     return { ok: false, reason: "Ticket is from a different contract.", qr };
//   }

//   // 4. On-chain checks, all read together. The event comes from tokenEventId(),
//   //    not the QR's eventId, which is only used to rebuild the signed message (#56).
//   //    isUsed is read so staff get a clearer reason than "invalid".
//   try {
//     const [isValid, isUsed, onChainEventId] = await Promise.all([
//       publicClient.readContract({
//         address: expectedContract,
//         abi: ticketNftAbi,
//         functionName: "isValidTicket",
//         args: [tokenId],
//       }),
//       publicClient.readContract({
//         address: expectedContract,
//         abi: ticketNftAbi,
//         functionName: "isUsed",
//         args: [tokenId],
//       }),
//       publicClient.readContract({
//         address: expectedContract,
//         abi: ticketNftAbi,
//         functionName: "tokenEventId",
//         args: [tokenId],
//       }),
//     ]);

//     if (!isValid) {
//       return {
//         ok: false,
//         reason: isUsed
//           ? "This ticket has already been used."
//           : "This ticket does not exist.",
//         qr,
//       };
//     }
//     if (onChainEventId !== expectedEventId) {
//       return {
//         ok: false,
//         reason: `This ticket is for event #${onChainEventId}, not event #${expectedEventId}.`,
//         qr,
//         eventId: onChainEventId,
//       };
//     }

//     // 5. Signature vs current owner: added in #56

//     return { ok: true, qr, eventId: onChainEventId };
//   } catch (err) {
//     console.error("On-chain verification failed:", err);
//     return {
//       ok: false,
//       reason: "Could not reach the blockchain to verify this ticket.",
//       qr,
//     };
//   }
// }

// Verifies a scanned ticket QR code. Read-only: nothing is sent on-chain here.
// The actual check-in transaction happens separately (#57).

import { ticketNftAbi } from "@/lib/contracts/ticket-nft";
import {
  buildCheckInMessage,
  decodeTicketQR,
  isQRExpired,
  type SignedTicketQR,
} from "@/lib/ticket-qr";
import { verifyMessage, type PublicClient } from "viem";

// Allow a little difference between the attendee's and the scanner's clocks
const CLOCK_SKEW_SECONDS = 30;

export interface TicketVerification {
  ok: boolean;
  reason?: string; // shown to venue staff when ok is false
  qr?: SignedTicketQR; // decoded QR data, when it could be parsed
  eventId?: bigint; // the ticket's event according to the contract (never the QR)
  owner?: `0x${string}`; // the ticket's current owner according to the contract
}

interface VerifyParams {
  raw: string; // the text read from the QR code
  publicClient: PublicClient;
  expectedChainId: number;
  expectedContract: `0x${string}`;
  expectedEventId: bigint; // the event the scanner is checking people into
}

export async function verifyTicketQR({
  raw,
  publicClient,
  expectedChainId,
  expectedContract,
  expectedEventId,
}: VerifyParams): Promise<TicketVerification> {
  // 1. Is it one of our QR codes?
  const qr = decodeTicketQR(raw);
  if (!qr) {
    return { ok: false, reason: "This QR code is not an NFTicketPass ticket." };
  }

  let tokenId: bigint;
  try {
    tokenId = BigInt(qr.tokenId);
  } catch {
    return { ok: false, reason: "This QR code has an invalid ticket ID.", qr };
  }

  // 2. Is it fresh? Stops screenshots from being reused.
  const now = Math.floor(Date.now() / 1000);
  if (qr.timestamp > now + CLOCK_SKEW_SECONDS) {
    return {
      ok: false,
      reason: "QR code time is in the future. Ask the attendee to refresh it.",
      qr,
    };
  }
  if (isQRExpired(qr.timestamp, now)) {
    return {
      ok: false,
      reason: "QR code has expired. Ask the attendee to refresh it.",
      qr,
    };
  }

  // 3. Is it for this network and this contract?
  if (qr.chainId !== expectedChainId) {
    return {
      ok: false,
      reason: `Ticket is for a different network (chain ${qr.chainId}).`,
      qr,
    };
  }
  if (qr.contractAddress.toLowerCase() !== expectedContract.toLowerCase()) {
    return { ok: false, reason: "Ticket is from a different contract.", qr };
  }

  // 4. On-chain checks, all read together. The event comes from tokenEventId(),
  //    not the QR's eventId, which is only used to rebuild the signed message (#56).
  //    isUsed is also read so staff get a clearer reason than "invalid".
  try {
    const [isValid, isUsed, onChainEventId] = await Promise.all([
      publicClient.readContract({
        address: expectedContract,
        abi: ticketNftAbi,
        functionName: "isValidTicket",
        args: [tokenId],
      }),
      publicClient.readContract({
        address: expectedContract,
        abi: ticketNftAbi,
        functionName: "isUsed",
        args: [tokenId],
      }),
      publicClient.readContract({
        address: expectedContract,
        abi: ticketNftAbi,
        functionName: "tokenEventId",
        args: [tokenId],
      }),
    ]);

    if (!isValid) {
      return {
        ok: false,
        reason: isUsed
          ? "This ticket has already been used."
          : "This ticket does not exist.",
        qr,
      };
    }
    if (onChainEventId !== expectedEventId) {
      return {
        ok: false,
        reason: `This ticket is for event #${onChainEventId}, not event #${expectedEventId}.`,
        qr,
        eventId: onChainEventId,
      };
    }

    // 5. Was the QR signed by the ticket's current owner? (#56)
    //    Read ownerOf only now: it reverts for tickets that don't exist.
    const owner = await publicClient.readContract({
      address: expectedContract,
      abi: ticketNftAbi,
      functionName: "ownerOf",
      args: [tokenId],
    });

    // Rebuild the exact message from #54's format and check the signature against the owner
    const signedByOwner = await verifyMessage({
      address: owner,
      message: buildCheckInMessage(qr),
      signature: qr.signature,
    });
    if (!signedByOwner) {
      return {
        ok: false,
        reason:
          "QR code was not signed by the current ticket owner. It may have been transferred or tampered with.",
        qr,
        eventId: onChainEventId,
        owner,
      };
    }

    return { ok: true, qr, eventId: onChainEventId, owner };
  } catch (err) {
    console.error("On-chain verification failed:", err);
    return {
      ok: false,
      reason: "Could not reach the blockchain to verify this ticket.",
      qr,
    };
  }
}
