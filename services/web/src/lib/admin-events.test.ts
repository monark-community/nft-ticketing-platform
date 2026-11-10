import { ContractFunctionExecutionError, ContractFunctionRevertedError, encodeErrorResult, type Abi } from "viem";
import { describe, expect, it } from "vitest";

import {
  adminEventsPath,
  adminEventStatus,
  canEditSettings,
  formToSettings,
  getSettingsErrorMessage,
  hasSettings,
  pageCount,
  resaleCapChoices,
  resaleCapText,
  royaltyText,
  sameSettings,
  SETTINGS_ERRORS,
  settingsArgs,
  settingsFromChain,
  settingsToForm,
  soldSummary,
  validateSettings,
  withSettings,
  type AdminEvent,
  type EventSettings,
} from "@/lib/admin-events";
import { fromLocalInput, localInputFromMs } from "@/lib/create-event";

// Admin Events tab (#296)

const event: AdminEvent = {
  id: "event-1",
  title: "Elevate Summit 2027",
  location: "Shaw Centre, Ottawa, ON",
  status: "PUBLISHED",
  sale_active: true,
  presale_active: false,
  contract_event_id: "7",
  start_date: "2027-04-17T22:00:00.000Z",
  end_date: null,
  organizer: { wallet: "0x9c3f000000000000000000000000000000005d14", first_name: "David", last_name: "Kalu", nickname: null, organization_name: null },
  sold: 1195,
  supply: 1450,
  royalty_bps: 800,
  resale_cap_bps: 15000,
  per_wallet_limit: 4,
  sales_end_at: "2027-04-16T22:00:00.000Z",
};

// The 30 seconds are what the date input can't show
const SALES_END_SEC = Date.UTC(2027, 3, 16, 22, 0, 30) / 1000;
const current: EventSettings = { royaltyBps: 800, resaleCapBps: 15000, perWalletLimit: 4, salesEndSec: SALES_END_SEC };
const NOW = Date.UTC(2026, 10, 10);

describe("adminEventsPath", () => {
  it("asks for the first page by default", () => {
    expect(adminEventsPath()).toBe("/api/admin/events?page=1&limit=20");
  });

  it("adds the search, the status filter and the page", () => {
    expect(adminEventsPath({ q: "  sophie martin ", status: "live", page: 3 })).toBe("/api/admin/events?page=3&limit=20&q=sophie+martin&live=true");
    expect(adminEventsPath({ status: "draft" })).toBe("/api/admin/events?page=1&limit=20&live=false");
    expect(adminEventsPath({ q: "   ", status: "all", limit: 1 })).toBe("/api/admin/events?page=1&limit=1");
  });

  it("encodes what the admin typed", () => {
    expect(adminEventsPath({ q: "50% & more" })).toBe("/api/admin/events?page=1&limit=20&q=50%25+%26+more");
  });
});

describe("pageCount", () => {
  it("is at least one page", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(20)).toBe(1);
    expect(pageCount(21)).toBe(2);
    expect(pageCount(42)).toBe(3);
  });
});

describe("adminEventStatus and canEditSettings", () => {
  it("shows a live event as Published, or Presale while its presale is on", () => {
    expect(adminEventStatus(event)).toEqual({ label: "Published", tone: "success" });
    expect(adminEventStatus({ ...event, presale_active: true })).toEqual({ label: "Presale", tone: "highlight" });
  });

  it("shows events that aren't on the contract yet as drafts", () => {
    expect(adminEventStatus({ status: "DRAFT", presale_active: false }).label).toBe("Draft");
    expect(adminEventStatus({ status: "FROZEN", presale_active: true }).label).toBe("Draft");
  });

  it("only lets live events be edited, also after their sales", () => {
    expect(canEditSettings(event)).toBe(true);
    const afterSales: AdminEvent = { ...event, sale_active: false, sales_end_at: "2020-01-01T00:00:00.000Z" };
    expect(canEditSettings(afterSales)).toBe(true);
    expect(canEditSettings({ status: "DRAFT", contract_event_id: null })).toBe(false);
    expect(canEditSettings({ status: "FROZEN", contract_event_id: null })).toBe(false);
    expect(canEditSettings({ status: "PUBLISHED", contract_event_id: null })).toBe(false);
  });
});

