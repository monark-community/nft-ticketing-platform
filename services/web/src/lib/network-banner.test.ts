import { describe, expect, it } from "vitest";

import { nextBannerState } from "./network-banner";

describe("nextBannerState", () => {
  it("shows the banner when a connected wallet is on another network", () => {
    expect(nextBannerState("hidden", true, true)).toBe("wrong");
    expect(nextBannerState("switched", true, true)).toBe("wrong");
  });

  it("turns green after switching back to a supported network", () => {
    expect(nextBannerState("wrong", false, true)).toBe("switched");
  });

  it("just goes away when the wallet disconnects", () => {
    expect(nextBannerState("wrong", false, false)).toBe("hidden");
    expect(nextBannerState("switched", false, false)).toBe("hidden");
  });

  it("stays hidden, or green until its timer ends, on a supported network", () => {
    expect(nextBannerState("hidden", false, true)).toBe("hidden");
    expect(nextBannerState("switched", false, true)).toBe("switched");
  });
});
