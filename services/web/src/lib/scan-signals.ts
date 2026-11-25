// What the scanner sounds and feels like (#373): door staff know the result without looking.
// A short rising double beep for a valid ticket and a confirmed check-in, a low double buzz for
// "Do not admit". Android phones also vibrate; iPhones can't vibrate from a website, so they only beep.
// The sound is made with Web Audio (no files), can be turned off, and is remembered on the device.

import type { ScanView } from "@/lib/scanner";

export type ScanSignal = "ok" | "bad";

/** The signal for a result as it appears: a valid ticket or a confirmed check-in is ok, "Do not admit" is bad */
export function signalFor(view: ScanView): ScanSignal | null {
  if (view === "valid" || view === "checkedIn") return "ok";
  if (view === "rejected") return "bad";
  return null;
}

export interface Tone {
  hz: number;
  atMs: number;
  ms: number;
  wave: OscillatorType;
  volume: number;
}

export const TONES: Record<ScanSignal, Tone[]> = {
  ok: [
    { hz: 1320, atMs: 0, ms: 70, wave: "sine", volume: 0.12 },
    { hz: 1760, atMs: 100, ms: 90, wave: "sine", volume: 0.12 },
  ],
  bad: [
    { hz: 170, atMs: 0, ms: 220, wave: "square", volume: 0.06 },
    { hz: 150, atMs: 300, ms: 220, wave: "square", volume: 0.06 },
  ],
};

/** navigator.vibrate patterns: one short pulse, or two long ones */
export const VIBRATION: Record<ScanSignal, number | number[]> = {
  ok: 40,
  bad: [120, 70, 120],
};

const SOUND_KEY = "scanner:sound";

/** Sound is on unless it was turned off on this device */
export function soundOnFrom(stored: string | null): boolean {
  return stored !== "off";
}

export function readSoundOn(): boolean {
  try {
    return soundOnFrom(window.localStorage.getItem(SOUND_KEY));
  } catch {
    return true; // storage blocked (private mode): sound stays on
  }
}

export function rememberSoundOn(on: boolean) {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Storage can be blocked; the choice still holds for this visit
  }
}

let audio: AudioContext | null = null;

/** Browsers only let a page make sound after a tap or key press: call this from one */
export function unlockSound() {
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    audio ??= new Context();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    // No Web Audio here: the scanner just stays silent
  }
}

/** Beeps (if sound is on and the page was tapped) and vibrates (where the phone can) */
export function playSignal(signal: ScanSignal, { vibrate = true }: { vibrate?: boolean } = {}) {
  if (vibrate) {
    try {
      navigator.vibrate?.(VIBRATION[signal]);
    } catch {
      // Not supported (iPhone, desktop)
    }
  }
  if (!audio || !readSoundOn()) return;
  const context = audio;
  const play = () => {
    const start = context.currentTime;
    for (const tone of TONES[signal]) {
      const at = start + tone.atMs / 1000;
      const end = at + tone.ms / 1000;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = tone.wave;
      oscillator.frequency.value = tone.hz;
      // A quick fade in and out, so the beeps don't click
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(tone.volume, at + 0.008);
      gain.gain.setValueAtTime(tone.volume, end - 0.02);
      gain.gain.linearRampToValueAtTime(0, end);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(end + 0.02);
    }
  };
  if (context.state === "running") play();
  // During a tap (the speaker button), sound may still be waking up: play once it's ready
  else if (navigator.userActivation?.isActive) context.resume().then(play, () => {});
}
