"use client";

import { create } from "zustand";
import type { GlobeLayerId } from "./data/globe";
import type { LatLon } from "./geo";
import type { World } from "./worlds";

export type ViewMode = "3d" | "2d";
export type QualityTier = "low" | "mid" | "high";

export interface HoverInfo extends LatLon {
  label?: string;
  sublabel?: string;
  elevationM?: number;
}

interface ExplorerState {
  world: World;
  view: ViewMode;
  quality: QualityTier;
  selectedSiteId: string | null;
  /** A pin that is not a Site: field campaign, launch site, DSN complex or the ISS (lib/data/globePlaces.ts). */
  selectedPlaceId: string | null;
  /** An arbitrary Earth point the user clicked on the map or globe (opens the point card). */
  dataPoint: LatLon | null;
  /** Cinematic tour: index of the current stop, or null when no tour is running. */
  tourStep: number | null;
  activeLayerId: string | null;
  hover: HoverInfo | null;
  soundOn: boolean;
  /** Focus mode: hide the floating panels so the map or globe is unobstructed. */
  chromeHidden: boolean;
  /** Pin layers switched off in the layer toggles (Earth) or the exploration-history panel (Moon, Mars). */
  hiddenLayers: GlobeLayerId[];
  /** Exploration-history timeline: decimal year shown on the Moon or Mars globe, or null for every landing so far. */
  timelineT: number | null;
  timelinePlaying: boolean;
  setWorld: (world: World) => void;
  setView: (view: ViewMode) => void;
  setQuality: (quality: QualityTier) => void;
  selectSite: (id: string | null) => void;
  selectPlace: (id: string | null) => void;
  setDataPoint: (point: LatLon | null) => void;
  setTourStep: (step: number | null) => void;
  showLayers: (ids: GlobeLayerId[]) => void;
  setActiveLayer: (id: string | null) => void;
  setHover: (hover: HoverInfo | null) => void;
  toggleSound: () => void;
  setChromeHidden: (hidden: boolean) => void;
  toggleLayer: (id: GlobeLayerId) => void;
  setTimeline: (t: number | null, playing?: boolean) => void;
}

export const useExplorer = create<ExplorerState>()((set) => ({
  world: "earth",
  view: "3d",
  quality: "mid",
  selectedSiteId: null,
  selectedPlaceId: null,
  dataPoint: null,
  tourStep: null,
  activeLayerId: null,
  hover: null,
  soundOn: false,
  chromeHidden: false,
  // Off on first load: launch sites add many pins, DSN arcs animate continuously.
  hiddenLayers: ["launch", "dsn"],
  timelineT: null,
  timelinePlaying: false,
  setWorld: (world) =>
    set({ world, selectedSiteId: null, selectedPlaceId: null, dataPoint: null, tourStep: null, activeLayerId: null, hover: null, timelineT: null, timelinePlaying: false }),
  setView: (view) => set({ view }),
  setQuality: (quality) => set({ quality }),
  selectSite: (selectedSiteId) => set({ selectedSiteId, selectedPlaceId: null, dataPoint: null }),
  selectPlace: (selectedPlaceId) => set({ selectedPlaceId, selectedSiteId: null, dataPoint: null }),
  setDataPoint: (dataPoint) => set({ dataPoint, selectedSiteId: null, selectedPlaceId: null }),
  setTourStep: (tourStep) => set({ tourStep }),
  showLayers: (ids) => set((s) => ({ hiddenLayers: s.hiddenLayers.filter((l) => !ids.includes(l)) })),
  setActiveLayer: (activeLayerId) => set({ activeLayerId }),
  setHover: (hover) => set({ hover }),
  toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),
  setChromeHidden: (chromeHidden) => set({ chromeHidden }),
  toggleLayer: (id) =>
    set((s) => ({ hiddenLayers: s.hiddenLayers.includes(id) ? s.hiddenLayers.filter((l) => l !== id) : [...s.hiddenLayers, id] })),
  setTimeline: (timelineT, playing = false) => set({ timelineT, timelinePlaying: playing }),
}));
