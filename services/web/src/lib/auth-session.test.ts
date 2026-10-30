import { describe, expect, it } from "vitest";

import { isSessionForWallet } from "./auth-session";

const A = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955";
const B = "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f";

describe("isSessionForWallet", () => {
  it("accepts the connected wallet's session, ignoring address case", () => {
    expect(isSessionForWallet({ wallet_address: A.toLowerCase() }, A)).toBe(true);
  });

  it("rejects a session left over from the previous wallet", () => {
    expect(isSessionForWallet({ wallet_address: A.toLowerCase() }, B)).toBe(false);
  });

  it("rejects when there is no session or no wallet", () => {
    expect(isSessionForWallet(null, A)).toBe(false);
    expect(isSessionForWallet({ wallet_address: A.toLowerCase() }, undefined)).toBe(false);
  });
});
