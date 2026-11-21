// The picture of an event card grows into the event page's hero, and shrinks back (#363).
// Kept free of React so it can be tested.

/** The name the card's picture and the hero's picture share, so the browser can morph one into the other */
export function eventPictureName(id: string) {
  // Only letters, digits, - and _ are safe in a view-transition-name
  return `event-picture-${id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

const MAX_REMEMBERED = 200;
const remembered = new Map<string, string | null>();

/**
 * Remembers the picture of an event card that was clicked. The event page shows it while its own
 * data loads, so the growing picture has somewhere to land. `null` is an event without a picture.
 */
export function rememberEventPicture(id: string, imageUrl: string | null) {
  remembered.delete(id); // re-adding moves it to the end, so the oldest are dropped first
  remembered.set(id, imageUrl);
  if (remembered.size > MAX_REMEMBERED) remembered.delete(remembered.keys().next().value as string);
}

/** The remembered picture of an event, or undefined when its card was never clicked (the page was opened directly) */
export function rememberedEventPicture(id: string): string | null | undefined {
  return remembered.get(id);
}

/**
 * The transition type of opening an event from its card, and of going back to the card. Only these
 * page changes fly the picture and fade the pages (SharedPicture, PageSwap); others change at once.
 */
export const PICTURE_FLIGHT = "event-picture";

/** Where a picture took off, so the same event's picture on the next page can fly from there */
export interface PictureTakeoff {
  eventId: string;
  // Its frame on the screen when it took off
  rect: { left: number; top: number; width: number; height: number };
  // How much the picture was zoomed inside its frame: a hovered card's picture is zoomed 3%
  zoom: number;
  // The opacity of each shade over the picture (data-shade="card" or "hero")
  shades: Record<string, number>;
  // performance.now() at takeoff
  at: number;
}

// A takeoff the next page didn't use within this time is stale (the navigation never happened)
const TAKEOFF_MS = 2000;
let lastTakeoff: PictureTakeoff | null = null;

export function recordTakeoff(takeoff: PictureTakeoff) {
  lastTakeoff = takeoff;
}

/** The takeoff of this event's picture, if it took off in the last 2 seconds and hasn't landed */
export function pendingTakeoff(eventId: string, now: number): PictureTakeoff | null {
  if (!lastTakeoff || lastTakeoff.eventId !== eventId || now - lastTakeoff.at > TAKEOFF_MS) return null;
  return lastTakeoff;
}

/** The picture has landed: the takeoff is used up */
export function clearTakeoff(takeoff: PictureTakeoff) {
  if (lastTakeoff === takeoff) lastTakeoff = null;
}

// How far the events list was scrolled when an event was opened from it
let listPosition: { eventId: string; scrollY: number } | null = null;

/** Notes how far the events list is scrolled as an event opens from it */
export function rememberListPosition(eventId: string, scrollY: number) {
  listPosition = { eventId, scrollY };
}

/** How far the events list was scrolled when this event was opened from it, or null */
export function listPositionOf(eventId: string): number | null {
  return listPosition?.eventId === eventId ? listPosition.scrollY : null;
}

/** Back on the list: the position is used up */
export function forgetListPosition() {
  listPosition = null;
}
