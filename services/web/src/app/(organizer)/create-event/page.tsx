import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/nav";

// The old create event form saved nothing (#188): creating events now happens in the four-step
// flow (#187). Old links and bookmarks land there.
export default function OldCreateEventPage() {
  redirect(ROUTES.newEvent);
}
