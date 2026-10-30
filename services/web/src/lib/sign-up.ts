// Account creation rules (#288), kept free of React so they can be unit tested.
// The API checks the same things (services/api user.controller updateMe); checking here first
// lets the form point at the field to fix instead of showing a server error.

import { ROUTES } from "@/lib/nav";

// Same pattern as the API, so the form never accepts an email the API would reject
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Long enough for real names and emails, short enough to keep the profile and navbar tidy
export const MAX_NAME_LENGTH = 50;
export const MAX_EMAIL_LENGTH = 254;

export type AccountType = "attendee" | "organizer";

export interface SignUpForm {
  firstName: string;
  lastName: string;
  email: string;
  accountType: AccountType;
}

export type SignUpErrors = Partial<Record<"firstName" | "lastName" | "email", string>>;

export function validateSignUp(form: SignUpForm): SignUpErrors {
  const errors: SignUpErrors = {};
  const firstName = form.firstName.trim();
  const lastName = form.lastName.trim();
  const email = form.email.trim();

  if (!firstName) errors.firstName = "Enter your first name.";
  else if (firstName.length > MAX_NAME_LENGTH) errors.firstName = `Use ${MAX_NAME_LENGTH} characters or fewer.`;

  if (!lastName) errors.lastName = "Enter your last name.";
  else if (lastName.length > MAX_NAME_LENGTH) errors.lastName = `Use ${MAX_NAME_LENGTH} characters or fewer.`;

  if (!email) errors.email = "Enter your email.";
  else if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email.";

  return errors;
}

// What PUT /api/users/me receives. The API lowercases the email itself.
export function toProfileUpdate(form: SignUpForm) {
  return {
    first_name: form.firstName.trim(),
    last_name: form.lastName.trim(),
    email: form.email.trim(),
  };
}

// The API's error texts (services/api user.controller updateMe), mapped to the field to fix.
// apiClient only passes the text on, not the status code, so the text is what we match.
export function mapProfileError(message: string): { field?: keyof SignUpErrors; message: string } {
  if (message === "Email already in use") {
    return { field: "email", message: "This email is already used by another account." };
  }
  if (message === "A valid email is required") return { field: "email", message: "Enter a valid email." };
  if (message.startsWith("first_name")) return { field: "firstName", message: "Enter your first name." };
  if (message.startsWith("last_name")) return { field: "lastName", message: "Enter your last name." };
  if (message.startsWith("Unauthorized")) return { message: "Your session expired. Sign the message again to continue." };
  return { message: "We couldn't create your account. Check your connection and try again." };
}

// The sign-in errors from AuthProvider (lib/auth-provider.tsx), as a title and what to do next.
// Raw API or wallet texts are never shown: they're technical and can be long.
export function describeAuthError(authError: string | null): { title: string; message: string } | null {
  if (!authError) return null;
  if (authError === "Signature request was rejected.") {
    return { title: "Signature cancelled", message: "You cancelled the request in your wallet. Sign the message to log in." };
  }
  if (authError === "Wallet address is not available.") {
    return { title: "Wallet not found", message: "Reconnect your wallet and try again." };
  }
  return { title: "We couldn't sign you in", message: "Check your connection and try again." };
}

// Where to go once signed in: the ?next= page if it's one of ours, otherwise the events list.
// Only same-site paths are allowed, so a link can't send someone to another website (open redirect).
// The check parses `next` the way the browser will: browsers drop tabs and newlines and read "\" as
// "/", so "/\t/evil.com" becomes "//evil.com". Comparing the origin catches all of those.
const SAME_SITE = "http://localhost";

export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return ROUTES.events;

  let url: URL;
  try {
    url = new URL(next, SAME_SITE);
  } catch {
    return ROUTES.events;
  }
  if (url.origin !== SAME_SITE) return ROUTES.events;
  if (url.pathname === ROUTES.signUp || url.pathname === "/signin") return ROUTES.events;

  return url.pathname + url.search + url.hash;
}
