import { describe, expect, it } from "vitest";

import { fetchOrganizerRequest } from "./organizer-request";

describe("fetchOrganizerRequest", () => {
  it("reads the latest request's status and rejection reason", async () => {
    expect(await fetchOrganizerRequest(async () => ({ id: "r1", status: "PENDING", rejection_reason: null }))).toEqual({ status: "pending", rejectionReason: null, id: "r1" });
    expect(await fetchOrganizerRequest(async () => ({ id: "r2", status: "REJECTED", rejection_reason: " Not enough details " }))).toEqual({
      status: "rejected",
      rejectionReason: "Not enough details",
      id: "r2",
    });
    // The approval's ID is what the APPROVED stamp is remembered by
    expect((await fetchOrganizerRequest(async () => ({ id: "r3", status: "APPROVED" })))?.id).toBe("r3");
  });

  it("treats no request as none, and anything else as unknown", async () => {
    expect(await fetchOrganizerRequest(async () => Promise.reject(new Error("No organizer request found")))).toEqual({ status: "none", rejectionReason: null, id: null });
    expect(await fetchOrganizerRequest(async () => Promise.reject(new Error("Failed to fetch")))).toBeNull();
    expect(await fetchOrganizerRequest(async () => ({ status: "SOMETHING" }))).toBeNull();
  });
});
