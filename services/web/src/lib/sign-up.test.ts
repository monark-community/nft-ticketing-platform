import { describe, expect, it, vi } from "vitest";
import { ROUTES } from "@/lib/nav";
import { sendOrganizerRequest, ORGANIZER_REQUEST_PATH } from "@/lib/organizer-request";
import {
  describeAuthError,
  mapProfileError,
  safeNextPath,
  toProfileUpdate,
  validateSignUp,
  type SignUpForm,
} from "@/lib/sign-up";

// Account creation rules (#288).

const valid: SignUpForm = { firstName: "Alex", lastName: "Vance", email: "alex@example.com", accountType: "attendee" };

describe("validateSignUp", () => {
  it("accepts a complete form", () => {
    expect(validateSignUp(valid)).toEqual({});
  });

  it("asks for every missing field", () => {
    expect(validateSignUp({ ...valid, firstName: " ", lastName: "", email: "" })).toEqual({
      firstName: "Enter your first name.",
      lastName: "Enter your last name.",
      email: "Enter your email.",
    });
  });

  it.each(["alex.vance@", "alex@", "@example.com", "alex example@x.com", "alex@example"])("rejects the email %s", (email) => {
    expect(validateSignUp({ ...valid, email }).email).toBe("Enter a valid email.");
  });

  it("ignores spaces around the email", () => {
    expect(validateSignUp({ ...valid, email: "  alex@example.com " })).toEqual({});
  });

  it("limits name length", () => {
    expect(validateSignUp({ ...valid, firstName: "a".repeat(51) }).firstName).toBe("Use 50 characters or fewer.");
  });
});

describe("toProfileUpdate", () => {
  it("trims what's sent to the API", () => {
    expect(toProfileUpdate({ ...valid, firstName: " Alex ", email: " alex@example.com " })).toEqual({
      first_name: "Alex",
      last_name: "Vance",
      email: "alex@example.com",
    });
  });
});

describe("mapProfileError", () => {
  it("puts a taken email on the email field", () => {
    expect(mapProfileError("Email already in use")).toEqual({
      field: "email",
      message: "This email is already used by another account.",
    });
  });

  it("explains an expired session", () => {
    expect(mapProfileError("Unauthorized: invalid or expired token").field).toBeUndefined();
  });

  it("gives a general message for anything else", () => {
    expect(mapProfileError("Failed to update user").message).toBe(
      "We couldn't create your account. Check your connection and try again.",
    );
  });
});

describe("describeAuthError", () => {
  it("explains a cancelled signature", () => {
    expect(describeAuthError("Signature request was rejected.")?.title).toBe("Signature cancelled");
  });

  it("never shows raw error text", () => {
    expect(describeAuthError("Failed to fetch")).toEqual({
      title: "We couldn't sign you in",
      message: "Check your connection and try again.",
    });
  });

  it("is empty without an error", () => {
    expect(describeAuthError(null)).toBeNull();
  });
});

// The fallback is the events list, whatever its address is (#283 moves it from /events to /)
describe("safeNextPath", () => {
  it.each([
    [null, ROUTES.events],
    ["/my-tickets", "/my-tickets"],
    ["/events/event-1?x=1", "/events/event-1?x=1"],
    ["https://evil.example", ROUTES.events],
    ["//evil.example", ROUTES.events],
    ["/\\evil.example", ROUTES.events],
    // Browsers drop tabs and newlines, which would turn these into //evil.com
    ["/\t/evil.com", ROUTES.events],
    ["/\n/evil.com", ROUTES.events],
    ["/\r/evil.com", ROUTES.events],
    ["/events/event-1#tickets", "/events/event-1#tickets"],
    ["/signup", ROUTES.events],
    ["/signup?next=/my-tickets", ROUTES.events],
    ["/signin", ROUTES.events],
  ])("sends %j to %j", (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });
});

describe("sendOrganizerRequest", () => {
  it("posts the request", async () => {
    const request = vi.fn(async () => ({}));
    expect(await sendOrganizerRequest(request)).toBe("sent");
    expect(request).toHaveBeenCalledWith(ORGANIZER_REQUEST_PATH, { method: "POST", data: {} });
  });

  it("counts an already pending request as sent", async () => {
    const request = vi.fn(async () => {
      throw new Error("You already have a pending organizer request");
    });
    expect(await sendOrganizerRequest(request)).toBe("sent");
  });

  it("reports other failures, such as the endpoint not existing yet", async () => {
    const request = vi.fn(async () => {
      throw new Error("An error occurred while fetching data.");
    });
    expect(await sendOrganizerRequest(request)).toBe("failed");
  });
});
