import type { World } from "@/lib/worlds";

/** Shapes of the files written by scripts/build-finder.py into public/data/finder. */

export type DimId = "cold" | "swing" | "bare" | "inertia" | "ice" | "sun" | "relief";
export const DIM_IDS: DimId[] = ["cold", "swing", "bare", "inertia", "ice", "sun", "relief"];

/** Scoring channels in earth-core.bin, in file order. */
export type CoreKey = "tmean" | "swing" | "ndvi" | "ati" | "freeze" | "relief";
export type DetailKey = "tday" | "tnight" | "tcold" | "seasonal" | "albedo" | "elev" | "flags";

export interface GridChannel {
  key: CoreKey | DetailKey;
  units: string;
  label: string;
  source: string;
  log: boolean;
  file: "core" | "detail";
  offset: number;
  scale: number;
  byteOffset: number;
  /** Area-weighted mid-rank percentile of each quantised level (core channels only). */
  pct?: number[];
  pctRef?: string;
  coverage?: number;
}

export interface GridHeader {
  version: number;
  grid: { res: number; nx: number; ny: number; cells: number; origin: string };
  maskBytes: number;
  channels: GridChannel[];
  notes: string[];
  sources: { id: string; title: string; url: string }[];
}

export interface DimValue {
  v: number | null;
  units: string;
  source: string;
}

export interface DimSpec {
  mode: "role" | "absolute";
  /** Role: percentile of the target within its own world (0 = coldest / lowest). */
  worldPct?: number;
  /** Role: the Earth percentile with the same rank (snapped to Earth's quantised levels). */
  earthPct?: number;
  /** Absolute: target value in the Earth channel's units (NDVI, degrees of Sun, metres of relief). */
  earthTarget?: number;
  note: string;
  value?: DimValue;
}

export interface DimMeta {
  id: DimId;
  label: string;
  mode: "role" | "absolute";
  earth: CoreKey | "lat";
  blurb: string;
}

export interface Fact {
  label: string;
  v: number | null;
  units: string;
  source: string;
}

export interface Target {
  id: string;
  world: Exclude<World, "earth">;
  name: string;
  lat: number;
  lon: number;
  dims: Partial<Record<DimId, DimSpec>>;
  facts: Fact[];
  temps: string;
  refs?: string[];
  measured?: boolean;
}

export interface TargetsDoc {
  version: number;
  dimensions: DimMeta[];
  obliquity: Record<World, number>;
  targets: Target[];
  sources: { id: string; title: string; url: string }[];
  built: { diviner_prp: boolean; minirf: boolean };
}

export type Weights = Record<DimId, number>;

/** One scored Earth cell, as returned by the worker. */
export interface CellResult {
  cell: number;
  lat: number;
  lon: number;
  /** 0..1 */
  score: number;
  /** Share of Earth's land area (%) that scores higher than this cell. */
  topPct: number;
  /** Per-dimension similarity 0..1; null when the target has no such dimension. */
  sims: Partial<Record<DimId, number>>;
  /** Raw quantised core values (0 = no data), for display. */
  q: Record<CoreKey, number>;
  /** Earth percentile (0..1) of each role channel, for display. */
  pct: Partial<Record<CoreKey, number>>;
}

export interface RefPoint {
  id: string;
  lat: number;
  lon: number;
  radiusKm: number;
}

export interface ScoreResult {
  id: number;
  top: CellResult[];
  refs: Record<string, CellResult | null>;
  /** Heat image (1440 x 720 PNG) as a blob, or raw RGBA when OffscreenCanvas is missing. */
  heat: Blob | ImageData;
  /** Score range drawn by the heat ramp. */
  range: [number, number];
  ms: number;
}
