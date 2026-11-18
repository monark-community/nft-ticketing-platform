"use client";

import { MotionConfig } from "motion/react";

// Makes every Motion animation (sliding underlines, lists that reorder) follow the system's
// "reduce motion" setting: with it on, things jump to their new place.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
