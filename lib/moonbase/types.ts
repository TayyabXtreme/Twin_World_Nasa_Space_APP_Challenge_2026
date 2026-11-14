/** Shapes of public/data/moonbase/manifest.json and site-values.json (written by scripts/build-moon-layers.py). */

export type LayerStatus = "ready" | "downloading" | "no_coverage" | "missing";

export interface GridMeta {
  file: string;
  bits: 8 | 16;
  /** value = offset + DN × scale */
  scale: number;
  offset: number;
  nodata: number;
  /** Ice depth only: DN meaning "deeper than 2.87 m" (PRP value -999). */
  none?: number;
  noneMeaning?: string;
}

export interface LayerMeta {
  id: string;
  label: string;
  group: string;
  units: string;
  decimals: number;
  range: [number, number];
  ramp: string[];
  status: LayerStatus;
  statusNote?: string;
  dataset: { name: string; url: string };
  source: string;
  resolution: string;
  what: string;
  grid?: GridMeta;
  image?: string;
  hidden?: boolean;
  coverage?: [number, number];
  /** Where inside the map this layer has values (PRP layers stop at about 80°S). */
  coverageNote?: string;
  /** How special values in the source were read, e.g. the PRP ice-depth sentinels. */
  sentinels?: Record<string, string>;
  stats?: Record<string, number | null>;
  /** 1-sigma uncertainty of each cell, same grid and units (LEND). */
  errorGrid?: GridMeta;
  /** What the two ends of the colour bar mean, e.g. ["drier", "more hydrogen"]. */
  ends?: [string, string];
  /** One-line coverage note for the legend. */
  coverageShort?: string;
}

export interface Manifest {
  generated: string;
  grid: {
    projection: string;
    radiusM: number;
    halfWidthM: number;
    size: number;
    pixelM: number;
    display: { size: number; pixelM: number };
  };
  layers: LayerMeta[];
  regions: { id: string; name: string; lat: number; lon: number; radiusKm: number; approximate: boolean }[];
  features: { id: string; name: string; lat: number; lon: number; radiusKm: number; note: string }[];
}

export type PointValue = number | "none" | null;

export interface SiteValueEntry {
  id: string;
  name: string;
  kind: "site" | "artemis-region-centre" | "feature";
  lat: number;
  lon: number;
  values: Record<string, PointValue>;
  approximate?: boolean;
  radiusKm?: number;
  /** Summary over the approximate region extent; "none" = deeper than 2.87 m everywhere. */
  area?: Record<string, number | "none" | null>;
  /** Means over the published landing sites in the region. */
  landingSites?: Record<string, number | "none">;
}

export interface SiteValues {
  generated: string;
  entries: SiteValueEntry[];
}

/** A decoded value grid, row 0 at the top (+y). */
export interface Grid {
  size: number;
  dn: Uint8Array | Uint16Array;
  meta: GridMeta;
}
