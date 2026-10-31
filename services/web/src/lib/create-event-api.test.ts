import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient, ApiError } from "@/lib/api";
import { localInputFromMs, newTicketType, ticketTypeFromApi, type DetailsForm } from "@/lib/create-event";
import { describeSaveError, fetchDraft, freezeDraft, publishDraft, saveDetails, syncTicketTypes } from "@/lib/create-event-api";
import type { ApiTicketType } from "@/lib/event-details";

// API calls of the create event flow (#187, #193), with a fake request function.

const details: DetailsForm = {
  title: "Gala",
  description: "",
  category: "Concerts",
  location: "NAC",
  start: localInputFromMs(Date.now() + 86_400_000),
  end: "",
};

function fakeRequest(responses: Record<string, unknown> = {}) {
  const calls: Array<{ path: string; method: string; data?: unknown; body?: unknown }> = [];
  const request = vi.fn(async (path: string, options: { method?: string; data?: unknown; body?: unknown } = {}) => {
    const method = options.method ?? "GET";
    calls.push({ path, method, data: options.data, body: options.body });
    const key = `${method} ${path}`;
    const response = responses[key];
    if (response instanceof Error) throw response;
    return response ?? { id: `created-${calls.length}` };
  });
  return { request: request as never, calls };
}

describe("saveDetails", () => {
  it("creates a draft, leaving out an empty end date", async () => {
    const { request, calls } = fakeRequest({ "POST /api/events": { id: "e1" } });
    expect(await saveDetails(null, details, request)).toBe("e1");
    expect(calls[0].data).not.toHaveProperty("end_date");
  });

  it("updates an existing draft and clears a removed end date", async () => {
    const { request, calls } = fakeRequest();
    expect(await saveDetails("e1", details, request)).toBe("e1");
    expect(calls[0]).toMatchObject({ path: "/api/events/e1", method: "PUT" });
    expect((calls[0].data as { end_date: unknown }).end_date).toBeNull();
  });
});

describe("syncTicketTypes", () => {
  const saved: ApiTicketType[] = [
    { id: "a", event_id: "e1", name: "GA", description: null, price: "15.00000000", supply: 100, sold: 0, created_at: "2026-01-01T00:00:00Z" },
    { id: "b", event_id: "e1", name: "VIP", description: null, price: "30.00000000", supply: 10, sold: 0, created_at: "2026-01-01T00:00:01Z" },
  ];

  it("deletes, then updates, then creates in order, and returns the new ids", async () => {
    const first = { ...newTicketType("Balcony"), price: "20", supply: "50" };
    const second = { ...newTicketType("Box"), price: "40", supply: "5" };
    const { request, calls } = fakeRequest({
      [`POST /api/events/e1/ticket-types`]: { id: "new" },
    });
    const ga = { ...ticketTypeFromApi(saved[0]), supply: "120" };

    const result = await syncTicketTypes("e1", [ga, first, second], saved, request);
    expect(result.error).toBeNull();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "DELETE /api/ticket-types/b",
      "PUT /api/ticket-types/a",
      "POST /api/events/e1/ticket-types",
      "POST /api/events/e1/ticket-types",
    ]);
    expect(calls[2].data).toMatchObject({ name: "Balcony" });
    expect(calls[3].data).toMatchObject({ name: "Box" });
    expect(result.types.map((t) => t.id)).toEqual(["a", "new", "new"]);
  });

  it("stops at the first failure and keeps the ids of rows already created", async () => {
    const first = { ...newTicketType("Balcony"), price: "20", supply: "50" };
    const second = { ...newTicketType("Box"), price: "40", supply: "5" };
    let posts = 0;
    const request = vi.fn(async (path: string, options: { method?: string } = {}) => {
      if (options.method === "POST") {
        posts += 1;
        if (posts === 2) throw new Error("Failed to create ticket type");
        return { id: "created-balcony" };
      }
      return {};
    });

    const result = await syncTicketTypes("e1", [first, second], [], request as never);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.types.map((t) => t.id)).toEqual(["created-balcony", null]);

    // Retrying only creates the one that failed
    const retry = fakeRequest();
    const savedNow: ApiTicketType[] = [{ ...saved[0], id: "created-balcony", name: "Balcony", price: "20", supply: 50 }];
    await syncTicketTypes("e1", result.types, savedNow, retry.request);
    expect(retry.calls.map((c) => `${c.method} ${(c.data as { name?: string } | undefined)?.name ?? ""}`)).toEqual(["POST Box"]);
  });
});

describe("fetchDraft", () => {
  it("sorts ticket types by creation order (the on-chain type order)", async () => {
    const { request } = fakeRequest({
      "GET /api/events/e1": {
        id: "e1",
        ticket_types: [
          { id: "late", created_at: "2026-01-01T00:00:02Z" },
          { id: "early", created_at: "2026-01-01T00:00:01Z" },
        ],
      },
    });
    const event = await fetchDraft("e1", request);
    expect(event.ticket_types.map((t) => t.id)).toEqual(["early", "late"]);
  });
});

describe("freeze and publish", () => {
  it("uploads the image as multipart form data", async () => {
    const { request, calls } = fakeRequest();
    const file = new File([new Uint8Array([1, 2, 3])], "cover.png", { type: "image/png" });
    await freezeDraft("e1", file, request);
    expect(calls[0]).toMatchObject({ path: "/api/events/e1/freeze", method: "POST" });
    expect((calls[0].body as FormData).get("image")).toBeInstanceOf(File);
  });

  it("sends the on-chain event ID as a string", async () => {
    const { request, calls } = fakeRequest();
    await publishDraft("e1", BigInt("281474976710655"), request);
    expect(calls[0].data).toEqual({ contract_event_id: "281474976710655" });
  });
});

describe("describeSaveError", () => {
  it("turns API errors into next steps", () => {
    expect(describeSaveError(new Error("Forbidden: requires one of [ORGANIZER]"))).toMatch(/sign in again/);
    expect(describeSaveError(new Error("Not your event"))).toMatch(/can't edit/);
    expect(describeSaveError(new Error("Event is frozen and cannot be edited"))).toMatch(/frozen/);
    expect(describeSaveError(new Error("Email required to complete account setup"))).toMatch(/email/);
    expect(describeSaveError(new Error("Unauthorized: invalid or expired token"))).toMatch(/session expired/);
    expect(describeSaveError(new Error("title must be a non-empty string"))).toMatch(/rejected a field/);
    expect(describeSaveError(new TypeError("Failed to fetch"))).toMatch(/connection/);
  });
});

describe("apiClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lets the browser set the multipart Content-Type for FormData", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await apiClient("/x", { method: "POST", body: new FormData() });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).not.toHaveProperty("Content-Type");

    await apiClient("/x", { method: "POST", data: { a: 1 } });
    const json = (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect(json.headers).toHaveProperty("Content-Type", "application/json");
  });

  it("returns nothing for 204 No Content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    await expect(apiClient("/x", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("keeps the API's error text and adds the status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Event not found" }), { status: 404 })));
    const err = (await apiClient("/x").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Event not found");
    expect(err.status).toBe(404);
  });
});
