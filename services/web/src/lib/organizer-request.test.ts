import { describe, expect, it } from "vitest";

import { fetchOrganizerRequest } from "./organizer-request";

describe("fetchOrganizerRequest", () => {
  it("reads the latest request's status and rejection reason", async () => {
    expect(await fetchOrganizerRequest(async () => ({ status: "PENDING", rejection_reason: null }))).toEqual({ status: "pending", rejectionReason: null });
    expect(await fetchOrganizerRequest(async () => ({ status: "REJECTED", rejection_reason: " Not enough details " }))).toEqual({
      status: "rejected",
      rejectionReason: "Not enough details",
    });
  });

  it("treats no request as none, and anything else as unknown", async () => {
    expect(await fetchOrganizerRequest(async () => Promise.reject(new Error("No organizer request found")))).toEqual({ status: "none", rejectionReason: null });
    expect(await fetchOrganizerRequest(async () => Promise.reject(new Error("Failed to fetch")))).toBeNull();
    expect(await fetchOrganizerRequest(async () => ({ status: "SOMETHING" }))).toBeNull();
  });
});
