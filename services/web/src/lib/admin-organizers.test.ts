import { describe, expect, it } from "vitest";
import {
  formatRequestDate,
  organizerDisplayName,
  PENDING_ORGANIZER_REQUESTS_PATH,
  promoteOrganizerPath,
  rejectOrganizerRequestPath,
  type OrganizerRequest,
} from "@/lib/admin-organizers";

const request: OrganizerRequest = {
  id: "request-1",
  wallet: "0x1234567890abcdef1234567890abcdef12345678",
  organization_name: null,
  message: null,
  status: "PENDING",
  created_at: "2026-10-30T12:00:00.000Z",
  user: {
    email: "alex@example.com",
    nickname: null,
    first_name: "Alex",
    last_name: "Vance",
  },
};

describe("admin organizer helpers", () => {
  it("builds the admin endpoint paths", () => {
    expect(PENDING_ORGANIZER_REQUESTS_PATH).toBe("/api/admin/organizer-requests?status=PENDING");
    expect(promoteOrganizerPath(request.wallet)).toBe(`/api/admin/organizers/${request.wallet}`);
    expect(rejectOrganizerRequestPath(request.id)).toBe(`/api/admin/organizer-requests/${request.id}/reject`);
  });

  it("prefers the organization name, then the nickname, then the person's name", () => {
    expect(organizerDisplayName(request)).toBe("Alex Vance");
    expect(organizerDisplayName({ ...request, user: { ...request.user, nickname: "AV" } })).toBe("AV");
    expect(organizerDisplayName({ ...request, organization_name: " Monark Events " })).toBe("Monark Events");
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
  });
});
