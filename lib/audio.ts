"use client";

/**
 * All sound in one place: a looping space ambience plus short interface cues.
 * Files are the optimized copies in /public/audio (see scripts/build-assets.mjs).
 */

const AMBIENT_VOLUME = 0.32;
let ambient: HTMLAudioElement | null = null;
let fade = 0;

function fadeTo(el: HTMLAudioElement, target: number, ms: number, done?: () => void) {
  window.clearInterval(fade);
  const start = el.volume;
  const t0 = performance.now();
  fade = window.setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    el.volume = start + (target - start) * k;
    if (k >= 1) {
      window.clearInterval(fade);
      done?.();
    }
  }, 30);
}

/** Start or stop the ambience with a short fade. Must first be called from a user gesture (autoplay rules). */
export function setAmbient(on: boolean) {
  if (typeof window === "undefined") return;
  if (on) {
    ambient ??= Object.assign(new Audio("/audio/ambient.mp3"), { loop: true, volume: 0 });
    void ambient.play().then(
      () => fadeTo(ambient!, AMBIENT_VOLUME, 900),
      () => {
        /* blocked until the visitor interacts; SoundSync retries on the first pointer or key press */
      },
    );
  } else if (ambient) {
    const el = ambient;
    fadeTo(el, 0, 400, () => el.pause());
  }
}

export const isAmbientPlaying = () => Boolean(ambient && !ambient.paused);

export type Cue = "warp" | "select" | "toggle" | "open" | "close" | "confirm";
const CUES: Record<Cue, { src: string; volume: number }> = {
  warp: { src: "/audio/warp.mp3", volume: 0.35 },
  select: { src: "/audio/ui/select_002.ogg", volume: 0.5 },
  toggle: { src: "/audio/ui/toggle_001.ogg", volume: 0.5 },
  open: { src: "/audio/ui/open_001.ogg", volume: 0.45 },
  close: { src: "/audio/ui/close_001.ogg", volume: 0.45 },
  confirm: { src: "/audio/ui/confirmation_001.ogg", volume: 0.5 },
};

/** Play a short interface cue (callers check that sound is on). */
export function playCue(cue: Cue) {
  if (typeof window === "undefined") return;
  const { src, volume } = CUES[cue];
  const a = new Audio(src);
  a.volume = volume;
  void a.play().catch(() => {});
}
