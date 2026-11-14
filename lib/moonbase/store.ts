"use client";

import { create } from "zustand";
import { DEFAULT_WEIGHTS, type FactorId, type Weights } from "./suitability";

/** A point on the base map, in map km and lat/lon. */
export interface MapPoint {
  x: number;
  y: number;
  lat: number;
  lon: number;
}

interface MoonbaseState {
  /** Layer id shown on the map; "suitability" is the computed heat layer. */
  activeLayer: string;
  hover: MapPoint | null;
  pinned: MapPoint | null;
  focusRegion: string | null;
  weights: Weights;
  /** Bumped to ask the map to fly somewhere. */
  flyTo: { x: number; y: number; zoom: number; nonce: number } | null;
  setActiveLayer: (id: string) => void;
  setHover: (p: MapPoint | null) => void;
  setPinned: (p: MapPoint | null) => void;
  setFocusRegion: (id: string | null) => void;
  setWeight: (id: FactorId, w: number) => void;
  resetWeights: () => void;
  fly: (x: number, y: number, zoom: number) => void;
}

export const useMoonbase = create<MoonbaseState>((set) => ({
  activeLayer: "elevation",
  hover: null,
  pinned: null,
  focusRegion: null,
  weights: { ...DEFAULT_WEIGHTS },
  flyTo: null,
  setActiveLayer: (activeLayer) => set({ activeLayer }),
  setHover: (hover) => set({ hover }),
  setPinned: (pinned) => set({ pinned }),
  setFocusRegion: (focusRegion) => set({ focusRegion }),
  setWeight: (id, w) => set((s) => ({ weights: { ...s.weights, [id]: w } })),
  resetWeights: () => set({ weights: { ...DEFAULT_WEIGHTS } }),
  fly: (x, y, zoom) => set((s) => ({ flyTo: { x, y, zoom, nonce: (s.flyTo?.nonce ?? 0) + 1 } })),
}));
