"use client";

import { useEffect, useRef } from "react";

import { DOT_WAVE_SECONDS, dotGlow, dotWave, REDUCED_MOTION_QUERY } from "@/lib/motion";

const GAP = 22; // px between dots; the still dots are the dot-field background in globals.css
const SLEEP_AFTER_MS = 1500;
const POINTER_QUERY = "(hover: hover) and (pointer: fine)";
const AWAY = -1e4;

// Tags that only lay things out. Anything else under the pointer (text, pictures, controls) covers the background.
const LAYOUT_TAGS = new Set(["HTML", "BODY", "MAIN", "DIV", "SECTION", "ARTICLE", "ASIDE", "HEADER", "FOOTER", "NAV", "FORM", "UL", "OL", "LI"]);

const isClear = (color: string) => color === "transparent" || /^rgba?\(.*[,/]\s*0\)$/.test(color);

// True when the pointer is over empty page background: a layout element with no text of its own,
// no fill and no border, all the way up to <body>.
function isEmptyBackground(target: EventTarget | null, known: WeakMap<Element, boolean>): boolean {
  if (!(target instanceof Element)) return false;
  const cached = known.get(target);
  if (cached !== undefined) return cached;

  let empty = LAYOUT_TAGS.has(target.tagName) && ![...target.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue?.trim());
  for (let el: Element | null = target; empty && el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const style = getComputedStyle(el);
    const bordered = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].some((width) => width !== "0px");
    if (!isClear(style.backgroundColor) || bordered) empty = false;
  }
  known.set(target, empty);
  return empty;
}

interface Wave {
  i: number;
  j: number;
  at: number;
}

// The live page background (#362): a dot grid behind every page. Over empty background, the dots
// around the pointer warm up in a diamond; a click sends a diamond-shaped wave through the grid.
// One canvas, no library. It only draws the lit dots, sleeps 1.5 s after the pointer stops and
// while the tab is hidden, and does nothing with reduced motion or on touch screens.
export function DotField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia(REDUCED_MOTION_QUERY);
    const finePointer = window.matchMedia(POINTER_QUERY);
    const live = () => finePointer.matches && !reduced.matches;
    const known = new WeakMap<Element, boolean>();

    let width = 0;
    let height = 0;
    let px = AWAY;
    let py = AWAY;
    let lastMove = 0;
    let frame = 0;
    let waves: Wave[] = [];

    // Dot (i, j) is centred at (GAP / 2 + i * GAP, GAP / 2 + j * GAP), like the CSS background
    const toCell = (pixels: number) => (pixels - GAP / 2) / GAP;

    function draw(now: number) {
      ctx!.clearRect(0, 0, width, height);
      waves = waves.filter((wave) => now - wave.at < DOT_WAVE_SECONDS * 1000);
      const ci = toCell(px);
      const cj = toCell(py);
      const cols = Math.ceil(width / GAP);
      const rows = Math.ceil(height / GAP);
      // Without a wave, only the dots near the pointer can be lit
      const all = waves.length > 0;
      const i0 = all ? 0 : Math.max(0, Math.floor(ci - 5));
      const i1 = all ? cols : Math.min(cols, Math.ceil(ci + 5));
      const j0 = all ? 0 : Math.max(0, Math.floor(cj - 5));
      const j1 = all ? rows : Math.min(rows, Math.ceil(cj + 5));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          let energy = px > AWAY / 2 ? dotGlow(i - ci, j - cj) : 0;
          for (const wave of waves) energy = Math.max(energy, dotWave(Math.abs(i - wave.i) + Math.abs(j - wave.j), (now - wave.at) / 1000));
          if (energy <= 0.02) continue;
          ctx!.fillStyle = `rgba(249, 115, 22, ${0.12 + 0.88 * energy})`;
          ctx!.beginPath();
          ctx!.arc(GAP / 2 + i * GAP, GAP / 2 + j * GAP, 1 + 1.7 * energy, 0, Math.PI * 2);
          ctx!.fill();
        }
      }
    }

    function loop(now: number) {
      frame = 0;
      draw(now);
      if ((now - lastMove < SLEEP_AFTER_MS || waves.length > 0) && !document.hidden) frame = requestAnimationFrame(loop);
    }
    function wake() {
      lastMove = performance.now();
      if (!frame && !document.hidden) frame = requestAnimationFrame(loop);
    }

    function resize() {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.round(width * ratio);
      canvas!.height = Math.round(height * ratio);
      ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw(performance.now());
    }

    function onMove(event: PointerEvent) {
      if (!live() || event.pointerType === "touch") return;
      const wasOver = px > AWAY / 2;
      if (isEmptyBackground(event.target, known)) {
        px = event.clientX;
        py = event.clientY;
      } else {
        if (!wasOver) return;
        px = py = AWAY;
      }
      wake();
    }
    function onLeave() {
      if (px <= AWAY / 2) return;
      px = py = AWAY;
      wake();
    }
    function onDown(event: PointerEvent) {
      if (!live() || event.pointerType === "touch" || event.button !== 0 || !isEmptyBackground(event.target, known)) return;
      waves.push({ i: Math.round(toCell(event.clientX)), j: Math.round(toCell(event.clientY)), at: performance.now() });
      wake();
    }
    function onVisibility() {
      if (document.hidden && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    }
    function onSetting() {
      // Reduced motion or a touch screen: clear whatever was lit
      if (live()) return;
      px = py = AWAY;
      waves = [];
      draw(performance.now());
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", onSetting);
    finePointer.addEventListener("change", onSetting);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onSetting);
      finePointer.removeEventListener("change", onSetting);
    };
  }, []);

  return <canvas ref={canvasRef} className="dot-field pointer-events-none fixed inset-0 -z-10 size-full" aria-hidden="true" />;
}
