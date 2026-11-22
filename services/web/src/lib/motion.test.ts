import { describe, expect, it } from "vitest";

import {
  countUpValue,
  dotGlow,
  dotWave,
  firstNumber,
  flapCells,
  motionDuration,
  placeholderStep,
  prefersReducedMotion,
  PRINT_MAX_STEPS,
  PRINT_STEP_MS,
  printDelay,
  rollDirection,
  type PlaceholderPhase,
} from "./motion";

describe("motionDuration", () => {
  it("keeps the duration normally", () => {
    expect(motionDuration(260, false)).toBe(260);
  });

  it("is zero with reduced motion, so the animation is skipped", () => {
    expect(motionDuration(260, true)).toBe(0);
  });

  it("never goes below zero", () => {
    expect(motionDuration(-5, false)).toBe(0);
  });
});

describe("printDelay (cards printing one after another, #365)", () => {
  it("starts the first card at once and each next one a step later", () => {
    expect(printDelay(0)).toBe(0);
    expect(printDelay(1)).toBe(PRINT_STEP_MS);
    expect(printDelay(3)).toBe(3 * PRINT_STEP_MS);
  });

  it("stops adding steps after the first cards, so a long list isn't slow", () => {
    expect(printDelay(PRINT_MAX_STEPS + 5)).toBe(PRINT_MAX_STEPS * PRINT_STEP_MS);
  });

  it("never waits a negative or fractional step", () => {
    expect(printDelay(-2)).toBe(0);
    expect(printDelay(1.7)).toBe(PRINT_STEP_MS);
  });
});

describe("placeholderStep (placeholders never flash or blink, #365)", () => {
  const run = (...events: Parameters<typeof placeholderStep>[1][]) =>
    events.reduce<PlaceholderPhase>((phase, event) => placeholderStep(phase, event), "idle");

  it("goes straight to the content when it arrives before the placeholders show", () => {
    expect(run("load-start", "load-end")).toBe("idle");
  });

  it("keeps placeholders that came on screen until their minimum is over", () => {
    expect(run("load-start", "delay-over", "load-end")).toBe("shown");
    expect(run("load-start", "delay-over", "load-end", "minimum-over")).toBe("done");
  });

  it("lets content that arrives after the minimum show at once", () => {
    expect(run("load-start", "delay-over", "minimum-over", "load-end")).toBe("idle");
  });

  it("starts over for the next load", () => {
    expect(run("load-start", "delay-over", "load-end", "minimum-over", "load-start")).toBe("waiting");
  });

  it("ignores a timer that ends after the load it was for", () => {
    expect(run("load-start", "load-end", "delay-over")).toBe("idle");
    expect(run("minimum-over")).toBe("idle");
  });
});

