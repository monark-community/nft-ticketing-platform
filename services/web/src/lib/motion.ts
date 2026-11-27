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
// Loading placeholders and content arriving (#365)

/** Placeholders wait this long before they show (`placeholder-in`), so a page that answers faster never flashes them */
export const PLACEHOLDER_DELAY_MS = 250;
/** Once on screen, placeholders stay at least this long, so they never blink */
export const PLACEHOLDER_MIN_MS = 500;

/** How long a card or a table row takes to print in, and the step between one and the next */
export const PRINT_MS = 400;
export const PRINT_STEP_MS = 80;
/** Only the first cards wait their turn; the rest print with the last of them, so a long list isn't slow */
export const PRINT_MAX_STEPS = 6;

/** When the card at `index` (from 0) starts printing, in ms */
export function printDelay(index: number): number {
  return Math.min(Math.max(0, Math.floor(index)), PRINT_MAX_STEPS) * PRINT_STEP_MS;
}

/**
 * Where a page's placeholders are (useHeldLoading):
 * - "waiting": loading, placeholders not on screen yet (their PLACEHOLDER_DELAY_MS runs)
 * - "shown": placeholders on screen, their PLACEHOLDER_MIN_MS not over yet
 * - "done": they have been on screen long enough
 * - "idle": not loading
 */
export type PlaceholderPhase = "idle" | "waiting" | "shown" | "done";
export type PlaceholderEvent = "load-start" | "load-end" | "delay-over" | "minimum-over";

export function placeholderStep(phase: PlaceholderPhase, event: PlaceholderEvent): PlaceholderPhase {
  switch (event) {
    case "load-start":
      return phase === "idle" || phase === "done" ? "waiting" : phase;
    case "load-end":
      // Placeholders on screen stay until their minimum is over; ones that never showed don't
      return phase === "shown" ? "shown" : "idle";
    case "delay-over":
      return phase === "waiting" ? "shown" : phase;
    case "minimum-over":
      return phase === "shown" ? "done" : phase;
  }
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
// DotField (the live background, #362). Distances are in grid cells.

/** How much a dot warms up near the pointer: a diamond around it, brightest at its centre (0 to 0.85). */
export function dotGlow(dx: number, dy: number): number {
  return Math.max(0, 1 - (Math.abs(dx) + Math.abs(dy)) / 4.5) * 0.85;
}

/** How long a click's wave lives, in seconds */
export const DOT_WAVE_SECONDS = 1.3;

/**
 * How bright a dot is as a click's wave passes: a diamond ring that grows 24 cells a second and fades
 * out over 1.2 s. `cells` is the dot's distance from the click, counted along the grid.
 */
export function dotWave(cells: number, ageSeconds: number): number {
  const fromRing = Math.abs(cells - ageSeconds * 24);
  if (ageSeconds < 0 || fromRing >= 1.5) return 0;
  return (1 - fromRing / 1.5) * Math.max(0, 1 - ageSeconds / 1.2);
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

// ---------------------------------------------------------------------------------------------
// Moving one thing into another (the sign-in steps, #371)

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * How to draw the element now at `to` so it starts where `from` was: the move between their centres,
 * and one scale (kept between 0.45 and 1.6, so a square icon turning into a wide pill isn't squashed).
 */
export function flipFrom(from: Box, to: Box): { dx: number; dy: number; scale: number } {
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const ratio = to.width > 0 && to.height > 0 ? Math.min(from.width / to.width, from.height / to.height) : 1;
  const scale = Math.max(0.45, Math.min(1.6, Number.isFinite(ratio) ? ratio : 1));
  return { dx, dy, scale };
}

// ---------------------------------------------------------------------------------------------
// Table rows that fold away and open in (the admin page, #374)

/** A row that left the list: where it was, and the row it followed */
export interface LeftRow {
  key: string;
  index: number;
  after: string | null;
}

/** What changed between two lists of row keys: the rows that left (and where they were), and the new ones */
export function rowChanges(before: string[], after: string[]): { gone: LeftRow[]; added: string[] } {
  const now = new Set(after);
  const had = new Set(before);
  const gone = before.flatMap((key, index) => (now.has(key) ? [] : [{ key, index, after: index > 0 ? before[index - 1] : null }]));
  return { gone, added: after.filter((key) => !had.has(key)) };
}

/**
 * The rows to draw: the list as it is, with the rows still folding away kept where they were (just
 * below the row they followed, or at their old place if that row is gone too).
 */
export function withLeavingRows(keys: string[], leaving: LeftRow[]): string[] {
  const rows = [...keys];
  for (const row of leaving) {
    if (rows.includes(row.key)) continue;
    const after = row.after === null ? 0 : rows.indexOf(row.after) + 1;
    rows.splice(row.after === null || after > 0 ? after : Math.min(row.index, rows.length), 0, row.key);
  }
  return rows;
}
