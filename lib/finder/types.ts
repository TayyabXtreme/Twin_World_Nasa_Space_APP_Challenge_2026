import type { World } from "@/lib/worlds";

/** Shapes of the Finder data files (scripts/build-finder.py, build-finder-params.py) in public/data/finder. */

/** The thirteen site-vs-target parameters the Finder ranks on, in the order the sliders and the breakdown use. */
export type DimId =
  | "tmean"
  | "trange"
  | "radiation"
  | "slope"
  | "sand"
  | "pressure"
  | "daylight"
  | "precip"
  | "rh"
  | "aod"
  | "isolation"
  | "elev"
  | "water";
export const DIM_IDS: DimId[] = [
  "tmean",
  "trange",
  "radiation",
  "slope",
  "sand",
  "pressure",
  "daylight",
  "precip",
  "rh",
  "aod",
  "isolation",
  "elev",
  "water",
];

/** Earth channels in earth-params.bin, in file order. */
export type ChannelKey = "tmean" | "trange" | "precip" | "rh" | "ps" | "aod" | "sand" | "slope" | "isolation" | "elev";
export const CHANNEL_KEYS: ChannelKey[] = ["tmean", "trange", "precip", "rh", "ps", "aod", "sand", "slope", "isolation", "elev"];

/** Display-only channels in earth-detail.bin (earth-grid.json describes them). */
export type DetailKey = "tday" | "tnight" | "tcold" | "seasonal" | "albedo" | "elev" | "flags";

export interface GridChannel {
  key: string;
  units: string;
  label: string;
  source: string;
  log: boolean;
  file: "core" | "detail";
  offset: number;
  scale: number;
  byteOffset: number;
  pct?: number[];
  coverage?: number;
}

/** earth-grid.json: the 0.25° grid, the MODIS channels and the display-only detail channels. */
export interface GridHeader {
  version: number;
  grid: { res: number; nx: number; ny: number; cells: number; origin: string };
  maskBytes: number;
  channels: GridChannel[];
  notes: string[];
  sources: { id: string; title: string; url: string }[];
}

export interface ParamChannel {
  key: ChannelKey;
  units: string;
  label: string;
  source: string;
  /** Stored as log10(value + 1). */
  log: boolean;
  offset: number;
  scale: number;
  byteOffset: number;
  /** Area-weighted percentile of each quantised level over Earth's land. */
  pct: number[];
  coverage: number;
}

/** earth-params.json: the land mask and the Earth side of every parameter, one byte per land cell. */
export interface ParamsHeader {
  version: number;
  cells: number;
  maskBytes: number;
  channels: ParamChannel[];
  notes: string[];
  sources: { id: string; title: string; url: string }[];
}

/**
 * What a target asks of Earth on one parameter (lib/finder/params.generated.json):
 *  near    closeness to the target value v (`min`: v is a lower bound, anything above it matches)
 *  toward  v lies far beyond anything on Earth, so land is ranked by how far it goes toward it (dir +1 = higher)
 *  rank    v's percentile within its own world (`pct`) against the Earth cell's percentile
 *  match   v = 1 if the target has water-formed minerals or ice, 0 if not; compared with catalogued Earth sites
 */
export interface ParamSpec {
  v: number | null;
  mode: "near" | "toward" | "rank" | "match";
  dir?: 1 | -1;
  min?: boolean;
  unreachable?: boolean;
  pct?: number;
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
  /** Merged in from params.generated.json when the targets load (lib/finder/params.ts withParams). */
  params: Partial<Record<DimId, ParamSpec>>;
  facts: Fact[];
  temps: string;
  refs?: string[];
  measured?: boolean;
}

export interface TargetsDoc {
  version: number;
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
  /** Per-parameter similarity 0..1; absent when the target has no value for it. */
  sims: Partial<Record<DimId, number>>;
  /** Raw quantised channel values (0 = no data), for display. */
  q: Record<ChannelKey, number>;
}

export interface RefPoint {
  id: string;
  lat: number;
  lon: number;
  radiusKm: number;
  /** Water-formed minerals or ice recorded at the site (lib/data/sites.ts geology); undefined = not catalogued. */
  water?: boolean;
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
