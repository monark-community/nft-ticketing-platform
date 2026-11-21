/// <reference types="react/canary" />
"use client";

import { useRouter } from "next/navigation";
import { addTransitionType, startTransition, useEffect, useLayoutEffect, useRef, useState, ViewTransition, type MouseEvent, type ReactNode } from "react";

import { clearTakeoff, eventPictureName, forgetListPosition, listPositionOf, pendingTakeoff, PICTURE_FLIGHT, recordTakeoff, rememberListPosition } from "@/lib/event-picture";
import { cn } from "@/lib/utils";

// How long the picture flies, and its curve: the Motion Guide's #363 demo
const FLY_MS = 300;
const FLY_EASING = "cubic-bezier(0.3, 0.1, 0.2, 1)";

/**
 * An event's picture, on its card and on its page (#363). Opening the event from its card, the
 * picture flies from the card to the page's hero, and back to the card on the way back
 * (usePictureLink). The real picture moves, like the Motion Guide's demo, so it is cropped and
 * sharp at every size; a view transition keeps it above both pages while they fade (PageSwap).
 * It fills its frame, which must be positioned. The shades over the picture (a fade at the bottom
 * of a card, the hero's vignette) are part of it, so they change while it flies instead of
 * appearing when it lands.
 */
export function SharedPicture({ eventId, role, children }: { eventId: string; role: "card" | "hero"; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => land(ref.current, eventId, role), [eventId, role]);

  return (
    <ViewTransition name={eventPictureName(eventId)} share={{ [PICTURE_FLIGHT]: "event-picture", default: "none" }} enter="none" exit="none" update="none">
      <div ref={ref} data-picture={eventId} className="absolute inset-0 overflow-hidden rounded-[inherit]">
        {children}
        <div
          data-shade="card"
          aria-hidden="true"
          className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-card to-transparent", role !== "card" && "opacity-0")}
        />
        <div
          data-shade="hero"
          aria-hidden="true"
          className={cn("pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/40 to-black/60", role !== "hero" && "opacity-0")}
        />
      </div>
    </ViewTransition>
  );
}

/**
 * Click handler for a link that opens an event from its card (`from: "card"`), or goes back to the
 * events list from the event page (`from: "hero"`): the event's picture flies to the next page.
 * Going back, the list opens where it was scrolled when the event was opened, so the picture lands
 * in view. Other clicks (new tab, modifier keys) and browsers that can't fly it are left to the link.
 */
export function usePictureLink(eventId: string, href: string, from: "card" | "hero") {
  const router = useRouter();
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !canGrow()) return;
    event.preventDefault();
    const tookOff = takeOff(eventId);
    if (from === "card") rememberListPosition(eventId, window.scrollY);
    // The list scrolls itself back when the picture lands (land), instead of opening at the top
    const keepScroll = tookOff && from === "hero" && listPositionOf(eventId) !== null;
    startTransition(() => {
      addTransitionType(PICTURE_FLIGHT);
      router.push(href, keepScroll ? { scroll: false } : undefined);
    });
  };
}

/**
 * A page that fades out, and the next page fades in, while an event's picture flies between its
 * card and its page (#363): out in 140 ms, in over 200 ms from 120 ms (globals.css, "Page
 * changes"). The navbar stays in place. Other page changes don't fade it. It must be the page's
 * outermost element: a view transition only fades a page in or out from there.
 */
export function PageSwap({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <ViewTransition
      enter={{ [PICTURE_FLIGHT]: "page-arrive", default: "none" }}
      exit={{ [PICTURE_FLIGHT]: "page-leave", default: "none" }}
      update="none"
      share="none"
      default="none"
    >
      <div className={className}>{children}</div>
    </ViewTransition>
  );
}

