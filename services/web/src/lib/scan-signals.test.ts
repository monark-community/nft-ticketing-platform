import { describe, expect, it } from "vitest";

import { signalFor, soundOnFrom, TONES, VIBRATION } from "./scan-signals";

describe("signalFor", () => {
  it("beeps for a valid ticket and a confirmed check-in, buzzes for Do not admit, and is quiet in between", () => {
    expect(signalFor("valid")).toBe("ok");
    expect(signalFor("checkedIn")).toBe("ok");
    expect(signalFor("rejected")).toBe("bad");
    for (const view of ["checkingIn", "pending", "failed"] as const) expect(signalFor(view)).toBeNull();
  });
});

describe("TONES and VIBRATION", () => {
  it("ok is a short rising double beep, bad a low double buzz", () => {
    const [first, second] = TONES.ok;
    expect(TONES.ok).toHaveLength(2);
    expect(second.hz).toBeGreaterThan(first.hz);
    expect(second.atMs).toBeGreaterThanOrEqual(first.atMs + first.ms);
    expect(TONES.bad).toHaveLength(2);
    expect(Math.max(...TONES.bad.map((t) => t.hz))).toBeLessThan(Math.min(...TONES.ok.map((t) => t.hz)) / 4);
  });

  it("ok vibrates once briefly, bad twice for longer", () => {
    expect(VIBRATION.ok).toBeLessThan(100);
    expect(VIBRATION.bad).toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
    expect((VIBRATION.bad as number[])[0]).toBeGreaterThan(VIBRATION.ok as number);
  });
});

describe("soundOnFrom", () => {
  it("is on unless turned off on this device", () => {
    expect(soundOnFrom(null)).toBe(true);
    expect(soundOnFrom("on")).toBe(true);
    expect(soundOnFrom("off")).toBe(false);
  });
});
