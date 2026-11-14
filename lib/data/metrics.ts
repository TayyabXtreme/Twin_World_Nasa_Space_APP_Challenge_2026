import type { World } from "@/lib/worlds";
import raw from "./site-metrics.generated.json";

/**
 * Measured NASA values at each Moon and Mars site, sampled by scripts/build-site-metrics.py.
 * Every value names its dataset, units, resolution and the area it was averaged over.
 */

export type MetricKey =
  | "waterGRS"
  | "ironGRS"
  | "chlorineGRS"
  | "siliconGRS"
  | "potassiumGRS"
  | "thoriumGRS"
  | "epithermalNS"
  | "thermalInertiaDay"
  | "thermalInertiaNight"
  | "rockAbundance"
  | "regolithTempAnomaly"
  | "elevationLOLA"
  | "slopeLOLA"
  | "maxTempPRP"
  | "avgTempPRP"
  | "iceDepthPRP"
  | "iceStableShare"
  | "coldTrapShare"
  | "cprMiniRF";

export type DatasetId =
  | "odyssey-grs"
  | "odyssey-ns"
  | "mgs-tes-ti"
  | "diviner-gdr"
  | "diviner-prp"
  | "lola-polar"
  | "minirf-cpr"
  /* Terrain grids used by lib/data/terrain.generated.json (not sampled by the metrics script). */
  | "lola-svs"
  | "mola";

export interface Metric {
  value: number | null;
  units: string;
  dataset: string;
  datasetId: DatasetId;
  resolution: string;
  /** The area the value is averaged over. */
  sample: string;
  sd?: number;
  /** 10th–90th percentile inside the sampled area. */
  range?: [number, number];
  n?: number;
  note?: string;
  /** The source file is still downloading. */
  pending?: boolean;
  /** Measurement uncertainty reported in the product (GRS). */
  sigma?: number;
  /** Share of TES pixels filled by interpolation. */
  interpolatedShare?: number;
  p90?: number;
  peak?: number;
  /** Mini-RF: share of pixels with CPR above 1. */
  highShare?: number;
  globalRange?: [number, number];
}

export interface DatasetInfo {
  name: string;
  short: string;
  instrument: string;
  pds?: string;
  url: string;
}

interface MetricsFile {
  _meta: { generated: string; note: string; status: Record<string, string> };
  datasets: Record<string, DatasetInfo>;
  sites: Record<
    string,
    { world: World; name: string; lat: number; lon: number; metrics: Partial<Record<MetricKey, Metric>> }
  >;
}

const FILE = raw as unknown as MetricsFile;

export const METRICS_META = FILE._meta;

export const DATASETS: Record<DatasetId, DatasetInfo> = {
  ...(FILE.datasets as Record<Exclude<DatasetId, "lola-svs" | "mola">, DatasetInfo>),
  "lola-svs": {
    name: "LRO LOLA elevation, 16 px/° global grid (NASA SVS CGI Moon Kit)",
    short: "LRO LOLA",
    instrument: "LOLA",
    url: "https://svs.gsfc.nasa.gov/4720",
  },
  mola: {
    name: "MGS MOLA Mission Experiment Gridded Data Records, 16 px/°",
    short: "MGS MOLA",
    instrument: "MOLA",
    pds: "MGS-M-MOLA-5-MEGDR-L3-V1.0",
    url: "https://pds-geosciences.wustl.edu/missions/mgs/megdr.html",
  },
};

