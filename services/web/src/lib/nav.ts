// Navbar rules from the Figma Navbar variants (#290). Kept free of React so they can be tested.

export const ROUTES = {
  events: "/events",
  marketplace: "/marketplace",
  myTickets: "/my-tickets",
  organizer: "/organizer",
  admin: "/admin",
  profile: "/profile",
} as const;

// Signed out = no wallet; Connected = wallet connected but not signed in yet (SIWE);
// then the signed-in roles. Scanners use the attendee navbar (they scan from /scan).
export type NavRole = "signed-out" | "connected" | "attendee" | "organizer" | "admin";

type ApiRole = "USER" | "ORGANIZER" | "SCANNER" | "ADMIN";

export function getNavRole(isConnected: boolean, userRole: ApiRole | null | undefined): NavRole {
  if (!isConnected) return "signed-out";
  if (!userRole) return "connected";
  if (userRole === "ORGANIZER") return "organizer";
  if (userRole === "ADMIN") return "admin";
  return "attendee";
}

export interface NavLink {
  label: string;
  href: string;
}

const EVENTS: NavLink = { label: "Search Events", href: ROUTES.events };
const MARKETPLACE: NavLink = { label: "Marketplace", href: ROUTES.marketplace };
const MY_TICKETS: NavLink = { label: "My Tickets", href: ROUTES.myTickets };

// Organizer and Admin links only show for those roles (#282).
// Before sign-in, My Tickets only appears while you're on that page, highlighted
// (the "Role=Signed out, Active=My Tickets" variant used by "My Tickets / Not connected").
export function navLinksFor(role: NavRole, pathname = ""): NavLink[] {
  switch (role) {
    case "signed-out":
    case "connected":
      return isActiveLink(pathname, ROUTES.myTickets) ? [EVENTS, MARKETPLACE, MY_TICKETS] : [EVENTS, MARKETPLACE];
    case "attendee":
      return [EVENTS, MARKETPLACE, MY_TICKETS];
    case "organizer":
      return [EVENTS, MARKETPLACE, MY_TICKETS, { label: "Organizer", href: ROUTES.organizer }];
    case "admin":
      return [EVENTS, MARKETPLACE, MY_TICKETS, { label: "Admin", href: ROUTES.admin }];
  }
}

// A link is active on its own page and on pages below it (/events/123 keeps "Search Events" active)
export function isActiveLink(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Letter shown in the profile chip: nickname, then first name, then the first address character
export function avatarInitial(user: { nickname?: string | null; first_name?: string | null; wallet_address?: string } | null): string {
  const name = user?.nickname?.trim() || user?.first_name?.trim();
  if (name) return name[0].toUpperCase();
  return user?.wallet_address?.[2]?.toUpperCase() ?? "?";
}
