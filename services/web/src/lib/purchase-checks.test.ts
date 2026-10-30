import { describe, expect, it } from "vitest";
import {
  estimatePurchaseGas,
  getBlockMessage,
  getMaxQuantity,
  getPurchaseBlock,
  type PurchaseCheckInput,
} from "@/lib/purchase-checks";

// Every reason a purchase is blocked, in the order the page checks them (#149).

const usdc = (amount: number) => BigInt(Math.round(amount * 1_000_000));
const NOW = 1_800_000_000;

// A wallet that can buy 2 General Admission tickets for 30 USDC
const ok: PurchaseCheckInput = {
  configured: true,
  saleActive: true,
  endTime: NOW + 86_400,
  now: NOW,
  tierName: "General Admission",
  remaining: 160,
  quantity: 2,
  isConnected: true,
  onContractChain: true,
  signedIn: true,
  profileComplete: true,
  presaleActive: false,
  whitelisted: false,
  perWalletLimit: 4,
  held: 0,
  total: usdc(30),
  usdcBalance: usdc(1000),
  ethBalance: BigInt(10) ** BigInt(18),
  ethNeeded: BigInt(500_000_000_000_000),
};

describe("getPurchaseBlock", () => {
  it("allows a purchase that passes every check", () => {
    expect(getPurchaseBlock(ok)).toBeNull();
  });

  it.each<[string, Partial<PurchaseCheckInput>, string]>([
    ["the event is not on-chain yet", { configured: false }, "notOnSale"],
    ["sales are not open", { saleActive: false }, "saleNotActive"],
    ["the event has ended", { endTime: NOW }, "saleEnded"],
    ["the type is sold out", { remaining: 0 }, "soldOut"],
    ["the quantity is more than what's left", { remaining: 1 }, "notEnoughLeft"],
    ["no wallet is connected", { isConnected: false }, "notConnected"],
    ["the wallet is on another network", { onContractChain: false }, "wrongNetwork"],
    ["the wallet isn't signed in", { signedIn: false }, "notSignedIn"],
    ["the account has no name or email yet", { profileComplete: false }, "profileIncomplete"],
    ["presale is on and the wallet is not on the guest list", { presaleActive: true }, "notOnGuestList"],
    ["the purchase goes over the wallet limit", { held: 3 }, "walletLimit"],
    ["the wallet doesn't have enough USDC", { usdcBalance: usdc(12.4) }, "notEnoughUsdc"],
    ["the wallet can't pay the network fee", { ethBalance: BigInt(1) }, "notEnoughEth"],
  ])("blocks when %s", (_name, change, reason) => {
    expect(getPurchaseBlock({ ...ok, ...change })?.reason).toBe(reason);
  });

  it("lets a guest-list wallet buy during presale", () => {
    expect(getPurchaseBlock({ ...ok, presaleActive: true, whitelisted: true })).toBeNull();
  });

  it("ignores the wallet limit when the event has none", () => {
    expect(getPurchaseBlock({ ...ok, perWalletLimit: 0, held: 50 })).toBeNull();
  });

  it("asks to connect before asking to sign in", () => {
    expect(getPurchaseBlock({ ...ok, isConnected: false, signedIn: false })?.reason).toBe("notConnected");
  });

  it("shows event-wide reasons before asking for a wallet", () => {
    expect(getPurchaseBlock({ ...ok, remaining: 0, isConnected: false })?.reason).toBe("soldOut");
  });
});

describe("getMaxQuantity", () => {
  it("is limited by what's left", () => {
    expect(getMaxQuantity({ remaining: 3, perWalletLimit: 0, held: 0 })).toBe(3);
  });

  it("is limited by the wallet limit minus tickets already held", () => {
    expect(getMaxQuantity({ remaining: 160, perWalletLimit: 4, held: 1 })).toBe(3);
  });

  it("is limited by the contract's 100 per purchase", () => {
    expect(getMaxQuantity({ remaining: 1000, perWalletLimit: 0, held: 0 })).toBe(100);
  });

  it("never goes below 1", () => {
    expect(getMaxQuantity({ remaining: 0, perWalletLimit: 4, held: 4 })).toBe(1);
  });
});

describe("estimatePurchaseGas", () => {
  it("adds the approve step only when it's needed", () => {
    expect(estimatePurchaseGas(2, true) - estimatePurchaseGas(2, false)).toBe(BigInt(60_000));
  });

  it("grows with the quantity", () => {
    expect(estimatePurchaseGas(4, false)).toBeGreaterThan(estimatePurchaseGas(1, false));
  });
});

describe("getBlockMessage", () => {
  const options = { usdcDecimals: 6, chainName: "Sepolia" };

  it("gives the USDC shortfall, like the Figma frame", () => {
    const block = getPurchaseBlock({ ...ok, usdcBalance: usdc(12.4) })!;
    expect(getBlockMessage(block, options)).toEqual({
      tone: "warning",
      title: "Not enough USDC",
      message: "This order costs 30.00 USDC and your wallet has 12.40 USDC. Add 17.60 USDC or lower the quantity.",
    });
  });

  it("says how many more tickets the wallet may buy", () => {
    const block = getPurchaseBlock({ ...ok, quantity: 3, held: 2 })!;
    expect(getBlockMessage(block, options).message).toBe(
      "You can hold up to 4 tickets for this event, and you already have 2. Lower the quantity to 2 or fewer.",
    );
  });

  it("names the network to switch to", () => {
    expect(getBlockMessage({ reason: "wrongNetwork" }, options).message).toBe("Switch your wallet to Sepolia to buy tickets.");
  });

  it("names the sold-out ticket type", () => {
    expect(getBlockMessage({ reason: "soldOut", tierName: "Early Bird" }, options).title).toBe("Early Bird is sold out");
  });
});