describe("list cells", () => {
  it("sums up the sales", () => {
    expect(soldSummary(event)).toEqual({ text: "1,195 of 1,450", percent: 82 });
    expect(soldSummary({ sold: 0, supply: 300 })).toEqual({ text: "0 of 300", percent: 0 });
    expect(soldSummary({ sold: 0, supply: 0 })).toEqual({ text: "0 of 0", percent: 0 });
    expect(soldSummary({ sold: 12, supply: 10 }).percent).toBe(100);
  });

  it("formats the royalty and the resale cap", () => {
    expect(royaltyText(1000)).toBe("10%");
    expect(royaltyText(750)).toBe("7.5%");
    expect(royaltyText(0)).toBe("0%");
    expect(royaltyText(null)).toBe("—");
    expect(resaleCapText(20000)).toBe("2×");
    expect(resaleCapText(15000)).toBe("1.5×");
    expect(resaleCapText(0)).toBe("No cap");
    expect(resaleCapText(null)).toBe("—");
  });
});

describe("settingsFromChain", () => {
  it("reads eventConfigs() and the royalty", () => {
    const config = [BigInt(SALES_END_SEC), BigInt(15000), BigInt(2), BigInt(1195), true, true, BigInt(4)] as const;
    expect(settingsFromChain(config, BigInt(800))).toEqual(current);
  });

  it("is null for an event that isn't configured on the contract", () => {
    const config = [BigInt(0), BigInt(0), BigInt(0), BigInt(0), false, false, BigInt(0)] as const;
    expect(settingsFromChain(config, BigInt(0))).toBeNull();
  });
});

describe("the settings form", () => {
  it("starts from the current settings", () => {
    const form = settingsToForm(current);
    expect(form).toMatchObject({ royaltyPercent: "8", resaleCapBps: 15000, perWalletLimit: "4" });
    expect(fromLocalInput(form.salesEnd)).toBe((SALES_END_SEC - 30) * 1000); // same minute, without the seconds
    expect(settingsToForm({ ...current, royaltyBps: 750 }).royaltyPercent).toBe("7.5");
    expect(settingsToForm({ ...current, royaltyBps: 0, perWalletLimit: 0 })).toMatchObject({ royaltyPercent: "0", perWalletLimit: "0" });
  });

  it("is unchanged when nothing was touched, down to the sales end's seconds", () => {
    const next = formToSettings(settingsToForm(current), current);
    expect(next).toEqual(current);
    expect(sameSettings(next!, current)).toBe(true);
  });

  it("turns the form into the values to send", () => {
    const form = { royaltyPercent: " 12.5 ", resaleCapBps: 0, perWalletLimit: "0", salesEnd: localInputFromMs(Date.UTC(2027, 5, 1, 18, 0)) };
    const next = formToSettings(form, current);
    expect(next).toEqual({ royaltyBps: 1250, resaleCapBps: 0, perWalletLimit: 0, salesEndSec: Date.UTC(2027, 5, 1, 18, 0) / 1000 });
    expect(sameSettings(next!, current)).toBe(false);
    expect(sameSettings({ ...current, royaltyBps: 801 }, current)).toBe(false);
  });

  it("has no values to send while a field is invalid", () => {
    const form = settingsToForm(current);
    expect(formToSettings({ ...form, royaltyPercent: "ten" }, current)).toBeNull();
    expect(formToSettings({ ...form, perWalletLimit: "" }, current)).toBeNull();
    expect(formToSettings({ ...form, salesEnd: "" }, current)).toBeNull();
  });

  it("accepts valid settings", () => {
    expect(validateSettings(settingsToForm(current), NOW)).toEqual({});
    expect(validateSettings({ ...settingsToForm(current), royaltyPercent: "100", resaleCapBps: 0, perWalletLimit: "0" }, NOW)).toEqual({});
  });

  it("applies the contract's rules", () => {
    const form = settingsToForm(current);
    expect(validateSettings({ ...form, royaltyPercent: "100.01" }, NOW).royaltyPercent).toBeDefined();
    expect(validateSettings({ ...form, royaltyPercent: "-1" }, NOW).royaltyPercent).toBeDefined();
    expect(validateSettings({ ...form, royaltyPercent: "" }, NOW).royaltyPercent).toBeDefined();
    expect(validateSettings({ ...form, resaleCapBps: 5000 }, NOW).resaleCapBps).toBeDefined();
    expect(validateSettings({ ...form, perWalletLimit: "1.5" }, NOW).perWalletLimit).toBeDefined();
    expect(validateSettings({ ...form, perWalletLimit: "10001" }, NOW).perWalletLimit).toBeDefined();
    expect(validateSettings({ ...form, salesEnd: "" }, NOW).salesEnd).toBe("Choose when ticket sales end.");
  });

  it("needs a sales end in the future, also when it wasn't touched", () => {
    const ended = { ...current, salesEndSec: Math.floor(NOW / 1000) - 3600 };
    expect(validateSettings(settingsToForm(ended), NOW).salesEnd).toBe("Sales must end in the future.");
    expect(validateSettings({ ...settingsToForm(ended), salesEnd: localInputFromMs(NOW) }, NOW).salesEnd).toBeDefined();
    expect(validateSettings({ ...settingsToForm(ended), salesEnd: localInputFromMs(NOW + 60_000) }, NOW).salesEnd).toBeUndefined();
  });

  it("offers the usual caps, plus the event's own when it is another value", () => {
    expect(resaleCapChoices(20000).map((c) => c.bps)).toEqual([0, 10000, 15000, 20000, 30000]);
    const custom = resaleCapChoices(12500);
    expect(custom.map((c) => c.bps)).toEqual([0, 10000, 12500, 15000, 20000, 30000]);
    expect(custom[2].label).toBe("1.25× face value");
  });

  it("builds the adminUpdateEventSettings() arguments in the contract's order", () => {
    // eventId, endTime, royaltyBps, resaleCapBps, perWalletLimit
    expect(settingsArgs("7", current)).toEqual([BigInt(7), BigInt(SALES_END_SEC), BigInt(800), BigInt(15000), BigInt(4)]);
  });
});

