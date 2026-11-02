import { describe, expect, it } from "vitest";

import type { ApiEvent } from "@/lib/event-details";
import {
  canResumeCamera,
  canScanEvent,
  formatCheckedInAt,
  onChainEvents,
  pickEventId,
  scannerEventLabel,
  scanView,
  signedAgo,
} from "./scanner";

const wallet = "0xAbC0000000000000000000000000000000000001";
const none = { isEventScanner: false, eventOrganizer: "0x0000000000000000000000000000000000000000", hasOrganizerRole: false, isAdmin: false };

describe("canScanEvent", () => {
  it("allows the event's scanners and admins", () => {
    expect(canScanEvent(wallet, { ...none, isEventScanner: true })).toBe(true);
    expect(canScanEvent(wallet, { ...none, isAdmin: true })).toBe(true);
  });

  it("allows the event's organizer only while they hold the organizer role", () => {
    expect(canScanEvent(wallet, { ...none, eventOrganizer: wallet.toLowerCase(), hasOrganizerRole: true })).toBe(true);
    expect(canScanEvent(wallet, { ...none, eventOrganizer: wallet, hasOrganizerRole: false })).toBe(false);
  });

  it("refuses everyone else, including organizers of other events", () => {
    expect(canScanEvent(wallet, none)).toBe(false);
    expect(canScanEvent(wallet, { ...none, hasOrganizerRole: true })).toBe(false);
  });
});

describe("onChainEvents", () => {
  it("keeps only events with a contract event ID", () => {
    const events = [{ id: "a", contract_event_id: "1" }, { id: "b", contract_event_id: null }] as ApiEvent[];
    expect(onChainEvents(events).map((e) => e.id)).toEqual(["a"]);
  });
});

describe("scannerEventLabel", () => {
  it("shows the title and date like the Figma picker", () => {
    expect(scannerEventLabel({ title: "Gala Opera Concert", start_date: "2027-03-06T19:00:00Z" }, "UTC")).toBe(
      "Gala Opera Concert · Sat, Mar 6, 2027",
    );
  });
});

describe("scanView", () => {
  const valid = { ok: true };
  it("rejects any ticket that failed verification, whatever the transaction is doing", () => {
    expect(scanView({ ok: false, reason: "x" }, "idle")).toBe("rejected");
    expect(scanView({ ok: false, reason: "x" }, "success")).toBe("rejected");
  });

  it("follows the check-in transaction for a valid ticket", () => {
    expect(scanView(valid, "idle")).toBe("valid");
    expect(scanView(valid, "awaitingWallet")).toBe("checkingIn");
    expect(scanView(valid, "confirming")).toBe("checkingIn");
    expect(scanView(valid, "stillPending")).toBe("pending");
    expect(scanView(valid, "stoppedWaiting")).toBe("pending");
    expect(scanView(valid, "error")).toBe("failed");
    expect(scanView(valid, "success")).toBe("checkedIn");
  });
});

describe("canResumeCamera", () => {
  it("blocks the next scan while a check-in is waiting on the wallet or the chain", () => {
    expect(canResumeCamera("checkingIn", "awaitingWallet")).toBe(false);
    expect(canResumeCamera("pending", "stillPending")).toBe(false);
  });

  it("allows it otherwise, including after staff stop waiting", () => {
    expect(canResumeCamera("pending", "stoppedWaiting")).toBe(true);
    expect(canResumeCamera("rejected", "idle")).toBe(true);
    expect(canResumeCamera("failed", "error")).toBe(true);
    expect(canResumeCamera(null, "idle")).toBe(true);
  });
});

describe("signedAgo", () => {
  it("counts seconds, then minutes", () => {
    expect(signedAgo(100, 101)).toBe("1 second ago");
    expect(signedAgo(100, 112)).toBe("12 seconds ago");
    expect(signedAgo(100, 220)).toBe("2 minutes ago");
    expect(signedAgo(100, 90)).toBe("0 seconds ago");
  });
});

describe("formatCheckedInAt", () => {
  const now = new Date("2027-03-06T23:00:00Z");
  it("says Today for a check-in earlier the same day", () => {
    expect(formatCheckedInAt(Date.parse("2027-03-06T18:42:00Z") / 1000, now, "UTC")).toBe("Today at 6:42 PM");
  });

  it("shows the date for another day", () => {
    expect(formatCheckedInAt(Date.parse("2027-03-05T18:42:00Z") / 1000, now, "UTC")).toBe("Mar 5 at 6:42 PM");
  });
});

describe("pickEventId", () => {
  it("keeps the remembered event while the wallet can still scan it", () => {
    expect(pickEventId(["1", "2"], "2")).toBe("2");
  });

  it("falls back to the first event, or none", () => {
    expect(pickEventId(["1", "2"], "9")).toBe("1");
    expect(pickEventId([], "2")).toBeNull();
  });
});