// Notes where the picture is now, its zoom and its shades, for the next page's picture. False when
// it isn't on the page.
function takeOff(eventId: string) {
  const picture = document.querySelector<HTMLElement>(`[data-picture="${CSS.escape(eventId)}"]`);
  if (!picture) return false;
  const { left, top, width, height } = picture.getBoundingClientRect();
  const inner = picture.firstElementChild?.getBoundingClientRect();
  const shades: Record<string, number> = {};
  picture.querySelectorAll<HTMLElement>("[data-shade]").forEach((shade) => {
    shades[shade.dataset.shade ?? ""] = Number(getComputedStyle(shade).opacity);
  });
  recordTakeoff({ eventId, rect: { left, top, width, height }, zoom: inner && width ? inner.width / width : 1, shades, at: performance.now() });
  return true;
}

// On the next page: if this event's picture just took off, it waits where it took off, then flies
// to its own frame when the page change starts. Returns the cleanup, which puts it back in place.
function land(picture: HTMLElement | null, eventId: string, role: "card" | "hero") {
  const takeoff = picture ? pendingTakeoff(eventId, performance.now()) : null;
  if (!picture || !takeoff || !canGrow()) return;

  // Back on the events list: it scrolls to where it was when the event was opened, before the new
  // page is captured, so the card is where the picture left it
  const scrollY = role === "card" ? listPositionOf(eventId) : null;
  if (scrollY !== null) {
    window.scrollTo(0, scrollY);
    forgetListPosition();
  }

  const from = takeoff.rect;
  const box = (rect: typeof from) => ({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  Object.assign(picture.style, { position: "fixed", right: "auto", bottom: "auto", zIndex: "40", ...box(from) });

  const animations: Animation[] = [];
  let over = false;
  const putBack = () => {
    over = true;
    animations.forEach((animation) => animation.cancel());
    Object.assign(picture.style, { position: "", right: "", bottom: "", zIndex: "", left: "", top: "", width: "", height: "" });
  };
  const fly = () => {
    if (over) return;
    // Measured now, once the new page is laid out and scrolled to where it opens
    const to = (picture.parentElement ?? picture).getBoundingClientRect();
    // Held at the end until put back in place, so it never shows where it took off
    const timing: KeyframeAnimationOptions = { duration: FLY_MS, easing: FLY_EASING, fill: "forwards" };
    const flight = picture.animate([box(from), box(to)], timing);
    animations.push(flight);
    const inner = picture.firstElementChild;
    if (inner && Math.abs(takeoff.zoom - 1) > 0.001) animations.push(inner.animate([{ transform: `scale(${takeoff.zoom})` }, { transform: "none" }], timing));
    picture.querySelectorAll<HTMLElement>("[data-shade]").forEach((shade) => {
      const start = takeoff.shades[shade.dataset.shade ?? ""];
      if (start !== undefined) animations.push(shade.animate([{ opacity: start }, { opacity: getComputedStyle(shade).opacity }], timing));
    });
    flight.finished.then(() => {
      clearTakeoff(takeoff);
      putBack();
    }, () => {});
  };

  // The page change starts once both pages are captured. Browsers without
  // document.activeViewTransition start a frame later, about the same time.
  const transition = (document as { activeViewTransition?: { ready: Promise<void> } | null }).activeViewTransition;
  if (transition) transition.ready.then(fly, putBack);
  else requestAnimationFrame(fly);
  return putBack;
}

// How long the picture takes to fly (FLY_MS); the page change ends 20 ms later (globals.css)
const GROW_MS = FLY_MS;

/**
 * True while an event card's picture is still flying into the event page, when it flies at all.
 * The page waits until then to show the event when it loads in the middle: rendering it during
 * the flight makes slower devices skip frames (#363).
 */
export function usePictureGrowing(grows: boolean) {
  const [growing, setGrowing] = useState(() => grows && canGrow());
  useEffect(() => {
    if (!growing) return;
    const timer = window.setTimeout(() => setGrowing(false), GROW_MS + 20);
    return () => window.clearTimeout(timer);
  }, [growing]);
  return growing;
}

// Browsers without view transitions, and reduced motion, change pages at once: nothing flies
function canGrow() {
  return typeof document !== "undefined" && "startViewTransition" in document && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
