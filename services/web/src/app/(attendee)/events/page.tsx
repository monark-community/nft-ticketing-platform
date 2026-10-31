import { redirect } from "next/navigation";

// The events list is the home page (#283); keep /events working for old links
export default function EventsRedirect() {
  redirect("/");
}
