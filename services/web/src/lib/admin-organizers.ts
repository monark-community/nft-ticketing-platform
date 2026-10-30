// Organizer approval data shared by the admin page (#198) and its tests.

import { shortAddress } from "@/lib/format";

export interface OrganizerRequestUser {
  email: string | null;
  nickname: string | null;
  first_name: string | null;
  last_name: string | null;
}

export interface OrganizerRequest {
  id: string;
  wallet: string;
  organization_name: string | null;
  message: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  created_at: string;
  user: OrganizerRequestUser;
}

export const PENDING_ORGANIZER_REQUESTS_PATH = "/api/admin/organizer-requests?status=PENDING";

export function promoteOrganizerPath(wallet: string): string {
  return `/api/admin/organizers/${wallet}`;
}

export function rejectOrganizerRequestPath(id: string): string {
  return `/api/admin/organizer-requests/${id}/reject`;
}

// What the admin sees first: the organization name, then the person's name, then the wallet.
export function organizerDisplayName(request: OrganizerRequest): string {
  const person = [request.user?.first_name, request.user?.last_name].filter(Boolean).join(" ");
  return request.organization_name?.trim() || request.user?.nickname?.trim() || person || shortAddress(request.wallet);
}

export function formatRequestDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
