// Profile page rules (#285), kept free of React so they can be unit tested.
// Uses the same limits and email check as account creation (lib/sign-up.ts), which match the API
// (services/api user.controller updateMe).

import type { UserProfile } from "@/lib/auth-provider";
import { mapProfileError, MAX_NAME_LENGTH, validateSignUp } from "@/lib/sign-up";

export interface ProfileForm {
  firstName: string;
  lastName: string;
  nickname: string;
  email: string;
}

export type ProfileErrors = Partial<Record<keyof ProfileForm, string>>;

export function profileFormFrom(user: UserProfile): ProfileForm {
  return {
    firstName: user.first_name ?? "",
    lastName: user.last_name ?? "",
    nickname: user.nickname ?? "",
    email: user.email ?? "",
  };
}

// "@alexv" and "alexv" are the same nickname: the field already shows the @
export function cleanNickname(nickname: string): string {
  return nickname.trim().replace(/^@+/, "");
}

export function validateProfile(form: ProfileForm): ProfileErrors {
  const { firstName, lastName, email } = validateSignUp({ ...form, accountType: "attendee" });
  const errors: ProfileErrors = { firstName, lastName, email };
  if (cleanNickname(form.nickname).length > MAX_NAME_LENGTH) errors.nickname = `Use ${MAX_NAME_LENGTH} characters or fewer.`;
  for (const key of Object.keys(errors) as (keyof ProfileErrors)[]) if (!errors[key]) delete errors[key];
  return errors;
}

// What PUT /api/users/me receives. An empty nickname is sent as null to clear it.
export function toProfilePayload(form: ProfileForm) {
  const nickname = cleanNickname(form.nickname);
  return {
    first_name: form.firstName.trim(),
    last_name: form.lastName.trim(),
    nickname: nickname || null,
    email: form.email.trim(),
  };
}

// Unsaved changes, compared the way the API stores them (trimmed, email lowercased)
export function profileChanged(form: ProfileForm, user: UserProfile): boolean {
  const next = toProfilePayload(form);
  return (
    next.first_name !== (user.first_name ?? "") ||
    next.last_name !== (user.last_name ?? "") ||
    next.nickname !== (user.nickname || null) ||
    next.email.toLowerCase() !== (user.email ?? "").toLowerCase()
  );
}

// The API's error, as the field to fix and what to say. Reuses sign-up's mapping, with a
// fallback that fits this page.
export function mapProfileSaveError(message: string): { field?: keyof ProfileErrors; message: string } {
  const mapped = mapProfileError(message);
  if (mapped.field || message.startsWith("Unauthorized")) return mapped;
  if (message.startsWith("nickname")) return { field: "nickname", message: "Enter a valid nickname." };
  return { message: "We couldn't save your changes. Check your connection and try again." };
}

// "Active role" on the wallet card
export function roleLabel(role: UserProfile["role"]): string {
  switch (role) {
    case "ORGANIZER":
      return "Organizer";
    case "ADMIN":
      return "Admin";
    case "SCANNER":
      return "Scanner";
    default:
      return "Attendee";
  }
}

// Only attendees can ask to become organizers
export function canRequestOrganizer(role: UserProfile["role"]): boolean {
  return role === "USER";
}
