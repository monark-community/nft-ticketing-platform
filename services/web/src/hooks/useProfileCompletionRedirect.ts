"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useWalletAuth } from "@/hooks/useWalletAuth";
import { ROUTES } from "@/lib/nav";

// Signing in now happens from the navbar on any page (#288). A wallet signing in for the first
// time has no name or email yet, so send it to the create account step, then back to this page.
export function useProfileCompletionRedirect() {
  const { user } = useWalletAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!user || user.profile_complete || !pathname || pathname === ROUTES.signUp) return;
    router.replace(`${ROUTES.signUp}?next=${encodeURIComponent(pathname)}`);
  }, [user, pathname, router]);
}
