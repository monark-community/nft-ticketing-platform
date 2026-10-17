import { QR_MAX_AGE_SECONDS } from "@/lib/ticket-qr";
import { describe, expect, it } from "vitest";

// Checks that Vitest runs and that the "@/" import alias resolves in tests (#268).
describe("test setup", () => {
  it('resolves the "@/" import alias', () => {
    expect(QR_MAX_AGE_SECONDS).toBe(60);
  });
});
