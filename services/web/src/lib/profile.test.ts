import { describe, expect, it } from "vitest";

import type { UserProfile } from "@/lib/auth-provider";
import {
  canRequestOrganizer,
  cleanNickname,
  mapProfileSaveError,
  profileChanged,
  profileFormFrom,
  roleLabel,
  toProfilePayload,
  validateProfile,
} from "./profile";

const user: UserProfile = {
  wallet_address: "0x3f2a00000000000000000000000000000009c1b",
  role: "USER",
  email: "alex.vance@example.com",
  first_name: "Alex",
  last_name: "Vance",
  nickname: null,
  profile_complete: true,
};

const form = profileFormFrom(user);

describe("profileFormFrom", () => {
  it("fills the form from the account, with empty strings for missing values", () => {
    expect(form).toEqual({ firstName: "Alex", lastName: "Vance", nickname: "", email: "alex.vance@example.com" });
  });
});

describe("validateProfile", () => {
  it("accepts a valid form, with or without a nickname", () => {
    expect(validateProfile(form)).toEqual({});
    expect(validateProfile({ ...form, nickname: "alexv" })).toEqual({});
  });

  it("requires a first name, a last name and a valid email", () => {
    expect(validateProfile({ ...form, firstName: " ", lastName: "", email: "nope" })).toEqual({
      firstName: "Enter your first name.",
      lastName: "Enter your last name.",
      email: "Enter a valid email.",
    });
  });

  it("limits the nickname length", () => {
    expect(validateProfile({ ...form, nickname: "a".repeat(51) }).nickname).toBe("Use 50 characters or fewer.");
  });
});

describe("toProfilePayload", () => {
  it("trims values and drops the @ the field already shows", () => {
    expect(toProfilePayload({ firstName: " Alex ", lastName: "Vance ", nickname: " @alexv", email: " Alex@Example.com " })).toEqual({
      first_name: "Alex",
      last_name: "Vance",
      nickname: "alexv",
      email: "Alex@Example.com",
    });
  });

  it("sends an empty nickname as null, to clear it", () => {
    expect(toProfilePayload({ ...form, nickname: "  @ " }).nickname).toBeNull();
    expect(cleanNickname("@@alexv")).toBe("alexv");
  });
});

describe("profileChanged", () => {
  it("ignores spacing and email case", () => {
    expect(profileChanged(form, user)).toBe(false);
    expect(profileChanged({ ...form, firstName: " Alex ", email: "ALEX.VANCE@example.com" }, user)).toBe(false);
  });

  it("notices real edits, including adding or clearing a nickname", () => {
    expect(profileChanged({ ...form, lastName: "Vancouver" }, user)).toBe(true);
    expect(profileChanged({ ...form, nickname: "alexv" }, user)).toBe(true);
    expect(profileChanged(form, { ...user, nickname: "alexv" })).toBe(true);
  });
});

describe("mapProfileSaveError", () => {
  it("points at the field the API rejected", () => {
    expect(mapProfileSaveError("Email already in use")).toEqual({ field: "email", message: "This email is already used by another account." });
    expect(mapProfileSaveError("nickname must be a string")).toEqual({ field: "nickname", message: "Enter a valid nickname." });
  });

  it("uses a save message, not the sign-up one, for anything else", () => {
    expect(mapProfileSaveError("Failed to update user")).toEqual({ message: "We couldn't save your changes. Check your connection and try again." });
  });
});

describe("roleLabel and canRequestOrganizer", () => {
  it("names each role and only lets attendees request organizer access", () => {
    expect(roleLabel("USER")).toBe("Attendee");
    expect(roleLabel("ORGANIZER")).toBe("Organizer");
    expect(roleLabel("ADMIN")).toBe("Admin");
    expect(roleLabel("SCANNER")).toBe("Scanner");
    expect(canRequestOrganizer("USER")).toBe(true);
    expect(canRequestOrganizer("ORGANIZER")).toBe(false);
  });
});
