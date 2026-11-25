"use client";

import * as React from "react";

import { animate, finished, flipFrom, MOTION, prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

// What the last sign-in card looked like as it left, so the next step can carry on from it (#371)
interface LastCard {
  node: HTMLElement;
  height: number;
  /** Where the wallet was (the icon, the address pill or the address): the next card picks it up */
  share: DOMRect | null;
  /** A copy of its content, and where it was in the card: the next card fades it out first */
  content: { copy: HTMLElement; top: number; left: number; width: number; textAlign: string } | null;
}

// The last card's content fades out before the next one moves in
const LEAVE_MS = 100;

const AuthStageContext = React.createContext<React.RefObject<LastCard | null> | null>(null);

// Around the sign-in steps. Each card remembers itself as it leaves, so the next one glides from
// its height and the wallet moves across instead of jumping (#371).
export function AuthStage({ children }: { children: React.ReactNode }) {
  const last = React.useRef<LastCard | null>(null);
  return <AuthStageContext.Provider value={last}>{children}</AuthStageContext.Provider>;
}

// The 440px card every sign-in step sits in (Figma "Sign In Page"), with the soft orange glow
// behind its top. The glow is decorative, so screen readers skip it.
// Motion (#371): the first card rises 8 px while its glow switches on like a box office light. The
// next steps take over from it: the last card's content fades out (100 ms), then the card glides to
// its new height (300 ms), its content fades in one block after another (300 ms, 60 ms apart), and
// the element marked data-auth-share (the wallet) moves from where the last card had it (300 ms).
export function AuthCard({ className, children, ...props }: React.ComponentProps<"section">) {
  const stage = React.useContext(AuthStageContext);
  const ref = React.useRef<HTMLElement>(null);

  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const last = stage?.current ?? null;
    if (!last) arrive(node);
    else if (last.node !== node) carryOn(node, last);
    return () => {
      if (!stage) return;
      // Still in the page here: React removes it right after
      const inner = node.querySelector<HTMLElement>(":scope > [data-auth-content]");
      stage.current = {
        node,
        height: node.offsetHeight,
        share: node.querySelector("[data-auth-share]")?.getBoundingClientRect() ?? null,
        content: inner && {
          copy: inner.cloneNode(true) as HTMLElement,
          top: inner.offsetTop,
          left: inner.offsetLeft,
          width: inner.offsetWidth,
          textAlign: getComputedStyle(inner).textAlign,
        },
      };
    };
  }, [stage]);

  return (
    <section
      ref={ref}
      className={cn("relative flex w-full flex-col overflow-hidden rounded-lg bg-card p-6 shadow-[0_25px_50px_-12px_rgb(0_0_0/25%)] sm:p-8", className)}
      {...props}
    >
      <span
        className="pointer-events-none absolute -top-24 left-1/2 size-60 -translate-x-1/2 rounded-full bg-primary/10 blur-[64px]"
        data-auth-glow
        aria-hidden="true"
      />
      <div className="relative flex flex-col" data-auth-content>
        {children}
      </div>
    </section>
  );
}

// The card rises into place while the glow behind it flickers on
function arrive(node: HTMLElement) {
  animate(node, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: MOTION.slow });
  animate(
    node.querySelector("[data-auth-glow]"),
    [{ opacity: 0 }, { opacity: 0.8, offset: 0.25 }, { opacity: 0.2, offset: 0.4 }, { opacity: 1 }],
    { duration: 320, delay: 60, easing: "linear", fill: "backwards" },
  );
}

// The next step: the last card's content fades out where it was, then the card glides from its
// height, the new content fades in and the wallet moves across
function carryOn(node: HTMLElement, last: LastCard) {
  const share = node.querySelector<HTMLElement>("[data-auth-share]");
  if (last.content && !prefersReducedMotion()) {
    fadeOutCopy(node, last.content);
    // The last card's wallet stays in the copy until it has faded, then this one takes over
    if (share && last.share) animate(share, [{ opacity: 0 }, { opacity: 0 }], { duration: LEAVE_MS });
  }
  const height = node.offsetHeight;
  if (height !== last.height) {
    animate(node, [{ height: `${last.height}px` }, { height: `${height}px` }], { duration: MOTION.slow, delay: LEAVE_MS, fill: "backwards" });
  }

  // Everything but the wallet fades in, one block after another. Blocks with an arrival of their own
  // ("Wallet authenticated" is stamped on) keep it.
  let order = 0;
  const fadeIn = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (child === share || getComputedStyle(child).animationName !== "none") continue;
      if (share && child.contains(share)) fadeIn(child);
      else animate(child, [{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.slow, delay: LEAVE_MS + 80 + order++ * 60, fill: "backwards" });
    }
  };
  const content = node.querySelector(":scope > [data-auth-content]");
  if (content) fadeIn(content);

  if (share && last.share) {
    const { dx, dy, scale } = flipFrom(last.share, share.getBoundingClientRect());
    animate(share, [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }, { transform: "none" }], { duration: MOTION.slow, delay: LEAVE_MS, fill: "backwards" });
  }
}

// A lifeless copy of the last card's content, over the new card where it was. Everything in it but
// the wallet fades out; then it goes, and the new card's wallet moves across from there. A torn
// form's halves are left out (their fall doesn't carry over to a copy), so it stays gone.
function fadeOutCopy(node: HTMLElement, { copy, top, left, width, textAlign }: NonNullable<LastCard["content"]>) {
  copy.classList.add("folding-away");
  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;
  copy.removeAttribute("id");
  delete copy.dataset.authContent;
  copy.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
  copy.querySelectorAll(".tear-piece").forEach((piece) => piece.remove());
  Object.assign(copy.style, { position: "absolute", top: `${top}px`, left: `${left}px`, width: `${width}px`, margin: "0", pointerEvents: "none", textAlign });
  node.append(copy);
  const wallet = copy.querySelector("[data-auth-share]");
  const fading: Array<Animation | null> = [];
  const fadeOut = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (child === wallet) continue;
      if (wallet && child.contains(wallet)) fadeOut(child);
      else fading.push(animate(child, [{ opacity: 1 }, { opacity: 0 }], { duration: LEAVE_MS, easing: "ease-in", fill: "forwards" }));
    }
  };
  fadeOut(copy);
  const remove = () => copy.remove();
  Promise.all(fading.map(finished)).then(remove, remove);
}
