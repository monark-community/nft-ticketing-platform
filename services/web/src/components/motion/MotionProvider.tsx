"use client";

import { LazyMotion, MotionConfig } from "motion/react";

// Motion's animation features (layout animations included, for the sliding underlines) load
// right after the page starts, in one shared file, so each page only ships the small `m`
// components. Use `m.div` from "motion/react-m", not `motion.div`: strict mode throws on a
// `motion` component, which would bring the whole library back into the page.
const loadFeatures = () => import("./motion-features").then((module) => module.default);

// Every Motion animation (sliding underlines, lists that reorder) also follows the system's
// "reduce motion" setting: with it on, things jump to their new place.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