describe("showing saved settings before the API has them", () => {
  const next: EventSettings = { royaltyBps: 500, resaleCapBps: 0, perWalletLimit: 0, salesEndSec: SALES_END_SEC };

  it("puts the new settings on the row", () => {
    expect(withSettings(event, next)).toMatchObject({
      id: "event-1",
      sold: 1195,
      royalty_bps: 500,
      resale_cap_bps: 0,
      per_wallet_limit: 0,
      sales_end_at: "2027-04-16T22:00:30.000Z",
    });
  });

  it("knows when the API has caught up", () => {
    expect(hasSettings(event, next)).toBe(false);
    expect(hasSettings(withSettings(event, next), next)).toBe(true);
    expect(hasSettings({ ...withSettings(event, next), sales_end_at: null }, next)).toBe(false);
  });
});

describe("getSettingsErrorMessage", () => {
  const abi = [
    { type: "error", name: "Error", inputs: [{ name: "message", type: "string" }] },
    {
      type: "error",
      name: "AccessControlUnauthorizedAccount",
      inputs: [
        { name: "account", type: "address" },
        { name: "neededRole", type: "bytes32" },
      ],
    },
  ] as const satisfies Abi;

  function revert(data: `0x${string}`) {
    return new ContractFunctionExecutionError(new ContractFunctionRevertedError({ abi, data, functionName: "adminUpdateEventSettings" }), {
      abi,
      functionName: "adminUpdateEventSettings",
      args: [],
    });
  }
  const reason = (message: string) => revert(encodeErrorResult({ abi, errorName: "Error", args: [message] }));

  it("maps the contract's reasons", () => {
    expect(getSettingsErrorMessage(reason("End time must be in the future"))).toBe(SETTINGS_ERRORS.endTime);
    expect(getSettingsErrorMessage(reason("Royalty cannot exceed 100%"))).toBe(SETTINGS_ERRORS.royalty);
    expect(getSettingsErrorMessage(reason("Resale cap must be 0 or at least 100% of face value"))).toBe(SETTINGS_ERRORS.resaleCap);
    expect(getSettingsErrorMessage(reason("Event not configured"))).toBe(SETTINGS_ERRORS.notConfigured);
  });

  it("explains a wallet without the admin role", () => {
    const data = encodeErrorResult({
      abi,
      errorName: "AccessControlUnauthorizedAccount",
      args: ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8", `0x${"00".repeat(32)}`],
    });
    expect(getSettingsErrorMessage(revert(data))).toBe(SETTINGS_ERRORS.notAdmin);
  });
});
