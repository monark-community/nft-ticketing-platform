import { describe, expect, it } from "vitest";
import {
  formatRequestDate,
  organizerAccountName,
  organizerDisplayName,
  ORGANIZERS_PATH,
  ORGANIZER_REQUESTS_PATH,
  organizerPath,
  pendingOrganizerRequests,
  recentOrganizerDecisions,
  rejectOrganizerRequestPath,
  type Organizer,
  type OrganizerRequest,
} from "@/lib/admin-organizers";

const request: OrganizerRequest = {
  id: "request-1",
  wallet: "0x1234567890abcdef1234567890abcdef12345678",
  organization_name: null,
  message: null,
  status: "PENDING",
  created_at: "2026-10-30T12:00:00.000Z",
  reviewed_at: null,
  rejection_reason: null,
  tx_hash: null,
  user: {
    email: "alex@example.com",
    nickname: null,
    first_name: "Alex",
    last_name: "Vance",
  },
};

const organizer: Organizer = {
  wallet: request.wallet,
  email: "alex@example.com",
  first_name: "Alex",
  last_name: "Vance",
  nickname: null,
  organization_name: null,
  event_count: 3,
  approved_at: "2026-10-01T12:00:00.000Z",
};

describe("admin organizer helpers", () => {
  it("builds the admin endpoint paths", () => {
    expect(ORGANIZER_REQUESTS_PATH).toBe("/api/admin/organizer-requests");
    expect(ORGANIZERS_PATH).toBe("/api/admin/organizers");
    expect(organizerPath(request.wallet)).toBe(`/api/admin/organizers/${request.wallet}`);
    expect(rejectOrganizerRequestPath(request.id)).toBe(`/api/admin/organizer-requests/${request.id}/reject`);
  });

  it("prefers the organization name, then the nickname, then the person's name", () => {
    expect(organizerDisplayName(request)).toBe("Alex Vance");
    expect(organizerDisplayName({ ...request, user: { ...request.user, nickname: "AV" } })).toBe("AV");
    expect(organizerDisplayName({ ...request, organization_name: " Monark Events " })).toBe("Monark Events");
    expect(organizerAccountName(organizer)).toBe("Alex Vance");
    expect(organizerAccountName({ ...organizer, organization_name: " Monark Events " })).toBe("Monark Events");
  });

  it("falls back to the wallet when there is no name", () => {
    expect(
      organizerDisplayName({
        ...request,
        user: { email: null, nickname: null, first_name: null, last_name: null },
      }),
    ).toBe("0x1234…5678");
  });

  it("formats the request date", () => {
    expect(formatRequestDate(request.created_at)).toContain("2026");
    expect(formatRequestDate("not-a-date")).toBe("");
    expect(formatRequestDate(null)).toBe("—");
  });

  it("sorts pending requests oldest first", () => {
    const newer = { ...request, id: "newer", created_at: "2026-10-31T12:00:00.000Z" };
    expect(pendingOrganizerRequests([newer, request]).map((item) => item.id)).toEqual(["request-1", "newer"]);
  });

  it("keeps only decisions from the past 30 days, newest first", () => {
    const now = new Date("2026-11-01T12:00:00.000Z");
    const recent = { ...request, id: "recent", status: "APPROVED" as const, reviewed_at: "2026-10-20T12:00:00.000Z" };
    const older = { ...request, id: "older", status: "REJECTED" as const, reviewed_at: "2026-09-01T12:00:00.000Z" };
    const newest = { ...request, id: "newest", status: "REJECTED" as const, reviewed_at: "2026-10-31T12:00:00.000Z" };

    expect(recentOrganizerDecisions([recent, older, newest], now).map((item) => item.id)).toEqual(["newest", "recent"]);
  });
});
