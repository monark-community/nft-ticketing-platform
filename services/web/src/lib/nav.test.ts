import { describe, expect, it } from "vitest";
import { shortAddress } from "@/lib/format";
import { avatarInitial, getNavRole, isActiveLink, navLinksFor, ROUTES } from "@/lib/nav";

// Navbar role rules from the Figma Navbar variants (#290).

describe("getNavRole", () => {
  it("is signed out without a wallet, even if a role is cached", () => {
    expect(getNavRole(false, null)).toBe("signed-out");
    expect(getNavRole(false, "ADMIN")).toBe("signed-out");
  });

  it("is connected while the wallet is connected but not signed in", () => {
    expect(getNavRole(true, null)).toBe("connected");
  });

  it("maps API roles, with scanners using the attendee navbar", () => {
    expect(getNavRole(true, "USER")).toBe("attendee");
    expect(getNavRole(true, "SCANNER")).toBe("attendee");
    expect(getNavRole(true, "ORGANIZER")).toBe("organizer");
    expect(getNavRole(true, "ADMIN")).toBe("admin");
  });
});

describe("navLinksFor", () => {
  const labels = (role: Parameters<typeof navLinksFor>[0]) => navLinksFor(role).map((l) => l.label);

  it("shows only public links before sign-in", () => {
    expect(labels("signed-out")).toEqual(["Search Events", "Marketplace"]);
    expect(labels("connected")).toEqual(["Search Events", "Marketplace"]);
  });

  it("shows My Tickets before sign-in only while on the My Tickets page", () => {
    expect(navLinksFor("signed-out", "/my-tickets").map((l) => l.label)).toEqual(["Search Events", "Marketplace", "My Tickets"]);
    expect(navLinksFor("connected", "/my-tickets").map((l) => l.label)).toContain("My Tickets");
    expect(labels("signed-out")).not.toContain("My Tickets");
  });

  it("adds My Tickets once signed in", () => {
    expect(labels("attendee")).toEqual(["Search Events", "Marketplace", "My Tickets"]);
  });

  it("shows Organizer only to organizers and Admin only to admins", () => {
    expect(labels("organizer")).toContain("Organizer");
    expect(labels("organizer")).not.toContain("Admin");
    expect(labels("admin")).toContain("Admin");
    expect(labels("admin")).not.toContain("Organizer");
    expect(labels("attendee")).not.toContain("Organizer");
  });
});

describe("isActiveLink", () => {
  it("matches the page and pages below it, not similar prefixes", () => {
    expect(isActiveLink("/my-tickets", ROUTES.myTickets)).toBe(true);
    expect(isActiveLink("/my-tickets/12", ROUTES.myTickets)).toBe(true);
    expect(isActiveLink("/my-tickets-old", ROUTES.myTickets)).toBe(false);
    expect(isActiveLink("/profile", ROUTES.myTickets)).toBe(false);
  });

  it("keeps Search Events active on the home page and event pages", () => {
    expect(isActiveLink("/", ROUTES.events)).toBe(true);
    expect(isActiveLink("/events", ROUTES.events)).toBe(true);
    expect(isActiveLink("/events/12", ROUTES.events)).toBe(true);
    expect(isActiveLink("/events-archive", ROUTES.events)).toBe(false);
    expect(isActiveLink("/profile", ROUTES.events)).toBe(false);
  });
});

describe("avatarInitial", () => {
  it("prefers nickname, then first name, then the address", () => {
    expect(avatarInitial({ nickname: "alexv", first_name: "Alex" })).toBe("A");
    expect(avatarInitial({ nickname: null, first_name: "sophie" })).toBe("S");
    expect(avatarInitial({ nickname: "  ", first_name: null, wallet_address: "0x3f2a9c1b" })).toBe("3");
    expect(avatarInitial(null)).toBe("?");
  });
});

describe("shortAddress", () => {
  it("shortens to 0x1234…abcd and leaves short or missing values alone", () => {
    expect(shortAddress("0x3f2a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e9c1b")).toBe("0x3f2a…9c1b");
    expect(shortAddress("0x1234")).toBe("0x1234");
    expect(shortAddress(undefined)).toBe("");
  });
});
