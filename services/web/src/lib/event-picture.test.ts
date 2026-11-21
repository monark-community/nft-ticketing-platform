import { describe, expect, it } from "vitest";

import {
  clearTakeoff,
  eventPictureName,
  forgetListPosition,
  listPositionOf,
  pendingTakeoff,
  recordTakeoff,
  rememberedEventPicture,
  rememberEventPicture,
  rememberListPosition,
  type PictureTakeoff,
} from "./event-picture";

describe("eventPictureName", () => {
  it("is the same for a card and its event page", () => {
    expect(eventPictureName("event-1")).toBe("event-picture-event-1");
    expect(eventPictureName("3f2b9c1e-7a4d-4e0b-9a51-0c2d5e6f7a8b")).toBe("event-picture-3f2b9c1e-7a4d-4e0b-9a51-0c2d5e6f7a8b");
  });

  it("only keeps characters that are safe in a CSS name", () => {
    expect(eventPictureName("a b/c.d")).toBe("event-picture-a-b-c-d");
  });
});

describe("rememberEventPicture", () => {
  it("gives back the picture of a card that was clicked", () => {
    rememberEventPicture("gala", "ipfs://cover");
    expect(rememberedEventPicture("gala")).toBe("ipfs://cover");
  });

  it("tells an event without a picture (null) from one that was never clicked (undefined)", () => {
    rememberEventPicture("no-picture", null);
    expect(rememberedEventPicture("no-picture")).toBeNull();
    expect(rememberedEventPicture("never-clicked")).toBeUndefined();
  });

  it("drops the oldest once it holds 200", () => {
    rememberEventPicture("first", "a");
    for (let i = 0; i < 199; i++) rememberEventPicture(`filler-${i}`, null);
    expect(rememberedEventPicture("first")).toBe("a");
    rememberEventPicture("first", "a"); // clicked again: it's the newest now
    rememberEventPicture("one-more", null);
    expect(rememberedEventPicture("first")).toBe("a");
    expect(rememberedEventPicture("filler-0")).toBeUndefined();
  });
});

describe("pendingTakeoff", () => {
  const takeoff = (eventId: string, at: number): PictureTakeoff => ({
    eventId,
    rect: { left: 16, top: 300, width: 400, height: 225 },
    zoom: 1.03,
    shades: { card: 1, hero: 0 },
    at,
  });

  it("gives the takeoff to the same event's picture on the next page", () => {
    const gala = takeoff("gala", 1000);
    recordTakeoff(gala);
    expect(pendingTakeoff("gala", 1300)).toBe(gala);
    expect(pendingTakeoff("jazz", 1300)).toBeNull();
  });

  it("is used up once the picture has landed, and only by the takeoff that landed", () => {
    const first = takeoff("gala", 1000);
    const second = takeoff("gala", 5000);
    recordTakeoff(first);
    recordTakeoff(second);
    clearTakeoff(first); // an older flight landing late doesn't clear the newer one
    expect(pendingTakeoff("gala", 5100)).toBe(second);
    clearTakeoff(second);
    expect(pendingTakeoff("gala", 5100)).toBeNull();
  });

  it("is stale after 2 seconds, when the page change never happened", () => {
    recordTakeoff(takeoff("gala", 1000));
    expect(pendingTakeoff("gala", 2900)).not.toBeNull();
    expect(pendingTakeoff("gala", 3100)).toBeNull();
  });
});

describe("listPositionOf", () => {
  it("gives the events list's scroll position back to the event opened from it", () => {
    rememberListPosition("jazz", 640);
    expect(listPositionOf("jazz")).toBe(640);
    expect(listPositionOf("gala")).toBeNull();
    rememberListPosition("gala", 0); // the last event opened replaces it
    expect(listPositionOf("jazz")).toBeNull();
    expect(listPositionOf("gala")).toBe(0);
    forgetListPosition();
    expect(listPositionOf("gala")).toBeNull();
  });
});
