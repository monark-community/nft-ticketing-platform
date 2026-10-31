import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/nav";

// The navbar's "Organizer" link. Until "My events" exists (it needs the organizer's own events
// endpoint, #250), it opens the create event flow instead of a 404.
export default function OrganizerPage() {
  redirect(ROUTES.newEvent);
}
