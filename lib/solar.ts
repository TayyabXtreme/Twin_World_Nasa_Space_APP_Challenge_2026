"use client";

import { create } from "zustand";
import { daysSinceJ2000 } from "./orbits";

export type SolarWorld = "earth" | "moon" | "mars";

/**
 * The simulation clock lives outside React: the 3D scene advances it every frame and the HUD
 * reads it on a slow timer, so time passing never re-renders components.
 */
export const solarClock = {
  days: daysSinceJ2000(new Date(Date.UTC(2026, 10, 12))),
  today: daysSinceJ2000(new Date(Date.UTC(2026, 10, 12))),
};

/**
 * Page elements that follow the 3D bodies (planet labels and the light-delay tag). They live in the normal
 * React tree, not inside the canvas; a projector in the scene moves them every frame.
 */
export const solarAnchors: Partial<Record<SolarWorld | "light", HTMLElement | null>> = {};

interface SolarState {
  /** Advance one Earth year every 12 seconds. */
  running: boolean;
  /** World under the pointer (planet or its label). */
  hovered: SolarWorld | null;
  /** World the camera is flying into; navigation follows when the flight lands. */
  flyTo: SolarWorld | null;
  /** All scene textures are loaded and the first frame is drawn. */
  ready: boolean;
  /** Texture loading progress, 0..1. */
  progress: number;
  setRunning: (running: boolean) => void;
  setHovered: (hovered: SolarWorld | null) => void;
  setFlyTo: (world: SolarWorld | null) => void;
  setReady: (ready: boolean) => void;
  setProgress: (progress: number) => void;
}

export const useSolar = create<SolarState>()((set) => ({
  running: false,
  hovered: null,
  flyTo: null,
  ready: false,
  progress: 0,
  setRunning: (running) => set({ running }),
  setHovered: (hovered) => set({ hovered }),
  setFlyTo: (flyTo) => set({ flyTo, running: false }),
  setReady: (ready) => set({ ready, progress: ready ? 1 : 0 }),
  setProgress: (progress) => set({ progress }),
}));
