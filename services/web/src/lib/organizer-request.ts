// Asking to become an organizer at sign-up (#288, Figma: "Sign in / Organizer pending").
// The endpoint is POST /api/users/me/organizer-request from the organizer approval work
// (branch feat/organizer-approval). An admin approves it on-chain later.

import { apiClient } from "@/lib/api";

export const ORGANIZER_REQUEST_PATH = "/api/users/me/organizer-request";

export type OrganizerRequestResult = "sent" | "failed";

// Kept free of React so it can be tested with a fake request function
export async function sendOrganizerRequest(
  request: (path: string, options: { method: "POST"; data: object }) => Promise<unknown> = apiClient,
): Promise<OrganizerRequestResult> {
  try {
    await request(ORGANIZER_REQUEST_PATH, { method: "POST", data: {} });
    return "sent";
  } catch (err) {
    // Already waiting for review (e.g. a second tab): that's the outcome the user wanted
    if (err instanceof Error && err.message === "You already have a pending organizer request") return "sent";
    return "failed";
  }
}
