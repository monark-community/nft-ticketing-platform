// Motion foundation (#361): the timings, easings and small calculations every animated piece shares.
// The pieces themselves are in components/motion. The idea behind all of it: things move like a
// ticket (printed, punched, stamped, torn off; prices flip like a departure board).

/** Timings in ms. Same values as --motion-fast / --motion-base / --motion-slow in globals.css. */
export const MOTION = { fast: 120, base: 200, slow: 300 } as const;

/** Easings. Same values as --ease-arrive / --ease-snap in globals.css. */
export const EASE = {
  /** Things arriving: quick start, soft landing */
  arrive: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  /** Punches and stamps: a small overshoot */
  snap: "cubic-bezier(0.3, 1.6, 0.5, 1)",
} as const;

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** True when the system asks for reduced motion. False on the server. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** How long an animation driven by script should take: nothing at all with reduced motion. */
export function motionDuration(ms: number, reduced: boolean): number {
  return reduced ? 0 : Math.max(0, ms);
}

// ---------------------------------------------------------------------------------------------
// CountUp

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * The number CountUp shows at `progress` (0 to 1) on its way from `from` to `to`. It starts fast and
 * settles; at 1 (or past it) it is exactly `to`.
 */
export function countUpValue(from: number, to: number, progress: number): number {
  if (!(progress < 1)) return to; // also covers NaN
  if (progress <= 0) return from;
  return from + (to - from) * easeOutCubic(progress);
}

// ---------------------------------------------------------------------------------------------
// RollingNumber

export type RollDirection = "up" | "down";

/** The first number in a text: "$1,250.50" → 1250.5, "Showing 2 of 6" → 2. null when there is none. */
export function firstNumber(text: string): number | null {
  const match = /-?\d[\d,]*(?:\.\d+)?/.exec(text);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** Which way a value rolls: up when it grows, down when it shrinks. Text without numbers rolls up. */
export function rollDirection(previous: string, next: string): RollDirection {
  const a = firstNumber(previous);
  const b = firstNumber(next);
  return a !== null && b !== null && b < a ? "down" : "up";
}

// ---------------------------------------------------------------------------------------------
// FlapText

export interface FlapCell {
  /** The character shown once the flip is over */
  char: string;
  /** The character it replaces ("" when the text got longer) */
  was: string;
  changed: boolean;
}

/**
 * The cells of a departure-board flip from one text to another. Texts are lined up on the right, like
 * prices, so "9.00" → "12.00" flips the first two cells and leaves ".00" still. Joining every `char`
 * gives `to`.
 */
export function flapCells(from: string, to: string): FlapCell[] {
  const next = Array.from(to);
  const previous = Array.from(from);
  const offset = previous.length - next.length;
  return next.map((char, i) => {
    const was = previous[i + offset] ?? "";
    return { char, was, changed: was !== char };
  });
}

// ---------------------------------------------------------------------------------------------
// Web Animations, for the few pieces that can't be plain CSS

type Keyframes = Keyframe[] | PropertyIndexedKeyframes;

/**
 * element.animate() with our defaults (200 ms, the "arrive" easing, nothing left behind when it ends).
 * Returns null with reduced motion or in browsers without the Web Animations API: the caller's final
 * state is already in the page, so there is nothing to do.
 */
export function animate(element: Element | null | undefined, keyframes: Keyframes, options: KeyframeAnimationOptions = {}): Animation | null {
  if (!element || typeof element.animate !== "function" || prefersReducedMotion()) return null;
  return element.animate(keyframes, { duration: MOTION.base, easing: EASE.arrive, fill: "none", ...options });
}

/** Resolves when the animation is over, also when it was cancelled or never started. */
export function finished(animation: Animation | null): Promise<void> {
  if (!animation) return Promise.resolve();
  return animation.finished.then(
    () => undefined,
    () => undefined,
  );
}

/** The two halves of a tear along a jagged line, as clip-paths */
export const TEAR_TOP = "polygon(0 0,100% 0,100% 46%,88% 52%,76% 47%,63% 53%,50% 48%,37% 54%,24% 48%,12% 53%,0 49%)";
export const TEAR_BOTTOM = "polygon(0 49%,12% 53%,24% 48%,37% 54%,50% 48%,63% 53%,76% 47%,88% 52%,100% 46%,100% 100%,0 100%)";
