import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/nav";

// The old sign-in form is gone (#288): signing in happens through the wallet button in the
// navbar, and a new wallet finishes its account on /signup. Old links and bookmarks land there.
export default function SignInPage() {
  redirect(ROUTES.signUp);
}
