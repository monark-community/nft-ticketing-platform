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
  reviewed_at: string | null;
  rejection_reason: string | null;
  tx_hash: string | null;
  user: OrganizerRequestUser;
}

export interface Organizer {
  wallet: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  organization_name: string | null;
  event_count: number;
  approved_at: string | null;
}

export const ORGANIZER_REQUESTS_PATH = "/api/admin/organizer-requests";
export const ORGANIZERS_PATH = "/api/admin/organizers";

export function organizerPath(wallet: string): string {
  return `/api/admin/organizers/${wallet}`;
}

export function rejectOrganizerRequestPath(id: string): string {
  return `/api/admin/organizer-requests/${id}/reject`;
}

function personName(person: Pick<OrganizerRequestUser, "first_name" | "last_name">): string {
  return [person.first_name, person.last_name].filter(Boolean).join(" ");
}

// What the admin sees first: the organization name, then the person's name, then the wallet.
export function organizerDisplayName(request: OrganizerRequest): string {
  return (
    request.organization_name?.trim() ||
    request.user?.nickname?.trim() ||
    personName(request.user) ||
    shortAddress(request.wallet)
  );
}

export function organizerAccountName(organizer: Organizer): string {
  return (
    organizer.organization_name?.trim() ||
    organizer.nickname?.trim() ||
    personName(organizer) ||
    shortAddress(organizer.wallet)
  );
}

// Initial shown in the round avatar next to a name. Falls back to the wallet's
// first character when there is no name, or when the name is just the address.
export function displayNameInitial(name: string, wallet: string): string {
  const trimmed = name.trim();
  if (trimmed && !trimmed.startsWith("0x")) return trimmed[0].toUpperCase();
  return wallet[2]?.toUpperCase() ?? "?";
}

export function formatRequestDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// The requests tab shows open requests oldest first, so the longest wait is at the top.
export function pendingOrganizerRequests(requests: OrganizerRequest[]): OrganizerRequest[] {
  return requests
    .filter((request) => request.status === "PENDING")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

const RECENT_DECISION_DAYS = 30;

// Approved/rejected requests from the past 30 days, newest decision first.
export function recentOrganizerDecisions(requests: OrganizerRequest[], now = new Date()): OrganizerRequest[] {
  const cutoff = now.getTime() - RECENT_DECISION_DAYS * 24 * 60 * 60 * 1000;
  return requests
    .filter((request) => {
      if (request.status === "PENDING" || !request.reviewed_at) return false;
      return new Date(request.reviewed_at).getTime() >= cutoff;
    })
    .sort((a, b) => new Date(b.reviewed_at!).getTime() - new Date(a.reviewed_at!).getTime());
}