describe("prefersReducedMotion", () => {
  it("is false on the server", () => {
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("countUpValue (CountUp)", () => {
  it("starts on the old number", () => {
    expect(countUpValue(10, 50, 0)).toBe(10);
    expect(countUpValue(10, 50, -1)).toBe(10);
  });

  it("ends exactly on the new number", () => {
    expect(countUpValue(10, 50, 1)).toBe(50);
    expect(countUpValue(0, 12.35, 1)).toBe(12.35);
    expect(countUpValue(10, 50, 2)).toBe(50);
  });

  it("ends on the new number at once when the duration is zero (reduced motion)", () => {
    // CountUp's progress is elapsed / duration: with a zero duration that is not a number below 1
    expect(countUpValue(10, 50, 0 / motionDuration(400, true))).toBe(50);
    expect(countUpValue(10, 50, 16 / motionDuration(400, true))).toBe(50);
  });

  it("moves fast first, then settles, without overshooting", () => {
    const half = countUpValue(0, 100, 0.5);
    expect(half).toBeGreaterThan(50);
    expect(half).toBeLessThan(100);
    expect(countUpValue(0, 100, 0.9)).toBeGreaterThan(half);
  });

  it("counts down too", () => {
    const half = countUpValue(100, 0, 0.5);
    expect(half).toBeLessThan(50);
    expect(half).toBeGreaterThan(0);
    expect(countUpValue(100, 0, 1)).toBe(0);
  });
});

describe("firstNumber", () => {
  it("reads prices, counts and negative numbers", () => {
    expect(firstNumber("$1,250.50")).toBe(1250.5);
    expect(firstNumber("Showing 2 of 6")).toBe(2);
    expect(firstNumber("-3")).toBe(-3);
    expect(firstNumber("12")).toBe(12);
  });

  it("is null without a number", () => {
    expect(firstNumber("Save draft")).toBeNull();
    expect(firstNumber("")).toBeNull();
  });
});

describe("rollDirection (RollingNumber)", () => {
  it("rolls up when the value grows", () => {
    expect(rollDirection("2", "3")).toBe("up");
    expect(rollDirection("24.00", "36.00")).toBe("up");
    expect(rollDirection("9", "10")).toBe("up");
  });

  it("rolls down when the value shrinks", () => {
    expect(rollDirection("3", "2")).toBe("down");
    expect(rollDirection("Showing 6 of 6", "Showing 2 of 6")).toBe("down");
    expect(rollDirection("10", "9")).toBe("down");
  });

  it("rolls up for text without numbers and for unchanged numbers", () => {
    expect(rollDirection("Save draft", "Draft saved")).toBe("up");
    expect(rollDirection("5", "5")).toBe("up");
  });
});

describe("flapCells (FlapText)", () => {
  const text = (from: string, to: string) => flapCells(from, to).map((cell) => cell.char).join("");
  const changed = (from: string, to: string) => flapCells(from, to).map((cell) => (cell.changed ? "x" : "."));

  it("always ends on the new text", () => {
    expect(text("22.00", "25.00")).toBe("25.00");
    expect(text("9.00", "12.00")).toBe("12.00");
    expect(text("120.00", "95.00")).toBe("95.00");
    expect(text("", "LIVE")).toBe("LIVE");
    expect(text("SOLD OUT", "")).toBe("");
  });

  it("flips only the characters that changed", () => {
    expect(changed("22.00", "25.00").join("")).toBe(".x...");
    expect(changed("22.00", "22.00").join("")).toBe(".....");
  });

  it("lines texts up on the right, like prices", () => {
    // 9.00 → 12.00: the new "1" and the "2" flip, ".00" stays
    expect(changed("9.00", "12.00").join("")).toBe("xx...");
    expect(flapCells("9.00", "12.00")[0]).toEqual({ char: "1", was: "", changed: true });
    expect(flapCells("9.00", "12.00")[1]).toEqual({ char: "2", was: "9", changed: true });
    // 120.00 → 95.00: the leading "1" is dropped
    expect(changed("120.00", "95.00").join("")).toBe("xx...");
  });

  it("flips every cell when the text arrives for the first time", () => {
    expect(changed("", "1,204").join("")).toBe("xxxxx");
  });
});

describe("dotGlow (DotField)", () => {
  it("is brightest under the pointer and fades to nothing 4.5 cells away", () => {
    expect(dotGlow(0, 0)).toBeCloseTo(0.85);
    expect(dotGlow(1, 1)).toBeGreaterThan(0);
    expect(dotGlow(1, 1)).toBeLessThan(dotGlow(0, 1));
    expect(dotGlow(4.5, 0)).toBe(0);
    expect(dotGlow(10, 10)).toBe(0);
  });

  it("is a diamond: the same along the grid in every direction", () => {
    expect(dotGlow(2, 1)).toBeCloseTo(dotGlow(-1, -2));
    expect(dotGlow(3, 0)).toBeCloseTo(dotGlow(0, -3));
    // a corner 3 cells away diagonally is further along the grid (6 cells) than 3 cells straight
    expect(dotGlow(3, 3)).toBe(0);
  });
});

describe("dotWave (DotField)", () => {
  it("lights the ring where the wave is, and nothing far from it", () => {
    expect(dotWave(12, 0.5)).toBeCloseTo(1 - 0.5 / 1.2); // the ring is 12 cells out after half a second
    expect(dotWave(2, 0.5)).toBe(0);
    expect(dotWave(30, 0.5)).toBe(0);
  });

  it("fades out as it travels and is gone after 1.2 s", () => {
    expect(dotWave(2.4, 0.1)).toBeGreaterThan(dotWave(24, 1));
    expect(dotWave(28.8, 1.2)).toBe(0);
    expect(dotWave(31.2, 1.3)).toBe(0);
  });

  it("is nothing before the click", () => {
    expect(dotWave(0, -0.1)).toBe(0);
  });
});