/** Label, decimals and a one-line meaning for each metric. */
export const METRIC_INFO: Record<MetricKey, { label: string; digits: number; hint: string }> = {
  waterGRS: {
    label: "Water-equivalent hydrogen",
    digits: 1,
    hint: "Top ~1 m; mostly mineral-bound water at low latitudes",
  },
  ironGRS: { label: "Iron", digits: 1, hint: "Fe, weight per cent" },
  chlorineGRS: { label: "Chlorine", digits: 2, hint: "Cl, a tracer of salts" },
  siliconGRS: { label: "Silicon", digits: 1, hint: "Si, weight per cent" },
  potassiumGRS: { label: "Potassium", digits: 2, hint: "K, weight per cent" },
  thoriumGRS: { label: "Thorium", digits: 2, hint: "Th, parts per million" },
  epithermalNS: { label: "Epithermal neutrons", digits: 2, hint: "Lower = more hydrogen in the ground" },
  thermalInertiaDay: { label: "Thermal inertia (day)", digits: 0, hint: "Low = fine dust, high = rock, crust or ice" },
  thermalInertiaNight: {
    label: "Thermal inertia (night)",
    digits: 0,
    hint: "Low = fine dust, high = rock, crust or ice",
  },
  rockAbundance: { label: "Rock cover", digits: 1, hint: "Area covered by rocks larger than ~1 m" },
  regolithTempAnomaly: {
    label: "Night soil temperature vs average",
    digits: 1,
    hint: "Relative to the lunar mean at the same hour",
  },
  elevationLOLA: { label: "Elevation", digits: 0, hint: "Above the 1737.4 km reference sphere" },
  slopeLOLA: { label: "Local slope", digits: 1, hint: "Mean within 1 km, LOLA 240 m map" },
  maxTempPRP: { label: "Max temperature", digits: 0, hint: "Annual maximum surface temperature" },
  avgTempPRP: { label: "Average temperature", digits: 0, hint: "Annual average, 2 cm below the surface" },
  iceDepthPRP: { label: "Ice stability depth", digits: 2, hint: "Depth where ice would stay frozen (model)" },
  iceStableShare: { label: "Ice-stable ground", digits: 0, hint: "Share with ice stable in the top ~3 m" },
  coldTrapShare: { label: "Cold traps", digits: 0, hint: "Share that never warms above 110 K" },
  cprMiniRF: { label: "Radar CPR", digits: 2, hint: "High = rough ground or ice: ambiguous" },
};

const EMPTY: Partial<Record<MetricKey, Metric>> = {};

export function metricsFor(siteId: string): Partial<Record<MetricKey, Metric>> {
  return FILE.sites[siteId]?.metrics ?? EMPTY;
}

/** A metric with a real value, or undefined when it is missing, masked or still downloading. */
export function measured(siteId: string, key: MetricKey): (Metric & { value: number }) | undefined {
  const m = FILE.sites[siteId]?.metrics[key];
  return m && m.value !== null ? (m as Metric & { value: number }) : undefined;
}

/** The note that explains a missing value ("outside coverage", "masked", "still downloading"). */
export function gapNote(siteId: string, key: MetricKey): string | undefined {
  const m = FILE.sites[siteId]?.metrics[key];
  return m && m.value === null ? m.note : undefined;
}

const UNIT_SPACE = new Set(["°", "%"]);

/** "4.1°", "3.53 wt %", "120 tiu", "−2,776 m": the minus sign is typographic. */
export function formatMetric(key: MetricKey, m: Metric, digits = METRIC_INFO[key].digits): string {
  if (m.value === null) return "—";
  if (key === "iceDepthPRP" && m.value === 0) return "at surface";
  const n = m.value
    .toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    .replace("-", "−");
  const unit = m.units === "ratio" ? "" : m.units;
  const sign = key === "regolithTempAnomaly" && m.value > 0 ? "+" : "";
  return `${sign}${n}${unit ? (UNIT_SPACE.has(unit) ? unit : ` ${unit}`) : ""}`;
}

/** Spread as shown to people: "± 1.4" from the area, or "± 0.36" measurement sigma for GRS bins. */
export function formatSpread(key: MetricKey, m: Metric): string | undefined {
  const s = m.sigma ?? m.sd;
  if (s === undefined || m.value === null) return undefined;
  const digits = METRIC_INFO[key].digits;
  if (Math.abs(s) < 0.5 * 10 ** -digits) return undefined;
  return `±${s.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Which metrics each world shows in the drawer and Compare, grouped by what they answer. */
export const METRIC_GROUPS: Record<Exclude<World, "earth">, { title: string; keys: MetricKey[] }[]> = {
  moon: [
    {
      title: "Ice and cold",
      keys: ["iceStableShare", "coldTrapShare", "iceDepthPRP", "maxTempPRP", "avgTempPRP", "regolithTempAnomaly"],
    },
    { title: "Ground", keys: ["slopeLOLA", "elevationLOLA", "rockAbundance", "cprMiniRF"] },
  ],
  mars: [
    { title: "Water", keys: ["epithermalNS", "waterGRS"] },
    { title: "Ground", keys: ["thermalInertiaNight", "thermalInertiaDay"] },
    { title: "Chemistry", keys: ["ironGRS", "siliconGRS", "chlorineGRS", "potassiumGRS", "thoriumGRS"] },
  ],
};
