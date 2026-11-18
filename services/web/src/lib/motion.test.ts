import { describe, expect, it } from "vitest";

import { countUpValue, firstNumber, flapCells, motionDuration, prefersReducedMotion, rollDirection } from "./motion";

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
